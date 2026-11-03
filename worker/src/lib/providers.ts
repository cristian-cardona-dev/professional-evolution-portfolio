/**
 * Free-only provider chain.
 *
 * Binding policy (2026-11 free-worker tranche): Cloudflare Workers AI is the
 * ONLY provider. No API-key environment variable can activate any other
 * provider, and the model is a fixed allowlisted literal — never selected from
 * the environment. When the `AI` binding is absent the chain fails closed with
 * a sanitized configuration error; no fallback inference path exists.
 */

export interface Provider {
	name: string;
	call(messages: Message[], options?: CallOptions): Promise<ProviderResponse>;
	stream(messages: Message[], options?: CallOptions): AsyncIterable<StreamChunk>;
}

export interface Message {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface CallOptions {
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	signal?: AbortSignal;
}

export interface ProviderResponse {
	content: string;
	provider: string;
	model: string;
	usage?: { promptTokens: number; completionTokens: number };
}

export interface StreamChunk {
	content: string;
	done: boolean;
	provider: string;
	model: string | null;
	diagnosticCode?: FailureCode;
}

/** Sanitized failure category for diagnostic purposes only. */
export type FailureCode = 'ai_run_rejected' | 'stream_read_failed' | 'empty_output';

/** Internal error class that carries a failure code without leaking details. */
class ProviderFailure extends Error {
	readonly failureCode: FailureCode;
	constructor(code: FailureCode) {
		super('Cloudflare AI stream failed');
		this.name = 'ProviderFailure';
		this.failureCode = code;
	}
}

/**
 * Minimal structural type for the Cloudflare Workers AI binding declared in
 * `worker/wrangler.jsonc` (`"ai": { "binding": "AI" }`). Kept structural so
 * tests can inject mocks without the full Workers runtime.
 */
export interface WorkersAIBinding {
	run(model: string, input: unknown): Promise<unknown>;
}

/** Environment accepted by the provider chain: only the `AI` binding matters. */
export interface ProviderEnv {
	AI?: WorkersAIBinding;
}

/**
 * The only allowlisted inference model in this tranche: Cloudflare Workers AI
 * (free-tier eligible). Literal by design — not environment-selectable.
 */
export const CLOUDFLARE_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

/** Sanitized configuration error — carries no secret or provider detail. */
const AI_CONFIG_ERROR =
	'AI provider not configured: the Cloudflare Workers AI binding (env.AI) is required';

/** Sanitized internal error used when inference fails after output began. */
const STREAM_INTERRUPTED_ERROR = 'Stream interrupted after output began';

/** Sanitized message shown to visitors when no provider content is available. */
const CHAT_UNAVAILABLE_MESSAGE =
	'El chat no está disponible ahora. Usa el formulario de contacto.';

interface WorkersAIStreamChunk {
	response?: string;
	text?: string;
	delta?: string;
}

interface WorkersAIResponse {
	response?: string;
}

/**
 * Incremental parser for Cloudflare Workers AI streaming SSE over a
 * `ReadableStream<Uint8Array>`. The Workers AI docs describe the wire format
 * as binary SSE frames such as `data: {"response":"..."}\n\n`, terminated by
 * `data: [DONE]\n\n`.
 *
 * Decodes UTF-8 across arbitrary byte-chunk boundaries (so a multibyte
 * character split across reads is reassembled correctly) and extracts only
 * the JSON `response` string from each event. Malformed frames throw
 * `ProviderFailure('stream_read_failed')` — no raw bytes or inner errors
 * ever escape.
 */
class SSEByteParser {
	private decoder = new TextDecoder('utf-8');
	private buffer = '';
	private sawDone = false;

	/** True once a `[DONE]` data event has been observed. */
	isDone(): boolean {
		return this.sawDone;
	}

	/** Push a byte chunk and return any complete response strings extracted. */
	push(chunk: Uint8Array): string[] {
		if (this.sawDone) return [];
		this.buffer += this.decoder.decode(chunk, { stream: true });
		return this.drain({ final: false });
	}

	/** Flush any trailing incomplete bytes and return remaining responses. */
	finalize(): string[] {
		if (this.sawDone) return [];
		try {
			this.buffer += this.decoder.decode();
		} catch {
			throw new ProviderFailure('stream_read_failed');
		}
		return this.drain({ final: true });
	}

	private drain(opts: { final: boolean }): string[] {
		const responses: string[] = [];
		// SSE events are separated by a blank line. Normalize CRLF to LF so a
		// single `\n\n` search catches both `\n\n` and `\r\n\r\n` endings.
		this.buffer = this.buffer.replace(/\r\n/g, '\n');

		while (!this.sawDone) {
			const idx = this.buffer.indexOf('\n\n');
			if (idx === -1) break;
			const eventText = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + 2);
			const parsed = this.parseEvent(eventText);
			if (parsed !== null) responses.push(parsed);
		}

		if (opts.final && !this.sawDone && this.buffer.trim().length > 0) {
			const parsed = this.parseEvent(this.buffer);
			this.buffer = '';
			if (parsed !== null) responses.push(parsed);
		}

		return responses;
	}

	private parseEvent(eventText: string): string | null {
		const lines = eventText.split('\n');
		const dataLines: string[] = [];
		for (const line of lines) {
			if (line.startsWith('data:')) {
				// The SSE spec allows optional whitespace after `data:`.
				dataLines.push(line.slice(5).replace(/^[ \t]/, ''));
			}
			// Other field lines (`event:`, `id:`, `retry:`, comments) are ignored.
		}
		if (dataLines.length === 0) return null; // comment-only or unknown-field event
		const data = dataLines.join('\n');
		if (data === '[DONE]') {
			this.sawDone = true;
			return null;
		}
		try {
			const parsed = JSON.parse(data);
			if (parsed && typeof parsed.response === 'string') return parsed.response;
			// Valid JSON but no string `response` field — not a recognized frame.
			throw new Error('missing response field');
		} catch {
			throw new ProviderFailure('stream_read_failed');
		}
	}
}

/**
 * Cloudflare AI Provider — the sole provider in this tranche, activated
 * exclusively by the `AI` binding (no API key, no env-selected model).
 */
export class CloudflareAIProvider implements Provider {
	name = 'cloudflare-ai';
	/** Allowlisted model — a fixed literal, never read from the environment. */
	readonly model = CLOUDFLARE_MODEL;
	private env: ProviderEnv;

	constructor(env: ProviderEnv) {
		this.env = env;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		const ai = this.env?.AI;
		if (!ai) {
			throw new Error(AI_CONFIG_ERROR);
		}

		const input = {
			messages: messages.map(m => ({ role: m.role, content: m.content })),
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 1024,
			stream: false,
		};

		const response = (await ai.run(this.model, input)) as WorkersAIResponse;

		return {
			content: response.response ?? '',
			provider: this.name,
			model: this.model,
		};
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		const ai = this.env?.AI;
		if (!ai) {
			throw new Error(AI_CONFIG_ERROR);
		}

		const input = {
			messages: messages.map(m => ({ role: m.role, content: m.content })),
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 1024,
			stream: true,
		};

		let streamResult: unknown;
		try {
			streamResult = await ai.run(this.model, input);
		} catch {
			// AI.run rejected — classify as ai_run_rejected
			throw new ProviderFailure('ai_run_rejected');
		}

		try {
			if (streamResult && typeof (streamResult as { getReader?: unknown }).getReader === 'function') {
				const reader = (streamResult as ReadableStream<unknown>).getReader();
				let streamFinished = false;
				let streamCancelled = false;
				const cancelReader = () => {
					if (streamFinished || streamCancelled) return;
					streamCancelled = true;
					void reader.cancel('chat stream cancelled').catch(() => undefined);
				};
				const abortStream = () => cancelReader();
				options.signal?.addEventListener('abort', abortStream, { once: true });
				if (options.signal?.aborted) cancelReader();

				// Lazy-initialized SSE byte parser (only when chunks are Uint8Array).
				// The Cloudflare Workers AI docs describe streaming as binary SSE over
				// a ReadableStream<Uint8Array>, but we preserve the object-chunk path
				// for backward compatibility with test fixtures.
				let byteParser: SSEByteParser | null = null;

				try {
					while (!streamCancelled && !options.signal?.aborted) {
						const { done, value: chunk } = await reader.read();
						if (done) {
							streamFinished = true;
							// Flush any remaining buffered content from the byte parser.
							if (byteParser) {
								for (const content of byteParser.finalize()) {
									yield { content, done: false, provider: this.name, model: this.model };
								}
							}
							break;
						}

						if (chunk instanceof Uint8Array) {
							// Binary SSE path — decode UTF-8 incrementally and parse events.
							if (!byteParser) byteParser = new SSEByteParser();
							for (const content of byteParser.push(chunk)) {
								yield { content, done: false, provider: this.name, model: this.model };
							}
							if (byteParser.isDone()) {
								streamFinished = true;
								break;
							}
						} else {
							// Legacy object-chunk path for compatibility with test fixtures.
							const objChunk = chunk as WorkersAIStreamChunk | null;
							const content = objChunk?.response || objChunk?.text || objChunk?.delta;
							if (content) yield { content, done: false, provider: this.name, model: this.model };
						}
					}
				} finally {
					options.signal?.removeEventListener('abort', abortStream);
					if (!streamFinished) cancelReader();
					try { reader.releaseLock(); } catch { /* a pending stream read owns the lock */ }
				}
			} else {
				const asyncStream = streamResult as AsyncIterable<WorkersAIStreamChunk>;
				for await (const chunk of asyncStream) {
					const content = chunk?.response || chunk?.text || chunk?.delta;
					if (content) {
						yield { content, done: false, provider: this.name, model: this.model };
					}
				}
			}
		} catch {
			// Stream reading failed — classify as stream_read_failed
			// The chain decides whether another provider may be tried. Never
			// make a second inference with this provider after a stream error.
			throw new ProviderFailure('stream_read_failed');
		}

		yield { content: '', done: true, provider: this.name, model: this.model };
	}
}

/**
 * Provider chain. In this tranche it is always constructed with the single
 * Cloudflare provider; a provider is only advanced past when it emitted no
 * content at all, so fallback never happens after output has begun.
 */
export class ProviderChain {
	readonly providers: Provider[];

	constructor(providers: Provider[]) {
		this.providers = providers;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		let lastError: Error | null = null;

		for (const provider of this.providers) {
			try {
				const response = await provider.call(messages, options);
				return response;
			} catch (error) {
				console.warn(`Provider ${provider.name} failed`);
				lastError = error instanceof Error ? error : new Error(String(error));
				continue;
			}
		}

		throw lastError ?? new Error('All providers failed');
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		// Track the last failure code for the exhausted-before-content fallback.
		// Start undefined — only set when we know the actual failure mode.
		let lastFailureCode: FailureCode | undefined = undefined;

		for (const provider of this.providers) {
			let hasContent = false;
			let model: string | null = null;
			try {
				if (!provider.stream) {
					console.warn(`Provider ${provider.name} does not support streaming`);
					continue;
				}
				for await (const chunk of provider.stream(messages, options)) {
					if (chunk.done) {
						// Don't yield bare done markers; they don't constitute content
						continue;
					}
					if (chunk.content && chunk.content.length > 0) {
						hasContent = true;
						model = chunk.model;
						yield chunk;
					}
				}
				if (hasContent) {
					yield { content: '', done: true, provider: provider.name, model };
					return;
				}
				// Provider completed normally but yielded no content — empty_output.
				lastFailureCode = 'empty_output';
				console.warn(`Provider ${provider.name} yielded no content, advancing to fallback`);
			} catch (error) {
				console.warn(`Streaming provider ${provider.name} failed`);
				if (hasContent) {
					throw new Error(STREAM_INTERRUPTED_ERROR);
				}
				// Capture the provider's failure code only if it's a recognized ProviderFailure.
				// Unknown exceptions leave lastFailureCode undefined — no diagnostic emitted.
				if (error instanceof ProviderFailure) {
					lastFailureCode = error.failureCode;
				}
				continue;
			}
		}

		// All providers failed or yielded nothing: end with a sanitized error.
		// Include diagnosticCode only if we identified a specific failure mode.
		const fallbackChunk: StreamChunk = {
			content: CHAT_UNAVAILABLE_MESSAGE,
			done: true,
			provider: 'fallback',
			model: null,
		};
		if (lastFailureCode !== undefined) {
			fallbackChunk.diagnosticCode = lastFailureCode;
		}
		yield fallbackChunk;
	}
}

/**
 * Create the provider chain from the Worker environment.
 *
 * Free-only policy: Cloudflare Workers AI is the sole provider. The chain is
 * built only when the `AI` binding exists; every other environment variable
 * (API key or model name) is ignored and can never add a provider. Without
 * the binding the chain fails closed with a sanitized configuration error.
 */
export function createProviderChain(env: ProviderEnv): ProviderChain {
	if (!env?.AI) {
		throw new Error(AI_CONFIG_ERROR);
	}

	return new ProviderChain([new CloudflareAIProvider(env)]);
}
