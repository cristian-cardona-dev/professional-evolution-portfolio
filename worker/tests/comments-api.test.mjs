/**
 * API integration suite for the comment core.
 *
 * Runs the real Worker + Durable Object under `wrangler dev --local` (miniflare)
 * against a throwaway persistence directory, so the suite exercises the actual
 * SQLite DO, the actual routing and the actual fail-closed moderation branches —
 * no mocking of the DO layer (spec 12).
 *
 * `wrangler dev --local` has no Workers AI, so the suite injects the documented
 * test seam: `ENVIRONMENT=test` + `AI_MOCK=1` + `TURNSTILE_BYPASS=1`. Production
 * can never reach those flags (asserted in `ai-gate.test.mjs`).
 *
 * `wrangler` is invoked through `npx --yes wrangler@4.147.0`, the same pinned
 * convention `.github/workflows/deploy-static.yml` already uses for deploys, so
 * the harness adds no root dependency. The first run needs network access to
 * fetch wrangler.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.COMMENTS_TEST_PORT || '8791');
const BASE = `http://127.0.0.1:${PORT}`;
const WRANGLER_SPEC = process.env.WRANGLER_SPEC || 'wrangler@4.147.0';
const ADMIN_TOKEN = 'integration-admin-token';
const PERSIST_DIR = join(tmpdir(), `comments-api-test-${process.pid}`);

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
      const response = await fetch(`${BASE}/api/comments/work%2F__ready__%2F`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev did not become ready:\n${child.__log}`);
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, body: payload };
}

function postComment(page, body, extra = {}) {
  return api(`/api/comments/${encodeURIComponent(page)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body, lang: 'en', turnstileToken: 'integration-token', ...extra }),
  });
}

function getComments(page) {
  return api(`/api/comments/${encodeURIComponent(page)}`);
}

function adminQueue() {
  return api('/api/moderation/queue', {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

before(async () => {
  // `wrangler dev` requires the assets directory to exist. A real build is not
  // needed for the API: an empty directory is enough for asset-first routing to
  // fall through to the Worker for /api/*.
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  rmSync(PERSIST_DIR, { recursive: true, force: true });
  server = spawnServer('test');
  await waitForReady(server);
});

after(async () => {
  stopServer(server);
  // Windows may still hold handles in the workerd process for a moment after
  // the kill; the persistence directory is disposable, so cleanup is
  // best-effort with retries rather than a test failure.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    rmSync(PERSIST_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* the OS will reap the temp directory */
  }
});

test('GET on a fresh page returns an empty, well-formed list', async () => {
  const { status, body } = await getComments('work/empty-page/');
  assert.equal(status, 200);
  assert.deepEqual(body.comments, []);
  assert.equal(body.presence, 0);
  assert.equal(body.translation_paused, false);
  assert.equal(body.page, 'work/empty-page/');
});

test('the honeypot is rejected before any moderation happens', async () => {
  const { status, body } = await postComment('work/honeypot/', 'spam', {
    website: 'http://spam.example',
  });
  assert.equal(status, 400);
  assert.equal(body.error, 'rejected');
  const list = await getComments('work/honeypot/');
  assert.deepEqual(list.body.comments, []);
});

test('a body over 2000 characters is rejected with 400', async () => {
  const { status, body } = await postComment('work/too-long/', 'a'.repeat(2001));
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_body');
  const boundary = await postComment('work/too-long/', 'a'.repeat(2000));
  assert.equal(boundary.status, 201, 'exactly 2000 characters is allowed');
});

test('the 6th comment in an hour from one IP is rate limited with 429', async () => {
  const page = 'work/rate-limit/';
  for (let i = 1; i <= 5; i += 1) {
    const { status } = await postComment(page, `comment ${i}`);
    assert.equal(status, 201, `comment ${i} should be accepted`);
  }
  const sixth = await postComment(page, 'comment 6');
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.error, 'rate_limited');
  const list = await getComments(page);
  assert.equal(list.body.comments.length, 5);
});

test('a mock-safe comment is published and visible in the list', async () => {
  const { status, body } = await postComment('work/safe/', 'a perfectly reasonable comment', {
    name: 'Ana',
  });
  assert.equal(status, 201);
  assert.equal(body.status, 'published');
  assert.equal(body.reason, 'safe');
  assert.equal(body.comment.name, 'Ana');
  assert.equal(body.comment.source_lang, 'en');
  const list = await getComments('work/safe/');
  assert.equal(list.body.comments.length, 1);
  assert.equal(list.body.comments[0].id, body.comment.id);
});

test('an unsafe comment is never auto-published (fail-closed)', async () => {
  const { status, body } = await postComment('work/unsafe/', 'this is [[unsafe]] content');
  assert.equal(status, 201);
  assert.equal(body.status, 'pending');
  assert.equal(body.reason, 'unsafe');
  const list = await getComments('work/unsafe/');
  assert.deepEqual(list.body.comments, [], 'pending comments are not published');
});

test('a comment in another language is translated once and cached', async () => {
  const { status, body } = await postComment('work/translate/', 'hola mundo', { lang: 'es' });
  assert.equal(status, 201);
  assert.equal(body.status, 'published');
  assert.equal(body.comment.source_lang, 'es');
  assert.equal(body.comment.translation, '[en] hola mundo');
  const list = await getComments('work/translate/');
  assert.equal(list.body.comments[0].translation, '[en] hola mundo');
});

test('a comment with no declared language is double-gated and translated best-effort', async () => {
  const { status, body } = await postComment('work/unknown-lang/', 'bonjour tout le monde', {
    lang: 'fr',
  });
  assert.equal(status, 201);
  assert.equal(body.status, 'published');
  assert.equal(body.comment.source_lang, 'other');
  assert.equal(body.comment.translation, '[en] bonjour tout le monde');
});

test('disagreeing gates (source safe, translation unsafe) go to the queue', async () => {
  const { body } = await postComment('work/disagree/', 'neutral text [[disagree]]', { lang: 'es' });
  assert.equal(body.status, 'pending');
  assert.equal(body.reason, 'unsafe_translation');
});

test('a translation failure queues the comment instead of publishing it', async () => {
  const { body } = await postComment('work/translate-fail/', 'texto [[fail-translate]]', {
    lang: 'es',
  });
  assert.equal(body.status, 'pending');
  assert.equal(body.reason, 'translation_failed');
  assert.equal(body.comment.translation, null);
});

test('the admin queue is protected by the bearer token', async () => {
  const unauth = await api('/api/moderation/queue');
  assert.equal(unauth.status, 401);
  const wrong = await api('/api/moderation/queue', {
    headers: { authorization: 'Bearer nope' },
  });
  assert.equal(wrong.status, 401);
});

test('admin approve publishes a queued comment and empties the queue entry', async () => {
  const created = await postComment('work/approve/', 'queued [[unsafe]] content');
  assert.equal(created.body.status, 'pending');
  const id = created.body.comment.id;

  const queue = await adminQueue();
  assert.equal(queue.status, 200);
  assert.ok(
    queue.body.entries.some((entry) => entry.id === id && entry.page === 'work/approve/'),
    'the pending comment must be visible to human review',
  );

  const approved = await api(`/api/moderation/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'published');

  const list = await getComments('work/approve/');
  assert.equal(list.body.comments.length, 1);
  assert.equal(list.body.comments[0].id, id);

  const queueAfter = await adminQueue();
  assert.ok(!queueAfter.body.entries.some((entry) => entry.id === id));
});

test('three reports flag a published comment and put it back in the queue', async () => {
  const created = await postComment('work/reports/', 'a comment that will be reported');
  const id = created.body.comment.id;

  for (let i = 1; i <= 2; i += 1) {
    const report = await api(
      `/api/comments/${encodeURIComponent('work/reports/')}/${encodeURIComponent(id)}/report`,
      { method: 'POST' },
    );
    assert.equal(report.status, 200);
    assert.equal(report.body.status, 'published');
  }

  const third = await api(
    `/api/comments/${encodeURIComponent('work/reports/')}/${encodeURIComponent(id)}/report`,
    { method: 'POST' },
  );
  assert.equal(third.status, 200);
  assert.equal(third.body.reports, 3);
  assert.equal(third.body.status, 'flagged');

  const list = await getComments('work/reports/');
  assert.deepEqual(list.body.comments, [], 'a flagged comment is no longer public');

  const queue = await adminQueue();
  assert.ok(
    queue.body.entries.some((entry) => entry.id === id && entry.status === 'flagged'),
    'a flagged comment must be visible to human review',
  );
});

test('the admin remove action is the GDPR delete path', async () => {
  const created = await postComment('work/gdpr/', 'please delete me');
  const id = created.body.comment.id;
  const removed = await api(`/api/moderation/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'remove' }),
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.status, 'removed');
  const list = await getComments('work/gdpr/');
  assert.deepEqual(list.body.comments, []);
});

test('the realtime socket endpoint refuses an upgrade without an allowed Origin', async () => {
  // F-B implemented the socket: the DO now answers 403 to a client that does
  // not present one of the two allowlisted site origins (Node's fetch sends no
  // Origin). The real socket behaviour lives in comments-ws.test.mjs.
  const { status, body } = await api('/api/comments/work%2Fsafe%2F/ws');
  assert.equal(status, 403);
  assert.equal(body.error, 'origin_not_allowed');
});

test('unknown API routes and methods fail honestly', async () => {
  const missing = await api('/api/comments/');
  assert.equal(missing.status, 400);
  const wrongMethod = await api('/api/comments/work%2Fsafe%2F', { method: 'DELETE' });
  assert.equal(wrongMethod.status, 405);
});
