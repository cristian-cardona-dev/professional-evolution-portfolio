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

function postCommentFrom(page, body, ip, extra = {}) {
  return api(`/api/comments/${encodeURIComponent(page)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-client-ip': ip },
    body: JSON.stringify({ body, lang: 'en', turnstileToken: 'integration-token', ...extra }),
  });
}

function translateComment(page, id, targetLocale, ip) {
  return api(`/api/comments/${encodeURIComponent(page)}/${encodeURIComponent(id)}/translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ip ? { 'x-test-client-ip': ip } : {}) },
    body: JSON.stringify({ targetLocale }),
  });
}

function adminQueue() {
  return api('/api/moderation/queue', {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

function erasureStorage(id) {
  return api(`/api/moderation/__test-erasure/${encodeURIComponent(id)}`, {
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

test('moderation translation stays private while the cross-locale comment is published', async () => {
  const { status, body } = await postComment('work/translate/', 'hola mundo', { lang: 'es' });
  assert.equal(status, 201);
  assert.equal(body.status, 'published');
  assert.equal(body.comment.source_lang, 'es');
  assert.equal(body.comment.translation, null, 'the moderation translation is never public');
  const list = await getComments('work/translate/');
  assert.equal(list.body.comments[0].translation, null, 'the list does not expose moderation output');
});

test('a comment with no declared language is double-gated and translated best-effort', async () => {
  const { status, body } = await postComment('work/unknown-lang/', 'bonjour tout le monde', {
    lang: 'fr',
  });
  assert.equal(status, 201);
  assert.equal(body.status, 'published');
  assert.equal(body.comment.source_lang, 'other');
  assert.equal(body.comment.translation, null);
});

test('reading translation is explicit, cached and available only for published milestone comments', async () => {
  const page = 'evolution/2026-10-03-initial-portfolio-build/';
  const created = await postComment(page, 'hola para leer', { lang: 'es' });
  assert.equal(created.body.status, 'published');
  const id = created.body.comment.id;

  const translated = await translateComment(page, id, 'en');
  assert.equal(translated.status, 200);
  assert.equal(translated.body.translation, '[en] hola para leer');
  assert.equal(translated.body.cached, false);

  const cached = await translateComment(page, id, 'en');
  assert.equal(cached.status, 200);
  assert.deepEqual(cached.body, { translation: '[en] hola para leer', cached: true });

  const wrongPage = await translateComment('evolution/2026-10-03-evidence-boundary-contract/', id, 'en');
  assert.equal(wrongPage.status, 404);
  const nonMilestone = await translateComment('work/translate/', id, 'en');
  assert.equal(nonMilestone.status, 404);
});

test('direct HTTP reading translations have a bounded per-IP/per-page rate limit', async () => {
  const page = 'es/evolution/2026-10-03-evidence-boundary-contract/';
  const ids = [];
  for (let i = 0; i < 11; i += 1) {
    const created = await postCommentFrom(page, `translation source ${i}`, `192.0.2.${i + 1}`);
    assert.equal(created.body.status, 'published');
    ids.push(created.body.comment.id);
  }
  const callerIp = '198.51.100.77';
  for (const id of ids.slice(0, 10)) {
    const result = await translateComment(page, id, 'es', callerIp);
    assert.equal(result.status, 200);
    assert.equal(result.body.cached, false);
  }
  const limited = await translateComment(page, ids[10], 'es', callerIp);
  assert.equal(limited.status, 429);
  assert.deepEqual(limited.body, { error: 'rate_limited' });
  assert.equal(JSON.stringify(limited.body).includes(callerIp), false);
});

test('reading translation validates target locale, source locale and page locale', async () => {
  const enPage = 'evolution/2026-10-03-evidence-boundary-contract/';
  const spanish = await postComment(enPage, 'texto en español', { lang: 'es' });
  const invalid = await translateComment(enPage, spanish.body.comment.id, 'fr');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'invalid_target_locale');
  const wrongTarget = await translateComment(enPage, spanish.body.comment.id, 'es');
  assert.equal(wrongTarget.status, 400);

  const unknownLanguage = await postComment(enPage, 'bonjour reader', { lang: 'fr' });
  const unsupported = await translateComment(enPage, unknownLanguage.body.comment.id, 'en');
  assert.equal(unsupported.status, 422);
  assert.equal(unsupported.body.error, 'unsupported_language');

  const pending = await postComment(enPage, 'unsafe [[unsafe]] content', { lang: 'en' });
  assert.equal(pending.body.status, 'pending');
  const hidden = await translateComment(enPage, pending.body.comment.id, 'en');
  assert.equal(hidden.status, 404);
});

test('concurrent reading requests share one translation result', async () => {
  const page = 'evolution/2026-10-07-dark-first-theme-foundation/';
  const created = await postComment(page, 'hola simultáneo', { lang: 'es' });
  const id = created.body.comment.id;
  const responses = await Promise.all([
    translateComment(page, id, 'en'),
    translateComment(page, id, 'en'),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.deepEqual(responses.map((response) => response.body.translation), [
    '[en] hola simultáneo',
    '[en] hola simultáneo',
  ]);
  assert.deepEqual(
    responses.map((response) => response.body.cached).sort(),
    [false, true],
    'one request generates while the concurrent duplicate joins its in-flight result',
  );
});

test('translation model failure keeps the source published and returns a safe fallback error', async () => {
  const page = 'es/evolution/2026-10-09-portfolio-10x-launch/';
  const created = await postComment(page, 'text [[fail-reading-translate]]', { lang: 'en' });
  assert.equal(created.body.status, 'published');
  const result = await translateComment(page, created.body.comment.id, 'es');
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'translation_unavailable');
  const list = await getComments(page);
  assert.equal(list.body.comments[0].body, 'text [[fail-reading-translate]]');
  assert.equal(list.body.comments[0].translation, null);
});

test('replies can be translated with the same explicit endpoint', async () => {
  const page = 'es/evolution/2026-10-09-agentic-workflow-lab-public-iterations/';
  const root = await postComment(page, 'parent comment', { lang: 'en' });
  const reply = await postComment(page, 'reply comment', { lang: 'en', parentId: root.body.comment.id });
  assert.equal(reply.body.status, 'published');
  const result = await translateComment(page, reply.body.comment.id, 'es');
  assert.equal(result.status, 200);
  assert.equal(result.body.translation, '[es] reply comment');
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

test('three distinct reporters flag a published comment and put it back in the queue', async () => {
  const created = await postComment('work/reports/', 'a comment that will be reported');
  const id = created.body.comment.id;

  for (let i = 1; i <= 2; i += 1) {
    const report = await api(
      `/api/comments/${encodeURIComponent('work/reports/')}/${encodeURIComponent(id)}/report`,
      { method: 'POST', headers: { 'x-test-client-ip': `198.51.100.${i}` } },
    );
    assert.equal(report.status, 200);
    assert.equal(report.body.status, 'published');
  }

  const third = await api(
    `/api/comments/${encodeURIComponent('work/reports/')}/${encodeURIComponent(id)}/report`,
    { method: 'POST', headers: { 'x-test-client-ip': '198.51.100.3' } },
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

test('repeating a report from the same caller never advances the flag threshold', async () => {
  const page = 'work/report-dedup/';
  const created = await postComment(page, 'a comment with duplicate reports');
  const id = created.body.comment.id;
  const report = (ip) => api(
    `/api/comments/${encodeURIComponent(page)}/${encodeURIComponent(id)}/report`,
    { method: 'POST', headers: { 'x-test-client-ip': ip } },
  );

  const first = await report('203.0.113.10');
  const duplicate = await report('203.0.113.10');
  const duplicateAgain = await report('203.0.113.10');
  assert.equal(first.body.reports, 1);
  assert.equal(duplicate.body.reports, 1);
  assert.equal(duplicateAgain.body.reports, 1);
  assert.equal(duplicateAgain.body.status, 'published');

  const list = await getComments(page);
  assert.equal(list.body.comments.length, 1);
});

test('the admin remove action is the GDPR delete path', async () => {
  const page = 'evolution/2026-10-03-initial-portfolio-build/';
  const created = await postComment(page, 'please delete me', { lang: 'es', name: 'Private Name' });
  const id = created.body.comment.id;
  const translated = await translateComment(page, id, 'en');
  assert.equal(translated.status, 200);
  const before = await erasureStorage(id);
  assert.deepEqual(before.body, {
    bodyPresent: true,
    namePresent: true,
    moderationTranslationPresent: true,
    readingCacheRows: 1,
    status: 'published',
  });

  const removed = await api(`/api/moderation/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'remove' }),
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.status, 'removed');
  const list = await getComments(page);
  assert.equal(list.body.comments.some((comment) => comment.id === id), false);
  const after = await erasureStorage(id);
  assert.deepEqual(after.body, {
    bodyPresent: false,
    namePresent: false,
    moderationTranslationPresent: false,
    readingCacheRows: 0,
    status: 'removed',
  });
  assert.equal((await translateComment(page, id, 'en')).status, 404);
});

test('a reply is published under its parent and includes the evidence anchor', async () => {
  const page = 'work/reply-valid/';
  const parent = await postComment(page, 'top level comment', { name: 'Parent' });
  assert.equal(parent.status, 201);
  const parentId = parent.body.comment.id;

  const reply = await postComment(page, 'a reply', {
    name: 'Replier',
    parentId,
    evidenceAnchor: 'evidence-2',
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.status, 'published');
  assert.equal(reply.body.comment.parent_id, parentId);
  assert.equal(reply.body.comment.evidence_anchor, 'evidence-2');

  const list = await getComments(page);
  assert.equal(list.body.comments.length, 2);
  const found = list.body.comments.find((c) => c.id === reply.body.comment.id);
  assert.ok(found);
  assert.equal(found.parent_id, parentId);
  assert.equal(found.evidence_anchor, 'evidence-2');
});

test('a reply to a parent on another page is rejected', async () => {
  const parentPage = 'work/reply-cross-a/';
  const childPage = 'work/reply-cross-b/';
  const parent = await postComment(parentPage, 'parent on another page');
  assert.equal(parent.status, 201);

  const reply = await postComment(childPage, 'cross-page reply', { parentId: parent.body.comment.id });
  assert.equal(reply.status, 400);
  assert.equal(reply.body.error, 'cross_page_parent');

  const list = await getComments(childPage);
  assert.deepEqual(list.body.comments, []);
});

test('a reply to a reply is rejected to enforce one-level threading', async () => {
  const page = 'work/reply-too-deep/';
  const root = await postComment(page, 'root comment');
  assert.equal(root.status, 201);
  const reply = await postComment(page, 'first reply', { parentId: root.body.comment.id });
  assert.equal(reply.status, 201);

  const tooDeep = await postComment(page, 'reply to reply', { parentId: reply.body.comment.id });
  assert.equal(tooDeep.status, 400);
  assert.equal(tooDeep.body.error, 'too_deep');

  const list = await getComments(page);
  assert.equal(list.body.comments.length, 2);
});

test('a reply to a removed parent is rejected', async () => {
  const page = 'work/reply-removed-parent/';
  const parent = await postComment(page, 'will be removed');
  assert.equal(parent.status, 201);
  const id = parent.body.comment.id;

  const removed = await api(`/api/moderation/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'remove' }),
  });
  assert.equal(removed.status, 200);

  const reply = await postComment(page, 'reply after removal', { parentId: id });
  assert.equal(reply.status, 400);
  assert.equal(reply.body.error, 'parent_removed');
});

test('reports and GDPR removal apply to replies like top-level comments', async () => {
  const page = 'work/reply-report-gdpr/';
  const root = await postComment(page, 'root for report test');
  assert.equal(root.status, 201);
  const reply = await postComment(page, 'reply for report test', { parentId: root.body.comment.id });
  assert.equal(reply.status, 201);
  const replyId = reply.body.comment.id;

  for (let i = 1; i <= 3; i += 1) {
    const report = await api(
      `/api/comments/${encodeURIComponent(page)}/${encodeURIComponent(replyId)}/report`,
      { method: 'POST', headers: { 'x-test-client-ip': `192.0.2.${i}` } },
    );
    assert.equal(report.status, 200);
    if (i === 3) assert.equal(report.body.status, 'flagged');
  }

  const listAfterReports = await getComments(page);
  assert.equal(
    listAfterReports.body.comments.some((c) => c.id === replyId),
    false,
    'flagged replies are hidden from the public list',
  );

  const queue = await adminQueue();
  assert.ok(queue.body.entries.some((entry) => entry.id === replyId && entry.parent_id === root.body.comment.id));

  const removed = await api(`/api/moderation/${encodeURIComponent(replyId)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'remove' }),
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.status, 'removed');

  const queueAfter = await adminQueue();
  assert.ok(!queueAfter.body.entries.some((entry) => entry.id === replyId));
});

test('a removed parent with remaining replies renders context via the list shape', async () => {
  const page = 'work/reply-tombstone/';
  const root = await postComment(page, 'root with replies');
  assert.equal(root.status, 201);
  const rootId = root.body.comment.id;
  const reply = await postComment(page, 'orphaned reply', { parentId: rootId });
  assert.equal(reply.status, 201);
  const replyId = reply.body.comment.id;

  await api(`/api/moderation/${encodeURIComponent(rootId)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'remove' }),
  });

  const list = await getComments(page);
  assert.equal(list.body.comments.length, 1);
  assert.equal(list.body.comments[0].id, replyId);
  assert.equal(list.body.comments[0].parent_id, rootId);
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
