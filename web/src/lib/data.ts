/**
 * Canonical data layer — single source of truth for the portfolio.
 *
 * The JSON files under `data/` at the repository root are canonical
 * (`npm run data:validate` is the gate). They are imported here by relative
 * path so the Astro build consumes exactly the same bytes the validator checks.
 * From `web/src/lib/` the repository root is three levels up.
 * Edit the data files, never this module.
 */
import profileJson from '../../../data/profile.json';
import projectsJson from '../../../data/projects.json';
import evolutionJson from '../../../data/evolution.json';
import evidenceJson from '../../../data/evidence.json';
import caseStudiesJson from '../../../data/case-studies.json';
import experienceJson from '../../../data/experience.json';
import skillsJson from '../../../data/skills.json';
import roadmapJson from '../../../data/roadmap.json';
import { fold, words, type AssistantEntry, type AssistantKind } from './assistant-search';
import { route } from './urls';
import type { ClaimStatus, Copy, Locale } from '../i18n/copy';

export const PROJECT_STATUSES = ['prototype', 'demo', 'mvp', 'lab', 'live'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const MILESTONE_STATUSES = ['shipped', 'in-progress', 'planned'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_SOURCES = ['curated', 'git', 'snapshot'] as const;
export type MilestoneSource = (typeof MILESTONE_SOURCES)[number];

/**
 * Roadmap phase, in the order the roadmap reads. Optional on a milestone: an
 * entry without one simply does not appear in the roadmap, so a dataset that
 * predates the phases still renders.
 *
 * The split is chronological rather than aspirational — `foundation` and
 * `transition` describe what already happened, `frontier` is the only phase a
 * `planned` milestone may sit in, because frontier means "direction ahead".
 * `data-validate.mjs` enforces that pairing.
 */
export const MILESTONE_PHASES = ['foundation', 'transition', 'frontier'] as const;
export type MilestonePhase = (typeof MILESTONE_PHASES)[number];

export interface Profile {
  name: string;
  headline: string;
  email: string;
  socials: { github: string; linkedin: string };
  formEndpoint: string | null;
  formKey: string | null;
  reposOwner: string;
}

export interface Project {
  slug: string;
  name: string;
  summary: string;
  /** Optional reviewed Spanish translation of `summary`, used on the es locale. */
  summary_es?: string;
  status: ProjectStatus;
  repo: string;
  caseStudy: string | null;
  tags: string[];
  related: string[];
  screenshots: string[];
}

export interface Milestone {
  id: string;
  date: string;
  title: string;
  /** Optional reviewed Spanish translation of `title`, used on the es locale. */
  titleEs?: string;
  narrative: string;
  evidence: string[];
  status: MilestoneStatus;
  source: MilestoneSource;
  /** Roadmap phase; absent when the milestone is not part of the roadmap. */
  phase?: MilestonePhase;
  /** Project slugs this milestone belongs to; absent means "no project link". */
  projects?: string[];
}

export interface EvidenceItem {
  label: string;
  url: string;
  status: string;
}

export interface Evidence {
  note: string;
  items: EvidenceItem[];
}

/** One `## …` section of a case study, body kept as raw markdown. */
export interface CaseStudySection {
  heading: string;
  body: string;
}

/** An entry of `data/case-studies.json`, derived from `case-studies/*.md`. */
export interface CaseStudy {
  /** Path of the source markdown, relative to the repository root. */
  source: string;
  /** File stem of the source markdown (legacy id, never renamed). */
  fileSlug: string;
  /** Project this case study documents, or `null` for a standalone entry. */
  projectSlug: string | null;
  /** The H1 of the source markdown, verbatim. */
  title: string;
  sections: CaseStudySection[];
  /**
   * Optional reviewed Spanish translation of `sections`, derived from
   * `case-studies/<fileSlug>.es.md`. When present it mirrors `sections` 1:1 —
   * same length, same order — and the es locale renders it instead of the
   * English sections. Absent means "no translation published yet".
   */
  sections_es?: CaseStudySection[];
}

/** One declared employer entry of `data/experience.json`. */
export interface ExperienceCompany {
  id: string;
  company: string;
  role: string;
  /** ISO month (`YYYY-MM`) the role started. */
  start: string;
  /** ISO month the role ended, or `null` while it is ongoing. */
  end: string | null;
  stack: string[];
  source: string;
}

/**
 * One entry of `data/skills.json`. `category` stays a plain `string` here
 * rather than the copy catalog's `SkillCategory`: the validator owns that enum,
 * and a consumer narrows through `copy.skills.categoryLabel` when it needs a
 * label, exactly as `RoadmapTable` does.
 */
export interface Skill {
  name: string;
  category: string;
  aliases: string[];
  /** `experience.json` ids that declared the skill. */
  employedAt: string[];
  /** `projects.json` slugs the skill is exercised in. */
  projects: string[];
  /** Optional human-declared provenance marker; absent for most skills. */
  facts?: string;
}

/** One proof a roadmap milestone points at, in `data/roadmap.json`. */
export interface RoadmapProof {
  type: 'project' | 'evolution';
  id: string;
}

/** One entry of `data/roadmap.json`, in declared (narrative) order. */
export interface RoadmapMilestone {
  id: string;
  goal: string;
  status: MilestoneStatus;
  skills: string[];
  proofs: RoadmapProof[];
}

/**
 * JSON imports widen string literals to `string`, so the canonical unions are
 * re-narrowed here. `npm run data:validate` is the gate that keeps the JSON
 * files inside those unions.
 */
function narrow<T>(value: unknown): T {
  return value as T;
}

export const profile: Profile = narrow(profileJson);
export const projects: Project[] = narrow(projectsJson);
export const milestones: Milestone[] = narrow(evolutionJson.milestones);
export const evidence: Evidence = narrow(evidenceJson);
export const caseStudies: CaseStudy[] = narrow(caseStudiesJson.caseStudies);

/**
 * Career data layer. `experience.json`, `skills.json` and `roadmap.json` are
 * canonical like the datasets above and are re-exported from this module so no
 * component has to reach into `data/` itself: one import path, one place that
 * documents the shape. `data-validate.mjs` gates the cross-file references
 * (`employedAt` ⊆ company ids, `skills` ⊆ skill names, `proofs` resolving).
 */
export const experienceCompanies: ExperienceCompany[] = narrow(experienceJson.companies);
export const skills: Skill[] = narrow(skillsJson.skills);
export const roadmapMilestones: RoadmapMilestone[] = narrow(roadmapJson.milestones);

/** Newest milestone first; curated and git-derived entries share one ordering. */
export const milestonesByDateDesc: Milestone[] = [...milestones].sort((a, b) =>
  a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1,
);

/**
 * Milestones a human wrote and reviewed. The home preview uses this set only:
 * an unreviewed git candidate is not the first thing a visitor should read as
 * "what happened most recently".
 */
export const curatedMilestonesByDateDesc: Milestone[] = milestonesByDateDesc.filter(
  (milestone) => milestone.source === 'curated',
);

/**
 * Title of a milestone in the requested locale.
 *
 * `title` is the canonical English title. `titleEs`, when present, is the
 * reviewed Spanish translation rendered on the es locale; a milestone without
 * one — every git-derived candidate, which is raw machine output rather than
 * human content — falls back to the English title instead of an empty heading.
 */
export function milestoneTitle(milestone: Milestone, lang: Locale): string {
  return lang === 'es' && milestone.titleEs ? milestone.titleEs : milestone.title;
}

/** Projects a milestone links to, in `projects.json` order, unknown slugs dropped. */
export function milestoneProjects(milestone: Milestone): Project[] {
  if (!milestone.projects || milestone.projects.length === 0) return [];
  return milestone.projects
    .map((slug) => getProjectBySlug(slug))
    .filter((value): value is Project => value !== undefined);
}

/** One row of the roadmap table on `/evolution/`. */
export interface RoadmapRow {
  phase: MilestonePhase;
  /** Milestones carrying this phase, newest first. */
  milestones: Milestone[];
  /** Union of the milestones' project slugs, deduplicated and kept in order. */
  projects: Project[];
}

/**
 * Roadmap rows derived from the milestones themselves — no hand-written list.
 *
 * Only phases that at least one milestone declares are returned, so the table
 * never shows an empty row, and the phase order is fixed by `MILESTONE_PHASES`
 * so a data edit can add a phase but cannot reorder the narrative.
 */
export function roadmapRows(entries: Milestone[] = milestones): RoadmapRow[] {
  return MILESTONE_PHASES.map((phase) => {
    const inPhase = entries
      .filter((milestone) => milestone.phase === phase)
      .sort((a, b) =>
        a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1,
      );
    const slugs = [...new Set(inPhase.flatMap((milestone) => milestone.projects ?? []))];
    return {
      phase,
      milestones: inPhase,
      // Dataset order, not mention order, so the supporting list is stable.
      projects: projects.filter((project) => slugs.includes(project.slug)),
    };
  }).filter((row) => row.milestones.length > 0);
}

export function getProjectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

/**
 * Case study that documents a project, matched through the file→project
 * mapping the sync script validates. A project whose `caseStudy` is `null`
 * (or whose file has no mapping) returns `undefined`, which the case-study
 * page renders as the honest empty state instead of an invented write-up.
 */
export function caseStudyFor(slug: string): CaseStudy | undefined {
  return caseStudies.find((entry) => entry.projectSlug === slug);
}

/** Cross-linked projects (similarity links declared in `data/projects.json`). */
export function relatedProjects(slug: string): Project[] {
  const project = getProjectBySlug(slug);
  if (!project) return [];
  return project.related
    .map((relatedSlug) => getProjectBySlug(relatedSlug))
    .filter((value): value is Project => value !== undefined);
}

/* ---------------------------------------------------------------------- */
/* Portfolio assistant — build-time search index (v1, keyword-based)       */
/* ---------------------------------------------------------------------- */

/**
 * Everything below only ever *reads* the canonical exports above; the
 * assistant has no data of its own. The two additions to the raw fields are
 * documented keyword affordances, not claims:
 *
 *   - `KIND_TERMS` — the words visitors use for the artifact type itself
 *     ("project", "evidence", "contact"). A project is a project; adding
 *     that word to its strong-token list invents nothing.
 *   - `STATUS_TERMS` — the site's own claim vocabulary (`docs/
 *     evidence-boundary.md`, `EvidenceBadge`): `live`/`demonstrated` support
 *     "demonstrated", `lab`/`planned` support "aspirational", and so on.
 *     Every entry still renders the status it actually has.
 *
 * Badge labels resolve through the locale copy and hrefs through `route`, so
 * the index carries exactly what the page around it already says, in the
 * page's language, under the deployment's base path.
 */

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

/**
 * Build the compact search index the floating assistant embeds per page.
 *
 * Coverage (from the brief): projects (name, summary, tags, slug, repo-
 * derived link, status), evidence (label, url, status), milestones (title,
 * status, year) and the profile (name, headline, email → a `mailto:`
 * compose). Links are locale- and base-aware through `route`; the profile
 * entry is the contact affordance the "How can I contact Cristian?" chip
 * needs, so it composes an email to the published address.
 */
export function assistantIndex(copy: Copy, locale: Locale): AssistantEntry[] {
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
      hr: route(locale, `work/${project.slug}/`),
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
      hr: route(locale, 'evidence/'),
      ba: claim ? copy.evidence.statusLabel[claim] : null,
      bv: claim ? CLAIM_BADGE[claim] : null,
      yr: null,
    });
  }

  for (const milestone of milestones) {
    entries.push({
      ty: 'evolution',
      lo: uniqueTerms([
        ...words(milestone.title),
        ...KIND_TERMS.evolution,
        ...(STATUS_TERMS[milestone.status] ?? []),
      ]),
      we: fold(milestone.narrative),
      ti: milestone.title,
      sn: clip(milestone.narrative),
      hr: route(locale, 'evolution/'),
      ba: copy.evolution[MILESTONE_LABEL_KEY[milestone.status]],
      bv: MILESTONE_BADGE[milestone.status],
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
