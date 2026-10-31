import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const DATA = resolve(import.meta.dirname, '..', '..', 'data', 'evolution.json');
const milestones = JSON.parse(readFileSync(DATA, 'utf8')).milestones;

function readEvolution(locale) {
  const file = resolve(DIST, locale === 'es' ? 'es/evolution/index.html' : 'evolution/index.html');
  assert.ok(existsSync(file), `built ${locale} evolution page exists at ${file}`);
  const html = readFileSync(file, 'utf8');
  return { html, document: new JSDOM(html).window.document };
}

test('Evolution page renders the slip design with phases and rows', () => {
  for (const locale of ['en', 'es']) {
    const { document } = readEvolution(locale);
    const slip = document.querySelector('.evolution-page__slip');
    assert.ok(slip, `${locale}: evolution slip container is present`);
    const phases = slip.querySelectorAll('.evolution-slip__phase');
    assert.ok(phases.length > 0, `${locale}: at least one phase present`);
    const rows = slip.querySelectorAll('.evolution-slip__row');
    assert.ok(rows.length > 0, `${locale}: at least one row present`);
    const finalRow = slip.querySelector('.evolution-slip__final');
    assert.ok(finalRow, `${locale}: final inverted row present`);
  }
});

test('Evolution page has a single h1 heading in both locales', () => {
  for (const locale of ['en', 'es']) {
    const { document } = readEvolution(locale);
    assert.equal(document.querySelectorAll('h1').length, 1, `${locale}: exactly one h1`);
  }
});

test('Evolution page preserves locale parity (same phase count in EN and ES)', () => {
  const en = readEvolution('en').document;
  const es = readEvolution('es').document;
  const enPhases = en.querySelectorAll('.evolution-slip__phase').length;
  const esPhases = es.querySelectorAll('.evolution-slip__phase').length;
  assert.equal(esPhases, enPhases, 'both locales expose the same number of phases');
});

test('Evolution page links to milestone detail pages', () => {
  for (const locale of ['en', 'es']) {
    const { document } = readEvolution(locale);
    const links = document.querySelectorAll('a[href*="/evolution/"]');
    assert.ok(links.length > 0, `${locale}: at least one evolution link present`);
  }
});
