/**
 * Freshness guard tests for github-activity/validate.mjs.
 *
 * Runs the validator as a subprocess against temporary snapshot files so the
 * --max-age-days CLI flag and the captured_at freshness logic are exercised
 * without touching the real snapshot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not `new URL(...).pathname`: on POSIX the pathname starts
// with "/" and stripping it (as a Windows-oriented version did) turns an
// absolute path into a relative one that does not exist, which failed every
// subprocess spawn in CI while still passing on Windows.
const VALIDATOR = fileURLToPath(new URL('../github-activity/validate.mjs', import.meta.url));

/** Build a minimal valid snapshot with the given captured_at. */
function makeSnapshot(capturedAt) {
  return {
    schema_version: '1.0.0',
    snapshot_id: 'test-snapshot',
    captured_at: capturedAt,
    status: {
      availability: 'available',
      stale: false,
      message: 'Public GitHub activity captured from the GitHub REST API at build time.',
    },
    source: { provider: 'github', mode: 'build_snapshot', url: 'https://github.com/' },
    allowed_repositories: ['https://github.com/cristian-cardona-dev/professional-evolution-portfolio'],
    repositories: [
      {
        id: 'cristian-cardona-dev/professional-evolution-portfolio',
        url: 'https://github.com/cristian-cardona-dev/professional-evolution-portfolio',
        visibility: 'public',
        open_pull_requests: 0,
        pull_requests: [],
        commits: [],
        releases: [],
        deployments: [],
      },
    ],
  };
}

function toIso(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function runValidator(snapshot, extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), 'snap-'));
  const file = join(dir, 'snapshot.json');
  writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  try {
    execFileSync(process.execPath, [VALIDATOR, file, ...extraArgs], { stdio: 'pipe' });
    return { code: 0, stderr: '' };
  } catch (err) {
    return { code: err.status ?? 1, stderr: (err.stderr || '').toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('fresh snapshot passes with --max-age-days=14', () => {
  const now = Date.now();
  const snap = makeSnapshot(toIso(now));
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.equal(r.code, 0, `expected pass, got: ${r.stderr}`);
});

test('stale snapshot (30 days) fails with --max-age-days=14', () => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const snap = makeSnapshot(toIso(thirtyDaysAgo));
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.notEqual(r.code, 0, 'expected failure for stale snapshot');
  assert.match(r.stderr, /older than 14 days/);
});

test('just inside 14 days passes (boundary inclusive)', () => {
  // 5s of headroom: toIso() truncates to whole seconds (up to 999ms older) and
  // the subprocess takes ~100ms, so an exact-14-day stamp would age past the
  // limit mid-run. The assertion still sits within seconds of the boundary.
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000 + 5_000;
  const snap = makeSnapshot(toIso(fourteenDaysAgo));
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.equal(r.code, 0, `expected pass at boundary, got: ${r.stderr}`);
});

test('just past 14 days fails (boundary exclusive)', () => {
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000 - 60_000;
  const snap = makeSnapshot(toIso(fourteenDaysAgo));
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.notEqual(r.code, 0, 'expected failure one minute past the limit');
  assert.match(r.stderr, /older than 14 days/);
});

test('invalid captured_at fails', () => {
  const snap = makeSnapshot('not-a-date');
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.notEqual(r.code, 0, 'expected failure for invalid timestamp');
});

test('without --max-age-days, 90-day stale consistency check applies', () => {
  // A 100-day-old snapshot with stale:false should fail the 90-day consistency check.
  const hundredDaysAgo = Date.now() - 100 * 24 * 60 * 60 * 1000;
  const snap = makeSnapshot(toIso(hundredDaysAgo));
  const r = runValidator(snap, []);
  assert.notEqual(r.code, 0, 'expected failure for 90-day stale consistency');
});

test('partial availability with failed_repos is accepted', () => {
  const snap = makeSnapshot(toIso(Date.now()));
  snap.status.availability = 'partial';
  snap.status.failed_repos = ['cristian-cardona-dev/professional-evolution-portfolio'];
  snap.status.message = 'Public GitHub activity captured from the GitHub REST API at build time. 1 of 1 repositories could not be refreshed; their records may be out of date.';
  snap.repositories[0].error = 'last_refresh_failed';
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.equal(r.code, 0, `expected pass, got: ${r.stderr}`);
});

function addCommit(snap, title) {
  snap.repositories[0].commits = [
    {
      id: 'abc123def456',
      url: 'https://github.com/cristian-cardona-dev/professional-evolution-portfolio/commit/abc123def456',
      captured_at: toIso(Date.now()),
      title,
    },
  ];
  return snap;
}

test('prose commit title "private repository" does not fire the secret guard', () => {
  const snap = addCommit(makeSnapshot(toIso(Date.now())), 'feat: private repository handling');
  // second title to exercise the personal-repository phrase too
  snap.repositories[0].commits.push({
    id: 'def456abc789',
    url: 'https://github.com/cristian-cardona-dev/professional-evolution-portfolio/commit/def456abc789',
    captured_at: toIso(Date.now()),
    title: 'docs: personal repository policy',
  });
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.equal(r.code, 0, `expected pass, got: ${r.stderr}`);
});

test('credential-shaped commit title fires the secret guard', () => {
  const token = 'ghp_' + 'a'.repeat(24);
  const snap = addCommit(makeSnapshot(toIso(Date.now())), `leak: ${token}`);
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.notEqual(r.code, 0, 'expected failure for credential shape');
  assert.match(r.stderr, /credential material/);
});

test('assignment-shaped "private repository =" fires the secret guard', () => {
  const snap = addCommit(makeSnapshot(toIso(Date.now())), 'rotate: private repository = rotated');
  const r = runValidator(snap, ['--max-age-days=14']);
  assert.notEqual(r.code, 0, 'expected failure for assignment marker');
  assert.match(r.stderr, /private-data marker/);
});
