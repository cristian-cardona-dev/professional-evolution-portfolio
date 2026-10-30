# Inventory — Cristian Cardona Dev (subject notes, step 1)

Twelve things that belong to this subject and to no competitor. Sources: `data/profile.json`,
`data/experience.json`, `data/projects.json`, `data/evolution.json`, `data/evidence.json`,
`data/skills.json`, `case-studies/*.md`, `README.md`, plus the task brief.

1. **The name.** Cristian Cardona. "Cristian" is the Spanish form of Christian; "Cardona" is a
   habitational surname from the Catalan town of Cardona, known for its rock-salt mountain and
   medieval castle. A Spanish-first name carried into an English-first, US-timezone industry —
   and the whole site answers in both languages.

2. **The place.** No office, no city claim: remote-first and global. The portfolio itself is the
   place — it lives on two hosts at once (GitHub Pages canonical, Cloudflare Worker mirror),
   built by one GitHub Actions run. The "address" of this engineer is a set of URLs.

3. **The numbers.** 7+ years shipping software (first job 2017-10; five employers since:
   SINCOSOFT, ITEHL, BITS Americas, Siigo, Talan — currently Full Stack at Talan, 2023-10 →
   present). 3 public reproductions (AI reliability lab, cloud observability dashboard, AI
   automation workflow lab), 1 live portfolio, and 1 product openly listed as *not built yet*
   (SaaS MVP, status "lab / planned").

4. **The constraint (the surface one).** Remote-first, US-timezone alignment, professional
   English with native Spanish. Everything the visitor reads exists twice, in reviewed English
   and reviewed Spanish, with accessibility parity between locales.

5. **The constraint (the deep one).** The evidence boundary: every capability statement must
   point at an inspectable artefact, and shipped work is listed separately from planned work.
   Each reproduction carries a paired list — *what this demonstrates* next to *what this does
   not demonstrate* — in the same breath. No invented metrics, quotes, testimonials or logos,
   ever. Even the site's "assistant" is keyword search that plainly says it is not AI.

6. **The materials.** Code (TypeScript, Node, .NET/Java, Astro), cloud infrastructure (Azure at
   all five employers, Terraform, GitHub Actions, Cloudflare Workers), and AI/LLM work (Azure
   AI, LLM APIs, chat and streaming, human-in-the-loop approval gates).

7. **The rituals.** Shipping production systems, then bounding them: contract tests; idempotency
   keys with replay-safe execution; an audit event for every state transition; fail-closed
   `insufficient_evidence` answers instead of confident guesses; commit-per-action with evidence
   links; build-time snapshots so the browser never makes a live call.

8. **The artefacts.** GitHub repos under cristian-cardona-dev; the LinkedIn profile; three case
   studies in a fixed five-part shape (Classification / What was implemented / What this
   demonstrates / What this does not demonstrate / Evidence); evidence records with honest
   statuses ("developing", "demonstrated"); a print/resume page; the public snapshot contract.

9. **The evolution.** A dated, three-phase arc: foundation (full-stack + cloud, 2017–2021),
   transition (Azure-heavy product work and the portfolio rebuild, 2021–2026-10), frontier (AI
   engineering, automation, agentic systems — milestones with commit-SHA evidence links from
   2026-10-03 onward). The arc is the argument: the AI work stands on nine years of shipping.

10. **The honesty device.** The paired lists in item 5 are this portfolio's signature move:
    every claim arrives with its own boundary. In an industry of inflated AI portfolios, the
    refusal to overclaim *is* the differentiator — and it is checkable, line by line, in the
    case studies.

11. **The printed things of its world.** Evidence-record IDs (`ev-*-repository`), claim IDs
    (`claim-*-reproduction`), commit SHAs used as citations, contract tests, the resume/print
    page, `llms.txt`, `rss.xml`, the sitemap. The world of this subject is auditable text.

12. **The deploy ritual.** One reviewed commit, one Actions run, two hosts; the legacy static
    site kept on the bench as the rollback path; the Worker mirror registered `indexable:
    false` as SEO policy. Nothing ships unreviewed.

*Where the idea will come from:* items 5 and 10 (the paired boundary lists), item 9 (the dated
arc), item 2 (the portfolio as the place), item 11 (evidence records as the printed artefact).
*Picture search queries for step 6:* terminal output, CI run logs, workflow state diagrams, the
salt mountain of Cardona, map of Catalonia, archival charts.
