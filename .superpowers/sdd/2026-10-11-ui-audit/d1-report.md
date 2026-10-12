# Task D1 report — Discoverability parity: sitemap alternates + résumés, llms.txt ES section

**Status:** DONE.
**Repo:** `C:\Users\CARDONA\Desktop\professional-evolution-portfolio`, branch `main`, base `e7a77df` (working tree carried one pre-existing EOL-only change — see Concerns).
**Implementer:** `opencode-go/deepseek-v4.1-flash` — implementer only, no subagents, no remotes, no push, no new deps.
**Commit:** one commit, `ai(portfolio): add sitemap alternates and es links to llms txt` (contents in the Commit section).

**One-line validation:** `check:all` exit **0** · `test:quality` **3/3** · `test:ui` **44/44** (12 visual baselines unchanged) · sitemap parsed with a **real XML parser** (jsdom/saxes, `application/xml`): well-formed, **26** URLs (24 routed + 2 résumés), every `<url>` has **exactly 3 self-inclusive `xhtml:link`** alternates (en/es/x-default→EN), all locs+hrefs on the Pages origin, `workers.dev` **absent** · llms.txt lists all **8** ES routes + **both** résumés.

---

## 1. Sitemap (`scripts/sitemap-generate.mjs`)

### 1.1 What changed

1. **Résumés added.** `resume-en.html` / `resume-es.html` are static files in `web/public/` (served as-is, linked from Career), so `collectPages` — which walks `index.html` routes — cannot see them. They are now listed explicitly in `EXTRA_ROUTES`, so the sitemap cannot drift from the files the site actually serves. 24 → **26 URLs**.
2. **hreflang alternates.** `<urlset>` now declares `xmlns:xhtml="http://www.w3.org/1999/xhtml"`, and every `<url>` carries three `xhtml:link rel="alternate"` entries — `en`, `es`, `x-default` (→ the English URL) — matching the page heads BaseLayout already emits. Self-inclusive per the Google spec: the alternate for a page's own language points at its own `<loc>`.
3. **Pairing rule** (matches the site's routing): English `X` ↔ `es/X`; the home ↔ `es/`; the two résumés ↔ each other. Every routed page exists in both locales (both locales build the same route set), so every alternate resolves.
4. **Canonical origin only.** All locs and hrefs are `SITE` = `https://cristian-cardona-dev.github.io` + `BASE` = `/professional-evolution-portfolio/`. The Worker mirror is never used or mentioned.
5. **Deterministic order.** Sort is now a plain code-unit comparator (`byRoute`), not the default `Array.sort()` relying on implicit string coercion nor `localeCompare` (whose result depends on the host ICU data). The résumés land deterministically between `print/` and `work/`, so a test can assert the exact sequence.

### 1.2 Real-parser validation (not string grep)

`node %TEMP%\opencode\d1-sitemap-check.mjs` parses `web/dist/sitemap.xml` with **jsdom's XML parser** (`new JSDOM(xml, { contentType: 'application/xml' })` — saxes), then asserts:

| Assertion | Result |
|---|---|
| Well-formed (no `<parsererror>`) | PASS |
| `<urlset>` root + `xmlns:xhtml` = `http://www.w3.org/1999/xhtml` | PASS |
| URL count = 26 (24 routed + 2 résumés) | PASS |
| Every `<url>` has exactly 3 `xhtml:link`, `rel="alternate"`, order `en,es,x-default` | PASS |
| Every `<loc>` and every alternate `href` starts with the Pages origin | PASS |
| Self-inclusive: the page's own-language alternate === its `<loc>` (résumés special-cased by file, not `/es/` prefix) | PASS |
| `x-default` === the `en` href | PASS |
| `workers.dev` appears nowhere | PASS |
| Locs in deterministic sorted order | PASS |

The first run surfaced **one failure in the checker itself** — the résumés live at the root, so my `/es/`-prefix heuristic mislabelled `resume-es.html` as English. That was a bug in the throwaway validator, not in the sitemap; the checker was corrected to key the résumés off their filename and re-run green.

Sample output (`web/dist/sitemap.xml`, head):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://cristian-cardona-dev.github.io/professional-evolution-portfolio/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://cristian-cardona-dev.github.io/professional-evolution-portfolio/" />
    <xhtml:link rel="alternate" hreflang="es" href="https://cristian-cardona-dev.github.io/professional-evolution-portfolio/es/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://cristian-cardona-dev.github.io/professional-evolution-portfolio/" />
  </url>
  …
```

---

## 2. llms.txt (`web/src/pages/llms.txt.ts`)

- **New `## Páginas en español` section**: the 8 ES routes (Inicio, Trabajo, Evolución, Evidencia, Trayectoria, Contacto, Cómo está construido este sitio, Perfil imprimible) with full canonical URLs and a one-line honest ES description each. Descriptions mirror what the ES pages actually render (`copy.ts` es catalog); nothing is claimed that the site does not do.
- **New `## Currículums` section**: both résumés, one line each, pointing at the canonical Pages origin.
- **EN section untouched in meaning** (same 7 entries, same URLs, same descriptions). The only prose change is one added line to the closing intro paragraph: *"Spanish versions of the routed pages live under /es/ (see "Páginas en español")."* — now true (both locales build the same route set; ES case-study bodies ship since E2). It says "routed pages" because the résumés are static files at the root, not under `/es/`.
- All URLs still come from `abs()` → `PUBLIC_CANONICAL_BASE`; the Worker mirror appears nowhere.
- The file's header doc comment was corrected: the prose summary is no longer the *only* hand-written text (the ES page map and résumés are hand-written, since there is no data source for the site's own route list); every other list entry is still derived from the canonical data layer.

Grep on the built file: `/es/` occurrences = **9** (8 ES page links + 1 intro mention); both `resume-en.html` and `resume-es.html` present; `workers.dev` = false.

---

## 3. Validation

| Gate | Command | Result |
|---|---|---|
| Full gate | `npm run check:all` | exit **0** (build + validate + activity + urls + 27 tests + doctor + evidence/case-studies sync + data validate) |
| Front-end quality | `npm --prefix web run test:quality` | **3/3** (axe 2.2 AA on all built HTML, broken-link/anchor scan, external URL format) |
| Web build | `npm --prefix web run build` | green, 26 pages, `sitemap:generate OK — 26 URLs` |
| Real-browser UI gate | `npm --prefix web run test:ui` | **44/44**, **zero visual baseline churn** (`web/tests/visual/**-snapshots` untouched) |
| Sitemap XML contract | `node %TEMP%\opencode\d1-sitemap-check.mjs` | **PASS** (§1.2) |
| llms.txt ES coverage | grep on `web/dist/llms.txt` | 8 ES routes + 2 résumés, no `workers.dev` |

`test:ui` rebuilds via `npm run build`, so it exercised the new sitemap script end-to-end and served it from `astro preview`.

---

## 4. Concerns

1. **No automated test was added for the new contract.** The brief allows only the two source files, so the XML assertions live in a throwaway script under `%TEMP%`, not in the repo. A future task could promote §1.2 into `web/tests/` (jsdom is already a devDependency) so the alternate block cannot regress silently.
2. **`data/evidence.json` is an unstaged, pre-existing, EOL-only change** (`git diff` is empty; `git status` flags it from the stat cache). It was **not** staged, and `data/case-studies.json` was untouched. `npm run check:all` re-ran `evidence:sync`/`case-studies:sync`, which did not change either file's content.
3. **Print and Career are asymmetric between the two language lists.** The EN `## Pages` list keeps its existing 7 entries (Print was never listed there); the new ES section lists Print ES and Career ES because the brief named them. This is honest — both Print pages exist in the sitemap — but a reader comparing the two lists will notice the EN list is not a mirror of the ES one. Left as-is to honour "keep the existing EN section untouched in meaning".
4. **Alternates assume every routed page exists in both locales.** True today (both locales build the same 12 routes) and asserted by the XML check (self-inclusive + all targets on the Pages origin), but the script does not verify each alternate target file exists in `dist`. If a future page were added to one locale only, the sitemap would advertise a 404 alternate.
5. **`.vscode/` and `package-lock.json` are untracked** in the working tree (pre-existing, not mine); neither was staged.
6. No preview server was left running (`test:ui`'s `webServer` is torn down by Playwright).

---

## Commit

ONE commit: `ai(portfolio): add sitemap alternates and es links to llms txt`, containing exactly:

| File | Change |
|---|---|
| `scripts/sitemap-generate.mjs` | +2 résumé URLs, `xhtml` namespace + 3 alternates per `<url>`, explicit EN/ES pairing, deterministic code-unit sort, doc comment |
| `web/src/pages/llms.txt.ts` | `## Páginas en español` (8 ES routes) + `## Currículums` (2 résumés), one honest intro line, corrected doc comment |
| `.superpowers/sdd/2026-10-11-ui-audit/d1-report.md` | this report (force-added; `.superpowers/` is gitignored) |

`data/evidence.json`, `data/case-studies.json`, `web/tests/**`, baselines — **not staged**.
