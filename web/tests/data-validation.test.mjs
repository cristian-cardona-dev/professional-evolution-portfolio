import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DATA_SOURCE = join(ROOT, 'data');
const VALIDATOR = join(ROOT, 'scripts', 'data-validate.mjs');
let tempRoot;
let dataDir;
let originalEvolution;

function validate() {
  return spawnSync(process.execPath, [VALIDATOR], {
    encoding: 'utf8',
    env: { ...process.env, PORTFOLIO_DATA_DIR: dataDir },
  });
}

function writeEvolution(value) {
  writeFileSync(join(dataDir, 'evolution.json'), `${JSON.stringify(value, null, 2)}\n`);
}

before(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'milestone-data-validation-'));
  dataDir = join(tempRoot, 'data');
  cpSync(DATA_SOURCE, dataDir, { recursive: true });
  originalEvolution = JSON.parse(readFileSync(join(dataDir, 'evolution.json'), 'utf8'));
});

after(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('data validation accepts non-empty static Spanish narratives on every milestone', () => {
  writeEvolution(originalEvolution);
  const result = validate();
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('data validation rejects a missing narrativeEs', () => {
  const invalid = structuredClone(originalEvolution);
  delete invalid.milestones[0].narrativeEs;
  writeEvolution(invalid);
  const result = validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /"narrativeEs" must be a non-empty static Spanish narrative/);
});

test('data validation rejects an empty narrativeEs', () => {
  const invalid = structuredClone(originalEvolution);
  invalid.milestones[0].narrativeEs = '   ';
  writeEvolution(invalid);
  const result = validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /"narrativeEs" must be a non-empty static Spanish narrative/);
});

test('data validation rejects git candidates that omit the unreviewed candidate label', () => {
  const invalid = structuredClone(originalEvolution);
  const candidate = invalid.milestones.find((milestone) => milestone.source === 'git');
  assert.ok(candidate, 'fixture includes generated git candidates');
  candidate.narrative = 'A polished English narrative.';
  candidate.narrativeEs = 'Una narración en español.';
  writeEvolution(invalid);
  const result = validate();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /git-derived "narrative" must identify itself as a candidate/);
  assert.match(result.stderr, /git-derived "narrativeEs" must identify itself as a candidate/);
});
