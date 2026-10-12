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
 * Everything the site publishes should be audited for accessibility, but a
 * screenshot baseline is a *pixel* contract: it must not exist for a page whose
 * markup changes every time its content changes. So the pages below are routed
 * (or served) but deliberately kept out of `PAGES`, because each one churns
 * independently of the layout the baselines are guarding:
 *
 *   - the two static résumés (`resume-en.html`, `resume-es.html`) are plain HTML
 *     served straight out of `web/public/` at the base path — not Astro routes,
 *     with their own hardcoded palette, rewritten whenever the CV changes;
 *   - the three case-study detail pages and their Spanish twins
 *     (`work/<slug>/`, `es/work/<slug>/`) render bodies that come from the
 *     case-study data layer, so their pixels follow the content;
 *   - the Spanish subpages (`es/work/`, `es/career/`, `es/evolution/`,
 *     `es/evidence/`, `es/print/`) and the English print page (`print/`) were
 *     simply never listed: `PAGES` holds the English routes plus the Spanish
 *     home only, which left these routed pages with no axe coverage at all.
 *
 * Same relative-path convention as `PAGES` — no leading slash, or the scan
 * silently lands on the 404 page (see the note above).
 */
export const AXE_PAGES = [
  ...PAGES,
  ['work-ai-automation-workflow-lab', 'work/ai-automation-workflow-lab/'],
  ['work-ai-chat-app', 'work/ai-chat-app/'],
  ['work-cloud-dashboard', 'work/cloud-dashboard/'],
  ['es-work-ai-automation-workflow-lab', 'es/work/ai-automation-workflow-lab/'],
  ['es-work-ai-chat-app', 'es/work/ai-chat-app/'],
  ['es-work-cloud-dashboard', 'es/work/cloud-dashboard/'],
  ['es-work', 'es/work/'],
  ['es-career', 'es/career/'],
  ['es-evolution', 'es/evolution/'],
  ['es-evidence', 'es/evidence/'],
  ['es-print', 'es/print/'],
  ['print', 'print/'],
  ['evidence', 'evidence/'],
  ['es-build', 'es/build/'],
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
