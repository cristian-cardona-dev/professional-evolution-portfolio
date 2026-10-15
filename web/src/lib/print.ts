/**
 * Printable-profile model — the read-only projection of the canonical data
 * that `/print/` and `/es/print/` render.
 *
 * The two print routes are byte-identical markup; only the locale and the
 * catalog differ, so the shaping lives here once instead of twice. Nothing is
 * invented: every field comes from `data/*.json` through the canonical exports
 * in `lib/data.ts`, and every label comes from the locale catalog. A project
 * with a reviewed Spanish summary uses it on the `es` route, and a milestone
 * with a reviewed Spanish title uses that too (`milestoneTitle`), exactly like
 * the assistant index and the work cards.
 */
import type { Copy, Locale } from '../i18n/copy';
import {
  evidence,
  milestoneTitle,
  milestonesByDateDesc,
  profile,
  projects,
  type Milestone,
} from './data';

export interface PrintProject {
  name: string;
  statusLabel: string;
  summary: string;
  repo: string;
}

export interface PrintMilestone {
  /** ISO date (`YYYY-MM-DD`); the page formats it per locale. */
  date: string;
  title: string;
  statusLabel: string;
}

export interface PrintEvidenceItem {
  label: string;
  url: string;
  statusLabel: string | null;
}

export interface PrintModel {
  name: string;
  headline: string;
  email: string;
  github: string;
  linkedin: string;
  projects: PrintProject[];
  /** Delivered and in-flight milestones, newest first. */
  shipped: PrintMilestone[];
  /** Stated direction only, newest first. */
  planned: PrintMilestone[];
  evidence: PrintEvidenceItem[];
}

/** The claim-status vocabulary, mirrored from `i18n/copy.ts`. */
const CLAIM_STATUSES = ['demonstrated', 'developing', 'aspirational', 'insufficient'] as const;

function isClaimStatus(value: string): value is (typeof CLAIM_STATUSES)[number] {
  return (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function printModel(copy: Copy, locale: Locale): PrintModel {
  const statusLabel: Record<Milestone['status'], string> = {
    shipped: copy.evolution.shipped,
    'in-progress': copy.evolution.inProgress,
    planned: copy.evolution.planned,
  };

  const toRow = (milestone: Milestone): PrintMilestone => ({
    date: milestone.date,
    // `milestoneTitle` is the one place that decides English vs reviewed
    // Spanish, so the es print profile reads like the es timeline instead of
    // leaking the canonical English title (same rule as the work cards below).
    title: milestoneTitle(milestone, locale),
    statusLabel: statusLabel[milestone.status],
  });

  return {
    name: profile.name,
    headline: profile.headline,
    email: profile.email,
    github: profile.socials.github,
    linkedin: profile.socials.linkedin,
    projects: projects.map((project) => ({
      name: project.name,
      statusLabel: copy.projectStatus.label[project.status],
      summary: locale === 'es' && project.summary_es ? project.summary_es : project.summary,
      repo: project.repo,
    })),
    // `milestonesByDateDesc` is already newest-first, so both groups keep the
    // canonical ordering without a second sort.
    shipped: milestonesByDateDesc
      .filter((milestone) => milestone.source !== 'git' && milestone.status !== 'planned')
      .map(toRow),
    planned: milestonesByDateDesc
      .filter((milestone) => milestone.source !== 'git' && milestone.status === 'planned')
      .map(toRow),
    evidence: evidence.items.map((item) => ({
      label: item.label,
      url: item.url,
      statusLabel: isClaimStatus(item.status) ? copy.evidence.statusLabel[item.status] : null,
    })),
  };
}
