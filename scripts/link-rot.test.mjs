/**
 * Unit tests for the live link-rot monitor (plan phase 9.1).
 *
 * Network is never touched: `classify` is pure and `collectExternalUrls` runs
 * against a temporary fixture directory. The live probe itself is exercised by
 * the weekly workflow, not here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classify, collectExternalUrls } from './link-rot.mjs';

function withFixture(html, cb) {
  const dir = mkdtempSync(join(tmpdir(), 'link-rot-'));
  try {
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    return cb(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('classify separates dead links from anti-bot refusals', () => {
  assert.equal(classify({ status: 200 }), 'ok');
  assert.equal(classify({ status: 301 }), 'ok');
  assert.equal(classify({ status: 404 }), 'broken');
  assert.equal(classify({ status: 410 }), 'broken');
  assert.equal(classify({ status: 500 }), 'broken');
  assert.equal(classify({ status: 503 }), 'broken');
  // Refusals that a human would not see: never reported as dead.
  assert.equal(classify({ status: 403 }), 'blocked');
  assert.equal(classify({ status: 429 }), 'blocked');
  assert.equal(classify({ status: 999 }), 'blocked');
  assert.equal(classify({ status: 0, error: 'timeout' }), 'blocked');
});

test('collectExternalUrls picks up href, src and content attributes', () => {
  const html = `
    <html><body>
      <a href="https://example.com/page#section">x</a>
      <img src="https://example.com/img.png" />
      <meta property="og:image" content="https://example.com/og.png" />
    </body></html>`;
  const urls = withFixture(html, (dir) => collectExternalUrls(dir));
  assert.deepEqual(
    [...urls.keys()].sort(),
    ['https://example.com/img.png', 'https://example.com/og.png', 'https://example.com/page'],
  );
});

test('collectExternalUrls ignores preconnect and dns-prefetch hints', () => {
  const html = `
    <html><head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      <link rel="stylesheet" href="https://cdn.example.com/site.css" />
    </head><body></body></html>`;
  const urls = withFixture(html, (dir) => collectExternalUrls(dir));
  assert.deepEqual([...urls.keys()], ['https://cdn.example.com/site.css']);
});

test('collectExternalUrls decodes ampersands and drops fragments', () => {
  const html = `<a href="https://example.com/s?a=1&amp;b=2#frag">x</a>`;
  const urls = withFixture(html, (dir) => collectExternalUrls(dir));
  assert.deepEqual([...urls.keys()], ['https://example.com/s?a=1&b=2']);
});

test('collectExternalUrls ignores mailto, tel, data and relative links', () => {
  const html = `
    <a href="mailto:hi@example.com">e</a>
    <a href="tel:+123456">t</a>
    <a href="data:text/plain,hi">d</a>
    <a href="/relative/page">r</a>`;
  const urls = withFixture(html, (dir) => collectExternalUrls(dir));
  assert.equal(urls.size, 0);
});

test('collectExternalUrls scans nested directories', () => {
  const dir = mkdtempSync(join(tmpdir(), 'link-rot-nested-'));
  try {
    mkdirSync(join(dir, 'deep'), { recursive: true });
    writeFileSync(join(dir, 'deep', 'page.html'), `<a href="https://example.com/deep">x</a>`, 'utf8');
    const urls = collectExternalUrls(dir);
    assert.deepEqual([...urls.keys()], ['https://example.com/deep']);
    assert.equal([...urls.values()][0], join('deep', 'page.html'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
