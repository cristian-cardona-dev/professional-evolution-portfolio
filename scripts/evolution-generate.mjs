#!/usr/bin/env node
/**
 * evolution-generate.mjs — derive milestone candidates from git history and
 * merge them into `data/evolution.json`.
 *
 * Usage: npm run evolution:generate   (add --dry-run to preview without writing)
 *
 * Rules:
 *   - only conventional-commit subjects (ai(...), docs(...), feat(...), ...) are used
 *   - merge commits are ignored (they have no conventional subject)
 *   - maintenance-only commits are ignored: see MAINTENANCE_TYPES and
 *     MAINTENANCE_PATTERNS below, which encode the curation policy applied to
 *     `data/evolution.json`. They are declared here rather than only in the data
 *     so that re-running this script against the curated dataset is a no-op
 *     instead of re-proposing every filtered-out commit.
 *   - candidate ids are `git-<date>-<slug>`; commits sharing a subject and date
 *     collapse into one candidate whose evidence lists every matching commit
 *   - candidates whose id already exists are skipped, so curated entries always
 *     win and the script is idempotent
 *   - a candidate that duplicates a curated milestone on the same date is also
 *     skipped (see `duplicatesCurated`): the curated narrative is the reviewed
 *     record, and a second entry for the same day reads as a second event
 *   - generated candidates never carry `phase` or `projects`: those are curation
 *     decisions, and this script only knows how to read commit subjects
 *   - output is pretty-printed JSON with a trailing newline
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = join(ROOT, 'data', 'evolution.json');
const REPO_URL = 'https://github.com/cristian-cardona-dev/professional-evolution-portfolio';

const ALLOWED_TYPES = new Set([
  'ai', 'docs', 'doc', 'feat', 'fix', 'perf', 'refactor', 'release', 'ci', 'config', 'chore', 'test', 'build', 'style',
]);

/**
 * Commit types that describe maintenance of the delivery machinery rather than
 * a change a reader of the timeline would call progress.
 *
 *   - `ci` / `config` / `chore` / `build` / `style`: the pipeline, not the work.
 *   - `fix`: a correction to something already published is not new progress.
 *     (Its evidence lives in the history the corrected milestone links to.)
 *   - `release`: describes how the artifact is shipped, not what the artifact
 *     does, so the deploy pipeline is not a professional-evolution milestone.
 *
 * Types that carry reader-visible or published content (`ai`, `docs`, `feat`,
 * `perf`, `refactor`, `test`) stay eligible.
 */
const MAINTENANCE_TYPES = new Set(['ci', 'config', 'chore', 'build', 'style', 'fix', 'release']);

/**
 * Subject patterns that mark a maintenance pass inside an otherwise eligible
 * type. Each entry is a maintenance concern that adds no new capability, so
 * the commit stays in the history but is not a timeline milestone.
 *
 * The list is deliberately explicit instead of heuristic: a reviewer can see
 * exactly which wording is treated as noise, and the curation in
 * `data/evolution.json` is reproducible from this list alone.
 *
 * Two of these are judgement calls a reviewer may reasonably reverse:
 *   - `initialize` also covers project scaffolding, which would exclude a
 *     genuine "first version" commit — here the first-version narrative is
 *     already carried by the curated `2026-10-03-initial-portfolio-build`.
 *   - `clarify` only ever rewords text that already exists, whereas `document`
 *     introduces new reference material and stays eligible.
 */
const MAINTENANCE_PATTERNS = [
  { pattern: /\bcorrect\b/i, why: 'a correction to something already published is not new progress' },
  { pattern: /\bpolish\b/i, why: 'cosmetic refinement of shipped work' },
  { pattern: /\bharden\b/i, why: 'defensive work on an existing path' },
  { pattern: /\bguard\b/i, why: 'validation added to an existing path' },
  { pattern: /\brequire\b/i, why: 'a runtime pin, not a capability' },
  { pattern: /\baccept\b/i, why: 'tolerating an input format, not building one' },
  { pattern: /\bcentralize\b/i, why: 'internal refactor' },
  { pattern: /\balign\b/i, why: 'internal refactor between two internal pieces' },
  { pattern: /\bseparate\b/i, why: 'a routing change with no visible capability' },
  { pattern: /\binclude\b/i, why: 'packaging a change that already exists as its own milestone' },
  { pattern: /\binitialize\b/i, why: 'scaffolding an empty project, not a published capability' },
  { pattern: /\bclarify\b/i, why: 'rewording existing text; no new artifact' },
];

const SUBJECT_PATTERN = /^([a-z]+)(?:\([^)]*\))?!?:\s*(.+)$/;
const MAX_SLUG_LENGTH = 80;

const dryRun = process.argv.includes('--dry-run');

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

function readGitLog() {
  let stdout;
  try {
    stdout = execFileSync(
      'git',
      ['log', '--reverse', '--date=short', '--pretty=format:%H%x09%ad%x09%s'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    console.error(`evolution:generate FAILED — cannot read git log: ${error.message}`);
    process.exit(1);
  }
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [hash, date, ...rest] = line.split('\t');
      return { hash: hash.trim(), date: date.trim(), subject: rest.join('\t').trim() };
    })
    .filter((entry) => entry.hash !== '' && entry.date !== '' && entry.subject !== '');
}

function isMaintenance(type, description) {
  if (MAINTENANCE_TYPES.has(type)) return true;
  return MAINTENANCE_PATTERNS.some((rule) => rule.pattern.test(description));
}

/**
 * Same-day duplicate heuristic (documented, deterministic).
 *
 * A curated milestone is the reviewed record of a day. When a generated
 * candidate lands on the same date and its title or subject shares at least
 * `DUPLICATE_OVERLAP` of its words with that curated title, the candidate is
 * a second entry for an event already told, not new history — so it is
 * skipped rather than double-counted on the timeline.
 *
 * The ratio is |shared words| / min(|candidate words|, |curated words|):
 * symmetric containment, so a short candidate fully inside a longer curated
 * title scores 1.0, and an unrelated candidate scores near 0. The threshold
 * and the tokenization (lowercase, split on non-alphanumerics) are fixed
 * constants, so two runs over the same data always agree.
 */
const DUPLICATE_OVERLAP = 0.6;

function words(value) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function overlapRatio(a, b) {
  const setA = words(a);
  const setB = words(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

/** True when a curated milestone on the same date already tells this story. */
function duplicatesCurated(candidate, curatedByDate) {
  for (const curated of curatedByDate.get(candidate.date) ?? []) {
    if (overlapRatio(candidate.title, curated.title) >= DUPLICATE_OVERLAP) return true;
    if (overlapRatio(candidate.subject, curated.title) >= DUPLICATE_OVERLAP) return true;
  }
  return false;
}

function toCandidate(commit) {
  const match = SUBJECT_PATTERN.exec(commit.subject);
  if (!match) return null; // not a conventional-commit subject (e.g. "Merge pull request ...")
  const [, type, description] = match;
  if (!ALLOWED_TYPES.has(type)) return null;
  if (isMaintenance(type, description)) return null;
  const id = `git-${commit.date}-${slugify(commit.subject)}`;
  if (id === `git-${commit.date}-`) return null;
  return {
    id,
    date: commit.date,
    title: description.charAt(0).toUpperCase() + description.slice(1),
    subject: commit.subject,
    hash: commit.hash,
  };
}

/**
 * A generated candidate is the neutral base shape: no `phase`, no `projects`.
 * Both are curation decisions that cannot be derived from a commit subject, so
 * only hand-written entries carry them.
 */
export function toMilestone(candidate, hashes) {
  return {
    id: candidate.id,
    date: candidate.date,
    title: candidate.title,
    narrative: `Git-derived candidate from commit ${hashes[0].slice(0, 7)}: "${candidate.subject}". This narrative is unreviewed and is not curated history.`,
    narrative_es: `Candidato derivado de git del commit ${hashes[0].slice(0, 7)}: "${candidate.subject}". Esta narración no está revisada y no es historia curada.`,
    evidence: hashes.map((hash) => `${REPO_URL}/commit/${hash}`),
    status: 'shipped',
    source: 'git',
  };
}

function loadData() {
  if (!existsSync(DATA_FILE)) {
    console.error('evolution:generate FAILED — data/evolution.json does not exist; create it before generating.');
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.error(`evolution:generate FAILED — data/evolution.json is invalid JSON: ${error.message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.milestones)) {
    console.error('evolution:generate FAILED — data/evolution.json must be an object with a "milestones" array.');
    process.exit(1);
  }
  return parsed;
}

function main() {
  const data = loadData();
  const knownIds = new Set(data.milestones.map((milestone) => milestone.id));
  // Curated milestones grouped by date — the reference set for the same-day
  // duplicate filter. Only `source: "curated"` counts: a git candidate is an
  // unreviewed candidate, not the reviewed record a duplicate would shadow.
  const curatedByDate = new Map();
  for (const milestone of data.milestones) {
    if (milestone.source !== 'curated') continue;
    const bucket = curatedByDate.get(milestone.date);
    if (bucket) bucket.push(milestone);
    else curatedByDate.set(milestone.date, [milestone]);
  }
  const commits = readGitLog();

  // Commits sharing a subject and date collapse into one candidate whose
  // evidence lists every matching commit, oldest first (deterministic order).
  const candidates = new Map();
  for (const commit of commits) {
    const candidate = toCandidate(commit);
    if (!candidate) continue;
    if (knownIds.has(candidate.id)) continue; // curated or already generated — curated wins
    if (duplicatesCurated(candidate, curatedByDate)) continue; // same-day curated record already tells it
    const existing = candidates.get(candidate.id);
    if (existing) {
      existing.hashes.push(commit.hash);
    } else {
      candidates.set(candidate.id, { ...candidate, hashes: [commit.hash] });
    }
  }

  const added = [...candidates.values()].map((candidate) => toMilestone(candidate, candidate.hashes));

  const total = data.milestones.length + added.length;
  const summary = `evolution:generate — commits ${commits.length}, existing ${data.milestones.length}, new ${added.length}, total ${total}${dryRun ? ' (dry run, nothing written)' : ''}`;

  if (dryRun) {
    console.log(summary);
    for (const milestone of added) console.log(`  + ${milestone.id}`);
    return;
  }

  writeFileSync(DATA_FILE, `${JSON.stringify({ ...data, milestones: [...data.milestones, ...added] }, null, 2)}\n`);
  console.log(summary);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
