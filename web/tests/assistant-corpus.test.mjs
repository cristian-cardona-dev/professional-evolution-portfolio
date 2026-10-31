import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantEntries, resolveMilestoneTitle } from '../src/lib/assistant-corpus.ts';
import { fold, words } from '../src/lib/assistant-search.ts';
import { copyByLocale } from '../src/i18n/copy.ts';

test('Spanish milestone snippets use narrative_es and retain English title search tokens', () => {
  const milestone = {
    title: 'Reviewed Narrative Launch',
    title_es: 'Lanzamiento de narrativa revisada',
    narrative: 'The canonical English milestone narrative.',
    narrative_es: 'La narrativa canónica de la etapa en español.',
    status: 'shipped',
    date: '2026-10-15',
  };
  const entries = buildAssistantEntries(
    {
      profile: { name: 'Cristian', headline: 'Engineer', email: 'hello@example.com' },
      projects: [],
      milestones: [milestone],
      evidence: { items: [] },
    },
    copyByLocale.es,
    'es',
    {
      route: (_locale, path = '') => path,
      milestoneTitle: resolveMilestoneTitle,
    },
  );
  const entry = entries.find((candidate) => candidate.ty === 'evolution');

  assert.ok(entry, 'Spanish assistant index contains the milestone');
  assert.equal(entry.ti, milestone.title_es);
  assert.equal(entry.we, fold(milestone.narrative_es));
  assert.equal(entry.sn, milestone.narrative_es);
  assert.ok(words(milestone.title).every((token) => entry.lo.includes(token)));
  assert.ok(!entry.sn.includes(milestone.narrative));
});
