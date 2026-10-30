# Direction summary — Task 2 output (portfolio redesign, 2026-10-30)

One file combining the dealt direction, the idea, the live thing and the copy deck pointers,
so Tasks 3–9 consume a single artefact. Full detail: `direction-sheet.md` (the dealt sheet +
run notes), `inventory.md` (subject), `argument.md` (claims), `copy-deck.md` (all words).

## Direction (dealt and chosen)

- **Id:** `type-only-statement` — "Type and nothing else" · seed **2145826622** · sector
  `personal-portfolio` · tone `technical` · 2 redraws (logged below).
- **Why this one (one line):** the engineer's real material is auditable text — claims with
  evidence — and this is the one dealt direction that makes text itself the medium instead of
  standing in for missing pictures (the alternatives wanted 20–40 items or many photographs;
  this subject has 5 projects and no photography of its own).
- **First screen:** a deliberate void; the statement (the name) on a 42% axis at
  clamp(56px, 6.6vw, 104px); supporting sentence bottom-left on the same baseline; one filled
  button bottom-right. No image, no shape.
- **Hero:** "Void, then statement on axis" · **Type:** Newsreader (300 display / 400 text,
  optical sizing, tracking -0.05em display) · **Motion:** Masked headline (line reveal,
  ~900ms, second line +110ms).
- **Sections:** work (Quiet ledger, side preview) → about/career (Two columns, highlighted
  words) → how-it-works/evolution (Itinerary on a slip) → proof/evidence (Names as one
  sentence) → contact (Address in display rows) → footer (name at full width).

## The idea

> **On this page, the evidence boundary — every claim paired with what it demonstrates, what
> it does not, and where to check it — becomes the typographic set piece: the claim set at
> display size, its evidence set at text size on the same axis, where a picture would have
> gone.**

Competitor test passed: the reference AI-engineer portfolios (Eugene Yan, Chip Huyen, Lilian
Weng) set claims but pair none with an explicit does-not-demonstrate list and an
evidence-record pointer; the paired boundary lists with `ev-*` / `claim-*` IDs exist only in
this subject's case studies and evidence data.

## The one live thing: "Flip the claim"

In the Work ledger, hovering/focusing (desktop) or tapping (phone, 44px targets) a project
row opens that project's real paired lists — "This demonstrates" / "This does not
demonstrate" — plus its evidence pointer (repository, evidence-record ID). Plain fallback
without script: native `<details>` elements carry the same content; keyboard and screen
readers reach everything; reading is never blocked.

## Palette (proportions kept, colours from the stated dark-first constraint)

`--bg #0a0a0a` · `--surface #1a1a1a` · `--raised #222222` · `--ink #f2efe6` (warm paper,
≈16:1) · `--muted #a8a29a` (≈7:1) · `--accent #f53fd6` (magenta from the dealt Candy
chapters palette; buttons alone, plus at most the live thing's active state) · one inverted
paper band `#f2efe6`/`#0a0a0a` allowed (the page's one deliberate rest). Sections separate
by tone step, never by line. Verify AA in Task 3.

## Redraws (2, with reasons)

1. **Palette:** both dealt palettes (Candy chapters, then Teal on paper) conflict with stated
   brand constraints — dark-first site (milestone 2026-10-07) + plan Task 3's deep-gray
   surfaces, and the plan's ban on the cyan/teal generic accent. Kept dealt proportions,
   took colours from the stated constraint; accent from the dealt palette.
2. **Section work:** Book-spine index assumes 20–40 names; the subject has 5 projects with
   paired-list content. Took `work-quiet-ledger-preview`, whose side preview carries the
   paired lists (and hosts the live thing) and whose ledger echoes the subject's own audit
   artefact.

## Copy deck pointers (full text in `copy-deck.md`)

- Hero h1: "Cristian / Cardona" (8+7). Supporting: "Full-stack and cloud engineer of 7+
  years, now building AI systems, with every claim pointing at evidence you can open."
  Primary CTA everywhere: **Book a call** (Cal.com 15-min; mailto fallback).
- Work: "Work ledger" + 5 rows (full names, kinds, years) + per-row paired lists with real
  evidence IDs (`ev-ai-reliability-lab-repository`, `ev-cloud-dashboard-repository`,
  `ev-ai-automation-workflow-repository`).
- Career: "Seven years, five companies" + 118-word two-column statement, 6–7 highlighted
  facts, final highlighted line linked to contact.
- Evolution: "The evolution" + itinerary slip with phases (Foundation 2017–2021, Transition
  2021–2026, Frontier recorded-no-dates) and a final inverted row: "Today: AI engineering,
  automation and agentic systems — direction recorded, evidence public, in progress."
- Evidence: "Checked against" + one run-on sentence of the real artefacts, lit name cycling;
  statement size ≤36px / 3 lines per the sheet's adjustment.
- Contact: display rows — name / Remote-first / US-hours aligned / English, Español /
  email / greeting row "Talk soon" + round arrow button (accent band).
- Footer: name at full width, one line under it, colophon, credit-line placeholder,
  bilingual notice.

## Sample content / open details for client confirmation (from `copy-deck.md`)

1. Cal.com booking URL for "Book a call" (mailto fallback until provided).
2. The years claim: brief says 7+; CV data implies ~8 (2017-10 → present, 9-month gap 2023).
3. Ledger kind/status wording; contact row wording; greeting word "Talk soon".
4. Trimmed 12-name phone evidence sentence.
5. Spanish copy deck (follow-up task; site is bilingual by contract).
6. Footer credit line (filled when open-collection pictures are chosen, Task 5/6).
7. Email-as-display-row confirmation.

## Notes for downstream tasks

- Task 3 (tokens): use the palette block above and the Newsreader type system from the sheet
  (steps: small/body/lead/head + the display size from the hero blueprint); keep Inter out of
  display; monospace only in real code blocks.
- Task 4 (hero): follow the hero blueprint exactly, including its two "Adjusted for this
  page" notes (two-line headline, real 44px+ button instead of a text link).
- Task 5 (work): ledger geometry from the sheet; the side preview is the live thing; per-row
  `<details>` fallback; screenshots via astro:assets where they exist (only
  `images/site-career.png` does today).
- Task 6: career = two-column statement; evolution = itinerary slip (dated milestones with
  evidence links as the right-hand values); evidence = one sentence, honest statuses.
- Imagery floor: ≥4 real pictures (open collections via assets.mjs, credited; Mountain set
  only as atmosphere) + one moving picture where an honest clip exists. Pictures arrive
  large and few, never on the first screen.
- Motion: masked headline as the signature; then entrances, feedback, one moving picture
  (per SKILL.md step 9); prefers-reduced-motion fallbacks throughout.
