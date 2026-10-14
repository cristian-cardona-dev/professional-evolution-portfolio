/**
 * Typed bilingual copy catalog — the only place UI strings live.
 *
 * `en` is the reference implementation. `es` is typed as `Copy` as well, so a
 * missing or misspelled key is a compile error rather than an English string
 * leaking into the Spanish page. Parity between locales is a plan requirement:
 * every key added to `en` must be translated here in the same edit.
 *
 * Status labels and their tooltips follow the public snapshot's claim
 * semantics (`public-snapshot/snapshot.json` → `claim_status_semantics`), so a
 * label always means the same thing as the underlying evidence.
 *
 * Counts are functions instead of `{placeholder}` strings so an interpolated
 * value can never be forgotten at a call site.
 */

export type Locale = 'en' | 'es';

export const LOCALES: readonly Locale[] = ['en', 'es'] as const;

export type ClaimStatus = 'demonstrated' | 'developing' | 'aspirational' | 'insufficient';

/**
 * Categories of `data/skills.json`. Mirrors the `SKILL_CATEGORIES` enum that
 * `scripts/data-validate.mjs` gates, so the localized headings and the data
 * contract cannot drift into different vocabularies.
 */
export type SkillCategory =
  | 'languages'
  | 'frontend'
  | 'backend'
  | 'cloud'
  | 'data'
  | 'ai'
  | 'devops';

export interface Copy {
  meta: {
    title: string;
    description: string;
    languageName: string;
  };
  a11y: {
    skipToContent: string;
    primaryNav: string;
    externalLink: string;
    opensInNewTab: string;
    required: string;
    onThisPage: string;
  };
  nav: {
    work: string;
    career: string;
    evolution: string;
    evidence: string;
    contact: string;
    menuLabel: string;
  };
  theme: {
    label: string;
    toggle: string;
    dark: string;
    light: string;
  };
  lang: {
    label: string;
    current: string;
    switchToEn: string;
    switchToEs: string;
  };
  hero: {
    eyebrow: string;
    oneLiner: string;
    principle: string;
    ctaWork: string;
    ctaEvidence: string;
    github: string;
    linkedin: string;
  };
  /**
   * Verified metrics strip on the home page (`views/Home.astro`).
   *
   * Every count is computed from the canonical data at build time and passed
   * into these functions, so a data change can never leave a stale total in
   * copy. The captions are the honest phrasing of what each figure counts.
   */
  metrics: {
    /** Heading above the strip. */
    heading: string;
    /** Companies in `data/experience.json`, plus the earliest declared year. */
    companies: (count: number, since: number) => string;
    /** Projects with a public status (`live`, `prototype` or `lab`). */
    projects: (count: number) => string;
    /** Milestones in `data/evolution.json`. */
    milestones: (count: number) => string;
    /** The published locales, e.g. "EN + ES". */
    locales: string;
  };
  /**
   * Notes feed on the home page (`components/NotesFeed.astro`).
   *
   * The feed renders the most recent hand-written milestones only — the same
   * curated set the evolution preview draws from — so an unreviewed git
   * candidate can never appear in it. Every string here is UI copy; the
   * entries themselves come from `data/evolution.json`.
   */
  notes: {
    /** Eyebrow above the feed. */
    eyebrow: string;
    /** Heading of the feed. */
    heading: string;
    /** Lead paragraph under the heading. */
    summary: string;
    /** CTA from the feed to the full timeline. */
    allNotes: string;
    /** Label of the link to the RSS feed. */
    rss: string;
  };
  work: {
    eyebrow: string;
    heading: string;
    summary: string;
    viewAll: string;
    repo: string;
    caseStudy: string;
    related: string;
    relatedEmpty: string;
    screenshotPlaceholder: string;
    /**
     * Localized alt text of a published screenshot, keyed by the screenshot's
     * file basename (the dataset stores site-root-relative paths such as
     * `images/site-career.png`). A description lives here rather than in the
     * data because `screenshots` is a plain path list, and the alt is UI copy.
     */
    screenshotAlt: Record<string, string>;
    /** Fallback alt for a screenshot with no specific description. */
    screenshotAltFallback: (name: string) => string;
    /** Accessible label of the tag filter bar on the work listing. */
    filterLabel: string;
    /** The button that clears the tag filter and shows every card. */
    filterAll: string;
  };
  /** Case-study detail page (`/work/<slug>/` and `/es/work/<slug>/`). */
  caseStudy: {
    /** Eyebrow above the project name. */
    eyebrow: string;
    /** Back link to the work listing. */
    back: string;
    /** Summary label that reveals the technical sections (progressive disclosure). */
    disclosure: string;
    /** Honest empty state for a project without case-study content. */
    empty: string;
    /** Heading of the closing CTA block. */
    ctaHeading: string;
    /** Label of the link to the contact section of the home page. */
    ctaContact: string;
  };
  projectStatus: {
    label: Record<'live' | 'mvp' | 'demo' | 'prototype' | 'lab', string>;
    hint: Record<'live' | 'mvp' | 'demo' | 'prototype' | 'lab', string>;
  };
  evolution: {
    eyebrow: string;
    heading: string;
    summary: string;
    viewAll: string;
    previewNote: string;
    shipped: string;
    inProgress: string;
    planned: string;
    sourceLabel: Record<'curated' | 'git' | 'snapshot', string>;
    /** Heading of the legend that explains what each source badge means. */
    sourcesNote: string;
    /** One line per source badge, shown next to its label in that legend. */
    sourceHint: Record<'curated' | 'git' | 'snapshot', string>;
    /** Heading above the complete timeline (the preview uses `summary`). */
    timelineHeading: string;
    evidenceLinks: (count: number) => string;
    /** Heading of the timeline half that covers what already happened. */
    completedHeading: string;
    /** One line under `completedHeading`. */
    completedNote: string;
    /** Heading of the timeline half that covers planned, not-yet-delivered work. */
    directionAheadHeading: string;
    /**
     * One line under `directionAheadHeading`. This is load-bearing copy: it is
     * the sentence that stops a reader treating a planned entry as a result.
     */
    directionAheadNote: string;
    /** Label before the project links of a milestone. */
    relatedLabel: string;
    /** Preview note used when the subset is "curated entries only". */
    curatedPreviewNote: string;
    /** Heading of the roadmap table on the evolution page. */
    roadmapHeading: string;
    /** One line under the roadmap heading. */
    roadmapNote: string;
    /** Label above the supporting-project links of one roadmap row. */
    roadmapProjectsLabel: string;
    /** Shown when a phase declares milestones but none of them link a project. */
    roadmapNoProjects: string;
    /** Roadmap phase names, in roadmap order. */
    phaseLabel: Record<'foundation' | 'transition' | 'frontier', string>;
    /** One line per phase, describing what that phase was about. */
    phaseFocus: Record<'foundation' | 'transition' | 'frontier', string>;
    /** Milestone count inside one roadmap row. */
    roadmapMilestones: (count: number) => string;
    /**
     * The goal → skill → proof roadmap table (`components/RoadmapTable.astro`),
     * built from `data/roadmap.json`.
     *
     * This is the forward-looking half of the roadmap area: the phase rows above
     * describe what each phase covered, and this table states, per declared
     * goal, the skills it exercises and the artifact that would prove it. The
     * copy therefore may not sound like a result: `noProofs` is the honest empty
     * state for a row with nothing published yet.
     */
    roadmapTable: {
      /** Heading of the table on the evolution page; `#roadmap` is its anchor. */
      heading: string;
      /** One line under the heading: what the table claims, and what it does not. */
      note: string;
      /** Column label of the goal cell. */
      goalLabel: string;
      /** Column label of the skills cell. */
      skillsLabel: string;
      /** Column label of the proof cell. */
      proofLabel: string;
      /** Type label of a proof that points at a project. */
      proofProject: string;
      /** Type label of a proof that points at an evolution milestone. */
      proofEvolution: string;
      /** Honest empty state for a roadmap row with no published proof. */
      noProofs: string;
      /** CTA from the home page to the roadmap section of `/evolution/`. */
      viewAll: string;
    };
  };
  /**
   * Career history (`data/experience.json`): the employer line rendered by
   * `components/CareerTimeline.astro` on the home page and `/career/`.
   *
   * Every entry carries the same source badge in both places, because the
   * provenance does not change with the page it is rendered on: the periods,
   * roles and stacks are human-declared and corroborated on the public
   * LinkedIn profile, not derived from a repository.
   */
  career: {
    /** Eyebrow above the home section. */
    eyebrow: string;
    /** Section heading on home and page title on `/career/`. */
    heading: string;
    /** Lead paragraph under the heading. */
    summary: string;
    /**
     * Availability chip rendered under the `h1` on `/career/` when
     * `profile.availability` is declared. `status` maps the enum to a label;
     * `asOf` prefixes the declaration date so the claim never reads timeless.
     */
    availability: {
      /** Screen-reader label introducing the chip. */
      label: string;
      /** Label for `status: "available"`. */
      available: string;
      /** Label for `status: "busy"`. */
      busy: string;
      /** Label for `status: "unavailable"`. */
      unavailable: string;
      /** Formats the declaration date, e.g. `asOf('2026-10-14')`. */
      asOf: (date: string) => string;
    };
    /** Heading above the full timeline on `/career/`. */
    timelineHeading: string;
    /** End label of an ongoing role, instead of a month. */
    present: string;
    /** Text of the source badge, which links to the public LinkedIn profile. */
    sourceLabel: string;
    /** Accessible name of the per-role stack chip list. */
    stackLabel: string;
    /** CTA from the compact home timeline to the full career page. */
    viewAll: string;
    /**
     * Label of the link to the printable HTML résumé shipped as a static file
     * (`web/public/resume-en.html` / `resume-es.html`), rendered on `/career/`.
     */
    resume: string;
    /**
     * Label of the prominent button that downloads the PDF résumé the build
     * prints from the `/print/` route (`scripts/generate-resume-pdf.mjs` →
     * `resume-en.pdf` / `resume-es.pdf`), rendered beside the HTML link.
     */
    resumePdf: string;
  };
  /**
   * Skill matrix (`data/skills.json`), rendered by
   * `components/SkillMatrix.astro` on `/career/` (full) and on the home page
   * (compact preview).
   *
   * The matrix is binary evidence: every row names the provenance behind it and
   * nothing else. There are deliberately no levels, percentages or ranks here,
   * so the copy may not imply a ranking either.
   */
  skills: {
    /** Section heading: the matrix and the skill section on the home page. */
    heading: string;
    /** Lead under the heading: what a badge is allowed to claim. */
    lead: string;
    /** Accessible name of the category filter bar on the full matrix. */
    filterLabel: string;
    /** The button that clears the category filter. */
    filterAll: string;
    /** Localized group heading per `data/skills.json` category. */
    categoryLabel: Record<SkillCategory, string>;
    /** Badge label and tooltip text for the three provenances. */
    badge: {
      /** Accessible name of the badge list of one skill row. */
      listLabel: (skill: string) => string;
      /** Accessible text of the employer badge, e.g. "3 employers". */
      companies: (count: number) => string;
      /** Tooltip of the employer badge, naming the employers. */
      companiesTitle: (names: string[]) => string;
      /** Accessible text of the project badge, e.g. "1 public project". */
      projects: (count: number) => string;
      /** Tooltip of the project badge, naming the projects. */
      projectsTitle: (names: string[]) => string;
      /** Visible label of the verified-career-fact badge. */
      facts: string;
      /** Tooltip of the verified-career-fact badge. */
      factsTitle: string;
    };
    /** "3 more" overflow note of the compact preview. */
    more: (count: number) => string;
    /** CTA from the compact home matrix to `/career/#skills`. */
    viewAll: string;
  };
  evidence: {
    eyebrow: string;
    heading: string;
    summary: string;
    /** One extra line under the page intro explaining how the list is built. */
    introNote: string;
    /** Heading above the grouped evidence list on the evidence page. */
    listHeading: string;
    count: (count: number) => string;
    empty: string;
    viewAll: string;
    statusLabel: Record<ClaimStatus, string>;
    statusHint: Record<ClaimStatus, string>;
  };
  /** Build-time GitHub activity feed (`components/ActivityFeed.astro`). */
  activity: {
    eyebrow: string;
    heading: string;
    /** Honesty note: the feed is a snapshot, not a live API call. */
    note: string;
    /** Honest empty state when the snapshot carries no records. */
    empty: string;
    /** Shown for a repository whose snapshot has no commit records. */
    noCommits: string;
    openPullRequests: (count: number) => string;
    latestRelease: (tag: string) => string;
  };
  contact: {
    eyebrow: string;
    heading: string;
    summary: string;
    formHeading: string;
    name: string;
    email: string;
    message: string;
    messageHint: string;
    submit: string;
    privacy: string;
    honeypot: string;
    fallbackHeading: string;
    fallbackNote: string;
    mailtoCta: string;
    emailLabel: string;
    /** Client-side validation messages for the POST branch. */
    fieldRequired: string;
    invalidEmail: string;
    /** POST branch: status reported by the in-page fetch submission. */
    submitPending: string;
    submitSuccess: string;
    submitError: string;
    /** Email subject / sender name the endpoint receives. */
    submitSubject: string;
    submitFrom: string;
    /** Fallback branch: compose an email with a prefilled subject and body. */
    suggestionLabel: string;
    suggestionHint: string;
    suggestionSubject: string;
    suggestionCta: string;
  };
  /**
   * Copy-to-clipboard controls (`lib/clipboard.ts`): one label per button and
   * the two outcomes announced through the `aria-live` region beside it. The
   * strings are rendered into `data-copy-*` attributes at build time, so they
   * exist in exactly one place: this catalog.
   */
  clipboard: {
    /** Accessible name of the copy-address button in the contact section. */
    email: string;
    /** Feedback after the published address reached the clipboard. */
    emailCopied: string;
    /** Accessible name of the copy-page-link button on a case study. */
    link: string;
    /** Feedback after the canonical page URL reached the clipboard. */
    linkCopied: string;
    /**
     * Accessible name of the per-section copy-anchor button beside a case-study
     * heading (`components/CopyAnchor.astro`). The button is an icon, so this
     * string is the whole accessible name; the section it belongs to is the
     * heading it sits next to.
     */
    anchor: string;
    /** Feedback after the canonical URL plus section fragment reached the clipboard. */
    anchorCopied: string;
    /** Honest failure: the clipboard refused, so manual copying remains. */
    failed: string;
  };
  /**
   * Share row (`components/ShareRow.astro`): two plain-anchor share intents
   * (LinkedIn and X) whose only parameter is the canonical page URL, plus the
   * group that announces them as one unit. No third-party script is involved,
   * so these are just the labels a visitor reads; the copy-link control in the
   * same row keeps the `clipboard` strings above.
   */
  share: {
    /** Accessible name of the share action group. */
    group: string;
    /** Accessible name of the LinkedIn share-intent anchor. */
    linkedIn: string;
    /** Accessible name of the X share-intent anchor. */
    x: string;
  };
  suggestions: {
    eyebrow: string;
    heading: string;
    summary: string;
    cta: string;
    note: string;
  };
  /** Floating keyword-search assistant (`components/AssistantWidget.astro`). */
  assistant: {
    /** Accessible name of the floating open button. */
    open: string;
    /** Panel heading, referenced by the dialog's `aria-labelledby`. */
    title: string;
    /** Accessible name of the close button. */
    close: string;
    /** Honesty banner: what the assistant is, and what it is not. */
    banner: string;
    /** Live search mode, read from the generated build metadata (semantic). */
    modeSemantic: string;
    /** Live search mode, read from the generated build metadata (keyword-only). */
    modeKeyword: string;
    /** Search input placeholder. */
    placeholder: string;
    /** Submit button label. */
    submit: string;
    /** Heading above the suggested-question chips. */
    suggestedHeading: string;
    /**
     * The four suggested questions. Each chip carries a fixed English keyword
     * query (the canonical data is English, so a translated query could not
     * match it); the label here is what the visitor reads, in their language.
     */
    chips: { built: string; ai: string; contact: string; contrast: string };
    /** Label above the result list once a search has run. */
    results: string;
    /** No-match explanation: nothing was found, and where to go instead. */
    fallback: string;
    /** Fallback link that composes an email with the question as the body. */
    askByEmail: string;
    /** Subject line of the prefilled `mailto:` compose. */
    emailSubject: string;
    /**
     * Label of the page-level "ask about this page" button
     * (`components/AskAboutPage.astro`). It opens the floating assistant with a
     * query seeded from the page; the widget then runs its own search, so the
     * label promises no answer of its own.
     */
    askPage: string;
  };
  /** Command palette (`components/CommandPalette.astro`). */
  palette: {
    /** Accessible name of the header trigger button. */
    open: string;
    /** Dialog heading, referenced by the dialog's `aria-labelledby`. */
    title: string;
    /** Accessible name of the close button. */
    close: string;
    /** Search input placeholder. */
    placeholder: string;
    /** Footer keyboard hint line. */
    hint: string;
    /** Honest empty state when the filter matches nothing. */
    empty: string;
    /** Nav item label for the locale home. */
    home: string;
    /** Nav item label for the printable profile. */
    print: string;
    /** Kind hint shown on the right of each option. */
    kind: { page: string; project: string; evidence: string };
  };
  /** Branded 404 page (`/404.html` and `/es/404.html`). */
  notFound: {
    eyebrow: string;
    heading: string;
    summary: string;
    home: string;
    work: string;
    evidence: string;
    /** Shown only when `?from=` is present, i.e. after a localized redirect. */
    returnedFrom: string;
  };
  /** Printable profile (`/print/` and `/es/print/`). */
  print: {
    eyebrow: string;
    /** Page `<title>` and the visible `h1`. */
    title: string;
    /** Honesty note: this is generated, not an approved CV document. */
    note: string;
    /** Label of the screen-only print button. */
    printButton: string;
    /** Source of the document, shown under the heading. */
    generatedNote: string;
    profileHeading: string;
    projectsHeading: string;
    evolutionHeading: string;
    /** Group heading for shipped + in-progress milestones. */
    shippedHeading: string;
    /** Group heading for planned milestones. */
    plannedHeading: string;
    evidenceHeading: string;
    contactHeading: string;
    repoLabel: string;
    emailLabel: string;
    githubLabel: string;
    linkedinLabel: string;
  };
  /**
   * Public boundary statements: what the portfolio explicitly does not assert.
   * The employer line is human-declared and corroborated on LinkedIn; the other
   * lines keep the original evidence-first boundaries.
   */
  boundaries: {
    /** Eyebrow above the boundary list (the legacy "The boundary" label). */
    eyebrow: string;
    /** Heading above the boundary list. */
    heading: string;
    /** One line per boundary, in display order. */
    items: string[];
  };
  footer: {
    tagline: string;
    sourceRepository: string;
    snapshotLabel: string;
    themeNote: string;
    buildNote: string;
    /** Link to the printable profile of the current locale. */
    printProfile: string;
    /** Link to the "how this site is built" page of the current locale. */
    buildPage: string;
  };
  /**
   * "How this site is built" page (`/build/`, `/es/build/`).
   *
   * The page explains the artifact itself — stack, deployment, the assistant's
   * honest limits and the published-data boundary — from copy only, so no claim
   * about the build can drift from what the build actually does. The official
   * links beside the credits are constants in the view, not copy: the targets
   * never change with the locale.
   */
  build: {
    eyebrow: string;
    /** Page `<title>` and the visible `h1`. */
    title: string;
    /** Lead paragraph under the heading. */
    summary: string;
    /** Heading of the stack section. */
    stackHeading: string;
    /** Static build facts, in display order (the analytics line is chosen separately). */
    stackItems: string[];
    /**
     * Stack line rendered when this build shipped the Cloudflare Web Analytics
     * beacon (task E4). `BuildNotes` picks this or `stackItemNoAnalytics` from
     * the generated build metadata, so the page states the analytics the build
     * actually has — never a claim either way that the build does not support.
     */
    stackItemAnalytics: string;
    /** Stack line rendered when this build shipped no analytics. */
    stackItemNoAnalytics: string;
    /** Heading of the deployment section. */
    deployHeading: string;
    /** One line under `deployHeading`. */
    deployNote: string;
    /** Second line under `deployHeading`: the mirror's security-header boundary. */
    deployHeadersNote: string;
    /** Heading of the assistant honesty section. */
    assistantHeading: string;
    /** One line under `assistantHeading`. */
    assistantNote: string;
    /**
     * Honest statement of the live search mode when the build shipped semantic
     * vectors. `BuildNotes` picks this or `searchModeKeyword` from the generated
     * build metadata, so the page can never claim the wrong mode.
     */
    searchModeSemantic: string;
    /** Honest statement of the live search mode when the build is keyword-only. */
    searchModeKeyword: string;
    /** Heading of the agent-readiness section. */
    agentHeading: string;
    /** One line under `agentHeading` (claims cross-checked against the E3/C4 audits). */
    agentNote: string;
    /** Heading of the source section. */
    sourceHeading: string;
    /** One line under `sourceHeading`. */
    sourceNote: string;
    /** Label of the public repository link. */
    repoLabel: string;
    /** Label of the RSS feed link. */
    rssLabel: string;
    /** Heading of the published-data boundary section. */
    boundaryHeading: string;
    /** One line under `boundaryHeading` (the T20 boundary wording). */
    boundaryNote: string;
    /** Plain credits line; the official links are rendered beside it. */
    credits: string;
  };
  /**
   * Guestbook (`views/Guestbook.astro`, `/guestbook/` and `/es/guestbook/`).
   *
   * Deliberately tiny: an honest intro plus the shared comment system, which
   * carries the whole moderation/privacy contract on its own. There is no
   * guestbook-specific data, form or storage — the page id is just another
   * route enabled in `config/comments.json`, so nothing here can promise more
   * than the comment system actually does.
   */
  guestbook: {
    /** Eyebrow above the intro, same position as every other page. */
    eyebrow: string;
    /** Page `<title>` and the visible `h1`. */
    title: string;
    /** Lead paragraph under the heading: what this page is and is not. */
    summary: string;
  };
  /**
   * Comments (`components/Comments.astro`, spec 9).
   *
   * Enabled per route by `config/comments.json`; the copy carries the whole
   * honesty contract — no account, no cookies, AI screening plus human review,
   * machine translation is labelled, and the GDPR removal path. The client
   * reads most of these through `data-*` attributes on the section, so a
   * translated string can never drift from the rendered markup.
   */
  comments: {
    eyebrow: string;
    heading: string;
    summary: string;
    /** The moderation/privacy/GDPR contract, stated in full. */
    notice: string;
    formHeading: string;
    nameLabel: string;
    nameHint: string;
    bodyLabel: string;
    bodyHint: string;
    langLabel: string;
    langHint: string;
    langEn: string;
    langEs: string;
    langOther: string;
    honeypot: string;
    submit: string;
    submitting: string;
    privacy: string;
    listHeading: string;
    empty: string;
    anonymous: string;
    report: string;
    pendingBadge: string;
    /** `Translated from {language}` — the language name is passed in. */
    translatedFrom: (language: string) => string;
    viewOriginal: string;
    viewTranslation: string;
    translationUnavailable: string;
    translationPaused: string;
    unavailableHeading: string;
    unavailableNote: string;
    turnstileBlocked: string;
    noJsHeading: string;
    noJsNote: string;
    noJsCta: string;
    /** Presence, best-effort: `~{n} viewing now`. The `{n}` token is filled client-side. */
    presenceTemplate: string;
    /** Shown while the realtime socket is reconnecting after a drop or a deploy. */
    reconnecting: string;
    /** Polite live-region announcement when a comment arrives over the socket. */
    newComment: string;
    statusPosted: string;
    statusQueued: string;
    statusRateLimited: string;
    statusInvalidBody: string;
    statusInvalidToken: string;
    statusLoadError: string;
    statusReported: string;
    statusReportError: string;
    statusUnavailable: string;
  };
}

export const en: Copy = {
  meta: {
    title: 'Cristian Cardona — Professional Evolution',
    description:
      "Cristian Cardona's evidence-backed professional evolution from Full Stack and Cloud toward AI Engineering, AI Automation and Agentic Systems. Every capability claim points at an inspectable artifact.",
    languageName: 'English',
  },
  a11y: {
    skipToContent: 'Skip to main content',
    primaryNav: 'Primary',
    externalLink: 'External link',
    opensInNewTab: 'opens in a new tab',
    required: 'required',
    onThisPage: 'On this page',
  },
  nav: {
    work: 'Work',
    career: 'Career',
    evolution: 'Evolution',
    evidence: 'Evidence',
    contact: 'Contact',
    menuLabel: 'Menu',
  },
  theme: {
    label: 'Theme',
    toggle: 'Switch colour theme',
    dark: 'Dark theme',
    light: 'Light theme',
  },
  lang: {
    label: 'Language',
    current: 'Current language',
    switchToEn: 'Read this page in English',
    switchToEs: 'Leer esta página en español',
  },
  hero: {
    eyebrow: 'Evidence before confidence',
    oneLiner:
      'A deliberately honest portfolio: work that is demonstrated, capabilities that are still developing, and the direction being built next.',
    principle:
      'Evidence before confidence. Direction is labelled as direction, and a prototype is never presented as a production system.',
    ctaWork: 'Explore the work',
    ctaEvidence: 'Inspect the evidence',
    github: 'GitHub',
    linkedin: 'LinkedIn',
  },
  metrics: {
    heading: 'Verified metrics',
    companies: (count, since) => `${count} companies since ${since}`,
    projects: (count) =>
      count === 1 ? '1 project page published' : `${count} project pages published`,
    milestones: (count) => (count === 1 ? '1 tracked milestone' : `${count} tracked milestones`),
    locales: 'EN + ES',
  },
  notes: {
    eyebrow: 'Notes',
    heading: 'Recent notes.',
    summary:
      'The most recent hand-written milestones, newest first. Unreviewed git-derived candidates are not listed here; they stay on the full timeline, labelled as candidates.',
    allNotes: 'All notes',
    rss: 'Subscribe via RSS',
  },
  work: {
    eyebrow: 'Selected work',
    heading: 'Projects with their limits visible.',
    summary:
      'A prototype can be useful without being production-ready. Planned work stays labelled as planned until there is something public to inspect.',
    viewAll: 'View all projects',
    repo: 'Repository',
    caseStudy: 'Case study',
    related: 'Related work',
    relatedEmpty: 'No related entries in the dataset yet.',
    screenshotPlaceholder: 'No screenshot published for this project yet.',
    screenshotAlt: {
      'site-career.png': 'Screenshot of the career and skills page',
    },
    screenshotAltFallback: (name) => `Screenshot of ${name}`,
    filterLabel: 'Filter projects by tag',
    filterAll: 'All',
  },
  caseStudy: {
    eyebrow: 'Case study',
    back: 'Back to all projects',
    disclosure: 'Read technical details',
    empty:
      'No case study is published for this project yet. The repository below is the artifact you can inspect; no write-up is invented where none exists.',
    ctaHeading: 'Questions about this work?',
    ctaContact: 'Ask about this work',
  },
  projectStatus: {
    label: {
      live: 'Live',
      mvp: 'MVP',
      demo: 'Demo',
      prototype: 'Prototype',
      lab: 'Lab / planned',
    },
    hint: {
      live: 'Published and reachable now; the links and artifacts on this page resolve.',
      mvp: 'Minimum viable product: something usable exists, with the limits documented.',
      demo: 'Demonstration build. It does not imply availability or production use.',
      prototype:
        'Prototype: a public reproduction covered by tests, with no production system behind it.',
      lab: 'Lab or planned work. Not built and not deployed as a product.',
    },
  },
  evolution: {
    eyebrow: 'Evolution',
    heading: 'Where this comes from, and where it is going.',
    summary:
      'The trajectory is inspectable: each milestone links to the commits and artifacts behind it, and unreviewed git-derived entries are labelled as candidates.',
    viewAll: 'View the full timeline',
    previewNote: 'Showing the most recent entries only.',
    shipped: 'Shipped',
    inProgress: 'In progress',
    planned: 'Planned',
    sourceLabel: {
      curated: 'Curated',
      git: 'Derived from git',
      snapshot: 'Snapshot',
    },
    sourcesNote: 'How to read the source badge',
    sourceHint: {
      curated: 'Written by hand and reviewed before it is published.',
      git: 'Generated from the commit history and not yet reviewed: treat it as a candidate, not curated history.',
      snapshot:
        'Read from the public snapshot when the site builds; the next build picks up any change.',
    },
    timelineHeading: 'Full timeline',
    evidenceLinks: (count) => (count === 1 ? '1 evidence link' : `${count} evidence links`),
    completedHeading: 'Completed & ongoing',
    completedNote:
      'Work that is published or in flight. Every entry links to the commits and artifacts behind it.',
    directionAheadHeading: 'Direction ahead',
    directionAheadNote:
      'Not achievements. These entries record intent only: no artifact exists yet, and the links point at what would be extended.',
    relatedLabel: 'Related',
    curatedPreviewNote:
      'Showing the most recent hand-written milestones, delivered work first; unreviewed git candidates are on the full timeline.',
    roadmapHeading: 'Roadmap by phase',
    roadmapNote:
      'Derived from the milestones themselves: each phase lists the focus it covered and the projects that supported it. Phases describe what happened; only "Direction ahead" describes what is intended.',
    roadmapProjectsLabel: 'Supporting projects',
    roadmapNoProjects:
      'No milestone in this phase links a project, so no supporting project is listed.',
    phaseLabel: {
      foundation: 'Foundation',
      transition: 'Transition',
      frontier: 'Direction ahead',
    },
    phaseFocus: {
      foundation:
        'Making the evidence contract real: a published snapshot, bilingual locales, and an explicit boundary statement for every public reproduction.',
      transition:
        'Rebuilding on Astro over a validated data layer, keeping the legacy site live until the cutover gate passes.',
      frontier:
        'Intended, not started. Each row points at the repositories the next work would extend; none of it is built yet.',
    },
    roadmapMilestones: (count) => (count === 1 ? '1 milestone' : `${count} milestones`),
    roadmapTable: {
      heading: 'Roadmap: goal, skill, proof',
      note:
        'One row per declared goal: the skills it exercises and the artifacts that prove it. A planned row is an intention, not a result — its proofs name the work it would extend, and no artifact exists until it ships.',
      goalLabel: 'Goal',
      skillsLabel: 'Skills',
      proofLabel: 'Proof',
      proofProject: 'Project',
      proofEvolution: 'Milestone',
      noProofs: 'Proof: planned — none published',
      viewAll: 'View the roadmap',
    },
  },
  career: {
    eyebrow: 'Career',
    heading: 'Where the work happened, and on what.',
    summary:
      'Five employers, human-declared (verified facts, 2026-10-08) and corroborated on the public LinkedIn profile. Periods, roles and stacks are reproduced as declared; nothing here is inferred from a repository.',
    availability: {
      label: 'Availability',
      available: 'Open to conversations',
      busy: 'Currently booked',
      unavailable: 'Not looking right now',
      asOf: (date: string) => `As of ${date}`,
    },
    timelineHeading: 'Employer history',
    present: 'Present',
    sourceLabel: 'Human-declared · corroborated on LinkedIn',
    stackLabel: 'Declared stack',
    viewAll: 'View the full career',
    resume: 'Download the résumé (HTML)',
    resumePdf: 'Download the resume (PDF)',
  },
  skills: {
    heading: 'Skills, and what stands behind each one.',
    lead: 'Every skill names where it was used: the employers that declared it, the public repositories where it can be inspected, or the verified career facts. No levels, no percentages, no ranking — only the evidence that exists.',
    filterLabel: 'Filter skills by category',
    filterAll: 'All',
    categoryLabel: {
      languages: 'Languages',
      frontend: 'Frontend',
      backend: 'Backend',
      cloud: 'Cloud',
      data: 'Data',
      ai: 'AI',
      devops: 'DevOps',
    },
    badge: {
      listLabel: (skill) => `Evidence behind ${skill}`,
      companies: (count) => (count === 1 ? '1 employer' : `${count} employers`),
      companiesTitle: (names) => `Declared at ${names.join(', ')}`,
      projects: (count) => (count === 1 ? '1 public project' : `${count} public projects`),
      projectsTitle: (names) => `Inspectable in ${names.join(', ')}`,
      facts: 'Verified career fact',
      factsTitle:
        'Declared in the verified career facts (2026-10-08). There is no public artifact behind it, so this badge is not a link.',
    },
    more: (count) => (count === 1 ? '1 more' : `${count} more`),
    viewAll: 'View all skills',
  },
  evidence: {
    eyebrow: 'Evidence',
    heading: 'Evidence, not a skill score.',
    summary:
      'Every statement carries a status. A missing public proof is shown as a gap instead of being filled with marketing language.',
    introNote:
      'The list below is generated from the public snapshot at build time. Items are grouped by the status of the claim they support, and nothing appears here without a public link.',
    listHeading: 'Published evidence',
    count: (count) => (count === 1 ? '1 linked evidence item' : `${count} linked evidence items`),
    empty:
      'No evidence items are published yet. This section is populated from the public snapshot at build time, and an empty list is shown rather than invented claims.',
    viewAll: 'View all evidence',
    statusLabel: {
      demonstrated: 'Demonstrated',
      developing: 'Developing',
      aspirational: 'Aspirational',
      insufficient: 'Insufficient evidence',
    },
    statusHint: {
      demonstrated: 'Supported by at least one public, checkable artifact that a third party can open.',
      developing:
        'Partially built or prototype-level: no public artifact yet, or the available one does not cover the whole claim.',
      aspirational: 'Stated direction or intent. Not started, or started but not verifiable.',
      insufficient: 'No public artifact exists today that could support the claim.',
    },
  },
  activity: {
    eyebrow: 'Open source',
    heading: 'Public GitHub activity',
    note: 'Captured at build time; no live API calls from this site.',
    empty: 'Snapshot captured at build time; no activity recorded.',
    noCommits: 'No recent commits recorded for this repository.',
    openPullRequests: (count) =>
      count === 1 ? '1 open pull request' : `${count} open pull requests`,
    latestRelease: (tag) => `Latest release ${tag}`,
  },
  contact: {
    eyebrow: 'Contact',
    heading: 'Start from the evidence.',
    summary:
      'Ask about a repository, a claim or a boundary. Answers cover what is publicly inspectable, not what is intended.',
    formHeading: 'Send a message',
    name: 'Name',
    email: 'Email',
    message: 'Message',
    messageHint: 'Include the repository or the claim you want to inspect.',
    submit: 'Send message',
    privacy: 'Messages go straight to the inbox by email. Nothing is stored on this site.',
    honeypot: 'Leave this field empty',
    fallbackHeading: 'Direct form is still being built',
    fallbackNote:
      'No form endpoint is configured for this deployment, so this page does not collect messages yet. Writing by email reaches the same inbox.',
    mailtoCta: 'Write by email',
    emailLabel: 'Email address',
    fieldRequired: 'This field is required.',
    invalidEmail: 'Enter a valid email address.',
    suggestionLabel: 'Suggestion',
    suggestionHint:
      'Describe what to improve. This opens your email client with the subject and message already filled in.',
    suggestionSubject: 'Portfolio suggestion',
    suggestionCta: 'Compose email',
submitPending: 'Sending your message…',
submitSuccess: 'Message sent. Thanks for writing.',
submitError: 'Sending failed. Try again, or write to the address below.',
submitSubject: 'New message from your portfolio site',
submitFrom: 'Portfolio contact form',
  },
  clipboard: {
    email: 'Copy email address',
    emailCopied: 'Email address copied.',
    link: 'Copy link to this page',
    linkCopied: 'Page link copied.',
    anchor: 'Copy link to this section',
    anchorCopied: 'Section link copied.',
    failed: 'Could not copy automatically. Select the text and copy it manually.',
  },
  share: {
    group: 'Share this page',
    linkedIn: 'Share on LinkedIn',
    x: 'Share on X',
  },
  suggestions: {
    eyebrow: 'Suggestions',
    heading: 'Something missing? Say it in the open.',
    summary:
      'Suggestions are filed as public issues in the source repository, so the request and the response stay inspectable by anyone.',
    cta: 'Open a suggestion',
    note: 'Opens GitHub in a new tab.',
  },
  assistant: {
    open: 'Search this portfolio',
    title: 'Portfolio assistant',
    close: 'Close the assistant',
    banner:
      'This searches only what is published on this site — it is not an AI model, and it never sends your question anywhere. It can only point at what is already published here, and it says so when it finds nothing.',
    modeSemantic:
      'Live search: semantic. The site embedded its own index at build time and ranks results by similarity in your browser. Searching still makes no AI model call.',
    modeKeyword:
      'Live search: keyword-only. A plain keyword match over the published index; the build had no Cloudflare token to embed it, so it says so instead of pretending.',
    placeholder: 'Projects, evidence, milestones…',
    submit: 'Search',
    suggestedHeading: 'Suggested questions',
    chips: {
      built: 'What has Cristian built?',
      ai: 'What AI work is demonstrated?',
      contact: 'How can I contact Cristian?',
      contrast: 'What is aspirational vs demonstrated?',
    },
    results: 'Published entries that match',
    fallback:
      'No published entry matches those words. The pages below hold the same content, and a question by email is answered from what is public.',
    askByEmail: 'Ask by email',
    emailSubject: 'Question about the portfolio',
    askPage: 'Ask about this page',
  },
  palette: {
    open: 'Open the command palette',
    title: 'Command palette',
    close: 'Close the command palette',
    placeholder: 'Go to a page, project or evidence item…',
    hint: '↑↓ to move · Enter to open · Esc to close',
    empty: 'No destination matches that.',
    home: 'Home',
    print: 'Print profile',
    kind: { page: 'Page', project: 'Project', evidence: 'Evidence' },
  },
  notFound: {
    eyebrow: 'Not found',
    heading: 'Page not found',
    summary:
      'The address you requested is not published here. Nothing was moved without a record: the links below lead to the pages that do exist.',
    home: 'Go to the home page',
    work: 'See the work',
    evidence: 'Inspect the evidence',
    returnedFrom:
      'We could not find the address you requested, so we showed the not-found page in your language.',
  },
  print: {
    eyebrow: 'Generated view',
    title: 'Print profile',
    note: 'This is a generated view of the published data, not an approved CV document.',
    printButton: 'Print / Save as PDF',
    generatedNote: 'Generated from the published data at build time.',
    profileHeading: 'Profile',
    projectsHeading: 'Selected projects',
    evolutionHeading: 'Evolution',
    shippedHeading: 'Shipped & in progress',
    plannedHeading: 'Planned',
    evidenceHeading: 'Evidence links',
    contactHeading: 'Contact',
    repoLabel: 'Repository',
    emailLabel: 'Email',
    githubLabel: 'GitHub',
    linkedinLabel: 'LinkedIn',
  },
  boundaries: {
    eyebrow: 'The boundary',
    heading: 'What this portfolio will not pretend to know.',
    items: [
      'No production RAG claim is made.',
      'Employer history is human-declared (source: verified facts, 2026-10-08) and corroborated on the public LinkedIn profile; no client names, compensation or contract details are published.',
      'No arbitrary progress percentages or years-of-experience figures are used.',
      'Historical LinkedIn-sync material is context, not the source of truth.',
    ],
  },
  footer: {
    tagline: 'Evidence before confidence.',
    sourceRepository: 'Source repository',
    snapshotLabel: 'Snapshot',
    themeNote: 'The theme is stored in your own browser; no server controls it.',
    buildNote: 'Static site built with Astro. Scripts and tracking are disclosed on the build page.',
    printProfile: 'Print profile',
    buildPage: 'How this site is built',
  },
  build: {
    eyebrow: 'How this site is built',
    title: 'How this site is built',
    summary:
      'The site is an artifact in its own right: what it is built with, how it is deployed, and what it deliberately leaves out.',
    stackHeading: 'Static, data-driven, bilingual',
    stackItems: [
      'A static site built with Astro 5: every page is pre-rendered at build time, with no server runtime.',
      'Data-driven: pages render from a reviewed JSON layer under data/, so a change to the data is a change to the site.',
      'Bilingual EN/ES: both locales render the same structure from one shared source.',
    ],
    stackItemAnalytics:
      'Privacy-first analytics: a Cloudflare Web Analytics beacon with no cookies and no cross-site tracking. It is the only third-party script on every page load (the comment form loads a Cloudflare Turnstile widget only where comments appear), and the theme choice stays in your browser.',
    stackItemNoAnalytics:
      'No client-side analytics; the only third-party scripts are those the comment forms load (Cloudflare Turnstile) where comments exist, and the theme choice stays in your browser.',
    deployHeading: 'Deployment',
    deployNote:
      'Every push to main is built and published automatically by GitHub Actions. GitHub Pages is the canonical host; a Cloudflare Workers mirror serves the same static build.',
    deployHeadersNote:
      'As of 2026-10-12 the Workers mirror also serves security headers — X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-Frame-Options: DENY, Permissions-Policy: camera=(), microphone=(), geolocation=() and Strict-Transport-Security — and Cache-Control: public, max-age=31536000, immutable for the hashed assets under /_astro/. The mechanism is a _headers file in the build output. The canonical GitHub Pages host is a project site and cannot set response headers, so it serves the same pages without them.',
    assistantHeading: 'The assistant is a search, not an AI',
    assistantNote:
      'The floating assistant searches only the public data published on this site. It is not an AI model and makes no API call: it can only point at what is already published here, and it says so when it finds nothing.',
    searchModeSemantic:
      'This build shipped a semantic search index: the assistant’s own index was embedded at build time with the Workers AI model @cf/baai/bge-m3, and a search ranks the published entries by similarity in your browser. No AI model is called when you search.',
    searchModeKeyword:
      'This build shipped no search vectors, so the assistant runs its keyword search only. Embedding the index needs a Cloudflare token at build time; this page reports the mode the build actually has instead of claiming the other one.',
    agentHeading: 'Readable by AI agents',
    agentNote:
      'As of 2026-10-12 the site publishes an llms.txt file and annotates two forms with WebMCP: its contact form (contact_message) and the assistant’s search box (site_search), so an agent can find the site and identify both actions as tools. The search tool is honest about what it is: a client-side search of the index already embedded in the page and, when the build shipped semantic vectors, one same-origin static JSON file — no backend and no AI model or API call at query time. A Lighthouse 13.5.0 run of the agentic-browsing category in Chrome 154 registered both tools with valid schemas, passed the accessibility-tree audit, reported no form missing annotations and measured a cumulative layout shift of 0. The llms.txt audit checks the domain root: it passes on the Cloudflare mirror, which serves the build at /, and is not applicable to the GitHub Pages path, which serves it under /professional-evolution-portfolio/.',
    sourceHeading: 'Source',
    sourceNote:
      'The site and its data layer are public. The repository below is the artifact you can inspect; nothing is published from a private source.',
    repoLabel: 'View the source repository',
    rssLabel: 'Subscribe to the RSS feed',
    boundaryHeading: 'What is not published',
    boundaryNote:
      'Only public, human-declared career facts are published; no client names, compensation or private operational data. No private data is published on this site.',
    credits: 'Built with Astro, hosted on GitHub Pages + Cloudflare Workers.',
  },
  guestbook: {
    eyebrow: 'Guestbook',
    title: 'Guestbook',
    summary:
      'Leave a short, honest note about what you found here. It is the same comment system the other pages use — no account, no cookies, an optional display name — and every note is reviewed before it appears.',
  },
  comments: {
    eyebrow: 'Comments',
    heading: 'Join the conversation',
    summary:
      'Comments are open on this page. No account, no cookies and no email address — a display name is optional.',
    notice:
      'How this works: an AI model screens every comment before it appears, and anything it is unsure about goes to a human review queue, so nothing is published unreviewed. Comments are anonymous — your IP address is used only for a temporary rate limit and is never stored. To have a comment removed, write to me through the contact form (GDPR).',
    formHeading: 'Leave a comment',
    nameLabel: 'Name (optional)',
    nameHint: 'Shown next to your comment. Leave it empty to stay anonymous.',
    bodyLabel: 'Comment',
    bodyHint: 'Plain text, up to 2000 characters.',
    langLabel: 'Comment language',
    langHint: 'Used to translate your comment for readers of this page.',
    langEn: 'English',
    langEs: 'Spanish',
    langOther: 'Another language',
    honeypot: 'Leave this field empty',
    submit: 'Post comment',
    submitting: 'Posting…',
    privacy:
      'No account, no cookies, no email collection. Your comment is public once it passes review, and you can ask for its removal at any time.',
    listHeading: 'Comments',
    empty: 'No comments yet. Be the first.',
    anonymous: 'Anonymous',
    report: 'Report',
    pendingBadge: 'In review',
    translatedFrom: (language) => `Translated from ${language}`,
    viewOriginal: 'View original',
    viewTranslation: 'View translation',
    translationUnavailable: 'Translation not available.',
    translationPaused:
      'Automatic translation is paused for today; comments in other languages are held for human review.',
    unavailableHeading: 'Comments are temporarily unavailable.',
    unavailableNote:
      'The comment service is not configured on this deployment, so the form stays disabled — nothing typed here would be sent.',
    turnstileBlocked:
      'The verification widget could not load, so the form stays disabled. Please try again later or use the contact form.',
    noJsHeading: 'JavaScript is off',
    noJsNote:
      'The comment form needs JavaScript for spam verification. You can still write to me directly:',
    noJsCta: 'Send an email instead',
    presenceTemplate: '~{n} viewing now',
    reconnecting: 'Reconnecting…',
    newComment: 'A new comment arrived.',
    statusPosted: 'Comment published.',
    statusQueued: 'Thanks — your comment was received and is waiting for review.',
    statusRateLimited: 'Too many comments in a short time. Please try again in an hour.',
    statusInvalidBody: 'Write between 1 and 2000 characters.',
    statusInvalidToken: 'Verification failed. Reload the page and try again.',
    statusLoadError: 'Something went wrong. Please try again.',
    statusReported: 'Reported. Thank you.',
    statusReportError: 'Could not send the report. Please try again.',
    statusUnavailable: 'Comments are temporarily unavailable.',
  },
};

export const es: Copy = {
  meta: {
    title: 'Cristian Cardona — Evolución Profesional',
    description:
      'Evolución profesional de Cristian Cardona respaldada por evidencia: de Full Stack y Cloud hacia Ingeniería de IA, Automatización de IA y Sistemas Agénticos. Cada afirmación apunta a un artefacto inspeccionable.',
    languageName: 'Español',
  },
  a11y: {
    skipToContent: 'Saltar al contenido principal',
    primaryNav: 'Principal',
    externalLink: 'Enlace externo',
    opensInNewTab: 'se abre en una pestaña nueva',
    required: 'obligatorio',
    onThisPage: 'En esta página',
  },
  nav: {
    work: 'Trabajo',
    career: 'Trayectoria',
    evolution: 'Evolución',
    evidence: 'Evidencia',
    contact: 'Contacto',
    menuLabel: 'Menú',
  },
  theme: {
    label: 'Tema',
    toggle: 'Cambiar el tema de color',
    dark: 'Tema oscuro',
    light: 'Tema claro',
  },
  lang: {
    label: 'Idioma',
    current: 'Idioma actual',
    switchToEn: 'Read this page in English',
    switchToEs: 'Leer esta página en español',
  },
  hero: {
    eyebrow: 'Evidencia antes que confianza',
    oneLiner:
      'Un portafolio deliberadamente honesto: trabajo demostrado, capacidades todavía en desarrollo y la dirección que se está construyendo.',
    principle:
      'Evidencia antes que confianza. La dirección se etiqueta como dirección, y un prototipo nunca se presenta como un sistema en producción.',
    ctaWork: 'Explorar el trabajo',
    ctaEvidence: 'Inspeccionar la evidencia',
    github: 'GitHub',
    linkedin: 'LinkedIn',
  },
  metrics: {
    heading: 'Cifras verificadas',
    companies: (count, since) => `${count} empresas desde ${since}`,
    projects: (count) =>
      count === 1 ? '1 página de proyecto documentado' : `${count} páginas de proyectos documentados`,
    milestones: (count) => (count === 1 ? '1 hito registrado' : `${count} hitos registrados`),
    locales: 'EN + ES',
  },
  notes: {
    eyebrow: 'Notas',
    heading: 'Notas recientes.',
    summary:
      'Los hitos escritos a mano más recientes, del más nuevo al más antiguo. Los candidatos derivados de git sin revisar no se listan aquí; permanecen en la línea de tiempo completa, etiquetados como candidatos.',
    allNotes: 'Todas las notas',
    rss: 'Suscribirse por RSS',
  },
  work: {
    eyebrow: 'Trabajo seleccionado',
    heading: 'Proyectos con sus límites a la vista.',
    summary:
      'Un prototipo puede ser útil sin estar listo para producción. El trabajo planificado sigue etiquetado como planificado hasta que exista algo público que inspeccionar.',
    viewAll: 'Ver todos los proyectos',
    repo: 'Repositorio',
    caseStudy: 'Estudio de caso',
    related: 'Trabajo relacionado',
    relatedEmpty: 'Todavía no hay entradas relacionadas en el conjunto de datos.',
    screenshotPlaceholder: 'Todavía no hay capturas publicadas para este proyecto.',
    screenshotAlt: {
      'site-career.png': 'Captura de pantalla de la página de trayectoria y habilidades',
    },
    screenshotAltFallback: (name) => `Captura de pantalla de ${name}`,
    filterLabel: 'Filtrar proyectos por etiqueta',
    filterAll: 'Todos',
  },
  caseStudy: {
    eyebrow: 'Estudio de caso',
    back: 'Volver a todos los proyectos',
    disclosure: 'Leer detalles técnicos',
    empty:
      'Todavía no hay un estudio de caso publicado para este proyecto. El repositorio de abajo es el artefacto que puedes inspeccionar; no se inventa un resumen donde no lo hay.',
    ctaHeading: '¿Preguntas sobre este trabajo?',
    ctaContact: 'Preguntar sobre este trabajo',
  },
  projectStatus: {
    label: {
      live: 'En vivo',
      mvp: 'MVP',
      demo: 'Demo',
      prototype: 'Prototipo',
      lab: 'Laboratorio / planificado',
    },
    hint: {
      live: 'Publicado y accesible ahora; los enlaces y artefactos de esta página se resuelven.',
      mvp: 'Producto mínimo viable: existe algo utilizable, con los límites documentados.',
      demo: 'Versión de demostración. No implica disponibilidad ni uso en producción.',
      prototype:
        'Prototipo: una reproducción pública cubierta por pruebas, sin ningún sistema en producción detrás.',
      lab: 'Trabajo de laboratorio o planificado. No está construido ni desplegado como producto.',
    },
  },
  evolution: {
    eyebrow: 'Evolución',
    heading: 'De dónde viene esto y hacia dónde va.',
    summary:
      'La trayectoria es inspeccionable: cada hito enlaza con los commits y artefactos que lo respaldan, y las entradas derivadas de git sin revisar se etiquetan como candidatas.',
    viewAll: 'Ver la línea de tiempo completa',
    previewNote: 'Se muestran solo las entradas más recientes.',
    shipped: 'Entregado',
    inProgress: 'En curso',
    planned: 'Planificado',
    sourceLabel: {
      curated: 'Curado',
      git: 'Derivado de git',
      snapshot: 'Instantánea',
    },
    sourcesNote: 'Cómo leer la insignia de origen',
    sourceHint: {
      curated: 'Escrito a mano y revisado antes de publicarse.',
      git: 'Generado a partir del historial de commits y todavía sin revisar: se trata de un candidato, no de historia curada.',
      snapshot:
        'Leído de la instantánea pública cuando se construye el sitio; la siguiente compilación recoge cualquier cambio.',
    },
    timelineHeading: 'Línea de tiempo completa',
    evidenceLinks: (count) =>
      count === 1 ? '1 enlace de evidencia' : `${count} enlaces de evidencia`,
    completedHeading: 'Completado y en curso',
    completedNote:
      'Trabajo publicado o en marcha. Cada entrada enlaza con los commits y artefactos que lo respaldan.',
    directionAheadHeading: 'Dirección por delante',
    directionAheadNote:
      'No son logros. Estas entradas solo registran intención: todavía no existe ningún artefacto y los enlaces apuntan a lo que se ampliaría.',
    relatedLabel: 'Relacionado',
    curatedPreviewNote:
      'Se muestran los hitos escritos a mano más recientes, con lo entregado primero; los candidatos de git sin revisar están en la línea de tiempo completa.',
    roadmapHeading: 'Hoja de ruta por fase',
    roadmapNote:
      'Derivada de los propios hitos: cada fase muestra el foco que cubrió y los proyectos que lo respaldaron. Las fases describen lo que ocurrió; solo «Dirección por delante» describe lo que se pretende.',
    roadmapProjectsLabel: 'Proyectos de apoyo',
    roadmapNoProjects:
      'Ningún hito de esta fase enlaza un proyecto, así que no se lista ninguno.',
    phaseLabel: {
      foundation: 'Fundación',
      transition: 'Transición',
      frontier: 'Dirección por delante',
    },
    phaseFocus: {
      foundation:
        'Hacer real el contrato de evidencia: una instantánea publicada, dos locales revisados y una declaración de límites explícita para cada reproducción pública.',
      transition:
        'Reconstruir sobre Astro con una capa de datos validada, manteniendo el sitio anterior en línea hasta que la puerta de corte se supere.',
      frontier:
        'Intencionado, no iniciado. Cada fila apunta a los repositorios que el próximo trabajo ampliaría; nada de eso está construido todavía.',
    },
    roadmapMilestones: (count) => (count === 1 ? '1 hito' : `${count} hitos`),
    roadmapTable: {
      heading: 'Hoja de ruta: objetivo, habilidad, prueba',
      note:
        'Una fila por cada objetivo declarado: las habilidades que ejerce y los artefactos que lo prueban. Una fila planificada es una intención, no un resultado: sus pruebas nombran el trabajo que ampliaría, y ningún artefacto existe hasta que se entregue.',
      goalLabel: 'Objetivo',
      skillsLabel: 'Habilidades',
      proofLabel: 'Prueba',
      proofProject: 'Proyecto',
      proofEvolution: 'Hito',
      noProofs: 'Prueba: prevista — nada publicado todavía',
      viewAll: 'Ver la hoja de ruta',
    },
  },
  career: {
    eyebrow: 'Trayectoria',
    heading: 'Dónde ocurrió el trabajo, y sobre qué.',
    summary:
      'Cinco empleadores, declarados por la persona (datos verificados, 2026-10-08) y corroborados en el perfil público de LinkedIn. Los periodos, roles y stacks se reproducen tal como se declararon; nada aquí se infiere de un repositorio.',
    availability: {
      label: 'Disponibilidad',
      available: 'Abierto a conversaciones',
      busy: 'Con agenda completa',
      unavailable: 'Ahora mismo no busco',
      asOf: (date: string) => `A fecha de ${date}`,
    },
    timelineHeading: 'Historial de empleadores',
    present: 'Actualidad',
    sourceLabel: 'Declarado por la persona · corroborado en LinkedIn',
    stackLabel: 'Stack declarado',
    viewAll: 'Ver la trayectoria completa',
    resume: 'Descargar el currículum (HTML)',
    resumePdf: 'Descargar el currículum (PDF)',
  },
  skills: {
    heading: 'Habilidades, y qué respalda cada una.',
    lead: 'Cada habilidad indica dónde se usó: los empleadores que la declararon, los repositorios públicos donde se puede inspeccionar, o los datos verificados de la trayectoria. Sin niveles, sin porcentajes, sin rankings: solo la evidencia que existe.',
    filterLabel: 'Filtrar habilidades por categoría',
    filterAll: 'Todas',
    categoryLabel: {
      languages: 'Lenguajes',
      frontend: 'Frontend',
      backend: 'Backend',
      cloud: 'Cloud',
      data: 'Datos',
      ai: 'IA',
      devops: 'DevOps',
    },
    badge: {
      listLabel: (skill) => `Evidencia detrás de ${skill}`,
      companies: (count) => (count === 1 ? '1 empleador' : `${count} empleadores`),
      companiesTitle: (names) => `Declarado en ${names.join(', ')}`,
      projects: (count) => (count === 1 ? '1 proyecto público' : `${count} proyectos públicos`),
      projectsTitle: (names) => `Inspeccionable en ${names.join(', ')}`,
      facts: 'Dato verificado',
      factsTitle:
        'Declarado en los datos verificados de la trayectoria (2026-10-08). No hay ningún artefacto público detrás, así que esta insignia no es un enlace.',
    },
    more: (count) => (count === 1 ? '1 más' : `${count} más`),
    viewAll: 'Ver todas las habilidades',
  },
  evidence: {
    eyebrow: 'Evidencia',
    heading: 'Evidencia, no una puntuación de habilidades.',
    summary:
      'Cada afirmación lleva un estado. La falta de prueba pública se muestra como una laguna en lugar de rellenarse con lenguaje de marketing.',
    introNote:
      'La lista siguiente se genera desde la instantánea pública en tiempo de compilación. Las entradas se agrupan por el estado de la afirmación que respaldan, y nada aparece aquí sin un enlace público.',
    listHeading: 'Evidencia publicada',
    count: (count) =>
      count === 1 ? '1 elemento de evidencia enlazado' : `${count} elementos de evidencia enlazados`,
    empty:
      'Todavía no hay elementos de evidencia publicados. Esta sección se completa desde la instantánea pública en tiempo de compilación, y se muestra una lista vacía en lugar de afirmaciones inventadas.',
    viewAll: 'Ver toda la evidencia',
    statusLabel: {
      demonstrated: 'Demostrado',
      developing: 'En desarrollo',
      aspirational: 'Aspiracional',
      insufficient: 'Evidencia insuficiente',
    },
    statusHint: {
      demonstrated:
        'Respaldado por al menos un artefacto público y verificable que un tercero puede abrir.',
      developing:
        'Parcialmente construido o a nivel de prototipo: sin artefacto público todavía, o el disponible no cubre toda la afirmación.',
      aspirational: 'Dirección o intención declarada. No iniciado, o iniciado pero no verificable.',
      insufficient: 'Hoy no existe ningún artefacto público que pueda respaldar la afirmación.',
    },
  },
  activity: {
    eyebrow: 'Código abierto',
    heading: 'Actividad pública en GitHub',
    note: 'Capturada en tiempo de compilación; este sitio no hace llamadas a la API en vivo.',
    empty: 'Instantánea capturada en tiempo de compilación; no hay actividad registrada.',
    noCommits: 'No hay commits recientes registrados para este repositorio.',
    openPullRequests: (count) =>
      count === 1 ? '1 pull request abierto' : `${count} pull requests abiertos`,
    latestRelease: (tag) => `Última versión ${tag}`,
  },
  contact: {
    eyebrow: 'Contacto',
    heading: 'Empieza por la evidencia.',
    summary:
      'Pregunta por un repositorio, una afirmación o un límite. Las respuestas cubren lo que es públicamente inspeccionable, no lo que está previsto.',
    formHeading: 'Enviar un mensaje',
    name: 'Nombre',
    email: 'Correo electrónico',
    message: 'Mensaje',
    messageHint: 'Incluye el repositorio o la afirmación que quieres inspeccionar.',
    submit: 'Enviar mensaje',
    privacy: 'Los mensajes llegan directamente al buzón por correo. No se guarda nada en este sitio.',
    honeypot: 'Deja este campo vacío',
    fallbackHeading: 'El formulario directo aún está en construcción',
    fallbackNote:
      'Esta publicación no tiene configurado un endpoint de formulario, así que la página todavía no recoge mensajes. Escribir por correo llega al mismo buzón.',
    mailtoCta: 'Escribir por correo',
    emailLabel: 'Dirección de correo',
    fieldRequired: 'Este campo es obligatorio.',
    invalidEmail: 'Introduce una dirección de correo electrónico válida.',
    suggestionLabel: 'Sugerencia',
    suggestionHint:
      'Describe qué mejorar. Esto abre tu cliente de correo con el asunto y el mensaje ya rellenados.',
    suggestionSubject: 'Sugerencia para el portafolio',
    suggestionCta: 'Redactar correo',
submitPending: 'Enviando tu mensaje…',
submitSuccess: 'Mensaje enviado. Gracias por escribir.',
submitError: 'El envío falló. Inténtalo de nuevo o escribe a la dirección de abajo.',
submitSubject: 'Nuevo mensaje desde el sitio del portafolio',
submitFrom: 'Formulario de contacto del portafolio',
  },
  clipboard: {
    email: 'Copiar dirección de correo',
    emailCopied: 'Dirección de correo copiada.',
    link: 'Copiar enlace de esta página',
    linkCopied: 'Enlace de la página copiado.',
    anchor: 'Copiar enlace a esta sección',
    anchorCopied: 'Enlace de la sección copiado.',
    failed: 'No se ha podido copiar automáticamente. Selecciona el texto y cópialo manualmente.',
  },
  share: {
    group: 'Comparte esta página',
    linkedIn: 'Compartir en LinkedIn',
    x: 'Compartir en X',
  },
  suggestions: {
    eyebrow: 'Sugerencias',
    heading: '¿Falta algo? Dilo en abierto.',
    summary:
      'Las sugerencias se registran como incidencias públicas en el repositorio fuente, para que la petición y la respuesta queden inspeccionables por cualquiera.',
    cta: 'Abrir una sugerencia',
    note: 'Abre GitHub en una pestaña nueva.',
  },
  assistant: {
    open: 'Buscar en este portafolio',
    title: 'Asistente del portafolio',
    close: 'Cerrar el asistente',
    banner:
      'Esto busca solo lo que está publicado en este sitio: no es un modelo de IA y nunca envía tu pregunta a ningún sitio. Solo puede señalar lo que ya está publicado aquí, y lo dice cuando no encuentra nada.',
    modeSemantic:
      'Búsqueda activa: semántica. El sitio incrustó su propio índice al compilar y ordena los resultados por similitud en tu navegador. Al buscar sigue sin haber ninguna llamada a un modelo de IA.',
    modeKeyword:
      'Búsqueda activa: solo palabras clave. Una coincidencia simple sobre el índice publicado; la compilación no tenía token de Cloudflare para incrustarlo, así que lo dice en lugar de fingirlo.',
    placeholder: 'Proyectos, evidencia, hitos…',
    submit: 'Buscar',
    suggestedHeading: 'Preguntas sugeridas',
    chips: {
      built: '¿Qué ha construido Cristian?',
      ai: '¿Qué trabajo de IA está demostrado?',
      contact: '¿Cómo contacto con Cristian?',
      contrast: '¿Qué es aspiracional y qué está demostrado?',
    },
    results: 'Entradas publicadas que coinciden',
    fallback:
      'Ninguna entrada publicada coincide con esas palabras. Las páginas de abajo contienen el mismo contenido, y una pregunta por correo se responde con lo que es público.',
    askByEmail: 'Preguntar por correo',
    emailSubject: 'Pregunta sobre el portafolio',
    askPage: 'Pregunta sobre esta página',
  },
  palette: {
    open: 'Abrir la paleta de comandos',
    title: 'Paleta de comandos',
    close: 'Cerrar la paleta de comandos',
    placeholder: 'Ir a una página, proyecto o evidencia…',
    hint: '↑↓ para moverte · Enter para abrir · Esc para cerrar',
    empty: 'Ningún destino coincide con eso.',
    home: 'Inicio',
    print: 'Perfil imprimible',
    kind: { page: 'Página', project: 'Proyecto', evidence: 'Evidencia' },
  },
  notFound: {
    eyebrow: 'No encontrado',
    heading: 'Página no encontrada',
    summary:
      'La dirección que has solicitado no está publicada aquí. Nada se movió sin dejar constancia: los enlaces de abajo llevan a las páginas que sí existen.',
    home: 'Ir a la página de inicio',
    work: 'Ver el trabajo',
    evidence: 'Inspeccionar la evidencia',
    returnedFrom:
      'No hemos encontrado la dirección que pediste, así que te mostramos la página de no encontrado en tu idioma.',
  },
  print: {
    eyebrow: 'Vista generada',
    title: 'Perfil imprimible',
    note: 'Esta es una vista generada a partir de los datos publicados, no un documento de CV aprobado.',
    printButton: 'Imprimir / Guardar como PDF',
    generatedNote: 'Generado a partir de los datos publicados en tiempo de compilación.',
    profileHeading: 'Perfil',
    projectsHeading: 'Proyectos seleccionados',
    evolutionHeading: 'Evolución',
    shippedHeading: 'Entregado y en curso',
    plannedHeading: 'Planificado',
    evidenceHeading: 'Enlaces de evidencia',
    contactHeading: 'Contacto',
    repoLabel: 'Repositorio',
    emailLabel: 'Correo electrónico',
    githubLabel: 'GitHub',
    linkedinLabel: 'LinkedIn',
  },
  boundaries: {
    eyebrow: 'El límite',
    heading: 'Lo que este portfolio no fingirá saber.',
    items: [
      'No se afirma capacidad RAG en producción.',
      'La trayectoria de empleadores es declarada por la persona (fuente: datos verificados, 2026-10-08) y corroborada en el perfil público de LinkedIn; no se publican nombres de clientes, compensación ni detalles contractuales.',
      'No se usan porcentajes arbitrarios de progreso ni cifras de años de experiencia.',
      'El material histórico de LinkedIn-sync es contexto, no la fuente de verdad.',
    ],
  },
  footer: {
    tagline: 'Evidencia antes que confianza.',
    sourceRepository: 'Repositorio fuente',
    snapshotLabel: 'Instantánea',
    themeNote: 'El tema se guarda en tu propio navegador; ningún servidor lo controla.',
    buildNote: 'Sitio estático construido con Astro. Los scripts y el seguimiento se detallan en la página de build.',
    printProfile: 'Perfil imprimible',
    buildPage: 'Cómo está construido este sitio',
  },
  build: {
    eyebrow: 'Cómo está construido este sitio',
    title: 'Cómo está construido este sitio',
    summary:
      'El sitio es un artefacto en sí mismo: con qué está construido, cómo se despliega y qué deja fuera deliberadamente.',
    stackHeading: 'Estático, dirigido por datos y bilingüe',
    stackItems: [
      'Un sitio estático construido con Astro 5: cada página se pre-renderiza en tiempo de compilación, sin servidor en tiempo de ejecución.',
      'Dirigido por datos: las páginas se renderizan desde una capa JSON revisada en data/, así que un cambio en los datos es un cambio en el sitio.',
      'Bilingüe EN/ES: ambos locales renderizan la misma estructura desde una sola fuente compartida.',
    ],
    stackItemAnalytics:
      'Analítica respetuosa con la privacidad: un beacon de Cloudflare Web Analytics sin cookies ni seguimiento entre sitios. Es el único script de terceros en cada carga de página (el formulario de comentarios carga el widget de Cloudflare Turnstile solo donde hay comentarios), y la elección de tema se queda en tu navegador.',
    stackItemNoAnalytics:
      'Sin analítica en el cliente; los únicos scripts de terceros son los que cargan los formularios de comentarios (Cloudflare Turnstile) donde existen, y la elección de tema se queda en tu navegador.',
    deployHeading: 'Despliegue',
    deployNote:
      'Cada push a main se compila y publica automáticamente mediante GitHub Actions. GitHub Pages es el host canónico; un espejo en Cloudflare Workers sirve la misma compilación estática.',
    deployHeadersNote:
      'Desde el 2026-10-12 el espejo en Workers también sirve cabeceras de seguridad — X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-Frame-Options: DENY, Permissions-Policy: camera=(), microphone=(), geolocation=() y Strict-Transport-Security — y Cache-Control: public, max-age=31536000, immutable para los recursos con hash en /_astro/. El mecanismo es un archivo _headers en la salida de compilación. El host canónico de GitHub Pages es un sitio de proyecto y no puede establecer cabeceras de respuesta, así que sirve las mismas páginas sin ellas.',
    assistantHeading: 'El asistente es una búsqueda, no una IA',
    assistantNote:
      'El asistente flotante busca solo en los datos públicos publicados en este sitio. No es un modelo de IA y no realiza ninguna llamada a una API: solo puede señalar lo que ya está publicado aquí, y lo dice cuando no encuentra nada.',
    searchModeSemantic:
      'Esta compilación incluyó un índice de búsqueda semántica: el índice del propio asistente se incrustó al compilar con el modelo de Workers AI @cf/baai/bge-m3, y una búsqueda ordena las entradas publicadas por similitud en tu navegador. No se llama a ningún modelo de IA al buscar.',
    searchModeKeyword:
      'Esta compilación no incluyó vectores de búsqueda, así que el asistente usa solo su búsqueda por palabras clave. Incrustar el índice requiere un token de Cloudflare al compilar; esta página informa del modo que la compilación tiene en realidad en lugar de afirmar el otro.',
    agentHeading: 'Legible por agentes de IA',
    agentNote:
      'Desde el 2026-10-12 el sitio publica un archivo llms.txt y anota dos formularios con WebMCP: su formulario de contacto (contact_message) y el buscador del asistente (site_search), de modo que un agente puede encontrar el sitio e identificar ambas acciones como herramientas. La herramienta de búsqueda es honesta sobre lo que es: una búsqueda en el cliente sobre el índice ya incrustado en la página y, cuando la compilación incluyó vectores semánticos, un archivo JSON estático del mismo origen — sin backend y sin modelo de IA ni llamada a una API al buscar. Una ejecución de la categoría agentic-browsing de Lighthouse 13.5.0 en Chrome 154 registró ambas herramientas con esquemas válidos, superó la auditoría del árbol de accesibilidad, no informó de ningún formulario sin anotaciones y midió un desplazamiento de diseño acumulado de 0. La auditoría de llms.txt comprueba la raíz del dominio: pasa en el espejo de Cloudflare, que sirve la compilación en /, y no aplica a la ruta de GitHub Pages, que la sirve en /professional-evolution-portfolio/.',
    sourceHeading: 'Código fuente',
    sourceNote:
      'El sitio y su capa de datos son públicos. El repositorio de abajo es el artefacto que puedes inspeccionar; nada se publica desde una fuente privada.',
    repoLabel: 'Ver el repositorio fuente',
    rssLabel: 'Suscribirse al canal RSS',
    boundaryHeading: 'Qué no se publica',
    boundaryNote:
      'Solo se publican hechos profesionales públicos y declarados por la persona; no se publican nombres de clientes, compensación ni datos operativos privados. No se publica ningún dato privado en este sitio.',
    credits: 'Construido con Astro, alojado en GitHub Pages + Cloudflare Workers.',
  },
  guestbook: {
    eyebrow: 'Libro de visitas',
    title: 'Libro de visitas',
    summary:
      'Deja una nota breve y honesta sobre lo que has encontrado aquí. Es el mismo sistema de comentarios que usan las demás páginas — sin cuenta, sin cookies, con un nombre opcional — y cada nota se revisa antes de aparecer.',
  },
  comments: {
    eyebrow: 'Comentarios',
    heading: 'Únete a la conversación',
    summary:
      'Los comentarios están abiertos en esta página. Sin cuenta, sin cookies y sin correo electrónico: el nombre para mostrar es opcional.',
    notice:
      'Cómo funciona: un modelo de IA revisa cada comentario antes de que aparezca, y todo lo que no tiene claro pasa a una cola de revisión humana, así que nada se publica sin revisar. Los comentarios son anónimos: tu dirección IP se usa solo para un límite temporal de frecuencia y nunca se almacena. Para pedir la eliminación de un comentario, escríbeme por el formulario de contacto (RGPD).',
    formHeading: 'Deja un comentario',
    nameLabel: 'Nombre (opcional)',
    nameHint: 'Se muestra junto a tu comentario. Déjalo vacío para seguir siendo anónimo.',
    bodyLabel: 'Comentario',
    bodyHint: 'Texto plano, hasta 2000 caracteres.',
    langLabel: 'Idioma del comentario',
    langHint: 'Se usa para traducir tu comentario para quienes lean esta página.',
    langEn: 'Inglés',
    langEs: 'Español',
    langOther: 'Otro idioma',
    honeypot: 'Deja este campo vacío',
    submit: 'Publicar comentario',
    submitting: 'Publicando…',
    privacy:
      'Sin cuenta, sin cookies y sin recogida de correo. Tu comentario es público cuando pasa la revisión, y puedes pedir su eliminación en cualquier momento.',
    listHeading: 'Comentarios',
    empty: 'Todavía no hay comentarios. Sé el primero.',
    anonymous: 'Anónimo',
    report: 'Denunciar',
    pendingBadge: 'En revisión',
    translatedFrom: (language) => `Traducido del ${language}`,
    viewOriginal: 'Ver original',
    viewTranslation: 'Ver traducción',
    translationUnavailable: 'Traducción no disponible.',
    translationPaused:
      'La traducción automática está en pausa por hoy; los comentarios en otros idiomas quedan a la espera de revisión humana.',
    unavailableHeading: 'Los comentarios no están disponibles temporalmente.',
    unavailableNote:
      'El servicio de comentarios no está configurado en este despliegue, así que el formulario permanece desactivado: nada de lo que escribas aquí se enviaría.',
    turnstileBlocked:
      'El widget de verificación no se ha podido cargar, así que el formulario permanece desactivado. Inténtalo más tarde o usa el formulario de contacto.',
    noJsHeading: 'JavaScript está desactivado',
    noJsNote:
      'El formulario de comentarios necesita JavaScript para la verificación antispam. Aun así puedes escribirme directamente:',
    noJsCta: 'Enviar un correo',
    presenceTemplate: '~{n} viendo ahora',
    reconnecting: 'Reconectando…',
    newComment: 'Ha llegado un comentario nuevo.',
    statusPosted: 'Comentario publicado.',
    statusQueued: 'Gracias: tu comentario se ha recibido y está pendiente de revisión.',
    statusRateLimited: 'Demasiados comentarios en poco tiempo. Inténtalo de nuevo en una hora.',
    statusInvalidBody: 'Escribe entre 1 y 2000 caracteres.',
    statusInvalidToken: 'La verificación ha fallado. Recarga la página e inténtalo de nuevo.',
    statusLoadError: 'Algo ha ido mal. Inténtalo de nuevo.',
    statusReported: 'Denunciado. Gracias.',
    statusReportError: 'No se ha podido enviar la denuncia. Inténtalo de nuevo.',
    statusUnavailable: 'Los comentarios no están disponibles temporalmente.',
  },
};

export const copyByLocale: Record<Locale, Copy> = { en, es };

/** Default locale when a request carries no usable locale. */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve a copy catalog. Unknown locales fall back to the default locale so a
 * typo renders English rather than an empty page.
 */
export function getCopy(locale: string | undefined | null): Copy {
  return isLocale(locale) ? copyByLocale[locale] : copyByLocale[DEFAULT_LOCALE];
}