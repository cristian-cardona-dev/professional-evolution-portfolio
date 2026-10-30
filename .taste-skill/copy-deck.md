# Copy deck — Cristian Cardona Dev (step 7)

Written before markup, per references/copy.md. Headline budget: ≤32 characters survives every
width at a confident size (two lines, ~15 chars/line at hero scale); section headings 2–5
words. One primary action on the page, one name everywhere: **Book a call**. EN first; the ES
deck is a follow-up task (the site is bilingual by contract — see "For client confirmation").

Character counts are shown as (n) after each headline line.

---

## Hero (first screen — "Void, then statement on axis")

- **h1 / statement, two authored lines:** "Cristian (8) / Cardona (7)" — the name shape; set
  at clamp(56px, 6.6vw, 104px), tracking -0.04em, leading 0.95, starting on the 42% axis.
- **Supporting sentence (directly with the statement, bottom-aligned to its last baseline,
  18px, max 32ch, 20 words):**
  "Full-stack and cloud engineer of 7+ years, now building AI systems, with every claim
  pointing at evidence you can open."
- **Primary action (real button, ≥44px tall, accent fill, right margin, same baseline):**
  "Book a call" → Cal.com 15-minute intro call (URL to be provided; mailto fallback with
  subject "Portfolio intro call").
- **Top row (44px from top, 48px margins):** wordmark "Cristian Cardona" left; three links on
  the 42% axis: Work · Career · Evidence; the action as a filled button at the right margin.
- No eyebrow, no pill, no image, no shape. The ground is one flat tone; the ink one colour.
- **Phone:** axis collapses to the 20px margin; statement at 12.5vw two lines; sentence 17px;
  links fold behind a "Menu" word.

## Work — "Quiet ledger, side preview" (the live thing lives here)

- **Heading (24–28px):** "Work ledger (12)"
- **Note (15px, same baseline, right of heading, 12 words):** "Five projects, each with what
  it demonstrates and what it does not."
- **Ledger rows** (name 16px left · kind at 55% of the column · year right, tabular; status
  carried with the kind):

  | Name | Kind | Year |
  | --- | --- | --- |
  | AI Chat API Lab | AI reliability reproduction (prototype) | 2026 |
  | Cloud Dashboard | Cloud observability reproduction (prototype) | 2026 |
  | AI Automation Workflow Lab | Approval-gated workflow (lab) | 2026 |
  | Professional Evolution Portfolio | This site, evidence-first (live) | 2026 |
  | SaaS MVP | Planned product (not built) | — |

- **Side panel per row ("Flip the claim" — the live thing; `<details>` fallback):**

  *AI Chat API Lab — This demonstrates:* bounded AI API design without a model provider;
  fail-closed answers when evidence is insufficient; a response contract ready for a
  provider-neutral adapter; testable privacy and citation boundaries. *This does not:*
  production RAG, embeddings or retrieval quality; any model-provider operation; streaming,
  agents, tools, authentication. *Evidence:* github.com/cristian-cardona-dev/ai-chat-app ·
  record `ev-ai-reliability-lab-repository`.

  *Cloud Dashboard — This demonstrates:* responsive observability charts over deterministic
  synthetic telemetry; configurable CPU and memory thresholds; unit, browser-flow, typecheck,
  build and privacy checks. *This does not:* live infrastructure, real cloud costs, or any
  connection to production telemetry. *Evidence:*
  github.com/cristian-cardona-dev/cloud-dashboard · record `ev-cloud-dashboard-repository`.

  *AI Automation Workflow Lab — This demonstrates:* human-in-the-loop design with explicit
  proposal, approval, rejection and execution states; allowlisted deterministic actions;
  idempotent, replay-safe execution with an audit event per transition. *This does not:*
  autonomous production actions; external service integration. *Evidence:*
  github.com/cristian-cardona-dev/ai-automation-workflow-lab · record
  `ev-ai-automation-workflow-repository`.

  *Professional Evolution Portfolio — This demonstrates:* an evidence-first bilingual site
  that separates shipped work from planned work and points every capability statement at an
  inspectable artefact. *This does not:* show client or employer codebases (none are public).
  *Evidence:* this page and its public repository.

  *SaaS MVP — This demonstrates:* nothing yet; it is listed to keep the planned/delivered
  boundary visible. *This does not:* exist. There is no billing, authentication, multi-tenant
  model or admin dashboard. *Evidence:* repository placeholder, intentionally empty.

- **Phone:** rows 52px tall (name left, year right, kind on a second line at 13px); each row
  expands its two lists in place.

## Career — "Two columns, highlighted words"

- **Heading (chapter size, ~30px):** "Seven years, five companies (29)" — the claim, one line.
- **Statement (110–160 words, clamp(22px, 2.1vw, 32px), two justified columns; six or seven
  flat-highlighted facts; final highlighted sentence is the link to contact):**

  "My first production system shipped in 2017. Since then I have built full-stack software
  for five companies — SINCOSOFT, ITEHL, BITS Americas, Siigo and Talan — almost all of it
  running on Azure, from Angular frontends through .NET and Java services to databases and
  Terraform-managed infrastructure. At Talan, where I work today, the stack broadened to
  React, Node, PostgreSQL and Azure AI. That arc is the point: years of shipping production
  systems are the foundation the new work stands on. Since October 2026 I have been building
  public AI engineering evidence — a reliability lab that fails closed, an approval-gated
  automation workflow with audit trails, and this portfolio, which separates shipped work
  from planned work and points every claim at something you can inspect."

  Highlights: **2017** · **five companies** · **Azure** · **Talan** · **Azure AI** ·
  **October 2026** · final line highlighted entire and linked: **"Talk to me about AI
  engineering, automation and cloud work."**

- **Phone:** one column, 20px, unjustified; four or five highlights.

## Evolution — "Itinerary on a slip"

- **Heading (clamp(40px, 4.4vw, 68px), columns 1–5):** "The evolution (13)" — authored break
  "The / evolution" if it wraps.
- **Paragraph (30ch, beside the heading):** "Each milestone below is dated and linked to its
  evidence: a commit, a repository, a public record. Nothing is dated that did not happen."
  (22 words)
- **The slip (paper-coloured, zigzag bottom edge, columns 7–11; rows = milestone left, date
  right, dot leaders; phase headings bold):**

  **Foundation — 2017 to 2021**
  Full-stack shipping at SINCOSOFT, ITEHL, BITS Americas … 2017
  Azure, .NET, Java, Angular, SQL in production … 2021

  **Transition — 2021 to 2026**
  Siigo: .NET, Angular, Azure, SQL … 2021
  Talan: Azure, Java, React, Terraform, Node, Azure AI … 2023
  Evidence-first portfolio published … 2026-10-03
  Bilingual EN/ES release, accessibility parity … 2026-10-08
  Astro rebuild merged, dual-host release … 2026-10-09

  **Frontier — recorded, no delivery dates**
  AI engineering evidence build-out … planned
  Agentic workflow lab, replay and adversarial iterations … planned

  **Final inverted row (paper text on ink bar, 44px):** "Today: AI engineering, automation
  and agentic systems — direction recorded, evidence public, in progress."

- **Phone:** heading and paragraph first, slip full-width minus 16px margins, rows keep
  one-line layout, inverted final row stays full width.

## Evidence — "Names as one sentence"

- **Opening words in full ink (act as the heading, 2–3 words):** "Checked against (14)"
- **The sentence (statement size, ≤36px per the sheet's adjustment, three lines desktop;
  lit name cycles every 2s; ends with a full stop):**

  "the AI reliability lab repository, the cloud dashboard repository, the automation workflow
  lab repository, this portfolio's public build, the public snapshot contract, three case
  studies with explicit boundaries, evidence records ev-ai-reliability-lab-repository,
  ev-cloud-dashboard-repository, ev-ai-automation-workflow-repository, the commit history of
  every milestone, the LinkedIn profile, and the GitHub activity snapshot."

- **Phone (cut to the twelve strongest):** "the AI reliability lab repository, the cloud
  dashboard repository, the automation workflow lab repository, this portfolio's public
  build, the public snapshot contract, three case studies with boundaries, three evidence
  records, every milestone's commits, the LinkedIn profile, the GitHub activity snapshot."
- No logos, no columns, nothing else in the section; 120px above and below. Every name in the
  sentence is a real artefact from `data/evidence.json`, the case studies, or the milestone
  evidence links — none invented.

## Contact — "Address in display rows"

- **Rows (clamp(44px, 6vw, 88px), one fact per row, full-width bands, text in the lower
  third):**

  1. Cristian Cardona
  2. Remote-first
  3. US-hours aligned
  4. English, Español
  5. crisss198@gmail.com (link: mailto)

- **Greeting row (sixth, accent band):** "Talk soon (9)" + solid round arrow button →
  Cal.com booking (the primary action repeats here, same name: Book a call).
- **Phone:** rows 9.6vw, ~84px tall; the greeting row is a full-width accent band with a 56px
  round button at its right end.
- The address of this subject is its reach: no street, no city — a timezone, two languages,
  an inbox, a booking link.

## Footer — the close

- **The name returns at full width:** "Cristian Cardona"
- **One line under it (16px):** "AI engineering on a full-stack and cloud foundation,
  remote-first."
- **Colophon (13–15px, muted):** "Built with Astro from a canonical data layer. One GitHub
  Actions run publishes it to two hosts. Every claim on this page points at evidence you can
  open."
- **Credit line (muted, 13–15px):** "[Found pictures: title, creator, licence, source —
  filled in Task 5/6 when the open-collection pictures are chosen.]"
- **Bilingual notice:** "This site also exists in Español: /es."

---

## Navigation labels (single nouns, up to five)

Wordmark: Cristian Cardona · Links: Work, Career, Evidence · Action: Book a call

## For client confirmation (sample content and open details — none of it is proof)

1. **Cal.com booking URL** for "Book a call" (15-minute intro call). Until provided, the
   button falls back to `mailto:crisss198@gmail.com?subject=Portfolio%20intro%20call`.
2. **"Seven years, five companies"** — the brief says 7+ years; the CV data runs 2017-10 to
   present with a 9-month gap in 2023, i.e. ~8 years of employment. Confirm the number to
   claim (7+, 8, or "since 2017").
3. **Ledger "kind" and status wording** ("AI reliability reproduction", "2026 · prototype",
   "not built") — condensed from the project summaries; confirm.
4. **Contact row wording** ("Remote-first", "US-hours aligned", "English, Español") and the
   greeting word "Talk soon" — sample; confirm or replace.
5. **Career statement wording** ("years of shipping production systems" left deliberately
   unnumbered pending item 2; company names and stacks are verbatim from `experience.json`).
6. **The trimmed 12-name phone evidence sentence** — chosen by strength; confirm the cut.
7. **Spanish (es) deck** — the full page must exist in reviewed Spanish; the ES copy deck is
   a follow-up task before the ES pages are rebuilt.
8. **Footer credit line** — placeholder until the open-collection pictures are found and
   downloaded (Task 5/6).
9. **Whether the email address should appear as a display row** (it is in `profile.json`, so
   it is public today; confirm it stays).
