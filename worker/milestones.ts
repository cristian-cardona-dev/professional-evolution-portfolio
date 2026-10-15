/**
 * Canonical milestone identity for the reaction API.
 *
 * `data/evolution.json` is the single source of truth for milestones: the
 * static detail routes, the timeline, the search corpus and this Worker all read
 * the same file, so the runtime reaction contract cannot drift from the
 * build-time page contract. Importing the canonical JSON here — instead of
 * duplicating a hand-maintained id list — means the API accepts exactly the ids
 * the site actually publishes, with no second place to update and no way for
 * the two contracts to diverge.
 *
 * The file is public portfolio data already shipped in the static build (it
 * carries no secrets), and it is bundled into the Worker at deploy time, so
 * there is no runtime fetch and no extra infrastructure.
 */
import evolution from '../data/evolution.json';

/** Every canonical milestone id, as a constant-time lookup set. */
export const MILESTONE_IDS: ReadonlySet<string> = new Set(
  evolution.milestones.map((milestone) => milestone.id),
);

/**
 * Syntax gate: a lowercase slug. Uppercase, dots, slashes, path traversal and
 * overlong values are rejected before they can name a Durable Object, so a
 * malformed id can never reach storage.
 */
export function normalizeMilestoneId(raw: unknown): string | null {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (id.length === 0 || id.length > 200) return null;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) ? id : null;
}

/**
 * Existence gate: the id must be a canonical milestone in `data/evolution.json`.
 *
 * A well-formed but unknown slug must NOT mint a reaction room or a count — the
 * static site already answers 404 for an unknown milestone route, so the API
 * mirrors that contract instead of inventing state for a page that does not
 * exist. This is the Phase 0 "reject unknown IDs" contract, enforced at runtime.
 */
export function isKnownMilestoneId(id: string): boolean {
  return MILESTONE_IDS.has(id);
}
