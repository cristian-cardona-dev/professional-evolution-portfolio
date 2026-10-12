#!/usr/bin/env node
/**
 * build-semantic-index.mjs — emit the portfolio's semantic search artifacts at
 * build time (task F-C, spec section 10).
 *
 * Usage: runs as the `prebuild` step of `npm --prefix web run build`, i.e.
 * before `astro build` copies `web/public/` into `web/dist/`. Order matters:
 * `BuildNotes.astro` reads `build-metadata.json` while it renders, so the
 * metadata must exist before the build starts.
 *
 * Design (all non-negotiable per the brief and spec section 10):
 *
 *   1. **Build-time embeddings only.** The corpus is embedded with Workers AI
 *      REST (`@cf/baai/bge-m3`, 1024-dim) using `CLOUDFLARE_API_TOKEN` +
 *      `CLOUDFLARE_ACCOUNT_ID`. There is no production AI call anywhere: the
 *      vectors ship as a static JSON asset and the browser only computes
 *      cosine (`web/src/lib/semantic-search.ts`).
 *   2. **Honest degradation.** No credentials, or any REST failure, or a
 *      misaligned corpus → the build emits a keyword-only artifact with no
 *      vectors (`entries: null`) and records `semantic_index: "keyword-only"`
 *      plus the reason in `build-metadata.json`. The build exits 0 in every
 *      case; the site then behaves exactly like the v1 keyword search. Vectors
 *      are never faked, zeroed or invented.
 *   3. **The same corpus the keyword assistant indexes.** The entries are built
 *      by `buildAssistantEntries` (`web/src/lib/assistant-corpus.ts`) — the
 *      shared builder `assistantIndex` itself delegates to — so a semantic
 *      index cannot drift from the keyword one.
 *   4. **One set of vectors, both locales.** The corpus is embedded once over
 *      the English canonical data; `assistantIndex` returns the same entries in
 *      the same order for `es`, and queries are normalised to English tokens,
 *      so the Spanish pages reuse the English vectors (half the bytes). An
 *      alignment check guards it.
 *   5. **TEST SEAM.** `SEMANTIC_INDEX_STUB=1` swaps the REST embedder for the
 *      deterministic offline stub in `semantic-index-lib.mjs`. Production
 *      builds never set it; the client bundle has no reference to it.
 *
 * Size: components are rounded to 4 decimals (`SEMANTIC_DECIMALS`). The
 * measured artifact for the current corpus is reported by the CLI and in the
 * task report.
 *
 * Generated artifacts (`web/public/semantic-index.json`,
 * `web/public/build-metadata.json`) are gitignored: committing a keyword-only
 * file would advertise a capability the repo does not have, and committing real
 * vectors would bake build-environment state into git and churn on every data
 * edit. They are generated per build and copied into `dist/` by Astro.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssistantEntries, resolveMilestoneTitle } from '../web/src/lib/assistant-corpus.ts';
import { copyByLocale } from '../web/src/i18n/copy.ts';
import {
  assembleIndex,
  buildMetadata,
  buildVocabulary,
  keywordOnlyIndex,
  makeRestEmbedder,
  stubEmbed,
} from './semantic-index-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Output directory; overridable so tests can write to a temp directory. */
const OUT_DIR = process.env.SEMANTIC_INDEX_OUT_DIR
  ? isAbsolute(process.env.SEMANTIC_INDEX_OUT_DIR)
    ? process.env.SEMANTIC_INDEX_OUT_DIR
    : resolve(ROOT, process.env.SEMANTIC_INDEX_OUT_DIR)
  : join(ROOT, 'web', 'public');

/** Read one canonical data file as UTF-8 JSON. */
function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

/** Write one artifact and return its byte size. */
function writeArtifact(name, value) {
  const json = JSON.stringify(value);
  writeFileSync(join(OUT_DIR, name), json, 'utf8');
  return Buffer.byteLength(json, 'utf8');
}

/**
 * Pick the embedder honestly. Returns `{ embed, reason }` where `reason` is
 * non-null when no embeddings will be produced (keyword-only mode).
 */
function selectEmbedder() {
  if (process.env.SEMANTIC_INDEX_STUB === '1') {
    return { embed: (texts) => Promise.resolve(stubEmbed(texts)), reason: null, source: 'stub' };
  }
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (accountId && apiToken) {
    return { embed: makeRestEmbedder({ accountId, apiToken }), reason: null, source: 'workers-ai' };
  }
  return {
    embed: null,
    reason: 'no CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in the build environment',
    source: 'keyword-only',
  };
}

/** Emit both artifacts in the given mode; never throws. */
function emit(index, reason) {
  mkdirSync(OUT_DIR, { recursive: true });
  const bytes = writeArtifact('semantic-index.json', index);
  writeArtifact('build-metadata.json', buildMetadata(index, bytes, reason));
  return bytes;
}

async function main() {
  const input = {
    profile: readJson('data/profile.json'),
    projects: readJson('data/projects.json'),
    milestones: readJson('data/evolution.json').milestones,
    evidence: readJson('data/evidence.json'),
  };

  // The corpus builder needs the two data-layer values it cannot import at run
  // time. Hrefs never enter an embedding text, so a plain path passthrough is
  // enough; the title rule is shared with the site (`resolveMilestoneTitle`).
  const env = { route: (_locale, path = '') => path, milestoneTitle: resolveMilestoneTitle };
  const entriesEn = buildAssistantEntries(input, copyByLocale.en, 'en', env);
  const entriesEs = buildAssistantEntries(input, copyByLocale.es, 'es', env);

  // Guard the "one set of vectors serves both locales" assumption: same entries,
  // same order (the builder iterates the same arrays), only display text differs.
  // The signature (kind + milestone year per position) catches a reorder, which
  // a bare count would not.
  const signature = (list) => list.map((entry) => `${entry.ty}:${entry.yr ?? ''}`).join('|');
  if (entriesEn.length !== entriesEs.length || signature(entriesEn) !== signature(entriesEs)) {
    const index = keywordOnlyIndex();
    emit(
      index,
      `locale corpus misalignment (en ${entriesEn.length} != es ${entriesEs.length})`,
    );
    console.warn(
      `semantic-index: keyword-only — locale corpus misalignment (en ${entriesEn.length} != es ${entriesEs.length}); no vectors emitted`,
    );
    return;
  }

  const vocabulary = buildVocabulary(entriesEn);
  const { embed, reason, source } = selectEmbedder();

  if (!embed) {
    const index = keywordOnlyIndex();
    const bytes = emit(index, reason);
    console.log(
      `semantic-index: keyword-only — ${reason}; no vectors emitted (${bytes} bytes, ${entriesEn.length} entries would be indexed)`,
    );
    return;
  }

  try {
    const index = await assembleIndex({ entries: entriesEn, vocabulary, embed });
    const bytes = emit(index, null);
    const kb = (bytes / 1024).toFixed(1);
    console.log(
      `semantic-index: semantic via ${source} — ${index.entries.length} entry vectors + ${Object.keys(index.vocabulary).length} vocabulary vectors, ${kb} KB → ${join(OUT_DIR, 'semantic-index.json')}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const index = keywordOnlyIndex();
    const bytes = emit(index, `embedding failed: ${message}`);
    console.warn(
      `semantic-index: keyword-only — embedding failed (${message}); no vectors emitted (${bytes} bytes). The build continues honestly.`,
    );
  }
}

await main();
