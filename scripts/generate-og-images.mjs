#!/usr/bin/env node
/**
 * Per-route social card generator (E2b) — draws the `og:image` PNG of every
 * non-home route the portfolio publishes a card for.
 *
 * The card is a 1200x630 PNG per route and locale, written to
 * `web/dist/og/<route>-<locale>.png`, e.g. `web/dist/og/work-es.png` for
 * `/es/work/`:
 *
 *   work index · career · evolution · the three published case studies
 *   (work/ai-automation-workflow-lab/, work/ai-chat-app/, work/cloud-dashboard/)
 *   · and every evolution milestone x 2 locales
 *
 * The naming rule is `ogCardPath()` in `web/src/lib/urls.ts` — the pages pass
 * the same path to `BaseLayout`, and the check at the bottom of this script
 * fails the build when a page advertises a card this script did not draw. So
 * the two sides cannot drift silently.
 *
 * Zero new dependencies: Chromium is driven by the repo's existing
 * `playwright` devDep (resolved from `web/`, not the repo root — same as
 * `scripts/generate-resume-pdf.mjs`). No static server and no built route are
 * needed: the card is a self-contained HTML template (`page.setContent`), so
 * the only build input is the text of the built pages, read from disk.
 *
 * Determinism. The template uses the design-token system font stack (no
 * `@font-face`, no webfont), fixed colours transcribed from
 * `web/src/styles/tokens.css`, a fixed 1200x630 viewport at
 * `deviceScaleFactor: 1`, and no time, random or locale-sensitive value. Every
 * request to a non-local origin is aborted and reported as a failure, so a
 * stray network font can never make the output depend on the machine's
 * connectivity. Like the screenshot baselines in `web/tests/visual/`, the
 * bytes are therefore stable per rendering host (the glyphs come from the
 * host's system fonts), and identical for every build of the same content.
 *
 * The page title and site name are read from the built HTML's `og:title` and
 * `og:site_name` (the same strings `BaseLayout` derives from the copy catalog
 * and `data/profile.json`), so the cards cannot disagree with the pages. The
 * generator is chained into the `build` script of `web/package.json` right
 * after `astro build` — the same wiring as the resume PDFs (E1a) — and both
 * host builds run `npm --prefix web run build`, so both get the cards.
 *
 * Requires the Playwright browser (`npx playwright install chromium`); the
 * quality and deploy workflows install it before the build.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const DIST = resolve(ROOT, 'web', 'dist');
const OUT_DIR = resolve(DIST, 'og');

const evolutionData = JSON.parse(readFileSync(resolve(ROOT, 'data', 'evolution.json'), 'utf8'));
const MILESTONE_ROUTES = (evolutionData.milestones || []).map(
  (milestone) => `evolution/${milestone.id}/`,
);

const WIDTH = 1200;
const HEIGHT = 630;
const MIN_BYTES = 2 * 1024;
const MAX_BYTES = 1024 * 1024;

/** Locales, and the directory prefix each one's routes live under. */
const LOCALES = [
  { locale: 'en', prefix: '' },
  { locale: 'es', prefix: 'es/' },
];

/**
 * The routes with a card. `path` is the locale-relative route exactly as the
 * pages pass it to `BaseLayout`; the file name follows `ogCardPath()`
 * (`web/src/lib/urls.ts`).
 */
const ROUTES = [
  'work/',
  'career/',
  'evolution/',
  'work/ai-automation-workflow-lab/',
  'work/ai-chat-app/',
  'work/cloud-dashboard/',
  ...MILESTONE_ROUTES,
];

/** `work/ai-chat-app/` -> `work-ai-chat-app`; mirrors `ogCardPath()`. */
function fileStem(path) {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '-');
}

function cardFile(path, locale) {
  return `og/${fileStem(path)}-${locale}.png`;
}

/** Design tokens, transcribed from `web/src/styles/tokens.css` (dark theme). */
const TOKENS = {
  bg: '#0a192f',
  surface: '#112240',
  border: '#233554',
  text: '#e6f1ff',
  muted: '#98a2c2',
  accent: '#64ffda',
  /** `--font-sans` verbatim: a system stack, never a webfont. */
  fontSans:
    "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

/** Named + numeric HTML entities Astro escapes attribute values with. */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** Decode the entities an HTML attribute value can carry. */
function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/** The `content` of the first `<meta property="<property>">` tag, decoded. */
function metaContent(html, property) {
  const tag = html.match(new RegExp(`<meta[^>]*property="${property}"[^>]*>`, 'i'))?.[0];
  if (!tag) return undefined;
  const value = tag.match(/content="([^"]*)"/i)?.[1];
  return value === undefined ? undefined : decodeEntities(value);
}

/** Escape text for the template's text nodes. */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The card itself: site name + page title + locale, tokens-only styling. */
function renderTemplate({ siteName, pageTitle, locale }) {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background: ${TOKENS.bg};
    color: ${TOKENS.text};
    font-family: ${TOKENS.fontSans};
    -webkit-font-smoothing: antialiased;
  }
  .card { width: ${WIDTH}px; height: ${HEIGHT}px; padding: 56px; }
  .panel {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    padding: 64px 72px;
    border: 1px solid ${TOKENS.border};
    border-radius: 16px;
    background: ${TOKENS.surface};
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 24px; }
  .eyebrow, .locale {
    font-size: 20px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .eyebrow { color: ${TOKENS.accent}; }
  .locale { color: ${TOKENS.muted}; }
  .title {
    margin: 0;
    max-width: 920px;
    font-size: 56px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: ${TOKENS.text};
  }
  .foot { display: flex; align-items: center; gap: 16px; }
  .rule { width: 96px; height: 4px; border-radius: 9999px; background: ${TOKENS.accent}; }
</style>
</head>
<body>
  <div class="card">
    <div class="panel">
      <div class="head">
        <span class="eyebrow">${escapeHtml(siteName)}</span>
        <span class="locale">${escapeHtml(locale.toUpperCase())}</span>
      </div>
      <h1 class="title">${escapeHtml(pageTitle)}</h1>
      <div class="foot"><span class="rule"></span></div>
    </div>
  </div>
</body>
</html>
`;
}

/** Playwright is a dependency of `web/`, so resolve it from there (as E1a does). */
function loadPlaywright() {
  const webRequire = createRequire(resolve(ROOT, 'web', 'package.json'));
  return webRequire('playwright');
}

/**
 * Read the title a card must show from the page that advertises it.
 *
 * `og:title` is the document title (`<page title> — <site name>`, or the site
 * title on pages that pass no `title`); the site suffix is stripped so the
 * card shows the page title alone — the same string the layout publishes as
 * `og:image:alt`.
 */
function readPage(distFile, locale, expectedCard) {
  const html = readFileSync(distFile, 'utf8');

  const documentTitle = metaContent(html, 'og:title');
  const siteName = metaContent(html, 'og:site_name');
  const ogImage = metaContent(html, 'og:image');
  if (!documentTitle || !siteName) {
    throw new Error(
      `${distFile}: missing og:title/og:site_name — this step runs after \`astro build\`.`,
    );
  }
  if (!ogImage || !ogImage.endsWith(`/${expectedCard}`)) {
    throw new Error(
      `${distFile}: og:image is ${ogImage ?? 'missing'}, expected it to end with `
        + `/${expectedCard} — the page and this generator disagree on the card name.`,
    );
  }

  const suffix = ` — ${siteName}`;
  const pageTitle = documentTitle.endsWith(suffix)
    ? documentTitle.slice(0, -suffix.length)
    : documentTitle;

  return { siteName, pageTitle, locale };
}

/** PNG signature and IHDR dimensions; a card that is not 1200x630 is a bug. */
function readPngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return undefined;
  if (buffer.subarray(12, 16).toString('latin1') !== 'IHDR') return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Every built HTML file, recursively. */
function listHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listHtmlFiles(full));
    else if (entry.name.endsWith('.html')) results.push(full);
  }
  return results;
}

/**
 * The `og/<name>.png` paths the built pages advertise, as a set.
 *
 * Read back from the build output, not from the pages' source, so the check
 * below sees exactly what a crawler sees.
 */
function advertisedCards() {
  const advertised = new Set();
  for (const file of listHtmlFiles(DIST)) {
    const html = readFileSync(file, 'utf8');
    for (const tag of html.matchAll(/<meta[^>]*property="og:image"[^>]*>/gi)) {
      const value = tag[0].match(/content="([^"]*)"/i)?.[1] ?? '';
      const card = value.match(/\/og\/[^/"]+\.png$/)?.[0].slice(1);
      if (card) advertised.add(card);
    }
  }
  return advertised;
}

const targets = LOCALES.flatMap(({ locale, prefix }) =>
  ROUTES.map((path) => ({
    path,
    locale,
    distFile: resolve(DIST, prefix, path, 'index.html'),
    outFile: resolve(DIST, cardFile(path, locale)),
    card: cardFile(path, locale),
  })),
);

const missing = targets.filter((target) => !existsSync(target.distFile)).map((t) => t.distFile);
if (missing.length) {
  console.error(`[og-images] missing built route(s): ${missing.join(', ')}`);
  console.error('[og-images] this step runs after `astro build` (it is chained into the web build script).');
  process.exit(1);
}

const { chromium } = loadPlaywright();
mkdirSync(OUT_DIR, { recursive: true });

let browser;
try {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.error(
      '[og-images] Chromium is not installed — run `npx playwright install chromium` from `web/` '
        + '(the quality and deploy workflows run it before the build).',
    );
    throw error;
  }

  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const blocked = [];
  // Generation is offline: any non-local request is a bug, not a warning — a
  // network font would make the card depend on the machine's connectivity.
  for (const pattern of ['http://**/*', 'https://**/*']) {
    await context.route(pattern, (intercepted) => {
      blocked.push(intercepted.request().url());
      return intercepted.abort('blockedbyclient');
    });
  }

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    for (const target of targets) {
      const { siteName, pageTitle, locale } = readPage(
        target.distFile,
        target.locale,
        target.card,
      );

      await page.setViewportSize({ width: WIDTH, height: HEIGHT });
      await page.setContent(renderTemplate({ siteName, pageTitle, locale }), { waitUntil: 'load' });
      // No webfont is loaded, but the system fonts must be resolved before the
      // capture so the pixels never depend on a pending font swap.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({ path: target.outFile, type: 'png' });

      const bytes = readFileSync(target.outFile);
      const size = bytes.length;
      const dimensions = readPngSize(bytes);

      const problems = [];
      if (!dimensions) problems.push('not a readable PNG');
      else if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
        problems.push(`rendered ${dimensions.width}x${dimensions.height}, expected ${WIDTH}x${HEIGHT}`);
      }
      if (size < MIN_BYTES) problems.push(`too small (${size} B < ${MIN_BYTES} B)`);
      if (size > MAX_BYTES) problems.push(`too large (${size} B > ${MAX_BYTES} B)`);
      if (problems.length) {
        throw new Error(`${target.card}: ${problems.join('; ')}`);
      }

      console.log(`[og-images] web/dist/${target.card}: ${size} bytes, ${WIDTH}x${HEIGHT}`);
    }

    if (blocked.length) {
      throw new Error(
        `[og-images] card rendering attempted ${blocked.length} non-local request(s): `
          + `${[...new Set(blocked)].join(', ')} — cards must render offline and deterministically.`,
      );
    }
  } finally {
    await context.close();
  }
} finally {
  if (browser) await browser.close();
}

/* Two-way contract between the pages and this script: a page may not advertise
   a card that was not drawn, and a card may not be drawn for no page. A page
   that adds a case study starts advertising `og/work-<slug>-<locale>.png`, so
   the failure below is the reminder to add the route to `ROUTES` — never a
   silent 404 on a social crawler. */
const generated = new Set(targets.map((target) => target.card));
const advertised = advertisedCards();
const undrawn = [...advertised].filter((card) => !generated.has(card));
const unadvertised = [...generated].filter((card) => !advertised.has(card));
if (undrawn.length || unadvertised.length) {
  const problems = [];
  if (undrawn.length) {
    problems.push(
      `advertised but not drawn (add the route to ROUTES above): ${undrawn.join(', ')}`,
    );
  }
  if (unadvertised.length) {
    problems.push(`drawn but advertised by no page: ${unadvertised.join(', ')}`);
  }
  throw new Error(`[og-images] card mismatch — ${problems.join('; ')}`);
}

console.log(`[og-images] ${targets.length} social card(s) ready in web/dist/og/`);
