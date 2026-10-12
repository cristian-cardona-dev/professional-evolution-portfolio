/**
 * Realtime suite for the comment core (spec 7, F-B brief §2).
 *
 * Runs the real Worker + Durable Object under `wrangler dev --local` (miniflare)
 * and drives the real WebSocket upgrade through the real hibernation API — no
 * mocking of the DO layer. The client is Node's global `WebSocket` (undici),
 * whose non-standard options object lets the harness send the `Origin` header
 * the server validates; no new dependency is needed.
 *
 * The suite asserts:
 *   - two clients on one page -> presence 2 (and the REST list agrees);
 *   - a REST publish fans out one batched `{type:'comment', comment, presence}`
 *     frame to both sockets;
 *   - closing one client drops presence to 1 for the survivor;
 *   - an Origin outside the allowlist (and a missing Origin) is rejected 403;
 *   - `serializeAttachment` -> `deserializeAttachment` round-trips through the
 *     hibernation API (the test-only `__attachment__` probe).
 *
 * `wrangler dev` exposes no way to force a DO eviction, so true wake-after-
 * eviction is NOT asserted here; the attachment round-trip is the strongest
 * available local proof and f-b-report.md states this honestly.
 *
 * `wrangler` is invoked through `npx --yes wrangler@4.147.0`, the same pinned
 * convention the F-A suite and the deploy workflow use, so no root dependency
 * and no lockfile churn.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLOWED_ORIGINS, corsHeaders, isAllowedOrigin } from '../origins.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.COMMENTS_WS_TEST_PORT || '8792');
const BASE = `http://127.0.0.1:${PORT}`;
const WS_BASE = `ws://127.0.0.1:${PORT}`;
const WRANGLER_SPEC = process.env.WRANGLER_SPEC || 'wrangler@4.147.0';
const ADMIN_TOKEN = 'integration-admin-token';
const PERSIST_DIR = join(tmpdir(), `comments-ws-test-${process.pid}`);

const ALLOWED = ALLOWED_ORIGINS[0];
const PAGE = 'work/ws-room/';
const WS_PATH = `/api/comments/${encodeURIComponent(PAGE)}/ws`;

let server = null;

// --- Pure origin allowlist (no server needed) --------------------------------

test('the origin allowlist is exactly the two real site origins, never *', () => {
  assert.deepEqual([...ALLOWED_ORIGINS], [
    'https://cristian-cardona-dev.github.io',
    'https://professional-evolution-portfolio.crisss198.workers.dev',
  ]);
  assert.ok(!ALLOWED_ORIGINS.includes('*'));

  assert.equal(isAllowedOrigin(ALLOWED_ORIGINS[0]), true);
  assert.equal(isAllowedOrigin(ALLOWED_ORIGINS[1]), true);
  assert.equal(isAllowedOrigin('*'), false);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
  assert.equal(isAllowedOrigin('http://localhost:4321'), false);
  assert.equal(isAllowedOrigin(null), false);
  assert.equal(isAllowedOrigin(undefined), false);

  const allowed = corsHeaders(ALLOWED_ORIGINS[0]);
  assert.equal(allowed['access-control-allow-origin'], ALLOWED_ORIGINS[0]);
  assert.notEqual(allowed['access-control-allow-origin'], '*');
  assert.equal(allowed['access-control-allow-methods'], 'GET, POST, OPTIONS');

  const denied = corsHeaders('https://evil.example');
  assert.equal(denied['access-control-allow-origin'], undefined);
  assert.equal(denied.vary, 'Origin');
});

// --- Harness -----------------------------------------------------------------

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
      const response = await fetch(`${BASE}/api/comments/work%2F__ws_ready__%2F`);
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

/** Node's global WebSocket sends the Origin header through its options object. */
function connectSocket(path, origin) {
  const ws = new WebSocket(`${WS_BASE}${path}`, { headers: { origin } });
  ws.__frames = [];
  ws.addEventListener('message', (event) => {
    try {
      ws.__frames.push(JSON.parse(event.data));
    } catch {
      /* a non-JSON frame is not expected; ignore it */
    }
  });
  return ws;
}

function waitForOpen(ws, timeoutMs = 10_000) {
  if (ws.readyState === 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket did not open')), timeoutMs);
    ws.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    ws.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('socket errored before opening'));
      },
      { once: true },
    );
  });
}

function waitForFrame(ws, predicate, timeoutMs = 10_000) {
  const existing = ws.__frames.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for a frame; got ${JSON.stringify(ws.__frames)}`));
    }, timeoutMs);
    const onMessage = (event) => {
      let frame = null;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (predicate(frame)) {
        cleanup();
        resolve(frame);
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error('socket closed while waiting for a frame'));
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
  });
}

function closeSocket(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === 3) return resolve();
    let settled = false;
    let timer = null;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve();
    };
    // undici's WebSocket waits for the peer's close frame to finish the
    // handshake; workerd does not complete that promptly, so bound the wait.
    // The server-side close handling is asserted separately (the survivor's
    // presence frame arrives within a few ms — measured), so this grace is
    // never what the assertions depend on.
    timer = setTimeout(done, 2000);
    ws.addEventListener('close', done, { once: true });
    try {
      ws.close();
    } catch {
      done();
    }
  });
}

/**
 * A raw HTTP upgrade probe, so the exact status of a rejected handshake is
 * observable (a WebSocket client only surfaces an opaque error). `upgrade:false`
 * sends a plain GET to exercise the 426 branch.
 */
function rawUpgrade(path, origin, { upgrade = true } = {}) {
  return new Promise((resolve, reject) => {
    const headers = upgrade
      ? {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': Buffer.from(crypto.randomUUID()).toString('base64'),
        }
      : {};
    if (origin) headers.Origin = origin;
    const req = http.request({ host: '127.0.0.1', port: PORT, path, headers });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode });
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode });
    });
    req.on('error', reject);
    req.end();
  });
}

/** A raw HTTP request so the exact CORS headers are observable. */
function rawRequest(path, { method = 'GET', origin, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const merged = { ...headers };
    if (origin) merged.Origin = origin;
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method, headers: merged });
    req.on('response', (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  // `wrangler dev` requires the assets directory to exist; the API does not need
  // a real build (an empty directory is enough for asset-first fallthrough).
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

// --- Integration -------------------------------------------------------------

test('two clients see presence 2, a publish fans out to both, one close drops to 1', async () => {
  const a = connectSocket(WS_PATH, ALLOWED);
  await waitForOpen(a);
  await waitForFrame(a, (f) => f.type === 'presence' && f.count === 1);

  const b = connectSocket(WS_PATH, ALLOWED);
  await waitForOpen(b);
  await waitForFrame(a, (f) => f.type === 'presence' && f.count === 2);
  await waitForFrame(b, (f) => f.type === 'presence' && f.count === 2);

  const list = await api(`/api/comments/${encodeURIComponent(PAGE)}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.presence, 2, 'the REST list agrees with the live sockets');

  const posted = await postComment(PAGE, 'hello realtime');
  assert.equal(posted.status, 201);
  assert.equal(posted.body.status, 'published');

  const frameA = await waitForFrame(a, (f) => f.type === 'comment');
  const frameB = await waitForFrame(b, (f) => f.type === 'comment');
  assert.equal(frameA.comment.id, posted.body.comment.id);
  assert.equal(frameB.comment.id, posted.body.comment.id);
  assert.equal(frameA.comment.body, 'hello realtime');
  assert.equal(frameA.presence, 2, 'the batched frame carries the presence count');
  assert.equal(frameB.presence, 2);

  await closeSocket(b);
  const survivor = await waitForFrame(a, (f) => f.type === 'presence' && f.count === 1);
  assert.equal(survivor.count, 1);

  const listAfter = await api(`/api/comments/${encodeURIComponent(PAGE)}`);
  assert.equal(listAfter.body.presence, 1);

  await closeSocket(a);
});

test('an origin outside the allowlist, and a missing Origin, are rejected', async () => {
  const evil = await rawUpgrade(WS_PATH, 'https://evil.example');
  assert.equal(evil.status, 403);

  const missing = await rawUpgrade(WS_PATH, null);
  assert.equal(missing.status, 403);

  const wrongHost = await rawUpgrade(WS_PATH, 'http://localhost:4321');
  assert.equal(wrongHost.status, 403);

  const allowed = await rawUpgrade(WS_PATH, ALLOWED);
  assert.equal(allowed.status, 101, 'the allowlisted origin upgrades');

  // The same rejection is visible to a real WebSocket client.
  const blocked = connectSocket(WS_PATH, 'https://evil.example');
  await assert.rejects(() => waitForOpen(blocked, 5_000));
});

test('a plain GET on the socket path is not an upgrade (426)', async () => {
  const plain = await rawUpgrade(WS_PATH, ALLOWED, { upgrade: false });
  assert.equal(plain.status, 426);
});

test('REST responses carry CORS only for the two real site origins, never *', async () => {
  const pagePath = `/api/comments/${encodeURIComponent(PAGE)}`;

  const allowed = await rawRequest(pagePath, { origin: ALLOWED });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], ALLOWED);
  assert.equal(allowed.headers.vary, 'Origin');

  const denied = await rawRequest(pagePath, { origin: 'https://evil.example' });
  assert.equal(denied.status, 200, 'the data is still served; the browser blocks it');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);

  const noOrigin = await rawRequest(pagePath, {});
  assert.equal(noOrigin.headers['access-control-allow-origin'], undefined);

  // The JSON POST is preflighted; the preflight must allow content-type.
  const preflight = await rawRequest(pagePath, {
    method: 'OPTIONS',
    origin: ALLOWED,
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], ALLOWED);
  assert.equal(preflight.headers['access-control-allow-methods'], 'GET, POST, OPTIONS');
  assert.match(preflight.headers['access-control-allow-headers'], /content-type/);

  const preflightDenied = await rawRequest(pagePath, {
    method: 'OPTIONS',
    origin: 'https://evil.example',
  });
  assert.equal(preflightDenied.headers['access-control-allow-origin'], undefined);
});

test('serializeAttachment round-trips through the hibernation API', async () => {
  const ws = connectSocket(WS_PATH, ALLOWED);
  await waitForOpen(ws);
  await waitForFrame(ws, (f) => f.type === 'presence');

  ws.send(JSON.stringify({ type: '__attachment__' }));
  const probe = await waitForFrame(ws, (f) => f.type === '__attachment__');
  assert.equal(probe.attachment.page, PAGE);
  assert.equal(typeof probe.attachment.joinedAt, 'number');
  assert.equal(probe.presence, 1);

  await closeSocket(ws);
});

test('approving a queued comment broadcasts it like a publish', async () => {
  const page = 'work/ws-approve/';
  const path = `/api/comments/${encodeURIComponent(page)}/ws`;

  const ws = connectSocket(path, ALLOWED);
  await waitForOpen(ws);
  await waitForFrame(ws, (f) => f.type === 'presence' && f.count === 1);

  const created = await postComment(page, 'queued [[unsafe]] content');
  assert.equal(created.body.status, 'pending');
  const id = created.body.comment.id;

  const approved = await api(`/api/moderation/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approved.status, 200);

  const frame = await waitForFrame(ws, (f) => f.type === 'comment');
  assert.equal(frame.comment.id, id);
  assert.equal(frame.presence, 1);

  await closeSocket(ws);
});
