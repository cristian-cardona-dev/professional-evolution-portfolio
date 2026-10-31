import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

const VIEWPORTS = [390, 768, 1280];

for (const [locale, path] of [
  ['en', 'evolution/'],
  ['es', 'es/evolution/'],
]) {
  test(`${locale} Evolution keeps the slip and phase rows in the first viewport`, async ({ page }) => {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 844 });
      await gotoPage(page, path);

      const viewportHeight = await page.evaluate(() => window.innerHeight);
      const firstFoldSelectors = [
        'h1#evolution-heading',
        '.evolution-page__intro',
        '.evolution-page__slip',
        '.evolution-slip__phase',
        '.evolution-slip__final',
      ];

      for (const selector of firstFoldSelectors) {
        const element = page.locator(selector).first();
        await expect(element, `${locale} ${width}px: ${selector} is present`).toBeVisible();
        const box = await element.boundingBox();
        expect(box, `${locale} ${width}px: ${selector} has a layout box`).not.toBeNull();
        if (selector === 'h1#evolution-heading' || selector === '.evolution-page__intro') {
          expect(box.y + box.height, `${locale} ${width}px: ${selector} fits above the fold`).toBeLessThanOrEqual(viewportHeight);
        }
      }

      const overflow = await page.evaluate(() => {
        const amount = document.documentElement.scrollWidth - window.innerWidth;
        const offenders = [...document.querySelectorAll('body *')]
          .map((element) => ({
            selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${[...element.classList].join('.')}`,
            right: Math.ceil(element.getBoundingClientRect().right),
          }))
          .filter((element) => element.right > window.innerWidth + 1)
          .slice(0, 5);
        return { amount, offenders };
      });
      expect(overflow.amount, `${locale} ${width}px: no horizontal page overflow; offenders: ${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(1);
    }
  });
}