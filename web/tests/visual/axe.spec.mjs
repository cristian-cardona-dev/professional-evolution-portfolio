import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { PAGES, gotoPage } from './pages.mjs';

/**
 * Real-browser axe-core scan (WCAG 2.2 AA) of the six primary pages in BOTH
 * colour schemes. Unlike the jsdom gate in `tests/a11y.test.mjs`, this runs in
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

for (const scheme of SCHEMES) {
  for (const [name, path] of PAGES) {
    test(`${name} has no axe violations (${scheme})`, async ({ page }) => {
      // Drive the site's pre-paint theme script via prefers-color-scheme.
      await page.emulateMedia({ colorScheme: scheme });
      await gotoPage(page, path);
      await page.addScriptTag({ path: axePath });

      const violations = await page.evaluate(async (tags) => {
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

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    });
  }
}
