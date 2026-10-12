/**
 * Pure language helpers — no Worker runtime imports, so this module is
 * importable by `node --test` (see `worker/tests/ai-gate.test.mjs`).
 */

export type SourceLang = 'en' | 'es' | 'other';

export type PageLocale = 'en' | 'es';

/**
 * The locale of a page path. The site publishes the English routes at the root
 * and the Spanish ones under `es/` (`/es/work/cloud-dashboard/`), which is the
 * same convention `comments.json` patterns and the DO ids use.
 */
export function pageLocale(page: string): PageLocale {
  return page === 'es' || page.startsWith('es/') ? 'es' : 'en';
}

/**
 * Normalize the visitor-declared comment language.
 *
 * `stored` is what the `source_lang` column accepts ('en' | 'es' | 'other',
 * per the spec's data model). `translateFrom` is the concrete ISO 639-1 code
 * handed to m2m100 — many-to-many, so a Spanish-only-looking column must not
 * throw away the real code when the visitor declares one (e.g. 'fr').
 *
 * An absent, malformed or unknown declaration resolves to `other` with no
 * source code: the comment is then double-gated through a best-effort
 * translation and, if that translation cannot be produced, it is queued
 * (`pending`) instead of auto-published. Never the other way round.
 */
export function normalizeSourceLang(lang: unknown): {
  stored: SourceLang;
  translateFrom: string | null;
} {
  const value = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
  if (value === 'en') return { stored: 'en', translateFrom: 'en' };
  if (value === 'es') return { stored: 'es', translateFrom: 'es' };
  if (/^[a-z]{2}$/.test(value)) return { stored: 'other', translateFrom: value };
  return { stored: 'other', translateFrom: null };
}

/** UTC day key (`YYYY-MM-DD`) for the per-day neuron budget. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Normalize a page path to the canonical form used as the DO id suffix. */
export function normalizePage(raw: string): string | null {
  const page = typeof raw === 'string' ? raw.trim() : '';
  if (page.length === 0 || page.length > 300) return null;
  if (page.includes('..') || page.includes('?') || page.includes('#')) return null;
  if (!/^[a-zA-Z0-9._/-]+$/.test(page)) return null;
  return page.endsWith('/') ? page : `${page}/`;
}
