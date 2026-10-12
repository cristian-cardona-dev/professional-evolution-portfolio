# Task F-C report — Semantic assistant: build-time embeddings with honest degradation

Brief: `.superpowers/sdd/2026-10-12-comments-realtime/f-c-brief.md`
Binding spec: `docs/superpowers/specs/2026-10-12-comments-realtime-ai-design.md`
§10 (semantic assistant), §11 (failure modes), §13 (human gates).
Repo: `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`,
base `2059b56`.

## Status

**Complete.** Both commits landed, both search modes build, all gates green.
Keyword-only is a first-class build outcome, never an error and never fake
vectors. Zero production AI/REST calls. `worker/` and `Comments.astro` untouched.

## Commits

| # | Hash | Message |
|---|---|---|
| 1 | `985e0d9` | `ai(portfolio): add build time semantic search index` |
| 2 | `96ed0ba` | `ai(portfolio): add semantic search tests and build notes` |

## One-line validation

`npm --prefix web run build` green in keyword-only **and** semantic (stub) modes,
`npm run check:all` green, `npm --prefix web run test:quality` 11/11,
`npm --prefix web run test:ui` 108/108 (only the two deliberate `/build/`
baselines changed), `npx tsc --noEmit -p web` exit 0.

---

## What was built

### Commit 1 — build-time index, query-time hybrid

**New build-time generator (`scripts/`)**

- `scripts/build-semantic-index.mjs` — the `prebuild` step of
  `npm --prefix web run build`. Builds the corpus, chooses an embedder honestly,
  and writes `web/public/semantic-index.json` + `web/public/build-metadata.json`.
  Exits 0 in **every** path.
- `scripts/semantic-index-lib.mjs` — the pieces: `makeRestEmbedder` (Workers AI
  REST `POST .../ai/run/@cf/baai/bge-m3`, batched 20 texts/request),
  `stubEmbed` (the env-gated test seam), `assembleIndex`, `buildVocabulary`,
  `buildMetadata`, `roundVector`.

**Corpus shared with the keyword assistant (no drift)**

- New `web/src/lib/assistant-corpus.ts` — the entry builder extracted verbatim
  from `lib/data.ts`'s `assistantIndex`. `data.ts` now delegates to it and
  injects its real `route` + `milestoneTitle`; the generator injects a path
  passthrough + the shared `resolveMilestoneTitle`.
- The module has **no runtime import of the data layer**: data types arrive via
  `import type` (erased at run time), which is what lets a bare `node` process
  build the *exact same entries* the widget serializes. `data.ts` cannot be
  imported there (JSON import attributes + `import.meta.env` in `lib/urls.ts`).
- **Behaviour-preservation proof:** the serialized `data-assistant-index` of the
  built `en`/`es` pages was captured before and after the move — **byte-identical**
  (23,109 / 24,039 bytes), so the v1 keyword ranking is untouched.

**Query-time (client, zero AI calls)**

- New `web/src/lib/semantic-search.ts` — pure, dependency-free: `cosine`,
  `queryVector`, `parseSemanticIndex`, `hybridSearch`, `embeddingText`,
  `SEMANTIC_MIN_SCORE`. No `fetch`, no endpoint, no env.
- `AssistantWidget.astro` fetches the one static, same-origin asset lazily on
  panel open and ranks through `hybridSearch`; absent/keyword-only/malformed
  asset → exactly `searchEntries` (v1). The widget's WebMCP `tooldescription`
  and honesty banner were rewritten to stay true in **both** modes.
- New `web/src/lib/build-metadata.ts` — build-time reader (server-only,
  `node:fs`) used by the widget and `/build/`; absent file → honest
  keyword-only fallback.

**Wiring / artifacts**

- `web/package.json` gains `prebuild` (same pattern as the sitemap `postbuild`);
  Astro then copies `web/public/*` into `dist/`, so dist wiring is automatic.
- Generated artifacts are **gitignored** (decision D3) — see below.
- `copy.ts`: `assistant.banner` made mode-neutral + `assistant.modeSemantic` /
  `modeKeyword` (EN/ES parity type-enforced).

### Commit 2 — tests and build notes

- `web/tests/semantic-index.test.mjs` (8 tests): keyword-only generation emits
  no vectors and a tiny artifact; the stub seam produces 35 entry + 138
  vocabulary vectors, deterministic across runs and inside the 1.5 MB budget;
  a **fixed fixture** proves the relevant query ranks its entry first and an
  unrelated entry scores below `SEMANTIC_MIN_SCORE`; below-threshold and
  out-of-vocabulary queries are byte-for-byte the keyword search; malformed /
  misaligned assets are rejected; no file under `web/src/` references an AI
  endpoint or the stub env, and the ranking module never calls `fetch`.
- `/build/` + `/es/build/`: new honest search-mode line, picked from
  `build-metadata.json` at build time, so the page reports the mode the build
  actually has (`assistantNote` and `agentNote` also corrected to stop claiming
  "keyword search" / "no network request" unconditionally).
- `.github/workflows/quality.yml`: one step runs the new test file (after the
  existing web build), so the degradation gate is a real CI gate.
- Deliberate `/build/` baseline updates: `build-chromium-desktop-win32.png`,
  `build-chromium-mobile-win32.png` only.

---

## Design decisions worth reviewing

**D1 — How the query vector is obtained (the brief's central gap).**
Cosine needs a query vector, and embedding the query at query time would be a
production AI call — forbidden. The build therefore also embeds the assistant's
**strong-token vocabulary** (`lo`: names, tags, slugs, `KIND_TERMS`,
`STATUS_TERMS` — the documented "stable English keyword sets"); at query time
`queryVector` reuses the *same* `tokenize` (accent fold, stopwords, ES→EN
synonyms) and averages the vectors of the tokens it finds. This is a documented
bag-of-words approximation, deterministic and offline. Queries whose tokens are
all outside the vocabulary, or whose best cosine is below threshold, fall back
to the keyword search. Alternative considered and rejected: shipping no
vocabulary and using keyword-matched entries as semantic seeds — weaker and
does not match "cosine over the shipped vectors".

**D2 — One set of vectors serves both locales.** `assistantIndex` returns the
same entries in the same order for `en`/`es` (only display text differs) and
queries are normalised to English tokens, so the corpus is embedded once over
the English canonical data. Half the bytes; the generator guards the assumption
with a count + kind/year signature check and degrades to keyword-only on any
mismatch.

**D3 — Generate at build, never commit the artifact.** A committed keyword-only
file would advertise a capability the repo does not have; committed real vectors
would bake build-environment state into git and churn on every data edit. Both
files are gitignored and regenerated per build (dist wiring via `public/`).

**D4 — Ranking rule (semantic-first, keyword-completed).** `keyword` =
`searchEntries`; `semantic` = entries with cosine ≥ threshold, cosine desc,
index asc; if `semantic` is empty return `keyword`; otherwise take the semantic
hits first, then fill the remaining slots with keyword hits not already present,
capped at 3. Deterministic, documented in code + here. Keyword substring
matching over the weak text remains the keyword path's job, so the semantic
layer never *loses* a result v1 would have found.

**D5 — `SEMANTIC_MIN_SCORE = 0.35`, conservative by design.** A threshold that
is too high can only make the assistant behave like the keyword search it
already was (honest degradation); it can never show an unrelated entry as a
match. It is a documented default pending calibration against real `bge-m3`
vectors — see concern C1.

**D6 — CI stays honestly token-less.** `deploy-static.yml` was **not** touched,
so both build jobs run the prebuild with no credentials → keyword-only, as the
brief states. Activating semantic mode is the human gate: expose
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to the build step env (one
line) once the repo secrets exist. See concern C2.

**D7 — Scope addition: `.github/workflows/quality.yml`.** One test step was
added so the new gate actually runs in CI. `check:all` cannot host it: the
`validate` job runs `npm run check:all` **without** installing web deps, so the
root gate must stay mode-independent (it is).

## Measured index size (required)

| Artifact | Bytes | Notes |
|---|---|---|
| `semantic-index.json` (semantic) | **1,310,381 B ≈ 1.28 MB** | 173 vectors × 1024 dims, 4-decimal components: 35 entry vectors + 138 vocabulary vectors. Inside the ~1.5 MB budget. |
| `semantic-index.json` (keyword-only) | **88 B** | `{"semantic_index":"keyword-only","entries":null,"vocabulary":null,…}` — no vectors. |
| `build-metadata.json` | 177 B (semantic) / 227 B (keyword-only) | mode, counts, bytes, reason |

The test asserts `< 1.5 × 1024 × 1024` bytes, so the budget is enforced, not
just reported.

## Validation evidence

| Check | Result |
|---|---|
| `npm --prefix web run build` (no token) | prebuild logs `keyword-only — no CLOUDFLARE_API_TOKEN…`, 26 pages, exit 0 |
| `npm --prefix web run build` (`SEMANTIC_INDEX_STUB=1`) | prebuild logs `semantic via stub — 35 entry + 138 vocabulary vectors, 1279.7 KB`, exit 0 |
| `CLOUDFLARE_API_TOKEN=<bad>` build | prebuild logs `keyword-only — embedding failed (Workers AI responded 401)`, exit 0 (real REST failure path) |
| `npm --prefix web run test:quality` | 11/11 pass (2 links, 1 a11y, 8 semantic) |
| `npm --prefix web run test:ui` | 108/108 pass; only `/build/` desktop + mobile baselines regenerated |
| `npx tsc --noEmit -p web` | exit 0 |
| `npm run check:all` | exit 0 (evidence/case-studies sync idempotent; data files unchanged) |
| Index byte-identity after the corpus move | `en` 23,109 B and `es` 24,039 B identical before/after |
| Production AI-call grep | no `api.cloudflare.com` / `/ai/run/` / `SEMANTIC_INDEX_STUB` / `CLOUDFLARE_API_TOKEN` anywhere under `web/src/` or in the built client bundles; the only REST endpoint is `scripts/semantic-index-lib.mjs:143` (build time); the only runtime fetch target is `semantic-index.json` |
| `worker/` + `Comments.astro` | zero diff vs `2059b56` |
| `data/evidence.json`, `data/case-studies.json` | never staged (`git diff --name-only 2059b56..HEAD -- data/` empty) |

## Concerns

1. **C1 — the threshold is uncalibrated (highest-value follow-up).** With real
   `bge-m3` vectors the cosine scale between a *word-mean* query vector and a
   *full-text* entry vector is unknown, so `SEMANTIC_MIN_SCORE = 0.35` is a
   documented guess. If it is too high, the human enables the token and the site
   stays keyword-only (honest but disappointing); if too low, weakly related
   entries could surface. It can only be calibrated once a token is available —
   recommend a one-off local run to histogram relevant vs unrelated cosines and
   tune the constant. Deliberately conservative (D5).
2. **C2 — the human gate is not fully wired.** The brief says "semantic mode
   activates when the human adds the repo secrets", but the generator reads the
   credentials from the **build environment**, and `deploy-static.yml`'s build
   steps do not pass them (the same secret names already exist for the wrangler
   deploy). Adding the secrets alone therefore does nothing; one line exposing
   them to the `npm --prefix web run build` steps is required. Left unwired to
   keep CI honestly keyword-only exactly as the brief states — flagging so the
   human gate is explicit.
3. **C3 — `docs/assistant.md` is now stale and out of the brief's allowed
   paths.** It still says "no network call, and no runtime data fetch", "there
   is no semantic/embedding layer" and "v1 keyword search" (`docs/assistant.md`,
   "What it is" / "Known limitations of v1"), and the widget comment points at
   it. In semantic mode the client fetches one same-origin static asset, and a
   semantic layer exists. Not edited because `docs/` is not in the brief's
   allowed list — recommend a short follow-up doc update.
4. **C4 — the semantic path is untested against real vectors.** CI (and this
   machine) has no token, so only the stub exercises the semantic branch. The
   ranking rule, alignment guard and fallbacks are covered; the *quality* of the
   real embeddings is not (see C1).
5. **C5 — Spanish-only query words outside the synonym map** get no semantic
   signal (the vocabulary is the English strong-token set) and fall back to the
   keyword search, which is the documented pre-existing limitation.
6. **C6 — `web/public/semantic-index.json` is generated, so a bare `astro
   build` without the prebuild step ships no asset** (the widget then degrades
   to keyword-only) and `BuildNotes` reads the keyword-only fallback. This is
   honest but means `npm --prefix web run build` is the supported entry point,
   not raw `astro build`.
7. **C7 — F-A/F-B leftovers observed, untouched:** the working tree still has an
   unstaged `data/case-studies.json` modification plus untracked `.vscode/` and
   `package-lock.json`. None were staged.
