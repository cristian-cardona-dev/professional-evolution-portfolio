/**
 * Base- and locale-aware link helpers.
 *
 * The site deploys under a GitHub Pages project base path, so no internal
 * href may start with a bare `/`: every route is prefixed with
 * `import.meta.env.BASE_URL`. The Spanish routes live under `<base>es/`, so
 * every route also needs the root of the locale rendering the link — that is
 * what keeps the header, the cards and the timeline correct from any page in
 * either language.
 *
 * Section anchors (#projects, #contact, …) are a separate case: on the locale
 * home they stay plain relative fragments, and from any other page they point
 * at that section of the matching language's home.
 */
import type { Locale } from '../i18n/copy';

const BASE: string = import.meta.env.BASE_URL;

/**
 * The public suggestion issue form of the source repository. It is a constant,
 * not copy: the target never changes with the locale, and both the suggestions
 * panel and the contextual case-study CTA point at the same place.
 */
export const SUGGESTION_ISSUE_URL =
  'https://github.com/cristian-cardona-dev/professional-evolution-portfolio/issues/new?template=suggestion.yml';

/** Root of a locale under the deployment base: `/base/` for `en`, `/base/es/` for `es`. */
export function localeRoot(locale: Locale): string {
  return locale === 'es' ? `${BASE}es/` : BASE;
}

/** Absolute, base-aware href for a route inside a locale, e.g. `route('es', 'work/')`. */
export function route(locale: Locale, path = ''): string {
  return `${localeRoot(locale)}${path}`;
}

/**
 * Href for a section of the locale home.
 *
 * `pathname` is `Astro.url.pathname` (which carries the base path during the
 * build): on the home page itself the plain `#section` fragment is returned so
 * the anchor stays relative, otherwise the absolute home URL with the fragment
 * so the link still works from every other page.
 */
export function sectionHref(locale: Locale, id: string, pathname: string): string {
  const root = localeRoot(locale);
  return pathname === root ? `#${id}` : `${root}#${id}`;
}

/**
 * Absolute CANONICAL URL for a route in a locale, or `undefined` when no
 * canonical base is configured (no fabricated origin).
 *
 * `PUBLIC_CANONICAL_BASE` is the GitHub Pages project URL (including the base
 * path) that `BaseLayout` publishes in `<link rel="canonical">`, `og:url` and
 * the `hreflang` alternates — the same source, so a caller that shares or
 * copies a page link (the share row's intent anchors) can never advertise a
 * different host than the one the page itself advertises. In particular the
 * Cloudflare Workers mirror builds with a serving origin of its own and must
 * still share Pages URLs; this helper is what makes that the default.
 *
 * `site` is the optional fallback (`Astro.site`, the serving origin): used
 * only by `BaseLayout` when the variable is absent, matching its historic
 * behaviour. Components that render share links simply pass nothing and get
 * an honest `undefined` instead of a possibly-wrong origin.
 */
export function canonicalUrl(locale: Locale, path: string, site?: string | URL): URL | undefined {
  const base: string | undefined = import.meta.env.PUBLIC_CANONICAL_BASE;
  if (base) {
    const localePrefix = locale === 'es' ? 'es/' : '';
    return new URL(`${localePrefix}${path}`, base);
  }
  return site ? new URL(route(locale, path), site) : undefined;
}

/**
 * Locale implied by a built pathname (`Astro.url.pathname`).
 *
 * Used by components that render on every route but do not receive the
 * `locale` prop (the footer), so they can still link to the matching-language
 * route without a second source of truth. Spanish routes live under `<base>es/`
 * (see `localeRoot`), so the `es` segment is the only signal needed; anything
 * else is English.
 */
export function localeFromPathname(pathname: string): Locale {
  return pathname.includes('/es/') ? 'es' : 'en';
}
