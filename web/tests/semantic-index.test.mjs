/**
 * Semantic search index tests (task F-C, spec section 10).
 *
 * Three things are under test, and the negative assertions matter most:
 *
 *   1. **Honest degradation.** With no Cloudflare credentials the build emits a
 *      keyword-only artifact with *no vectors* and says so in the metadata. It
 *      never fakes, zeroes or invents vectors, and the build exits 0.
 *   2. **The stub seam.** `SEMANTIC_INDEX_STUB=1` swaps the Workers AI REST
 *      embedder for a deterministic offline stub. It is honoured only by the
 *      build script (which never runs in production) and never by any shipped
 *      client code; the ranking it produces is verified against a fixed
 *      fixture, not against the live corpus.
 *   3. **Zero production AI calls.** No file under `web/src/` may reference a
 *      Workers AI endpoint or the stub env var, and the client ranking module
 *      may not call `fetch` at all (the single static-asset fetch lives in the
 *      widget script).
 *
 * The real pipeline is exercised by spawning the CLI in a temp output
 * directory, so the committed `web/public/` is never touched by the tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocabulary, assembleIndex, stubEmbed } from '../../scripts/semantic-index-lib.mjs';
import {
  SEMANTIC_MIN_SCORE,
  cosine,
  hybridSearch,
  parseSemanticIndex,
  queryVector,
} from '../src/lib/semantic-search.ts';
import { searchEntries } from '../src/lib/assistant-search.ts';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..');
const CLI = join(ROOT, 'scripts', 'build-semantic-index.mjs');

/** 1.5 MB uncompressed — the brief's size budget. */
const SIZE_BUDGET_BYTES = 1.5 * 1024 * 1024;

/** Run the generator CLI against a fresh temp directory. */
function runGenerator(extraEnv = {}) {
  const outDir = mkdtempSync(join(tmpdir(), 'semantic-index-'));
  const env = { ...process.env };
  // A clean build environment: no credentials, no stub, unless the caller asks.
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CLOUDFLARE_ACCOUNT_ID;
  delete env.SEMANTIC_INDEX_STUB;
  Object.assign(env, extraEnv, { SEMANTIC_INDEX_OUT_DIR: outDir });
  const result = spawnSync(process.execPath, [CLI], { cwd: ROOT, env, encoding: 'utf8' });
  const read = (name) => JSON.parse(readFileSync(join(outDir, name), 'utf8'));
  return {
    result,
    outDir,
    index: read('semantic-index.json'),
    metadata: read('build-metadata.json'),
    indexBytes: statSync(join(outDir, 'semantic-index.json')).size,
    cleanup: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

/** A small fixed corpus with short texts, so stub cosines are meaningful. */
const FIXTURE_ENTRIES = [
  {
    ty: 'work',
    lo: ['realtime', 'comments', 'websocket'],
    we: 'realtime comments websocket presence',
    ti: 'Realtime comments',
    sn: 'WebSocket presence',
    hr: 'work/realtime-comments/',
    ba: null,
    bv: null,
    yr: null,
  },
  {
    ty: 'work',
    lo: ['payroll', 'finance', 'pdf'],
    we: 'payroll integration finance pdf parsing',
    ti: 'Payroll integration',
    sn: 'Finance PDF parsing',
    hr: 'work/payroll/',
    ba: null,
    bv: null,
    yr: null,
  },
];

test('no token: the build emits a keyword-only artifact with no vectors', () => {
  const run = runGenerator();
  try {
    assert.equal(run.result.status, 0, 'the build must succeed without credentials');
    assert.equal(run.index.semantic_index, 'keyword-only');
    assert.equal(run.index.entries, null, 'no vectors may be emitted');
    assert.equal(run.index.vocabulary, null, 'no vocabulary may be emitted');
    assert.equal(run.metadata.semantic_index, 'keyword-only');
    assert.equal(run.metadata.entries, 0);
    assert.equal(run.metadata.vocabulary, 0);
    assert.match(String(run.metadata.reason), /CLOUDFLARE_API_TOKEN/);
    // The honest artifact is tiny — it carries no vectors at all.
    assert.ok(run.indexBytes < 1024, `keyword-only artifact should be tiny, got ${run.indexBytes}`);
  } finally {
    run.cleanup();
  }
});

test('stub seam: vectors are present, deterministic and inside the size budget', () => {
  const first = runGenerator({ SEMANTIC_INDEX_STUB: '1' });
  const second = runGenerator({ SEMANTIC_INDEX_STUB: '1' });
  try {
    assert.equal(first.result.status, 0);
    assert.equal(first.index.semantic_index, 'semantic');
    assert.equal(first.index.model, '@cf/baai/bge-m3');
    assert.equal(first.index.dims, 1024);
    assert.equal(first.index.entries.length, 35, 'one vector per assistant index entry');
    assert.equal(Object.keys(first.index.vocabulary).length, 138);
    assert.equal(first.metadata.semantic_index, 'semantic');
    assert.equal(first.metadata.reason, null);
    assert.ok(
      first.indexBytes < SIZE_BUDGET_BYTES,
      `artifact ${first.indexBytes} bytes exceeds the 1.5 MB budget`,
    );
    // Deterministic: the same corpus and the same embedder give identical bytes.
    assert.deepEqual(first.index, second.index);
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('fixed fixture: the relevant entry ranks first, an unrelated one scores below threshold', () => {
  const vocabulary = buildVocabulary(FIXTURE_ENTRIES);
  const embed = async (texts) => stubEmbed(texts);

  return Promise.all([
    assembleIndex({ entries: FIXTURE_ENTRIES, vocabulary, embed }),
    assembleIndex({ entries: FIXTURE_ENTRIES, vocabulary, embed }),
  ]).then(([index, repeat]) => {
    const parsed = parseSemanticIndex(index, FIXTURE_ENTRIES.length);
    assert.ok(parsed, 'a well-formed semantic asset must parse');

    // Deterministic assembly.
    assert.deepEqual(index, repeat);

    const relevant = queryVector('realtime comments', parsed.vocabulary);
    const unrelated = queryVector('payroll finance', parsed.vocabulary);
    assert.ok(relevant && unrelated, 'both queries must be inside the vocabulary');

    // The relevant query clears the threshold on its own entry and stays below
    // it on the unrelated entry.
    assert.ok(
      cosine(relevant, parsed.entries[0]) >= SEMANTIC_MIN_SCORE,
      `relevant cosine ${cosine(relevant, parsed.entries[0])} should clear ${SEMANTIC_MIN_SCORE}`,
    );
    assert.ok(
      cosine(relevant, parsed.entries[1]) < SEMANTIC_MIN_SCORE,
      `unrelated cosine ${cosine(relevant, parsed.entries[1])} should stay below ${SEMANTIC_MIN_SCORE}`,
    );

    // Ranking: semantic-first, deterministic.
    const realtime = hybridSearch(FIXTURE_ENTRIES, parsed, 'realtime comments', 3);
    assert.equal(realtime[0].ti, 'Realtime comments');
    const payroll = hybridSearch(FIXTURE_ENTRIES, parsed, 'payroll finance', 3);
    assert.equal(payroll[0].ti, 'Payroll integration');
    assert.deepEqual(
      hybridSearch(FIXTURE_ENTRIES, parsed, 'realtime comments', 3),
      realtime,
      'ranking must be deterministic',
    );
  });
});

test('below threshold or outside the vocabulary: exactly the keyword search', () => {
  const vocabulary = buildVocabulary(FIXTURE_ENTRIES);
  return assembleIndex({ entries: FIXTURE_ENTRIES, vocabulary, embed: stubEmbed }).then((raw) => {
    const index = parseSemanticIndex(raw, FIXTURE_ENTRIES.length);
    assert.ok(index);
    // No vocabulary token at all → the query vector is null → keyword fallback.
    for (const query of ['zzz quantum', '']) {
      assert.deepEqual(
        hybridSearch(FIXTURE_ENTRIES, index, query, 3),
        searchEntries(FIXTURE_ENTRIES, query, 3),
      );
    }
    // No index at all (keyword-only build) → keyword fallback, byte for byte.
    assert.deepEqual(
      hybridSearch(FIXTURE_ENTRIES, null, 'realtime comments', 3),
      searchEntries(FIXTURE_ENTRIES, 'realtime comments', 3),
    );
  });
});

test('parseSemanticIndex rejects keyword-only, misaligned and malformed assets', () => {
  assert.equal(parseSemanticIndex({ semantic_index: 'keyword-only', entries: null }, 2), null);
  assert.equal(parseSemanticIndex(null, 2), null);
  assert.equal(parseSemanticIndex('nope', 2), null);
  // Vector count must match the page's entry count (the alignment guard).
  assert.equal(
    parseSemanticIndex(
      { semantic_index: 'semantic', dims: 2, entries: [[0, 1]], vocabulary: {} },
      2,
    ),
    null,
  );
  // A malformed vector is rejected rather than silently mis-ranked.
  assert.equal(
    parseSemanticIndex(
      { semantic_index: 'semantic', dims: 2, entries: [[0, 1], [0]], vocabulary: {} },
      2,
    ),
    null,
  );
});

test('production code carries no AI endpoint and no stub seam', () => {
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else sources.push(full);
    }
  };
  walk(join(WEB, 'src'));

  const forbidden = ['api.cloudflare.com', '/ai/run/', 'SEMANTIC_INDEX_STUB', 'CLOUDFLARE_API_TOKEN'];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const needle of forbidden) {
      assert.ok(
        !text.includes(needle),
        `${file} must not reference "${needle}" — embeddings are build-time only`,
      );
    }
  }

  // The client ranking module is pure: the one static-asset fetch lives in the
  // widget script, never here.
  const ranking = readFileSync(join(WEB, 'src', 'lib', 'semantic-search.ts'), 'utf8');
  assert.ok(!ranking.includes('fetch('), 'semantic-search.ts must not call fetch');
});

test('the stub seam is env-gated: the same generator is keyword-only without it', () => {
  const run = runGenerator();
  try {
    // No SEMANTIC_INDEX_STUB → no vectors, even though the seam exists.
    assert.equal(run.index.semantic_index, 'keyword-only');
    assert.equal(run.index.entries, null);
  } finally {
    run.cleanup();
  }
});

test('the widget script fetches the static asset, not an AI endpoint', () => {
  const widget = readFileSync(join(WEB, 'src', 'components', 'AssistantWidget.astro'), 'utf8');
  assert.ok(widget.includes('SEMANTIC_INDEX_FILE'), 'the widget must fetch the shipped asset');
  assert.ok(widget.includes('hybridSearch'), 'the widget must rank through the hybrid rule');
  assert.ok(!widget.includes('api.cloudflare.com'), 'no AI endpoint in the widget');
});
