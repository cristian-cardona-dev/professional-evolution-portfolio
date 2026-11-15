#!/usr/bin/env node
/**
 * Bundle-size budget gate (plan phase 9.3).
 *
 * Fails the build when the emitted JS or CSS grows past a fixed budget, so a
 * heavy dependency cannot be added silently. The budgets are deliberately
 * several times the current payload — this is a tripwire against sudden growth,
 * not a tight cap:
 *
 *   JS   100 KB  (observed ~18 KB across 8 modules)
 *   CSS  200 KB  (observed ~82 KB across 9 stylesheets)
 *
 * Override with BUNDLE_BUDGET_JS_KB / BUNDLE_BUDGET_CSS_KB when a deliberate
 * addition needs more room; raising a budget should be a reviewed decision.
 *
 * Zero dependencies: only Node built-ins.
 */
import { readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const ASTRO_DIR = resolve(REPO, 'web/dist/_astro');

const DEFAULT_BUDGETS = { js: 100, css: 200 };

function budgetFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`bundle-budget: ${name} must be a positive number, got "${raw}"`);
    process.exit(2);
  }
  return value;
}

const budgets = {
  js: budgetFromEnv('BUNDLE_BUDGET_JS_KB', DEFAULT_BUDGETS.js),
  css: budgetFromEnv('BUNDLE_BUDGET_CSS_KB', DEFAULT_BUDGETS.css),
};

/** Sum the bytes of every `ext` file directly under a directory. */
function totalBytes(dir, ext) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null; // no build output
  }
  let sum = 0;
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(ext)) continue;
    sum += statSync(join(dir, entry.name)).size;
    count += 1;
  }
  return { sum, count };
}

const results = [
  { label: 'JS', ext: '.js', budgetKb: budgets.js, measured: totalBytes(ASTRO_DIR, '.js') },
  { label: 'CSS', ext: '.css', budgetKb: budgets.css, measured: totalBytes(ASTRO_DIR, '.css') },
];

const failures = [];

for (const { label, ext, budgetKb, measured } of results) {
  if (measured === null) {
    console.log(`bundle-budget: ${label}: no ${ext} output found (build not run?) — skipping`);
    continue;
  }
  const usedKb = measured.sum / 1024;
  const budgetBytes = budgetKb * 1024;
  const pct = (usedKb / budgetKb) * 100;
  const status = measured.sum <= budgetBytes ? 'OK  ' : 'OVER';
  console.log(
    `bundle-budget: ${status} ${label} ${usedKb.toFixed(1)} KB / ${budgetKb} KB (${pct.toFixed(0)}%, ${measured.count} file(s))`,
  );
  if (measured.sum > budgetBytes) {
    failures.push(
      `${label} bundle is ${usedKb.toFixed(1)} KB, over the ${budgetKb} KB budget` +
        ` — raise BUNDLE_BUDGET_${label}_KB deliberately, or drop the dependency`,
    );
  }
}

if (failures.length > 0) {
  console.error(`bundle-budget: ${failures.length} budget(s) exceeded:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`bundle-budget: all budgets satisfied (root: ${relative(REPO, ASTRO_DIR)})`);
