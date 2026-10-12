/**
 * Shared page list + navigation helper for the real-browser UI gate.
 *
 * Paths are RELATIVE to the configured `baseURL`, which already contains the
 * GitHub Pages base path (`/professional-evolution-portfolio/`). They must not
 * start with `/`: `page.goto('/work/')` resolves against the origin and drops
 * the base path, landing on the Astro 404 page. That mistake made the first
 * baseline run produce six identical 404 screenshots, so `gotoPage` now asserts
 * a 200 response — the gate can never pass against the wrong page again.
 */
export const PAGES = [
  ['home', './'],
  ['work', 'work/'],
  ['career', 'career/'],
  ['evolution', 'evolution/'],
  ['build', 'build/'],
  ['es', 'es/'],
];

/**
 * Extra pages scanned by axe only, NOT by the screenshot baselines.
 *
 * The two static resume pages are plain HTML served straight out of
 * `web/public/` at the base path (`resume-en.html`, `resume-es.html`); they
 * are not Astro routes and carry their own hardcoded palette. Auditing them
 * for accessibility is worthwhile, but adding them to `PAGES` would also force
 * two new screenshot baselines that would churn on every resume content edit,
 * so they live in this separate list instead.
 */
export const AXE_PAGES = [
  ...PAGES,
  ['resume-en', 'resume-en.html'],
  ['resume-es', 'resume-es.html'],
];

export async function gotoPage(page, path) {
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  if (!response || !response.ok()) {
    const status = response ? response.status() : 'no response';
    throw new Error(`Expected HTTP 200 for "${path}", got ${status} at ${page.url()}`);
  }
  return response;
}
