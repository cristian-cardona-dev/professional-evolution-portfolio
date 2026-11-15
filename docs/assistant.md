# Portfolio assistant

The floating **Portfolio assistant** (bottom-right button on every page) helps a
visitor find things in this site. It ships as **v1: honest keyword search**. It
is *not* a large-language-model chatbot, and it does not pretend to be one.

This document states what v1 actually does, what it deliberately does **not**
do, the plan for a v2 model-backed assistant, and the hard privacy rule that
governs both.

---

## v1 — keyword search (current)

### What it is

A dependency-free, client-side search over a small index that is **serialized
into the page at build time** from the canonical `data/*.json` files. There is
no backend and no API key at runtime. Since the Fase F semantic layer
(`semantic-search.ts`), the page may fetch one same-origin static asset,
`semantic-index.json`, to enable build-time-embedded semantic search; when the
build ran without embeddings (keyword-only mode, recorded in the build
metadata) that asset carries no vectors and the search stays pure keyword.
The v1 local search makes no AI or third-party call. (v2, when enabled, calls
the Cloudflare Worker — see section below.)

- **Component:** `web/src/components/AssistantWidget.astro`
- **Page-level deep link:** `web/src/components/AskAboutPage.astro` (dispatches
  `assistant:ask`; see *Ask about this page* below)
- **Index builder:** `assistantIndex()` in `web/src/lib/data.ts` (reads only)
- **Matching logic:** `web/src/lib/assistant-search.ts` (zero imports, pure)
- **Copy (EN/ES):** the `assistant` block in `web/src/i18n/copy.ts`
- **Rendered on every page:** included by `web/src/layouts/BaseLayout.astro`

### What it indexes

From the same canonical data the pages already render, nothing more and nothing
private:

| Kind | Fields in the index | Result links to |
|---|---|---|
| `work` (projects) | name, tags, slug, summary, status | `/work/<slug>/` in the current locale |
| `evidence` | label, url, claim status | `/evidence/` |
| `evolution` (milestones) | title, narrative, status, year | `/evolution/` |
| `profile` | name, headline, email | `mailto:` the published address |

### How it scores (no magic)

A query is lower-cased, de-accented, split on non-alphanumerics, and stripped of
a small English + Spanish stopword list. Each index entry has two buckets:

1. **strong tokens** — words from the entry's name/tags/title/label, plus two
   kinds of *keyword affordance* the build adds and documents:
   - the artifact-type words (`project`, `evidence`, `milestone`, `contact`, …),
     and
   - the site's own status vocabulary mapped to claim words (`live`→
     `demonstrated`; `lab`/`planned`→`aspirational`, etc.). These are the exact
     labels the pages already show, so a match never implies a claim the site
     does not already make.
2. **weak text** — the folded summary / narrative / headline / url.

A query token that equals a strong token scores **+3**; one found only as a
weak substring scores **+1**. A fixed, sub-one-point kind preference
(project > evidence > profile > milestone) only breaks ties, so the promise
"**name/tag/title matches beat summary/narrative matches**" is never inverted.
The top 3 are returned; **anything that scored only from the tie-break bias is
discarded**, so no token hit means no results.

### Honesty rules baked into the UI

- A **banner at the top of the panel** states in plain words, in both languages,
  that this is a keyword search over published data — *not an AI model* — that
  it can only point at what is already published, and that it says so when it
  finds nothing.
- On a **no-match**, the assistant renders a fallback (links to the full Work and
  Evidence listings plus an "Ask by email" `mailto:` prefilled with the exact
  question). It never invents an answer, never guesses intent, and never says
  "as an AI…".
- **No simulated intelligence anywhere:** no typing/dot animation, no "thinking"
  state, no canned prose, no model call. Results appear synchronously because
  the whole search is local.
- The input is **not** treated as private: nothing is stored or sent. The only
  outbound side is the deliberate `mailto:` the visitor chooses to open.

### Suggested questions

The panel offers four chips. Their **labels are localized** (EN/ES) but their
**queries are fixed English keyword sets**, because the canonical data is
English-only and a translated query would honestly return nothing. Clicking a
chip also reveals the query it ran in the input (transparency, not theatre).
Each is verified against the real index (`built`→projects, `ai`→the AI labs,
`contact`→the profile/email, the aspirational-vs-demonstrated chip→a labelled
mix). The verification harness for this is a throwaway script, not a shipped
dependency.

### Ask about this page (deep link)

Case studies and `/career/` carry an **"Ask about this page"** button
(`web/src/components/AskAboutPage.astro`). It is a *seed*, not a second search:
clicking it dispatches the documented bubbling `assistant:ask` CustomEvent
(`detail.query`), this widget opens its panel, fills the input with that exact
query and runs its own `hybridSearch`/`searchEntries` over the index the page
already embeds. The seam is one event name plus one string, so it needs no
change to the scoring and no second index, and the button can never produce a
result the visitor could not get by typing the same words. The seed is the
page's own published vocabulary — a case study's title and tags; the skills
`/career/` publishes that a public project stands behind — in **English**,
because the canonical data and the index are English-only (the same limitation
as the chips). A seed that matches nothing still shows the honest fallback, and
the input always reveals the words that actually ran.

### Progressive enhancement & accessibility

- The floating button is hidden unless the pre-paint `html.js` gate ran; with
  JavaScript off the assistant simply is not offered, and every piece of content
  it would have indexed is already a normal published page.
- The panel is a real modal: `role="dialog"`, `aria-modal="true"`, labelled by
  its heading. It closes on **Esc** and **click-outside**; focus moves into the
  input on open, is contained while open, and **returns to the button** on
  close.
- Results change through an `aria-live="polite"` region.
- There is **no entrance animation at all**, so `prefers-reduced-motion` cannot
  be violated by motion that does not exist; hover transitions use the shared
  design tokens.
- The inline widget JavaScript (scoring included) is **~3.7 KB**, inside the
  <8 KB budget.

### Known limitations of v1

- In **keyword-only** builds (no `CLOUDFLARE_API_TOKEN` at build time) it is
  **keyword** search: synonyms outside the indexed words will not match (there
  is no semantic/embedding layer in that mode). In **semantic** builds the
  `bge-m3` vectors shipped in `semantic-index.json` widen matching by meaning;
  `SEMANTIC_MIN_SCORE` below-threshold results fall back to the keyword rule.
  The `/build/` page states which mode is live.
- **Free-typed Spanish** queries match only where the English data happens to
  share a word or the folded token collides; use the chips for a guaranteed
  answer in Spanish. (Case-study bodies and project summaries are English by the
  site's own translation contract.)
- It can only answer **about published content**. It cannot reason, cannot
  combine facts across entries into new prose, and will fall back rather than
  improvise.

---

## v2 — provider-backed assistant (shipped)

v2 is **live in production**. The floating assistant now calls a Cloudflare
Worker (`POST /api/chat`) backed by Cloudflare Workers AI (free tier, Mistral
7B). When the Worker is unavailable or rate-limited, the widget falls back to
the v1 local search automatically.

### Architecture

1. **Cloudflare Worker** (`worker/`) exposing `POST /api/chat`. The widget calls
   it only when `CHAT_WORKER_ORIGIN` is configured (hardcoded fallback +
   optional `PUBLIC_CHAT_WORKER_URL` env). Otherwise it behaves exactly like v1.
2. **No API key.** Cloudflare Workers AI uses the `AI` binding — no secret in
   the client bundle or the repo. Free-tier only.
3. **Server-side prompt, built only from `data/*.json`.** The Worker assembles
   its context from the same canonical public data the site renders.
4. **Guardrails.** Per-IP rate limiting (5/hour, 100/day), 60s request timeout,
   and an explicit instruction to refuse anything outside published data.
   Errors/timeouts return the same honest fallback, so a degraded v2 behaves
   like v1.

### Privacy contract

- CORS limited to `https://cristian-cardona-dev.github.io`
- No persistence/logging of prompts, IPs, keys, or raw errors
- `/api/lead` stays isolated from the chat Worker
- Chat Worker deploys only via `wrangler deploy`, never via `main` push

---

## Hard rule: never private Personal OS data

Under **both** v1 and v2, the assistant must only ever expose what this public
site already publishes. It must **never** read, index, retrieve, or paraphrase
private Personal OS data — the `inbox/private/` tree, employer/client detail,
credentials, un-published metrics, or any capability claim that is not backed by
a public artifact on `/work/`, `/evidence/` or `/evolution/`.

The v2 server prompt is constrained to `data/*.json` precisely so this rule is
structural: there is no path from the assistant to anything that is not already
a public, evidence-labelled page. See [Evidence boundary](evidence-boundary.md).
