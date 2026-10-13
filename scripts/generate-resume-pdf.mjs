/**
 * Resume PDF generator — prints the built `/print/` routes to PDF.
 *
 * It reads nothing but the build output: `web/dist/print/index.html` and
 * `web/dist/es/print/` are served by a throwaway static server bound to
 * 127.0.0.1 on an odd port (a `file://` URL cannot work — the build emits
 * base-prefixed absolute asset URLs such as
 * `/professional-evolution-portfolio/_astro/…`), and Chromium prints them with
 * Playwright, the repo's existing `playwright` devDep: zero new dependencies.
 *
 *   web/dist/resume-en.pdf
 *   web/dist/resume-es.pdf
 *
 * `web/dist` is exactly what both `deploy-static.yml` host jobs rename to
 * `dist/` (`mv web/dist dist`), so the PDFs reach the GitHub Pages artifact and
 * the Cloudflare Worker artifact alike: the step hangs off the `build` script
 * in `web/package.json`, and both jobs run `npm --prefix web run build`.
 *
 * No network access during generation. The server listens on 127.0.0.1 only,
 * and every request to any other origin is aborted and reported, so a stray
 * third-party URL can never become a build dependency — or quietly change a
 * PDF between two builds.
 *
 * Rendering contract, checked below so a drift fails the build instead of
 * shipping a bad CV:
 *   - light colour scheme: the print stylesheet forces white paper, so the dark
 *     theme's muted greys would be near-invisible on it;
 *   - print media (what `page.pdf()` renders) with the `@page { margin: 16mm }`
 *     declared in `src/pages/print.astro`;
 *   - 10 KB < size < 2 MB and at most 2 pages per PDF.
 *
 * Requires the Playwright browser (`npx playwright install chromium`); the
 * quality and deploy workflows install it before the build.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, inflateSync } from 'node:zlib';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const DIST = resolve(ROOT, 'web', 'dist');

/** Both host builds run with the default Pages base and with `ASTRO_BASE=/`. */
function normalizeBase(value) {
  const trimmed = value.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `/${trimmed}/` : '/';
}
const BASE = normalizeBase(process.env.ASTRO_BASE || '/professional-evolution-portfolio/');

/** Odd ports on the loopback interface, first free one wins (see header). */
const PORT_CANDIDATES = [4317, 4331, 4333, 4337];

const MIN_BYTES = 10 * 1024;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGES = 2;

const LOCALES = [
  { locale: 'en', route: 'print/' },
  { locale: 'es', route: 'es/print/' },
];

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

/** Playwright is a dependency of `web/`, so resolve it from there, not from the repo root. */
function loadPlaywright() {
  const webRequire = createRequire(resolve(ROOT, 'web', 'package.json'));
  return webRequire('playwright');
}

/** Serve `web/dist` at the deployment base; see `createDistServer`. */
function requestHandler(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }

  if (!pathname.startsWith(BASE)) {
    res.writeHead(404).end(`not found outside base ${BASE}`);
    return;
  }

  const relative = pathname.slice(BASE.length).replace(/^\/+/, '');
  const filePath = resolve(DIST, relative);
  if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  const target = existsSync(filePath) && statSync(filePath).isDirectory()
    ? resolve(filePath, 'index.html')
    : filePath;

  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(target).pipe(res);
}

/**
 * The server for one run: bound to 127.0.0.1 on the first free odd port, so a
 * concurrent dev (4321), preview (4323) or Playwright (4322) server never
 * collides with it.
 */
async function createDistServer() {
  for (const port of PORT_CANDIDATES) {
    try {
      const server = await new Promise((resolveListen, reject) => {
        const instance = createServer(requestHandler);
        instance.once('error', reject);
        instance.listen(port, '127.0.0.1', () => {
          instance.removeListener('error', reject);
          resolveListen(instance);
        });
      });
      return { server, port };
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error(`no free local port among ${PORT_CANDIDATES.join(', ')}`);
}

/**
 * Page count without a PDF dependency: the page tree records `/Type /Page`
 * either literally or inside a compressed object stream, so the raw bytes and
 * every inflatable stream are scanned and counted together — each object exists
 * exactly once, so the sum is the page count.
 */
function pdfPageCount(buffer) {
  const raw = buffer.toString('latin1');
  const parts = [raw];
  let from = 0;
  while ((from = raw.indexOf('stream', from)) !== -1) {
    let start = from + 'stream'.length;
    if (raw[start] === '\r') start += 1;
    if (raw[start] === '\n') start += 1;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const slice = buffer.subarray(start, end);
    from = end + 'endstream'.length;
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        parts.push(inflate(slice).toString('latin1'));
      } catch {
        /* not this encoding (or an uncompressed stream) */
      }
    }
  }
  return (parts.join('\n').match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length;
}

/**
 * One PDF per locale: load the built route from the local server, print it
 * (A4; the `@page { margin: 16mm }` rule of the print stylesheet carries the
 * margins), then hold the artifact to the contract in the header.
 */
async function generate(browser, { locale, route }, port) {
  const url = `http://127.0.0.1:${port}${BASE}${route}`;
  const out = resolve(DIST, `resume-${locale}.pdf`);
  const blocked = [];

  const context = await browser.newContext({
    // Print forces white paper; the light scheme is what keeps the muted
    // greys readable on it (see the header).
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });

  try {
    // Generation is offline: only this server's origin may be fetched.
    for (const pattern of ['http://**/*', 'https://**/*']) {
      await context.route(pattern, (intercepted) => {
        const { hostname } = new URL(intercepted.request().url());
        if (hostname === '127.0.0.1' || hostname === 'localhost') return intercepted.continue();
        blocked.push(intercepted.request().url());
        return intercepted.abort('blockedbyclient');
      });
    }

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const response = await page.goto(url, { waitUntil: 'load' });
    if (!response || !response.ok()) {
      throw new Error(`GET ${url} -> ${response ? response.status() : 'no response'}`);
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await context.close();
  }

  for (const blockedUrl of blocked) console.warn(`[resume-pdf] blocked non-local request: ${blockedUrl}`);

  const bytes = readFileSync(out);
  const size = bytes.length;
  const pages = pdfPageCount(bytes);

  const problems = [];
  if (size < MIN_BYTES) problems.push(`too small (${size} B < ${MIN_BYTES} B)`);
  if (size > MAX_BYTES) problems.push(`too large (${size} B > ${MAX_BYTES} B)`);
  if (pages < 1) problems.push('page count could not be read from the PDF');
  if (pages > MAX_PAGES) problems.push(`${pages} pages > ${MAX_PAGES}`);
  if (problems.length) {
    throw new Error(`resume-${locale}.pdf: ${problems.join('; ')}`);
  }

  return { locale, size, pages };
}

const missing = LOCALES
  .map(({ route }) => resolve(DIST, route, 'index.html'))
  .filter((file) => !existsSync(file));
if (missing.length) {
  console.error(`[resume-pdf] missing built print route(s): ${missing.join(', ')}`);
  console.error('[resume-pdf] this step runs after `astro build` (it is chained into the web build script).');
  process.exit(1);
}

const { server, port } = await createDistServer();
const { chromium } = loadPlaywright();
console.log(`[resume-pdf] serving ${DIST} at http://127.0.0.1:${port}${BASE} (loopback only)`);

let browser;
try {
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.error(
      '[resume-pdf] Chromium is not installed — run `npx playwright install chromium` from `web/` '
        + '(the quality and deploy workflows run it before the build).',
    );
    throw error;
  }

  for (const target of LOCALES) {
    const { locale, size, pages } = await generate(browser, target, port);
    console.log(`[resume-pdf] web/dist/resume-${locale}.pdf: ${size} bytes, ${pages} page(s)`);
  }
} finally {
  if (browser) await browser.close();
  server.close();
  server.closeAllConnections?.();
}
