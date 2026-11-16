import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  cleanUrl,
  slugFromUrl,
  canonicalUrl,
  toIso,
  firstLine,
  isBotAuthor,
  isStale,
  retry,
  fetchRepoActivity,
  fetchCommits,
  OWN_COMMIT_MESSAGES,
  buildSnapshot,
  loadHealth,
  saveHealth,
  updateHealth,
  consecutiveFailures,
  chronicFailures,
  formatLogLine,
  formatStepSummary,
  runRefresh,
  discoverPublicRepos,
} from './lib/activity-refresh-core.mjs';

const NOW = new Date('2026-11-15T12:00:00.000Z').getTime();
const TODAY = '2026-11-15';

function withTempDir(cb) {
  const dir = mkdtempSync(join(tmpdir(), 'activity-refresh-'));
  try {
    return cb(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(cb) {
  const dir = mkdtempSync(join(tmpdir(), 'activity-refresh-'));
  try {
    return await cb(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeSnapshot(allowed_repositories = ['https://github.com/cristian-cardona-dev/demo']) {
  return {
    schema_version: '1.0.0',
    snapshot_id: 'test-snapshot',
    captured_at: '2026-11-14T12:00:00Z',
    status: { availability: 'available', stale: false, message: 'Public GitHub activity captured from the GitHub REST API at build time.' },
    source: { provider: 'github', mode: 'build_snapshot', url: 'https://github.com/' },
    allowed_repositories,
    repositories: [],
  };
}

function writeSnapshot(dir, snapshot) {
  const file = join(dir, 'snapshot.json');
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return file;
}

function makeCommit(sha, date, message, authorName) {
  return {
    sha,
    html_url: `https://github.com/cristian-cardona-dev/demo/commit/${sha}`,
    commit: {
      author: { name: authorName, date },
      message,
    },
    author: { login: authorName },
  };
}

function commitsPath(owner, repo) {
  return `/repos/${owner}/${repo}/commits?per_page=10`;
}

function pullsPath(owner, repo) {
  return `/repos/${owner}/${repo}/pulls?state=open&per_page=1`;
}

function releasePath(owner, repo) {
  return `/repos/${owner}/${repo}/releases/latest`;
}

function makeRequest(handlers) {
  return async (path, { etag } = {}) => {
    for (const handler of handlers) {
      const res = await handler(path, etag);
      if (res) return res;
    }
    return { status: 404, headers: {}, body: 'null' };
  };
}

test('cleanUrl removes trailing slashes', () => {
  assert.equal(cleanUrl('https://github.com/a/b/'), 'https://github.com/a/b');
});

test('slugFromUrl extracts owner/repo', () => {
  assert.equal(slugFromUrl('https://github.com/cristian-cardona-dev/demo'), 'cristian-cardona-dev/demo');
});

test('canonicalUrl forces canonical owner', () => {
  assert.equal(canonicalUrl('https://github.com/old-owner/demo'), 'https://github.com/cristian-cardona-dev/demo');
});

test('toIso truncates to whole seconds', () => {
  assert.equal(toIso('2026-11-15T12:00:00.123Z'), '2026-11-15T12:00:00Z');
});

test('firstLine returns first non-empty line', () => {
  assert.equal(firstLine('hello\nworld', 'fallback'), 'hello');
  assert.equal(firstLine('', 'fallback'), 'fallback');
});

test('isBotAuthor recognizes known bots', () => {
  assert.ok(isBotAuthor('dependabot[bot]'));
  assert.ok(isBotAuthor('renovate[bot]'));
  assert.ok(isBotAuthor('github-actions[bot]'));
  assert.ok(!isBotAuthor('Cristian Cardona'));
});

test('isStale flags old timestamps', () => {
  assert.ok(isStale('2026-01-01T00:00:00Z', 90));
  assert.ok(!isStale(toIso(NOW), 90));
});

test('retry succeeds after transient failures', async () => {
  let attempts = 0;
  const result = await retry('test', async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('GitHub API 500 for /test');
    return 'ok';
  }, { maxRetries: 3, retryBaseMs: 0, sleepFn: async () => {} });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('retry does not retry non-transient failures', async () => {
  let attempts = 0;
  await assert.rejects(retry('test', async () => {
    attempts += 1;
    throw new Error('permanent failure');
  }, { maxRetries: 3, retryBaseMs: 0, sleepFn: async () => {} }));
  assert.equal(attempts, 1);
});

test('fetchRepoActivity succeeds with commits, PRs and release', async () => {
  const request = makeRequest([
    (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { etag: '"abc123"' }, body: JSON.stringify([makeCommit('sha1', toIso(NOW), 'feat: first', 'Cristian')]) } : null,
    (path) => path === pullsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { 'x-total-count': '2' }, body: '[]' } : null,
    (path) => path === releasePath('cristian-cardona-dev', 'demo') ? { status: 200, headers: {}, body: JSON.stringify({ id: 1, html_url: 'https://github.com/cristian-cardona-dev/demo/releases/tag/v1', published_at: toIso(NOW), tag_name: 'v1' }) } : null,
  ]);
  const result = await fetchRepoActivity('cristian-cardona-dev', 'demo', { request, now: NOW });
  assert.equal(result.status, 'success');
  assert.equal(result.record.commits.length, 1);
  assert.equal(result.record.open_pull_requests, 2);
  assert.equal(result.record.releases.length, 1);
  assert.equal(result.record.etag, '"abc123"');
});

test('fetchRepoActivity reuses previous record on 304', async () => {
  const previous = {
    id: 'cristian-cardona-dev/demo',
    url: 'https://github.com/cristian-cardona-dev/demo',
    visibility: 'public',
    pull_requests: [],
    commits: [{ id: 'old', url: 'https://github.com/cristian-cardona-dev/demo/commit/old', captured_at: toIso(NOW), title: 'old' }],
    releases: [],
    deployments: [],
    open_pull_requests: 5,
    etag: '"cached"',
  };
  const request = makeRequest([
    (path, etag) => path === commitsPath('cristian-cardona-dev', 'demo') && etag === '"cached"' ? { status: 304, headers: {}, body: '' } : null,
  ]);
  const result = await fetchRepoActivity('cristian-cardona-dev', 'demo', { request, previousRecord: previous, now: NOW });
  assert.equal(result.status, 'success');
  assert.equal(result.record, previous);
});

test('fetchRepoActivity marks bot commits', async () => {
  const request = makeRequest([
    (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: {}, body: JSON.stringify([
      makeCommit('sha1', toIso(NOW), 'feat: first', 'Cristian'),
      makeCommit('sha2', toIso(NOW), 'chore: bump', 'dependabot[bot]'),
    ]) } : null,
    (path) => path === pullsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { 'x-total-count': '0' }, body: '[]' } : null,
    (path) => path === releasePath('cristian-cardona-dev', 'demo') ? { status: 404, headers: {}, body: '{}' } : null,
  ]);
  const result = await fetchRepoActivity('cristian-cardona-dev', 'demo', { request, now: NOW });
  assert.equal(result.record.commits[0].bot, undefined);
  assert.equal(result.record.commits[1].bot, true);
});

// --- Repository lifecycle (plan phase 9.6) --------------------------------

test('fetchRepoActivity marks a deleted repository unavailable (404)', async () => {
  const previous = {
    id: 'cristian-cardona-dev/demo',
    url: 'https://github.com/cristian-cardona-dev/demo',
    visibility: 'public',
    pull_requests: [],
    commits: [makeCommit('old', toIso(NOW), 'stale commit', 'Cristian')],
    releases: [],
    deployments: [],
    open_pull_requests: 5,
  };
  const request = makeRequest([
    (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 404, headers: {}, body: '{}' } : null,
  ]);
  const result = await fetchRepoActivity('cristian-cardona-dev', 'demo', {
    request,
    previousRecord: previous,
    now: NOW,
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.record.unavailable, true);
  // The stale card must NOT survive: a gone repository carries no data.
  assert.equal(result.record.commits.length, 0);
  assert.equal(result.record.open_pull_requests, 0);
  assert.equal(result.record.error, undefined);
});

test('fetchRepoActivity treats 410 Gone as unavailable', async () => {
  const request = makeRequest([
    (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 410, headers: {}, body: '{}' } : null,
  ]);
  const result = await fetchRepoActivity('cristian-cardona-dev', 'demo', { request, now: NOW });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.record.unavailable, true);
});

test('buildSnapshot reports unavailable when every repository is gone', () => {
  const results = [
    {
      slug: 'cristian-cardona-dev/demo',
      status: 'unavailable',
      durationMs: 1,
      record: {
        id: 'cristian-cardona-dev/demo',
        url: 'https://github.com/cristian-cardona-dev/demo',
        visibility: 'public',
        pull_requests: [],
        commits: [],
        releases: [],
        deployments: [],
        open_pull_requests: 0,
        unavailable: true,
      },
    },
  ];
  const next = buildSnapshot({ snapshot: makeSnapshot(), results, capturedAt: toIso(NOW) });
  assert.equal(next.status.availability, 'unavailable');
  assert.equal(next.status.failed_repos, undefined);
  assert.equal(next.repositories[0].unavailable, true);
});

test('buildSnapshot does not count a gone repository as a refresh failure', () => {
  const results = [
    {
      slug: 'cristian-cardona-dev/demo',
      status: 'unavailable',
      durationMs: 1,
      record: {
        id: 'cristian-cardona-dev/demo',
        url: 'https://github.com/cristian-cardona-dev/demo',
        visibility: 'public',
        pull_requests: [],
        commits: [],
        releases: [],
        deployments: [],
        open_pull_requests: 0,
        unavailable: true,
      },
    },
    {
      slug: 'cristian-cardona-dev/other',
      status: 'success',
      durationMs: 1,
      record: {
        id: 'cristian-cardona-dev/other',
        url: 'https://github.com/cristian-cardona-dev/other',
        visibility: 'public',
        pull_requests: [],
        commits: [makeCommit('sha1', toIso(NOW), 'feat: live', 'Cristian')],
        releases: [],
        deployments: [],
        open_pull_requests: 1,
      },
    },
  ];
  const next = buildSnapshot({ snapshot: makeSnapshot(), results, capturedAt: toIso(NOW) });
  assert.equal(next.status.availability, 'available');
  assert.equal(next.status.failed_repos, undefined);
});

test('buildSnapshot expresses partial failure', () => {
  const results = [
    { slug: 'cristian-cardona-dev/a', status: 'success', durationMs: 10, record: { id: 'cristian-cardona-dev/a', url: 'https://github.com/cristian-cardona-dev/a', visibility: 'public', pull_requests: [], commits: [{ id: 'c1', url: 'https://github.com/cristian-cardona-dev/a/commit/c1', captured_at: toIso(NOW), title: 'x' }], releases: [], deployments: [], open_pull_requests: 0 } },
    { slug: 'cristian-cardona-dev/b', status: 'fail', durationMs: 5, error: 'boom', record: { id: 'cristian-cardona-dev/b', url: 'https://github.com/cristian-cardona-dev/b', visibility: 'public', pull_requests: [], commits: [], releases: [], deployments: [], error: 'last_refresh_failed' } },
  ];
  const snapshot = makeSnapshot(['https://github.com/cristian-cardona-dev/a', 'https://github.com/cristian-cardona-dev/b']);
  const next = buildSnapshot({ snapshot, results, capturedAt: toIso(NOW) });
  assert.equal(next.status.availability, 'partial');
  assert.deepEqual(next.status.failed_repos, ['cristian-cardona-dev/b']);
  assert.ok(next.status.message.includes('could not be refreshed'));
});

test('buildSnapshot expresses empty when no activity', () => {
  const results = [
    { slug: 'cristian-cardona-dev/a', status: 'success', durationMs: 10, record: { id: 'cristian-cardona-dev/a', url: 'https://github.com/cristian-cardona-dev/a', visibility: 'public', pull_requests: [], commits: [], releases: [], deployments: [], open_pull_requests: 0 } },
  ];
  const snapshot = makeSnapshot(['https://github.com/cristian-cardona-dev/a']);
  const next = buildSnapshot({ snapshot, results, capturedAt: toIso(NOW) });
  assert.equal(next.status.availability, 'empty');
});

test('updateHealth keeps a rolling 30-day window', () => {
  const health = { repositories: {} };
  const results = [{ slug: 'cristian-cardona-dev/a', status: 'success' }];
  const updated = updateHealth(health, results, NOW);
  assert.equal(updated.repositories['cristian-cardona-dev/a'].length, 1);
  assert.equal(updated.repositories['cristian-cardona-dev/a'][0].date, TODAY);
  assert.equal(updated.repositories['cristian-cardona-dev/a'][0].success, true);

  const oldEntry = { date: '2026-09-01', success: true };
  const withOld = { repositories: { 'cristian-cardona-dev/a': [oldEntry] } };
  const pruned = updateHealth(withOld, results, NOW);
  assert.equal(pruned.repositories['cristian-cardona-dev/a'].length, 1);
  assert.equal(pruned.repositories['cristian-cardona-dev/a'][0].date, TODAY);
});

test('updateHealth does not build a failure streak for an unavailable repository', () => {
  const health = { repositories: {} };
  const results = [{ slug: 'cristian-cardona-dev/gone', status: 'unavailable' }];
  const updated = updateHealth(health, results, NOW);
  assert.equal(updated.repositories['cristian-cardona-dev/gone'][0].success, true);
});

test('consecutiveFailures counts only the trailing run', () => {
  assert.equal(consecutiveFailures([]), 0);
  assert.equal(consecutiveFailures([{ date: '2026-11-15', success: true }]), 0);
  assert.equal(
    consecutiveFailures([
      { date: '2026-11-15', success: false },
      { date: '2026-11-14', success: false },
      { date: '2026-11-13', success: true },
    ]),
    2,
  );
  // Order in the file is chronological; the streak must be read backwards.
  assert.equal(
    consecutiveFailures([
      { date: '2026-11-13', success: true },
      { date: '2026-11-14', success: false },
      { date: '2026-11-15', success: false },
    ]),
    2,
  );
  // One healthy day resets it.
  assert.equal(
    consecutiveFailures([
      { date: '2026-11-15', success: true },
      { date: '2026-11-14', success: false },
      { date: '2026-11-13', success: false },
    ]),
    0,
  );
});

test('chronicFailures reports repos at the threshold and sorts by streak', () => {
  const health = {
    repositories: {
      'cristian-cardona-dev/two': [
        { date: '2026-11-14', success: false },
        { date: '2026-11-15', success: false },
      ],
      'cristian-cardona-dev/three': [
        { date: '2026-11-13', success: false },
        { date: '2026-11-14', success: false },
        { date: '2026-11-15', success: false },
      ],
      'cristian-cardona-dev/four': [
        { date: '2026-11-12', success: false },
        { date: '2026-11-13', success: false },
        { date: '2026-11-14', success: false },
        { date: '2026-11-15', success: false },
      ],
      'cristian-cardona-dev/healthy': [{ date: '2026-11-15', success: true }],
    },
  };
  const chronic = chronicFailures(health, 3);
  assert.deepEqual(
    chronic.map((c) => c.slug),
    ['cristian-cardona-dev/four', 'cristian-cardona-dev/three'],
  );
  assert.equal(chronic[0].streak, 4);
  assert.equal(chronic[1].streak, 3);
  assert.equal(chronicFailures(health, 99).length, 0);
});

test('formatLogLine returns a single structured JSON object', () => {
  const line = formatLogLine({
    runId: 'r1',
    startedAt: toIso(NOW),
    finishedAt: toIso(NOW),
    repos: [{ slug: 'a/b', status: 'success', duration_ms: 10, commits: 1, error: undefined }],
    totalSuccess: 1,
    totalFail: 0,
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.run_id, 'r1');
  assert.equal(parsed.total_success, 1);
});

test('formatStepSummary renders a markdown table', () => {
  const summary = formatStepSummary({
    repos: [{ slug: 'cristian-cardona-dev/a', status: 'success', durationMs: 12, record: { commits: [{ captured_at: toIso(NOW) }], open_pull_requests: 1 } }],
    health: { repositories: { 'cristian-cardona-dev/a': [{ date: TODAY, success: true }] } },
    startedAt: toIso(NOW),
    finishedAt: toIso(NOW),
  });
  assert.match(summary, /## GitHub Activity Refresh/);
  assert.match(summary, /\| Repository \|/);
  assert.match(summary, /cristian-cardona-dev\/a/);
});

test('runRefresh dry-run writes nothing', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshotFile = writeSnapshot(dir, makeSnapshot());
    const healthFile = join(dir, 'health.json');
    const request = makeRequest([
      (path) => path.startsWith('/users/') && path.includes('/repos') ? { status: 200, headers: {}, body: JSON.stringify([{ full_name: 'cristian-cardona-dev/demo', private: false, owner: { login: 'cristian-cardona-dev' } }]) } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: {}, body: JSON.stringify([makeCommit('sha1', toIso(NOW), 'feat: first', 'Cristian')]) } : null,
      (path) => path === pullsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { 'x-total-count': '0' }, body: '[]' } : null,
      (path) => path === releasePath('cristian-cardona-dev', 'demo') ? { status: 404, headers: {}, body: '{}' } : null,
    ]);
    const logs = [];
    await runRefresh({
      dryRun: true,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      runId: 'dry-run-test',
      log: (msg) => logs.push(msg),
      warn: () => {},
    });
    const after = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    assert.equal(after.captured_at, '2026-11-14T12:00:00Z');
    assert.ok(!existsSync(healthFile));
    assert.ok(logs.some((msg) => msg === 'activity-refresh: --dry-run, snapshot NOT written'));
  });
});

test('runRefresh full success writes snapshot and health', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshotFile = writeSnapshot(dir, makeSnapshot());
    const healthFile = join(dir, 'health.json');
    const request = makeRequest([
      (path) => path.startsWith('/users/') && path.includes('/repos') ? { status: 200, headers: {}, body: JSON.stringify([{ full_name: 'cristian-cardona-dev/demo', private: false, owner: { login: 'cristian-cardona-dev' } }]) } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { etag: '"etag1"' }, body: JSON.stringify([makeCommit('sha1', toIso(NOW), 'feat: first', 'Cristian')]) } : null,
      (path) => path === pullsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { 'x-total-count': '2' }, body: '[]' } : null,
      (path) => path === releasePath('cristian-cardona-dev', 'demo') ? { status: 404, headers: {}, body: '{}' } : null,
    ]);
    const { snapshot } = await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      runId: 'success-test',
      log: () => {},
      warn: () => {},
    });
    assert.equal(snapshot.status.availability, 'available');
    assert.equal(snapshot.repositories[0].open_pull_requests, 2);
    assert.equal(snapshot.repositories[0].etag, '"etag1"');
    const health = JSON.parse(readFileSync(healthFile, 'utf8'));
    assert.equal(health.repositories['cristian-cardona-dev/demo'][0].success, true);
    assert.ok(existsSync(`${snapshotFile}.bak`));
  });
});

test('runRefresh partial failure keeps previous record with error marker', async () => {
  await withTempDirAsync(async (dir) => {
    const previousRepo = {
      id: 'cristian-cardona-dev/failing',
      url: 'https://github.com/cristian-cardona-dev/failing',
      visibility: 'public',
      pull_requests: [],
      commits: [{ id: 'old', url: 'https://github.com/cristian-cardona-dev/failing/commit/old', captured_at: toIso(NOW), title: 'old' }],
      releases: [],
      deployments: [],
      open_pull_requests: 1,
    };
    const snapshot = makeSnapshot(['https://github.com/cristian-cardona-dev/ok', 'https://github.com/cristian-cardona-dev/failing']);
    snapshot.repositories = [previousRepo];
    const snapshotFile = writeSnapshot(dir, snapshot);
    const healthFile = join(dir, 'health.json');
    const request = makeRequest([
      (path) => path.startsWith('/users/') && path.includes('/repos') ? { status: 200, headers: {}, body: JSON.stringify([
        { full_name: 'cristian-cardona-dev/ok', private: false, owner: { login: 'cristian-cardona-dev' } },
        { full_name: 'cristian-cardona-dev/failing', private: false, owner: { login: 'cristian-cardona-dev' } },
      ]) } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'ok') ? { status: 200, headers: {}, body: JSON.stringify([makeCommit('ok1', toIso(NOW), 'feat: ok', 'Cristian')]) } : null,
      (path) => path === pullsPath('cristian-cardona-dev', 'ok') ? { status: 200, headers: { 'x-total-count': '0' }, body: '[]' } : null,
      (path) => path === releasePath('cristian-cardona-dev', 'ok') ? { status: 404, headers: {}, body: '{}' } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'failing') ? { status: 500, headers: {}, body: '{}' } : null,
    ]);
    const { snapshot: next } = await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      maxRetries: 1,
      retryBaseMs: 0,
      sleepFn: async () => {},
      log: () => {},
      warn: () => {},
    });
    assert.equal(next.status.availability, 'partial');
    assert.deepEqual(next.status.failed_repos, ['cristian-cardona-dev/failing']);
    const failingRecord = next.repositories.find((r) => r.id === 'cristian-cardona-dev/failing');
    assert.equal(failingRecord.error, 'last_refresh_failed');
    const okRecord = next.repositories.find((r) => r.id === 'cristian-cardona-dev/ok');
    assert.equal(okRecord.commits.length, 1);
    const health = JSON.parse(readFileSync(healthFile, 'utf8'));
    assert.equal(health.repositories['cristian-cardona-dev/failing'][0].success, false);
    assert.equal(health.repositories['cristian-cardona-dev/ok'][0].success, true);
  });
});

test('runRefresh total failure exits non-zero', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshotFile = writeSnapshot(dir, makeSnapshot());
    const healthFile = join(dir, 'health.json');
    const request = makeRequest([
      (path) => path.startsWith('/users/') && path.includes('/repos') ? { status: 200, headers: {}, body: JSON.stringify([{ full_name: 'cristian-cardona-dev/demo', private: false, owner: { login: 'cristian-cardona-dev' } }]) } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 500, headers: {}, body: '{}' } : null,
    ]);
    await assert.rejects(runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      maxRetries: 1,
      retryBaseMs: 0,
      sleepFn: async () => {},
      log: () => {},
      warn: () => {},
    }), (err) => err.exitCode === 1);
  });
});

test('runRefresh rate limit exits gracefully with rateLimited result', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshotFile = writeSnapshot(dir, makeSnapshot());
    const healthFile = join(dir, 'health.json');
    const reset = Math.floor(Date.now() / 1000) + 3600;
    const request = makeRequest([
      (path) => path.startsWith('/users/') && path.includes('/repos') ? { status: 200, headers: {}, body: JSON.stringify([{ full_name: 'cristian-cardona-dev/demo', private: false, owner: { login: 'cristian-cardona-dev' } }]) } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { 'x-ratelimit-remaining': '2', 'x-ratelimit-reset': String(reset) }, body: JSON.stringify([makeCommit('sha1', toIso(NOW), 'feat: first', 'Cristian')]) } : null,
    ]);
    let slept = 0;
    const result = await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      sleepFn: async (ms) => { slept += ms; },
      log: () => {},
      warn: () => {},
    });
    assert.ok(result.rateLimited);
    assert.ok(slept > 0);
  });
});

test('runRefresh appends step summary when path is provided', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshotFile = writeSnapshot(dir, makeSnapshot());
    const healthFile = join(dir, 'health.json');
    const summaryFile = join(dir, 'summary.md');
    const request = makeRequest([
      (path) => path.startsWith('/users/') && path.includes('/repos') ? { status: 200, headers: {}, body: JSON.stringify([{ full_name: 'cristian-cardona-dev/demo', private: false, owner: { login: 'cristian-cardona-dev' } }]) } : null,
      (path) => path === commitsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: {}, body: JSON.stringify([makeCommit('sha1', toIso(NOW), 'feat: first', 'Cristian')]) } : null,
      (path) => path === pullsPath('cristian-cardona-dev', 'demo') ? { status: 200, headers: { 'x-total-count': '0' }, body: '[]' } : null,
      (path) => path === releasePath('cristian-cardona-dev', 'demo') ? { status: 404, headers: {}, body: '{}' } : null,
    ]);
    await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      stepSummaryPath: summaryFile,
      log: () => {},
      warn: () => {},
    });
    const summary = readFileSync(summaryFile, 'utf8');
    assert.match(summary, /## GitHub Activity Refresh/);
    assert.match(summary, /30-day health/);
  });
});

// --- F10: exclude the automation's own commits from the feed ---------------

test('fetchCommits excludes the automation own commits (F10)', async () => {
  const request = async () => ({
    status: 200,
    headers: { etag: '"e"' },
    body: JSON.stringify([
      makeCommit('own1', toIso(NOW), 'ai(portfolio): refresh public github activity', 'github-actions[bot]'),
      makeCommit('own2', toIso(NOW), 'ai(portfolio): record activity refresh health', 'github-actions[bot]'),
      makeCommit('h1', toIso(NOW), 'feat: one', 'Cristian'),
      makeCommit('h2', toIso(NOW), 'feat: two', 'Cristian'),
      makeCommit('h3', toIso(NOW), 'feat: three', 'Cristian'),
    ]),
  });
  const { commits } = await fetchCommits(request, 'cristian-cardona-dev', 'demo', { commitsPerRepo: 3 });
  assert.equal(commits.length, 3);
  assert.deepEqual(commits.map((c) => c.title), ['feat: one', 'feat: two', 'feat: three']);
  assert.ok(!commits.some((c) => OWN_COMMIT_MESSAGES.includes(c.title)));
});

test('fetchCommits over-fetch buffer prevents starvation (F10)', async () => {
  const payload = [
    makeCommit('own1', toIso(NOW), 'ai(portfolio): refresh public github activity', 'github-actions[bot]'),
    makeCommit('own2', toIso(NOW), 'ai(portfolio): record activity refresh health', 'github-actions[bot]'),
    makeCommit('h1', toIso(NOW), 'feat: one', 'Cristian'),
    makeCommit('h2', toIso(NOW), 'feat: two', 'Cristian'),
    makeCommit('h3', toIso(NOW), 'feat: three', 'Cristian'),
  ];
  const request = async (path) => {
    const m = String(path).match(/per_page=(\d+)/);
    const n = m ? Number(m[1]) : payload.length;
    return { status: 200, headers: {}, body: JSON.stringify(payload.slice(0, n)) };
  };
  const { commits } = await fetchCommits(request, 'cristian-cardona-dev', 'demo', { commitsPerRepo: 3 });
  assert.equal(commits.length, 3);
  assert.deepEqual(commits.map((c) => c.title), ['feat: one', 'feat: two', 'feat: three']);
});

test('fetchRepoActivity loop-closure: own-commit-only run yields byte-identical record incl. etag (F10)', async () => {
  const humans = [
    makeCommit('h1', toIso(NOW), 'feat: one', 'Cristian'),
    makeCommit('h2', toIso(NOW), 'feat: two', 'Cristian'),
    makeCommit('h3', toIso(NOW), 'feat: three', 'Cristian'),
  ];
  const ownTitle = OWN_COMMIT_MESSAGES[0];
  const payloadN = [
    makeCommit('ownN', toIso(NOW), ownTitle, 'github-actions[bot]'),
    ...humans,
  ];
  const payloadN1 = [
    makeCommit('ownN1', toIso(NOW), ownTitle, 'github-actions[bot]'),
    makeCommit('ownN', toIso(NOW), ownTitle, 'github-actions[bot]'),
    ...humans,
  ];

  // Run N: no previous record; commits endpoint reports etag E1.
  const reqN = makeRequest([
    (path) => path === commitsPath('cristian-cardona-dev', 'demo')
      ? { status: 200, headers: { etag: '"E1"' }, body: JSON.stringify(payloadN) } : null,
    (path) => path === pullsPath('cristian-cardona-dev', 'demo')
      ? { status: 200, headers: { 'x-total-count': '0' }, body: '[]' } : null,
    (path) => path === releasePath('cristian-cardona-dev', 'demo')
      ? { status: 404, headers: {}, body: '{}' } : null,
  ]);
  const resN = await fetchRepoActivity('cristian-cardona-dev', 'demo', { request: reqN, now: NOW });
  assert.equal(resN.status, 'success');
  const recordN = resN.record;

  // Run N+1: previous record = recordN; commits endpoint moved (E2) because
  // the refresh's own commit landed. Filtered commit list is unchanged.
  const reqN1 = makeRequest([
    (path) => path === commitsPath('cristian-cardona-dev', 'demo')
      ? { status: 200, headers: { etag: '"E2"' }, body: JSON.stringify(payloadN1) } : null,
    (path) => path === pullsPath('cristian-cardona-dev', 'demo')
      ? { status: 200, headers: { 'x-total-count': '0' }, body: '[]' } : null,
    (path) => path === releasePath('cristian-cardona-dev', 'demo')
      ? { status: 404, headers: {}, body: '{}' } : null,
  ]);
  const resN1 = await fetchRepoActivity('cristian-cardona-dev', 'demo', { request: reqN1, previousRecord: recordN, now: NOW });
  assert.equal(resN1.status, 'success');
  const recordN1 = resN1.record;

  // Full records (including etag and full commit objects) must be byte-identical.
  assert.deepStrictEqual(recordN, recordN1);
  // Explicit full-commit-object comparison (id, title, captured_at, url, bot).
  assert.deepStrictEqual(recordN.commits, recordN1.commits);
  for (const c of recordN.commits) {
    assert.ok(c.id && c.title && c.captured_at && c.url);
  }
});

// --- Task R: dynamic public-repository inventory ---------------------------

test('discoverPublicRepos paginates via Link rel=next', async () => {
  const request = async (path) => {
    if (path === '/users/cristian-cardona-dev/repos?type=owner&per_page=100') {
      return {
        status: 200,
        headers: { link: '<https://api.github.com/users/cristian-cardona-dev/repos?type=owner&per_page=100&page=2>; rel="next"' },
        body: JSON.stringify([
          { full_name: 'cristian-cardona-dev/beta', private: false, owner: { login: 'cristian-cardona-dev' } },
          { full_name: 'cristian-cardona-dev/alpha', private: false, owner: { login: 'cristian-cardona-dev' } },
        ]),
      };
    }
    if (String(path).includes('page=2')) {
      return { status: 200, headers: {}, body: JSON.stringify([
        { full_name: 'cristian-cardona-dev/gamma', private: false, owner: { login: 'cristian-cardona-dev' } },
      ]) };
    }
    return { status: 404, headers: {}, body: '{}' };
  };
  const entries = await discoverPublicRepos(request, 'cristian-cardona-dev', { maxRetries: 1, retryBaseMs: 0, sleepFn: async () => {} });
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((e) => e.url), [
    'https://github.com/cristian-cardona-dev/alpha',
    'https://github.com/cristian-cardona-dev/beta',
    'https://github.com/cristian-cardona-dev/gamma',
  ]);
  for (const e of entries) assert.equal(e.private, false);
});

test('discoverPublicRepos rejects when Link header loops back', async () => {
  const request = async (path) => {
    if (path === '/users/cristian-cardona-dev/repos?type=owner&per_page=100') {
      return {
        status: 200,
        headers: { link: '</users/cristian-cardona-dev/repos?type=owner&per_page=100>; rel="next"' },
        body: JSON.stringify([
          { full_name: 'cristian-cardona-dev/alpha', private: false, owner: { login: 'cristian-cardona-dev' } },
        ]),
      };
    }
    return { status: 404, headers: {}, body: '{}' };
  };
  await assert.rejects(
    discoverPublicRepos(request, 'cristian-cardona-dev', { maxRetries: 1, retryBaseMs: 0, sleepFn: async () => {} }),
    /pagination loop detected/,
  );
});

test('discoverPublicRepos excludes private and foreign-owned repos', async () => {
  const request = async () => ({
    status: 200,
    headers: {},
    body: JSON.stringify([
      { full_name: 'cristian-cardona-dev/public-one', private: false, owner: { login: 'cristian-cardona-dev' } },
      { full_name: 'cristian-cardona-dev/secret', private: true, owner: { login: 'cristian-cardona-dev' } },
      { full_name: 'other-owner/repo', private: false, owner: { login: 'other-owner' } },
    ]),
  });
  const entries = await discoverPublicRepos(request, 'cristian-cardona-dev', { maxRetries: 1, retryBaseMs: 0, sleepFn: async () => {} });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, 'https://github.com/cristian-cardona-dev/public-one');
});

test('runRefresh reconcile adds a newly discovered repository', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshot = makeSnapshot(['https://github.com/cristian-cardona-dev/old1', 'https://github.com/cristian-cardona-dev/old2']);
    const snapshotFile = writeSnapshot(dir, snapshot);
    const healthFile = join(dir, 'health.json');
    const request = async (path) => {
      if (path.startsWith('/users/') && path.includes('/repos')) {
        return { status: 200, headers: {}, body: JSON.stringify([
          { full_name: 'cristian-cardona-dev/old1', private: false, owner: { login: 'cristian-cardona-dev' } },
          { full_name: 'cristian-cardona-dev/old2', private: false, owner: { login: 'cristian-cardona-dev' } },
          { full_name: 'cristian-cardona-dev/new3', private: false, owner: { login: 'cristian-cardona-dev' } },
        ]) };
      }
      if (String(path).includes('/commits?')) return { status: 200, headers: {}, body: '[]' };
      if (String(path).includes('/pulls?')) return { status: 200, headers: { 'x-total-count': '0' }, body: '[]' };
      if (String(path).includes('/releases/latest')) return { status: 404, headers: {}, body: '{}' };
      return { status: 404, headers: {}, body: '{}' };
    };
    const { snapshot: next } = await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      maxRetries: 1,
      retryBaseMs: 0,
      sleepFn: async () => {},
      log: () => {},
      warn: () => {},
    });
    assert.equal(next.allowed_repositories.length, 3);
    assert.ok(next.allowed_repositories.includes('https://github.com/cristian-cardona-dev/new3'));
    assert.ok(next.repositories.some((r) => r.id === 'cristian-cardona-dev/new3'));
  });
});

test('runRefresh drops a repository that discovery no longer returns', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshot = makeSnapshot(['https://github.com/cristian-cardona-dev/keep', 'https://github.com/cristian-cardona-dev/old-repo']);
    snapshot.repositories = [
      { id: 'cristian-cardona-dev/old-repo', url: 'https://github.com/cristian-cardona-dev/old-repo', visibility: 'public', pull_requests: [], commits: [], releases: [], deployments: [], open_pull_requests: 0 },
    ];
    const snapshotFile = writeSnapshot(dir, snapshot);
    const healthFile = join(dir, 'health.json');
    const request = async (path) => {
      if (path.startsWith('/users/') && path.includes('/repos')) {
        return { status: 200, headers: {}, body: JSON.stringify([
          { full_name: 'cristian-cardona-dev/keep', private: false, owner: { login: 'cristian-cardona-dev' } },
        ]) };
      }
      if (String(path).includes('/commits?')) return { status: 200, headers: {}, body: '[]' };
      if (String(path).includes('/pulls?')) return { status: 200, headers: { 'x-total-count': '0' }, body: '[]' };
      if (String(path).includes('/releases/latest')) return { status: 404, headers: {}, body: '{}' };
      return { status: 404, headers: {}, body: '{}' };
    };
    const { snapshot: next } = await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      maxRetries: 1,
      retryBaseMs: 0,
      sleepFn: async () => {},
      log: () => {},
      warn: () => {},
    });
    assert.equal(next.allowed_repositories.length, 1);
    assert.ok(!next.allowed_repositories.includes('https://github.com/cristian-cardona-dev/old-repo'));
    assert.ok(!next.repositories.some((r) => r.id === 'cristian-cardona-dev/old-repo'));
  });
});

test('runRefresh rejects when discovery fails', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshotFile = writeSnapshot(dir, makeSnapshot());
    const healthFile = join(dir, 'health.json');
    const before = readFileSync(snapshotFile, 'utf8');
    const request = async (path) => {
      if (path.startsWith('/users/') && path.includes('/repos')) {
        return { status: 500, headers: {}, body: '{}' };
      }
      return { status: 404, headers: {}, body: '{}' };
    };
    await assert.rejects(runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      maxRetries: 1,
      retryBaseMs: 0,
      sleepFn: async () => {},
      log: () => {},
      warn: () => {},
    }));
    const after = readFileSync(snapshotFile, 'utf8');
    assert.equal(after, before);
  });
});

test('runRefresh excludes a repo that 404s during refresh', async () => {
  await withTempDirAsync(async (dir) => {
    const snapshot = makeSnapshot(['https://github.com/cristian-cardona-dev/gone']);
    const snapshotFile = writeSnapshot(dir, snapshot);
    const healthFile = join(dir, 'health.json');
    const request = async (path) => {
      if (path.startsWith('/users/') && path.includes('/repos')) {
        return { status: 200, headers: {}, body: JSON.stringify([
          { full_name: 'cristian-cardona-dev/gone', private: false, owner: { login: 'cristian-cardona-dev' } },
        ]) };
      }
      if (String(path).includes('/commits?')) return { status: 404, headers: {}, body: '{}' };
      return { status: 404, headers: {}, body: '{}' };
    };
    const { snapshot: next } = await runRefresh({
      dryRun: false,
      snapshotFile,
      healthFile,
      request,
      now: NOW,
      maxRetries: 1,
      retryBaseMs: 0,
      sleepFn: async () => {},
      log: () => {},
      warn: () => {},
    });
    assert.equal(next.repositories.length, 0);
    assert.equal(next.allowed_repositories.length, 1);
  });
});
