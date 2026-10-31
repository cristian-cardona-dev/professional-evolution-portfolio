/**
 * SEO helpers — structured data built from the canonical profile and datasets.
 *
 * Nothing here invents a claim: every entity names real data (`lib/data.ts`),
 * points at the deployed canonical URL and links the published profiles. The
 * home routes (`/` and `/es/`) inject the Person entity; the per-project
 * case-study routes inject the project's CreativeWork; the per-milestone
 * detail routes inject an Article. BaseLayout injects whatever it receives.
 *
 * URL policy, shared by every entity: `PUBLIC_CANONICAL_BASE` (the GitHub
 * Pages project URL including the base path) wins, so the Cloudflare Worker
 * mirror never advertises its own origin in structured data. When the
 * variable is absent (a plain Pages build resolves it in `astro.config.mjs`)
 * the historical `site` + serving base is used; with neither, the builder
 * returns `null` and no script tag is emitted rather than a fabricated URL.
 */
import type { Locale } from '../i18n/copy';
import { canonicalUrl } from './urls';
import { profile, type Project } from './data';

/** Origin every structured-data URL resolves against (see module header). */
function entityBase(site?: URL): URL | undefined {
  const canonicalBase = import.meta.env.PUBLIC_CANONICAL_BASE;
  if (canonicalBase) return new URL(canonicalBase);
  return site ? new URL(import.meta.env.BASE_URL, site) : undefined;
}

/** The person every page's entities are authored by — the real profile. */
function authorRef(base: URL): Record<string, unknown> {
  return {
    '@type': 'Person',
    name: profile.name,
    url: base.href,
    sameAs: [profile.socials.github, profile.socials.linkedin],
  };
}

/**
 * schema.org Person for the home page. `url` is the canonical root of the
 * deployment — the entity the rest of the site is about.
 */
export function personJsonLd(site?: URL): Record<string, unknown> | null {
  const base = entityBase(site);
  if (!base) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    url: base.href,
    sameAs: [profile.socials.github, profile.socials.linkedin],
  };
}

/**
 * Structured data for one project's case-study route (`work/<slug>/`).
 *
 * schema.org has no `Project` type, so the entity is a `CreativeWork` — the
 * closest honest description of a published software artifact with its own
 * page. The description is the reviewed Spanish summary on the es locale,
 * exactly what the page renders; `image` is only attached when the page
 * advertises a per-route social card (the generator's two-way check), so a
 * project without a card never references a file the build did not draw.
 */
export function projectJsonLd(
  project: Project,
  locale: Locale,
  site?: URL,
  imagePath?: string,
): Record<string, unknown> | null {
  const base = entityBase(site);
  const url = canonicalUrl(locale, `work/${project.slug}/`, site);
  if (!base || !url) return null;
  const description =
    locale === 'es' && project.summary_es ? project.summary_es : project.summary;
  const entity: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.name,
    description,
    url: url.href,
    inLanguage: locale === 'es' ? 'es' : 'en',
    author: authorRef(base),
  };
  if (imagePath) entity.image = [new URL(imagePath, base).href];
  return entity;
}

/** Inputs for `articleJsonLd` — the fields the milestone route already has. */
export interface ArticleLdInput {
  /** Visible heading of the article (the milestone title in its locale). */
  headline: string;
  /** Lead/summary text; omitted from the entity when absent. */
  description?: string;
  /** Locale-relative route path, e.g. `evolution/<id>/`. */
  path: string;
  locale: Locale;
  /** ISO date (YYYY-MM-DD) the milestone happened — the article's subject. */
  datePublished?: string;
  /** Per-route social card path (`ogCardPath`), when the page has one. */
  imagePath?: string;
  /** Serving-origin fallback (`Astro.site`); the canonical base wins. */
  site?: URL;
}

/**
 * schema.org Article for a milestone detail route (`evolution/<id>/`).
 *
 * `mainEntityOfPage` ties the article to its own canonical URL, and
 * `datePublished` is the milestone's declared date — a fact from the dataset,
 * not a publishing timestamp we would have to guess.
 */
export function articleJsonLd(input: ArticleLdInput): Record<string, unknown> | null {
  const base = entityBase(input.site);
  const url = canonicalUrl(input.locale, input.path, input.site);
  if (!base || !url) return null;
  const entity: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    url: url.href,
    inLanguage: input.locale === 'es' ? 'es' : 'en',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url.href },
    author: authorRef(base),
  };
  if (input.description) entity.description = input.description;
  if (input.datePublished) entity.datePublished = input.datePublished;
  if (input.imagePath) entity.image = [new URL(input.imagePath, base).href];
  return entity;
}
