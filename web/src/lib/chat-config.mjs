/**
 * Single source of truth for the assistant's chat Worker endpoint (v2).
 *
 * The Pages assistant may call exactly one backend: the allowlisted Cloudflare
 * Worker origin below, on path `/api/chat`. Both the Astro frontmatter
 * (server-rendered gating, banner/mode copy) and the client script resolve the
 * URL through `resolveChatWorkerUrl`, so the origin can never drift between
 * the two the way the old duplicated constants could.
 *
 * The contract is enforced by `web/tests/assistant-local.test.mjs`, which
 * reads this file as the allowlist: the widget itself may contain neither the
 * origin literal nor an `/api/chat` literal — only this import. `/api/lead`
 * and `/api/assistant` remain forbidden everywhere in the widget.
 *
 * Note: `import.meta.env` is statically replaced by Vite in both the
 * server (Astro frontmatter) and the bundled client script. This module is
 * only ever read as source text by plain-Node tests, never executed there.
 */
export const CHAT_WORKER_ORIGIN = 'https://portfolio-ai-chat-worker.crisss198.workers.dev';
export const CHAT_API_PATH = '/api/chat';

/** True while the Astro dev server (with its same-origin /api/chat proxy) is serving. */
export const CHAT_IS_DEV = Boolean(import.meta.env.DEV);

/**
 * Resolve the chat endpoint for this build:
 *   1. `PUBLIC_CHAT_WORKER_URL` — explicit override (CI/staging);
 *   2. dev — the same-origin vite proxy path (astro.config.mjs rewrites it
 *      to `CHAT_WORKER_ORIGIN`, so dev and production hit one Worker);
 *   3. production — the single allowlisted Worker origin.
 */
export function resolveChatWorkerUrl() {
  const override = import.meta.env.PUBLIC_CHAT_WORKER_URL;
  if (override) return `${String(override).replace(/\/+$/, '')}${CHAT_API_PATH}`;
  if (import.meta.env.DEV) {
    return `${String(import.meta.env.BASE_URL).replace(/\/+$/, '')}${CHAT_API_PATH}`;
  }
  return `${CHAT_WORKER_ORIGIN}${CHAT_API_PATH}`;
}
