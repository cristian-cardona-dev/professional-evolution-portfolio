/**
 * Milestone reaction markup contract (node --test, reads the production build).
 *
 * The reaction control is one anonymous ❤️ per milestone detail page. This
 * suite guards the parts that must not drift between locales or routes:
 *
 *   - every milestone has exactly one control on both its EN and ES page;
 *   - the endpoint identity is the CANONICAL milestone id, byte-identical on
 *     both locales, so EN and ES share one counter (no `es/` in the path);
 *   - the initial accessible state is honest: a disabled, `aria-busy` toggle
 *     button with `aria-pressed="false"`, a polite live region and a no-JS note;
 *   - the EN/ES copy is the locale's, and exactly one ❤️ is present.
 *
 * The interactive pressed-state transition is a real-browser concern and lives
 * in `tests/visual/reactions.spec.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const DATA = resolve(import.meta.dirname, '..', '..', 'data', 'evolution.json');
const milestones = JSON.parse(readFileSync(DATA, 'utf8')).milestones;

const API_BASE = 'https://professional-evolution-portfolio.crisss198.workers.dev';

function pagePath(locale, id) {
  return join(DIST, locale === 'es' ? 'es' : '', 'evolution', id, 'index.html');
}

/** The one `<section class="milestone-reactions"> … </section>` block. */
function reactionSection(html) {
  const start = html.indexOf('<section class="milestone-reactions"');
  if (start === -1) return null;
  const end = html.indexOf('</section>', start);
  if (end === -1) return null;
  return html.slice(start, end + '</section>'.length);
}

test('every milestone detail page (EN and ES) renders one reaction control', () => {
  const failures = [];
  for (const milestone of milestones) {
    for (const locale of ['en', 'es']) {
      const file = pagePath(locale, milestone.id);
      if (!existsSync(file)) {
        failures.push(`${locale}/evolution/${milestone.id}/: page missing`);
        continue;
      }
      const html = readFileSync(file, 'utf8');
      const section = reactionSection(html);
      const occurrences = section ? section.split('data-reactions-button').length - 1 : 0;
      if (occurrences !== 1) {
        failures.push(`${locale}/evolution/${milestone.id}/: ${occurrences} reaction controls`);
      }
      if (!section) {
        failures.push(`${locale}/evolution/${milestone.id}/: reaction section missing`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('the reaction endpoint uses the canonical id and is identical across locales', () => {
  const failures = [];
  for (const milestone of milestones) {
    const expected = `${API_BASE}/api/milestones/${milestone.id}/reaction`;
    const endpoints = {};
    for (const locale of ['en', 'es']) {
      const html = readFileSync(pagePath(locale, milestone.id), 'utf8');
      const endpoint = html.match(/data-endpoint="([^"]+)"/)?.[1];
      endpoints[locale] = endpoint;
      if (endpoint !== expected) {
        failures.push(`${locale}/evolution/${milestone.id}/: endpoint ${endpoint} !== ${expected}`);
      }
      if (endpoint && endpoint.includes('es/evolution')) {
        failures.push(`${locale}/evolution/${milestone.id}/: locale leaked into endpoint ${endpoint}`);
      }
    }
    if (endpoints.en !== endpoints.es) {
      failures.push(`${milestone.id}: EN and ES endpoints differ (${endpoints.en} vs ${endpoints.es})`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('the initial control state is an honest, accessible loading toggle', () => {
  const failures = [];
  for (const milestone of milestones) {
    const html = readFileSync(pagePath('en', milestone.id), 'utf8');
    const section = reactionSection(html) || '';
    const button = section.match(/<button[^>]*data-reactions-button[^>]*>/)?.[0] ?? '';
    if (!/aria-pressed="false"/.test(button)) failures.push(`${milestone.id}: aria-pressed missing`);
    if (!/aria-busy="true"/.test(button)) failures.push(`${milestone.id}: aria-busy missing`);
    if (!/\bdisabled\b/.test(button)) failures.push(`${milestone.id}: initial button is not disabled`);
    if (!/role="group"/.test(section)) failures.push(`${milestone.id}: control is not a labelled group`);
    if (!/role="status"/.test(section) || !/aria-live="polite"/.test(section)) {
      failures.push(`${milestone.id}: live status region missing`);
    }
    if (!/<noscript>/.test(section)) failures.push(`${milestone.id}: no-JS note missing`);
    if (!/data-milestone="[a-z0-9-]+"/.test(section)) failures.push(`${milestone.id}: data-milestone missing`);
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('EN and ES render their own reaction copy', () => {
  const id = milestones[0].id;
  const en = reactionSection(readFileSync(pagePath('en', id), 'utf8')) ?? '';
  const es = reactionSection(readFileSync(pagePath('es', id), 'utf8')) ?? '';

  assert.match(en, />This was useful</);
  assert.match(es, />Me resultó útil</);
  assert.match(en, /role="group" aria-label="Reaction"/);
  assert.match(es, /role="group" aria-label="Reacción"/);
  assert.match(en, /Reactions need JavaScript/);
  assert.match(es, /Las reacciones necesitan JavaScript/);
  assert.match(en, /data-count-many="\{n\} people found this useful"/);
  assert.match(es, /data-count-many="A \{n\} personas les resultó útil"/);
});

test('exactly one heart SVG is rendered and no emoji heart is present', () => {
  for (const locale of ['en', 'es']) {
    const html = readFileSync(pagePath(locale, milestones[0].id), 'utf8');
    const section = reactionSection(html) ?? '';
    
    // Check for exactly one SVG heart with the correct class
    const heartSvgs = section.match(/<svg[^>]*class="milestone-reactions__heart"[^>]*>/g) ?? [];
    assert.equal(heartSvgs.length, 1, `${locale}: expected exactly one heart SVG`);
    
    // Verify the SVG has aria-hidden for accessibility
    assert.match(heartSvgs[0], /aria-hidden="true"/, `${locale}: heart SVG should have aria-hidden="true"`);
    
    // Verify the heart path is present
    assert.match(section, /M12 21\.35l-1\.45-1\.32C5\.4 15\.36/, `${locale}: heart SVG should contain the heart path`);
    
    // Ensure no emoji hearts are present
    const emojiHearts = section.match(/\u2764\uFE0F/gu) ?? [];
    assert.equal(emojiHearts.length, 0, `${locale}: emoji heart should not be present`);
    
    // No other emoji should be in the control
    const pictographs = new Set((section.match(/\p{Extended_Pictographic}/gu) ?? []));
    assert.deepEqual([...pictographs], [], `${locale}: no emoji should be in the control`);
  }
});
