#!/usr/bin/env node
/**
 * sitemap-generate.mjs — emit `web/dist/sitemap.xml` from the built HTML files.
 *
 * Usage: runs as the `postbuild` step of `npm --prefix web run build`.
 *
 * Design:
 *   - The source of truth is the build output itself: every `index.html` under
 *     `web/dist` is a real route that Astro rendered, so the sitemap cannot
 *     list a page that does not exist, nor miss one that does. The two résumés
 *     are the one exception — they are static files in `web/public/`, served
 *     as-is, so `collectPages` cannot see them and they are listed explicitly
 *     (`EXTRA_ROUTES`). Both are real, linked from Career.
 *   - URLs are `site + base + route`, matching the canonical URLs BaseLayout
 *     emits. `SITE` and `BASE` below must stay in sync with
 *     `web/astro.config.mjs` (they are duplicated because a build script runs
 *     before any page and importing the Astro config would drag in the whole
 *     toolchain for two strings).
 *   - Every `<url>` carries the same three `xhtml:link` hreflang alternates the
 *     page heads carry (BaseLayout): `en`, `es` and `x-default` → the English
 *     URL, self-inclusive per the Google spec. An English route `X` pairs with
 *     `es/X`; the home pairs with `es/`; the two résumés pair with each other.
 *     All alternates point at the canonical Pages origin — never the Worker
 *     mirror.
 *   - Not-found routes are excluded: Astro emits `404.html` (served by GitHub
 *     Pages for any unresolved address) and a localized `es/404/` page, neither
 *     of which is a real destination. Any route containing `/404` or ending
 *     `404.html` is dropped.
 *   - Output is deterministic: routes are sorted by plain code-unit comparison
 *     (not `localeCompare`, whose result depends on the host ICU data), so the
 *     file is byte-identical on every machine and a test can assert the exact
 *     sequence. The file always ends with a newline.
 *
 * No dependencies. Exits non-zero if `web/dist` is missing (i.e. the build
 * did not run), so a broken wiring fails the build instead of silently
 * publishing no sitemap.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');

// Keep in sync with web/astro.config.mjs.
const SITE = 'https://cristian-cardona-dev.github.io';
const BASE = '/professional-evolution-portfolio/';

/** Root of the Spanish locale under the deployment base. */
const ES_ROOT = `${BASE}es/`;

/** Static, real, linked pages that are not `index.html` routes (see header). */
const EXTRA_ROUTES = [`${BASE}resume-en.html`, `${BASE}resume-es.html`];

/** Recursively collect every `index.html` under `dir` (a routed page). */
function collectPages(dir) {
  const pages = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // `_astro` holds hashed assets, not pages.
      if (entry.name.startsWith('_')) continue;
      pages.push(...collectPages(full));
    } else if (entry.name === 'index.html') {
      pages.push(full);
    }
  }
  return pages;
}

/** `dist/work/index.html` → `/professional-evolution-portfolio/work/`. */
function toRoute(file) {
  const dir = relative(DIST, dirname(file));
  const segments = dir === '' ? [] : dir.split(sep);
  return `${BASE}${segments.map(encodeURIComponent).join('/')}${segments.length > 0 ? '/' : ''}`;
}

/**
 * The EN/ES alternate pair of a route, as absolute canonical URLs.
 *
 * Pairing rule, matching the site's routing: an English path `X` pairs with
 * `es/X`; the home pairs with `es/`; the two résumés pair with each other.
 * `x-default` is always the English URL (BaseLayout does the same).
 */
function alternates(route) {
  const abs = (path) => `${SITE}${path}`;
  if (route === `${BASE}resume-en.html` || route === `${BASE}resume-es.html`) {
    return { en: abs(`${BASE}resume-en.html`), es: abs(`${BASE}resume-es.html`) };
  }
  if (route.startsWith(ES_ROOT)) {
    return { en: abs(`${BASE}${route.slice(ES_ROOT.length)}`), es: abs(route) };
  }
  return { en: abs(route), es: abs(`${ES_ROOT}${route.slice(BASE.length)}`) };
}

/**
 * Deterministic route order: plain code-unit comparison, not `localeCompare`,
 * so the output does not depend on the host's ICU/locale data. That is what
 * makes the résumés' position (between `print/` and `work/`) stable enough for
 * a test to assert.
 */
function byRoute(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const pages = collectPages(DIST);
if (pages.length === 0) {
  console.error(
    'sitemap:generate FAILED — no pages found in web/dist; run `astro build` first.',
  );
  process.exit(1);
}

const routes = [...new Set([...pages.map(toRoute), ...EXTRA_ROUTES])]
  .filter((route) => !route.includes('/404') && !route.endsWith('404.html'))
  .sort(byRoute);

const urlBlocks = routes.map((route) => {
  const { en, es } = alternates(route);
  return [
    '  <url>',
    `    <loc>${SITE}${route}</loc>`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${en}" />`,
    `    <xhtml:link rel="alternate" hreflang="es" href="${es}" />`,
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />`,
    '  </url>',
  ].join('\n');
});

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...urlBlocks,
  '</urlset>',
];

writeFileSync(join(DIST, 'sitemap.xml'), `${lines.join('\n')}\n`);
console.log(`sitemap:generate OK — ${routes.length} URLs written to web/dist/sitemap.xml`);
