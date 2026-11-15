/**
 * Pages assistant endpoint-allowlist regression (v2 chat contract).
 *
 * The shipped `AssistantWidget.astro` keeps the local search documented in
 * `docs/assistant.md`: keyword search over the index embedded at build time,
 * plus at most one same-origin fetch of the build-generated static
 * `semantic-index.json` asset. On top of that (v2), it may talk to exactly
 * ONE backend: the chat Worker, reached exclusively through
 * `web/src/lib/chat-config.mjs` — a single origin and a single path.
 *
 * So the widget itself must contain neither the Worker origin literal nor an
 * `/api/chat` literal: those live only in `chat-config.mjs`, which the widget
 * imports. `/api/lead` and `/api/assistant` remain forbidden everywhere, and
 * the Astro dev proxy target must equal the allowlisted origin so dev and
 * production hit the same Worker.
 *
 * The contract is expressed once (`assertAssistantContract`) and applied to
 * the real component source; the final tests run the same contract against
 * deliberately mutated copies to prove the gate is not vacuous.
 *
 * Source-level, not dist-level, on purpose: the widget's source is where its
 * runtime wiring is defined.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDGET = resolve(WEB, 'src', 'components', 'AssistantWidget.astro');
const CHAT_CONFIG = resolve(WEB, 'src', 'lib', 'chat-config.mjs');
const ASTRO_CONFIG = resolve(WEB, 'astro.config.mjs');
const COPY = resolve(WEB, 'src', 'i18n', 'copy.ts');

/** Endpoints the Pages assistant may never reference (even allowlisted chat must go through chat-config). */
const FORBIDDEN_ENDPOINTS = ['/api/chat', '/api/assistant', '/api/lead'];

const widgetSource = readFileSync(WIDGET, 'utf8');
const chatConfigSource = readFileSync(CHAT_CONFIG, 'utf8');

/** The single allowlisted Worker origin, parsed from chat-config.mjs source. */
const ALLOWED_ORIGIN = /export const CHAT_WORKER_ORIGIN = '([^']+)'/.exec(chatConfigSource)?.[1];

/**
 * The locality + allowlist contract, shared by the real-widget test and the
 * mutation self-checks so both go through exactly the same assertions.
 *
 * @param {string} source - contents of `AssistantWidget.astro`
 * @param {string} label - what is being checked, for failure messages
 */
function assertAssistantContract(source, label) {
  // No endpoint literal at all — the only route to any backend is the
  // chat-config import (the origin/path literals live there alone).
  for (const endpoint of FORBIDDEN_ENDPOINTS) {
    assert.ok(
      !source.includes(endpoint),
      `${label} must not reference ${endpoint}: endpoints are declared only in lib/chat-config.mjs`,
    );
  }
  assert.ok(
    !/portfolio-ai-chat-worker|workers\.dev/.test(source),
    `${label} must not contain the Worker origin literal: it lives only in lib/chat-config.mjs`,
  );

  // Exactly one fetch in the whole widget: the build-generated semantic index.
  const fetchCalls = source.match(/fetch\s*\(/g) ?? [];
  assert.equal(
    fetchCalls.length,
    1,
    `${label} should fetch exactly one resource (the build-generated semantic index), found ${fetchCalls.length}`,
  );

  // That single fetch must be the static, same-origin asset the build wrote:
  // site base URL + `SEMANTIC_INDEX_FILE`, with no credentials attached.
  assert.match(
    source,
    /SEMANTIC_INDEX_FILE/,
    `${label} must fetch the build-generated SEMANTIC_INDEX_FILE`,
  );
  assert.match(
    source,
    /import\.meta\.env\.BASE_URL/,
    `${label} must resolve the index from the site base URL (same origin)`,
  );
  assert.match(
    source,
    /fetch\s*\(\s*url\s*,\s*\{\s*credentials:\s*'omit'\s*\}\s*\)/,
    `${label} must fetch the index with credentials omitted`,
  );

  // No transport that could stream a prompt outside the allowlisted path.
  assert.ok(
    !/\b(EventSource|WebSocket|XMLHttpRequest)\b/.test(source),
    `${label} must not open a streaming/XHR transport`,
  );
}

test('chat-config.mjs declares exactly one Worker origin and the /api/chat path', () => {
  assert.ok(ALLOWED_ORIGIN, 'chat-config.mjs must export CHAT_WORKER_ORIGIN');
  assert.match(ALLOWED_ORIGIN, /^https:\/\/.+\.workers\.dev$/);
  assert.match(chatConfigSource, /export const CHAT_API_PATH = '\/api\/chat'/);
  assert.match(chatConfigSource, /export function resolveChatWorkerUrl\(\)/);
  assert.match(chatConfigSource, /import\.meta\.env\.DEV/, 'CHAT_IS_DEV / resolve must honour dev mode');
});

test('AssistantWidget.astro honours the allowlist: endpoints only via chat-config import', () => {
  assertAssistantContract(widgetSource, 'AssistantWidget.astro');
  // Both the server frontmatter and the client script resolve through the
  // one module — no second origin/path definition anywhere.
  const imports = widgetSource.match(/import \{[^}]*resolveChatWorkerUrl[^}]*\} from '\.\.\/lib\/chat-config\.mjs'/g) ?? [];
  assert.equal(imports.length, 2, 'both frontmatter and client script must import resolveChatWorkerUrl from chat-config');
  assert.match(widgetSource, /import \{ CHAT_IS_DEV, resolveChatWorkerUrl \}/, 'frontmatter must gate copy on CHAT_IS_DEV');
});

test('self-check: the contract rejects a widget wired to /api/chat directly', () => {
  const mutated = `${widgetSource}\nawait fetch('/api/chat');\n`;
  assert.throws(() => assertAssistantContract(mutated, 'mutated widget'), /\/api\/chat/);
});

test('self-check: the contract rejects a widget wired to /api/assistant', () => {
  const mutated = `${widgetSource}\nawait fetch('/api/assistant');\n`;
  assert.throws(() => assertAssistantContract(mutated, 'mutated widget'), /\/api\/assistant/);
});

test('self-check: the contract rejects a hardcoded Worker origin in the widget', () => {
  const mutated = `${widgetSource}\nconst x = '${ALLOWED_ORIGIN}';\n`;
  assert.throws(() => assertAssistantContract(mutated, 'mutated widget'), /origin literal/);
});

test('self-check: the contract rejects a second fetch to an external Worker URL', () => {
  const mutated = `${widgetSource}\nawait fetch('https://chat.example.com/chat');\n`;
  assert.throws(() => assertAssistantContract(mutated, 'mutated widget'), /exactly one resource/);
});

test('self-check: the contract rejects a streaming transport', () => {
  const mutated = `${widgetSource}\nconst stream = new WebSocket('wss://chat.example.com');\n`;
  assert.throws(() => assertAssistantContract(mutated, 'mutated widget'), /streaming\/XHR transport/);
});

test('chat is resolved through resolveChatWorkerUrl; submission gated on chatWorkerUrl', () => {
  assert.match(
    widgetSource,
    /const chatWorkerUrl = resolveChatWorkerUrl\(\);/,
    'both script halves must resolve the endpoint through chat-config',
  );
  assert.match(
    widgetSource,
    /if\s*\(\s*chatWorkerUrl\s*\)\s*\{[\s\S]*?runChat\(input\.value\)[\s\S]*?\}\s*else\s*\{[\s\S]*?run\(input\.value\)/,
    'chat submission must use runChat when chat mode is active, local search otherwise',
  );
  assertAssistantContract(widgetSource, 'AssistantWidget.astro production search path');
});

test('assistant:ask deep link follows the same chat/local gate', () => {
  assert.match(
    widgetSource,
    /if\s*\(\s*chatWorkerUrl\s*\)\s*void\s*runChat\(query\)[\s\S]*?else\s*void\s*run\(query\)/,
    'deep-linked queries must follow the same chat/local gate',
  );
});

test('dev script receives localized status copy through its DOM boundary', () => {
  const scriptStart = widgetSource.indexOf('<script>');
  const script = widgetSource.slice(scriptStart, widgetSource.indexOf('</script>', scriptStart));

  assert.match(widgetSource, /data-chat-pending=\{chatWorkerUrl \? copy\.assistant\.chatPending : undefined\}/);
  assert.match(widgetSource, /data-chat-provider-stream-failed=\{\s*chatWorkerUrl \? copy\.assistant\.chatProviderStreamFailed : undefined\s*\}/);
  assert.match(script, /root\.dataset\.chatPending/);
  assert.match(script, /root\.dataset\.chatProviderStreamFailed/);
  assert.doesNotMatch(script, /copy\.assistant\.chat/);
});

test('Astro dev proxy matches the allowlisted Worker origin and rewrites to /api/chat', async () => {
  const config = (await import(pathToFileURL(ASTRO_CONFIG).href)).default;
  const basePrefix = config.base.replace(/\/$/, '');
  const path = `${basePrefix}/api/chat`;
  const proxy = config.vite?.server?.proxy?.[path];

  assert.ok(proxy, `expected a dev server proxy for ${path}`);
  assert.equal(proxy.target, ALLOWED_ORIGIN, 'dev proxy target must equal the chat-config allowlisted origin');
  assert.equal(proxy.rewrite(path), '/api/chat');
  assert.equal(config.vite?.preview?.proxy?.[path], undefined, 'the Worker proxy must not be a preview runtime route');
});

test('English and Spanish development notice and tool description disclose transient Cloudflare AI use', () => {
  const source = readFileSync(COPY, 'utf8');
  const spanishStart = source.indexOf('  assistant: {', source.indexOf('export const es'));
  const spanishNoticeStart = source.indexOf('devNotice:', spanishStart);
  const spanishToolStart = source.indexOf('devToolDescription:', spanishNoticeStart);
  const spanishModeStart = source.indexOf('devMode:', spanishToolStart);
  const spanishNotice = source.slice(spanishNoticeStart, spanishToolStart);
  const spanishTool = source.slice(spanishToolStart, spanishModeStart);

  assert.ok(source.includes('Development only: messages you submit are sent transiently to Cloudflare AI'));
  assert.ok(source.includes('Development only: sends your message and recent chat history transiently to Cloudflare AI'));
  assert.ok(spanishNotice.includes('Solo en desarrollo:') && spanishNotice.includes('transitoria') && spanishNotice.includes('Cloudflare AI'));
  assert.ok(spanishNotice.includes('cuota gratuita de producci\\u00f3n'));
  assert.ok(spanishTool.includes('Solo en desarrollo:') && spanishTool.includes('transitoria') && spanishTool.includes('Cloudflare AI'));
  assert.ok(spanishTool.includes('cuota gratuita de producci\\u00f3n'));
});

test('English and Spanish production chat notice discloses transient Cloudflare AI use without dev label', () => {
  const source = readFileSync(COPY, 'utf8');
  const englishStart = source.indexOf('export const en');
  const englishAssistantStart = source.indexOf('assistant: {', englishStart);
  const englishChatNoticeStart = source.indexOf('chatNotice:', englishAssistantStart);
  const englishChatNoticeEnd = source.indexOf('devToolDescription:', englishChatNoticeStart);
  const englishChatNotice = source.slice(englishChatNoticeStart, englishChatNoticeEnd);
  const spanishStart = source.indexOf('export const es');
  const spanishAssistantStart = source.indexOf('assistant: {', spanishStart);
  const spanishChatNoticeStart = source.indexOf('chatNotice:', spanishAssistantStart);
  const spanishChatNoticeEnd = source.indexOf('devToolDescription:', spanishChatNoticeStart);
  const spanishChatNotice = source.slice(spanishChatNoticeStart, spanishChatNoticeEnd);

  assert.ok(englishChatNotice.includes('Cloudflare AI'));
  assert.ok(!englishChatNotice.includes('Development only'));
  assert.ok(spanishChatNotice.includes('Cloudflare AI'));
  assert.ok(spanishChatNotice.includes('transitoria'));
  assert.ok(!spanishChatNotice.includes('Solo en desarrollo'));
});

test('widget banner/mode/tools gate on CHAT_IS_DEV: dev copy in dev, production chat copy otherwise', () => {
  assert.match(
    widgetSource,
    /chatWorkerUrl\s*\?\s*\(\s*CHAT_IS_DEV\s*\?\s*copy\.assistant\.devNotice\s*:\s*copy\.assistant\.chatNotice\s*\)\s*:\s*copy\.assistant\.banner/,
    'banner must select devNotice in dev and chatNotice in production',
  );
  assert.match(
    widgetSource,
    /CHAT_IS_DEV\s*\?\s*copy\.assistant\.devMode\s*:\s*copy\.assistant\.chatMode/,
    'mode line must select devMode in dev and chatMode in production',
  );
  assert.match(
    widgetSource,
    /CHAT_IS_DEV\s*\?\s*copy\.assistant\.devToolDescription\s*:\s*copy\.assistant\.chatToolDescription/,
    'tool description must select dev copy in dev and production chat copy otherwise',
  );
});

test('production chatMode and chatToolDescription keys exist with EN/ES parity', () => {
  const source = readFileSync(COPY, 'utf8');
  for (const locale of ['export const en', 'export const es']) {
    const start = source.indexOf(locale);
    assert.ok(start >= 0, `missing ${locale}`);
    const assistantStart = source.indexOf('assistant: {', start);
    const modeStart = source.indexOf('chatMode:', assistantStart);
    const toolStart = source.indexOf('chatToolDescription:', assistantStart);
    assert.ok(modeStart > assistantStart, `${locale} must define assistant.chatMode`);
    assert.ok(toolStart > assistantStart, `${locale} must define assistant.chatToolDescription`);
  }
  assert.ok(source.includes("chatMode: 'Live chat"));
  assert.ok(source.includes('chatMode: \'Chat en vivo'));
  assert.ok(source.includes('chatToolDescription:'));
});
