#!/usr/bin/env node
/**
 * Core logic for the GitHub activity refresh.
 *
 * Pure, testable functions plus a configurable `runRefresh` orchestrator.
 * Network access is injected via a `request` function so unit tests can run
 * without real HTTP calls.
 */
import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync, appendFileSync } from 'node:fs';
import { get as httpsGet } from 'node:https';
import { randomUUID } from 'node:crypto';

export const DEFAULTS = {
  canonicalOwner: 'cristian-cardona-dev',
  apiHost: 'api.github.com',
  commitsPerRepo: 3,
  requestTimeoutMs: 20_000,
  errorMarker: 'last_refresh_failed',
  maxRetries: 3,
  retryBaseMs: 1_000,
  rateLimitThreshold: 5,
  rateLimitMaxSleepMs: 60_000,
  healthWindowDays: 30,
};

export const BOT_AUTHORS = [
  'dependabot[bot]',
  'renovate[bot]',
  'github-actions[bot]',
];

/** Sleep for `ms` milliseconds. */
export function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

/** Drop any trailing slash so URL comparison and slicing are stable. */
export function cleanUrl(url) {
  return String(url).replace(/\/+$/, '');
}

/** `https://github.com/owner/repo` → `owner/repo`. */
export function slugFromUrl(url) {
  return cleanUrl(url).replace(/^https:\/\/github\.com\//, '');
}

/** Force a repository URL onto the canonical public owner, keeping the repo name. */
export function canonicalUrl(url, owner = DEFAULTS.canonicalOwner) {
  const slug = slugFromUrl(url);
  const repo = slug.split('/').slice(1).join('/');
  return `https://github.com/${owner}/${repo}`;
}

/** GitHub timestamps are ISO-8601; the schema wants whole-second UTC. */
export function toIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid date: ${value}`);
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** First line of a message, trimmed and capped to the schema's 200-char limit. */
export function firstLine(text, fallback) {
  const line = String(text ?? '').split('\n')[0].trim();
  if (line.length >= 2) return line.length > 200 ? line.slice(0, 200) : line;
  return fallback;
}

/** True when a commit author name is one of the known bot identities. */
export function isBotAuthor(name) {
  return BOT_AUTHORS.includes(name);
}

/** True when `capturedAt` is older than `maxAgeDays`. */
export function isStale(capturedAt, maxAgeDays = 90) {
  const parsed = Date.parse(capturedAt);
  if (Number.isNaN(parsed)) return true;
  return Date.now() - parsed > maxAgeDays * 24 * 60 * 60 * 1000;
}

/** Retry transient failures with exponential backoff. */
export async function retry(label, operation, options = {}) {
  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : DEFAULTS.maxRetries;
  const retryBaseMs = options.retryBaseMs ?? DEFAULTS.retryBaseMs;
  const sleepFn = options.sleepFn ?? sleep;
  const log = options.log ?? console.warn;
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      // Rate-limiting is handled globally; never retry it here.
      if (error && error.rateLimited) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const transient = /timed out|ECONN|ETIMEDOUT|EAI_AGAIN|GitHub API (5\d\d|429|403)/.test(message);
      if (!transient || attempt === maxRetries) break;
      await sleepFn(retryBaseMs * 2 ** (attempt - 1));
      log(`activity-refresh: retrying ${label} (attempt ${attempt + 1}/${maxRetries}) after: ${message}`);
    }
  }
  throw lastError;
}

function parseRateLimitHeader(value) {
  if (value === undefined || value === null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Create a real `request(path, { etag })` function backed by `node:https`. */
export function createRequest(options = {}) {
  const apiHost = options.apiHost ?? DEFAULTS.apiHost;
  const token = options.token ?? '';
  const timeoutMs = options.timeoutMs ?? DEFAULTS.requestTimeoutMs;

  return async function request(path, { etag } = {}) {
    return new Promise((resolvePromise, reject) => {
      const headers = {
        'User-Agent': 'professional-evolution-portfolio-activity-refresh',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
      };
      if (etag) headers['If-None-Match'] = etag;
      const req = httpsGet(
        { hostname: apiHost, path, method: 'GET', headers },
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
      req.setTimeout(timeoutMs, () => req.destroy(new Error('request timed out')));
    });
  };
}

function applyRateLimitHandling(res, options) {
  const rateLimitThreshold = options.rateLimitThreshold ?? DEFAULTS.rateLimitThreshold;
  const rateLimitMaxSleepMs = options.rateLimitMaxSleepMs ?? DEFAULTS.rateLimitMaxSleepMs;
  const sleepFn = options.sleepFn ?? sleep;
  const remaining = parseRateLimitHeader(res.headers['x-ratelimit-remaining']);
  if (remaining === null || remaining >= rateLimitThreshold) return null;
  const reset = parseRateLimitHeader(res.headers['x-ratelimit-reset']);
  const now = Date.now();
  const resetMs = reset ? reset * 1000 : now;
  let sleepMs = Math.max(0, resetMs - now);
  sleepMs = Math.min(sleepMs, rateLimitMaxSleepMs);
  return { sleepMs, sleepFn };
}

/** Parse a JSON API response, handling 404, 304, rate limits and errors. */
export async function requestJson(request, path, options = {}) {
  const etag = options.etag;
  let res = await request(path, { etag });
  const rateLimit = applyRateLimitHandling(res, options);
  if (rateLimit) {
    await rateLimit.sleepFn(rateLimit.sleepMs);
    res = await request(path, { etag });
    const remaining2 = parseRateLimitHeader(res.headers['x-ratelimit-remaining']);
    const threshold = options.rateLimitThreshold ?? DEFAULTS.rateLimitThreshold;
    if (remaining2 !== null && remaining2 < threshold) {
      const err = new Error('rate limited, will retry next cycle');
      err.rateLimited = true;
      throw err;
    }
  }
  if (res.status === 304) return { status: 304, data: null, headers: res.headers };
  if (res.status === 404) return { status: 404, data: null, headers: res.headers };
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`GitHub API ${res.status} for ${path}`);
    // Carry the HTTP status so callers can tell "gone" (404/410) from a
    // transient failure — a deleted repository must not be retried forever.
    err.httpStatus = res.status;
    throw err;
  }
  return { status: res.status, data: JSON.parse(res.body || 'null'), headers: res.headers };
}

/** Statuses that mean the repository no longer exists (deleted, private, renamed). */
export const GONE_STATUSES = new Set([404, 410]);

/** True when an error means "this repository is gone", not "try again". */
export function isGone(error) {
  return Boolean(error && GONE_STATUSES.has(error.httpStatus));
}

/** Latest commits, newest first, shaped as snapshot objects. */
export async function fetchCommits(request, owner, repo, options = {}) {
  const commitsPerRepo = options.commitsPerRepo ?? DEFAULTS.commitsPerRepo;
  const etag = options.etag;
  const res = await requestJson(request, `/repos/${owner}/${repo}/commits?per_page=${commitsPerRepo}`, { etag, rateLimitThreshold: options.rateLimitThreshold, rateLimitMaxSleepMs: options.rateLimitMaxSleepMs, sleepFn: options.sleepFn });
  if (res.status === 304) return { unchanged: true };
  if (res.status === 404) {
    const err = new Error(`repository not found (404) for ${owner}/${repo}`);
    err.httpStatus = 404;
    throw err;
  }
  if (!Array.isArray(res.data)) throw new Error('unexpected commits payload');
  const commits = res.data.map((entry) => {
    const sha = String(entry.sha);
    const date = entry.commit?.author?.date || entry.commit?.committer?.date;
    const authorName = entry.commit?.author?.name || entry.author?.login || '';
    const commit = {
      id: sha,
      url: entry.html_url,
      captured_at: toIso(date),
      title: firstLine(entry.commit?.message, sha.slice(0, 7)),
    };
    if (isBotAuthor(authorName)) commit.bot = true;
    return commit;
  });
  return { commits, etag: res.headers.etag };
}

/**
 * Open pull-request count. Uses `per_page=1` plus `X-Total-Count`, falling back
 * to the `Link` header's last page and, finally, the returned page length.
 */
export async function fetchOpenPullRequestCount(request, owner, repo, options = {}) {
  const res = await requestJson(request, `/repos/${owner}/${repo}/pulls?state=open&per_page=1`, { rateLimitThreshold: options.rateLimitThreshold, rateLimitMaxSleepMs: options.rateLimitMaxSleepMs, sleepFn: options.sleepFn });
  const total = res.headers['x-total-count'];
  if (total !== undefined) {
    const parsed = Number.parseInt(Array.isArray(total) ? total[0] : total, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const link = res.headers.link;
  if (typeof link === 'string') {
    const last = link.split(',').find((part) => /rel="last"/.test(part));
    const page = last?.match(/[?&]page=(\d+)/);
    if (page) return Number.parseInt(page[1], 10);
  }
  return Array.isArray(res.data) ? res.data.length : 0;
}

/** Latest published release, or null when the repository has none. */
export async function fetchLatestRelease(request, owner, repo, options = {}) {
  const res = await requestJson(request, `/repos/${owner}/${repo}/releases/latest`, { rateLimitThreshold: options.rateLimitThreshold, rateLimitMaxSleepMs: options.rateLimitMaxSleepMs, sleepFn: options.sleepFn });
  if (res.status === 404 || !res.data) return null;
  const release = res.data;
  return {
    id: String(release.id),
    url: release.html_url,
    captured_at: toIso(release.published_at || release.created_at),
    title: firstLine(release.name || release.tag_name, release.tag_name || 'release'),
  };
}

/** Fetch all activity for one repository. */
export async function fetchRepoActivity(owner, repo, options = {}) {
  const request = options.request;
  const previousRecord = options.previousRecord;
  const canonicalOwner = options.canonicalOwner ?? DEFAULTS.canonicalOwner;
  const commitsPerRepo = options.commitsPerRepo ?? DEFAULTS.commitsPerRepo;
  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : DEFAULTS.maxRetries;
  const retryBaseMs = options.retryBaseMs ?? DEFAULTS.retryBaseMs;
  const sleepFn = options.sleepFn ?? sleep;
  const log = options.log ?? console.warn;
  const rateLimitOptions = {
    rateLimitThreshold: options.rateLimitThreshold,
    rateLimitMaxSleepMs: options.rateLimitMaxSleepMs,
    sleepFn,
  };
  const slug = `${owner}/${repo}`;
  const url = `https://github.com/${canonicalOwner}/${repo}`;
  const startedAt = Date.now();

  try {
    const commitsResult = await retry(`${slug} commits`, () => fetchCommits(request, owner, repo, { commitsPerRepo, etag: previousRecord?.etag, ...rateLimitOptions }), { maxRetries, retryBaseMs, sleepFn, log });
    if (commitsResult.unchanged) {
      return { slug, status: 'success', durationMs: Date.now() - startedAt, record: previousRecord };
    }
    const [openPullRequests, release] = await Promise.all([
      retry(`${slug} pulls`, () => fetchOpenPullRequestCount(request, owner, repo, rateLimitOptions), { maxRetries, retryBaseMs, sleepFn, log }),
      retry(`${slug} release`, () => fetchLatestRelease(request, owner, repo, rateLimitOptions), { maxRetries, retryBaseMs, sleepFn, log }),
    ]);
    const record = {
      id: slug,
      url,
      visibility: 'public',
      pull_requests: previousRecord?.pull_requests ?? [],
      commits: commitsResult.commits,
      releases: release ? [release] : [],
      deployments: previousRecord?.deployments ?? [],
      open_pull_requests: openPullRequests,
    };
    if (commitsResult.etag) record.etag = commitsResult.etag;
    return { slug, status: 'success', durationMs: Date.now() - startedAt, record };
  } catch (error) {
    if (error && error.rateLimited) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    // A repository that no longer exists (deleted, private, renamed) must not
    // keep a stale card alive forever: emit an explicit `unavailable` record
    // with empty contents instead of the last known data (plan phase 9.6).
    if (isGone(error)) {
      const record = {
        id: slug,
        url,
        visibility: 'public',
        pull_requests: [],
        commits: [],
        releases: [],
        deployments: [],
        open_pull_requests: 0,
        unavailable: true,
      };
      return { slug, status: 'unavailable', durationMs: Date.now() - startedAt, record, error: reason };
    }
    const record = previousRecord
      ? { ...previousRecord, id: slug, url, error: DEFAULTS.errorMarker }
      : null;
    return { slug, status: 'fail', durationMs: Date.now() - startedAt, record, error: reason };
  }
}

/** Build the next snapshot from the previous snapshot and per-repo results. */
export function buildSnapshot({ snapshot, results, capturedAt }) {
  const allowlist = snapshot.allowed_repositories || [];
  const records = results.map((r) => r.record).filter(Boolean);
  const failures = results.filter((r) => r.status === 'fail');
  const successes = results.filter((r) => r.status === 'success');
  const gone = results.filter((r) => r.status === 'unavailable');

  const next = {
    schema_version: snapshot.schema_version,
    snapshot_id: snapshot.snapshot_id,
    captured_at: capturedAt,
    status: snapshot.status,
    source: snapshot.source,
    allowed_repositories: allowlist,
    repositories: records,
  };

  if (successes.length > 0) {
    const hasActivity = records.some(
      (record) => record.commits.length > 0 || record.releases.length > 0 || record.open_pull_requests > 0,
    );
    // A repository that is gone is not a refresh failure — nothing failed to
    // refresh; it simply no longer exists. It is reported per record instead of
    // being folded into `failed_repos`.
    const partial = failures.length > 0
      ? ` ${failures.length} of ${allowlist.length} repositories could not be refreshed; their records may be out of date.`
      : '';
    const availability = failures.length > 0 ? 'partial' : (hasActivity ? 'available' : 'empty');
    next.status = {
      availability,
      stale: isStale(capturedAt, 90),
      message: (hasActivity
        ? 'Public GitHub activity captured from the GitHub REST API at build time.'
        : 'The allowlisted public repositories currently record no recent activity.') + partial,
    };
    if (failures.length > 0) {
      next.status.failed_repos = failures.map((f) => f.slug);
    }
  } else if (gone.length > 0) {
    // Every allowlisted repository is gone: say so rather than keep claiming
    // the previous run's availability.
    next.status = {
      availability: 'unavailable',
      stale: isStale(capturedAt, 90),
      message: `All ${gone.length} allowlisted repositories are no longer available on GitHub.`,
    };
  }

  return next;
}

/** Read health.json or return an empty stable object. */
export function loadHealth(path) {
  if (!existsSync(path)) return { repositories: {} };
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : { repositories: {} };
  } catch {
    return { repositories: {} };
  }
}

/** Write health.json deterministically. */
export function saveHealth(path, health) {
  writeFileSync(path, `${JSON.stringify(health, null, 2)}\n`, 'utf8');
}

/** Update the rolling 30-day health history for each repository. */
export function updateHealth(health, results, now = Date.now()) {
  const out = { ...health, repositories: { ...(health.repositories || {}) } };
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - DEFAULTS.healthWindowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const today = new Date(now).toISOString().slice(0, 10);
  for (const result of results) {
    const history = out.repositories[result.slug] || [];
    const filtered = history.filter((entry) => entry.date >= cutoffStr);
    const existing = filtered.find((entry) => entry.date === today);
    if (existing) {
      existing.success = result.status === 'success';
    } else {
      filtered.push({ date: today, success: result.status === 'success' });
    }
    out.repositories[result.slug] = filtered;
  }
  return out;
}

/** Read the current snapshot. */
export function readSnapshot(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Write snapshot atomically, keeping a `.bak` copy of the previous file. */
export function writeSnapshot({ snapshotFile, snapshot, log = console.log }) {
  const contents = `${JSON.stringify(snapshot, null, 2)}\n`;
  const tmp = `${snapshotFile}.tmp`;
  const bakFile = `${snapshotFile}.bak`;
  if (existsSync(snapshotFile)) {
    copyFileSync(snapshotFile, bakFile);
  }
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, snapshotFile);
  log('activity-refresh: snapshot written to github-activity/snapshot.json');
}

/** Format a single-line structured JSON log for the run. */
export function formatLogLine({ runId, startedAt, finishedAt, repos, totalSuccess, totalFail }) {
  return JSON.stringify({
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    repos,
    total_success: totalSuccess,
    total_fail: totalFail,
  });
}

function formatAge(isoDate, reference) {
  if (!isoDate) return '—';
  const ms = reference - Date.parse(isoDate);
  if (Number.isNaN(ms) || ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function healthSummaryForRepo(slug, health) {
  const history = health?.repositories?.[slug] || [];
  if (history.length === 0) return 'no history';
  const successes = history.filter((entry) => entry.success).length;
  return `${successes}/${history.length} success`;
}

/** Format a markdown step summary for GitHub Actions. */
export function formatStepSummary({ repos, health, startedAt, finishedAt }) {
  const reference = Date.parse(finishedAt) || Date.now();
  const lines = [
    '## GitHub Activity Refresh',
    '',
    `Started: ${startedAt} · Finished: ${finishedAt}`,
    '',
    '| Repository | Status | Commits | PRs | Last commit age | Duration | 30-day health |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const repo of repos) {
    const commits = repo.record?.commits?.length ?? 0;
    const prs = repo.record?.open_pull_requests ?? 0;
    const lastCommit = repo.record?.commits?.[0]?.captured_at;
    const age = formatAge(lastCommit, reference);
    const duration = `${repo.durationMs}ms`;
    const healthCell = healthSummaryForRepo(repo.slug, health);
    lines.push(`| ${repo.slug} | ${repo.status} | ${commits} | ${prs} | ${age} | ${duration} | ${healthCell} |`);
  }
  lines.push('');
  const totals = repos.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  lines.push(`**Totals:** ${totals.success || 0} success, ${totals.fail || 0} fail`);
  return lines.join('\n');
}

/** Full refresh orchestrator used by the CLI and tests. */
export async function runRefresh(options = {}) {
  const dryRun = options.dryRun ?? false;
  const snapshotFile = options.snapshotFile;
  const healthFile = options.healthFile;
  const token = options.token ?? '';
  const canonicalOwner = options.canonicalOwner ?? DEFAULTS.canonicalOwner;
  const apiHost = options.apiHost ?? DEFAULTS.apiHost;
  const commitsPerRepo = options.commitsPerRepo ?? DEFAULTS.commitsPerRepo;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
  const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : DEFAULTS.maxRetries;
  const retryBaseMs = options.retryBaseMs ?? DEFAULTS.retryBaseMs;
  const rateLimitThreshold = options.rateLimitThreshold ?? DEFAULTS.rateLimitThreshold;
  const rateLimitMaxSleepMs = options.rateLimitMaxSleepMs ?? DEFAULTS.rateLimitMaxSleepMs;
  const sleepFn = options.sleepFn ?? sleep;
  const now = options.now ?? Date.now();
  const log = options.log ?? console.log;
  const warn = options.warn ?? console.warn;
  const error = options.error ?? console.error;
  const stepSummaryPath = options.stepSummaryPath ?? process.env.GITHUB_STEP_SUMMARY;
  const injectedRequest = options.request;

  const runId = options.runId ?? randomUUID();
  const startedAt = toIso(now);

  const snapshot = readSnapshot(snapshotFile);
  const previousBySlug = new Map();
  for (const record of snapshot.repositories || []) previousBySlug.set(record.id, record);

  const allowlist = [...new Set((snapshot.allowed_repositories || []).map((url) => canonicalUrl(url, canonicalOwner)))];

  const request = injectedRequest || createRequest({
    apiHost,
    token,
    timeoutMs: requestTimeoutMs,
  });

  const results = [];
  for (const url of allowlist) {
    const slug = slugFromUrl(url);
    const [owner, ...repoParts] = slug.split('/');
    const repo = repoParts.join('/');
    const previous = previousBySlug.get(slug);
    try {
      const result = await fetchRepoActivity(owner, repo, {
        request,
        previousRecord: previous,
        canonicalOwner,
        commitsPerRepo,
        maxRetries,
        retryBaseMs,
        sleepFn,
        log: warn,
        rateLimitThreshold,
        rateLimitMaxSleepMs,
      });
      results.push(result);
    } catch (err) {
      if (err && err.rateLimited) {
        if (dryRun) log('activity-refresh: --dry-run, snapshot NOT written');
        log('rate limited, will retry next cycle');
        return { rateLimited: true, results };
      }
      throw err;
    }
  }

  const capturedAt = toIso(now);
  const next = buildSnapshot({ snapshot, results, capturedAt });
  const health = updateHealth(loadHealth(healthFile), results, now);

  const totalSuccess = results.filter((r) => r.status === 'success').length;
  const totalFail = results.filter((r) => r.status === 'fail').length;

  if (dryRun) {
    log('activity-refresh: --dry-run, snapshot NOT written');
  } else {
    writeSnapshot({ snapshotFile, snapshot: next, log });
    saveHealth(healthFile, health);
  }

  if (totalFail > 0) {
    warn(`activity-refresh: ${totalFail}/${allowlist.length} repositories could not be refreshed:`);
    for (const r of results.filter((r) => r.status === 'fail')) {
      warn(`  - ${r.slug}: ${r.error}`);
    }
  }
  log(`activity-refresh: refreshed ${totalSuccess}/${allowlist.length} repositories${dryRun ? ' (dry run)' : '; snapshot written to github-activity/snapshot.json'}`);

  const finishedAt = toIso(now);
  log(formatLogLine({
    runId,
    startedAt,
    finishedAt,
    repos: results.map((r) => ({
      slug: r.slug,
      status: r.status,
      duration_ms: r.durationMs,
      commits: r.record?.commits?.length ?? 0,
      error: r.error,
    })),
    totalSuccess,
    totalFail,
  }));

  if (stepSummaryPath) {
    try {
      const summary = formatStepSummary({ repos: results, health, startedAt, finishedAt });
      appendFileSync(stepSummaryPath, `\n${summary}\n`, 'utf8');
    } catch {
      // Step summary is best-effort; never fail the run.
    }
  }

  if (totalSuccess === 0) {
    error('activity-refresh: every allowlisted repository failed; exiting non-zero.');
    const err = new Error('every allowlisted repository failed');
    err.exitCode = 1;
    throw err;
  }

  return { snapshot: next, health, results };
}
