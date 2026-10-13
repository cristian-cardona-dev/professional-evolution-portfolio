import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

/**
 * Share-row smoke (`src/components/ShareRow.astro`).
 *
 * The row is deliberately scriptless for sharing: the LinkedIn and X actions
 * are plain anchors whose `href` is the share intent with the canonical page
 * URL as the only parameter. What this spec guards:
 *
 *   - both anchors exist with the locale's accessible names (the locators
 *     below only match when the right catalog rendered, so they double as the
 *     EN/ES parity check for the labels);
 *   - their hrefs match the expected intent shapes EXACTLY, with the page
 *     URL percent-encoded as the sole `url` parameter and nothing else
 *     (no tracking parameters);
 *   - the shared URL is the canonical GitHub Pages origin — never the
 *     Workers mirror — which is asserted by reading the page's own
 *     `<link rel="canonical">` and comparing against the served URL;
 *   - the copy-link control writes that same canonical URL to the clipboard
 *     (stubbed before any page script runs, the same honest-stand-in
 *     approach as `copy.spec.mjs`, which owns the clipboard-wiring tests;
 *     the case-study copy link is already covered there);
 *   - no third-party share script is ever loaded.
 *
 * `twitter.com/intent/tweet` is the long-standing X web intent (the domain
 * still resolves it and redirects to the current app); LinkedIn's documented
 * share endpoint is `linkedin.com/sharing/share-offsite/` with a single `url`
 * parameter.
 */

const LINKEDIN_INTENT = 'https://www.linkedin.com/sharing/share-offsite/?url=';
const X_INTENT = 'https://twitter.com/intent/tweet?url=';

/** The four pages that carry the share row, with the labels of each catalog. */
const SHARE_PAGES = [
  ['case study (en)', 'work/ai-chat-app/', 'Share this page', 'Share on LinkedIn', 'Share on X'],
  [
    'case study (es)',
    'es/work/ai-chat-app/',
    'Comparte esta página',
    'Compartir en LinkedIn',
    'Compartir en X',
  ],
  ['career (en)', 'career/', 'Share this page', 'Share on LinkedIn', 'Share on X'],
  [
    'career (es)',
    'es/career/',
    'Comparte esta página',
    'Compartir en LinkedIn',
    'Compartir en X',
  ],
];

/**
 * Stub the Clipboard API before any page script runs — a headless run cannot
 * grant the real permission, so what is asserted is this site's wiring.
 */
async function stubClipboard(page) {
  await page.addInitScript(() => {
    const writes = [];
    Object.defineProperty(window, '__clipboardWrites', { value: writes, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => (writes.push(text), Promise.resolve()) },
    });
  });
}

const writesOf = (page) => page.evaluate(() => window.__clipboardWrites);

for (const [name, path, groupLabel, linkedInLabel, xLabel] of SHARE_PAGES) {
  test(`${name} share anchors point at the canonical Pages URL`, async ({ page }) => {
    await gotoPage(page, path);

    // The page must publish a canonical URL — that value is the contract the
    // share intents have to repeat.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical, 'the page must publish a canonical URL to share').toBeTruthy();
    expect(canonical).toContain('cristian-cardona-dev.github.io');
    expect(canonical).not.toContain('workers.dev');
    expect(canonical).not.toContain('pages.dev');

    // The row announces itself as one labelled group (the locale's label —
    // the locator only matches when the right catalog rendered).
    const row = page.getByRole('group', { name: groupLabel });
    await expect(row).toBeVisible();
    await expect(row.locator('a')).toHaveCount(2);

    const linkedIn = page.getByRole('link', { name: linkedInLabel });
    const x = page.getByRole('link', { name: xLabel });
    await expect(linkedIn).toBeVisible();
    await expect(x).toBeVisible();

    // Exact hrefs: the intent shape plus the percent-encoded canonical URL —
    // the only parameter, so nothing else (e.g. tracking) rides along.
    const expected = {
      linkedIn: `${LINKEDIN_INTENT}${encodeURIComponent(canonical)}`,
      x: `${X_INTENT}${encodeURIComponent(canonical)}`,
    };
    await expect(linkedIn).toHaveAttribute('href', expected.linkedIn);
    await expect(x).toHaveAttribute('href', expected.x);

    // Both open safely in a new tab, the site-wide contract for external links.
    for (const anchor of [linkedIn, x]) {
      await expect(anchor).toHaveAttribute('target', '_blank');
      await expect(anchor).toHaveAttribute('rel', /noopener/);
      await expect(anchor).toHaveAttribute('rel', /noreferrer/);
    }
  });
}

test('the career copy-link button writes the canonical URL', async ({ page }) => {
  await stubClipboard(page);
  await gotoPage(page, 'career/');

  const button = page.getByRole('button', { name: 'Copy link to this page' });
  await expect(button).toHaveAttribute('type', 'button');
  await expect(button).toBeVisible();

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  await button.click();

  // The shared helper copies exactly what the page advertises — the same URL
  // the share intents above carry.
  await expect.poll(() => writesOf(page)).toEqual([canonical]);
  const status = page.locator('[data-copy-region] [data-copy-status]').first();
  await expect(status).toHaveText(await button.getAttribute('data-copy-success'));
});

test('the Spanish career copy-link button writes the Spanish canonical URL', async ({ page }) => {
  await stubClipboard(page);
  await gotoPage(page, 'es/career/');

  // The accessible name only matches when the `es` catalog rendered.
  const button = page.getByRole('button', { name: 'Copiar enlace de esta página' });
  await expect(button).toBeVisible();

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toContain('/es/');
  await button.click();

  await expect.poll(() => writesOf(page)).toEqual([canonical]);
});

test('sharing loads no third-party script', async ({ page }) => {
  await gotoPage(page, 'work/ai-chat-app/');

  // The share actions are anchors by design: no SDK, no widget, no tracking
  // script from the share platforms may ever load.
  const thirdParty = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]'))
      .map((script) => script.src)
      .filter((src) => /linkedin|twitter\.com|x\.com/i.test(src)),
  );
  expect(thirdParty).toEqual([]);
});
