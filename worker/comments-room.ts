/**
 * The comment Durable Object (spec 4, 5, 6).
 *
 * One class, four roles, selected by the DO instance name:
 *
 *   - `comments:<page>`      — the per-page room: SQLite `comments` table,
 *                              transient rate-limit keys, presence, report
 *                              counting and the moderation/translation pipeline.
 *   - `reactions:<milestone>` — the per-milestone reaction room: a SQLite
 *                              `reactions` table keyed by salted nonce hashes.
 *                              The name carries the CANONICAL milestone id, not
 *                              the locale, so EN and ES share one count.
 *   - `__budget__`           — the global daily neuron counter (spec 6.3). It is
 *                              one instance shared by every page room, so the
 *                              5,000/day guardrail is a *site* budget rather
 *                              than a per-page one that a busy page could
 *                              exhaust while the rest of the site still spends.
 *   - `__moderation__`       — the cross-page moderation index: `index:<id>` →
 *                              page (so the admin API can route any id, and the
 *                              GDPR delete path can find a published comment)
 *                              and `queue:<id>` → the pending/flagged entry the
 *                              human reviews.
 *
 * SQLite (`new_sqlite_classes`) is required: it is the only storage backend
 * available on Workers Free. Presence is NOT persisted — it is the count of
 * open WebSockets in this room (`ctx.getWebSockets()`), maintained through the
 * hibernation WebSocket API (spec 7).
 *
 * Fail-closed moderation: every branch that cannot prove a comment safe
 * (model error, unparseable verdict, disagreeing gates, missing translation
 * for a cross-locale or unmapped-language comment) writes `pending`.
 *
 * No `setTimeout` / `setInterval` anywhere: timers block hibernation and
 * accrue duration charges (spec 7). Nothing here needs one — heartbeats are
 * the runtime's automatic ping/pong, and the browser client owns all backoff
 * and polling.
 */
import { DurableObject } from 'cloudflare:workers';
import { moderate, translate, NEURONS_PER_GUARD, NEURONS_PER_TRANSLATION } from './ai';
import type { Verdict } from './ai';
import { normalizePage, normalizeSourceLang, pageLocale, utcDay } from './language';
import type { PageLocale, SourceLang } from './language';
import { isAllowedOrigin } from './origins';

export const MAX_BODY_LENGTH = 2000;
export const MAX_NAME_LENGTH = 80;
export const RATE_LIMIT_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const REPORT_FLAG_THRESHOLD = 3;
export const NEURON_DAILY_LIMIT = 5000;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Abuse guard for NEW reactions, per IP per milestone room. Generous on
 * purpose: honest idempotency already caps a single visitor at one active
 * reaction, so this only bounds nonce rotation. Deleting and duplicate PUTs
 * never spend the allowance.
 */
export const REACTION_RATE_LIMIT_PER_HOUR = 30;
export const REACTION_NONCE_MIN_LENGTH = 16;
export const REACTION_NONCE_MAX_LENGTH = 128;

export const BUDGET_ROOM_NAME = '__budget__';
export const MODERATION_ROOM_NAME = '__moderation__';

export type CommentStatus = 'published' | 'pending' | 'flagged' | 'removed';
export type ModerationAction = 'approve' | 'remove';

export interface PublicComment {
  id: string;
  name: string | null;
  body: string;
  source_lang: SourceLang;
  translation: string | null;
  created_at: number;
  reports: number;
  parent_id: string | null;
  evidence_anchor: string | null;
}

export interface CommentListInput {
  page: string;
  limit: number;
  before: number | null;
}

export interface CommentListResult {
  comments: PublicComment[];
  presence: number;
  nextBefore: number | null;
}

export interface CreateCommentInput {
  page: string;
  name: string | null;
  body: string;
  /** Visitor-declared language: 'en' | 'es' | another ISO 639-1 code | anything. */
  lang: string;
  /** Transient: used for rate limiting, hashed before it touches storage. */
  ip: string;
  /** Optional parent comment id; must be a published top-level comment on the same page. */
  parentId?: string | null;
  /** Optional evidence anchor context (e.g. "evidence-2") preserved for display. */
  evidenceAnchor?: string | null;
}

export interface CreateCommentResult {
  status: 'published' | 'pending' | 'rejected';
  comment: PublicComment | null;
  /** Machine-readable explanation of the outcome (never shown raw to visitors). */
  reason: string;
}

export interface ReportResult {
  found: boolean;
  reports: number;
  status: CommentStatus | null;
}

export interface AdminActionResult {
  ok: boolean;
  status: CommentStatus | null;
}

export interface ModerationEntry {
  id: string;
  page: string;
  name: string | null;
  body: string;
  source_lang: SourceLang;
  status: CommentStatus;
  created_at: number;
  parent_id: string | null;
  evidence_anchor: string | null;
}

export interface BudgetState {
  day: string;
  neurons: number;
  paused: boolean;
  limit: number;
}

/** Public, aggregate-only reaction state for one milestone. */
export interface ReactionState {
  /** How many anonymous visitors currently hold an active reaction. */
  count: number;
  /** Whether the caller's anonymous nonce holds an active reaction. */
  reacted: boolean;
}

export interface ReactionResult extends ReactionState {
  /** True when the abuse guard refused a NEW reaction; the state is unchanged. */
  rateLimited: boolean;
}

export interface ReactionInput {
  milestone: string;
  /** Opaque, client-generated, hashed before it touches storage. */
  nonce: string;
  /** Transient: used for the abuse guard, hashed before it touches storage. */
  ip: string;
}

interface CommentRow {
  id: string;
  page: string;
  name: string | null;
  body: string;
  source_lang: string;
  status: string;
  created_at: number;
  translation: string | null;
  reports: number;
  parent_id: string | null;
  evidence_anchor: string | null;
}

function toPublicComment(row: CommentRow): PublicComment {
  return {
    id: row.id,
    name: row.name ?? null,
    body: row.body,
    source_lang: row.source_lang as SourceLang,
    translation: row.translation ?? null,
    created_at: row.created_at,
    reports: row.reports ?? 0,
    parent_id: row.parent_id ?? null,
    evidence_anchor: row.evidence_anchor ?? null,
  };
}

/** A minimal JSON error response for the WebSocket upgrade handler. */
function wsError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Fallback page extraction for the upgrade handler when `ctx.id.name` is not
 * available: the Worker forwards `/api/comments/:page/ws` unchanged.
 */
function pageFromUrl(rawUrl: string): string {
  try {
    const { pathname } = new URL(rawUrl);
    const rest = pathname.slice('/api/comments/'.length);
    return normalizePage(decodeURIComponent(rest.split('/')[0] ?? '')) ?? '';
  } catch {
    return '';
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CommentsRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  /**
   * Serializes reaction mutations inside this room. A Durable Object is
   * single-threaded, but every `await` on storage yields the instance, so two
   * concurrent PUTs for the same nonce could both observe "no reaction" before
   * either spends its allowance. Chaining the whole read-check-spend-insert
   * sequence on one promise makes the duplicate check and the quota spend
   * atomic for a nonce: a duplicate never spends quota and never double-counts.
   * The room is single-instance per milestone, so this serializes exactly the
   * callers that must not interleave.
   */
  private reactionChain: Promise<unknown> = Promise.resolve();

  /**
   * The per-room secret, cached as a promise so two concurrent first-time
   * callers cannot mint two different salts for one room. A split salt would
   * hash one nonce into two different rows and could double-count it; caching
   * the in-flight load keeps a single salt for the room's lifetime.
   */
  private rateSaltPromise: Promise<string> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Idempotent: the constructor re-runs on every wake, so this must stay cheap.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS comments (
         id             TEXT PRIMARY KEY,
         page           TEXT NOT NULL,
         name           TEXT,
         body           TEXT NOT NULL,
         source_lang    TEXT NOT NULL,
         status         TEXT NOT NULL,
         created_at     INTEGER NOT NULL,
         translation    TEXT,
         reports        INTEGER DEFAULT 0,
         last_report_at INTEGER,
         parent_id      TEXT,
         evidence_anchor TEXT
       )`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_comments_page_status
         ON comments(page, status, created_at DESC)`,
    );
    // Idempotent migration for deployed DOs that already have the original
    // table. `PRAGMA table_info` is portable across SQLite versions, unlike
    // `ADD COLUMN IF NOT EXISTS` which older builds reject.
    const columns = this.sql.exec<{ name: string }>(`PRAGMA table_info(comments)`).toArray();
    const hasColumn = (name: string) => columns.some((col) => col.name === name);
    if (!hasColumn('parent_id')) {
      this.sql.exec(`ALTER TABLE comments ADD COLUMN parent_id TEXT`);
    }
    if (!hasColumn('evidence_anchor')) {
      this.sql.exec(`ALTER TABLE comments ADD COLUMN evidence_anchor TEXT`);
    }
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_comments_page_parent_status
         ON comments(page, parent_id, status, created_at DESC)`,
    );
    // Reactions share the per-room SQLite pattern but live in their own table,
    // in their own `reactions:<milestone>` room, so they can never touch the
    // comments or moderation rows and can never be addressed by a page id.
    // The reaction table is brand new in this feature (no deployed room
    // predates it), so `CREATE TABLE IF NOT EXISTS` is the idempotent,
    // non-destructive migration for a fresh room. The nonce is stored ONLY as a
    // salted hash; the row count is the public count.
    //
    // The table is intentionally room-scoped: the room name
    // (`reactions:<milestone>`) is the milestone identity, so no `milestone`
    // column is stored. The public count is `SELECT COUNT(*)` with no filter,
    // and the column carried no query value.
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS reactions (
         nonce_hash TEXT PRIMARY KEY,
         created_at INTEGER NOT NULL
       )`,
    );
  }

  // --- Realtime: WebSocket upgrade, presence, fan-out (spec 7) ---------------

  /**
   * WebSocket upgrade handler. The Worker forwards `/api/comments/:page/ws`
   * here unchanged and this method answers the 101.
   *
   * Browsers do NOT apply CORS to WebSockets, so the server must validate the
   * Origin itself: only the two real site origins may open a socket, and a
   * missing Origin (a non-browser client) is rejected too — the comment UI is
   * the only intended caller. `*` is never accepted.
   */
  async fetch(request: Request): Promise<Response> {
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return wsError('origin_not_allowed', 403);
    }
    if ((request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket') {
      return wsError('upgrade_required', 426);
    }

    const page = this.pageFromId() ?? pageFromUrl(request.url);
    const pair = new WebSocketPair();
    const client = pair[0];
    // The server end is the hibernatable one: it carries the attachment.
    const server = pair[1] as HibernatableWebSocket;

    // Hibernation API: the DO may be evicted while the socket stays open, so
    // every per-connection fact lives in the attachment, never in a field.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ page, joinedAt: Date.now() });

    // One presence event per open (spec 7), sent to everyone including the
    // socket that just arrived.
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Server -> client only: comments arrive through the REST API. The single
   * exception is the TEST-ONLY attachment probe (`ENVIRONMENT === 'test'`),
   * which lets the harness prove `serializeAttachment`/`deserializeAttachment`
   * round-trips through the hibernation API — `wrangler dev` exposes no way to
   * force a DO eviction, so that is the strongest assertion available locally
   * (see f-b-report.md). Production ignores every client message.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (this.env.ENVIRONMENT !== 'test' || typeof message !== 'string') return;
    try {
      const parsed: unknown = JSON.parse(message);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        (parsed as { type?: unknown }).type === '__attachment__'
      ) {
        ws.send(
          JSON.stringify({
            type: '__attachment__',
            attachment: (ws as HibernatableWebSocket).deserializeAttachment() ?? null,
            presence: this.presence(),
          }),
        );
      }
    } catch {
      /* a malformed client message is ignored, never fatal */
    }
  }

  /** One presence event per close (spec 7), to the remaining viewers. */
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      // Complete the close handshake the client started.
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.broadcastPresence(ws);
  }

  /** The DO instance id is `comments:<page>`; that is where the page comes from. */
  private pageFromId(): string | null {
    const name = this.ctx.id?.name;
    if (typeof name === 'string' && name.startsWith('comments:')) {
      return name.slice('comments:'.length);
    }
    return null;
  }

  /**
   * Send one frame to every open socket of this room. A dead socket is skipped
   * so one broken connection can never break the fan-out to the live ones.
   */
  private broadcast(frame: unknown): void {
    const payload = JSON.stringify(frame);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        /* the socket is gone; presence will be recomputed on its close */
      }
    }
  }

  /**
   * Presence events `{type:'presence', count}`. `count` is the number of open
   * sockets, excluding `exclude` when the caller is closing. This is
   * best-effort by design: the UI labels it `~N`.
   */
  private broadcastPresence(exclude?: WebSocket): void {
    const sockets = this.ctx.getWebSockets();
    const recipients = exclude ? sockets.filter((socket) => socket !== exclude) : sockets;
    const payload = JSON.stringify({ type: 'presence', count: recipients.length });
    for (const socket of recipients) {
      try {
        socket.send(payload);
      } catch {
        /* ignore: a dead socket must not break the fan-out */
      }
    }
  }

  // --- Page room: reads ------------------------------------------------------

  async list(input: CommentListInput): Promise<CommentListResult> {
    const limit = Math.min(Math.max(Math.trunc(input.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const before = typeof input.before === 'number' ? input.before : null;
    const rows = before
      ? this.sql
          .exec<CommentRow>(
            `SELECT id, page, name, body, source_lang, status, created_at, translation, reports,
                    parent_id, evidence_anchor
               FROM comments
              WHERE page = ? AND status = 'published' AND created_at < ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?`,
            input.page,
            before,
            limit + 1,
          )
          .toArray()
      : this.sql
          .exec<CommentRow>(
            `SELECT id, page, name, body, source_lang, status, created_at, translation, reports,
                    parent_id, evidence_anchor
               FROM comments
              WHERE page = ? AND status = 'published'
              ORDER BY created_at DESC, id DESC
              LIMIT ?`,
            input.page,
            limit + 1,
          )
          .toArray();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      comments: page.map(toPublicComment),
      presence: this.presence(),
      nextBefore: hasMore && page.length > 0 ? page[page.length - 1]!.created_at : null,
    };
  }

  /** Presence = open WebSockets in this room (spec 7). Best-effort by design. */
  presence(): number {
    return this.ctx.getWebSockets().length;
  }

  // --- Page room: writes -----------------------------------------------------

  async create(input: CreateCommentInput): Promise<CreateCommentResult> {
    const body = (input.body ?? '').trim();
    if (body.length === 0 || body.length > MAX_BODY_LENGTH) {
      return { status: 'pending', comment: null, reason: 'invalid_body' };
    }
    const rawName = (input.name ?? '').trim();
    const name = rawName.length > 0 ? rawName.slice(0, MAX_NAME_LENGTH) : null;

    // Parent validation: reject before spending quota on replies that cannot be
    // published. A parent must exist on this page, be published, and be a root.
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = this.sql
        .exec<{ page: string; status: string; parent_id: string | null }>(
          `SELECT page, status, parent_id FROM comments WHERE id = ?`,
          input.parentId,
        )
        .toArray()[0];
      if (!parent) {
        // Distinguish a parent that lives on another page from one that never
        // existed. The shared moderation index stores every comment id -> page.
        const parentPage = await this.moderationStub().pageOf(input.parentId);
        return {
          status: 'rejected',
          comment: null,
          reason: parentPage ? 'cross_page_parent' : 'invalid_parent',
        };
      }
      if (parent.page !== input.page) {
        return { status: 'rejected', comment: null, reason: 'cross_page_parent' };
      }
      if (parent.status !== 'published') {
        return { status: 'rejected', comment: null, reason: 'parent_removed' };
      }
      if (parent.parent_id) {
        return { status: 'rejected', comment: null, reason: 'too_deep' };
      }
      parentId = input.parentId;
    }

    const rawEvidenceAnchor = (input.evidenceAnchor ?? '').trim();
    const evidenceAnchor =
      rawEvidenceAnchor.length > 0 && rawEvidenceAnchor.length <= 80 ? rawEvidenceAnchor : null;

    // Turnstile and honeypot already passed in the Worker; the rate limit is
    // the first stateful gate, so only verified attempts consume quota.
    if (!(await this.consumeRateAllowance(input.ip))) {
      return { status: 'pending', comment: null, reason: 'rate_limited' };
    }

    const locale: PageLocale = pageLocale(input.page);
    const { stored: sourceLang, translateFrom } = normalizeSourceLang(input.lang);
    const needsTranslation = sourceLang !== locale;

    const budget = await this.budgetState();
    let translation: string | null = null;
    let translationFailed = false;
    let translationPaused = false;

    if (needsTranslation) {
      if (budget.paused) {
        translationPaused = true;
      } else {
        try {
          translation = await translate(this.env, body, translateFrom, locale);
          await this.spendNeurons(NEURONS_PER_TRANSLATION);
        } catch {
          translation = null;
          translationFailed = true;
        }
      }
    }

    // Gate A — always runs. A throw (model error, unparseable verdict) is a
    // failed gate, not a pass.
    let verdictA: Verdict | null = null;
    try {
      verdictA = await moderate(this.env, body);
      await this.spendNeurons(NEURONS_PER_GUARD);
    } catch {
      verdictA = null;
    }

    // Gate B — the English/page-locale translation, when one exists. Its
    // absence for a cross-locale comment is itself a reason to queue.
    let verdictB: Verdict | null = null;
    if (needsTranslation && translation) {
      try {
        verdictB = await moderate(this.env, translation);
        await this.spendNeurons(NEURONS_PER_GUARD);
      } catch {
        verdictB = null;
      }
    }

    let status: CommentStatus;
    let reason: string;
    if (!verdictA) {
      status = 'pending';
      reason = 'moderation_unavailable';
    } else if (!verdictA.safe) {
      status = 'pending';
      reason = 'unsafe';
    } else if (needsTranslation && !verdictB) {
      status = 'pending';
      reason = translationFailed
        ? 'translation_failed'
        : translationPaused
          ? 'translation_paused'
          : 'moderation_unavailable';
    } else if (needsTranslation && verdictB && !verdictB.safe) {
      status = 'pending';
      reason = 'unsafe_translation';
    } else {
      status = 'published';
      reason = 'safe';
    }

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    this.sql.exec(
      `INSERT INTO comments
         (id, page, name, body, source_lang, status, created_at, translation, reports,
          last_report_at, parent_id, evidence_anchor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      id,
      input.page,
      name,
      body,
      sourceLang,
      status,
      createdAt,
      translation,
      parentId,
      evidenceAnchor,
    );

    const comment: PublicComment = {
      id,
      name,
      body,
      source_lang: sourceLang,
      translation,
      created_at: createdAt,
      reports: 0,
      parent_id: parentId,
      evidence_anchor: evidenceAnchor,
    };

    await this.registerInModeration({
      id,
      page: input.page,
      name,
      body,
      source_lang: sourceLang,
      status,
      created_at: createdAt,
      parent_id: parentId,
      evidence_anchor: evidenceAnchor,
    });

    // Broadcast on publish (spec 7): one batched frame carrying the comment and
    // the current presence, so a viewer gets both facts in a single message.
    // Replies use a deterministic `reply` type so clients can thread them.
    if (status === 'published') {
      const frameType = parentId ? 'reply' : 'comment';
      this.broadcast({ type: frameType, comment, presence: this.presence() });
    }

    return { status: status === 'published' ? 'published' : 'pending', comment, reason };
  }

  async report(id: string): Promise<ReportResult> {
    const row = this.sql.exec<CommentRow>(`SELECT * FROM comments WHERE id = ?`, id).toArray()[0];
    if (!row || row.status === 'removed') return { found: false, reports: 0, status: null };
    const reports = (row.reports ?? 0) + 1;
    const status: CommentStatus =
      reports >= REPORT_FLAG_THRESHOLD ? 'flagged' : (row.status as CommentStatus);
    this.sql.exec(
      `UPDATE comments SET reports = ?, last_report_at = ?, status = ? WHERE id = ?`,
      reports,
      Date.now(),
      status,
      id,
    );
    if (status === 'flagged') {
      await this.registerInModeration({
        id,
        page: row.page,
        name: row.name ?? null,
        body: row.body,
        source_lang: row.source_lang as SourceLang,
        status,
        created_at: row.created_at,
        parent_id: row.parent_id ?? null,
        evidence_anchor: row.evidence_anchor ?? null,
      });
    }
    return { found: true, reports, status };
  }

  /** Admin-mediated approve/remove (spec 5: GDPR delete has no self-service path). */
  async adminAct(id: string, action: ModerationAction): Promise<AdminActionResult> {
    const row = this.sql.exec<CommentRow>(`SELECT * FROM comments WHERE id = ?`, id).toArray()[0];
    if (!row) return { ok: false, status: null };
    const status: CommentStatus = action === 'approve' ? 'published' : 'removed';
    this.sql.exec(`UPDATE comments SET status = ? WHERE id = ?`, status, id);
    // `approve` runs the publish path (spec 5), so it broadcasts like any publish.
    if (status === 'published') {
      const comment = toPublicComment(row);
      const frameType = comment.parent_id ? 'reply' : 'comment';
      this.broadcast({ type: frameType, comment, presence: this.presence() });
    }
    return { ok: true, status };
  }

  // --- Milestone reactions (role: reactions:<milestone>) ---------------------

  /**
   * Public aggregate state for the milestone plus whether the caller's nonce
   * already holds a reaction. The nonce is hashed with the per-room secret
   * before it is looked up, so the stored value can never be replayed and the
   * nonce itself is never compared or returned.
   */
  async reactionState(input: { milestone: string; nonce: string | null }): Promise<ReactionState> {
    const count = this.reactionCount();
    if (!input.nonce) return { count, reacted: false };
    const hash = await this.reactionHash(input.nonce);
    return { count, reacted: this.hasReaction(hash) };
  }

  /**
   * Idempotent add. A nonce that already reacted is a no-op: no increment and
   * no quota spent. Only a NEW reaction consumes the abuse allowance.
   *
   * The whole read-check-spend-insert sequence runs inside the room's reaction
   * lock, so a duplicate PUT cannot slip past the initial check while the first
   * PUT is awaiting the allowance store and spend a second allowance. Inside the
   * lock there is no interleaving, so the duplicate check and the quota spend
   * are atomic for a nonce and the count can never double.
   */
  async react(input: ReactionInput): Promise<ReactionResult> {
    return this.withReactionLock(async () => {
      const hash = await this.reactionHash(input.nonce);
      if (this.hasReaction(hash)) {
        return { count: this.reactionCount(), reacted: true, rateLimited: false };
      }

      if (!(await this.consumeReactionAllowance(input.ip))) {
        return {
          count: this.reactionCount(),
          reacted: this.hasReaction(hash),
          rateLimited: true,
        };
      }

      // No await below: the DO completes this synchronously, so a duplicate
      // that somehow reached here cannot double-count.
      if (!this.hasReaction(hash)) {
        this.sql.exec(
          `INSERT OR IGNORE INTO reactions (nonce_hash, created_at) VALUES (?, ?)`,
          hash,
          Date.now(),
        );
      }
      return { count: this.reactionCount(), reacted: true, rateLimited: false };
    });
  }

  /** Idempotent remove: deleting an absent reaction is a successful no-op. */
  async unreact(input: { nonce: string }): Promise<ReactionResult> {
    return this.withReactionLock(async () => {
      const hash = await this.reactionHash(input.nonce);
      if (this.hasReaction(hash)) {
        this.sql.exec(`DELETE FROM reactions WHERE nonce_hash = ?`, hash);
      }
      return { count: this.reactionCount(), reacted: false, rateLimited: false };
    });
  }

  // --- Global moderation index (role: __moderation__) ------------------------

  /**
   * Index every comment by id (so the admin API can route it and the GDPR
   * delete can find a published one) and queue only the ones a human must see.
   */
  async register(entry: ModerationEntry): Promise<void> {
    await this.ctx.storage.put(`index:${entry.id}`, entry.page);
    if (entry.status === 'pending' || entry.status === 'flagged') {
      await this.ctx.storage.put(`queue:${entry.id}`, entry);
    } else {
      await this.ctx.storage.delete(`queue:${entry.id}`);
    }
  }

  async queue(): Promise<ModerationEntry[]> {
    const entries = await this.ctx.storage.list<ModerationEntry>({ prefix: 'queue:' });
    return [...entries.values()].sort((a, b) => a.created_at - b.created_at);
  }

  async pageOf(id: string): Promise<string | null> {
    return (await this.ctx.storage.get<string>(`index:${id}`)) ?? null;
  }

  async dequeue(id: string): Promise<void> {
    await this.ctx.storage.delete(`queue:${id}`);
  }

  // --- Global neuron budget (role: __budget__) -------------------------------

  async budget(): Promise<BudgetState> {
    const day = utcDay(Date.now());
    const neurons = (await this.ctx.storage.get<number>(`neurons:${day}`)) ?? 0;
    return { day, neurons, paused: neurons >= NEURON_DAILY_LIMIT, limit: NEURON_DAILY_LIMIT };
  }

  async consumeNeurons(amount: number): Promise<number> {
    const day = utcDay(Date.now());
    const key = `neurons:${day}`;
    const total = ((await this.ctx.storage.get<number>(key)) ?? 0) + Math.max(0, amount);
    await this.ctx.storage.put(key, total);
    // Only today's counter is meaningful; drop yesterday's so the key never grows.
    await this.ctx.storage.delete(`neurons:${utcDay(Date.now() - 24 * 60 * 60 * 1000)}`);
    return total;
  }

  // --- Internal helpers ------------------------------------------------------

  private budgetStub(): CommentsRoom {
    return this.env.COMMENTS.get<CommentsRoom>(this.env.COMMENTS.idFromName(BUDGET_ROOM_NAME));
  }

  private moderationStub(): CommentsRoom {
    return this.env.COMMENTS.get<CommentsRoom>(
      this.env.COMMENTS.idFromName(MODERATION_ROOM_NAME),
    );
  }

  /**
   * Index/queue the comment in the shared `__moderation__` room. A page room
   * cannot answer a cross-page admin queue on its own, so this call is the one
   * place the comment becomes visible to human review. It is deliberately NOT
   * swallowed: if the index write fails the caller surfaces an error rather
   * than leaving a pending comment silently unreviewable.
   */
  private async registerInModeration(entry: ModerationEntry): Promise<void> {
    await this.moderationStub().register(entry);
  }

  /**
   * An unknown budget is treated as exhausted: if the shared counter cannot be
   * read, auto-translation is skipped rather than spending unbudgeted neurons.
   * Moderation still runs (safety is never traded for cost).
   */
  private async budgetState(): Promise<BudgetState> {
    try {
      return await this.budgetStub().budget();
    } catch {
      return { day: utcDay(Date.now()), neurons: 0, paused: true, limit: NEURON_DAILY_LIMIT };
    }
  }

  private async spendNeurons(amount: number): Promise<void> {
    try {
      await this.budgetStub().consumeNeurons(amount);
    } catch {
      // The guardrail counter is best-effort; never fail a comment over it.
    }
  }

  /**
   * Rate limit 5/hour per IP per page (spec 5/8). The IP itself is never
   * persisted: it is salted with a random per-room secret and hashed, and only
   * the hash is stored, bounded to the current window's timestamps.
   */
  private async consumeRateAllowance(ip: string): Promise<boolean> {
    const salt = await this.rateSalt();
    const key = `rl:${await sha256Hex(`${salt}|${ip}`)}`;
    const now = Date.now();
    const previous = (await this.ctx.storage.get<number[]>(key)) ?? [];
    const recent = previous.filter((t) => typeof t === 'number' && now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_PER_HOUR) {
      await this.ctx.storage.put(key, recent);
      return false;
    }
    recent.push(now);
    await this.ctx.storage.put(key, recent);
    return true;
  }

  /**
   * The per-room secret, loaded once and cached as a promise. Caching the
   * in-flight load (not just the value) is what makes it race-free: two
   * concurrent callers share one `storage.get`/`put` pair instead of each
   * minting a salt, which would split one nonce across two hashes.
   */
  private rateSalt(): Promise<string> {
    if (!this.rateSaltPromise) {
      this.rateSaltPromise = this.loadOrCreateRateSalt();
      // Never cache a rejected load: the next caller must retry storage.
      this.rateSaltPromise.catch(() => {
        this.rateSaltPromise = null;
      });
    }
    return this.rateSaltPromise;
  }

  private async loadOrCreateRateSalt(): Promise<string> {
    const existing = await this.ctx.storage.get<string>('rl-salt');
    if (existing) return existing;
    const salt = crypto.randomUUID();
    await this.ctx.storage.put('rl-salt', salt);
    return salt;
  }

  /**
   * Run a reaction mutation on the room's serial chain. The chain is stored on
   * the instance (one instance per milestone), so concurrent requests interleave
   * only between whole operations, never inside the read-check-spend-insert
   * sequence. Both branches are chained so one failed call cannot stall the
   * next.
   */
  private withReactionLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.reactionChain.then(operation, operation);
    this.reactionChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // --- Reaction internals ----------------------------------------------------

  /** The public count is the number of active (nonce-hashed) rows in the room. */
  private reactionCount(): number {
    return this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM reactions`).one().n;
  }

  private hasReaction(hash: string): boolean {
    return (
      this.sql.exec(`SELECT 1 FROM reactions WHERE nonce_hash = ? LIMIT 1`, hash).toArray().length >
      0
    );
  }

  /**
   * Salt + hash the anonymous nonce with the per-room secret. The same secret
   * already salts the rate-limit keys; only hashes are ever stored, compared or
   * returned, and the nonce never appears in a response or a log line.
   */
  private async reactionHash(nonce: string): Promise<string> {
    const salt = await this.rateSalt();
    return sha256Hex(`${salt}|reaction|${nonce}`);
  }

  /**
   * Abuse guard, per IP per milestone, spent only for a NEW reaction. Same
   * shape as the comment limiter: the IP is salted and hashed and never
   * persisted, and only timestamps inside the current hour are kept.
   */
  private async consumeReactionAllowance(ip: string): Promise<boolean> {
    const salt = await this.rateSalt();
    const key = `rlr:${await sha256Hex(`${salt}|${ip}`)}`;
    const now = Date.now();
    const previous = (await this.ctx.storage.get<number[]>(key)) ?? [];
    const recent = previous.filter((t) => typeof t === 'number' && now - t < RATE_WINDOW_MS);
    if (recent.length >= REACTION_RATE_LIMIT_PER_HOUR) {
      await this.ctx.storage.put(key, recent);
      return false;
    }
    recent.push(now);
    await this.ctx.storage.put(key, recent);
    return true;
  }
}
