/**
 * Worker entry point for the comment core (spec 4.1, 5, 8).
 *
 * Routing: static assets are served first. Only `/api/*` is declared in
 * `run_worker_first`, so every other path keeps the exact Phase-D behaviour
 * (asset + `_headers`); `/api/*` reaches this script, which then talks to the
 * per-page Durable Object.
 *
 *   GET  /api/comments/:page            published comments, newest first, + presence
 *   POST /api/comments/:page            Turnstile + honeypot -> rate limit -> AI -> publish|queue
 *   POST /api/comments/:page/:id/report +1 report; 3 reports auto-flag
 *   GET  /api/comments/:page/ws         realtime socket upgrade (the DO accepts it)
 *   GET  /api/moderation/queue          admin (Bearer COMMENTS_ADMIN_TOKEN)
 *   POST /api/moderation/:id            admin { approve | remove } — also the GDPR delete path
 *
 * `/api/comments/*` responses carry CORS headers for exactly the two real site
 * origins (`worker/origins.ts`), never `*`, so the canonical GitHub Pages host
 * can reach the Worker mirror. The WebSocket upgrade validates Origin in the
 * Durable Object (browsers do not enforce CORS on WebSockets).
 *
 * `:page` is a single URL-encoded path segment (e.g. `es%2Fwork%2Fcloud-dashboard%2F`)
 * so the spec's `/api/comments/:page` shape holds even though page ids contain
 * slashes. The DO id is `comments:<page>`, exactly as the spec names it.
 *
 * Secrets (`TURNSTILE_SECRET`, `COMMENTS_ADMIN_TOKEN`) are read from `env` and
 * never appear in the repo. When either is absent the corresponding surface
 * answers 503 — an unconfigured deployment degrades honestly, it never accepts
 * silently.
 */
import {
  CommentsRoom,
  BUDGET_ROOM_NAME,
  MODERATION_ROOM_NAME,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './comments-room';
import type { CommentStatus, ModerationAction } from './comments-room';
import { normalizePage } from './language';
import { corsHeaders } from './origins';
import { verifyTurnstile } from './turnstile';

export { CommentsRoom };

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  // The `_headers` file governs static assets; Worker-generated responses must
  // carry their own hardening.
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function fail(code: string, status: number): Response {
  return json({ error: code }, status);
}

/**
 * Add the CORS headers for the request's Origin to a Worker response. A 101
 * upgrade is returned untouched: it carries the socket, and CORS does not
 * apply to WebSockets anyway.
 */
function withCors(response: Response, origin: string | null): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

/** Constant-time-ish compare so the admin token is not guessable by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function adminAuthorized(request: Request, env: Env): boolean {
  const expected = env.COMMENTS_ADMIN_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  return timingSafeEqual(header.slice('Bearer '.length), expected);
}

function clientIp(request: Request): string {
  const direct = request.headers.get('cf-connecting-ip');
  if (direct) return direct;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return 'unknown';
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await request.json();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pageRoom(env: Env, page: string): CommentsRoom {
  return env.COMMENTS.get<CommentsRoom>(env.COMMENTS.idFromName(`comments:${page}`));
}

function moderationRoom(env: Env): CommentsRoom {
  return env.COMMENTS.get<CommentsRoom>(env.COMMENTS.idFromName(MODERATION_ROOM_NAME));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/moderation/queue' || pathname.startsWith('/api/moderation/')) {
      return handleModeration(request, env, pathname);
    }

    if (pathname === '/api/comments' || pathname.startsWith('/api/comments/')) {
      return handleComments(request, env, url);
    }

    if (pathname.startsWith('/api/')) return fail('not_found', 404);

    // Non-API paths are asset-first; this branch only runs if a request falls
    // through (no matching asset and no 404-page handling). Keep it honest.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

async function handleComments(request: Request, env: Env, url: URL): Promise<Response> {
  const response = await routeComments(request, env, url);
  return withCors(response, request.headers.get('origin'));
}

async function routeComments(request: Request, env: Env, url: URL): Promise<Response> {
  const rest = url.pathname.slice('/api/comments/'.length);
  const parts = rest.split('/');
  const page = normalizePage(decodeURIComponent(parts[0] ?? ''));
  if (!page) return fail('invalid_page', 400);

  // CORS preflight. The client POSTs JSON cross-origin (canonical GitHub Pages
  // -> Worker mirror), which the browser preflights; the headers are attached
  // by `withCors`.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  // /api/comments/:page/ws — the realtime socket (spec 7). The Durable Object
  // owns the upgrade and validates the Origin before accepting.
  if (parts.length === 2 && parts[1] === 'ws') {
    if (request.method !== 'GET') return fail('method_not_allowed', 405);
    return pageRoom(env, page).fetch(request);
  }

  // /api/comments/:page/:id/report
  if (parts.length === 3 && parts[2] === 'report') {
    const id = decodeURIComponent(parts[1] ?? '');
    if (request.method !== 'POST') return fail('method_not_allowed', 405);
    if (!id) return fail('invalid_id', 400);
    const result = await pageRoom(env, page).report(id);
    if (!result.found) return fail('not_found', 404);
    return json(result);
  }

  if (parts.length !== 1) return fail('not_found', 404);

  if (request.method === 'GET') {
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const before = Number.parseInt(url.searchParams.get('before') ?? '', 10);
    const room = pageRoom(env, page);
    const list = await room.list({
      page,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
      before: Number.isFinite(before) ? before : null,
    });
    const budget = await budgetRoom(env).budget();
    return json({ page, translation_paused: budget.paused, ...list });
  }

  if (request.method === 'POST') return handleCreate(request, env, page);

  return fail('method_not_allowed', 405);
}

async function handleCreate(request: Request, env: Env, page: string): Promise<Response> {
  const payload = await readJson(request);
  if (!payload) return fail('invalid_payload', 400);

  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (body.length === 0 || body.length > 2000) return fail('invalid_body', 400);

  // Honeypot: a filled trap field is an automated submission, rejected before
  // any quota or inference is spent.
  const honeypot = typeof payload.website === 'string' ? payload.website.trim() : '';
  if (honeypot.length > 0) return fail('rejected', 400);

  const remoteIp = clientIp(request);
  const turnstile = await verifyTurnstile(env, payload.turnstileToken, remoteIp);
  if (turnstile === 'unconfigured') return fail('comments_unavailable', 503);
  if (turnstile === 'failed') return fail('turnstile_failed', 403);

  const name = typeof payload.name === 'string' ? payload.name : null;
  const lang = typeof payload.lang === 'string' ? payload.lang : '';
  const parentId = typeof payload.parentId === 'string' ? payload.parentId : null;
  const evidenceAnchor = typeof payload.evidenceAnchor === 'string' ? payload.evidenceAnchor : null;

  const result = await pageRoom(env, page).create({
    page,
    name,
    body,
    lang,
    ip: remoteIp,
    parentId,
    evidenceAnchor,
  });
  if (result.status === 'rejected') return fail(result.reason, 400);
  if (result.reason === 'invalid_body') return fail('invalid_body', 400);
  if (result.reason === 'rate_limited') return fail('rate_limited', 429);
  return json({ status: result.status, comment: result.comment, reason: result.reason }, 201);
}

async function handleModeration(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!env.COMMENTS_ADMIN_TOKEN) return fail('admin_unconfigured', 503);
  if (!adminAuthorized(request, env)) return fail('unauthorized', 401);

  if (pathname === '/api/moderation/queue') {
    if (request.method !== 'GET') return fail('method_not_allowed', 405);
    const entries = await moderationRoom(env).queue();
    return json({ entries });
  }

  const id = decodeURIComponent(pathname.slice('/api/moderation/'.length));
  if (!id || id.includes('/')) return fail('invalid_id', 400);
  if (request.method !== 'POST') return fail('method_not_allowed', 405);

  const payload = (await readJson(request)) ?? {};
  const action = payload.action;
  if (action !== 'approve' && action !== 'remove') return fail('invalid_action', 400);

  const moderation = moderationRoom(env);
  const page = await moderation.pageOf(id);
  if (!page) return fail('not_found', 404);

  const result = await pageRoom(env, page).adminAct(id, action as ModerationAction);
  if (!result.ok) return fail('not_found', 404);
  await moderation.dequeue(id);
  return json({ id, page, action, status: result.status as CommentStatus });
}

function budgetRoom(env: Env): CommentsRoom {
  return env.COMMENTS.get<CommentsRoom>(env.COMMENTS.idFromName(BUDGET_ROOM_NAME));
}
