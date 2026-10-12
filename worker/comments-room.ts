/**
 * The comment Durable Object (spec 4, 5, 6).
 *
 * One class, three roles, selected by the DO instance name:
 *
 *   - `comments:<page>`      — the per-page room: SQLite `comments` table,
 *                              transient rate-limit keys, presence, report
 *                              counting and the moderation/translation pipeline.
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
 * open WebSockets in this room (`ctx.getWebSockets()`), which is 0 in F-A
 * because the realtime socket is F-B.
 *
 * Fail-closed moderation: every branch that cannot prove a comment safe
 * (model error, unparseable verdict, disagreeing gates, missing translation
 * for a cross-locale or unmapped-language comment) writes `pending`.
 *
 * No `setTimeout` / `setInterval` anywhere: timers block hibernation and
 * accrue duration charges (spec 7). Nothing here needs one.
 */
import { DurableObject } from 'cloudflare:workers';
import { moderate, translate, NEURONS_PER_GUARD, NEURONS_PER_TRANSLATION } from './ai';
import type { Verdict } from './ai';
import { normalizeSourceLang, pageLocale, utcDay } from './language';
import type { PageLocale, SourceLang } from './language';

export const MAX_BODY_LENGTH = 2000;
export const MAX_NAME_LENGTH = 80;
export const RATE_LIMIT_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const REPORT_FLAG_THRESHOLD = 3;
export const NEURON_DAILY_LIMIT = 5000;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

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
}

export interface CreateCommentResult {
  status: 'published' | 'pending';
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
}

export interface BudgetState {
  day: string;
  neurons: number;
  paused: boolean;
  limit: number;
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
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CommentsRoom extends DurableObject<Env> {
  private readonly sql: SqlStorage;

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
         last_report_at INTEGER
       )`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_comments_page_status
         ON comments(page, status, created_at DESC)`,
    );
  }

  // --- Page room: reads ------------------------------------------------------

  async list(input: CommentListInput): Promise<CommentListResult> {
    const limit = Math.min(Math.max(Math.trunc(input.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const before = typeof input.before === 'number' ? input.before : null;
    const rows = before
      ? this.sql
          .exec<CommentRow>(
            `SELECT id, page, name, body, source_lang, status, created_at, translation, reports
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
            `SELECT id, page, name, body, source_lang, status, created_at, translation, reports
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

  /** Presence = open WebSockets in this room. Always 0 until F-B. */
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
         (id, page, name, body, source_lang, status, created_at, translation, reports, last_report_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      id,
      input.page,
      name,
      body,
      sourceLang,
      status,
      createdAt,
      translation,
    );

    const comment: PublicComment = {
      id,
      name,
      body,
      source_lang: sourceLang,
      translation,
      created_at: createdAt,
      reports: 0,
    };

    await this.registerInModeration({
      id,
      page: input.page,
      name,
      body,
      source_lang: sourceLang,
      status,
      created_at: createdAt,
    });

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
    return { ok: true, status };
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

  private async rateSalt(): Promise<string> {
    const existing = await this.ctx.storage.get<string>('rl-salt');
    if (existing) return existing;
    const salt = crypto.randomUUID();
    await this.ctx.storage.put('rl-salt', salt);
    return salt;
  }
}
