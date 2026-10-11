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

export async function gotoPage(page, path) {
  const response = await page.goto(path, { waitUntil: 'networkidle' });
  if (!response || !response.ok()) {
    const status = response ? response.status() : 'no response';
    throw new Error(`Expected HTTP 200 for "${path}", got ${status} at ${page.url()}`);
  }
  return response;
}
