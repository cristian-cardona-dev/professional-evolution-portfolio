/**
 * Encoding & stray-character regression tests.
 *
 * Guards against two classes of bugs that slipped through in the past:
 *   1. Mojibake / U+FFFD replacement characters in source (web/src/).
 *   2. Stray `}` (or other literal braces) rendered after `</head>` in built HTML.
 *
 * These are source-level + build-output checks, mirroring assistant-local.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(WEB, 'src');
const DIST = resolve(WEB, 'dist');

/** Recursively collect files under a directory matching an extension filter. */
function walk(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Known mojibake sequences that must never appear in source. */
const MOJIBAKE_PATTERNS = [
  /\uFFFD/,           // U+FFFD replacement character
  /Ã[\u0080-\u00BF]/, // double-encoded UTF-8 (Latin-1 re-decode)
  /Â[\u0080-\u00BF]/, // double-encoded UTF-8
];

test('no mojibake or U+FFFD in web/src/', () => {
  const files = walk(SRC, ['.astro', '.ts', '.mjs', '.js', '.json']);
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of MOJIBAKE_PATTERNS) {
      const m = content.match(pattern);
      if (m) {
        violations.push(`${relative(WEB, file)}: matched ${pattern} (e.g. "${m[0]}")`);
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
  const files = walk(DIST, ['.html']);
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    // A stray `}` immediately after `</head>` (possibly with whitespace/newline)
    if (/<\/head>\s*}/.test(content)) {
      violations.push(relative(WEB, file));
    }
  }
  assert.equal(
    violations.length,
    0,
    `Stray } after </head> in:\n${violations.join('\n')}`,
  );
});

test('all source files are valid UTF-8', () => {
  const files = walk(SRC, ['.astro', '.ts', '.mjs', '.js', '.json', '.css']);
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
      `${relative(WEB, file)} contains U+FFFD (invalid UTF-8 or replacement char)`,
    );
  }
});
