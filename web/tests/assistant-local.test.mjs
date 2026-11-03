/**
 * Pages assistant locality regression (free-only Worker provider chain, Task 5).
 *
 * The shipped `AssistantWidget.astro` must keep the local search documented in
 * `docs/assistant.md`: keyword search over the index embedded at build time,
 * plus at most one same-origin fetch of the build-generated static
 * `semantic-index.json` asset. It must never talk to the chat Worker — no
 * `/api/chat`, no `/api/assistant`, no streaming/XHR transport — so no prompt,
 * key, visitor IP or Personal OS data can leave the page through this widget.
 *
 * The contract is expressed once (`assertLocalAssistant`) and applied to the
 * real component source; the final tests run the same contract against
 * deliberately mutated copies to prove the gate is not vacuous — the exact
 * regressions (wiring the widget to the Worker) this test exists to catch.
 *
 * Source-level, not dist-level, on purpose: `ChatWidget.astro` (a separate,
 * legacy component) legitimately contains `/api/chat`, so only the assistant
 * component is under this contract, and its source is where its runtime
 * behaviour is defined.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDGET = resolve(WEB, 'src', 'components', 'AssistantWidget.astro');
const ASTRO_CONFIG = resolve(WEB, 'astro.config.mjs');
const COPY = resolve(WEB, 'src', 'i18n', 'copy.ts');

/** Worker endpoints the Pages assistant may never call. */
const FORBIDDEN_ENDPOINTS = ['/api/chat', '/api/assistant'];

/**
 * The locality contract, shared by the real-widget test and the mutation
 * self-checks so both go through exactly the same assertions.
 *
 * @param {string} source - contents of `AssistantWidget.astro`
 * @param {string} label - what is being checked, for failure messages
 */
function assertLocalAssistant(source, label) {
  for (const endpoint of FORBIDDEN_ENDPOINTS) {
    assert.ok(
      !source.includes(endpoint),
      `${label} must not reference ${endpoint}: the Pages assistant stays on the local search`,
    );
  }

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

  // No transport that could stream a prompt to a backend.
  assert.ok(
    !/\b(EventSource|WebSocket|XMLHttpRequest)\b/.test(source),
    `${label} must not open a streaming/XHR transport`,
  );
}

test('AssistantWidget.astro stays local: one same-origin semantic-index fetch, no /api/chat or /api/assistant', () => {
  const source = readFileSync(WIDGET, 'utf8');
  assertLocalAssistant(source, 'AssistantWidget.astro');
});

test('self-check: the contract rejects a widget wired to /api/chat', () => {
  const source = readFileSync(WIDGET, 'utf8');
  const mutated = `${source}\nawait fetch('/api/chat');\n`;
  assert.throws(() => assertLocalAssistant(mutated, 'mutated widget'), /\/api\/chat/);
});

test('self-check: the contract rejects a widget wired to /api/assistant', () => {
  const source = readFileSync(WIDGET, 'utf8');
  const mutated = `${source}\nawait fetch('/api/assistant');\n`;
  assert.throws(() => assertLocalAssistant(mutated, 'mutated widget'), /\/api\/assistant/);
});

test('self-check: the contract rejects a second fetch to an external Worker URL', () => {
  const source = readFileSync(WIDGET, 'utf8');
  const mutated = `${source}\nawait fetch('https://chat-worker.example.workers.dev/chat');\n`;
  assert.throws(() => assertLocalAssistant(mutated, 'mutated widget'), /exactly one resource/);
});

test('self-check: the contract rejects a streaming transport', () => {
  const source = readFileSync(WIDGET, 'utf8');
  const mutated = `${source}\nconst stream = new WebSocket('wss://chat-worker.example.workers.dev');\n`;
  assert.throws(() => assertLocalAssistant(mutated, 'mutated widget'), /streaming\/XHR transport/);
});

test('production submission remains local search behind an explicit development-only chat branch', () => {
  const source = readFileSync(WIDGET, 'utf8');

  assert.match(
    source,
    /if\s*\(import\.meta\.env\.DEV\)\s*\{[\s\S]*?runChat\(input\.value\)[\s\S]*?\}\s*else\s*\{[\s\S]*?run\(input\.value\)/,
    'only Astro dev may submit to chat; the production branch must keep local search',
  );
  assertLocalAssistant(source, 'AssistantWidget.astro production search path');
});

test('dev script receives localized status copy through its DOM boundary', () => {
  const source = readFileSync(WIDGET, 'utf8');
  const scriptStart = source.indexOf('<script>');
  const script = source.slice(scriptStart, source.indexOf('</script>', scriptStart));

  assert.match(source, /data-chat-pending=\{devChatMode \? copy\.assistant\.chatPending : undefined\}/);
  assert.match(source, /data-chat-provider-stream-failed=\{\s*devChatMode \? copy\.assistant\.chatProviderStreamFailed : undefined\s*\}/);
  assert.match(script, /root\.dataset\.chatPending/);
  assert.match(script, /root\.dataset\.chatProviderStreamFailed/);
  assert.doesNotMatch(script, /copy\.assistant\.chat/);
});

test('Astro dev proxy matches the configured project base and rewrites to the Worker chat route', async () => {
  const config = (await import(pathToFileURL(ASTRO_CONFIG).href)).default;
  const basePrefix = config.base.replace(/\/$/, '');
  const path = `${basePrefix}/api/chat`;
  const proxy = config.vite?.server?.proxy?.[path];

  assert.ok(proxy, `expected a dev server proxy for ${path}`);
  assert.equal(proxy.target, 'https://portfolio-ai-chat-worker.crisss198.workers.dev');
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
