# Design spec — Comments system with realtime, presence and AI (Fase F)

> **Location note:** written while in Plan mode (harness restriction). On approval and
> agent switch, this file moves to `docs/superpowers/specs/2026-10-12-comments-realtime-ai-design.md`
> in the portfolio repo and is committed with `ai(portfolio): add comments system design spec`.

- **Date:** 2026-10-12
- **Status:** approved design, pending user review of this document
- **Scope:** three sub-projects — F-A comment core, F-B realtime+presence, F-C semantic assistant
- **Site:** Astro 5 static site, dual host (GitHub Pages canonical + Cloudflare Worker mirror)

## 1. Problem and goal

The site has no way for visitors — recruiters, companies, peers, people without a
GitHub account — to comment or interact in place. Goal: a comment system on all
content pages, per-route configurable, with realtime updates, live presence,
automatic EN↔ES translation and AI moderation, at **$0/month** cost, without
accounts or cookies, keeping the site's evidence-first and privacy-first stance.

## 2. Non-goals (v1 YAGNI cuts)

- No threaded replies, no reactions, no self-editing of comments (v2 candidates).
- No user accounts, no email collection (user decision: GDPR minimal).
- No separate guestbook feature — `/guestbook/` becomes a content page with
  comments enabled in `comments.json` (the Web3Forms dependency for a guestbook
  is dropped entirely; Web3Forms key remains pending only for the contact form).
- No admin dashboard UI — a token-protected admin endpoint listing the review
  queue is enough.
- No third-party comment providers (giscus was analysed and rejected: GitHub
  login blocks the recruiter/company audience).

## 3. Decisions log (user-confirmed)

| Decision | Choice |
|---|---|
| Comments backend | Own Worker backend (Camino B), not giscus |
| Realtime | Real WebSockets + live presence |
| Identity | Anonymous + optional display name; no email, no cookies |
| Moderation policy | Auto-publish when AI says safe; flagged → human queue |
| Semantic assistant | Build-time embeddings, hybrid with honest degradation |
| Comment placement | All content pages, configurable per route |
| Budget | Stay at $0; alert before any paid tier |

## 4. Architecture

### 4.1 Storage and realtime: one Durable Object per page

- DO id: `comments:<path>` (e.g. `comments:es/work/cloud-dashboard/`).
  One DO per page keeps comments, presence and WebSocket fan-out in one
  coherent unit. SQLite-backed storage is **required** (only backend available
  on Workers Free). No separate D1 database — it would duplicate storage for
  no gain at this scale.
- `wrangler.jsonc` gains: `main` (Worker script), `durable_objects.bindings`,
  `migrations` (`new_sqlite_classes`).
- Request routing: static assets are served first (site behaviour unchanged);
  only `/api/comments/*` and `/api/comments/:page/ws` fall through to the
  Worker script. The `_headers` file from Phase D continues to apply.

### 4.2 Data model (single table)

```sql
comments(
  id            TEXT PRIMARY KEY,
  page          TEXT NOT NULL,
  name          TEXT,               -- optional display name
  body          TEXT NOT NULL,      -- max 2000 chars
  source_lang   TEXT NOT NULL,      -- 'en' | 'es' | 'other'
  status        TEXT NOT NULL,      -- published | pending | flagged | removed
  created_at    INTEGER NOT NULL,
  translation   TEXT,               -- cached translation when source_lang != page locale
  reports       INTEGER DEFAULT 0,
  last_report_at INTEGER
)
```

- Presence is **not persisted**: it is the count of open WebSockets in the DO
  (`ctx.getWebSockets().length`).
- Rate limiting state (last comment timestamps per IP) lives in DO storage
  keys; IPs are used transiently for rate limiting only and never persisted.

## 5. API

| Endpoint | Behaviour |
|---|---|
| `GET /api/comments/:page` | Published comments, newest first, paginated; plus current presence count |
| `POST /api/comments/:page` | Turnstile token + honeypot → rate limit → AI moderation → publish or queue; broadcasts on publish |
| `POST /api/comments/:page/:id/report` | +1 report; at threshold 3 → `flagged` automatically |
| `GET /api/comments/:page/ws` | WebSocket upgrade (realtime + presence) |
| Admin (Bearer token header): `GET /api/moderation/queue`, `POST /api/moderation/:id {approve\|remove}` | Human review of `pending`/`flagged`; `approve` runs the publish path |
| GDPR delete: admin-mediated removal by `id` + optional name | No self-service identity to abuse |

Limits: body ≤ 2000 chars; ≤ 5 comments/hour per IP per page; report threshold 3.

## 6. AI pipelines (Cloudflare Workers AI, free tier)

### 6.1 Moderation — `@cf/meta/llama-guard-3-8b` (double gate, bilingual)

The model's card does not guarantee Spanish coverage. Mitigation: moderate
**both** the source text and its English translation (which is generated
anyway when the comment crosses locales):

- Verdict A: guard(source text) · Verdict B: guard(EN translation)
- Both `safe` → auto-publish (user policy). Any `unsafe` **or disagreement
  between verdicts** → `pending` human queue.
- `temperature: 0`, `max_tokens: 16`, strict parse of `safe`/`unsafe` + category.
- **Fail-closed**: if the model errors/times out, the comment goes to `pending`.
  Nothing is ever auto-published unmoderated.
- If the comment is already English on an EN page (no translation exists),
  Verdict B is skipped and only the single gate applies.
- `source_lang: 'other'` (neither EN nor ES): m2m100 is many-to-many, so a
  best-effort translation to the page locale is produced and double-gated
  (source + translation). If translation fails, the comment goes to `pending`
  (single-gate auto-publish is never allowed for unmapped languages).

### 6.2 Translation — `@cf/meta/m2m100-1.2b`

- One-shot at publish time: comment in EN on an ES page (or ES on an EN page)
  is translated once and cached in `translation`. No recurring cost.
- UI shows the page-locale version with badge "traducido del <idioma>" and a
  "ver original" toggle (honesty: machine translation is labelled).
- Model failure → show original + "traducción no disponible" notice.
- Moderation consumes the same translation (see 6.1) — no extra inference.

### 6.3 Cost model (validated against official pricing 2026-09/10)

- ~16 neurons per comment (moderation both gates + translation). Workers AI
  free allocation = 10,000 neurons/day ≈ **600 comments/day sustained at $0**.
- DO free tier: 100k reqs/day, 5M rows read/day, 100k rows written/day,
  5 GB storage — orders of magnitude above portfolio traffic.
- Budget guardrail: a neuron counter in the DO; at 5,000 neurons/day (50% of
  free) translation switches to on-demand (viewer-triggered) and the anomaly
  is reported. First dollar never happens silently.

## 7. Realtime and presence (F-B)

- Hibernation WebSocket API (`ctx.acceptWebSocket`). **No `setTimeout` /
  `setInterval` inside the DO** — they block hibernation and accrue duration
  charges. Heartbeats use the runtime's automatic ping/pong.
- Per-connection state (`path`, `joinedAt`) via `ws.serializeAttachment` so
  presence survives hibernation (constructor re-runs on wake — keep it minimal).
- Broadcast on publish: one batched frame carrying comment + presence update.
- **Deploys disconnect all WebSockets** (official docs). Consequences:
  comments are persisted via REST (never lost); clients auto-reconnect with
  exponential backoff and show a "reconectando…" indicator; presence is
  best-effort and labelled "~N viendo ahora", never an exact persistent count.
- Graceful degradation: WS blocked (corporate proxy) → 60s polling of the REST
  endpoint. The comments feature never depends on WS.

## 8. Spam and abuse controls

- **Turnstile** (Managed widget): WCAG 2.2 AA (passes the axe gate without
  exclusions), privacy-preserving (does not process form inputs — the
  "your text is yours" promise stays literal). Invisible for normal visitors.
- Honeypot field in the form.
- Rate limit 5 comments/hour/IP (transient, not persisted).
- Report link on every comment; 3 reports → auto-flag for human review.

## 9. UI/UX (F-A)

- `web/src/components/Comments.astro` on every content page; enabled/disabled
  per route via `web/src/config/comments.json` (pattern list like `work/**`,
  `career` — enabling comments on a page is a one-line config edit).
- Form: optional name, textarea with counter (2000), Turnstile (Managed),
  honeypot. Honest notice: no account, no cookies, AI moderation + human
  review, presence is aggregate only.
- List: newest first, translation badge + "ver original", report link,
  GDPR deletion path documented in the form notice.
- No-JS fallback: honest static message + mailto link (same pattern as the
  contact form fallback).
- a11y: `aria-live` for comments arriving via WS; axe-scanned; EN/ES copy in
  `copy.ts` with type-enforced parity.

## 10. Semantic assistant (F-C, independent — can ship first or last)

- Build-time embeddings `@cf/baai/bge-m3` via Workers AI REST when a Cloudflare
  API token is present in CI (human gate; cost ≈ cents/year inside free tier).
- **Hybrid with honest degradation** (user decision): if the token is missing
  or the call fails, the build emits the keyword-only index, the site falls
  back to the existing keyword search, and `/build/` states plainly which
  mode is live. Never a fake "semantic" search.
- Vectors ship as a static JSON asset; query-time similarity is cosine in
  client JS. Zero production AI calls, zero cost per search.

## 11. Failure modes (all honest-degradation)

| Failure | Behaviour |
|---|---|
| llama-guard down/timeout | Comment → `pending` (fail-closed; never unmoderated auto-publish) |
| Guard verdicts disagree (ES vs EN) | `pending` human queue |
| m2m100 down | Original shown + "traducción no disponible" |
| WS blocked or dropped (deploy!) | 60s polling fallback; comments unaffected (REST) |
| Turnstile script blocked | Form disabled with explicit message (no silent failure) |
| Embeddings token absent | Keyword search only, documented on `/build/` |
| Neuron budget >50% | Translation becomes on-demand; anomaly surfaced |

## 12. Testing strategy

- API + moderation: real tests against `wrangler dev` (miniflare) run in CI —
  no mocks of the DO layer.
- WebSocket: local-only initially, documented as such (no fake CI green).
- UI: Playwright + axe (dark/light) + visual baselines on pages with comments;
  axe must pass with the Turnstile widget present (WCAG 2.2 AA per docs).
- Cost guardrail test: simulated neuron counter crossing the 50% threshold
  flips translation to on-demand.
- Per-sub-project scoped review (deepseek-v4-pro final), consistent with the
  implementor/reviewer discipline used in Phases C/D.

## 13. Deployment and human gates

1. **Turnstile widget** — sitekey + secret created by the human in the CF dashboard.
2. **Cloudflare API token** for build-time embeddings (optional; degrades honestly).
3. **Admin moderation token** — human-generated secret.
4. **`wrangler deploy` risk** — the Worker mirror currently serves static
   assets only. Adding `main` + DO migrations flows through Cloudflare Workers
   Builds (connection the human owns). If Builds does not apply DO migrations,
   one manual `wrangler deploy` is required (human gate, single action).
5. **Human review queue** for flagged comments (ongoing, low volume expected).
6. Carry-overs still open: Web3Forms key (contact form only), review of the
   machine-drafted ES translations from Phases C/D.

## 14. Risks

| Risk | Mitigation |
|---|---|
| WS churn from frequent deploys | REST persistence + auto-reconnect; presence labelled best-effort |
| Spanish moderation weakness | Double gate EN+source, disagreement → human queue |
| Hibernation cost traps | No timers in DO; attachments for state; batched frames |
| GDPR exposure | No email/account/cookies; transient IPs; deletion path |
| Paid-tier creep | Neuron counter + 50% alert + on-demand switch |
| Builds may not apply DO migrations | One manual deploy as fallback gate |

## 15. Deferred to v2 (explicitly out)

Threaded replies · reactions · self-edit window · comments in the semantic
index · sentiment badges · RSS of comments · per-comment AI summaries.
