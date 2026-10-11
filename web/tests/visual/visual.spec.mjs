import { test, expect } from '@playwright/test';
import { PAGES, gotoPage } from './pages.mjs';

/**
 * Full-page screenshot baselines for the six primary pages, captured once per
 * configured viewport (chromium-desktop 1280×900, chromium-mobile 390×844) —
 * 12 baselines in total. The baselines are the regression signal: any styling
 * change that shifts pixels fails here and is reviewed as an image diff.
 *
 * Baseline files live in `tests/visual/visual.spec.mjs-snapshots/` and are
 * committed on purpose. Regenerate deliberately with:
 *   npx playwright test tests/visual/visual.spec.mjs --update-snapshots
 *
 * `maxDiffPixelRatio: 0.005` allows 0.5 % of pixels to differ (anti-aliasing
 * jitter) while the default per-pixel `threshold` (0.2) keeps real colour
 * shifts detectable.
 */
for (const [name, path] of PAGES) {
  test(`${name} page matches its baseline`, async ({ page }) => {
    await gotoPage(page, path);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      stylePath: 'tests/visual/screenshot.css',
      animations: 'disabled',
      maxDiffPixelRatio: 0.005,
    });
  });
}
