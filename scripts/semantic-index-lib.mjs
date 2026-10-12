/**
 * semantic-index-lib.mjs — build-time helpers for the portfolio's semantic
 * search index (task F-C).
 *
 * Everything here runs **at build time only**, in the same bare `node` process
 * as `scripts/build-semantic-index.mjs`. Nothing in this file is imported by
 * the site: the browser never sees it, and it never runs in production. The
 * client-side half of the feature is `web/src/lib/semantic-search.ts`.
 *
 * It is a separate module from the CLI so the tests can exercise the pipeline
 * (assemble, stub-embed, vocabulary, REST embedder) without shelling out, and
 * so the deterministic stub can be reused by the fixed-fixture test.
 *
 * The three seams:
 *
 *   - `makeRestEmbedder` — the real path. `POST .../ai/run/@cf/baai/bge-m3`
 *     with the account id and API token from the environment. Any failure
 *     throws, and the CLI turns the throw into the honest keyword-only build.
 *   - `stubEmbed` — the TEST SEAM. A deterministic, offline bag-of-words
 *     pseudo-embedding, honoured by the CLI **only** when
 *     `SEMANTIC_INDEX_STUB=1` is set in the build environment. Production
 *     builds never set it (the CI workflows do not), and the client bundle
 *     contains no reference to it, so production can never honour it.
 *   - `assembleIndex` — shared by both, so the artifact shape is identical
 *     whether the vectors came from Workers AI or from the stub.
 *
 * `@cf/baai/bge-m3` returns 1024-dimensional vectors; components are rounded
 * to `SEMANTIC_DECIMALS` (4) places, the documented size-budget tool.
 */
import { words } from '../web/src/lib/assistant-search.ts';
import {
  SEMANTIC_DECIMALS,
  SEMANTIC_DIMS,
  SEMANTIC_MODEL,
  embeddingText,
} from '../web/src/lib/semantic-search.ts';

/** Texts per Workers AI request; keeps each request small and predictable. */
export const BATCH_SIZE = 20;

/** Round every component to `decimals` places (see the module header). */
export function roundVector(vector, decimals = SEMANTIC_DECIMALS) {
  const scale = 10 ** decimals;
  return vector.map((value) => Math.round(value * scale) / scale);
}

/** The honest empty artifact: no vectors, never fake ones. */
export function keywordOnlyIndex() {
  return {
    semantic_index: 'keyword-only',
    model: null,
    dims: 0,
    entries: null,
    vocabulary: null,
  };
}

/**
 * The query vocabulary: every distinct strong token (`lo`) of the English
 * corpus, sorted by plain code-unit comparison so the artifact is
 * byte-identical on every machine. See `semantic-search.ts` for why the
 * vocabulary — not a runtime query embedding — is what makes the cosine
 * computable with zero production AI calls, and why the English corpus is
 * enough for both locales.
 */
export function buildVocabulary(entries) {
  const tokens = new Set();
  for (const entry of entries) {
    for (const token of entry.lo) tokens.add(token);
  }
  return [...tokens].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* Deterministic offline stub (TEST SEAM — see the header)            */
/* ------------------------------------------------------------------ */

/** FNV-1a 32-bit hash of a token, used only to seed the stub. */
function hashToken(token) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG — deterministic, dependency-free. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STUB_CACHE = new Map();

/** A stable pseudo-random unit-ish vector for one token. */
function stubTokenVector(token, dims) {
  const key = `${dims}:${token}`;
  const cached = STUB_CACHE.get(key);
  if (cached) return cached;
  const random = mulberry32(hashToken(token));
  const vector = new Array(dims);
  for (let i = 0; i < dims; i += 1) vector[i] = random() * 2 - 1;
  STUB_CACHE.set(key, vector);
  return vector;
}

/**
 * Deterministic offline "embedding": the normalised sum of its tokens'
 * pseudo-random vectors. Cosine between two stub vectors therefore tracks
 * token overlap, which is enough to assert deterministic ranking in tests
 * without a network call and without pretending the numbers are `bge-m3`.
 */
export function stubEmbed(texts, dims = SEMANTIC_DIMS) {
  return texts.map((text) => {
    const sum = new Array(dims).fill(0);
    for (const token of words(text)) {
      const vector = stubTokenVector(token, dims);
      for (let i = 0; i < dims; i += 1) sum[i] += vector[i];
    }
    const norm = Math.sqrt(sum.reduce((total, value) => total + value * value, 0));
    const normalized = norm === 0 ? sum : sum.map((value) => value / norm);
    return roundVector(normalized);
  });
}

/* ------------------------------------------------------------------ */
/* Workers AI REST embedder (the real path)                           */
/* ------------------------------------------------------------------ */

/**
 * Build an `embed(texts)` function that calls Workers AI over REST.
 * `fetchImpl` is injectable so a test can assert request shape without a
 * network call; production always passes the global `fetch`.
 */
export function makeRestEmbedder({ accountId, apiToken, fetchImpl = fetch }) {
  if (!accountId || !apiToken) throw new Error('missing Cloudflare account id or API token');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${SEMANTIC_MODEL}`;
  return async (texts) => {
    const vectors = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const batch = texts.slice(start, start + BATCH_SIZE);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: batch }),
      });
      if (!response.ok) throw new Error(`Workers AI responded ${response.status}`);
      const payload = await response.json();
      const data = payload?.result?.data;
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error('unexpected Workers AI response shape');
      }
      for (const vector of data) {
        if (!Array.isArray(vector) || vector.length !== SEMANTIC_DIMS) {
          throw new Error(`unexpected vector length (wanted ${SEMANTIC_DIMS})`);
        }
        vectors.push(roundVector(vector));
      }
    }
    return vectors;
  };
}

/* ------------------------------------------------------------------ */
/* Assembly                                                           */
/* ------------------------------------------------------------------ */

/**
 * Assemble the shipped artifact from the corpus and its vocabulary using an
 * `embed(texts) -> vectors` function. Shape is identical for the REST and stub
 * embedders; any length mismatch throws so the CLI can degrade honestly rather
 * than ship a misaligned index.
 */
export async function assembleIndex({ entries, vocabulary, embed }) {
  const entryVectors = await embed(entries.map(embeddingText));
  const vocabVectors = await embed(vocabulary);
  if (entryVectors.length !== entries.length) {
    throw new Error(`entry vector count mismatch (${entryVectors.length} != ${entries.length})`);
  }
  if (vocabVectors.length !== vocabulary.length) {
    throw new Error(
      `vocabulary vector count mismatch (${vocabVectors.length} != ${vocabulary.length})`,
    );
  }
  const vocabularyMap = {};
  vocabulary.forEach((token, index) => {
    vocabularyMap[token] = vocabVectors[index];
  });
  return {
    semantic_index: 'semantic',
    model: SEMANTIC_MODEL,
    dims: SEMANTIC_DIMS,
    entries: entryVectors,
    vocabulary: vocabularyMap,
  };
}

/**
 * The small metadata file the site reads at build time (`BuildNotes`) and
 * ships to readers: which mode is live, the counts, the byte size and, when
 * keyword-only, the honest reason.
 */
export function buildMetadata(index, bytes, reason = null) {
  return {
    semantic_index: index.semantic_index,
    model: index.model,
    dims: index.dims,
    entries: index.entries ? index.entries.length : 0,
    vocabulary: index.vocabulary ? Object.keys(index.vocabulary).length : 0,
    bytes,
    reason,
    generated_by: 'scripts/build-semantic-index.mjs',
  };
}
