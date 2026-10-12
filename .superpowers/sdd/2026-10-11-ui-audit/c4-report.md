# Task C4 report — Search form WebMCP + perf gate headroom

**Status:** DONE — one commit on `main`, not pushed, no remotes touched, no subagents, no new deps.
**Repo:** `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`, base `6ea1f5e`.
**Implementer:** `opencode-go/deepseek-v4.1-flash`.
**Commit:** `ai(portfolio): annotate search form and widen perf gate margin` (file list in §6).

**One-line validation:** `check:all` exit **0** · `test:ui` **44/44** (2 `/build/` baselines regenerated deliberately after the copy fix) · built `index.html` + `es/index.html` each carry `toolname="site_search"` + search `toolparamdescription` · Lighthouse **13.5.0** `agentic-browsing` = **1.0** on `/` and `/es/` with **2** declarative tools registered and **form-coverage now pass** (was "1 form missing annotations" in E3) · perf gate `0.94 → 0.90` with the inline comment rewritten.

---

## 1. What changed

### 1.1 E3 concern #3 — the assistant search form is now annotated

`web/src/components/AssistantWidget.astro:127` renders a real `<form>` (`form.assistant__form`) that E3 deliberately left un-annotated, so Lighthouse's form-coverage audit listed it as the one form missing WebMCP. It now carries the same honest pattern as the contact form, markup-level and English on both locales (agent-facing contract, identical to the contact-form choice):

| Attribute | Where | Value |
|---|---|---|
| `toolname="site_search"` | `<form class="assistant__form">` | stable machine id |
| `tooldescription` | same form | "Searches this site's own published index with client-side keyword matching and returns links to the pages that match. It runs entirely in the visitor's browser against an index embedded in the page: no network request, no backend and no AI model or API call. A query that matches nothing returns an honest fallback with the site's own listings instead of an invented answer." |
| `toolparamdescription` | `<input name="q">` | "Keywords matched against the titles, summaries and status text of the site's own published pages." |

**Honesty (constraint a).** The description says what the code actually does: `assistant-search.ts` scores the index that `AssistantWidget.astro:68/194` serializes into the page at build time, and `run()` (`AssistantWidget.astro:293`) only moves pre-rendered rows. There is no `fetch`, no backend, no API key and no model call anywhere in the component (header comment, lines 2-14). The description therefore claims **no network request, no backend, no AI model/API call**, and states the honest empty result (the fallback with `mailto:` + listings). No capability is advertised that the site does not have.

### 1.2 E4 concern #2 — perf gate headroom

`.github/workflows/quality.yml`, threshold + comment only:

- `performance: 0.94` → **`0.90`** = documented CI-worst floor (0.96) minus 0.06.
- `accessibility 0.95`, `best-practices 0.9`, `seo 0.95` — unchanged.
- The inline comment now states the honesty baseline explicitly (local floor **0.99**, CI-worst **0.96**), why 0.90 was chosen (GitHub's announced `ubuntu-latest` → **Ubuntu 26** migration on **2026-10-19** can move measured performance before any code change), and that it still catches real regressions (the pre-optimization CI floor was **96**, the previous gate was **0.70**). The honesty note (the 75-84 local figures were CPU contention; the documented CI run `38173955793` agrees with the higher floor) is kept.

### 1.3 Copy fix — the `/build/` agent note would have become false

`copy.build.agentNote` (EN + ES) claimed *"the assistant's search box stays a plain search and is not exposed as one"* / *"el buscador del asistente sigue siendo una búsqueda normal y no se expone como tal"*. Annotating the search form makes that **factually wrong**, so per the brief's constraint it was updated (this is the only copy change, and it is why `/build/` pixels moved):

- EN: "…annotates two forms with WebMCP: its contact form (contact_message) and the assistant's search box (site_search)… The search tool is honest about what it is: a client-side keyword search of the index already embedded in the page — no network request, no backend and no AI model. A Lighthouse 13.5.0 run … registered **both tools** with valid schemas, passed the accessibility-tree audit, **reported no form missing annotations** and measured a cumulative layout shift of 0."
- ES: the same facts in Spanish.
- No other `/build/` claim changed (llms.txt wording, CLS, a11y untouched — all still true). `web/src/views/BuildNotes.astro` was **not** modified: it only renders `copy.build.agentNote`, so the correction lives in `copy.ts` alone.

---

## 2. Agentic-browsing re-audit — real numbers

Method: `npm --prefix web run build` (26 pages) → `astro preview --port 4173 --host 127.0.0.1` (base path verified 200) → `npx --yes lighthouse@13 … --chrome-flags="--headless=new --no-sandbox --disable-gpu --enable-features=WebMCP" --only-categories=agentic-browsing`. The `--enable-features=WebMCP` flag is required (E3 §2.2). Artifacts: `lh-c4-agentic-en.json`, `lh-c4-agentic-es.json` (this dir, untracked scratch).

| Audit | EN `/` | ES `/es/` | vs E3 |
|---|---|---|---|
| **Category score** | **1.0** | **1.0** | unchanged |
| **WebMCP tools registered** | **2 declarative tools** | **2 declarative tools** | was 1 |
| **Forms missing declarative WebMCP** | **PASS (score 1, no displayValue)** | **PASS** | was "1 form missing annotations" |
| **WebMCP schemas are valid** | PASS | PASS | unchanged |
| **Accessibility tree is well-formed** | PASS ("All audits passed") | PASS | unchanged |
| **Cumulative Layout Shift** | 0 | 0 | unchanged |
| **llms.txt follows recommendations** | notApplicable (Pages base path) | notApplicable | unchanged |
| `ai-catalog.json` (ARD) | notApplicable | notApplicable | unchanged |

Registered tools (both locales, Lighthouse element selectors):

| tool | element | input schema |
|---|---|---|
| `contact_message` | `div.shell > div.contact__panel > div.contact__fallback > form.contact__mailto` | `{type:object, properties:{suggestion:{type:string, description:"The message … prefilled email."}}, required:[]}` |
| `site_search` | `body > div.assistant > div#pep-assistant-panel > form.assistant__form` | `{type:object, properties:{q:{type:string, description:"Keywords matched against the titles, summaries and status text of the site's own published pages."}}, required:[]}` |

Versions: Lighthouse **13.5.0**, Chrome **154.0.8037.98** (`HeadlessChrome/154.0.0.0`), mobile emulation, 2026-10-12. **Both forms now pass** — the E3 concern #3 is closed.

---

## 3. Validation

| Gate | Result |
|---|---|
| `npm run check:all` | exit **0** (build, validate, activity, urls, 27/27 node tests, doctor, evidence/case-studies sync, `data:validate OK`, activity) |
| `npm --prefix web run test:ui` | **44/44** (12 visual + 32 axe) — first run showed exactly the 2 expected `/build/` failures, baselines then regenerated deliberately |
| grep built HTML `index.html` + `es/index.html` | each: **1** × `toolname="site_search"`, search `toolparamdescription` present; `tooldescription` ×2 (contact + search) |
| grep `copy.ts` + built build pages | the old false claim ("not exposed as one" / "no se expone como tal") is **gone** |
| Lighthouse `agentic-browsing` | EN + ES category **1.0**, 2 tools, form-coverage pass, schema valid, a11y pass, CLS 0 (§2) |
| workflow YAML | threshold literal `performance:0.90` in the `node -e` checker; comment rewritten |

**Baselines.** The form attributes are non-rendering, but the `agentNote` **copy** renders on `/build/`, so `--update-snapshots` touched exactly `build-chromium-{desktop,mobile}-win32.png` and nothing else (verified by `git status`).

---

## 4. Process notes

- `data/evidence.json` remains an unstaged EOL-only working-tree change (`git show HEAD:data/evidence.json` equals the working copy after CRLF normalization; `git diff` content empty) — **not staged**.
- `.superpowers/` audit JSONs + this report, `.t22-report.md`, `.t23-report.md`, `.vscode/`, `package-lock.json`, `web/dist/`, `web/test-results/` left untracked per the established E1-E4 scratch pattern.
- No push, no remotes, no new project dependencies. `npx lighthouse@13` is a transient download only.
- Preview server on 4173 started for this task and **stopped** when done.

## 5. Concerns

1. **`site_search` advertises a keyword filter, not a question answerer.** The annotation is honest, but an agent that reads `toolname` alone may still expect semantic search. The `tooldescription` mitigates this in full ("client-side keyword matching … no AI model or API call"), and the audit registers the schema as `{q: string}`, so the contract is accurate; the residual risk is agent-side expectation, not site-side overclaiming.
2. **The gate's 0.90 rests on the CI runner's behaviour.** The local floor is 0.99 and the only documented CI number is 96, so 0.90 clears it by 6 points. If the Ubuntu 26 image turns out *faster*, the gate is now looser than it needs to be; if it is much slower, even 0.90 could flake. The comment records the reasoning so a later task can tighten it once the migration has real data.
3. **llms.txt is still unreachable to the audit on the canonical host** (Pages sub-path → `notApplicable`; only the Cloudflare root mirror passes). Unchanged from E3; not fixable in the front end.
4. **The contact form's POST branch remains unexercised** (`formEndpoint`/`formKey` are `null`), so its `toolname`/`toolparamdescription` attributes are honest but not audit-visible today. Unchanged from E3.

## 6. Commit

ONE commit, message `ai(portfolio): annotate search form and widen perf gate margin`, containing exactly:

| File | Change |
|---|---|
| `web/src/components/AssistantWidget.astro` | `toolname`/`tooldescription` on the search form + `toolparamdescription` on the query input (+ a short honesty comment) |
| `.github/workflows/quality.yml` | performance threshold `0.94 → 0.90` + rewritten baseline comment |
| `web/src/i18n/copy.ts` | `build.agentNote` EN + ES corrected (search box is now annotated) + type-doc comment |
| `web/tests/visual/…/build-chromium-desktop-win32.png` | deliberate (corrected `/build/` copy) |
| `web/tests/visual/…/build-chromium-mobile-win32.png` | deliberate (corrected `/build/` copy) |
| `.superpowers/sdd/2026-10-11-ui-audit/c4-report.md` | this report |

`web/src/views/BuildNotes.astro`, `data/*.json`, `web/package.json` — untouched.
