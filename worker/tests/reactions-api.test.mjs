/**
 * API integration suite for the anonymous milestone reaction (Phase 3).
 *
 * Runs the real Worker + Durable Object under `wrangler dev --local`
 * (miniflare) against a throwaway persistence directory, so the suite exercises
 * the real routing, the real SQLite DO and the real abuse guard — no mocking.
 *
 * What it proves:
 *   - the counter is keyed by the CANONICAL milestone id, so EN and ES share
 *     one count and one idempotency space (a locale header cannot partition it);
 *   - PUT is idempotent for the same anonymous nonce; DELETE is idempotent;
 *   - a malformed milestone id and a missing nonce are rejected;
 *   - a well-formed but UNKNOWN milestone id is rejected with a 404 and mints no
 *     room or count (the runtime mirrors the static "unknown id -> 404" contract);
 *   - concurrent duplicate PUTs for one nonce count once and spend the per-IP
 *     allowance once;
 *   - the abuse guard refuses NEW nonces past the per-IP hourly limit, while a
 *     duplicate PUT of an existing nonce still succeeds (no quota spent);
 *   - no response ever leaks the nonce, the IP or the stored hash;
 *   - the CORS contract for the reaction route keeps the two-origin allowlist;
 *   - reactions and comments are stored independently (no shared page id).
 *
 * `wrangler` is invoked through `npx --yes wrangler@4.147.0`, the pinned
 * convention the other worker suites and the deploy workflow use.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.REACTIONS_TEST_PORT || '8793');
const BASE = `http://127.0.0.1:${PORT}`;
const WRANGLER_SPEC = process.env.WRANGLER_SPEC || 'wrangler@4.147.0';
const ADMIN_TOKEN = 'integration-admin-token';
const PERSIST_DIR = join(tmpdir(), `reactions-api-test-${process.pid}`);

const ALLOWED_ORIGIN = 'https://cristian-cardona-dev.github.io';
const MILESTONE = '2026-10-09-portfolio-10x-rebuild';
const RATE_MILESTONE = '2026-10-09-portfolio-10x-launch';
const OTHER_MILESTONE = '2026-10-03-initial-portfolio-build';
const CONCURRENT_MILESTONE = '2026-10-09-ai-engineering-evidence-build-out';
const UNKNOWN_MILESTONE = 'this-milestone-does-not-exist';

/** A well-formed opaque nonce (16-128 chars, URL-safe). */
function nonce(seed) {
  return `nonce-${String(seed).padStart(10, '0')}`;
}

let server = null;

function spawnServer(env) {
  const args = [
    '--yes',
    WRANGLER_SPEC,
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--persist-to',
    PERSIST_DIR,
    '--var',
    `ENVIRONMENT:${env}`,
    '--var',
    'AI_MOCK:1',
    '--var',
    'TURNSTILE_BYPASS:1',
    '--var',
    'TURNSTILE_SECRET:integration-turnstile-secret',
    '--var',
    `COMMENTS_ADMIN_TOKEN:${ADMIN_TOKEN}`,
  ];
  const child = spawn(`npx ${args.join(' ')}`, {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.__log = '';
  child.stdout.on('data', (chunk) => {
    child.__log += chunk;
  });
  child.stderr.on('data', (chunk) => {
    child.__log += chunk;
  });
  return child;
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitForReady(child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited early (code ${child.exitCode}):\n${child.__log}`);
    }
    try {
      const response = await fetch(`${BASE}/api/milestones/${MILESTONE}/reaction`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev did not become ready:\n${child.__log}`);
}

/** Raw response (headers + parsed body) for one reaction call. */
async function call(milestone, method = 'GET', init = {}) {
  const headers = { accept: 'application/json', ...(init.headers ?? {}) };
  const response = await fetch(
    `${BASE}/api/milestones/${encodeURIComponent(milestone)}/reaction`,
    { ...init, method, headers },
  );
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, headers: response.headers, body };
}

function react(milestone, seed) {
  return call(milestone, 'PUT', { headers: { 'x-reaction-nonce': nonce(seed) } });
}

function unreact(milestone, seed) {
  return call(milestone, 'DELETE', { headers: { 'x-reaction-nonce': nonce(seed) } });
}

before(async () => {
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  rmSync(PERSIST_DIR, { recursive: true, force: true });
  server = spawnServer('test');
  await waitForReady(server);
});

after(async () => {
  stopServer(server);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    rmSync(PERSIST_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* the OS will reap the temp directory */
  }
});

test('GET on a fresh milestone returns a zero, unreacted state', async () => {
  const { status, body } = await call(MILESTONE);
  assert.equal(status, 200);
  assert.deepEqual(body, { milestone: MILESTONE, count: 0, reacted: false });
});

test('the first PUT counts once and marks the caller as reacted', async () => {
  const first = await react(MILESTONE, 1);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { milestone: MILESTONE, count: 1, reacted: true });
});

test('a duplicate PUT for the same nonce never increments twice', async () => {
  const duplicate = await react(MILESTONE, 1);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.count, 1);
  assert.equal(duplicate.body.reacted, true);
});

test('a different anonymous visitor sees the shared count but not the reacted state', async () => {
  const other = await call(MILESTONE, 'GET', { headers: { 'x-reaction-nonce': nonce(2) } });
  assert.equal(other.status, 200);
  assert.equal(other.body.count, 1, 'the count is shared, not per visitor');
  assert.equal(other.body.reacted, false, 'a second nonce is a separate visitor');

  const added = await react(MILESTONE, 2);
  assert.equal(added.body.count, 2);
});

test('EN and ES share one counter: a locale header cannot partition it', async () => {
  const spanish = await call(MILESTONE, 'GET', { headers: { 'accept-language': 'es-ES' } });
  assert.equal(spanish.status, 200);
  assert.equal(spanish.body.count, 2, 'the same canonical id returns the same count');
  assert.equal(spanish.body.milestone, MILESTONE);

  // A different canonical id has its own, independent room and count.
  const other = await call(OTHER_MILESTONE);
  assert.equal(other.body.count, 0);
});

test('DELETE is idempotent: the second delete is a safe no-op', async () => {
  const first = await unreact(MILESTONE, 1);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { milestone: MILESTONE, count: 1, reacted: false });

  const second = await unreact(MILESTONE, 1);
  assert.equal(second.status, 200);
  assert.equal(second.body.count, 1);
  assert.equal(second.body.reacted, false);

  // Deleting a nonce that never reacted is also a successful no-op.
  const absent = await unreact(MILESTONE, 999);
  assert.equal(absent.status, 200);
  assert.equal(absent.body.count, 1);
});

test('a malformed milestone id is rejected before it can name a Durable Object', async () => {
  const uppercase = await call('INVALID');
  assert.equal(uppercase.status, 400);
  assert.equal(uppercase.body.error, 'invalid_milestone');

  const spaced = await call('bad id!');
  assert.equal(spaced.status, 400);
  assert.equal(spaced.body.error, 'invalid_milestone');

  const tooLong = await call('a'.repeat(201));
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.error, 'invalid_milestone');
});

test('a well-formed but unknown milestone id is rejected with a 404, never a fabricated count', async () => {
  // Syntactically valid slug, but not present in `data/evolution.json`.
  const unknownGet = await call(UNKNOWN_MILESTONE);
  assert.equal(unknownGet.status, 404);
  assert.equal(unknownGet.body.error, 'unknown_milestone');

  // No method may mint a room/count for an id the site does not publish.
  const unknownPut = await call(UNKNOWN_MILESTONE, 'PUT', {
    headers: { 'x-reaction-nonce': nonce(1) },
  });
  assert.equal(unknownPut.status, 404);
  assert.equal(unknownPut.body.error, 'unknown_milestone');

  const unknownDelete = await call(UNKNOWN_MILESTONE, 'DELETE', {
    headers: { 'x-reaction-nonce': nonce(1) },
  });
  assert.equal(unknownDelete.status, 404);
  assert.equal(unknownDelete.body.error, 'unknown_milestone');

  // Repeating the GET proves no room was created behind the rejection: it still
  // answers 404, not `count: 0` from a fresh room.
  const repeated = await call(UNKNOWN_MILESTONE);
  assert.equal(repeated.status, 404);
  assert.equal(repeated.body.error, 'unknown_milestone');
});

test('PUT and DELETE require a well-formed nonce', async () => {
  const noNonce = await call(MILESTONE, 'PUT');
  assert.equal(noNonce.status, 400);
  assert.equal(noNonce.body.error, 'invalid_nonce');

  const shortNonce = await call(MILESTONE, 'PUT', { headers: { 'x-reaction-nonce': 'short' } });
  assert.equal(shortNonce.status, 400);
  assert.equal(shortNonce.body.error, 'invalid_nonce');

  const badChars = await call(MILESTONE, 'PUT', {
    headers: { 'x-reaction-nonce': 'has spaces and $ymbols'.padEnd(20, 'x') },
  });
  assert.equal(badChars.status, 400);
  assert.equal(badChars.body.error, 'invalid_nonce');
});

test('the abuse guard refuses NEW nonces past the hourly limit, but not duplicates', async () => {
  for (let i = 1; i <= 30; i += 1) {
    const { status } = await react(RATE_MILESTONE, 1000 + i);
    assert.equal(status, 200, `new reaction ${i} should be accepted`);
  }
  const refused = await react(RATE_MILESTONE, 9999);
  assert.equal(refused.status, 429);
  assert.equal(refused.body.error, 'rate_limited');

  // The limit only guards NEW reactions: repeating an accepted nonce is still a
  // free, idempotent success, and the count never moved past 30.
  const duplicate = await react(RATE_MILESTONE, 1001);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.count, 30);
});

test('concurrent duplicate PUTs count once and spend the allowance once', async () => {
  const seed = 4242;

  // Fire a burst of PUTs for the SAME nonce at once and assert the invariant
  // that must hold however the Durable Object interleaves: the nonce counts
  // once and spends exactly one allowance. The DO yields on every storage
  // await, so without the room's serialization lock a duplicate can slip past
  // the initial check while the first PUT is awaiting the allowance store, and
  // (if two salts raced) the nonce could even land twice.
  const burst = await Promise.all(
    Array.from({ length: 25 }, () => react(CONCURRENT_MILESTONE, seed)),
  );
  for (const { status } of burst) assert.equal(status, 200);

  const state = await call(CONCURRENT_MILESTONE);
  assert.equal(state.body.count, 1, 'one nonce must count exactly once under concurrency');

  // The burst must have spent exactly ONE allowance: 29 more NEW nonces fit the
  // 30/hour budget, and the 30th additional one is refused. If the burst had
  // spent the budget, the loop below would be refused early.
  for (let i = 1; i <= 29; i += 1) {
    const { status } = await react(CONCURRENT_MILESTONE, 5000 + i);
    assert.equal(status, 200, `distinct reaction ${i} should fit the remaining allowance`);
  }
  const overBudget = await react(CONCURRENT_MILESTONE, 9999);
  assert.equal(overBudget.status, 429);
  assert.equal(overBudget.body.error, 'rate_limited');

  const final = await call(CONCURRENT_MILESTONE);
  assert.equal(final.body.count, 30, 'the burst contributed exactly one to the final count');
});

test('no response leaks the nonce, the IP or the stored hash', async () => {
  const seed = 500;
  const raw = nonce(seed);
  const response = await fetch(`${BASE}/api/milestones/${MILESTONE}/reaction`, {
    method: 'PUT',
    headers: { 'x-reaction-nonce': raw },
  });
  const text = await response.text();
  assert.equal(response.status, 200);
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body).sort(), ['count', 'milestone', 'reacted']);
  assert.ok(!text.includes(raw), 'the nonce must never be echoed');
  assert.ok(!text.toLowerCase().includes('ip'), 'no IP field may appear');
  assert.ok(!/[0-9a-f]{64}/.test(text), 'no 64-hex hash may appear');

  const headerBlob = [...response.headers.entries()].map(([k, v]) => `${k}:${v}`).join('\n');
  assert.ok(!headerBlob.includes(raw), 'the nonce must never be echoed in a header');
});

test('the reaction CORS contract keeps the two-origin allowlist and widens only its methods', async () => {
  const preflight = await fetch(`${BASE}/api/milestones/${MILESTONE}/reaction`, {
    method: 'OPTIONS',
    headers: {
      origin: ALLOWED_ORIGIN,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'x-reaction-nonce',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PUT/);
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /DELETE/);
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-reaction-nonce/);

  const denied = await fetch(`${BASE}/api/milestones/${MILESTONE}/reaction`, {
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const allowed = await fetch(`${BASE}/api/milestones/${MILESTONE}/reaction`, {
    headers: { origin: ALLOWED_ORIGIN },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
});

test('unknown methods and paths fail honestly', async () => {
  const wrongMethod = await call(MILESTONE, 'POST');
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.body.error, 'method_not_allowed');

  const wrongPath = await fetch(`${BASE}/api/milestones/${MILESTONE}/other`, { method: 'GET' });
  assert.equal(wrongPath.status, 404);

  const bare = await fetch(`${BASE}/api/milestones/${MILESTONE}`, { method: 'GET' });
  assert.equal(bare.status, 404);
});

test('reactions and comments stay in independent storage', async () => {
  const page = `evolution/${MILESTONE}/`;

  // A comment on the milestone detail page uses the comments room...
  const comment = await fetch(`${BASE}/api/comments/${encodeURIComponent(page)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body: 'independent storage check', lang: 'en', turnstileToken: 'x' }),
  });
  assert.equal(comment.status, 201);

  // ...while the reaction uses the reaction room keyed by the canonical id.
  const before = await call(MILESTONE, 'GET');
  const added = await react(MILESTONE, 700);
  assert.equal(added.body.count, before.body.count + 1);

  const list = await fetch(`${BASE}/api/comments/${encodeURIComponent(page)}`);
  const listBody = await list.json();
  assert.equal(listBody.comments.length, 1, 'the comment list is untouched by reactions');
  assert.equal(listBody.comments[0].body, 'independent storage check');
});
