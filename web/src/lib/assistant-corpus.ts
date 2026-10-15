/**
 * Assistant corpus — the shared builder behind the portfolio assistant's index.
 *
 * `assistantIndex` in `lib/data.ts` used to own this code. It moved here so the
 * build-time embedding generator (`scripts/build-semantic-index.mjs`) can build
 * *the exact same entries* the keyword assistant indexes, instead of a
 * re-implementation that could drift. The generator runs in a bare `node`
 * process, where `lib/data.ts` cannot be imported (it loads `data/*.json`
 * through Vite-style imports and reads `import.meta.env` in `lib/urls.ts`).
 * This module therefore has **zero runtime imports of the data layer**: the
 * data-layer types arrive through `import type`, which is erased at run time,
 * and the two data-layer values the builder needs — `route` and
 * `milestoneTitle` — are injected through `AssistantCorpusEnv`.
 *
 * English entries retain the v1 corpus behavior. Spanish milestone rows use
 * their reviewed static narrative for weak-text matching and snippets, while
 * keeping English title words in the strong-token list for canonical queries.
 *
 * The original extraction was verified by diffing serialized
 * `data-assistant-index` values on built pages before and after the move.
 *
 * Everything below only ever *reads* the caller's data; the assistant has no
 * data of its own. The two additions to the raw fields are documented keyword
 * affordances, not claims:
 *
 *   - `KIND_TERMS` — the words visitors use for the artifact type itself
 *     ("project", "evidence", "contact"). A project is a project; adding
 *     that word to its strong-token list invents nothing.
 *   - `STATUS_TERMS` — the site's own claim vocabulary (`docs/
 *     evidence-boundary.md`, `EvidenceBadge`): `live`/`demonstrated` support
 *     "demonstrated", `lab`/`planned` support "aspirational", and so on.
 *     Every entry still renders the status it actually has.
 *
 * Badge labels resolve through the locale copy and hrefs through the injected
 * `route`, so the index carries exactly what the page around it already says,
 * in the page's language, under the deployment's base path.
 */
import { fold, words, type AssistantEntry, type AssistantKind } from './assistant-search.ts';
import type { ClaimStatus, Copy, Locale } from '../i18n/copy.ts';
import type {
  Evidence,
  Milestone,
  MilestoneStatus,
  Profile,
  Project,
  ProjectStatus,
} from './data.ts';

/**
 * Title of a milestone in the requested locale — the one place that decides
 * English vs reviewed Spanish. `title` is the canonical English title;
 * `titleEs`, when present, is the reviewed Spanish translation rendered on the
 * es locale. A milestone without one — every git-derived candidate, which is
 * raw machine output rather than human content — falls back to the English
 * title instead of an empty heading.
 *
 * Exported so `lib/data.ts` (`milestoneTitle`) and the embedding generator use
 * the same rule.
 */
export function resolveMilestoneTitle(
  milestone: Pick<Milestone, 'title' | 'titleEs'>,
  locale: Locale,
): string {
  return locale === 'es' && milestone.titleEs ? milestone.titleEs : milestone.title;
}

/** Selects the published static milestone narrative; it never translates at runtime. */
export function resolveMilestoneNarrative(
  milestone: Pick<Milestone, 'narrative' | 'narrativeEs'>,
  locale: Locale,
): string {
  return locale === 'es' ? milestone.narrativeEs : milestone.narrative;
}

/** Badge chip variant per project status — mirrors `ProjectCard.astro`. */
const PROJECT_BADGE: Record<ProjectStatus, string> = {
  live: 'success',
  mvp: 'accent',
  demo: 'accent',
  prototype: 'warn',
  lab: 'neutral',
};

/** Badge chip variant per claim status — mirrors `EvidenceBadge.astro`. */
const CLAIM_BADGE: Record<ClaimStatus, string> = {
  demonstrated: 'success',
  developing: 'accent',
  aspirational: 'warn',
  insufficient: 'neutral',
};

/** Badge chip variant per milestone status — mirrors `EvolutionTimeline.astro`. */
const MILESTONE_BADGE: Record<MilestoneStatus, string> = {
  shipped: 'success',
  'in-progress': 'warn',
  planned: 'neutral',
};

/** Copy key holding the localized badge label of each milestone status. */
const MILESTONE_LABEL_KEY: Record<MilestoneStatus, 'shipped' | 'inProgress' | 'planned'> = {
  shipped: 'shipped',
  'in-progress': 'inProgress',
  planned: 'planned',
};

const KIND_TERMS: Record<AssistantKind, string[]> = {
  work: ['project', 'projects', 'built', 'software', 'code', 'repo'],
  evidence: ['evidence', 'proof', 'artifact'],
  evolution: ['evolution', 'milestone', 'milestones', 'timeline', 'roadmap'],
  profile: ['contact', 'email', 'person', 'about'],
};

/**
 * Status word → the claim words it honestly supports. Covers all three
 * status vocabularies (project, claim, milestone) in one table; the values
 * are word lists fed into strong tokens, never user-visible copy.
 */
const STATUS_TERMS: Record<string, string[]> = {
  live: ['demonstrated', 'published', 'available'],
  mvp: ['demonstrated', 'usable'],
  demo: ['demonstrated', 'shown'],
  prototype: ['developing', 'reproduction'],
  lab: ['planned', 'aspirational', 'direction'],
  demonstrated: ['demonstrated', 'verified', 'public'],
  developing: ['developing', 'partial'],
  aspirational: ['aspirational', 'direction', 'intent'],
  insufficient: ['insufficient', 'gap'],
  shipped: ['shipped', 'delivered', 'done', 'demonstrated'],
  'in-progress': ['ongoing', 'current', 'developing'],
  planned: ['planned', 'aspirational', 'direction', 'intent'],
};

/** Runtime guard for the widened `string` status of an evidence item. */
function isClaimStatus(value: string): value is ClaimStatus {
  return (
    value === 'demonstrated' ||
    value === 'developing' ||
    value === 'aspirational' ||
    value === 'insufficient'
  );
}

/** Deduplicate a token list, keeping first-appearance order. */
function uniqueTerms(terms: string[]): string[] {
  return [...new Set(terms)];
}

/** Clip to roughly `max` characters at a word boundary, with an ellipsis. */
function clip(text: string, max = 150): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > 60 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
}

/** Canonical datasets the corpus is built from (the data layer's own shapes). */
export interface AssistantCorpusInput {
  profile: Profile;
  projects: Project[];
  milestones: Milestone[];
  evidence: Evidence;
}

/**
 * The two data-layer values the builder cannot import at run time: the
 * base/locale-aware href builder and the milestone-title resolver. `lib/data.ts`
 * passes its real implementations; the build-time generator passes a plain
 * `path` passthrough and `resolveMilestoneTitle`, because the embedding corpus
 * never reads hrefs.
 */
export interface AssistantCorpusEnv {
  route: (locale: Locale, path?: string) => string;
  milestoneTitle: (milestone: Milestone, locale: Locale) => string;
}

/**
 * Build the compact search index the floating assistant embeds per page.
 *
 * Coverage (from the brief): projects (name, summary, tags, slug, repo-
 * derived link, status), evidence (label, url, status), milestones (title,
 * status, year) and the profile (name, headline, email → a `mailto:`
 * compose). Links are locale- and base-aware through `env.route`; the profile
 * entry is the contact affordance the "How can I contact Cristian?" chip
 * needs, so it composes an email to the published address.
 */
export function buildAssistantEntries(
  input: AssistantCorpusInput,
  copy: Copy,
  locale: Locale,
  env: AssistantCorpusEnv,
): AssistantEntry[] {
  const { profile, projects, milestones, evidence } = input;
  const entries: AssistantEntry[] = [];

  for (const project of projects) {
    // On the es locale, prefer the reviewed Spanish summary so the assistant
    // snippet and its weak-text matching read in the page's language; the
    // English summary stays the fallback when no translation is published.
    const projectSummary =
      locale === 'es' && project.summary_es ? project.summary_es : project.summary;
    entries.push({
      ty: 'work',
      lo: uniqueTerms([
        ...words(project.name),
        ...project.tags.flatMap(words),
        ...words(project.slug),
        ...KIND_TERMS.work,
        ...(STATUS_TERMS[project.status] ?? []),
      ]),
      we: fold(projectSummary),
      ti: project.name,
      sn: clip(projectSummary),
      hr: env.route(locale, `work/${project.slug}/`),
      ba: copy.projectStatus.label[project.status],
      bv: PROJECT_BADGE[project.status],
      yr: null,
    });
  }

  for (const item of evidence.items) {
    const claim = isClaimStatus(item.status) ? item.status : null;
    entries.push({
      ty: 'evidence',
      lo: uniqueTerms([
        ...words(item.label),
        ...KIND_TERMS.evidence,
        ...(claim ? STATUS_TERMS[claim] ?? [] : []),
      ]),
      we: fold(`${item.label} ${item.url}`),
      ti: item.label,
      sn: item.url,
      hr: env.route(locale, 'evidence/'),
      ba: claim ? copy.evidence.statusLabel[claim] : null,
      bv: claim ? CLAIM_BADGE[claim] : null,
      yr: null,
    });
  }

  for (const milestone of milestones) {
    // `buildAssistantEntries` is called per locale, so the result row carries
    // the same title the page shows: the reviewed Spanish `titleEs` on es, the
    // English title otherwise. The English title words stay in the strong-token
    // list too, so an English query still matches on the es index.
    const title = env.milestoneTitle(milestone, locale);
    entries.push({
      ty: 'evolution',
      lo: uniqueTerms([
        ...words(milestone.title),
        ...(title === milestone.title ? [] : words(title)),
        ...KIND_TERMS.evolution,
        ...(milestone.source === 'git' ? [] : STATUS_TERMS[milestone.status] ?? []),
      ]),
      we: fold(resolveMilestoneNarrative(milestone, locale)),
      ti: title,
      sn: clip(resolveMilestoneNarrative(milestone, locale)),
      hr: env.route(locale, 'evolution/'),
      ba: milestone.source === 'git'
        ? copy.evolution.sourceLabel.git
        : copy.evolution[MILESTONE_LABEL_KEY[milestone.status]],
      bv: milestone.source === 'git' ? 'neutral' : MILESTONE_BADGE[milestone.status],
      yr: milestone.date.slice(0, 4),
    });
  }

  entries.push({
    ty: 'profile',
    lo: uniqueTerms([...words(profile.name), ...KIND_TERMS.profile]),
    we: fold(`${profile.headline} ${profile.email}`),
    ti: profile.name,
    sn: profile.headline,
    hr: `mailto:${profile.email}?subject=${encodeURIComponent(copy.assistant.emailSubject)}`,
    ba: copy.nav.contact,
    bv: 'accent',
    yr: null,
  });

  return entries;
}
