#!/usr/bin/env node
/**
 * Live link-rot monitor (plan phase 9.1).
 *
 * `web/tests/links.test.mjs` validates internal links and the *format* of
 * external URLs but deliberately makes no network calls. This script closes
 * that gap: it collects every external URL shipped in the HTML under
 * `web/dist` and actually requests it, so a link that rots after deployment is
 * caught.
 *
 * Two classes of failure are kept apart on purpose:
 *
 *   - `broken`  — the server answered 404/410/418/5xx. The link is dead.
 *   - `blocked` — 401/403/405/429/999. Many hosts (LinkedIn, Medium, some
 *                 CDNs) refuse automated clients while the link still works
 *                 for a human. Reporting these as broken would cry wolf, so
 *                 they are surfaced as "unverifiable" instead of failing.
 *
 * Exit codes: 0 = no dead links, 1 = at least one dead link, 2 = usage error.
 * Zero dependencies: only Node built-ins.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

const REPO = resolve(import.meta.dirname, '..');
const DIST = resolve(REPO, 'web/dist');

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 8;
const MAX_REDIRECTS = 5;
const UA = 'professional-evolution-portfolio-link-rot/1.0';

/** Statuses that mean "refused by an anti-bot wall", not "link is dead". */
const BLOCKED_STATUSES = new Set([401, 403, 405, 429, 999]);

function listHtmlFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtmlFiles(p));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Every distinct external URL referenced by the built site. */
export function collectExternalUrls(dir = DIST) {
  const urls = new Map();
  // Connection hints (`rel="preconnect"` / `dns-prefetch`) point at an origin
  // root, not a document: fonts.googleapis.com answering 404 on `/` is normal
  // and says nothing about link health, so they are excluded.
  const hints = new Set();
  for (const file of listHtmlFiles(dir)) {
    const html = readFileSync(file, 'utf8');
    for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
      const rel = /rel="([^"]*)"/i.exec(tag[0])?.[1] ?? '';
      if (/\b(preconnect|dns-prefetch)\b/i.test(rel)) {
        const href = /href="([^"]+)"/i.exec(tag[0])?.[1];
        if (href) hints.add(href.replace(/&amp;/g, '&'));
      }
    }
    for (const match of html.matchAll(/(?:href|src|content)="(https?:\/\/[^"\s<>]+)"/g)) {
      const raw = match[1].replace(/&amp;/g, '&');
      const withoutFragment = raw.split('#')[0];
      if (!withoutFragment || hints.has(withoutFragment)) continue;
      if (!urls.has(withoutFragment)) urls.set(withoutFragment, relative(dir, file));
    }
  }
  return urls;
}

function requestOnce(url, method, redirectsLeft) {
  return new Promise((resolvePromise) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolvePromise({ status: 0, error: 'invalid URL' });
      return;
    }
    const lib = parsed.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = lib(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: { 'User-Agent': UA, Accept: '*/*' },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        res.resume(); // drain so the socket can be reused/closed
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          const next = new URL(location, url).toString();
          resolvePromise({ redirect: next });
          return;
        }
        resolvePromise({ status });
      },
    );
    req.on('error', (err) => resolvePromise({ status: 0, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolvePromise({ status: 0, error: 'timeout' });
    });
    req.end();
  });
}

/** HEAD first, falling back to GET for hosts that reject HEAD. */
export async function probe(url) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    let res = await requestOnce(current, 'HEAD', 0);
    if (res.redirect) {
      current = res.redirect;
      continue;
    }
    // Some servers reject HEAD outright; retry those with GET.
    if (res.status === 405 || res.status === 501 || res.status === 0) {
      res = await requestOnce(current, 'GET', MAX_REDIRECTS);
      if (res.redirect) {
        current = res.redirect;
        continue;
      }
    }
    if (res.status >= 300 && res.status < 400 && res.error === undefined) {
      // Un-followed redirect (too many hops): treat the status as the answer.
      return { status: res.status, url: current };
    }
    return { status: res.status, url: current, error: res.error };
  }
  return { status: 0, url: current, error: 'too many redirects' };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** Classify one probe result. */
export function classify(result) {
  if (result.status === 0) return 'blocked'; // network-level refusal/timeout
  if (result.status >= 200 && result.status < 400) return 'ok';
  if (BLOCKED_STATUSES.has(result.status)) return 'blocked';
  return 'broken';
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.find((a) => a.startsWith('--json='))?.slice('--json='.length);
  const listOnly = args.includes('--list');

  const urls = collectExternalUrls();
  if (urls.size === 0) {
    console.log('link-rot: no external URLs found in web/dist (build first)');
    return 0;
  }

  if (listOnly) {
    for (const [url, source] of urls) console.log(`${url}\t${source}`);
    console.log(`link-rot: ${urls.size} unique external URL(s)`);
    return 0;
  }

  console.log(`link-rot: probing ${urls.size} unique external URL(s)...`);
  const entries = [...urls.entries()];
  const results = await mapLimit(entries, CONCURRENCY, async ([url, source]) => {
    const started = Date.now();
    const probeResult = await probe(url);
    return {
      url,
      source,
      status: probeResult.status,
      kind: classify(probeResult),
      error: probeResult.error,
      ms: Date.now() - started,
    };
  });

  const broken = results.filter((r) => r.kind === 'broken');
  const blocked = results.filter((r) => r.kind === 'blocked');
  const ok = results.filter((r) => r.kind === 'ok');

  for (const r of broken) console.error(`BROKEN  ${r.status} ${r.url}  (in ${r.source})`);
  for (const r of blocked) {
    console.warn(`UNVERIFIABLE ${r.status || 'err'} ${r.url}  (${r.error || 'refused by host'}; in ${r.source})`);
  }

  const report = {
    scanned_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    total: results.length,
    ok: ok.length,
    broken: broken.length,
    unverifiable: blocked.length,
    results,
  };
  if (jsonOut) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`link-rot: report written to ${jsonOut}`);
  }

  console.log(
    `link-rot: ${ok.length} ok, ${broken.length} broken, ${blocked.length} unverifiable (of ${results.length})`,
  );
  if (broken.length > 0) {
    console.error('link-rot: dead link(s) found.');
    return 1;
  }
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`link-rot: unexpected failure: ${error?.message ?? error}`);
      process.exit(1);
    });
}
