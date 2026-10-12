# Task D2 report — Widen the real-browser axe gate: case studies, ES subpages, 404s

**Status:** DONE.
**Repo:** `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`, base `2a115bf` (working tree carried one pre-existing EOL-only change — see Concerns).
**Implementer:** `opencode-go/deepseek-v4.1-flash` — implementer only, no subagents, no remotes, no push, no new deps.
**Commit:** one commit, `ai(portfolio): widen axe coverage to case studies and 404 pages` (contents in the Commit section).

**One-line validation:** `test:ui` **100/100** (was **44/44**) with **zero visual baseline churn** · every new `AXE_PAGES` entry passes axe in **dark + light** · the 404 block **failed correctly** on a deliberately broken 404 (`color-contrast` on `h1`, dark, both projects) and went green again after revert · `test:quality` **3/3** · no preview server left running.

---

## 1. `web/tests/visual/pages.mjs` — `AXE_PAGES` 8 → 20

Twelve new axe-only entries, no change to `PAGES` (so no new baselines). All use the file's relative-path convention — **no leading slash** — which is the trap the file's own doc comment warns about: `page.goto('/work/')` resolves against the origin, drops the `/professional-evolution-portfolio/` base path and lands on the Astro 404 page. `gotoPage` still asserts 200, so a stray leading slash fails loudly instead of silently scanning the wrong page.

| Group | Entries added | Why axe-only, not `PAGES` |
|---|---|---|
| Case studies EN | `work-ai-automation-workflow-lab`, `work-ai-chat-app`, `work-cloud-dashboard` | bodies come from the case-study data layer; pixels follow content |
| Case studies ES | `es-work-ai-automation-workflow-lab`, `es-work-ai-chat-app`, `es-work-cloud-dashboard` | same, Spanish twins |
| ES subpages | `es-work`, `es-career`, `es-evolution`, `es-evidence`, `es-print` | never listed: `PAGES` held the EN routes + the ES home only |
| EN print | `print` | verified to exist first — `web/dist/print/index.html`, HTTP **200** |

`resume-en` / `resume-es` are kept, as required. The `AXE_PAGES` doc comment was rewritten to explain the pixel-vs-DOM split for all three groups instead of only the résumés.

## 2. `web/tests/visual/axe.spec.mjs` — dedicated 404 block

The axe-scan body was extracted into `scanViolations(page)` so the 404 block reuses the exact same scan (same WCAG tag set, same violation shape) rather than duplicating it.

New block, driven by:

```js
const NOT_FOUND = [
  ['404-en', 'this-page-does-not-exist-404/', 'en', /\/this-page-does-not-exist-404\/$/],
  ['404-es', 'es/this-page-does-not-exist-404/', 'es', /\/es\/404\//],
];
```

Per scheme × per locale it:

1. calls **`page.goto` directly, not `gotoPage`** — a miss must answer 404 and `gotoPage` throws on anything but 200; here the 404 status *is* the contract;
2. asserts `response.status() === 404` **before anything is scanned** (a gate that scanned whatever the server returned would be worthless), with the resolved `page.url()` in the failure message;
3. `waitForURL(settled)` — the English miss must stay put, the Spanish miss must end on `/es/404/`;
4. asserts `html[lang]` is `en` / `es` and that `header.site-header` is visible (the site chrome the brief demands), so the scan cannot silently pass against the English fallback;
5. axe-scans the rendered page in that scheme and fails on any violation.

**Measured behaviour (why the two locales settle differently).** A static host serves the English `dist/404.html` for *every* miss. That page's own inline script (`web/src/pages/404.astro`) redirects any `/es/…` miss to `/es/404/?from=…`, so the Spanish miss ends on the real Spanish 404 while the English miss stays at the requested URL. Probed directly against `astro preview`:

| Request | Status | Final URL | Axe (dark + light) |
|---|---|---|---|
| `…/no-such-page-xyz/` | 404 | unchanged | 0 violations |
| `…/es/no-such-page-xyz/` | 404 | `…/es/404/?from=…` | 0 violations |

**No markup fix was needed, and no rule was excluded.** Both `404.astro` and `es/404.astro` are already axe-clean in both themes — the guard in the brief (fix the markup rather than excluding rules) never triggered. Both 404 pages are therefore **unchanged**, and the scan uses the same unmodified WCAG tag set as every other page.

## 3. Counts in docs/comments

There is **no `web/tests/visual/README`** and no other doc stating the gate size (grep for `test:ui` / `axe` / `44/44` across `*.md` finds only `docs/design-tokens.md:200`, an unticked manual checklist with no number, and `playwright.config.mjs`'s "Two specs live under `tests/visual`", which is still true). The only stale count was the `axe.spec.mjs` header — now **"the twenty pages in `AXE_PAGES` … plus the two 404 routes"**.

Test arithmetic, both observed on the runner:

| | Before | After |
|---|---|---|
| Visual baselines (`PAGES` 6 × 2 projects) | 12 | 12 (unchanged) |
| `AXE_PAGES` scans (N × 2 schemes × 2 projects) | 8 → **32** | 20 → **80** |
| 404 scans (2 locales × 2 schemes × 2 projects) | — | **8** |
| **`test:ui` total** | **44** | **100** |

## 4. Validation

| Gate | Command | Result |
|---|---|---|
| Full UI gate | `npm --prefix web run test:ui` | **100 passed (2.3 m)** |
| Axe spec only, 404 block | `npx playwright test tests/visual/axe.spec.mjs --grep "404-"` | **8 passed** |
| Front-end quality (jsdom axe + links) | `npm --prefix web run test:quality` | **3/3** |
| Web build | `npm --prefix web run build` | green, 26 pages, `sitemap:generate OK — 26 URLs` |
| Negative test (404 markup broken) | see below | **2 failed / 6 passed**, exactly as designed |
| Baselines | `git status --short web/tests/visual/visual.spec.mjs-snapshots/` | **empty — clean** |
| Leftover servers | `Get-NetTCPConnection -LocalPort 4322` | **0 listeners** |

### 4.1 Negative test (the 404 block can actually fail)

Deliberately broke the 404 markup: `<h1 style="color: #111111">` in `web/src/pages/404.astro` (near-black text on the dark theme background), rebuilt, re-ran only the 404 block:

```
2 failed
  [chromium-desktop] › 404-en has no axe violations (dark)
  [chromium-mobile]  › 404-en has no axe violations (dark)
6 passed
    - Array []
    + Array [ { "id": "color-contrast", "impact": "serious",
                "help": "Elements must meet minimum color contrast ratio thresholds",
                "nodes": ["h1"] } ]
```

The failure is the *real* rule firing on the *real* broken node — not an assertion misfiring — and it fired in both viewport projects while light (`#111` on white) correctly stayed green. `web/src/pages/404.astro` was then reverted to byte-identical (`git diff -- web/src/pages/404.astro` empty), rebuilt, and the 404 block re-run **8/8 green** before the final full `test:ui`.

### 4.2 Preview server

Started my own `astro preview` on `127.0.0.1:4322` to probe 404 statuses and to iterate on the negative test without a rebuild per run; stopped it (`Stop-Process` on the listening PID) before the final `test:ui`, which then let Playwright own the server lifecycle. Port 4322 has **0 listeners** now.

## 5. Concerns

1. **Two routed pages still have no axe coverage: EN `evidence/` and ES `es/build/`.** The brief enumerated exactly which routes to add and named neither of these (it asked for the ES `evidence/` page, which is now covered as `es-evidence`, but not its English twin; and for no ES `build/`). Both routes exist and build (`web/dist/evidence/index.html`, `web/dist/es/build/index.html`). Closing the pair would be two more entries in the same list — I followed the brief exactly rather than widening scope, so this is a decision to confirm, not an oversight.
2. **The ES 404 test depends on the EN 404 page's client-side redirect.** It passes today (404 status from the English fallback, then a JS `location.replace` to `/es/404/`). If that inline script were removed or JS were disabled, the test would fail on `html[lang="es"]` rather than silently scanning English copy — which is the behaviour I want, but it does mean the ES case exercises a redirect chain, not a direct route. The direct route `es/404/` (HTTP 200) is *not* scanned on its own; if the redirect is ever refactored, consider adding it.
3. **`this-page-does-not-exist-404/` is a sentinel, not a real route.** If someone ever creates that route, both 404 tests fail on the status assertion (loudly, by design). Nothing enforces that the string stays unused.
4. **CI's axe job is now much bigger and touches 404 URLs.** `quality.yml` already runs `npx playwright test tests/visual/axe.spec.mjs`, so that step goes **32 → 88 tests** (+56), of which **8 are 404 scans** (2 locales × 2 schemes × 2 projects). `astro preview` answers those with `dist/404.html` and status 404 on the same Node/Astro version — verified locally on astro 5.18.2 — so the runner should behave identically, but the 404 path is now on CI's critical path.
5. **`data/evidence.json` is an unstaged, pre-existing, EOL-only change** (`git diff` is empty; `git status` flags it from the stat cache). **Not staged.** `data/case-studies.json` was untouched. `.vscode/` and `package-lock.json` remain untracked and were not staged.
6. No rule exclusions and no `copy.ts` change were needed: the 404 pages were already clean, so the narrowest-possible-exclusion escape hatch in the brief was never used.
7. The report is force-added to the commit (`.superpowers/` is gitignored), matching the tracked `d1-report.md` / `c4-report.md` / `e4-report.md` precedent in this SDD series.

## Commit

ONE commit: `ai(portfolio): widen axe coverage to case studies and 404 pages`, containing exactly:

| File | Change |
|---|---|
| `web/tests/visual/pages.mjs` | `AXE_PAGES` 8 → 20 (+12 axe-only routes, no leading slashes), rewritten doc comment |
| `web/tests/visual/axe.spec.mjs` | extracted `scanViolations()`, updated header count, new 404 block (direct `page.goto`, 404 assertion, locale settle, chrome guard) |
| `.superpowers/sdd/2026-10-11-ui-audit/d2-report.md` | this report (force-added; `.superpowers/` is gitignored) |

`web/src/pages/404.astro`, `web/src/pages/es/404.astro`, `web/src/i18n/copy.ts`, `data/evidence.json`, `data/case-studies.json`, `web/tests/visual/visual.spec.mjs-snapshots/**` — **not staged**.
