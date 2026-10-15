import { test, expect } from '@playwright/test';
import { gotoPage } from './pages.mjs';

/**
 * Milestone reaction interaction (`src/components/MilestoneReactions.astro`).
 *
 * The control talks to `/api/milestones/{canonicalId}/reaction` on the comments
 * Worker. This spec stubs `window.fetch` BEFORE any page script runs, so it
 * asserts the site's wiring deterministically and offline:
 *
 *   - the first load is a GET that renders the shared count and leaves the
 *     toggle unpressed and enabled;
 *   - a click sends PUT (add) and then DELETE (remove), each carrying the
 *     anonymous nonce in the `x-reaction-nonce` header, never in the URL;
 *   - `aria-pressed` and the visible count follow the server response, and the
 *     polite live region announces the change (screen-reader feedback);
 *   - the ES page renders the Spanish copy against the same endpoint;
 *   - a failing API degrades to the honest `unavailable` state.
 *
 * The stub is a stand-in for the real Worker, whose semantics (idempotency,
 * shared EN/ES identity, abuse guard, no identity leakage) are owned by
 * `worker/tests/reactions-api.test.mjs`.
 */

const MILESTONE = '2026-10-09-portfolio-10x-rebuild';
const PAGE_EN = `evolution/${MILESTONE}/`;
const PAGE_ES = `es/evolution/${MILESTONE}/`;
const ENDPOINT = `https://professional-evolution-portfolio.crisss198.workers.dev/api/milestones/${MILESTONE}/reaction`;

/**
 * Install a fetch stub that models the reaction API's happy path. It records
 * every call so the test can assert method + URL + nonce header, and never
 * leaks the nonce back in a response.
 */
async function stubReactionApi(page, options = {}) {
  await page.addInitScript(
    ({ fail }) => {
      window.__reactionCalls = [];
      const state = { count: 3, reacted: false };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!url.includes('/api/milestones/')) return originalFetch(input, init);
        const method = init.method || 'GET';
        const headers = init.headers || {};
        window.__reactionCalls.push({
          url,
          method,
          nonce: headers['x-reaction-nonce'] || headers['X-Reaction-Nonce'] || '',
        });
        if (fail) throw new Error('network down');
        if (method === 'PUT') {
          state.reacted = true;
          state.count += 1;
        } else if (method === 'DELETE') {
          state.reacted = false;
          state.count -= 1;
        }
        return new Response(JSON.stringify({ milestone: 'stub', count: state.count, reacted: state.reacted }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };
    },
    { fail: options.fail === true },
  );
}

const calls = (page) => page.evaluate(() => window.__reactionCalls);

test('EN: load, add and remove drive aria-pressed, the count and the live region', async ({
  page,
}) => {
  await stubReactionApi(page);
  await gotoPage(page, PAGE_EN);

  const group = page.getByRole('group', { name: 'Reaction' });
  await expect(group).toBeVisible();
  const button = group.locator('[data-reactions-button]');
  const count = group.locator('[data-reactions-count]');
  const status = group.locator('[data-reactions-status]');

  // Initial GET renders the shared count; the toggle is unpressed and usable.
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toHaveText('3');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('4');
  await expect(status).toContainText('Thanks');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(count).toHaveText('3');
  await expect(status).toContainText('removed');

  const recorded = await calls(page);
  expect(recorded.map((call) => call.method)).toEqual(['GET', 'PUT', 'DELETE']);
  for (const call of recorded) {
    expect(call.url).toBe(ENDPOINT);
    // The nonce is opaque and header-only: never in the URL, always a token.
    expect(call.url).not.toContain(call.nonce);
    expect(call.nonce).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  }
  // One nonce for the whole visit: the client's convenience identity is stable.
  expect(new Set(recorded.map((call) => call.nonce)).size).toBe(1);
});

test('ES: the same endpoint renders the Spanish copy', async ({ page }) => {
  await stubReactionApi(page);
  await gotoPage(page, PAGE_ES);

  const group = page.getByRole('group', { name: 'Reacción' });
  await expect(group).toBeVisible();
  const button = group.locator('[data-reactions-button]');
  await expect(button).toBeEnabled();
  await expect(button).toContainText('Me resultó útil');
  await expect(group.locator('[data-reactions-count]')).toHaveText('3');

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(group.locator('[data-reactions-status]')).toContainText('Gracias');

  const recorded = await calls(page);
  expect(recorded[0].url).toBe(ENDPOINT);
});

test('an unreachable API degrades to the honest unavailable state', async ({ page }) => {
  await stubReactionApi(page, { fail: true });
  await gotoPage(page, PAGE_EN);

  const group = page.getByRole('group', { name: 'Reaction' });
  const button = group.locator('[data-reactions-button]');
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(group.locator('[data-reactions-status]')).toHaveText(
    'Reactions are temporarily unavailable.',
  );
});
