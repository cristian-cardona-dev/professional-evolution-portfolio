/**
 * Semantic search layer — pure, dependency-free, client-safe.
 *
 * The assistant ships **two** search modes and is honest about which one is
 * live (spec section 10, "hybrid with honest degradation"):
 *
 *   - `keyword-only` — today's behaviour, exactly `searchEntries` from
 *     `lib/assistant-search.ts`. The build emits no vectors at all.
 *   - `semantic` — the build embedded the assistant corpus and the query
 *     vocabulary with `@cf/baai/bge-m3` and shipped the vectors as a static
 *     JSON asset; this module turns a free-text query into a query vector and
 *     ranks entries by cosine similarity.
 *
 * **Zero production AI calls.** The query is never sent anywhere. `bge-m3`
 * runs only in `scripts/build-semantic-index.mjs`, at build time. At query time
 * the only network access is the `fetch` of the static asset
 * (`semantic-index.json`, a file this site already serves), and it happens once
 * per page visit.
 *
 * ## Why a query *vocabulary* and not a query embedding
 *
 * Cosine needs a query vector, and embedding the query at query time would be a
 * production AI call — forbidden. So the build also embeds the assistant's
 * **strong-token vocabulary** (`lo`: project names, tags, slugs, the documented
 * `KIND_TERMS`/`STATUS_TERMS` keyword affordances). At query time
 * `queryVector` tokenizes the query with the *same* `tokenize` the keyword
 * search uses (accent folding, stopwords, the Spanish→English synonym map) and
 * averages the vectors of the tokens it finds. That is a documented
 * approximation: a bag-of-words query vector, not a contextual query
 * embedding. It is deterministic, offline, and cannot invent an answer.
 *
 * A query whose tokens are all outside the vocabulary yields no vector, and a
 * query whose best cosine is below `SEMANTIC_MIN_SCORE` yields no semantic
 * hits; both cases fall back to the keyword search. Keyword substring matches
 * over the weak text (`we`) remain the keyword path's job, so the semantic
 * layer never *loses* a result the keyword search would have found.
 *
 * ## The hybrid ranking rule (deterministic, documented)
 *
 *   1. `keyword` = `searchEntries(entries, query, limit)` — the v1 ranking.
 *   2. `qv` = mean of the query tokens' vectors; absent → return `keyword`.
 *   3. `semantic` = entries with `cosine(qv, entry) >= SEMANTIC_MIN_SCORE`,
 *      sorted by cosine descending, ties by index ascending.
 *   4. `semantic` empty → return `keyword`.
 *   5. Otherwise **semantic-first, keyword-completed**: the semantic hits lead
 *      in cosine order, then the keyword hits not already present fill the
 *      remaining slots in keyword order, capped at `limit`.
 *
 * Step 5 is the "keyword results merged/boosted" rule: a keyword match that
 * also has a semantic score is a semantic hit (it leads); a keyword match with
 * no semantic score still appears (it fills), so a query that mixes vocabulary
 * words and unique words is answered by both signals.
 *
 * ## Which locale's entries the vectors describe
 *
 * The corpus is built once over the **English** canonical data (the site's
 * translation contract: `data/*.json` is English; `es` is a reviewed
 * translation). `assistantIndex(copy, locale)` returns the *same entries in the
 * same order* for both locales — only display text differs — and queries are
 * normalised to English tokens by `tokenize` before they are compared. So one
 * set of entry vectors serves both locales, and the shipped asset carries half
 * the bytes. `hybridSearch` guards this with an alignment check: if the vector
 * count does not match the entry count, it degrades to keyword-only.
 */
import { searchEntries, tokenize, type AssistantEntry } from './assistant-search.ts';

/** The embedding model the build used (Workers AI). Recorded in the asset. */
export const SEMANTIC_MODEL = '@cf/baai/bge-m3';

/** Vector length of `SEMANTIC_MODEL`. */
export const SEMANTIC_DIMS = 1024;

/**
 * Minimum cosine for an entry to count as a semantic hit.
 *
 * Conservative by design: the only failure mode of a threshold that is too
 * high is that the assistant behaves like the keyword search it already was
 * (honest degradation), never that it shows a semantically unrelated entry as a
 * match. The value is a documented default; it can only be calibrated against
 * real `bge-m3` vectors, i.e. once a human enables the build-time token (spec
 * gate 13.2). It is also the constant the fixed-fixture test asserts against.
 */
export const SEMANTIC_MIN_SCORE = 0.35;

/** Number of decimals the build rounds each vector component to (size budget). */
export const SEMANTIC_DECIMALS = 4;

/** The static asset the widget fetches, relative to the deployment base. */
export const SEMANTIC_INDEX_FILE = 'semantic-index.json';

/**
 * The shipped asset. `semantic_index` is the honest mode flag the build wrote;
 * `entries`/`vocabulary` are `null` in keyword-only mode (never fake vectors).
 */
export interface SemanticIndex {
  semantic_index: 'semantic' | 'keyword-only';
  model: string | null;
  dims: number;
  /** One vector per assistant index entry, in `assistantIndex` order. */
  entries: number[][] | null;
  /** Strong-token vectors, keyed by token (see the module header). */
  vocabulary: Record<string, number[]> | null;
}

/**
 * Deterministic embedding text of one assistant entry.
 *
 * Title, snippet, folded weak text and the strong tokens, newline-joined — the
 * exact fields the keyword index carries, so the semantic layer indexes the
 * same corpus the keyword layer does. `undefined`/empty fields are dropped so
 * the text is stable across locales.
 */
export function embeddingText(entry: AssistantEntry): string {
  return [entry.ti, entry.sn, entry.we, entry.lo.join(' ')]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join('\n');
}

/** Cosine similarity of two equal-length vectors; `0` on any unusable input. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Query vector: the mean of the vectors of the query's tokens that the
 * vocabulary knows. `null` when the query has no usable token — the caller
 * then falls back to the keyword search.
 */
export function queryVector(
  query: string,
  vocabulary: Record<string, number[]>,
): number[] | null {
  const tokens = tokenize(query).filter((token) => Object.hasOwn(vocabulary, token));
  if (tokens.length === 0) return null;
  const dims = vocabulary[tokens[0]].length;
  const sum = new Array<number>(dims).fill(0);
  for (const token of tokens) {
    const vector = vocabulary[token];
    if (vector.length !== dims) continue;
    for (let i = 0; i < dims; i += 1) sum[i] += vector[i];
  }
  return sum.map((value) => value / tokens.length);
}

/**
 * Validate a parsed asset. Anything unexpected — a missing mode flag, a
 * malformed vector, a keyword-only asset, a locale/entry count mismatch — is
 * rejected with `null`, and the caller keeps the keyword search. The seam can
 * therefore never be fooled by a stale or hand-edited file.
 */
export function parseSemanticIndex(raw: unknown, entryCount: number): SemanticIndex | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (value.semantic_index === 'keyword-only') return null;
  if (value.semantic_index !== 'semantic') return null;
  if (!Array.isArray(value.entries) || value.entries.length !== entryCount) return null;
  if (typeof value.vocabulary !== 'object' || value.vocabulary === null) return null;
  const dims = value.dims;
  if (typeof dims !== 'number' || dims <= 0) return null;
  const isVector = (candidate: unknown): candidate is number[] =>
    Array.isArray(candidate) &&
    candidate.length === dims &&
    candidate.every((component) => typeof component === 'number' && Number.isFinite(component));
  if (!value.entries.every(isVector)) return null;
  for (const vector of Object.values(value.vocabulary as Record<string, unknown>)) {
    if (!isVector(vector)) return null;
  }
  return {
    semantic_index: 'semantic',
    model: typeof value.model === 'string' ? value.model : null,
    dims,
    entries: value.entries as number[][],
    vocabulary: value.vocabulary as Record<string, number[]>,
  };
}

/**
 * Hybrid ranking — see the module header for the rule. `index` is `null` when
 * the asset is absent, keyword-only or unusable; the function then returns
 * exactly `searchEntries(entries, query, limit)`.
 */
export function hybridSearch(
  entries: AssistantEntry[],
  index: SemanticIndex | null,
  query: string,
  limit = 3,
): AssistantEntry[] {
  const keyword = searchEntries(entries, query, limit);
  if (!index || index.semantic_index !== 'semantic' || !index.entries || !index.vocabulary) {
    return keyword;
  }
  if (index.entries.length !== entries.length) return keyword;
  const qv = queryVector(query, index.vocabulary);
  if (!qv) return keyword;

  const semantic = entries
    .map((entry, position) => ({ entry, position, score: cosine(qv, index.entries![position]) }))
    .filter((candidate) => candidate.score >= SEMANTIC_MIN_SCORE)
    .sort((a, b) => (a.score !== b.score ? b.score - a.score : a.position - b.position));
  if (semantic.length === 0) return keyword;

  const out: AssistantEntry[] = [];
  const taken = new Set<number>();
  for (const candidate of semantic) {
    if (out.length >= limit) break;
    out.push(candidate.entry);
    taken.add(candidate.position);
  }
  for (const entry of keyword) {
    if (out.length >= limit) break;
    const position = entries.indexOf(entry);
    if (position !== -1 && taken.has(position)) continue;
    out.push(entry);
    if (position !== -1) taken.add(position);
  }
  return out;
}
