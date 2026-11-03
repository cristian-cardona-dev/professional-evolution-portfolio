import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  appendChatMessage,
  boundChatHistory,
  consumeChatStream,
  sendChat,
} from '../src/lib/chat-client.mjs';

function responseWithChunks(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index === chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index++]));
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

test('consumeChatStream parses SSE frames split across byte chunks and renders each content delta', async () => {
  const deltas = [];
  const result = await consumeChatStream(
    responseWithChunks([
      'data: {"content":"Hel',
      'lo","done":false}\r',
      '\n\r\n',
      'data: {"content":" world","done":true}\n\n',
    ]),
    (delta) => deltas.push(delta),
  );

  assert.deepEqual(deltas, ['Hello', ' world']);
  assert.deepEqual(result, { content: 'Hello world', status: 'complete', errorCode: null });
});

test('consumeChatStream preserves partial text and exposes only the fixed provider failure code', async () => {
  const result = await consumeChatStream(responseWithChunks([
    'data: {"content":"partial answer","done":false}\n\n',
    'data: {"content":"","done":true,"error":"stream_interrupted","diagnosticCode":"provider_stream_failed","detail":"private provider sentinel"}\n\n',
  ]));

  assert.deepEqual(result, {
    content: 'partial answer',
    status: 'error',
    errorCode: 'provider_stream_failed',
  });
  assert.equal(JSON.stringify(result).includes('private provider sentinel'), false);
});

test('consumeChatStream reports an unterminated response as an error rather than success', async () => {
  const result = await consumeChatStream(responseWithChunks([
    'data: {"content":"unfinished","done":false}\n\n',
  ]));

  assert.deepEqual(result, { content: 'unfinished', status: 'error', errorCode: 'chat_stream_ended' });
});

test('boundChatHistory sends only the last six entries without mutating page history', () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index}`,
  }));

  assert.deepEqual(boundChatHistory(history), history.slice(2));
  assert.equal(history.length, 8);
});

test('appendChatMessage renders visitor and model text as text, never as markup', () => {
  const dom = new JSDOM('<ol id="transcript"></ol>');
  const transcript = dom.window.document.querySelector('#transcript');
  const message = '<img src=x onerror="alert(1)"> & hello';

  const item = appendChatMessage(transcript, 'user', message, dom.window.document);

  assert.equal(item.textContent, message);
  assert.equal(transcript.querySelector('img'), null);
  assert.equal(item.className, 'assistant__message assistant__message--user');
});

test('sendChat posts only through its injected same-origin endpoint and bounds submitted history', async () => {
  let request;
  const history = Array.from({ length: 7 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `prior-${index}`,
  }));
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return responseWithChunks(['data: {"content":"ok","done":true}\n\n']);
  };

  const result = await sendChat({
    endpoint: '/professional-evolution-portfolio/api/chat',
    message: 'question',
    history,
    locale: 'es',
    fetchImpl,
  });

  assert.equal(request.url, '/professional-evolution-portfolio/api/chat');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), {
    message: 'question',
    history: history.slice(-6),
    locale: 'es',
  });
  assert.equal(result.content, 'ok');
});

test('sendChat replaces raw transport failures with a safe fixed error', async () => {
  const sentinel = 'raw-worker-error-private-sentinel';

  await assert.rejects(
    sendChat({
      endpoint: '/api/chat',
      message: 'question',
      fetchImpl: async () => { throw new Error(sentinel); },
    }),
    (error) => error.code === 'chat_request_failed' && !error.message.includes(sentinel),
  );
});

test('consumeChatStream cancels its reader when the caller aborts', async () => {
  let streamController;
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { streamController = controller; },
    cancel() { cancelled = true; },
  });
  const abortController = new AbortController();
  const reading = consumeChatStream(new Response(body), () => {}, { signal: abortController.signal });

  abortController.abort();

  assert.deepEqual(await reading, { content: '', status: 'cancelled', errorCode: null });
  assert.equal(cancelled, true);
  void streamController;
});
