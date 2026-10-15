# Professional Evolution Portfolio

Evidence-backed professional evolution from a Full Stack + Cloud foundation
toward AI Engineering, AI Automation, and Agentic Systems.

## Quickstart

Requirements: Node.js 22+ and Python 3. Wrangler 4.147.0 requires Node.js 22
or newer for deployment.

```powershell
git clone https://github.com/cristian-cardona-dev/professional-evolution-portfolio.git
cd professional-evolution-portfolio
npm run check
npm run build
python -m http.server 4173
```

Open:

- <http://localhost:4173/> — English fallback
- <http://localhost:4173/en/> — English
- <http://localhost:4173/es/> — Español

The site is static and works without AI, a database, or a Personal OS
connection. See [docs/quickstart.md](docs/quickstart.md) for the complete
verification flow.

The new Astro app under `web/` is built and previewed separately (Node.js 22+
required):

```powershell
npm --prefix web install
npm --prefix web run build
npm --prefix web run preview
```

## Portfolio web (redesign)

`web/` is the redesigned portfolio: an Astro 5 static app that renders the
canonical data in `data/*.json` (profile, projects, evolution, evidence, case
studies) instead of locale-template stitching. It produces 18 pages — the
English and Spanish home, work index, per-project case studies, evolution, and
evidence — plus a JSON-LD Person schema and an 18-URL sitemap. Its assistant is
an honest keyword search over the published data: no model, no API key, no
network call, and a plain statement that it is not AI. The legacy `site/` build
stays in place as the deploy and rollback path; see
[docs/cutover.md](docs/cutover.md) and [docs/parity-matrix.md](docs/parity-matrix.md).

## Documentation

- [Products and local ports](docs/products.md)
- [Quickstart](docs/quickstart.md)
- [Evidence boundary](docs/evidence-boundary.md)
- [Portfolio assistant](docs/assistant.md)
- [Design tokens](docs/design-tokens.md)
- [Legacy → web parity matrix](docs/parity-matrix.md)
- [Cutover](docs/cutover.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Dual-host deployment](docs/dual-deployment.md)
- [Release checklist](docs/release-checklist.md)

## Deployment architecture

GitHub Actions is the single deployment orchestrator. One run publishes the
reviewed commit to both destinations: GitHub Pages is the canonical site, while
the Cloudflare Worker is the root-path mirror/fallback whose `indexable: false`
entry is a registry/SEO policy. That registry flag is not technical noindex
enforcement; no technical noindex behavior should be claimed unless separately
implemented and verified. Cloudflare Workers Builds Git integration and Deploy
Hooks must be disabled or disconnected for this repository so they cannot create
duplicate Worker deployments. See [dual-host deployment](docs/dual-deployment.md)
for environment, parity, troubleshooting, and rollback procedures.

## Public boundary

The approved snapshot is the only public content source. Historical LinkedIn
sync material is not the source of truth. Claims distinguish public artefacts,
developing work, aspirations, and insufficient evidence.

## Public GitHub activity

The portfolio includes a build-time snapshot in [`github-activity/`](github-activity/).
It is limited to an explicit allowlist of public repositories and supports selected
public pull requests, commits, releases, and deployment objects. The browser never
calls GitHub and no token is required. The checked-in first snapshot is intentionally
empty when verified activity is unavailable; it must not be read as a complete live
contribution feed. Validate it with `npm run activity:check`.

## Changelog

| Date | Version | Summary |
|---|---|---|
| 2026-10-15 | 0.2.1 | Use reviewed Spanish milestone narratives in home and assistant snippets. |
| 2026-10-08 | 0.1.1 | Localize controlled labels and strengthen accessibility regressions. |
| 2026-10-09 | 0.2.0 | Astro redesign pipeline, canonical data, assistant, SEO. |
