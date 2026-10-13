import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

/**
 * Clipboard smoke for the copy controls (`src/lib/clipboard.ts`).
 *
 * The Clipboard API is stubbed before any page script runs, so what is being
 * asserted is this site's wiring — did the click hand the promised value to
 * `navigator.clipboard.writeText`, and did the polite live region announce
 * the outcome — not the browser's clipboard permission model, which a headless
 * run cannot grant honestly.
 *
 * The announcement text is read back from `data-copy-success` /
 * `data-copy-error` instead of being hardcoded: those attributes are rendered
 * from `i18n/copy.ts`, so the assertions keep holding when a string is
 * reviewed, and the locale-specific locators are what prove EN and ES both
 * ship their own copy.
 */
async function stubClipboard(page, { reject = false } = {}) {
  await page.addInitScript(
    ({ reject }) => {
      const writes = [];
      Object.defineProperty(window, '__clipboardWrites', { value: writes, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text) => {
            // Record the attempt either way: the failure test must show that
            // the API was called and only its outcome was announced.
            writes.push(text);
            return reject ? Promise.reject(new Error('Write denied')) : Promise.resolve();
          },
        },
      });
    },
    { reject },
  );
}

const writesOf = (page) => page.evaluate(() => window.__clipboardWrites);

/** The single status region of the page under test (one copy control per page). */
const statusRegion = (page) => page.locator('[data-copy-region] [data-copy-status]').first();

const addressOn = async (page) => {
  const href = await page.locator('a.contact__email').getAttribute('href');
  return href.replace(/^mailto:/, '');
};

test('copy email button writes the address and announces it', async ({ page }) => {
  await stubClipboard(page);
  await gotoPage(page, './');

  const button = page.getByRole('button', { name: 'Copy email address' });
  await expect(button).toHaveAttribute('type', 'button');
  await expect(button).toBeVisible();

  await button.click();

  await expect.poll(() => writesOf(page)).toEqual([await addressOn(page)]);
  await expect(statusRegion(page)).toHaveText(await button.getAttribute('data-copy-success'));
});

test('the Spanish contact section copies the same address with Spanish feedback', async ({
  page,
}) => {
  await stubClipboard(page);
  await gotoPage(page, 'es/');

  // The accessible name only matches when the `es` catalog rendered, so this
  // locator doubles as the EN/ES parity check for the label.
  const button = page.getByRole('button', { name: 'Copiar dirección de correo' });
  await expect(button).toBeVisible();

  await button.click();

  await expect.poll(() => writesOf(page)).toEqual([await addressOn(page)]);
  await expect(statusRegion(page)).toHaveText(await button.getAttribute('data-copy-success'));
});

test('copy link button writes the canonical URL of the case study', async ({ page }) => {
  await stubClipboard(page);
  await gotoPage(page, 'work/ai-chat-app/');

  const button = page.getByRole('button', { name: 'Copy link to this page' });
  await expect(button).toHaveAttribute('type', 'button');
  await expect(button).toBeVisible();

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical, 'the page must publish a canonical URL to copy').toBeTruthy();

  await button.click();

  await expect.poll(() => writesOf(page)).toEqual([canonical]);
  await expect(statusRegion(page)).toHaveText(await button.getAttribute('data-copy-success'));
});

test('a refused copy is announced instead of swallowed', async ({ page }) => {
  await stubClipboard(page, { reject: true });
  await gotoPage(page, './');

  const button = page.getByRole('button', { name: 'Copy email address' });
  await button.click();

  // The API was called with the address and still failed — the visitor gets
  // the honest fallback message, not silence.
  await expect.poll(() => writesOf(page)).toEqual([await addressOn(page)]);
  await expect(statusRegion(page)).toHaveText(await button.getAttribute('data-copy-error'));
});
