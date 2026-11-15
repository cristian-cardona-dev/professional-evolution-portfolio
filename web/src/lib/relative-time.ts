/**
 * Relative time and freshness bucketing — shared by the activity feed, the
 * `/build/` notes and the footer (plan phase 4.2/4.3 and 9.5).
 *
 * Everything here runs at build time from component frontmatter: the values are
 * the snapshot's own timestamps, so the page states how old its data is without
 * the browser ever calling GitHub (or any clock-driven API).
 *
 * The bucket word always accompanies the colour, so colour is never the only
 * signal carrying the meaning.
 */
import type { Locale } from '../i18n/copy';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How old the data is: <24h fresh, 1–7d aging, >7d stale. */
export type Freshness = 'fresh' | 'aging' | 'stale';

/** `en` / `es` → the BCP-47 tag `Intl.RelativeTimeFormat` expects. */
function bcp47(locale: Locale): string {
  return locale === 'es' ? 'es' : 'en';
}

/**
 * "2 days ago" / "hace 2 días". Returns the raw value when the timestamp is
 * unparseable — never invents a relative phrase for garbage input.
 */
export function formatRelativeTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const rtf = new Intl.RelativeTimeFormat(bcp47(locale), { numeric: 'auto' });
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs >= DAY) return rtf.format(Math.round(diff / DAY), 'day');
  if (abs >= HOUR) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs >= MINUTE) return rtf.format(Math.round(diff / MINUTE), 'minute');
  return rtf.format(0, 'minute');
}

/**
 * Bucket a timestamp by age. `now` is injectable so tests are deterministic;
 * an unparseable value is reported as `stale` rather than silently fresh.
 */
export function freshnessBucket(value: string, now: number = Date.now()): Freshness {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'stale';
  const age = now - date.getTime();
  if (age < DAY) return 'fresh';
  if (age <= 7 * DAY) return 'aging';
  return 'stale';
}
