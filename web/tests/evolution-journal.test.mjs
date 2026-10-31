import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const DATA = resolve(import.meta.dirname, '..', '..', 'data', 'evolution.json');
const milestones = JSON.parse(readFileSync(DATA, 'utf8')).milestones;
const featured = milestones
  .filter((milestone) => milestone.source === 'curated')
  .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date)))
  .find((milestone) => milestone.status !== 'planned');

function readEvolution(locale) {
  const file = resolve(DIST, locale === 'es' ? 'es/evolution/index.html' : 'evolution/index.html');
  assert.ok(existsSync(file), `built ${locale} evolution page exists at ${file}`);
  const html = readFileSync(file, 'utf8');
  return { html, document: new JSDOM(html).window.document };
}

test('Evolution features the latest reviewed, delivered or in-progress milestone', () => {
  assert.ok(featured, 'canonical data contains a reviewed milestone to feature');

  for (const locale of ['en', 'es']) {
    const { document } = readEvolution(locale);
    const feature = document.querySelector('#latest-entry');
    assert.ok(feature, `${locale}: featured entry is present`);
    const story = feature.querySelector('h3 a[href]');
    assert.ok(story, `${locale}: featured story has a detail link`);
    assert.ok(story.getAttribute('href').includes(`/evolution/${featured.id}/`));
    assert.equal(feature.querySelector('time')?.getAttribute('datetime'), featured.date);
    assert.ok(feature.textContent.includes(locale === 'es' ? featured.title_es : featured.title));
  }
});

test('journal navigation resolves to curated, candidate, planned, and roadmap sections', () => {
  for (const locale of ['en', 'es']) {
    const { document } = readEvolution(locale);
    for (const id of [
      'timeline-section-completed',
      'timeline-section-candidates',
      'timeline-section-ahead',
      'roadmap',
    ]) {
      assert.ok(document.getElementById(id), `${locale}: #${id} target remains present`);
      assert.ok(document.querySelector(`.journal-index a[href="#${id}"]`), `${locale}: #${id} link remains present`);
    }
    assert.match(document.querySelector('#timeline-section-candidates')?.textContent ?? '', /candidate|candidat/i);
    assert.match(document.querySelector('#timeline-section-ahead')?.textContent ?? '', /planned|not achievements|planificad|no son logros/i);
  }
});

test('contribution invitations resolve to the featured milestone discussion in both locales', () => {
  assert.ok(featured);
  for (const locale of ['en', 'es']) {
    const { document } = readEvolution(locale);
    const invitation = document.querySelector('#latest-entry .journal-feature__invitation');
    assert.ok(invitation, `${locale}: contribution invitation is visible in the page`);
    assert.match(invitation.textContent, /context|question|pregunta|conversación/i);
    assert.match(invitation.textContent, /verify|verific/i);

    const discussion = document.querySelector(`#latest-entry a[href*="/evolution/${featured.id}/#comments"]`);
    assert.ok(discussion, `${locale}: featured discussion CTA exists`);
    const detailPath = resolve(
      DIST,
      locale === 'es' ? `es/evolution/${featured.id}/index.html` : `evolution/${featured.id}/index.html`,
    );
    assert.ok(existsSync(detailPath), `${locale}: discussion detail route exists`);
    assert.match(readFileSync(detailPath, 'utf8'), /id="comments"/);
  }
});

test('Evolution preserves locale parity, #roadmap, accessible landmarks, and one page heading', () => {
  const en = readEvolution('en').document;
  const es = readEvolution('es').document;

  const enSections = [...en.querySelectorAll('.timeline__section')].map((section) => section.id);
  const esSections = [...es.querySelectorAll('.timeline__section')].map((section) => section.id);
  assert.deepEqual(esSections, enSections, 'both locales expose matching archive sections');
  assert.equal(en.querySelectorAll('h1').length, 1);
  assert.equal(es.querySelectorAll('h1').length, 1);
  assert.ok(en.querySelector('main'), 'English page has a main landmark');
  assert.ok(es.querySelector('main'), 'Spanish page has a main landmark');
  assert.ok(en.querySelector('nav[aria-label]'), 'English archive navigation has an accessible name');
  assert.ok(es.querySelector('nav[aria-label]'), 'Spanish archive navigation has an accessible name');
  assert.ok(en.getElementById('roadmap'));
  assert.ok(es.getElementById('roadmap'));

  for (const document of [en, es]) {
    const mainContent = document.querySelector('main .section');
    assert.ok(mainContent, 'Evolution content is inside the main landmark');
    let previousLevel = 0;
    for (const heading of mainContent.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const level = Number(heading.tagName.slice(1));
      assert.ok(level <= previousLevel + 1, `heading hierarchy does not skip at ${heading.textContent.trim()}`);
      previousLevel = level;
    }
  }
});

test('index archive does not mount milestone reaction controls or call reaction APIs', () => {
  for (const locale of ['en', 'es']) {
    const { html, document } = readEvolution(locale);
    assert.equal(document.querySelectorAll('[data-reaction]').length, 0, `${locale}: no reaction controls`);
    assert.doesNotMatch(html, /\/api\/milestones\/[^"'\s]+\/reaction/i, `${locale}: no reaction API request URL`);
  }
});
