/**
 * Route contract tests — verify that milestone detail routes are generated
 * for both locales and that canonical feed links point at them.
 *
 * These tests are deterministic: they read the canonical data file directly
 * and assert that the build output contains exactly the pages derived from it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const DATA = resolve(import.meta.dirname, '..', '..', 'data', 'evolution.json');
const BASE_PATH = '/professional-evolution-portfolio';

const milestones = JSON.parse(readFileSync(DATA, 'utf8')).milestones;

function pagePath(locale, id) {
  return join(DIST, locale === 'es' ? 'es' : '', 'evolution', id, 'index.html');
}

function pageUrl(locale, id) {
  const suffix = locale === 'es' ? `es/evolution/${id}/` : `evolution/${id}/`;
  return `${BASE_PATH}/${suffix}`;
}

function decodeHtml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function excerpt(text, max = 160) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
}

test('every milestone has EN and ES detail pages in the build output', () => {
  const missing = [];
  for (const milestone of milestones) {
    for (const locale of ['en', 'es']) {
      if (!existsSync(pagePath(locale, milestone.id))) {
        missing.push(`${locale}/evolution/${milestone.id}/`);
      }
    }
  }
  assert.deepEqual(missing, [], `Missing milestone detail pages: ${missing.join(', ')}`);
});

test('milestone detail pages render their canonical static narrative in each locale', () => {
  const failures = [];
  for (const milestone of milestones) {
    for (const locale of ['en', 'es']) {
      const html = readFileSync(pagePath(locale, milestone.id), 'utf8');
      const leadRaw = html.match(/<p class="lead"[^>]*>([\s\S]*?)<\/p>/)?.[1];
      const lead = leadRaw === undefined ? undefined : decodeHtml(leadRaw);
      const expected = locale === 'es' ? milestone.narrativeEs : milestone.narrative;
      if (lead !== expected) {
        failures.push(`${locale}/evolution/${milestone.id}/ rendered ${JSON.stringify(lead)}`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('Spanish home notes feed renders the reviewed Spanish milestone excerpt', () => {
  const latestCurated = milestones
    .filter((milestone) => milestone.source === 'curated')
    .sort((a, b) =>
      a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1,
    )[0];
  const html = readFileSync(join(DIST, 'es', 'index.html'), 'utf8');
  const excerptRaw = html.match(/<p class="notes__excerpt"[^>]*>([\s\S]*?)<\/p>/)?.[1];

  assert.ok(excerptRaw, 'Spanish home page contains a notes feed excerpt');
  const actual = decodeHtml(excerptRaw);
  assert.equal(actual, excerpt(latestCurated.narrativeEs));
  assert.notEqual(actual, excerpt(latestCurated.narrative), 'English narrative must not leak into ES');
});

test('milestone comments explain the explicit translation and source-text no-JS fallback', () => {
  for (const locale of ['en', 'es']) {
    const html = readFileSync(pagePath(locale, milestones[0].id), 'utf8');
    const expected = locale === 'es'
      ? 'Los comentarios se mantienen en su idioma original salvo que elijas Traducir'
      : 'Comments stay in their original language unless you explicitly choose Translate';
    assert.ok(html.includes(expected), `${locale} route explains its source-language fallback`);
    assert.ok(html.includes('data-reading-translation="true"'));
  }
});

test('RSS feed links every milestone to its detail route', () => {
  const rssPath = join(DIST, 'rss.xml');
  assert.ok(existsSync(rssPath), 'rss.xml must exist in dist');
  const rss = readFileSync(rssPath, 'utf8');
  const missing = [];
  for (const milestone of milestones) {
    const url = pageUrl('en', milestone.id);
    if (!rss.includes(url)) {
      missing.push(url);
    }
  }
  assert.deepEqual(missing, [], `RSS missing detail links for: ${missing.join(', ')}`);
});

test('milestone detail pages publish the expected Open Graph card', () => {
  const failures = [];
  for (const milestone of milestones) {
    for (const locale of ['en', 'es']) {
      const html = readFileSync(pagePath(locale, milestone.id), 'utf8');
      const expectedCard = `/og/evolution-${milestone.id.replace(/\//g, '-')}-${locale}.png`;
      const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i)?.[1];
      if (!ogImage || !ogImage.endsWith(expectedCard)) {
        failures.push(`${locale} /evolution/${milestone.id}/ missing or wrong og:image (expected ${expectedCard})`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
