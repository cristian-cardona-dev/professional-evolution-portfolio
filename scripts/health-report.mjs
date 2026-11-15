#!/usr/bin/env node
/**
 * Chronic-failure reporter (plan phase 7.3).
 *
 * Reads `github-activity/health.json` — the rolling 30-day per-repo history the
 * refresh script maintains — and reports repositories whose refresh has failed
 * `N` runs in a row (default 3).
 *
 * The workflow consumes this to open or update ONE tracking issue per repo,
 * searching by exact title first so a persistent failure updates the existing
 * issue instead of opening a new one every day.
 *
 * Exit codes: 0 always. This script only reports; deciding what to do about a
 * streak is the caller's job, so a streak must not fail the refresh run.
 * Zero dependencies: only Node built-ins.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chronicFailures, consecutiveFailures } from './lib/activity-refresh-core.mjs';

const REPO = resolve(import.meta.dirname, '..');
const DEFAULT_HEALTH = resolve(REPO, 'github-activity/health.json');

function parseArgs(argv) {
  const thresholdArg = argv.find((a) => a.startsWith('--threshold='));
  const fileArg = argv.find((a) => !a.startsWith('--'));
  const threshold = thresholdArg ? Number.parseInt(thresholdArg.split('=')[1], 10) : 3;
  if (!Number.isFinite(threshold) || threshold < 1) {
    console.error('health-report: --threshold must be a positive integer');
    process.exit(2);
  }
  return { threshold, file: fileArg ? resolve(fileArg) : DEFAULT_HEALTH, json: argv.includes('--json') };
}

function main() {
  const { threshold, file, json } = parseArgs(process.argv.slice(2));

  if (!existsSync(file)) {
    // No history yet: that is a legitimate state, not an error.
    const empty = { chronic: [], total_repositories: 0 };
    console.log(json ? JSON.stringify(empty) : 'health-report: no health history yet');
    return 0;
  }

  let health;
  try {
    health = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`health-report: cannot read ${file}: ${error.message}`);
    return 2;
  }

  const chronic = chronicFailures(health, threshold);
  const total = Object.keys(health?.repositories || {}).length;

  if (json) {
    console.log(JSON.stringify({ threshold, total_repositories: total, chronic }, null, 2));
    return 0;
  }

  console.log(`health-report: ${total} repositorio(s) con historial, umbral ${threshold}`);
  if (chronic.length === 0) {
    console.log('health-report: ningún repositorio en racha de fallos.');
    return 0;
  }
  for (const entry of chronic) {
    console.log(`  - ${entry.slug}: ${entry.streak} fallos consecutivos`);
  }
  return 0;
}

const normalizePath = (p) => String(p).replace(/\\/g, '/');
const isMain =
  Boolean(process.argv[1]) && normalizePath(import.meta.filename) === normalizePath(process.argv[1]);
if (isMain) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`health-report: unexpected failure: ${error?.message ?? error}`);
    process.exit(2);
  }
}

export { consecutiveFailures, chronicFailures };
