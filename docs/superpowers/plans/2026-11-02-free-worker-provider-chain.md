# Free-Only Worker Provider Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implement one task at a time with a fresh free-model implementer and independent review; Luna remains the coordinator.

**Goal:** Harden the detached portfolio chat Worker so it can use only an explicitly approved free provider, enforce request bounds, and never switch providers after streaming output has begun, while leaving GitHub Pages assistant behavior unchanged.

**Architecture:** Keep the Pages assistant as its existing local search over published site data. Harden the separate Worker API with Cloudflare Workers AI as its only active adapter, a serialized Durable Object gate for per-IP and global request limits, and truthful provider/model metadata. Gemini, NVIDIA, OpenRouter, and Groq remain disabled pending provider-specific free-tier, quota, and privacy approval; OpenCode Go and paid Anthropic are excluded.

**Tech Stack:** TypeScript, Cloudflare Workers AI binding, Cloudflare Durable Objects, Wrangler JSONC, Vitest, GitHub Actions.

**Spec:** `docs/assistant.md` (especially v1/local-search behavior, the planned v2 guardrails, and the hard privacy rule); current Worker implementation under `worker/src/`.

## Global Constraints

- The Pages assistant remains the local search described in `docs/assistant.md`; no Pages widget, copy, event, or build change may make it call the Worker.
- The assistant may only expose data already published by the portfolio and must never read, index, retrieve, or paraphrase private Personal OS data.
- No paid provider path or paid fallback may be active. Cloudflare Workers AI is the only provider in this implementation tranche; the account-level free/billing eligibility of Workers, Workers AI, and Durable Objects must be verified before any live smoke test or deployment.
- Provider fallback is allowed only before the first non-empty SSE content chunk. After output begins, the stream ends with a sanitized error and must not append another provider's response or retry the same inference.
- No API key, raw provider error, visitor IP, or prompt may be persisted or returned by status/telemetry surfaces.
- Use `worker/wrangler.jsonc` as the sole Worker configuration after confirming it with an explicit `--config` dry run; remove stale conflicting `worker/wrangler.toml` configuration.
- No provider smoke call, deploy, push, merge, or publication is authorized by this plan.

## Review Focus

1. Concurrent calls at the per-IP or global limit must not over-admit; quota-store failure must fail closed before invoking AI.
2. Invalid JSON, unsupported locale/roles, empty input, and input/history beyond the documented bounds must return a controlled 4xx without invoking a provider.
3. Provider failure before first content may advance to an eligible provider; failure after first content must produce no content from a second provider and no duplicate same-provider inference.
4. Timeout or client cancellation must stop consuming the active stream, return a sanitized terminal outcome, and never trigger a fallback after content has started.
5. Status output must distinguish configured from runtime-verified, identify the actual provider/model on chat chunks, expose no secrets, and make no provider call; chat grounding must remain limited to `getFullKB()` over published portfolio data; Pages must continue making no Worker request.

## Provider eligibility ruling

| Provider | This plan | Gate before any future activation |
|---|---|---|
| Cloudflare Workers AI (`@cf/mistral/mistral-7b-instruct-v0.1`) | Sole active adapter in code; live use remains gated | Verify the account's free allocation and billing arrangement can satisfy the $0 requirement. A code request cap alone is not a provider billing guarantee. [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Gemini API | Disabled / not implemented | Human approval of free-tier data handling, plus current project quota and model availability verification. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| NVIDIA API Catalog | Disabled / not implemented | Verify current account trial entitlement, model availability, request limits, and applicable terms. [FAQ](https://build.nvidia.com/faq) |
| OpenRouter | Disabled / not implemented | Pin only `openrouter/free` or a specifically verified `:free` model; verify account limits and ensure paid routing is impossible. [Limits](https://openrouter.ai/docs/api_reference/limits) · [Free router](https://openrouter.ai/docs/guides/routing/routers/free-router) |
| Groq | Disabled / not implemented | Verify a current model is free and available to this account; no stale model default or automatic activation from a secret alone. [Models](https://console.groq.com/docs/models) |
| OpenCode Go | Excluded | Subscription-based agent service is not a free public inference route. [OpenCode Go](https://opencode.ai/v2/docs/console/go) |
| Anthropic API | Remove from active chain | The configured Haiku API path is not a verified free route and violates the free-only constraint. |

Any provider activation is a separate, explicitly reviewed follow-up task. The previous Groq live result (`model_decommissioned` for the tested model) is not evidence that a different Groq model is eligible.

---

### Task 1: Enforce the free-only provider and Wrangler configuration

**Files:**
- Modify: `worker/src/lib/providers.ts`
- Modify: `worker/src/api/chat.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/tests/providers.test.ts`
- Modify: `worker/wrangler.jsonc`
- Delete: `worker/wrangler.toml`

**Interfaces:**
- Produces: `createProviderChain(env)` returns only a `CloudflareAIProvider` when `env.AI` exists; otherwise it fails closed with a sanitized configuration error. No API-key-only variable may add a provider.
- The Cloudflare model is the literal `@cf/mistral/mistral-7b-instruct-v0.1`; there is no environment-selectable model in this tranche.

- [ ] **Step 1: Add failing provider-policy tests** asserting Cloudflare is the sole configured adapter; Anthropic/Groq credentials and model variables do not add providers; missing `AI` fails closed; the model is exactly the allowlisted value.
- [ ] **Step 2: Run the focused test**

Run: `npm --prefix worker test -- tests/providers.test.ts`
Expected: FAIL on existing Anthropic/Groq activation and missing-binding behavior.

- [ ] **Step 3: Remove non-approved provider adapters and configuration paths** from `worker/src/lib/providers.ts`, align the Worker environment types, and keep only the Cloudflare binding. Do not add Gemini, NVIDIA, or OpenRouter adapters in this task.
- [ ] **Step 4: Make the JSONC file authoritative** by running Wrangler with `--config worker/wrangler.jsonc` from repository root (or `--config wrangler.jsonc` from `worker/`), remove the stale TOML only after the explicit-config dry run resolves the intended chat Worker, and update any in-repo commands that still name the TOML.
- [ ] **Step 5: Run focused and static verification**

Run: `npm --prefix worker test -- tests/providers.test.ts` and `npm --prefix worker run build`
Expected: all focused tests pass and TypeScript build exits 0.

- [ ] **Step 6: Commit** after implementation approval and repository preflight, with a signed `ai(scope): ...` message.

### Task 2: Make SSE fallback safe at the first-content boundary

**Files:**
- Modify: `worker/src/lib/providers.ts`
- Modify: `worker/src/api/chat.ts`
- Modify: `worker/tests/providers.test.ts`
- Modify: `worker/tests/api.test.ts`

**Interfaces:**
- `StreamChunk` includes `content`, `done`, `provider`, and `model: string | null`. Real provider chunks carry their exact provider/model; a local generic fallback uses `provider: 'fallback'`, `model: null`.
- `ProviderChain.stream()` may try the next configured provider only while no non-empty content has been yielded. After content has been yielded, it terminates with a sanitized stream error; it never retries that provider or switches providers.
- SSE remains `data:` JSON. After partial output, the chat endpoint emits exactly `{ "content": "", "done": true, "provider": "<actual-provider>", "model": "<actual-model>", "error": "stream_interrupted" }` and closes; before any content, exhausted providers keep the existing generic fallback text with `provider: 'fallback'`, `model: null`, `done: true`.

- [ ] **Step 1: Add failing stream/API tests** for: pre-content error can advance; error after a non-empty chunk never advances; a Cloudflare stream error never invokes the non-streaming endpoint a second time; all successful chunks and terminal events preserve the actual provider/model; and the system context continues to come only from `getFullKB()`.
- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm --prefix worker test -- tests/providers.test.ts tests/api.test.ts`
Expected: FAIL because the current chain continues after partial output and Cloudflare retries non-streaming after stream errors.

- [ ] **Step 3: Implement the first-content commit boundary** in `ProviderChain.stream()` and remove the same-provider non-streaming retry from `CloudflareAIProvider.stream()`. The chat endpoint emits a generic terminal SSE error after partial output and closes the stream without exposing provider response bodies.
- [ ] **Step 4: Run focused tests**

Run: `npm --prefix worker test -- tests/providers.test.ts tests/api.test.ts`
Expected: all first-content, model attribution, and sanitization assertions pass.

- [ ] **Step 5: Commit** after implementation approval and repository preflight, with a signed `ai(scope): ...` message.

### Task 3: Add fail-closed chat limits, input bounds, and a hard stream deadline

**Files:**
- Create: `worker/src/chat-guard.ts` (chat quota Durable Object)
- Modify: `worker/src/api/chat.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/wrangler.jsonc` (Durable Object binding and migration)
- Create: `worker/tests/chat-guard.test.ts`
- Modify: `worker/tests/api.test.ts`

**Interfaces:**
- `ChatGuard.fetch(POST /consume)` serializes and enforces **5 requests per IP per rolling hour** and **100 accepted chat requests per UTC day globally**; it returns `{ allowed: boolean, reason: 'ip_limit' | 'daily_limit' | null }`. Limits are initial conservative product caps, not proof of a $0 provider bill.
- Persist only a salted hash of the source IP; never persist the raw IP, prompt, or history. Use the Cloudflare-provided client IP, not a caller-controlled header.
- `/api/chat` accepts a non-empty message of at most **2,000 Unicode code points** (`Array.from(value).length`), at most **6** prior user/assistant messages, and each history message's `content` is also limited to **2,000 Unicode code points**. Maximum message-plus-history text is therefore **14,000 Unicode code points**. Locale is `en` or `es`; maximum model output remains **1,024 tokens**.
- `POST /api/chat` has a **30-second** hard response deadline. On timeout/cancel, stop consuming/cancel the active stream where supported; do not start a second inference. If the quota Durable Object is unavailable, deny the request before AI invocation.

- [ ] **Step 1: Add failing guard/API tests** for the exact limits above (including history-content length at the boundary and one code point over), concurrent over-limit requests, UTC-day rollover, hashed-only IP storage, invalid JSON, empty/oversized message/history content, unsupported locale/role, quota-store failure, and timeout/cancellation without a second AI call.
- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm --prefix worker test -- tests/chat-guard.test.ts tests/api.test.ts`
Expected: FAIL because chat currently has no request gate, full body validation, or deadline.

- [ ] **Step 3: Implement the Durable Object gate and Worker binding** using serialized storage operations; fail closed on storage errors. Use the request's `cf-connecting-ip` value only as transient input to the salted-hash function.
- [ ] **Step 4: Validate and bound request JSON before constructing the provider stream; apply the 30-second deadline and cancel the current stream on timeout/client cancellation.** Do not treat `Promise.race` alone as cancellation evidence; tests must verify the active reader/provider is cancelled.
- [ ] **Step 5: Run focused tests and TypeScript build**

Run: `npm --prefix worker test -- tests/chat-guard.test.ts tests/api.test.ts` and `npm --prefix worker run build`
Expected: all quota/input/deadline cases pass and build exits 0.

- [ ] **Step 6: Run Wrangler dry-run with the explicit JSONC path**

Run: `npx wrangler deploy --dry-run --config worker/wrangler.jsonc`
Expected: config validates and lists the intended Durable Object binding/migration; no deployment occurs.

- [ ] **Step 7: Commit** after implementation approval and repository preflight, with a signed `ai(scope): ...` message.

### Task 4: Make AI status truthful and side-effect-free

**Files:**
- Modify: `worker/src/api/ai-status.ts`
- Modify: `worker/tests/ai-status.test.ts`

**Interfaces:**
- Status reports only the allowlisted provider/model and a state equivalent to `configured_not_probed` when the `AI` binding exists; otherwise it reports unavailable.
- `/api/ai-status` performs no provider request, does not call `AI.run`, and returns no key, prompt, raw error, or unsupported-provider state.

- [ ] **Step 1: Add failing tests** asserting no `AI.run` call; exact provider/model/state when configured; unavailable when the binding is absent; and absence of credential/model values supplied through obsolete Anthropic/Groq variables.
- [ ] **Step 2: Run the focused status test**

Run: `npm --prefix worker test -- tests/ai-status.test.ts`
Expected: FAIL because status currently exposes environment-selected Groq/Anthropic entries.

- [ ] **Step 3: Implement the passive allowlisted status response** and keep runtime health explicitly unprobed.
- [ ] **Step 4: Run focused tests and commit** after implementation approval and repository preflight, with a signed `ai(scope): ...` message.

### Task 5: Run Worker gates in CI without changing Pages behavior

**Files:**
- Modify: `.github/workflows/quality.yml`
- Create: `web/tests/assistant-local.test.mjs`

**Interfaces:**
- CI installs from `worker/package-lock.json`, runs Worker Vitest and TypeScript build, and retains every existing Pages quality step.
- A Pages regression assertion proves the shipped assistant remains local and does not issue a request to `/api/chat` or `/api/assistant`.

- [ ] **Step 1: Add the Pages assistant regression test** to assert `AssistantWidget.astro` fetches only the build-generated same-origin semantic index and contains no `/api/chat` or `/api/assistant` call.
- [ ] **Step 2: Add a CI Worker step/job** that runs `npm --prefix worker ci`, `npm --prefix worker test`, and `npm --prefix worker run build` on Node 22.
- [ ] **Step 3: Run the Worker suite and the targeted Pages assertion locally**

Run: `npm --prefix worker test`, `npm --prefix worker run build`, and `node --test web/tests/assistant-local.test.mjs`.
Expected: Worker suite and typecheck pass; Pages assertion passes; no existing Pages quality step is removed or weakened.

- [ ] **Step 4: Commit** after implementation approval and repository preflight, with a signed `ai(scope): ...` message.

## Execution and external gates

- SDD orchestration: Luna coordinates; dispatch only free models. Use `opencode-go/qwen3.7-plus` for multi-file implementation/review, `opencode-go/mimo-v2.6-flash` only for isolated mechanical work, `opencode-go/glm-5.3` for design judgment, and `opencode-go/gpt-6-luna` for final review. Never omit the model ID.
- Before implementation, create/verify the required `ai/<slug>` linked worktree and run the repository preflight; this plan does not authorize implementation edits or commits by itself.
- Before any provider smoke test, verify in the Cloudflare account that Workers, Workers AI, and Durable Object usage are within genuinely free allocations and that the configured account cannot incur a charge. If that cannot be established, skip the live call and record it as blocked; deterministic mocked tests remain the acceptance evidence.
- Before any deployment, obtain a separate explicit authorization. Do not deploy, push, merge, create a PR, or connect the Pages widget to this Worker as part of this plan.
- Final review must check all deferred provider-eligibility gates, the free-only invariant, and the unchanged local Pages assistant. Report the existing visual mobile timeout separately; this plan does not expand or alter that baseline.

## Preflight scan / rulings

| Check | Finding | Ruling |
|---|---|---|
| Task 1 ↔ Task 2 shared files/interfaces | Both touch `providers.ts` and `chat.ts`; Task 1 establishes the only allowed adapter and Task 2 adds stream model attribution and fallback semantics. | Sequential: Task 2 consumes the `createProviderChain` contract produced by Task 1. |
| Task 1 ↔ Task 3 shared files/interfaces | Both touch `chat.ts`, `index.ts`, and `wrangler.jsonc`; Task 1 removes provider credentials and confirms the canonical config, while Task 3 adds the Durable Object binding and request gate. | Sequential: Task 3 builds on the normalized provider environment/config from Task 1. |
| Task 2 ↔ Task 3 shared files/interfaces | Both touch `chat.ts` and `tests/api.test.ts`; Task 2 defines SSE termination and Task 3 adds quota, validation, timeout, and cancellation around that stream. | Sequential: Task 3 preserves Task 2's first-content boundary. |
| Task 1 ↔ Task 4 interface | Task 4 consumes Task 1's provider/model allowlist but touches a separate status module. | Task 4 follows Task 1; no overlapping file edits. |
| Task 2 self-consistency | Current provider chain can advance after emitted content; Cloudflare stream code can make a second inference after stream failure. | Permit fallback only before first non-empty content; no retry after a started stream. Cost if wrong: a transient interruption may end an answer earlier than a retry would. |
| Task 3 self-consistency | Existing `RATE_LIMIT` KV is not an atomic global budget; the other Worker's Durable Object is in a separate Worker entrypoint/config; the original brief bounded history count but not each history entry's text. | Add a dedicated serialized chat guard instead of assuming those bindings are shared, and cap each of up to six history contents at 2,000 Unicode code points to match the current message cap. Account-level billing remains an external gate. Cost if wrong: a new Durable Object adds migration/operational work, or the history cap truncates a legitimate long conversation. |
| Task 4 self-consistency | Current status distinguishes configured keys but not actual runtime health and lists a paid Anthropic route. | Status is passive and allowlisted; runtime success is evidenced only by a real response, never a status probe. Cost if wrong: operators get less diagnostic detail without a separate approved telemetry design. |
| Task 5 self-consistency | Worker tests exist but are omitted from current quality CI; Pages assistant must remain local per `docs/assistant.md`. | Add Worker CI gates and a local-only regression test without wiring the UI to the Worker. Cost if wrong: additional CI time and maintenance for tests outside the Pages-only release path. |
| Task 1 self-consistency | Both `worker/wrangler.jsonc` and `worker/wrangler.toml` exist and declare divergent provider vars/bindings. | Use JSONC only after explicit-config dry-run; remove TOML to prevent configuration drift. Cost if wrong: an unreferenced deployment path may need restoring. |
| Provider strategy disagreement | The proposed all-provider chain conflicts with missing quota/privacy approvals and the verified decommissioned Groq model; OpenCode Go is subscription-based. | **Ruling:** first ship only a hardened Cloudflare adapter in code and keep all other providers dark pending separate account/privacy approval. This minimizes uncontrolled data sharing and accidental billing; cost if wrong: less redundancy and availability until later provider tasks are approved. |

## Acceptance criteria

- All five tasks pass their specified tests and reviews; Worker tests and typecheck run in CI.
- No paid Anthropic/Groq path or unapproved third-party provider can enter the active chain via an environment variable.
- Provider/model attribution is present on every non-empty SSE chunk, and output never contains mixed-provider continuation.
- Rate/request bounds, fail-closed quota behavior, and cancellation behavior are covered by deterministic tests.
- The Pages assistant remains local; no prompt, key, IP, or private Personal OS data is sent to or stored by the Worker.
- No external provider has been claimed as working merely because it is configured. Live smoke and deploy remain separate authorization gates.
