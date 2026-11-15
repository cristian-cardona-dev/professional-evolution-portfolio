#!/usr/bin/env node
/**
 * Deployed-origin probe (plan phase 9.4).
 *
 * Asserts the properties of the LIVE site that are genuinely under our control
 * and genuinely meaningful for a static host, and *reports* the security-header
 * posture without pretending we can fix it here.
 *
 * Why the split: the canonical origin is GitHub Pages, which does not support
 * custom response headers (`_headers` is a Cloudflare Pages feature, not a
 * GitHub Pages one). X-Content-Type-Options, Content-Security-Policy,
 * Referrer-Policy and X-Frame-Options therefore CANNOT be set on this origin —
 * a check that demanded them would be permanently red and teach everyone to
 * ignore it. They are printed as an honest status table instead, and the
 * limitation is documented in docs/github-activity.md and docs/deployment.md.
 *
 * Blocking assertions (these CAN regress and ARE worth failing for):
 *   - the origin answers 200 on the canonical base path
 *   - the response is HTML with an explicit UTF-8 charset
 *   - the document is complete (closes with </html>)
 *   - no version-bearing `Server` / `X-Powered-By` leak
 *
 * Exit codes: 0 pass, 1 assertion failed, 2 usage/network error.
 * Zero dependencies: only Node built-ins.
 */
import { request as httpsRequest } from 'node:https';

const DEFAULT_URL = 'https://cristian-cardona-dev.github.io/professional-evolution-portfolio/';
const TIMEOUT_MS = 20_000;
const UA = 'professional-evolution-portfolio-origin-probe/1.0';

/** Headers we would like but which GitHub Pages cannot set. */
const PLATFORM_LIMITED = [
  'x-content-type-options',
  'content-security-policy',
  'referrer-policy',
  'x-frame-options',
  'strict-transport-security',
  'permissions-policy',
];

/** A `Server` value like `nginx/1.2.3` leaks the exact build; `GitHub.com` does not. */
const VERSIONED_SERVER = /\/\d+(\.\d+)+/;

function fetchHead(url) {
  return new Promise((resolvePromise) => {
    const parsed = new URL(url);
    const req = httpsRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
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

/** Run every blocking assertion; returns { failures, notes }. */
export function evaluate(response) {
  const failures = [];
  const notes = [];
  const headers = response.headers ?? {};
  const lower = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;

  if (response.status !== 200) {
    failures.push(`expected HTTP 200 on the canonical base path, got ${response.status || `error (${response.error})`}`);
  }

  const contentType = String(lower['content-type'] ?? '');
  if (!/^text\/html\b/i.test(contentType)) {
    failures.push(`expected a text/html response, got "${contentType || 'none'}"`);
  } else if (!/charset=utf-8/i.test(contentType)) {
    failures.push(`expected an explicit charset=utf-8, got "${contentType}"`);
  }

  const body = response.body ?? '';
  if (response.status === 200 && !/<\/html>\s*$/i.test(body.trim())) {
    failures.push('response body does not end with </html> (truncated or non-document payload)');
  }

  const poweredBy = lower['x-powered-by'];
  if (poweredBy) failures.push(`X-Powered-By exposes the stack: "${poweredBy}"`);

  const server = String(lower.server ?? '');
  if (server && VERSIONED_SERVER.test(server)) {
    failures.push(`Server header leaks a version: "${server}"`);
  }

  // Informational: the header posture we cannot change from this origin.
  for (const name of PLATFORM_LIMITED) {
    notes.push(
      lower[name]
        ? `${name}: present (${lower[name]})`
        : `${name}: absent — GitHub Pages does not support custom response headers`,
    );
  }
  notes.push(`access-control-allow-origin: ${lower['access-control-allow-origin'] ?? 'absent'}`);

  return { failures, notes };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--url='));
  const url = arg ? arg.slice('--url='.length) : DEFAULT_URL;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`security-headers: invalid URL "${url}"`);
    return 2;
  }
  if (parsed.protocol !== 'https:') {
    console.error('security-headers: the canonical origin must be https');
    return 2;
  }

  console.log(`security-headers: probing ${url}`);
  const response = await fetchHead(url);
  if (response.status === 0 && !response.headers) {
    console.error(`security-headers: request failed: ${response.error}`);
    return 2;
  }

  const { failures, notes } = evaluate(response);

  console.log('security-headers: header posture (informational)');
  for (const note of notes) console.log(`  - ${note}`);

  if (failures.length > 0) {
    console.error(`security-headers: ${failures.length} assertion(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    return 1;
  }

  console.log('security-headers: all blocking assertions passed.');
  return 0;
}

const normalizePath = (p) => String(p).replace(/\\/g, '/');
const isMain =
  Boolean(process.argv[1]) && normalizePath(import.meta.filename) === normalizePath(process.argv[1]);
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`security-headers: unexpected failure: ${error?.message ?? error}`);
      process.exit(2);
    });
}
