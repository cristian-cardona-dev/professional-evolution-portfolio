import { test, expect } from '@playwright/test';

const API_ORIGIN = 'https://professional-evolution-portfolio.crisss198.workers.dev';
const MILESTONE = '2026-10-03-initial-portfolio-build';

for (const locale of ['en', 'es']) {
  test(`${locale} milestone comments translate only after an explicit click`, async ({ page }) => {
    const pageId = locale === 'es' ? `es/evolution/${MILESTONE}/` : `evolution/${MILESTONE}/`;
    const sourceLang = locale === 'es' ? 'en' : 'es';
    const targetLocale = locale;
    const original = locale === 'es' ? 'Original English reply' : 'Texto original en español';
    const translated = locale === 'es' ? '[es] Original English reply' : '[en] Texto original en español';
    let requestedTarget = null;

    await page.route(`**/evolution/${MILESTONE}/`, async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        'data-configured="false"',
        'data-configured="true"',
      );
      await route.fulfill({ response, body: html });
    });
    await page.route(`${API_ORIGIN}/api/comments/**`, async (route) => {
      const request = route.request();
      const url = request.url();
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type,accept',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors, body: '' });
        return;
      }
      if (request.method() === 'GET' && !url.endsWith('/ws')) {
        await route.fulfill({
          status: 200,
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({
            comments: [
              {
                id: 'comment-translation-test',
                name: 'Reader',
                body: original,
                source_lang: sourceLang,
                // Ensure the public UI ignores the legacy moderation field.
                translation: 'private moderation translation must stay hidden',
                created_at: Date.now(),
                reports: 0,
                parent_id: null,
                evidence_anchor: null,
              },
            ],
            presence: 0,
          }),
        });
        return;
      }
      if (request.method() === 'POST' && url.endsWith('/translate')) {
        requestedTarget = request.postDataJSON().targetLocale;
        await route.fulfill({
          status: 200,
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({ translation: translated, cached: false }),
        });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
    });

    const routePath = locale === 'es'
      ? `/professional-evolution-portfolio/es/evolution/${MILESTONE}/`
      : `/professional-evolution-portfolio/evolution/${MILESTONE}/`;
    await page.goto(routePath);
    const comment = page.locator('[data-comment-id="comment-translation-test"]');
    await expect(comment.locator('.comment__body')).toHaveText(original);
    await expect(comment).not.toContainText('private moderation translation');

    const translateButton = comment.getByRole('button', { name: locale === 'es' ? 'Traducir' : 'Translate' });
    await translateButton.click();
    await expect(comment.locator('.comment__body')).toHaveText(translated);
    await expect(comment.locator('.comment__badge')).toHaveText(locale === 'es' ? 'Traducción automática' : 'Machine translated');
    await expect(comment.locator('.comment__toggle')).toHaveText(locale === 'es' ? 'Mostrar original' : 'Show original');
    await expect.poll(() => requestedTarget).toBe(targetLocale);
  });
}
