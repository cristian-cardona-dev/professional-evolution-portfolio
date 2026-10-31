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
 * `locale` prop, so they can still link to the matching-language route
 * without a second source of truth. Spanish routes live under `<base>es/`
 * (see `localeRoot`), so the FIRST path segment after the deployment base is
 * the only signal needed; anything else is English.
 *
 * The check is segment-based, never a substring: `pathname.includes('/es/')`
 * would also match any future route that merely contains those letters in a
 * longer segment, and would miss a locale root served without its trailing
 * slash. The base is stripped first so an `es` segment deeper in the path can
 * never masquerade as the locale prefix.
 */
export function localeFromPathname(pathname: string): Locale {
  const base = BASE.endsWith('/') ? BASE : `${BASE}/`;
  const withoutBase = pathname.startsWith(base)
    ? pathname.slice(base.length)
    : pathname.replace(/^\/+/, '');
  const firstSegment = withoutBase.split('/')[0];
  return firstSegment === 'es' ? 'es' : 'en';
}

/**
 * Path of a page's per-route social card inside the deployment base, e.g.
 * `og/work-ai-chat-app-es.png` for `work/ai-chat-app/` in Spanish.
 *
 * The convention — the route path with its slashes turned into hyphens, plus
 * the locale suffix — is shared with the generator that draws the PNGs,
 * `scripts/generate-og-images.mjs`, which writes exactly these names into
 * `web/dist/og/`. Keep the two in sync: the generator fails the build when a
 * page advertises a card it did not draw.
 */
export function ogCardPath(locale: Locale, path: string): string {
  const stem = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '-');
  return `og/${stem}-${locale}.png`;
}
