#!/usr/bin/env node
/**
 * GitHub activity refresh — the build-time generator for
 * `github-activity/snapshot.json`.
 *
 * The browser never talks to GitHub: this script runs in CI (see
 * `.github/workflows/activity-refresh.yml`), fetches the allowlisted public
 * repositories over the REST API with a server-side `GITHUB_TOKEN`, and writes
 * a checked-in snapshot the static site imports at build time.
 *
 * All logic lives in `scripts/lib/activity-refresh-core.mjs`; this file is a
 * thin CLI wrapper that parses flags, reads environment, and delegates to the
 * core orchestrator.
 *
 * Zero dependencies: only Node built-ins.
 */
import { resolve } from 'node:path';
import { runRefresh, DEFAULTS } from './lib/activity-refresh-core.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SNAPSHOT_FILE = resolve(ROOT, 'github-activity', 'snapshot.json');
const HEALTH_FILE = resolve(ROOT, 'github-activity', 'health.json');

const DRY_RUN = process.argv.includes('--dry-run');
const maxRetriesRaw = Number.parseInt(process.env.ACTIVITY_REFRESH_RETRIES || '3', 10);
const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? maxRetriesRaw : DEFAULTS.maxRetries;

runRefresh({
  dryRun: DRY_RUN,
  snapshotFile: SNAPSHOT_FILE,
  healthFile: HEALTH_FILE,
  token: process.env.GITHUB_TOKEN || '',
  maxRetries,
}).then((result) => {
  if (result && result.rateLimited) {
    process.exit(0);
  }
}).catch((error) => {
  if (error && error.rateLimited) {
    console.log('rate limited, will retry next cycle');
    process.exit(0);
  }
  console.error(`activity-refresh: unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error && typeof error.exitCode === 'number' ? error.exitCode : 1);
});
