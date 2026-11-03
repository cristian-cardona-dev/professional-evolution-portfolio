// @ts-check
import { defineConfig } from 'astro/config';

// Canonical deployment target (GitHub Pages project site).
// The base path must stay in sync with the hosting configuration in `.github/`.
// Per-target overrides: the Cloudflare Worker mirror builds the same app with
// `ASTRO_BASE=/` and `ASTRO_SITE=<mirror origin>`; both default to the
// canonical GitHub Pages values so a plain build is unchanged.
//
// `PUBLIC_CANONICAL_BASE` is the URL every canonical/og/hreflang tag must point
// at, independent of the host serving the current build. On the Worker mirror
// (served at `/`) it is set to the GitHub Pages project URL so the mirror's
// metadata does not advertise itself. It already includes the Pages base path.
// A plain build resolves it to the canonical Pages URL, so the emitted
// metadata is unchanged when the variable is unset.
const canonicalBase = (
  process.env.PUBLIC_CANONICAL_BASE ||
  'https://cristian-cardona-dev.github.io/professional-evolution-portfolio/'
).replace(/\/?$/, '/');
const basePath = process.env.ASTRO_BASE || '/professional-evolution-portfolio/';
const chatProxyPrefix = basePath.replace(/\/$/, '');
const chatProxyPath = `${chatProxyPrefix}/api/chat`;

export default defineConfig({
  site: process.env.ASTRO_SITE || 'https://cristian-cardona-dev.github.io',
  base: basePath,
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
  },
  vite: {
    define: {
      'import.meta.env.PUBLIC_CANONICAL_BASE': JSON.stringify(canonicalBase),
    },
    server: {
      proxy: {
        [chatProxyPath]: {
          target: 'https://portfolio-ai-chat-worker.crisss198.workers.dev',
          changeOrigin: true,
          rewrite: (path) => (chatProxyPrefix ? path.slice(chatProxyPrefix.length) : path),
        },
      },
    },
  },
});
