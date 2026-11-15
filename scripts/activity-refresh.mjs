#!/usr/bin/env node
/**
 * GitHub activity refresh — the build-time generator for
 * `github-activity/snapshot.json`.
 *
 * The browser never talks to GitHub: this script runs in CI (see
 * `.github/workflows/activity-refresh.yml`), fetches the allowlisted public
 * repositories over the REST API with a server-side `GITHUB_TOKEN`, and writes
 * a checked-in snapshot the static site imports at build time.
 *
 * Design constraints, and how they are met:
 *
 *   - **Allowlist only.** The set of repositories is read from the snapshot's
 *     own `allowed_repositories`; the script can never fetch a repository that
 *     is not already on that list. Every URL is canonicalised to the public
 *     owner (`cristian-cardona-dev`) so a stale owner never leaks.
 *   - **Schema preserved.** The snapshot shape (`schema_version`, `snapshot_id`,
 *     `captured_at`, `status`, `source`, `allowed_repositories`,
 *     `repositories`) is preserved exactly. The validator forbids a
 *     `generated_at` key, so the generation timestamp lives in the schema's own
 *     `captured_at` field; the workflow compares content with `captured_at`
 *     removed so a timestamp-only run is a no-op.
 *   - **Graceful degradation.** A repository that fails keeps its previous
 *     record (marked with an `error` string) instead of crashing the run. Only
 *     when *every* repository fails does the process exit non-zero.
 *   - **Deterministic.** Repositories follow the allowlist order, commits keep
 *     the API's newest-first order, and the file is written as two-space JSON
 *     with a trailing newline — exactly what `validate.mjs` expects.
 *
 * Zero dependencies: only Node built-ins.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get as httpsGet } from 'node:https';

const ROOT = resolve(import.meta.dirname, '..');
const SNAPSHOT_FILE = resolve(ROOT, 'github-activity', 'snapshot.json');
const CANONICAL_OWNER = 'cristian-cardona-dev';
const API_HOST = 'api.github.com';
const COMMITS_PER_REPO = 3;
const REQUEST_TIMEOUT_MS = 20_000;
const ERROR_MARKER = 'last_refresh_failed';
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;
// --dry-run: fetch and validate everything, print the summary, write nothing.
const DRY_RUN = process.argv.includes('--dry-run');

const token = process.env.GITHUB_TOKEN || '';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Retry transient failures (network, 5xx, 429, 403 rate limit) with backoff. */
async function withRetry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /timed out|ECONN|ETIMEDOUT|EAI_AGAIN|GitHub API (5\d\d|429|403)/.test(message);
      if (!transient || attempt === MAX_ATTEMPTS) break;
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
      console.warn(`activity-refresh: retrying ${label} (attempt ${attempt + 1}/${MAX_ATTEMPTS}) after: ${message}`);
    }
  }
  throw lastError;
}

/** Write via a temp file and rename, so a crash never leaves a half-written snapshot. */
function writeAtomic(file, contents) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, file);
}

/** Read the current snapshot (the schema source of truth for this run). */
function readSnapshot() {
  return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
}

/** Drop any trailing slash so URL comparison and slicing are stable. */
function cleanUrl(url) {
  return String(url).replace(/\/+$/, '');
}

/** `https://github.com/owner/repo` → `owner/repo`. */
function slugFromUrl(url) {
  return cleanUrl(url).replace(/^https:\/\/github\.com\//, '');
}

/** Force a repository URL onto the canonical public owner, keeping the repo name. */
function canonicalUrl(url) {
  const slug = slugFromUrl(url);
  const repo = slug.split('/').slice(1).join('/');
  return `https://github.com/${CANONICAL_OWNER}/${repo}`;
}

/** Minimal `https.get` wrapper that always resolves with status, headers and body. */
function request(path) {
  return new Promise((resolvePromise, reject) => {
    const req = httpsGet(
      {
        hostname: API_HOST,
        path,
        method: 'GET',
        headers: {
          'User-Agent': 'professional-evolution-portfolio-activity-refresh',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('request timed out')));
  });
}

/**
 * GET a JSON endpoint. A 404 is returned as data (used to tolerate a missing
 * release); any other non-2xx status throws so the caller can fall back to the
 * previous record.
 */
async function requestJson(path) {
  const res = await request(path);
  if (res.status === 404) return { status: 404, data: null, headers: res.headers };
  if (res.status < 200 || res.status >= 300) throw new Error(`GitHub API ${res.status} for ${path}`);
  return { status: res.status, data: JSON.parse(res.body || 'null'), headers: res.headers };
}

/** GitHub timestamps are ISO-8601; the schema wants whole-second UTC. */
function toIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid date: ${value}`);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** First line of a message, trimmed and capped to the schema's 200-char limit. */
function firstLine(text, fallback) {
  const line = String(text ?? '').split('\n')[0].trim();
  if (line.length >= 2) return line.length > 200 ? line.slice(0, 200) : line;
  return fallback;
}

/** Latest commits, newest first, shaped as snapshot objects. */
async function fetchCommits(owner, repo) {
  const { data } = await requestJson(`/repos/${owner}/${repo}/commits?per_page=${COMMITS_PER_REPO}`);
  if (!Array.isArray(data)) throw new Error('unexpected commits payload');
  return data.map((entry) => {
    const sha = String(entry.sha);
    const date = entry.commit?.author?.date || entry.commit?.committer?.date;
    return {
      id: sha,
      url: entry.html_url,
      captured_at: toIso(date),
      title: firstLine(entry.commit?.message, sha.slice(0, 7)),
    };
  });
}

/**
 * Open pull-request count. Uses `per_page=1` plus `X-Total-Count`, falling back
 * to the `Link` header's last page and, finally, the returned page length.
 */
async function fetchOpenPullRequestCount(owner, repo) {
  const { data, headers } = await requestJson(`/repos/${owner}/${repo}/pulls?state=open&per_page=1`);
  const total = headers['x-total-count'];
  if (total !== undefined) {
    const parsed = Number.parseInt(Array.isArray(total) ? total[0] : total, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const link = headers.link;
  if (typeof link === 'string') {
    const last = link.split(',').find((part) => /rel="last"/.test(part));
    const page = last?.match(/[?&]page=(\d+)/);
    if (page) return Number.parseInt(page[1], 10);
  }
  return Array.isArray(data) ? data.length : 0;
}

/** Latest published release, or null when the repository has none. */
async function fetchLatestRelease(owner, repo) {
  const res = await requestJson(`/repos/${owner}/${repo}/releases/latest`);
  if (res.status === 404 || !res.data) return null;
  const release = res.data;
  return {
    id: String(release.id),
    url: release.html_url,
    captured_at: toIso(release.published_at || release.created_at),
    title: firstLine(release.name || release.tag_name, release.tag_name || 'release'),
  };
}

async function main() {
  const snapshot = readSnapshot();

  const previousBySlug = new Map();
  for (const record of snapshot.repositories || []) previousBySlug.set(record.id, record);

  const allowlist = [...new Set((snapshot.allowed_repositories || []).map(canonicalUrl))];
  const records = [];
  const failures = [];
  let successes = 0;

  for (const url of allowlist) {
    const slug = slugFromUrl(url);
    const [owner, ...repoParts] = slug.split('/');
    const repo = repoParts.join('/');
    const previous = previousBySlug.get(slug);

    try {
      const commits = await withRetry(`${slug} commits`, () => fetchCommits(owner, repo));
      const openPullRequests = await withRetry(`${slug} pulls`, () => fetchOpenPullRequestCount(owner, repo));
      const release = await withRetry(`${slug} release`, () => fetchLatestRelease(owner, repo));
      records.push({
        id: slug,
        url,
        visibility: 'public',
        pull_requests: previous?.pull_requests ?? [],
        commits,
        releases: release ? [release] : [],
        deployments: previous?.deployments ?? [],
        open_pull_requests: openPullRequests,
      });
      successes += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ repo: slug, reason });
      // Keep the previous record, marked, rather than dropping it. A repository
      // with no previous record is simply omitted: the snapshot never invents
      // an empty record for a repo the API could not confirm.
      if (previous) records.push({ ...previous, id: slug, url, error: ERROR_MARKER });
    }
  }

  const capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const next = {
    schema_version: snapshot.schema_version,
    snapshot_id: snapshot.snapshot_id,
    captured_at: capturedAt,
    status: snapshot.status,
    source: snapshot.source,
    allowed_repositories: allowlist,
    repositories: records,
  };

  if (successes > 0) {
    const hasActivity = records.some(
      (record) => record.commits.length > 0 || record.releases.length > 0 || record.open_pull_requests > 0,
    );
    // Honest status: a partial refresh must say so. The schema ties `stale` to
    // the 90-day age policy, so partial failure is expressed in the message and
    // in the per-repo `error` marker, never by claiming a clean full refresh.
    const partial = failures.length > 0
      ? ` ${failures.length} of ${allowlist.length} repositories could not be refreshed; their records may be out of date.`
      : '';
    next.status = {
      availability: hasActivity ? 'available' : 'empty',
      stale: false,
      message: (hasActivity
        ? 'Public GitHub activity captured from the GitHub REST API at build time.'
        : 'The allowlisted public repositories currently record no recent activity.') + partial,
    };
  }

  if (DRY_RUN) {
    console.log('activity-refresh: --dry-run, snapshot NOT written');
  } else {
    writeAtomic(SNAPSHOT_FILE, `${JSON.stringify(next, null, 2)}\n`);
  }

  if (failures.length > 0) {
    console.warn(
      `activity-refresh: ${failures.length}/${allowlist.length} repositories could not be refreshed:`,
    );
    for (const failure of failures) console.warn(`  - ${failure.repo}: ${failure.reason}`);
  }
  console.log(
    `activity-refresh: refreshed ${successes}/${allowlist.length} repositories${DRY_RUN ? ' (dry run)' : '; snapshot written to github-activity/snapshot.json'}`,
  );

  if (successes === 0) {
    console.error('activity-refresh: every allowlisted repository failed; exiting non-zero.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`activity-refresh: unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
