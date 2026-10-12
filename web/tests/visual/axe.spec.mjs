import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { AXE_PAGES, gotoPage } from './pages.mjs';

/**
 * Real-browser axe-core scan (WCAG 2.2 AA) of the twenty pages in
 * `AXE_PAGES` — the six primary pages, the three case-study detail pages in
 * both locales, the Spanish subpages, the English print page and the two
 * static résumé files — plus the two 404 routes, in BOTH colour schemes.
 * Unlike the jsdom gate in `tests/a11y.test.mjs`, this runs in
 * a real engine, so it evaluates *computed* colours and therefore catches the
 * `color-contrast` rule that jsdom cannot judge.
 *
 * `axe-core` is already a devDependency; the source is injected with
 * `addScriptTag` — no new dependency and no browser-extension download.
 *
 * The test fails on ANY violation. It runs in both viewport projects, so a
 * layout that only exists on mobile (e.g. the mobile filter bar) is audited too.
 */
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const SCHEMES = ['dark', 'light'];

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Inject axe into the current document and return its violations. */
async function scanViolations(page) {
  await page.addScriptTag({ path: axePath });

  return page.evaluate(async (tags) => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
    });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    }));
  }, WCAG_TAGS);
}

for (const scheme of SCHEMES) {
  for (const [name, path] of AXE_PAGES) {
    test(`${name} has no axe violations (${scheme})`, async ({ page }) => {
      // Drive the site's pre-paint theme script via prefers-color-scheme.
      await page.emulateMedia({ colorScheme: scheme });
      await gotoPage(page, path);

      const violations = await scanViolations(page);

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }
}

/**
 * The two 404 routes, in both colour schemes.
 *
 * These cannot go through `gotoPage`: a not-found address must answer HTTP 404,
 * and `gotoPage` throws on anything but 200 — that assertion is precisely what
 * keeps the other scans off the wrong page. Here the 404 status IS the contract,
 * so `page.goto` is called directly and the status is asserted *before* anything
 * is scanned; a gate that scanned whatever the server happened to return would
 * be worthless.
 *
 * Both pages are reached the way a visitor reaches them: a guaranteed-missing
 * path under the base path. A static host serves the English `dist/404.html`
 * for every miss, and that page's own inline script redirects a Spanish miss to
 * `/es/404/` so a Spanish visitor never lands on English copy. `settled` encodes
 * both outcomes — the English miss must stay put, the Spanish one must end on
 * the Spanish 404 — and the scan then runs on the page the visitor actually
 * sees, which must carry the full site chrome (header, nav, footer).
 */
const NOT_FOUND = [
  ['404-en', 'this-page-does-not-exist-404/', 'en', /\/this-page-does-not-exist-404\/$/],
  ['404-es', 'es/this-page-does-not-exist-404/', 'es', /\/es\/404\//],
];

for (const scheme of SCHEMES) {
  for (const [name, path, lang, settled] of NOT_FOUND) {
    test(`${name} has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });

      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response, `No HTTP response for "${path}"`).not.toBeNull();
      expect(
        response.status(),
        `Expected HTTP 404 for "${path}", got ${response.status()} at ${page.url()}`,
      ).toBe(404);

      await page.waitForURL(settled);

      // The right 404 for the locale, not the English fallback: the chrome the
      // scan below depends on is only there because BaseLayout rendered.
      expect(page.url()).toMatch(settled);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('header.site-header')).toBeVisible();

      const violations = await scanViolations(page);

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }
}
