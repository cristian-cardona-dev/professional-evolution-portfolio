import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

const MILESTONE = '2026-10-03-initial-portfolio-build';

async function switchLocale(page, locale) {
  const link = page.locator(`[data-locale-switch][hreflang="${locale}"]`);
  if (!(await link.isVisible())) await page.getByRole('button', { name: /^(Menu|Menú)$/ }).click();
  await link.click();
}

test('switching locale preserves an evidence fragment in both directions', async ({ page }) => {
  await gotoPage(page, `evolution/${MILESTONE}/#evidence-2`);
  await expect(page).toHaveURL(/#evidence-2$/);
  await switchLocale(page, 'es');
  await expect(page).toHaveURL(new RegExp(`/es/evolution/${MILESTONE}/#evidence-2$`));
  await expect(page.locator('#evidence-2')).toBeInViewport();

  await switchLocale(page, 'en');
  await expect(page).toHaveURL(new RegExp(`/evolution/${MILESTONE}/#evidence-2$`));
});

test('evidence discussion remains an honest comments anchor without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await gotoPage(page, `evolution/${MILESTONE}/`);
    const discuss = page.getByRole('link', { name: 'Discuss this evidence' }).first();
    await expect(discuss).toHaveAttribute('href', '#comments');
    await discuss.click();
    await expect(page).toHaveURL(/#comments$/);
    await expect(page.locator('#comments')).toBeInViewport();
  } finally {
    await context.close();
  }
});
