/**
 * The two real site origins, and the CORS / Origin-check helpers built on them
 * (spec 7, F-B brief §3).
 *
 * The comment UI is served from exactly two places: the canonical GitHub Pages
 * host and the Cloudflare Worker mirror. Both the REST responses (CORS) and the
 * WebSocket upgrade (Origin validation — browsers do NOT enforce CORS on
 * WebSockets, so the server must) allow exactly these two origins, never `*`.
 *
 * Source of truth for the strings: `site/site-config.json`, the deployment
 * registry that already records both deployment origins.
 *
 * This module imports nothing from `cloudflare:workers`, so Node's type
 * stripping can import it directly in tests.
 */

export const ALLOWED_ORIGINS: readonly string[] = [
  'https://cristian-cardona-dev.github.io',
  'https://professional-evolution-portfolio.crisss198.workers.dev',
];

/** True only for one of the two real site origins. Absent/junk origins fail. */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return typeof origin === 'string' && ALLOWED_ORIGINS.includes(origin);
}

/**
 * Per-route CORS tuning. The defaults are exactly the comment API's contract
 * (`GET, POST, OPTIONS` + `content-type`); a route that needs more methods or a
 * custom request header widens only its own response, never the shared default.
 */
export interface CorsOptions {
  methods?: string;
  headers?: string;
}

const DEFAULT_METHODS = 'GET, POST, OPTIONS';
const DEFAULT_HEADERS = 'content-type';

/**
 * CORS headers for an allowed origin. A disallowed (or absent) origin gets only
 * `Vary: Origin` — no `Access-Control-Allow-Origin` — so a browser blocks the
 * response. `*` is never emitted, in any branch.
 */
export function corsHeaders(
  origin: string | null,
  options: CorsOptions = {},
): Record<string, string> {
  if (!isAllowedOrigin(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin as string,
    vary: 'Origin',
    'access-control-allow-methods': options.methods ?? DEFAULT_METHODS,
    'access-control-allow-headers': options.headers ?? DEFAULT_HEADERS,
    'access-control-max-age': '86400',
  };
}
