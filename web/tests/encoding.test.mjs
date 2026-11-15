/**
 * Encoding & stray-character regression tests.
 *
 * Guards against two classes of bugs that slipped through in the past:
 *   1. Mojibake / U+FFFD replacement characters in source.
 *   2. Stray `}` (or other literal braces) rendered after `</head>` in built HTML.
 *
 * These are source-level + build-output checks, mirroring assistant-local.test.mjs.
 * The scan is repo-wide so UTF-8 issues cannot hide in data, scripts, docs or
 * locale files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(WEB, 'dist');
const REPO = resolve(WEB, '..');

/**
 * Directories scanned for encoding/BOM/brace checks. Keep this in sync with the
 * task brief; `dist`, `node_modules`, `.git`, generated caches and private paths
 * are excluded below.
 */
const SCANNED_ROOTS = [
  'web/src',
  'web/tests',
  'data',
  'github-activity',
  'scripts',
  'worker/src',
  'docs',
  'en',
  'es',
  'site',
];

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.astro',
  '.wrangler',
  'test-results',
  'playwright-report',
  '.taste-skill',
  '.superpowers',
  '.vscode',
]);

const EXCLUDED_FILES = new Set([
  resolve(REPO, 'web/public/semantic-index.json'),
]);

/** Recursively collect files under a directory, skipping excluded directories. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) out.push(...walk(p));
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Collect every file the contract says to scan. */
function collectScannedFiles() {
  const files = new Set();
  for (const rel of SCANNED_ROOTS) {
    const dir = resolve(REPO, rel);
    try {
      statSync(dir);
      for (const p of walk(dir)) files.add(p);
    } catch {
      // Directory absent — skip silently; the repo shape decides what exists.
    }
  }
  // Root-level specific extensions.
  for (const entry of readdirSync(REPO, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name.toLowerCase();
    if (
      name.endsWith('.json') ||
      name.endsWith('.yml') ||
      name.endsWith('.md') ||
      name.endsWith('.mjs')
    ) {
      files.add(join(REPO, entry.name));
    }
  }
  for (const p of EXCLUDED_FILES) files.delete(p);
  return [...files].sort();
}

/** Treat files containing a null byte as binary and skip text-based checks. */
function isTextFile(file) {
  try {
    const buf = readFileSync(file);
    return !buf.includes(0);
  } catch {
    return false;
  }
}

/** Known mojibake sequences that must never appear in source. */
const MOJIBAKE_PATTERNS = [
  /\uFFFD/,           // U+FFFD replacement character
  /Ã[\u0080-\u00BF]/, // double-encoded UTF-8 (Latin-1 re-decode)
  /Â[\u0080-\u00BF]/, // double-encoded UTF-8
];

/**
 * Find lines that contain a lone `}` at template top level in an Astro file.
 *
 * The check ignores:
 *   - frontmatter (`---` fences)
 *   - `<script>` and `<style>` blocks
 *   - HTML comments
 *   - `}` that closes a `{...}` JSX expression
 *
 * It is intentionally a heuristic tuned against the real files. A stray brace
 * after `</head>` would appear at brace depth 0 and be flagged.
 */
function findStrayTemplateBraces(content) {
  // Drop frontmatter.
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  let body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;

  // Drop inline script/style and HTML comments; Astro components do not nest
  // these blocks, so a non-greedy match is sufficient for this heuristic.
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  body = body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  const lines = body.split(/\r?\n/);
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inBlockComment = false;
  const violations = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isJustBrace = /^\s*}\s*(\/\/.*)?$/.test(line);
    const depthBefore = depth;
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      const next = line[j + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          j += 2;
          continue;
        }
        j += 1;
        continue;
      }
      if (inSingle) {
        if (ch === "'" && line[j - 1] !== '\\') inSingle = false;
        j += 1;
        continue;
      }
      if (inDouble) {
        if (ch === '"' && line[j - 1] !== '\\') inDouble = false;
        j += 1;
        continue;
      }
      if (inBacktick) {
        if (ch === '`' && line[j - 1] !== '\\') inBacktick = false;
        j += 1;
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        j += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        j += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        j += 1;
        continue;
      }
      if (ch === '`') {
        inBacktick = true;
        j += 1;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      j += 1;
    }

    if (isJustBrace && depthBefore === 0 && depth < 0) {
      violations.push(i + 1);
      // Reset so a single stray brace does not cascade into every later line.
      depth = 0;
    }
  }

  return violations;
}

test('no mojibake or U+FFFD in scanned files', () => {
  const files = collectScannedFiles().filter(isTextFile);
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of MOJIBAKE_PATTERNS) {
      const m = content.match(pattern);
      if (m) {
        violations.push(`${relative(REPO, file)}: matched ${pattern} (e.g. "${m[0]}")`);
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `Mojibake found in source:\n${violations.join('\n')}`,
  );
});

test('no stray } after </head> in built HTML', () => {
  // Only run if dist exists (build may not have been run).
  try {
    statSync(DIST);
  } catch {
    // Skip gracefully if no build output.
    return;
  }
  const files = [];
  function walkHtml(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walkHtml(p);
      else if (entry.name.endsWith('.html')) files.push(p);
    }
  }
  walkHtml(DIST);
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    // A stray `}` immediately after `</head>` (possibly with whitespace/newline)
    if (/<\/head>\s*}/.test(content)) {
      violations.push(relative(REPO, file));
    }
  }
  assert.equal(
    violations.length,
    0,
    `Stray } after </head> in:\n${violations.join('\n')}`,
  );
});

test('all scanned files are valid UTF-8', () => {
  const files = collectScannedFiles().filter(isTextFile);
  for (const file of files) {
    const buf = readFileSync(file);
    // Attempt decode; if it throws, the file is not valid UTF-8.
    const text = buf.toString('utf8');
    // Re-encode and compare to detect replacement characters introduced by invalid bytes.
    const reencoded = Buffer.from(text, 'utf8');
    // If the original had invalid UTF-8, toString('utf8') inserts U+FFFD and
    // re-encoding won't round-trip. Check for U+FFFD as a proxy.
    assert.ok(
      !text.includes('\uFFFD'),
      `${relative(REPO, file)} contains U+FFFD (invalid UTF-8 or replacement char)`,
    );
  }
});

test('no BOM in scanned files', () => {
  const files = collectScannedFiles().filter(isTextFile);
  const violations = [];
  for (const file of files) {
    const buf = readFileSync(file);
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      violations.push(relative(REPO, file));
    }
  }
  assert.equal(
    violations.length,
    0,
    `UTF-8 BOM found in:\n${violations.join('\n')}`,
  );
});

test('no stray template-level } in .astro source', () => {
  const files = collectScannedFiles().filter(
    (p) => p.endsWith('.astro') && isTextFile(p),
  );
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = findStrayTemplateBraces(content);
    if (lines.length > 0) {
      violations.push(`${relative(REPO, file)}: lines ${lines.join(', ')}`);
    }
  }
  assert.equal(
    violations.length,
    0,
    `Stray template-level } found in:\n${violations.join('\n')}`,
  );
});
