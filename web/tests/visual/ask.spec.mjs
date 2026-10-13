import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

/**
 * "Ask about this page" deep link
 * (`src/components/AskAboutPage.astro` → `src/components/AssistantWidget.astro`).
 *
 * The button is a seed, not a search: it dispatches the documented
 * `assistant:ask` CustomEvent and the floating assistant opens itself, fills
 * its input with that exact query and runs its own search over the index the
 * page already embeds. What this spec guards:
 *
 *   - the button exists with the locale's accessible name (the locators below
 *     only match when the right catalog rendered, so they double as the EN/ES
 *     parity check for the label);
 *   - clicking it opens the assistant dialog, seeds the input with the page's
 *     own query and renders results — the honest outcome the button promises;
 *   - the seeded run is exactly the widget's own search: the same query typed
 *     by hand produces the same rows, so the button adds no intelligence;
 *   - every rendered row is an entry the widget already embedded (a link to a
 *     published page, or the profile's `mailto:` compose) — never an invented
 *     answer.
 *
 * Case-study pages carry no screenshot baselines on purpose (see `pages.mjs`);
 * the career baseline is regenerated deliberately when the row grows a button.
 */

/** The four pages that render the button, with their catalogs and seeds. */
const ASK_PAGES = [
  {
    name: 'case study (en)',
    path: 'work/ai-chat-app/',
    label: 'Ask about this page',
    seed: 'AI Chat API Lab node contract-tests bounded-citations deterministic',
  },
  {
    name: 'case study (es)',
    path: 'es/work/ai-chat-app/',
    label: 'Pregunta sobre esta página',
    seed: 'AI Chat API Lab node contract-tests bounded-citations deterministic',
  },
  {
    name: 'career (en)',
    path: 'career/',
    label: 'Ask about this page',
    seed: 'TypeScript Astro Accessibility Node.js State machines Idempotency Audit trails Testing Contract testing Human-in-the-loop',
  },
  {
    name: 'career (es)',
    path: 'es/career/',
    label: 'Pregunta sobre esta página',
    seed: 'TypeScript Astro Accessibility Node.js State machines Idempotency Audit trails Testing Contract testing Human-in-the-loop',
  },
];

/** The floating assistant, addressed the way its own markup names it. */
const panelOf = (page) => page.locator('[data-assistant] [data-a-panel]');

for (const { name, path, label, seed } of ASK_PAGES) {
  test(`${name} ask button seeds the assistant and renders its own results`, async ({ page }) => {
    await gotoPage(page, path);

    const button = page.getByRole('button', { name: label });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('data-ask-query', seed);

    // The assistant is closed until the button opens it.
    const panel = panelOf(page);
    await expect(panel).toBeHidden();

    await button.click();

    // The dialog opened, and the input shows the exact query that ran — the
    // same transparency rule the suggestion chips follow.
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-a-input]')).toHaveValue(seed);

    // Results, not the fallback: the page's own words match the published
    // index. The rows are the widget's pre-rendered entries, moved into the
    // results list.
    const results = panel.locator('[data-a-results]');
    await expect(results).toBeVisible();
    await expect(panel.locator('[data-a-fallback]')).toBeHidden();

    const rows = results.locator('.assistant__row');
    await expect(rows.first()).toBeVisible();

    // Every row is a published destination the widget already embedded: a site
    // route under the deployment base, or the profile's mailto compose. The
    // seed can never surface something the site does not publish.
    for (const href of await rows.locator('.assistant__row-title').evaluateAll((links) =>
      links.map((link) => link.getAttribute('href') ?? ''),
    )) {
      expect(href).toMatch(/^(mailto:|\.{0,2}\/|https?:\/\/)/);
    }
  });
}

test('the ask button adds no intelligence: the same query typed by hand gives the same rows', async ({
  page,
}) => {
  await gotoPage(page, 'career/');

  const panel = panelOf(page);
  const input = panel.locator('[data-a-input]');
  const results = panel.locator('[data-a-results]');
  const submit = panel.locator('[data-a-form] button[type="submit"]');

  // Seeded run through the button.
  const button = page.getByRole('button', { name: 'Ask about this page' });
  const seed = await button.getAttribute('data-ask-query');
  await button.click();
  await expect(results).toBeVisible();
  const seeded = await results.locator('.assistant__row-title').allTextContents();

  // The same query through the widget's own form, over its own index: the
  // button seeded a query, it did not add a search of its own.
  await input.fill('');
  await submit.click();
  await expect(panel.locator('[data-a-out]')).toBeHidden();

  await input.fill(seed);
  await submit.click();
  await expect(results).toBeVisible();

  expect(await results.locator('.assistant__row-title').allTextContents()).toEqual(seeded);
  expect(seeded.length).toBeGreaterThan(0);
});
