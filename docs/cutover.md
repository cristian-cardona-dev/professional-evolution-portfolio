# Cutover — legacy `site/` → new `web/` app

Status: **applied.** The dual-path workflow described below is live in
`.github/workflows/deploy-static.yml`. Both the `web` (canonical) and `legacy`
(rollback) paths publish to GitHub Pages **and** the Cloudflare Worker mirror.
Last updated 2026-10-09: the web pipeline was extended to the Cloudflare mirror
(worker parity), so both hosts serve the Astro build.

## Current state

- **Legacy pipeline green.** `.github/workflows/deploy-static.yml` runs on push
  to `main` (and `workflow_dispatch`), validates with `npm run check`, then
  publishes the legacy static output built by `site/build.mjs` /
  `site/release-build.mjs` to GitHub Pages and to the Cloudflare Worker mirror.
  `site/`, `en/`, `es/`, and the root `index.html` are untouched and pass
  `npm run check:all`.
- **Web pipeline green.** `web/` (Astro 5, static) builds independently with
  `npm --prefix web run build` → `web/dist`, emitting **18 pages** and an
  18-URL `web/dist/sitemap.xml` (`scripts/sitemap-generate.mjs`). It is now
  deployed by `.github/workflows/deploy-static.yml` on push (pipeline `web`) to
  both GitHub Pages and the Cloudflare Worker mirror.
- **Parity matrix 13/13.** Every legacy homepage section has a `web/`
  counterpart (1 ported, 7 improved, 5 superseded). See
  [parity-matrix.md](parity-matrix.md).

Both trees coexist in one repository; neither build writes into the other's
output directory.

## Deployment today (applied)

`.github/workflows/deploy-static.yml` has a `validate` job and two publishing
jobs (`github-pages`, `cloudflare-worker`). On push (pipeline `web`) both
publishing jobs build the **Astro** artifact and deploy it: GitHub Pages uses
the project-site base `/professional-evolution-portfolio/`, the Cloudflare
Worker builds with `ASTRO_BASE=/` (root base) and the mirror origin. On a
`legacy` dispatch both jobs build the **legacy** artifact with
`npm run build:release` (`RELEASE_TARGET` selects the destination) into `dist/`
and deploy it. Each artifact carries a `release-manifest.json` with the same
`source_commit` / `snapshot_id` and its own `deployment_id` / `site_origin` /
`base_path`. See [dual-deployment.md](dual-deployment.md) for the host
roles, the Cloudflare mirror parity rule, and the no-duplicate-deploy rule.

## Worker target fix (2026-10-09)

`wrangler.jsonc` now targets the production mirror worker
**`professional-evolution-portfolio`** (`professional-evolution-portfolio.crisss198.workers.dev`),
not the earlier `cristian-cardona` worker, so `wrangler deploy` from the
`cloudflare-worker` job updates the URL the dual-host contract calls the mirror.
The mirror build now also sets `PUBLIC_CANONICAL_BASE` to the GitHub Pages
canonical (`https://cristian-cardona-dev.github.io/professional-evolution-portfolio/`),
so the mirror's `canonical`, `og:url`, `og:image` and `hreflang` tags point at
the Pages canonical instead of advertising the mirror origin. Internal asset and
nav links are unchanged (still root-relative on the mirror).

> **CRITICAL HUMAN STEP.** Disconnect the **Cloudflare Workers Builds Git
> integration** for this repository (per
> [dual-deployment.md](dual-deployment.md#prevent-duplicate-cloudflare-deployments)).
> While it remains connected, a push builds and deploys the legacy worker
> independently and **overwrites** the `wrangler deploy` output from the
> `cloudflare-worker` job, undoing this fix. Deploy Hooks must be disconnected
> for the same reason.

The legacy rollback is unchanged: a `pipeline=legacy` dispatch still rebuilds
and republishes both hosts (see [Rollback](#rollback)).

## Dual-path workflow (applied)

The workflow is **dual-path** so the legacy build remains an immediately
available rollback. Both paths live in `.github/workflows/deploy-static.yml`.

A `workflow_dispatch` input `pipeline` selects the build; pushes default to
`web`:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      pipeline:
        description: Which build to publish
        type: choice
        options: [legacy, web]
        default: web
```

- **`legacy` path.** `npm run build:release` → `dist/`, published to
  both `github-pages` and `cloudflare-worker`. This is the rollback path.
- **`web` path.** Build the Astro app with
  `npm --prefix web ci && npm --prefix web run build`, then publish
  `web/dist` to GitHub Pages and to the Cloudflare Worker. The Worker build
  uses `ASTRO_BASE=/` and `ASTRO_SITE=<mirror origin>` so the same app is
  served at the root path; `scripts/web-release-manifest.mjs` writes the
  per-target manifest (`RELEASE_TARGET=cloudflare-worker`).
- **Cloudflare mirror parity is kept in both paths.** The Worker job remains
  a second destination of the same run (same `source_commit` / `snapshot_id`
  identity), per [dual-deployment.md](dual-deployment.md). There is no second
  Cloudflare trigger, and the `cloudflare-worker` job no longer carries a
  job-level `if:` — it always runs and branches its build step on
  `env.PIPELINE` (job-level `if` cannot read the `env` context).

Both prerequisites below were satisfied when the `web` path was applied:

1. `web/package-lock.json` is committed so `npm --prefix web ci` has a
   lockfile to install from.
2. The Astro build emits a `release-manifest.json` with `source_commit` and
   `snapshot_id` (`scripts/web-release-manifest.mjs`), so the dual-host parity
   check in [dual-deployment.md](dual-deployment.md) can compare both hosts.

## Rollback

Re-run the workflow with `pipeline=legacy`. The legacy artifact is rebuilt from
the same reviewed commit and republished to **both** hosts — GitHub Pages and
the Cloudflare Worker mirror are restored together, so the rollback is
symmetric with the web deploy. No data loss: the legacy
and `web` trees coexist in the repository, the legacy output is reproducible
from `site/`, and the switch is a workflow input, not a destructive migration.
Follow the incident/rollback steps in
[dual-deployment.md](dual-deployment.md) (preserve evidence; use a reviewed
revert PR; never force-push or `git reset --hard`).

## Pre-deploy checklist

- [ ] **Pages base path verified** — `web/astro.config.mjs` `site` =
      `https://cristian-cardona-dev.github.io` and `base` =
      `/professional-evolution-portfolio/` match the GitHub Pages project-site
      URL, and `scripts/sitemap-generate.mjs` `SITE`/`BASE` stay in sync.
- [ ] **Sitemap has 18 URLs** — `web/dist/sitemap.xml` (one `<loc>` per built
      `index.html`).
- [ ] **Favicon loads** — `web/public/favicon.svg` is served and referenced.
- [ ] **Assistant index current** — re-run the canonical syncs
      (`npm run evidence:sync`, `npm run case-studies:sync`,
      `npm run evolution:generate`, `npm run data:validate`) so the build-time
      assistant index matches `data/*.json`.
- [ ] **Web3Forms key TODO** — set `formEndpoint` and `formKey` in
      `data/profile.json`, then run `npm run data:validate`. While both are
      `null`, `ContactForm.astro` renders the honest `mailto:` fallback instead
      of posting.
- [ ] **Issue templates present** — `.github/ISSUE_TEMPLATE/suggestion.yml`
      exists (the `SuggestionsPanel` deep-links to it).

## Post-deploy verification

- [ ] Home returns 200 at the canonical URL.
- [ ] `/es/` (Spanish mirror) returns 200 and renders translated chrome.
- [ ] At least one case study (`/work/<slug>/`) returns 200 and its content is
      intact.
- [ ] Assistant opens and returns the expected keyword results; no-match shows
      the honest fallback.
- [ ] Contact fallback works (mailto present while no form key is configured).
- [ ] No console errors on the checked pages.
- [ ] Mirror parity: both hosts expose the same `source_commit` and
      `snapshot_id` in `release-manifest.json`.

## Completed

- **Web pipeline → Cloudflare Worker mirror parity (2026-10-09).** The web
  pipeline now deploys both hosts from the same run. The Worker build uses
  `ASTRO_BASE=/` and emits its own `release-manifest.json`
  (`RELEASE_TARGET=cloudflare-worker`) with the same `source_commit` /
  `snapshot_id` as the Pages artifact. A `legacy` dispatch restores both hosts
  (see [Rollback](#rollback)).

## Delivered since 2026-10-12

- **`favicon.ico`** — `web/public/favicon.ico` now ships alongside `favicon.svg`.
- **`og:image`** — `web/public/og-cover.png` (1200×630) is produced by
  `scripts/brand-assets.mjs` and referenced as `og:image` in
  `web/src/layouts/BaseLayout.astro`. The work index, career, evolution and the
  three case studies additionally carry their own 1200×630 card, drawn offline
  by `scripts/generate-og-images.mjs` (Playwright, chained into the web build
  like the résumé PDFs) into `web/dist/og/`; the home and every other page keep
  the cover.
- **Scroll-spy** — active-section highlighting in the numbered side nav is
  implemented with `IntersectionObserver` in `web/src/components/Header.astro`
  (the reveal observer in `BaseLayout.astro` uses the same API).
- **Spanish case-study bodies** — `case-studies/*.es.md` (three files) carry
  machine-drafted Spanish translations (pending human review) of the English bodies;
  `scripts/case-studies-sync.mjs` attaches them as `sections_es` in
  `data/case-studies.json` (mirrored 1:1 with `sections`, enforced by
  `scripts/data-validate.mjs`), and `web/src/views/CaseStudy.astro` renders
  them on `/es/work/<slug>/` with the English sections as the fallback.
  Section anchors stay position-derived, so they are identical across locales.
- **Localized print and assistant milestone titles** — `/es/print/` and the es
  assistant index now use the `title_es` (machine-drafted, pending human review) through the same
  `milestoneTitle` helper as the timeline, instead of leaking the English
  curated title.

## Deferred (explicitly out of scope)

- **Worker sitemap origin** — `scripts/sitemap-generate.mjs` still hardcodes the
  canonical GitHub Pages `SITE`/`BASE`, so the Worker mirror's
  `sitemap.xml` lists Pages URLs even though the Worker is served at `/`.
  Harmless for a non-indexable mirror (`indexable: false`), tracked here.
- **Worker `/api/assistant` v2** — blocked on a model API key and Worker deploy
  authorization; see [assistant.md](assistant.md).
