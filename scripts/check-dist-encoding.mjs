#!/usr/bin/env node
/**
 * Post-build encoding gate for `web/dist/`.
 *
 * Fails the build if any emitted HTML contains:
 *   - U+FFFD replacement characters (mojibake / invalid UTF-8)
 *   - a stray `}` immediately after `</head>`
 *   - a UTF-8 BOM
 *
 * Wired as the `postbuild` script in `web/package.json` so a bad dist aborts
 * `npm --prefix web run build`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'web', 'dist');

function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkHtml(p));
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function check(file) {
  const buf = readFileSync(file);
  const text = buf.toString('utf8');
  const rel = relative(ROOT, file);
  const hits = [];

  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    hits.push('UTF-8 BOM at start of file');
  }
  if (text.includes('\uFFFD')) {
    hits.push('contains U+FFFD replacement character');
  }
  if (/<\/head>\s*}/.test(text)) {
    hits.push('stray } after </head>');
  }

  return hits.length > 0 ? { file: rel, hits } : null;
}

let files;
try {
  files = walkHtml(DIST);
} catch (error) {
  console.error(`check-dist-encoding: cannot read ${DIST}: ${error.message}`);
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const result = check(file);
  if (result) failures.push(result);
}

if (failures.length > 0) {
  console.error('check-dist-encoding: build output failed encoding checks');
  for (const { file, hits } of failures) {
    for (const hit of hits) {
      console.error(`  ${file}: ${hit}`);
    }
  }
  process.exit(1);
}

console.log(`check-dist-encoding: ${files.length} HTML file(s) OK`);
