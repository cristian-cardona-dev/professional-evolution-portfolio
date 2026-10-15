import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMilestone } from './evolution-generate.mjs';

test('git-generated milestones are explicitly unreviewed candidates in both locales', () => {
  const milestone = toMilestone(
    {
      id: 'git-2026-10-15-feat-example',
      date: '2026-10-15',
      title: 'Example change',
      subject: 'feat: example change',
    },
    ['abcdef0123456789'],
  );

  assert.equal(milestone.source, 'git');
  assert.match(milestone.narrative, /candidate/i);
  assert.match(milestone.narrative, /unreviewed/i);
  assert.match(milestone.narrativeEs, /candidato/i);
  assert.match(milestone.narrativeEs, /no está revisada/i);
});
