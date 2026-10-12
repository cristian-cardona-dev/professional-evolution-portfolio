# Task F-B report — Realtime + presence + cross-host connectivity

- **Status:** COMPLETE — implemented, tested end to end locally, all gates green.
- **Repo:** `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`, base `baa1a84`.
- **Binding spec:** `docs/superpowers/specs/2026-10-12-comments-realtime-ai-design.md` §7 (realtime/presence), §11 (degradation), §12 (testing).
- **One-line validation:** `npm run test:comments` 36/36 (F-A 29/29 + WS 7/7) against a real `wrangler dev --local` DO, `npm run check:all` green, `npm --prefix web run test:ui` 108/108 (no baseline changes), `tsc -p worker/tsconfig.json` clean, `wrangler deploy --dry-run` valid, zero timers in Worker/DO runtime, CORS never `*`.
- **Not deployed. No remotes touched. No push. No subagents.**

---

## 1. Commits

| Commit | Message | Contents |
|---|---|---|
| 1 | `ai(portfolio): add realtime presence and cross host comments api` | `worker/origins.ts` (new), `worker/comments-room.ts`, `worker/index.ts`, `worker/env.d.ts`, `web/src/components/Comments.astro`, `web/src/config/comments.json`, `web/src/i18n/copy.ts`, `.gitignore`, `worker/tests/comments-api.test.mjs` (WS-seam assertion updated) |
| 2 | `ai(portfolio): add realtime test harness and reports` | `worker/tests/comments-ws.test.mjs` (new), this report |

`data/case-studies.json` and `data/evidence.json` were **never staged**. `data/case-studies.json` was already dirty in the working tree before this task and stays dirty and unstaged; `data/evidence.json` is untouched.

---

## 2. What was built

### 2.1 Worker + Durable Object

- **`worker/origins.ts` (new).** The single allowlist: exactly `https://cristian-cardona-dev.github.io` and `https://professional-evolution-portfolio.crisss198.workers.dev` (both taken verbatim from `site/site-config.json`). `isAllowedOrigin()` and `corsHeaders()` live here so the REST CORS path and the WS upgrade check can never drift. A disallowed or absent origin gets only `Vary: Origin` — never `Access-Control-Allow-Origin`, never `*`.
- **`worker/comments-room.ts`.**
  - `fetch(request)` is the WebSocket upgrade handler. It rejects a non-allowlisted (or missing) `Origin` with `403 origin_not_allowed` **before** accepting, rejects a non-upgrade request with `426 upgrade_required`, then uses the Hibernation API: `ctx.acceptWebSocket(server)` + `server.serializeAttachment({ page, joinedAt })` and answers `101` with the client end. The page comes from `ctx.id.name` (`comments:<page>`), with a URL-parse fallback.
  - `webSocketMessage` / `webSocketClose` / `webSocketError` are the hibernation handlers. Close/error broadcast the new presence to the remaining sockets (the closing socket is excluded from the count, which is robust whether or not the runtime has already removed it from `getWebSockets()`).
  - `broadcast()` sends one batched `{type:'comment', comment, presence}` frame on publish; `broadcastPresence()` sends `{type:'presence', count}` on open and close. A dead socket is skipped so one broken connection cannot break the fan-out.
  - Publish fan-out is wired into `create()` and into `adminAct()` `approve` (spec §5: `approve` runs the publish path).
  - The constructor stayed exactly as F-A left it (two idempotent DDL statements); no per-connection state was added to a field.
- **`worker/index.ts`.** `handleComments` now wraps every response in `withCors(response, origin)` and `routeComments` answers `OPTIONS` with `204` (the JSON POST is preflighted). A `101` is returned untouched by `withCors` so the upgraded socket is never rebuilt. `/api/comments/:page/ws` is forwarded to the page DO (`pageRoom(env, page).fetch(request)`) instead of the old `501 ws_not_implemented`.
- **`worker/env.d.ts`.** Added the runtime surfaces F-B needs and nothing more: `DurableObjectState.id` / `acceptWebSocket`, a `HibernatableWebSocket` interface (`serializeAttachment` / `deserializeAttachment`), `WebSocketPair`, and `ResponseInit.webSocket`. Still zero `@cloudflare/workers-types` dependency.

### 2.2 Front end

- **`web/src/config/comments.json`** — `apiBase` is now `https://professional-evolution-portfolio.crisss198.workers.dev`, so the canonical GitHub Pages host reaches the Worker mirror cross-origin (F-A concern #5 → brief §3). The Worker mirror itself stays same-origin.
- **`web/src/i18n/copy.ts`** — `presenceTemplate` (`~{n} viewing now` / `~{n} viendo ahora`), `reconnecting` (`Reconnecting…` / `Reconectando…`) and `newComment` in **both** locales (parity is type-enforced by the `Copy` interface).
- **`web/src/components/Comments.astro`** — the realtime client attaches at the F-A seam, inside the `configured` branch (so a deployment without a Turnstile sitekey keeps F-A's honest "temporarily unavailable" state and never opens a socket):
  - `WebSocket` to `<apiBase or same-origin>/api/comments/<page>/ws`, `https→wss`.
  - Auto-reconnect with exponential backoff (1 s → 2 s → … capped at **30 s**), an honest `reconectando…` indicator, and a resync `load()` on every (re)open. A deploy disconnects every socket (spec §7) and the client recovers with no user action.
  - On WS failure/blocked: a **60 s** REST poll as a silent background refresh (it never disables the form or shouts over the status line). If the socket never opens, the reconnect indicator stops after 3 attempts and polling carries on — the UI does not claim to be reconnecting forever.
  - `~N viendo ahora` presence, hidden at count 0; arriving comments go to the existing `aria-live` region (`data-comments-live`) and are de-duplicated by id, so a comment that arrives both by socket and by REST is shown once.
- **`.gitignore`** — `.wrangler/` added (F-A concern #5). Verified: `.wrangler/` now exists locally from the test runs and does **not** appear in `git status`.

---

## 3. The five non-negotiable process points

**(a) ZERO timers in Worker/DO code.** `setTimeout|setInterval|setImmediate|requestAnimationFrame` appears nowhere in `worker/index.ts`, `worker/comments-room.ts`, `worker/ai.ts`, `worker/turnstile.ts`, `worker/language.ts`, `worker/origins.ts` — the only hit is the doc comment in `comments-room.ts:29` that states the rule. Heartbeats are the runtime's automatic ping/pong; every backoff/poll timer lives in `Comments.astro` (browser only) or the Node test harness.

**(b) CORS allowlist is the two real origins, never `*`; the WS upgrade validates Origin server-side.** The only `access-control-allow-origin` write in the codebase is `origin as string` in `origins.ts` (an allowlisted origin); the only `*` in that file is inside prose. Asserted by tests: `corsHeaders('https://evil.example')['access-control-allow-origin'] === undefined`, `isAllowedOrigin('*') === false`, the preflight from a bad origin returns no ACAO, and the WS upgrade returns `403` for `https://evil.example`, for a missing Origin, and for `http://localhost:4321` while the allowlisted origin gets `101`.

**(c) Presence copy is best-effort.** The rendered string is `~{n} viendo ahora` / `~{n} viewing now` — a tilde, never an exact claim — and the spec's "best-effort" wording is echoed in the copy comment and in the client comment. Presence is `ctx.getWebSockets().length`, never persisted.

**(d) Regression first.** The F-A API suite was run to green (29/29) **before** any edit, and is green again after (29/29) — the single WS-seam test was updated in place (`501 ws_not_implemented` → `403 origin_not_allowed`) so the count is unchanged and the suite stays honest about the now-real socket.

**(e) Never stage the data files.** Neither `data/case-studies.json` nor `data/evidence.json` is in either commit.

---

## 4. Validation evidence

### 4.1 Comment suites — `npm run test:comments` (real Worker + DO under `wrangler dev --local`)

`node --test "worker/tests/**/*.test.mjs"` → **36 tests, 36 pass, 0 fail** (~30 s).

| Suite | Tests | Result |
|---|---|---|
| `worker/tests/ai-gate.test.mjs` (F-A) | 13 | 13/13 |
| `worker/tests/comments-api.test.mjs` (F-A, one assertion updated) | 16 | 16/16 |
| `worker/tests/comments-ws.test.mjs` (F-B, new) | 7 | 7/7 |

F-B WS assertions, all against the real hibernation API (no DO-layer mocks):

| Behaviour | Result |
|---|---|
| allowlist is exactly the two real origins; `*`/evil/localhost/absent all rejected | PASS (unit) |
| two clients on one page → presence 1 then 2; REST `presence` agrees (2) | PASS |
| REST publish → **both** sockets receive one batched `{type:'comment', comment, presence:2}` with the posted id | PASS |
| close one client → the survivor receives `{type:'presence', count:1}`; REST `presence` is 1 | PASS |
| upgrade with `https://evil.example` / missing Origin / `http://localhost:4321` → `403`; allowlisted Origin → `101` | PASS |
| a real WebSocket client with a bad Origin fails to open | PASS |
| plain GET on the socket path → `426` | PASS |
| `serializeAttachment` → `deserializeAttachment` round-trip (test-only `__attachment__` probe) | PASS |
| admin `approve` broadcasts the comment like a publish | PASS |
| REST: ACAO only for the allowlisted Origin; absent for evil/absent Origin; preflight `204` with `GET, POST, OPTIONS` + `content-type`; bad-origin preflight has no ACAO | PASS |

**Hibernation survival — honest statement.** `wrangler dev` exposes no way to force a DO eviction, so true *wake-after-eviction* is **not** asserted. What is asserted is the real `serializeAttachment`/`deserializeAttachment` round-trip inside the DO, through a test-only message gated by `ENVIRONMENT === 'test'` (the same seam pattern as F-A's `AI_MOCK`/`TURNSTILE_BYPASS`; production ignores every client message). That is the strongest local proof available and it is stated as such.

**Close-handshake note (harness, not product).** The Node WS client waits ~10 s for the peer's close frame; the DO's `webSocketClose` actually fires within ~2 ms (measured: the survivor's presence frame arrived 2 ms after the client called `close()`). The harness therefore bounds its own close wait at 2 s and never depends on it for an assertion. This is a client-side undici behaviour, not a defect in the DO.

**Flakiness / CI.** The WS suite lives in the same npm script and glob as the F-A API suite (`npm run test:comments`), so it runs in the same job whenever that script is run. It was **not** flaky here (3 consecutive green runs of the file, plus two green runs of the combined suite). It is **not** wired into `check:all`/CI for the same reason F-A left `test:comments` out (F-A decision #11: CI installs only `npm --prefix web ci`, no wrangler/npx network) — so no env-var gate was added, because there is no CI run to gate and gating would be fake-green machinery. If it is ever wired to CI, the F-A caveat applies: raise the readiness timeout and warm the npx cache first.

### 4.2 Typecheck and deployability

- `node web/node_modules/typescript/bin/tsc -p worker/tsconfig.json` → **exit 0, clean** (strict).
- `npx --yes wrangler@4.147.0 deploy --dry-run` → **valid**: 27.53 KiB / 8.23 KiB gzip, bindings `COMMENTS` (DO), `AI`, `ASSETS`, `ENVIRONMENT ("production")`. **No new migration** — the `CommentsRoom` class and its `v1` migration are unchanged from F-A, so no migration tag is needed.

### 4.3 Site gates

- `npm run check:all` → **green** (legacy build, snapshot validation, activity, url registry, `node --test site/test.mjs` 27/27, doctor PASS, `evidence:sync`, `case-studies:sync`, `data:validate`).
- `npm --prefix web run test:ui` → **108/108 passed** (12 visual baselines + 96 axe scans, dark/light, desktop/mobile). **No baseline changed** (see §5).
- Built-artifact check (`web/dist`): `work/index.html` carries `data-api-base="https://professional-evolution-portfolio.crisss198.workers.dev"`, `data-presence-template="~{n} viewing now"`, `data-reconnecting="Reconnecting…"` (U+2026 intact, verified at the codepoint level); `es/work/index.html` carries the ES variants.

### 4.4 Greps

```
setTimeout|setInterval|setImmediate|requestAnimationFrame  over worker/{index,comments-room,ai,turnstile,language,origins}.ts
→ only the doc comment in comments-room.ts:29
access-control-allow-origin in worker/ → origins.ts:35 `origin as string` (allowed origin only); tests assert never '*'
isAllowedOrigin / origin_not_allowed in comments-room.ts:213-214 → the upgrade gate exists
ws_not_implemented → absent from worker/index.ts
```

---

## 5. Deliberate baseline updates

**None.** All 108 UI tests pass with the existing baselines. The new presence/reconnect elements are rendered `hidden` and the realtime client only starts inside the `configured` branch; the UI suite builds without `PUBLIC_TURNSTILE_SITEKEY`, so `configured` is `false` and no socket, presence or reconnect UI ever appears in the captured pages. The pixels are unchanged on purpose, not by accident.

---

## 6. Deliberate decisions and deviations

1. **Origin check in the Durable Object, not the Worker.** The brief says the upgrade handler must validate; the DO owns the upgrade, so that is where the check lives. The REST CORS headers are applied in the Worker.
2. **`withCors` skips `101`.** Rebuilding a `101` response would drop the upgraded socket; CORS does not apply to WebSockets anyway.
3. **Broadcast on admin `approve`.** Spec §5 says `approve` runs the publish path, so it broadcasts the same batched frame. Cheap, consistent, and tested.
4. **Client realtime gated on `configured`.** Without a Turnstile sitekey the whole comments surface is F-A's honest disabled state; opening a socket there would contradict it (and would have churned the visual baselines for no product value).
5. **Reconnect indicator stops after 3 attempts.** A socket blocked by a proxy would otherwise show "reconectando…" forever; after 3 failed attempts the client keeps polling silently instead of making a claim it cannot honour.
6. **Test-only attachment probe instead of a fake eviction test.** See §4.1 — documented honestly rather than faked.
7. **Node's global `WebSocket` needs no devDependency.** Its non-standard options object (`{ headers: { origin } }`) is exactly what the harness needs to send the `Origin` header the server validates; verified empirically before writing the harness. Zero new deps, zero lockfile churn.
8. **The F-A WS-seam test was updated in place** (`501` → `403`) rather than deleted, so the suite still asserts an honest property of the socket endpoint and keeps its 29-test shape.

---

## 7. Verified locally vs. needs the post-push live check

**Verified locally (real code, real runtime):**

- The WS upgrade, hibernation accept, per-connection attachment round-trip, presence events, batched publish fan-out and close handling — against the real Worker + DO under `wrangler dev --local`.
- The Origin allowlist rejects evil / missing / localhost origins and accepts the two real ones; REST CORS and preflight behave the same way.
- `serializeAttachment`/`deserializeAttachment` round-trip through the hibernation API (eviction itself is not triggerable locally — §4.1).
- The built site propagates `apiBase`, the presence template and the reconnect copy into the HTML on both locales.
- Zero timers in Worker/DO runtime; CORS never `*`; config deploys (dry-run).

**Needs the post-push live check (cannot be done locally — the allowlist deliberately contains no local origin):**

1. **The key assertion for the controller:** comments actually **load on the canonical GitHub Pages origin cross-origin** — i.e. `https://cristian-cardona-dev.github.io/professional-evolution-portfolio/work/` fetches `https://professional-evolution-portfolio.crisss198.workers.dev/api/comments/...` successfully and renders the list. Locally the Pages origin cannot be reproduced against a local Worker because the allowlist excludes `localhost`.
2. The WS connects from the Pages origin (`wss://…workers.dev/…/ws`) and `~N viendo ahora` appears.
3. A real deploy disconnect → the client reconnects with backoff and resyncs without user action (spec §7's deploy behaviour).
4. Turnstile + real `llama-guard-3-8b` / `m2m100-1.2b` behaviour (F-A carry-over; no Cloudflare auth here).
5. Whether Cloudflare Workers Builds applies the DO migration, or one manual `wrangler deploy` is needed (F-A carry-over; no new migration in F-B).

---

## 8. Concerns / residual risks (for the reviewer)

1. **Cross-origin depends on the production Worker being deployed.** The Pages build now points at `…workers.dev`; until the Worker with F-B is deployed, the Pages host's API probe fails and the form stays in F-A's honest disabled state (not a regression, but the feature is inert on Pages until the deploy).
2. **No local end-to-end browser test of the cross-origin path** — by design, because the allowlist has no local origin. The controller must do the live check in §7.1.
3. **Presence is a raw socket count**, so a client that drops without a clean close (network death) can leave the count high until the runtime reaps the socket; this is why the copy is `~N` and never an exact claim.
4. **The test-only `__attachment__` message** is a small production-code seam gated by `ENVIRONMENT === 'test'` (production ignores every client message). It is documented and consistent with F-A's seams, but it is production code that exists for tests.
5. **Two `wrangler dev` instances** run when the whole comments suite runs (ports 8791/8792, parallel files); on a constrained machine this is heavier than F-A alone. Cold start dominates (~15-20 s per file).
6. **`data/case-studies.json` remains dirty** in the working tree from before this task (unstaged, untouched) — the controller should not expect a clean tree.
