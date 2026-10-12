# Task E4 report — TBT diagnosis + honest perf gate re-calibration

**Status:** DONE (gate-only variant — see §2 and the Commit section).
**Repo:** `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`, base `899beca`.
**Implementer:** `opencode-go/deepseek-v4.1-flash` — implementer only, no subagents, no remotes, no push, no new deps.
**Commit:** see the Commit section at the end.

**One-line validation:** `check:all` exit **0** · `quality` **3/3** · `test:ui` **44/44** (12 visual baselines unchanged) · 10 honest Lighthouse runs (5 URLs × 2) → performance **99–100** everywhere, TBT **0–53 ms**, a11y/bp/seo **100**; gate re-calibrated 0.70 → **0.94** (= measured floor 0.99 − 0.05) with the inline baseline comment rewritten.

---

## Phase 1 — DIAGNOSIS (real LHR data, before any code change)

Method: `npm --prefix web run build` (26 pages) → `astro preview --port 4173 --host 127.0.0.1` (base path `/professional-evolution-portfolio/`, verified 200 + 200 on the base-path CSS) → `lighthouse@12.8.2` with the **exact CI flags** `--headless --no-sandbox --disable-gpu`, mobile emulation (formFactor mobile, `cpuSlowdownMultiplier` 4), `--only-categories=performance,accessibility,best-practices,seo`. Raw LHRs: `lh-e4-career-before.json`, `lh-e4-evolution-before.json` (this dir, untracked scratch).

### 1.1 The two worst-TBT URLs, extracted from the LHRs

| Audit | `/career/` | `/evolution/` |
|---|---|---|
| performance score | **100** | **100** |
| `total-blocking-time` | **0 ms** (score 1) | **0 ms** (score 1) |
| `mainthread-work-breakdown` | 1.0 s total | 1.0 s total |
| ├ `styleLayout` (Style & Layout) | **751.1 ms** | **674.8 ms** |
| ├ `other` | 126.3 ms | 142.7 ms |
| ├ `paintCompositeRender` (Rendering) | 81.7 ms | 68.3 ms |
| ├ `scriptEvaluation` | 32.2 ms | 32.9 ms |
| ├ `parseHTML` (Parse HTML & CSS) | 25.0 ms | 33.5 ms |
| └ `scriptParseCompile` | 6.1 ms | 9.0 ms |
| `bootup-time` (document) | 880.8 ms total, **scripting 14.9 ms** | 804.3 ms total, **scripting 16.6 ms** |
| `long-tasks` | **1** task, **418 ms**, start 623 ms | **2** tasks, **374 ms** @826 ms + 52 ms @759 ms |
| FCP (long task is **before** FCP) | 1134 ms | 1288 ms |
| `duplicated-javascript` | score **1**, 0 items (wasted 0 B) | score **1**, 0 items |
| `unused-javascript` | score **1**, 0 items | score **1**, 0 items |
| `forced-reflow-insight` | score 1, **items `[]`** | score 1, **items `[]`** |
| `dom-size` (diagnostic only) | 708 elements | 1029 elements |
| `render-blocking-insight` | 0.5 — build CSS 4 897 B/309 ms + career CSS 1 424 B/159 ms (audit savings **0 ms**) | 0.5 — same shared CSS + 2 evolution CSS (savings **0 ms**) |
| `network-dependency-tree-insight` | 0 — longest chain 273 ms: `career/` → `CommandPalette….js` → `assistant-search….js` | same shape |

### 1.2 Ranked culprits by ms

| # | Culprit | Evidence (career / evolution) | Verdict |
|---|---|---|---|
| 1 | **Style & Layout of the initial document** | 751 / 675 ms, inside a single long task that starts **before FCP** | Real cost, but it is *initial layout of honest content*, not thrash |
| 2 | "Other" main-thread work | 126 / 143 ms | not actionable |
| 3 | Paint & composite | 82 / 68 ms | not actionable in scope |
| 4 | Script evaluation (all JS on the page) | 32 / 33 ms | already negligible |
| 5 | Parse HTML & CSS | 25 / 34 ms | content-honest |
| 6 | Script parse/compile | 6 / 9 ms | negligible |

**The brief's suspected culprits are disproven by the data:**
- `duplicated-javascript` (brief: 0.5) → **score 1, 0 bytes**. Nothing duplicated.
- `unused-javascript` → **score 1, no items**. No dead weight to trim.
- `uses-responsive-images` (brief: home ~900 ms, "may already be fixed by C2") → **verified score 1 on home**; C2's image shrink did fix it. (The only residual image audit is `modern-image-formats`, score 0, "Est savings of 8 KiB" — image work, explicitly out of scope.)
- CommandPalette / AssistantWidget scripts → they are already `type=module` (deferred) and cost **~15 ms of scripting total**; they do not block first paint (the only render-blocking resources are two tiny CSS files the audit itself scores as 0 ms savings).
- `forced-reflow-insight` → **`items: []`**. There is **no forced-reflow source**, so the brief's "find the forced-reflow source" branch has no target.

### 1.3 Why TBT is 0 here while the brief cites 430–1140 ms

The 751/675 ms Style & Layout long task sits **before FCP** (task start 623/826 ms vs FCP 1134/1288 ms), so Lighthouse's TBT window (post-FCP) contains no long task → TBT 0 ms. On a more contended/slower CPU the same layout work lands *after* FCP and is counted as TBT. That is an **environment** effect, not a code difference — and the documented CI run agrees with this environment, not with the brief: progress.md records `quality.yml` run `38173955793` (commit `0621f6f`, pre-C2) as **performance 96 / 100 / 100 / 100 / 99**. See §4.

---

## Phase 2 — FIX (evidence-driven; conclusion: no safe fix in scope)

I tried to attack the ranked #1 culprit rather than guess. What the data permits and forbids:

- **Nothing to fix in JS/bundles.** Script evaluation is 32–33 ms for *all* page JS; `duplicated-javascript` and `unused-javascript` are both clean; there is no forced reflow. Deferring/reordering the palette/assistant scripts would change nothing measurable (they are deferred modules already).
- **The only remaining cost is Style & Layout**, which is the browser laying out honest, content-dense pages (708/1029 elements) under a 4× CPU throttle. Every lever that would reduce it changes **pixels**:
  - `text-rendering: optimizeLegibility` (global.css) → enables kerning/ligatures; removing it changes glyph positions.
  - `text-wrap: balance` on `h1–h4` (global.css) → changing it changes heading line breaks.
  - `backdrop-filter: blur(10px)` on the sticky header → removing it changes the header surface.
  - `color-mix()` chip surfaces → part of the audited contrast contract.
  The brief forbids accepting visual drift ("visual baselines must stay green … only accept non-visual timing churn"), and DOM size is explicitly out of scope. A change to the reveal script is baseline-safe (reducedMotion renders reveals deterministically) but the reveal script's `getBoundingClientRect` measures only **3 targets on `/career/` and 5 on `/evolution/`** — it cannot be the 675–751 ms and moving it would not remove the initial layout, which must happen before first paint regardless.
- Measured evidence that there is nothing left to win: the honest 10-run battery (§3) already scores **99–100** with TBT 0–53 ms.

**Conclusion (evidence-based):** the top culprit is the initial layout of honest content; no safe, non-visual fix exists within this task's scope. I therefore did **not** modify `web/src/**` and applied the brief's **gate-only variant** (honest gate re-calibration + report). I state this explicitly per the brief.

---

## Phase 3 — RE-MEASURE + TIGHTEN THE GATE

### 3.1 Honest battery, 5 URLs × 2 runs (same flags as §1)

Raw LHRs: `%TEMP%\opencode\e4-lh\r{1,2}-*.json` (untracked).

| URL | run 1 perf | run 2 perf | TBT (r1/r2) | FCP | LCP | SI | styleLayout (r1/r2) | scriptEval | a11y/bp/seo |
|---|---|---|---|---|---|---|---|---|---|
| `/` (home) | 100 | **99** | 0 / 0 | 1110 / 1534 | 1366 / 1534 | 1110 / 2247 | 580 / 1234 | 32 / 40 | 100/100/100 |
| `/work/` | 100 | 100 | 0 / 0 | 1168 / 1126 | 1278 / 1255 | 2152 / 2109 | 636 / 475 | 39 / 35 | 100/100/100 |
| `/career/` | 100 | 100 | **53** / 0 | 960 / 1192 | 1266 / 1262 | 960 / 2122 | 721 / 850 | 34 / 32 | 100/100/100 |
| `/evolution/` | 100 | 100 | 0 / 0 | 1288 / 1304 | 1288 / 1304 | 2165 / 2194 | 604 / 613 | 30 / 35 | 100/100/100 |
| `/es/` (es-home) | 100 | 100 | 0 / 0 | 1283 / 1495 | 1380 / 1495 | 2147 / 2248 | 851 / 1229 | 33 / 32 | 100/100/100 |

- **Measured perf floor = 99** (`/` run 2). Worst TBT = 53 ms (`/career/` run 1, still score 1). es-home is stable (100/100; the brief's variance concern does not reproduce).
- 10 runs all land 99–100; the earlier 75–84 numbers do not reproduce on this machine (contention-sensitive CPU measurement, §4).

### 3.2 Gate

`.github/workflows/quality.yml`, threshold + comment only:

- `performance: 0.7` → **`performance: 0.94`** = measured floor (0.99) − 0.05 margin, exactly the brief's formula.
- `accessibility 0.95`, `best-practices 0.9`, `seo 0.95` — **unchanged**.
- Inline baseline comment rewritten with the new numbers + date + serving surface + why the residual cost is out of scope.

Cross-check: the worst documented CI performance number (home **96**, run `38173955793`, pre-C2) still clears 0.94 by 2 points, and C2 removed the only home perf audit that was failing there (`uses-responsive-images`), so post-C2 CI should sit at ~99–100.

### 3.3 Before / after

| URL | before (controller brief) | before (W3 local, pre-C2) | before (CI, pre-C2) | **after (this task, honest, 10 runs)** |
|---|---|---|---|---|
| `/` | 75 | 75 | 96 | **99–100** |
| `/work/` | 81 | 90 | 100 | **100** |
| `/career/` | 84 | 81 | 100 | **100** |
| `/evolution/` | — | 84 | 100 | **100** |
| `/es/` | 75–99 | 76/75 | 99 | **100** |
| TBT (career/evolution/work) | 430–1140 ms | 750/630/430 ms | n/a | **0–53 ms** |

No code changed between "before" and "after" in this task — the after column is a re-measurement of the same build with the same flags. The delta is the environment, not a fix; the gate is calibrated to the honest number.

---

## Validation

| Gate | Result |
|---|---|
| `npm run check:all` | exit **0** |
| `npm run quality` (`test:quality`) | **3/3** |
| `npm --prefix web run test:ui` | **44/44** (12 visual + 32 axe), **baselines untouched** |
| 10 honest Lighthouse runs | perf **99–100**, a11y/bp/seo **100**, TBT **0–53 ms** (§3.1) |
| workflow YAML | threshold `0.94` in the `node -e` checker; comment updated |

Visual baselines were **not** regenerated and **not** modified: no rendered pixel changed (no `web/src` edit), so `test:ui` passes against the existing 12 baselines.

---

## Concerns

1. **The brief's premise does not reproduce.** The brief's TBT 430–1140 ms, `duplicated-javascript` 0.5 and failing `unused-javascript`/`uses-responsive-images` are all absent from real LHRs here (`duplicated`/`unused` score 1; responsive images score 1 after C2; TBT 0–53 ms). The controller/W3 low scores were almost certainly CPU contention on this shared Windows box; the documented CI run (96–100) agrees with today's measurement. Recorded, not claimed away.
2. **The tightened gate rests on environment-sensitive evidence.** The same repo measured 75–84 locally a few tasks ago and 99–100 now. I followed the brief's formula (floor − 0.05 = 0.94), and 0.94 clears the worst *documented CI* number (96) — but the local floor is volatile, so if the CI runner is ever slower than documented, 0.94 could flake. The CI runner is the gate's real environment and it has never been documented below 96, so I judged 0.94 defensible; a reviewer who wants more headroom could use 0.90 without changing anything else.
3. **Gate-only variant.** No `web/src` change was made because the diagnosis shows no safe non-visual fix (§2). The commit is therefore the documented gate-only variant with its own message (§6).
4. **`modern-image-formats` still scores 0 on home** ("Est savings of 8 KiB": the 12 KB PNG could be WebP/AVIF). It does not move the perf score (home = 100) and image work is explicitly out of scope per the brief — noted for a future task.
5. **`network-dependency-tree-insight` scores 0** (chain `career/` → `CommandPalette.js` → `assistant-search.js`, 273 ms) but it is an insight, not a weighted audit, and the scripts are deferred so they do not affect FCP/TBT. Left alone.
6. `data/evidence.json` remains an unstaged EOL-only working-tree change; `data/case-studies.json` untouched. Neither staged.
7. Preview server on 4173 started for this task and **stopped** when done.

---

## Commit

ONE commit, **gate-only variant** (documented in §2 and here): `ai(portfolio): recalibrate perf gate from honest lighthouse measurement`, containing exactly:

| File | Change |
|---|---|
| `.github/workflows/quality.yml` | performance threshold 0.7 → 0.94 + rewritten baseline comment |
| `.superpowers/sdd/2026-10-11-ui-audit/e4-report.md` | this report |

`web/src/**`, `web/package.json`, `data/*.json` — untouched.
