# Task F-A report — Comment core: DO + API + AI moderation + translation + UI

- **Status:** COMPLETE — implemented, tested end to end locally, all gates green.
- **Repo:** `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`, base `1af5534`.
- **Binding spec:** `docs/superpowers/specs/2026-10-12-comments-realtime-ai-design.md` §4, §5, §6, §8, §9, §11.
- **One-line validation:** `wrangler dev --local` + 29/29 comment tests green, `npm run check:all` green, `npm --prefix web run test:ui` 108/108 green, `tsc -p worker/tsconfig.json` clean, `wrangler deploy --dry-run` valid, and no timers in Worker/DO code.
- **Not deployed. No remotes touched. No push.**

---

## 1. Commits

| Commit | Message | Contents |
|---|---|---|
| 1 | `ai(portfolio): add comments core worker and durable object` | `wrangler.jsonc`, `worker/**` (runtime + unit/integration tests), `package.json` scripts |
| 2 | `ai(portfolio): add comment ui with honest degradation` | `web/src/components/Comments.astro`, `web/src/config/comments.json`, `web/src/lib/comments.ts`, `web/src/i18n/copy.ts`, `web/src/views/*` |
| 3 | `ai(portfolio): update visual baselines for comments sections` | 8 regenerated screenshots |
| 4 | `ai(portfolio): add comments core report` | this report |

`data/case-studies.json` and `data/evidence.json` were **never staged** (the former is dirty in the working tree from before this task and stays that way).

---

## 2. Exact environment variables the human must create

| Variable | Where | Value | Never committed? |
|---|---|---|---|
| `TURNSTILE_SECRET` | Cloudflare Worker **secret** (`npx wrangler secret put TURNSTILE_SECRET`) | Turnstile *secret key* from the CF dashboard widget | yes |
| `COMMENTS_ADMIN_TOKEN` | Cloudflare Worker **secret** (`npx wrangler secret put COMMENTS_ADMIN_TOKEN`) | a human-generated random string (e.g. `openssl rand -hex 32`) | yes |
| `PUBLIC_TURNSTILE_SITEKEY` | **Build-time** repo variable for `.github/workflows/deploy-static.yml` (both the `github-pages` and `cloudflare-worker` build steps) | Turnstile *sitekey* from the CF dashboard widget | public by design — it is rendered into the HTML; still set it as a variable, not in code |

Notes for the human:

- The sitekey reaches the component as `import.meta.env.PUBLIC_TURNSTILE_SITEKEY` (Astro public env). Wire it in the workflow as
  `PUBLIC_TURNSTILE_SITEKEY: ${{ vars.PUBLIC_TURNSTILE_SITEKEY }}` on **both** build steps.
- `TURNSTILE_SECRET` and `COMMENTS_ADMIN_TOKEN` are read only from `env` at runtime and never appear in the repo. The `wrangler deploy` in CI does not remove secrets already set on the Worker, so a one-off `wrangler secret put` per secret is enough.
- Until `PUBLIC_TURNSTILE_SITEKEY` exists, every page with comments renders the **disabled** honest state — that is the designed behaviour, not a bug.
- Turnstile's Managed widget passes the axe gate with no exclusions (spec §8); the axe suite here runs without a sitekey, so the widget itself is audited only when the human configures one.
- **One manual `wrangler deploy` may be required** (spec §13.4): the Worker mirror is now `main` + DO migrations, and if Cloudflare Workers Builds does not apply DO migrations, a single manual `npx wrangler deploy` (or `wrangler deploy` with the migration tag `v1`) creates the `CommentsRoom` SQLite class.

---

## 3. What was built (file map)

**Worker + Durable Object** (`worker/`, zero runtime deps, bundled by wrangler/esbuild):

- `worker/index.ts` — Worker entry: routes `/api/comments/*` and `/api/moderation/*`; everything else falls through to `env.ASSETS`. Admin bearer auth, constant-time token compare, page-id normalization, error codes.
- `worker/comments-room.ts` — the SQLite Durable Object. One class, three instance roles:
  - `comments:<page>` — `comments` table exactly per spec §5, transient hashed-IP rate limit, presence (`ctx.getWebSockets().length`), report counting, and the moderation/translation pipeline;
  - `__budget__` — the **site-wide** daily neuron counter (spec §6.3);
  - `__moderation__` — cross-page index (`index:<id>` → page, so the admin API can route any id and GDPR delete can find published comments) + the human review `queue:<id>`.
- `worker/ai.ts` — `@cf/meta/llama-guard-3-8b` (temperature 0, max_tokens 16, strict `safe`/`unsafe` parse) and `@cf/meta/m2m100-1.2b` one-shot translation, plus the test-only `AI_MOCK` seam.
- `worker/turnstile.ts` — server-side `siteverify`, plus the test-only `TURNSTILE_BYPASS` seam.
- `worker/language.ts` — pure helpers (page locale, language normalization, page-id normalization, UTC day) importable by `node --test`.
- `worker/env.d.ts`, `worker/tsconfig.json` — ambient runtime types + strict typecheck config (no `@cloudflare/workers-types` dependency).
- `worker/tests/ai-gate.test.mjs` — 13 unit tests (seams, guard parsing, language/page normalization).
- `worker/tests/comments-api.test.mjs` — 16 integration tests against the real Worker + DO under `wrangler dev --local`.

**Config:** `wrangler.jsonc` gains `main`, `durable_objects.bindings` (`COMMENTS` → `CommentsRoom`), `migrations` with `new_sqlite_classes` (tag `v1`), the `AI` binding, `vars.ENVIRONMENT = "production"`, and `assets.run_worker_first: ["/api/*"]` so static assets keep serving first and only the API falls through to the script.

**Front end:** `web/src/components/Comments.astro` (form + list + translation badge + "ver original" toggle + report link + GDPR note + aria-live regions + no-JS mailto fallback), `web/src/config/comments.json` (per-route enable patterns), `web/src/lib/comments.ts` (glob matcher + page-id builder), `web/src/i18n/copy.ts` (`comments` block in **both** locales, type-enforced parity), and the five content views.

---

## 4. The four non-negotiable process points

**(a) Production never honours `AI_MOCK`.** The gate is a single expression: `ENVIRONMENT === 'test' && AI_MOCK === '1'`. Evidence:
- `worker/tests/ai-gate.test.mjs` asserts `false` for `{production, AI_MOCK:1}`, `{AI_MOCK:1}` with no ENVIRONMENT, `{staging, AI_MOCK:1}`, `{test}` alone and `{Test, AI_MOCK:1}`; `true` only for `{test, AI_MOCK:1}`.
- The same test asserts that a production-shaped env with `AI_MOCK=1` and no AI binding **throws** on `moderate()`/`translate()` (which the pipeline turns into `pending`) instead of returning a mocked "safe".
- `wrangler.jsonc` ships `ENVIRONMENT: "production"` as the default; the test suite is the only place that overrides it to `test`.
- The Turnstile bypass has the identical shape and is asserted the same way (including that production still calls the real `siteverify` endpoint).

**(b) Fail-closed moderation.** `worker/comments-room.ts#create`: `published` is reachable **only** when verdict A is `safe` AND (for cross-locale/unmapped comments) verdict B is `safe`. A model error, an unparseable verdict, a missing translation, a translation failure, a paused budget or disagreeing gates all write `pending`. Integration tests cover: unsafe → pending, translation failure → pending, disagreement (source safe / translation unsafe) → pending, and pending comments are absent from the public list.

**(c) Turnstile-unconfigured is an honest disabled form.** `verifyTurnstile` returns `unconfigured` when `TURNSTILE_SECRET` is absent and the API answers **503** — a direct POST can never be accepted unverified. On the client, no sitekey means the server renders the form inside a `disabled` fieldset with the visible "Comments are temporarily unavailable." notice, the Turnstile widget is not rendered at all, and the inline script's enable path is gated on `data-configured="true"`. Additionally the fieldset is **disabled in the server HTML even when configured**, and only the client enables it after a successful API probe — so a form is never interactive while the backend is unreachable (this is what makes the canonical GitHub Pages host degrade honestly).

**(d) No timers in Worker/DO code.** Verified: `setTimeout`/`setInterval`/`setImmediate`/`requestAnimationFrame` appear **nowhere** in `worker/index.ts`, `worker/comments-room.ts`, `worker/ai.ts`, `worker/turnstile.ts`, `worker/language.ts` (the single grep hit is the doc comment in `comments-room.ts` that states the rule). The only occurrences under `worker/` are in the test harness's readiness poll and cleanup — test code, not DO/Worker runtime code.

---

## 5. Validation evidence

### 5.1 Comment core suite — `npm run test:comments`

`node --test "worker/tests/**/*.test.mjs"` → **29 tests, 29 pass, 0 fail** (36.4 s; the first test absorbs the ~30 s `wrangler dev` startup).

Integration suite runs against the real Worker + Durable Object (`wrangler dev --local`, miniflare, throwaway `--persist-to` dir; no DO-layer mocks — spec §12) with the test seams `ENVIRONMENT=test`, `AI_MOCK=1`, `TURNSTILE_BYPASS=1`. Observed assertions:

| Behaviour | Result |
|---|---|
| `GET` fresh page | 200, `comments: []`, `presence: 0`, `translation_paused: false` |
| honeypot filled | 400 `rejected`, nothing stored |
| body 2001 chars / exactly 2000 | 400 `invalid_body` / 201 |
| 6th POST in an hour, one IP, one page | 429 `rate_limited`; the first 5 are 201 |
| mock-safe comment | 201 `published`, visible in `GET` |
| mock-unsafe comment | 201 `pending`, **not** in `GET` |
| ES comment on EN page | `translation: "[en] hola mundo"` cached and returned |
| undeclared/other language (`fr`) | `source_lang: "other"`, best-effort translation, double-gated |
| disagreeing gates | `pending`, `reason: unsafe_translation` |
| translation failure | `pending`, `reason: translation_failed`, `translation: null` |
| admin queue without/with wrong token | 401 |
| admin `approve` | 200 → `published`, appears in `GET`, queue entry removed |
| 3 reports | reports 1→2 `published`, 3rd → `flagged`, removed from `GET`, back in the queue |
| admin `remove` | 200 → `removed`, gone from `GET` (GDPR path) |
| `/api/comments/:page/ws` | 501 `ws_not_implemented` (honest F-B seam, not a fake socket) |
| unknown route / wrong method | 400 / 405 |

### 5.2 Real models — honest statement

**Not run.** `npx wrangler whoami` → *"You are not authenticated."* There is no Cloudflare account/token in this environment, and `wrangler dev --local` reports `env.AI → AI: not supported` (Workers AI is remote-only). A real end-to-end call against `llama-guard-3-8b` / `m2m100-1.2b` was therefore **impossible here**, and no claim of one is made. The real path is exercised in the code (`env.AI.run` with the documented input shapes) and its *failure* mode is exercised for real: locally the AI binding is unsupported, so any non-mocked request takes the throw → `pending` branch — which is exactly the fail-closed behaviour the spec requires.

### 5.3 Typecheck and deployability

- `node web/node_modules/typescript/bin/tsc -p worker/tsconfig.json` → **exit 0, clean** (strict, no `any` escapes in the Worker source).
- `npx wrangler@4.147.0 deploy --dry-run` → **valid**: 24 assets read from `./dist`, Worker bundled (21.91 KiB / 6.52 KiB gzip), bindings `COMMENTS` (Durable Object), `AI`, `ASSETS`, `ENVIRONMENT ("production")`. No auth needed for a dry run, so this is real config validation, not a simulated pass.
- Static-asset-first confirmed live on `wrangler dev`: `GET /` → 200 HTML straight from `./dist`, while `GET /api/comments/…` → the Worker (with its own `nosniff` + `Referrer-Policy`, since `_headers` only governs static responses). `_headers` itself is untouched.

### 5.4 Site gates

- `npm run check:all` → **green** (legacy build, snapshot validation, activity, url registry, `node --test site/test.mjs` 27/27, doctor PASS, `evidence:sync`, `case-studies:sync`, `data:validate`, activity check).
- `npm --prefix web run test:ui` → **108/108 passed** (Playwright: 12 screenshot baselines + 96 axe scans across dark/light and desktop/mobile, including every case study and both 404 routes). axe passes with the comments section present in both schemes — no exclusions added.
- Pages with comments disabled are byte-identical to before: `data-comments` appears in `work/`, `career/`, `evolution/`, `build/` and the case studies, and appears **nowhere** in `index.html`, `es/index.html` or `evidence/index.html`.

### 5.5 Timers grep

```
Select-String -Path worker/index.ts,worker/comments-room.ts,worker/ai.ts,worker/turnstile.ts,worker/language.ts \
  -Pattern 'setTimeout|setInterval|setImmediate|requestAnimationFrame'
→ only the doc comment in comments-room.ts line 29 that states the rule
```

---

## 6. Deliberate baseline updates (pixels changed on purpose)

Because comments are enabled on those routes and the build has no sitekey, the honest **disabled** state adds a section to four pages. These 8 baselines were regenerated with `npx playwright test tests/visual/visual.spec.mjs --update-snapshots` and are intentional:

| Baseline | Viewport | Why |
|---|---|---|
| `work-chromium-desktop-win32.png` | 1280×900 | comments section added to `/work/` |
| `work-chromium-mobile-win32.png` | 390×844 | same |
| `career-chromium-desktop-win32.png` | 1280×900 | comments section added to `/career/` |
| `career-chromium-mobile-win32.png` | 390×844 | same |
| `evolution-chromium-desktop-win32.png` | 1280×900 | comments section added to `/evolution/` |
| `evolution-chromium-mobile-win32.png` | 390×844 | same |
| `build-chromium-desktop-win32.png` | 1280×900 | comments section added to `/build/` |
| `build-chromium-mobile-win32.png` | 390×844 | same |

**Unchanged on purpose:** `home` and `es` baselines (neither route is in `comments.json`), plus every case-study, résumé, print and 404 page (axe-only coverage).

---

## 7. Deliberate decisions, deviations and how they stay honest

1. **`run_worker_first: ["/api/*"]`** instead of relying on implicit asset-first fallthrough. This makes "only the API reaches the Worker" explicit and keeps `_headers`/asset behaviour byte-identical for every other path.
2. **`:page` is one URL-encoded path segment.** The spec's `/api/comments/:page` shape is preserved even though page ids contain slashes (`es%2Fwork%2Fcloud-dashboard%2F`); the DO id is the spec's literal `comments:<page>`, and the page is normalized to always end with `/`.
3. **The neuron counter lives in a shared `__budget__` DO instance**, not in each page room. With one DO per page, a literal per-page counter would make the 5,000/day guardrail per page — a busy page could exhaust its own budget while the rest of the site kept spending. One shared instance keeps the spec's *site* budget intent. An unreadable budget is treated as **exhausted** (auto-translation skipped) rather than as zero.
4. **Translation is paused, not silently dropped.** When the budget flips, cross-locale comments are stored with `translation: null` and queued (`pending`), and the list response carries `translation_paused: true` so the UI says so. The viewer-triggered on-demand fetch is F-B-adjacent and is explicitly **not** built (brief §7).
5. **Moderation consumes the same translation** used for display (spec §6.2) — no extra inference, and the double gate is on the exact text the reader will see.
6. **A comment in an unmapped language defaults to `other`** (missing/malformed declaration included), which forces the translation + double-gate path; a translation failure queues it. A concrete ISO code (e.g. `fr`) is preserved for m2m100 while the stored column stays `other`.
7. **Rate-limit keys store a salted SHA-256 of the IP**, never the IP. The per-room salt is random and stored in the DO; only the hash and the current window's timestamps are persisted (spec §4.2 "IPs are used transiently … and never persisted").
8. **GDPR delete is admin-mediated** (`POST /api/moderation/:id {action:"remove"}`); there is no self-service path. The cross-page index is what lets the admin find a *published* comment by id.
9. **`GET` responses never expose pending/flagged bodies.** Only `published` rows are listed.
10. **No new npm dependency.** `wrangler` is invoked through `npx --yes wrangler@4.147.0` — the exact pinned convention `.github/workflows/deploy-static.yml` already uses — so the test harness adds no root dependency and no lockfile churn. `typescript` for the Worker typecheck is taken from `web/node_modules` (already installed by `npm --prefix web ci`).
11. **`worker:check` and `test:comments` are deliberately NOT added to `check:all`.** `check:all` runs in CI where only `npm --prefix web ci` is installed (no wrangler, no network for npx), so wiring them in would make the deploy gate fail for the wrong reason. They are documented local gates.
12. **Worker responses carry their own `nosniff` + `Referrer-Policy`.** `_headers` only applies to static assets, so the API hardens itself.

---

## 8. Seams left for F-B (realtime) and F-C (semantic)

- `GET /api/comments/:page/ws` exists and answers **501 `ws_not_implemented`** — the route is reserved and honest, with no fake socket.
- `presence()` already returns `ctx.getWebSockets().length` and the list response already carries `presence`; it is `0` until F-B. No WebSocket code, no hibernation handling, no `serializeAttachment` — deliberately out of scope.
- The single F-B client seam is the comment in `Comments.astro`'s inline script marking the `data-comments-live` polite live region (already rendered, nothing writes to it) where the WS client attaches.
- `translation_paused` is already surfaced end to end; the on-demand viewer-triggered translation (F-B-adjacent) is the only missing half of the §6.3 guardrail.
- No embeddings, no vector index, no `/build/` semantic-mode statement — F-C untouched.

---

## 9. Concerns / residual risks (for the reviewer)

1. **No real-model verification was possible here** (no Cloudflare auth). The real `llama-guard-3-8b` output shape is handled defensively (strict parse, unknown output → throw → `pending`), but the model's actual behaviour on Spanish text remains unverified in this environment. First real check belongs to the human gate.
2. **DO-to-DO index write is not retried.** If `__moderation__.register` throws after the comment row is inserted, the comment exists as `pending` but is not in the review queue. It is deliberately *not* swallowed (the API surfaces the error) so the failure is loud rather than silent, but a retry/dead-letter path is a v2 hardening item.
3. **One DO instance per page means the moderation queue is a second write per comment.** Fine at portfolio volume (spec §6.3), but it is the one place where a page write is not self-contained.
4. **Per-IP rate limiting is per page**, per the spec's "5/hour per IP per page". An abuser rotating pages is not throttled globally.
5. **The comments UI is only functional on the Cloudflare Workers mirror.** On the canonical GitHub Pages host there is no `/api/comments`, so the client probe fails and the form stays disabled with the honest notice. If comments are wanted on Pages too, a CORS-enabled API origin plus `comments.json.apiBase` is the follow-up (`apiBase` already exists and is wired).
6. **`.wrangler/` is not gitignored.** Local `wrangler dev` state (3.5 MB) was created during validation and removed; it will reappear on the next local run. Adding `.wrangler/` to `.gitignore` is recommended but was left out to keep the change surface inside the brief's allowed file list.
7. **The `_headers` security headers do not apply to Worker responses** — the API sets its own minimal pair. If the human wants the full Phase-D header set on API responses, that belongs in the Worker.
8. **`data/case-studies.json` is dirty in the working tree** from before this task and was intentionally left unstaged; `npm run check:all` did not change `data/evidence.json`.
9. **The integration harness depends on `npx` resolving `wrangler@4.147.0` and on a ~30 s cold start.** It passed 3/3 runs here, but one run in the middle of this session hit the 120 s readiness deadline (wrangler printed its banner and never reached "Ready"), which is a transient npx/network condition rather than a code failure — the immediate re-run passed 29/29. If this suite is ever wired into CI, the readiness timeout should be raised and the npx cache warmed (or wrangler pinned as a devDependency) before trusting it as a gate.
