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
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIDGET = resolve(WEB, 'src', 'components', 'AssistantWidget.astro');

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
