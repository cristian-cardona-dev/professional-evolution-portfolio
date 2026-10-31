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
import type { AssistantEntry } from './assistant-search';
import {
  buildAssistantEntries,
  resolveMilestoneNarrative,
  resolveMilestoneTitle,
} from './assistant-corpus.ts';
import { route } from './urls';
import type { Copy, Locale } from '../i18n/copy';

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

/** Availability states a human publishes on the career page. */
export type AvailabilityStatus = 'available' | 'busy' | 'unavailable';

/**
 * Human-declared work availability. Optional on purpose: the badge only
 * renders when the person has filled it in, so no default value can ever
 * claim something on their behalf. `updated` is the date the declaration was
 * last touched - it ships so the UI can say "as of ..." instead of implying
 * the statement is timeless.
 */
export interface Availability {
  status: AvailabilityStatus;
  /** Optional one-line note rendered next to the status chip. */
  note?: string;
  /** ISO date (YYYY-MM-DD) the declaration was last updated. */
  updated?: string;
}

export interface Profile {
  name: string;
  headline: string;
  email: string;
  socials: { github: string; linkedin: string };
  availability?: Availability;
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

interface MilestoneFields {
  id: string;
  date: string;
  title: string;
  /** Optional reviewed Spanish translation of `title`, used on the es locale. */
  title_es?: string;
  narrative: string;
  /** Required static Spanish narrative; git source marks unreviewed candidates. */
  narrative_es: string;
  evidence: string[];
  status: MilestoneStatus;
  /** Roadmap phase; absent when the milestone is not part of the roadmap. */
  phase?: MilestonePhase;
  /** Project slugs this milestone belongs to; absent means "no project link". */
  projects?: string[];
}

/**
 * `source` is also the editorial review boundary: git-derived entries are
 * candidates, while curated and snapshot entries are treated as reviewed.
 * Keep this discriminated so callers can make candidate state explicit without
 * duplicating a second review-status field in the canonical data.
 */
export type GitCandidateMilestone = MilestoneFields & { source: 'git' };
export type ReviewedMilestone = MilestoneFields & { source: 'curated' | 'snapshot' };
export type Milestone = GitCandidateMilestone | ReviewedMilestone;

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
  /**
   * Optional reviewed Spanish H1, derived from
   * `case-studies/<fileSlug>.es.md`. When present the es locale renders it in
   * place of `title`; absent means "no translation published yet". It MAY
   * legitimately equal `title` (proper nouns, product names), so the validator
   * only requires a non-empty string.
   */
  title_es?: string;
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
 * Thin wrapper over `resolveMilestoneTitle` (`lib/assistant-corpus.ts`), which
 * owns the English-vs-reviewed-Spanish rule so the page components, the print
 * view and the build-time embedding corpus all resolve a title the same way.
 */
export function milestoneTitle(milestone: Milestone, lang: Locale): string {
  return resolveMilestoneTitle(milestone, lang);
}

/** Static editorial narrative for a detail route in the requested locale. */
export function milestoneNarrative(milestone: Milestone, lang: Locale): string {
  return resolveMilestoneNarrative(milestone, lang);
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
 * `getStaticPaths` entries for the per-project case-study routes, shared by the
 * `en` and `es` route files so the two cannot drift into different param or
 * prop shapes. `data-validate.mjs` gates the slugs; this only maps them.
 */
export function projectRoutes(): { params: { slug: string }; props: { project: Project } }[] {
  return projects.map((project) => ({ params: { slug: project.slug }, props: { project } }));
}

/**
 * `getStaticPaths` entries for the per-milestone detail routes, shared by the
 * `en` and `es` route files. One entry per canonical milestone id — the
 * locale is the route file's own concern, not a param.
 */
export function milestoneRoutes(): { params: { id: string }; props: { milestone: Milestone } }[] {
  return milestones.map((milestone) => ({
    params: { id: milestone.id },
    props: { milestone },
  }));
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
 * The corpus builder itself lives in `lib/assistant-corpus.ts`: it is shared
 * with the build-time embedding generator, which cannot import this module
 * (it loads `data/*.json` through Vite-style imports and reads
 * `import.meta.env` in `lib/urls.ts`). `assistantIndex` below stays the single
 * public entry point every component imports, and injects the two data-layer
 * values the shared builder needs — `route` and `milestoneTitle`.
 */

/**
 * Build the compact search index the floating assistant embeds per page.
 *
 * Thin wrapper over `buildAssistantEntries` (`lib/assistant-corpus.ts`) with
 * this module's real `route` and `milestoneTitle`. Coverage (from the brief):
 * projects (name, summary, tags, slug, repo-derived link, status), evidence
 * (label, url, status), milestones (title, status, year) and the profile
 * (name, headline, email → a `mailto:` compose).
 */
export function assistantIndex(copy: Copy, locale: Locale): AssistantEntry[] {
  return buildAssistantEntries({ profile, projects, milestones, evidence }, copy, locale, {
    route,
    milestoneTitle,
  });
}
