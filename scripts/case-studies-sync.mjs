#!/usr/bin/env node
/**
 * case-studies-sync.mjs — derive `data/case-studies.json` from the legacy
 * markdown case studies in `case-studies/*.md`.
 *
 * Usage: npm run case-studies:sync
 *
 * The markdown files are the content source and stay read-only; this script
 * only reshapes them:
 *   - title:    the H1 (`# …`) of the file.
 *   - sections: every `## …` heading with the raw markdown body below it —
 *               lines in source order, leading/trailing blank lines trimmed,
 *               nothing else rewritten.
 *   - sections_es: optional. When `case-studies/<stem>.es.md` exists it is
 *               parsed with the exact same section logic and attached as
 *               `sections_es` on the matching entry; the field is omitted when
 *               the file is absent. `*.es.md` companions are never treated as
 *               standalone studies. The two locales mirror 1:1 (same heading
 *               count, same order); `data-validate.mjs` enforces the length.
 *   - bodies:   GitHub URLs canonicalised so a legacy owner
 *               (`github.com/HunterProX/`, `github.com/tuuser/`) becomes the
 *               canonical owner (`github.com/cristian-cardona-dev/`).
 *               Nothing else in the body is touched: no wording, no other URL.
 *   - mapping:  legacy file stem → project slug in `data/projects.json`. A
 *               file without a mapping is kept as a standalone entry
 *               (`projectSlug: null`) instead of being dropped, so content is
 *               never silently lost.
 *
 * Cross-checks against `data/projects.json` (read-only): every mapped slug must
 * exist, and every `caseStudy` path a project declares must resolve to the
 * entry that maps back to that same project. A mismatch fails the run rather
 * than publishing an inconsistent mapping — that is the gate behind item 5 of
 * the brief (projects.json is only wrong if this script says so).
 *
 * The output is deterministic and idempotent: no timestamps, entries sorted by
 * file name, so two runs write byte-identical output.
 *
 * Rendering of the section bodies happens in the web app
 * (`web/src/lib/markdown.ts`): escape first, then bold + links only.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'case-studies');
const PROJECTS_FILE = join(ROOT, 'data', 'projects.json');
const OUTPUT_FILE = join(ROOT, 'data', 'case-studies.json');

const CANONICAL_OWNER = 'cristian-cardona-dev';
const LEGACY_OWNERS = ['hunterprox', 'tuuser'];

/**
 * Legacy file stem → project slug in `data/projects.json`.
 * Only these three case studies exist today; anything else lands as a
 * standalone entry (`projectSlug: null`).
 */
const PROJECT_SLUG_BY_FILE = {
  'ai-automation-workflow-lab': 'ai-automation-workflow-lab',
  'ai-reliability-lab': 'ai-chat-app',
  'cloud-dashboard': 'cloud-dashboard',
};

const NOTE =
  'Derived from case-studies/*.md by scripts/case-studies-sync.mjs; bodies are verbatim except GitHub URLs canonicalised to cristian-cardona-dev. Optional Spanish translations live in case-studies/*.es.md and are attached as sections_es.';

function fail(message) {
  console.error(`case-studies:sync FAILED — ${message}`);
  process.exit(1);
}

/** Canonicalise legacy GitHub owners inside a markdown fragment. */
function canonicalize(text) {
  let out = text;
  for (const owner of LEGACY_OWNERS) {
    out = out.replace(
      new RegExp(`github\\.com/${owner}/`, 'gi'),
      `github.com/${CANONICAL_OWNER}/`,
    );
  }
  return out;
}

function trimBlankLines(lines) {
  const start = lines.findIndex((line) => line.trim() !== '');
  if (start === -1) return '';
  let end = lines.length - 1;
  while (end > start && lines[end].trim() === '') end -= 1;
  return lines.slice(start, end + 1).join('\n');
}

/**
 * Line-based parser: the H1 becomes the title, every `##` heading starts a
 * section, and the lines below it (up to the next heading) are its body.
 * No markdown is interpreted here — the body is stored raw.
 */
function parseCaseStudy(fileName, markdown) {
  const lines = markdown.split(/\r?\n/);

  const titleLine = lines.find((line) => /^#\s+\S/.test(line));
  if (!titleLine) fail(`${fileName}: no H1 title found (expected a line starting with "# ")`);
  const title = canonicalize(titleLine.replace(/^#\s+/, '').trim());

  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = /^##\s+(\S.*)$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1].trim(), lines: [] };
      continue;
    }
    if (/^#\s+\S/.test(line)) {
      // A second H1 closes the current section; its content is not kept.
      if (current) sections.push(current);
      current = null;
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);

  return {
    title,
    sections: sections.map((section) => ({
      heading: section.heading,
      body: canonicalize(trimBlankLines(section.lines)),
    })),
  };
}

function readProjects() {
  if (!existsSync(PROJECTS_FILE)) fail('data/projects.json not found');
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(PROJECTS_FILE, 'utf8'));
  } catch (error) {
    fail(`data/projects.json is invalid JSON — ${error.message}`);
  }
  if (!Array.isArray(parsed)) fail('data/projects.json must be a JSON array');
  return parsed;
}

function main() {
  if (!existsSync(SOURCE_DIR)) fail('case-studies/ directory not found');

  const files = readdirSync(SOURCE_DIR)
    .filter(
      (name) => name.toLowerCase().endsWith('.md') && !name.toLowerCase().endsWith('.es.md'),
    )
    .sort();
  if (files.length === 0) fail('no case-studies/*.md files found');

  const caseStudies = [];
  let sectionCount = 0;
  let mappedCount = 0;

  for (const file of files) {
    const fileSlug = file.slice(0, -3);
    const parsed = parseCaseStudy(file, readFileSync(join(SOURCE_DIR, file), 'utf8'));
    if (parsed.sections.length === 0) fail(`${file}: no "## " section found`);

    const projectSlug = PROJECT_SLUG_BY_FILE[fileSlug] ?? null;
    if (projectSlug !== null) mappedCount += 1;
    sectionCount += parsed.sections.length;

    const entry = {
      source: `case-studies/${file}`,
      fileSlug,
      projectSlug,
      title: parsed.title,
      sections: parsed.sections,
    };

    // Optional Spanish companion: same stem + `.es.md`. Identical parser, so
    // the section shape and order mirror the English file exactly.
    const esFile = `${fileSlug}.es.md`;
    if (existsSync(join(SOURCE_DIR, esFile))) {
      const parsedEs = parseCaseStudy(esFile, readFileSync(join(SOURCE_DIR, esFile), 'utf8'));
      if (parsedEs.sections.length === 0) fail(`${esFile}: no "## " section found`);
      entry.sections_es = parsedEs.sections;
    }

    caseStudies.push(entry);
  }

  // --- Mapping consistency with the canonical project dataset (read-only) ---
  const projects = readProjects();
  const knownSlugs = new Set(
    projects.map((project) => project?.slug).filter((slug) => typeof slug === 'string'),
  );

  for (const entry of caseStudies) {
    if (entry.projectSlug !== null && !knownSlugs.has(entry.projectSlug)) {
      fail(`${entry.source}: maps to project slug "${entry.projectSlug}", which does not exist in data/projects.json`);
    }
  }

  for (const project of projects) {
    if (!project || typeof project.caseStudy !== 'string' || project.caseStudy === '') continue;
    const entry = caseStudies.find((candidate) => candidate.source === project.caseStudy);
    if (!entry) {
      fail(`projects.json (${project.slug}): caseStudy "${project.caseStudy}" has no matching case-studies/*.md file`);
    } else if (entry.projectSlug !== project.slug) {
      fail(
        `projects.json (${project.slug}): ${project.caseStudy} maps to "${entry.projectSlug}", expected "${project.slug}" — update PROJECT_SLUG_BY_FILE or data/projects.json`,
      );
    }
  }

  const output = { note: NOTE, caseStudies };

  // The canonicalisation must be complete: no legacy owner may survive.
  const serialized = JSON.stringify(output, null, 2);
  const leaked = LEGACY_OWNERS.filter((owner) => serialized.toLowerCase().includes(owner));
  if (leaked.length > 0) {
    fail(`canonicalisation incomplete: legacy owner(s) still present — ${leaked.join(', ')}`);
  }

  writeFileSync(OUTPUT_FILE, `${serialized}\n`);
  console.log(
    `case-studies:sync — case studies ${caseStudies.length} (${mappedCount} mapped, ${caseStudies.length - mappedCount} standalone), sections ${sectionCount}`,
  );
}

main();
