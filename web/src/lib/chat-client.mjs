const MAX_HISTORY_MESSAGES = 6;
const SAFE_DIAGNOSTICS = new Set([
  'provider_stream_failed',
  'response_timeout',
  'chat_stream_ended',
  'chat_stream_invalid',
  'chat_stream_failed',
  'chat_request_failed',
]);

export class ChatClientError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ChatClientError';
    this.code = SAFE_DIAGNOSTICS.has(code) ? code : 'chat_request_failed';
  }
}

/** Keep only the history entries accepted by the Worker. */
export function boundChatHistory(history) {
  return Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : [];
}

/** Append untrusted visitor/model content as text, never as parsed markup. */
export function appendChatMessage(container, role, content, documentRef = globalThis.document) {
  const item = documentRef.createElement('li');
  item.className = `assistant__message assistant__message--${role}`;
  item.textContent = String(content);
  container.append(item);
  return item;
}

/** Consume Worker SSE frames, exposing only content and fixed diagnostic codes. */
export async function consumeChatStream(response, onContent = () => {}, { signal } = {}) {
  if (!response?.ok || !response.body) throw new ChatClientError('chat_request_failed');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let terminal = null;

  const cancelled = () => ({ content, status: 'cancelled', errorCode: null });
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  const onAbort = () => cancelReader();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();

  const consumeFrame = (frame) => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) return;

    let event;
    try {
      event = JSON.parse(data);
    } catch {
      terminal = { status: 'error', errorCode: 'chat_stream_invalid' };
      return;
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;

    if (typeof event.content === 'string' && event.content.length > 0) {
      content += event.content;
      onContent(event.content, content);
    }
    if (event.done === true) {
      const hasError = typeof event.error === 'string' && event.error.length > 0;
      const diagnostic = typeof event.diagnosticCode === 'string' && SAFE_DIAGNOSTICS.has(event.diagnosticCode)
        ? event.diagnosticCode
        : null;
      terminal = diagnostic || hasError
        ? { status: 'error', errorCode: diagnostic ?? 'chat_stream_failed' }
        : { status: 'complete', errorCode: null };
    }
  };

  try {
    while (!terminal) {
      const { done, value } = await reader.read();
      if (signal?.aborted) return cancelled();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1 && !terminal) {
        consumeFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
    }

    if (signal?.aborted) return cancelled();
    if (terminal) return { content, ...terminal };

    buffer += decoder.decode().replace(/\r\n/g, '\n');
    if (buffer.trim() !== '') consumeFrame(buffer);
    if (signal?.aborted) return cancelled();
    return terminal
      ? { content, ...terminal }
      : { content, status: 'error', errorCode: 'chat_stream_ended' };
  } catch {
    if (signal?.aborted) return cancelled();
    return { content, status: 'error', errorCode: 'chat_stream_failed' };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/** Submit one same-origin chat request; transport details never reach the UI. */
export async function sendChat({
  endpoint,
  message,
  history = [],
  locale = 'en',
  signal,
  onContent,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/') || endpoint.startsWith('//')) {
    throw new ChatClientError('chat_request_failed');
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: boundChatHistory(history), locale }),
      signal,
    });
  } catch {
    if (signal?.aborted) return { content: '', status: 'cancelled', errorCode: null };
    throw new ChatClientError('chat_request_failed');
  }

  return consumeChatStream(response, onContent, { signal });
}
