/**
 * Build metadata reader — server/build-time only.
 *
 * The semantic index generator (`scripts/build-semantic-index.mjs`, the
 * `prebuild` step of `npm --prefix web run build`) writes
 * `web/public/build-metadata.json`: which search mode the build produced, the
 * vector counts, the byte size and, when keyword-only, the honest reason.
 *
 * `BuildNotes.astro` and `AssistantWidget.astro` read it while they render, so
 * both state plainly which mode is live in *this* build (spec section 10: the
 * site must never claim a semantic search it does not have). This module is
 * deliberately not client-safe — it reads the filesystem — and is only ever
 * imported from component frontmatter, which runs at build time. The browser
 * half (`lib/semantic-search.ts`) fetches the shipped artifact instead.
 *
 * The file is generated and gitignored, so it can legitimately be absent (a
 * bare `astro dev`, or `astro build` run without the prebuild step). The
 * fallback is `keyword-only` — the honest answer when no vectors were built.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Which search mode this build produced. */
export type SearchMode = 'semantic' | 'keyword-only';

/** Shape of `web/public/build-metadata.json` (see the generator). */
export interface BuildMetadata {
  semantic_index: SearchMode;
  model: string | null;
  dims: number;
  entries: number;
  vocabulary: number;
  bytes: number;
  reason: string | null;
  /**
   * Whether this build shipped the Cloudflare Web Analytics beacon (task E4).
   * The generator derives it from `PUBLIC_CF_BEACON_TOKEN`, the same variable
   * `BaseLayout` uses to gate the script, so the disclosure on `/build/` and
   * the shipped HTML cannot disagree.
   */
  analytics: boolean;
}

/**
 * The beacon token is public by design and read here only to keep the honest
 * fallback honest: if `build-metadata.json` is absent (a bare `astro dev`),
 * `BaseLayout` still injects the beacon when the variable is set, so the page
 * must not then claim there is no analytics.
 */
const envAnalytics = Boolean(import.meta.env.PUBLIC_CF_BEACON_TOKEN);

/** The honest answer when the artifact is missing or unreadable. */
export const KEYWORD_ONLY_FALLBACK: BuildMetadata = {
  semantic_index: 'keyword-only',
  model: null,
  dims: 0,
  entries: 0,
  vocabulary: 0,
  bytes: 0,
  reason: 'build-metadata.json was not present when the site rendered',
  analytics: false,
};

/** Candidate paths, most specific first; `import.meta.url` is Vite-dependent. */
function candidatePaths(): URL[] {
  const candidates: URL[] = [];
  try {
    candidates.push(new URL('../../public/build-metadata.json', import.meta.url));
  } catch {
    // `import.meta.url` unavailable in this runtime — fall through to cwd.
  }
  candidates.push(new URL(`file://${resolve(process.cwd(), 'public', 'build-metadata.json').replace(/\\/g, '/')}`));
  candidates.push(new URL(`file://${resolve(process.cwd(), 'web', 'public', 'build-metadata.json').replace(/\\/g, '/')}`));
  return candidates;
}

/** Read the generated build metadata, or the honest keyword-only fallback. */
export function readBuildMetadata(): BuildMetadata {
  for (const candidate of candidatePaths()) {
    try {
      const raw = JSON.parse(readFileSync(candidate, 'utf8')) as Partial<BuildMetadata>;
      if (raw.semantic_index !== 'semantic' && raw.semantic_index !== 'keyword-only') continue;
      return {
        semantic_index: raw.semantic_index,
        model: typeof raw.model === 'string' ? raw.model : null,
        dims: typeof raw.dims === 'number' ? raw.dims : 0,
        entries: typeof raw.entries === 'number' ? raw.entries : 0,
        vocabulary: typeof raw.vocabulary === 'number' ? raw.vocabulary : 0,
        bytes: typeof raw.bytes === 'number' ? raw.bytes : 0,
        reason: typeof raw.reason === 'string' ? raw.reason : null,
        analytics: raw.analytics === true,
      };
    } catch {
      // Try the next candidate; absent is expected outside a full build.
    }
  }
  // The artifact was absent: keep the honest keyword-only answer, but read the
  // beacon variable directly rather than claim there is no analytics when the
  // script will still ship (see `envAnalytics`).
  return { ...KEYWORD_ONLY_FALLBACK, analytics: envAnalytics };
}
