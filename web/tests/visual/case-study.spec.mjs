import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

/**
 * Case-study table of contents, scroll-spy and copyable section anchors
 * (`src/views/CaseStudy.astro` + `src/components/CopyAnchor.astro`).
 *
 * What this guards:
 *
 *   - the TOC lists every section of the study, in reading order, with the
 *     POSITION-derived anchors (`#case-study-section-<index>`) and the heading
 *     of the locale being rendered — the locators below only match when the
 *     right catalog rendered, so they double as the EN/ES parity check;
 *   - on a narrow viewport the list is collapsed behind a real disclosure
 *     button (`aria-expanded` + `aria-controls`), and opening it reveals the
 *     list — the collapsed state is a JavaScript affordance, so the list is
 *     rendered open in the markup;
 *   - clicking an entry navigates to the section (the hash changes and the
 *     heading lands in the viewport) and opens the progressive-disclosure
 *     `<details>` when the target lives inside it — without that, a TOC click
 *     or a copied deep link would scroll to something nobody can see;
 *   - the scroll-spy marks the section in view with `aria-current="true"` and
 *     clears it from the others;
 *   - each section carries a copy-anchor button that writes the page's own
 *     canonical URL plus the section fragment to the clipboard (stubbed before
 *     any page script runs, the same honest stand-in `copy.spec.mjs` uses) and
 *     announces the outcome through its own polite live region.
 *
 * Both case-study locales are exercised; the pages carry no screenshot
 * baselines on purpose (see `pages.mjs`), so this spec is the whole gate.
 */

/** The same study in both locales, with the catalog strings it must render. */
const CASE_STUDIES = [
  {
    name: 'en',
    path: 'work/ai-chat-app/',
    navLabel: 'On this page',
    anchorLabel: 'Copy link to this section',
    disclosureLabel: 'Read technical details',
    headings: [
      'Classification',
      'Problem',
      'What was implemented',
      'What this demonstrates',
      'What this does not demonstrate',
      'Evidence',
      'Next boundary',
    ],
  },
  {
    name: 'es',
    path: 'es/work/ai-chat-app/',
    navLabel: 'En esta página',
    anchorLabel: 'Copiar enlace a esta sección',
    disclosureLabel: 'Leer detalles técnicos',
    headings: [
      'Clasificación',
      'Problema',
      'Qué se implementó',
      'Qué demuestra esto',
      'Qué no demuestra esto',
      'Evidencia',
      'Siguiente frontera',
    ],
  },
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

/**
 * On a narrow viewport the list starts collapsed; open it the way a reader
 * would, and assert both states on the way. On a wide viewport there is no
 * toggle and this is a no-op.
 */
async function openToc(page, toc, navLabel) {
  const toggle = toc.getByRole('button', { name: navLabel });
  if (!(await toggle.isVisible())) return;

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toc.locator('a').first()).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toc.locator('a').first()).toBeVisible();
}

for (const { name, path, navLabel, anchorLabel, disclosureLabel, headings } of CASE_STUDIES) {
  test(`${name} table of contents lists every section with its position anchor`, async ({
    page,
  }) => {
    await gotoPage(page, path);

    const toc = page.getByRole('navigation', { name: navLabel });
    await expect(toc).toBeVisible();

    const links = toc.locator('a');
    await expect(links).toHaveCount(headings.length);
    // `toHaveText` compares the visible label of each entry, so a translated
    // heading or a reordered section fails here.
    await expect(links).toHaveText(headings);

    // The anchors are derived from the section position, never from the
    // heading text: the ids must be identical in both locales.
    for (const [index] of headings.entries()) {
      await expect(links.nth(index)).toHaveAttribute('href', `#case-study-section-${index}`);
      await expect(page.locator(`#case-study-section-${index}`)).toHaveText(headings[index]);
    }
  });

  test(`${name} table of contents collapses behind a disclosure when narrow`, async ({ page }) => {
    await gotoPage(page, path);

    const toc = page.getByRole('navigation', { name: navLabel });
    const toggle = toc.getByRole('button', { name: navLabel });

    // The collapsed state only exists below 1024px, and only with JavaScript.
    if (!(await toggle.isVisible())) {
      test.skip(true, 'the collapsed TOC is a narrow-viewport affordance');
      return;
    }

    await expect(toggle).toHaveAttribute('aria-controls', 'case-study-toc-list');
    await expect(toc.locator('a').first()).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toc.locator('a').first()).toBeVisible();
  });

  test(`${name} table of contents navigates and opens the disclosed section`, async ({ page }) => {
    await gotoPage(page, path);

    const toc = page.getByRole('navigation', { name: navLabel });
    await openToc(page, toc, navLabel);

    // Section 3 sits behind the progressive-disclosure `<details>`, closed on
    // load: the link has to open it or the anchor would be invisible.
    const disclosure = page.locator('.disclosure');
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(page.getByText(disclosureLabel)).toBeVisible();

    await toc.locator('a').nth(3).click();

    await expect(page).toHaveURL(new RegExp(`#case-study-section-3$`));
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(page.locator('#case-study-section-3')).toBeInViewport();
  });

  test(`${name} scroll-spy marks the section in view`, async ({ page }) => {
    await gotoPage(page, path);

    const toc = page.getByRole('navigation', { name: navLabel });
    await openToc(page, toc, navLabel);

    // Sections 3+ are disclosed away, so the spy is exercised on the third
    // section, which is always rendered once the disclosure is open.
    await page.getByText(disclosureLabel).click();

    // Park that section inside the spy's observation band (the middle of the
    // viewport), where a reader's eye would be.
    await page.evaluate(() => {
      const section = document.querySelectorAll('[data-toc-section]')[2];
      if (!section) return;
      window.scrollTo({
        top: window.scrollY + section.getBoundingClientRect().top - window.innerHeight * 0.3,
        behavior: 'instant',
      });
    });

    const current = toc.locator('a[aria-current="true"]');
    await expect(current).toHaveText(headings[2]);
    await expect(current).toHaveAttribute('href', '#case-study-section-2');
  });

  test(`${name} copy-anchor writes the canonical URL plus the section fragment`, async ({
    page,
  }) => {
    await stubClipboard(page);
    await gotoPage(page, path);

    // Every section carries the control, including the disclosed ones.
    await expect(page.getByRole('button', { name: anchorLabel, includeHidden: true })).toHaveCount(
      headings.length,
    );

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical, 'the page must publish a canonical URL to copy').toBeTruthy();
    expect(canonical).toContain('cristian-cardona-dev.github.io');
    if (name === 'es') expect(canonical).toContain('/es/');

    const section = page.locator('.case-study__section').first();
    const button = section.getByRole('button', { name: anchorLabel });
    await expect(button).toHaveAttribute('type', 'button');

    await button.click();

    await expect.poll(() => writesOf(page)).toEqual([`${canonical}#case-study-section-0`]);
    await expect(section.locator('[data-copy-status]')).toHaveText(
      await button.getAttribute('data-copy-success'),
    );
  });
}
