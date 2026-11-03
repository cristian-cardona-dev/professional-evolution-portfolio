import { describe, it, expect, vi } from 'vitest';
import {
	createProviderChain,
	CloudflareAIProvider,
	ProviderChain,
	Provider,
	Message,
	StreamChunk,
} from '../src/lib/providers';

/** The only allowlisted model in this tranche (free-tier Cloudflare Workers AI). */
const ALLOWED_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

function makeEnv(overrides: Record<string, unknown> = {}) {
	return { AI: { run: vi.fn() }, ...overrides } as any;
}

function asyncIterableFrom<T>(chunks: T[], errorAfter?: Error): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) {
				yield chunk;
			}
			if (errorAfter) {
				throw errorAfter;
			}
		},
	};
}

function mockProvider(name: string, stream: () => AsyncIterable<StreamChunk>): Provider {
	return { name, call: vi.fn(), stream };
}

async function collectStream(chain: ProviderChain, messages: Message[] = []): Promise<StreamChunk[]> {
	const chunks: StreamChunk[] = [];
	for await (const chunk of chain.stream(messages)) {
		chunks.push(chunk);
	}
	return chunks;
}

describe('Free-only provider policy', () => {
	describe('createProviderChain', () => {
		it('configures Cloudflare Workers AI as the sole provider when env.AI exists', () => {
			const chain = createProviderChain(makeEnv());
			expect(chain.providers.map(p => p.name)).toEqual(['cloudflare-ai']);
			expect(chain.providers[0]).toBeInstanceOf(CloudflareAIProvider);
		});

		it('ignores Groq credentials and model variables', () => {
			const env = makeEnv({
				GROQ_API_KEY: 'gsk-legacy-key',
				GROQ_MODEL: 'llama-3.3-70b-versatile',
			});
			const chain = createProviderChain(env);
			expect(chain.providers.map(p => p.name)).toEqual(['cloudflare-ai']);
		});

		it('ignores Anthropic credentials and model variables', () => {
			const env = makeEnv({
				ANTHROPIC_API_KEY: 'sk-ant-legacy-key',
				ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
			});
			const chain = createProviderChain(env);
			expect(chain.providers.map(p => p.name)).toEqual(['cloudflare-ai']);
		});

		it('ignores every legacy provider variable at once', () => {
			const env = makeEnv({
				GROQ_API_KEY: 'gsk-legacy-key',
				GROQ_MODEL: 'llama-3.3-70b-versatile',
				ANTHROPIC_API_KEY: 'sk-ant-legacy-key',
				ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
			});
			const chain = createProviderChain(env);
			expect(chain.providers.map(p => p.name)).toEqual(['cloudflare-ai']);
		});

		it('fails closed with a sanitized error when the AI binding is missing', () => {
			expect(() => createProviderChain({} as any)).toThrowError(/Cloudflare Workers AI binding/);
			expect(() => createProviderChain(undefined as any)).toThrowError(/Cloudflare Workers AI binding/);
		});

		it('fails closed when only API-key variables are present (no key alone may activate a provider)', () => {
			expect(() => createProviderChain({ GROQ_API_KEY: 'gsk-legacy-key', GROQ_MODEL: 'llama-3.3-70b-versatile' } as any)).toThrowError(/Cloudflare Workers AI binding/);
			expect(() => createProviderChain({ ANTHROPIC_API_KEY: 'sk-ant-legacy-key' } as any)).toThrowError(/Cloudflare Workers AI binding/);
		});

		it('the fail-closed error leaks no credential material', () => {
			const secret = 'sk-ant-super-secret-value';
			let message = '';
			try {
				createProviderChain({ ANTHROPIC_API_KEY: secret } as any);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).toMatch(/Cloudflare Workers AI binding/);
			expect(message).not.toContain(secret);
		});
	});

	describe('allowlisted model', () => {
		it('is exactly the approved Cloudflare Workers AI literal', () => {
			const provider = new CloudflareAIProvider(makeEnv());
			expect(provider.model).toBe(ALLOWED_MODEL);
			const chain = createProviderChain(makeEnv());
			expect((chain.providers[0] as CloudflareAIProvider).model).toBe(ALLOWED_MODEL);
		});

		it('is not environment-selectable', () => {
			const env = makeEnv({
				CLOUDFLARE_MODEL: '@cf/other-model',
				AI_MODEL: '@cf/other-model',
				WORKERS_AI_MODEL: '@cf/other-model',
				GROQ_MODEL: 'llama-3.3-70b-versatile',
				ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
			});
			const chain = createProviderChain(env);
			expect((chain.providers[0] as CloudflareAIProvider).model).toBe(ALLOWED_MODEL);
		});
	});
});

describe('CloudflareAIProvider streaming', () => {
	it('does not retry the same inference after output has begun', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			asyncIterableFrom([{ response: 'partial answer' }], new Error('raw provider failure after output'))
		);
		const provider = new CloudflareAIProvider({ AI: { run } } as any);
		const chain = new ProviderChain([provider]);

		const chunks: StreamChunk[] = [];
		let streamError: Error | undefined;
		try {
			for await (const chunk of chain.stream([{ role: 'user', content: 'hi' }])) {
				chunks.push(chunk);
			}
		} catch (error) {
			streamError = error as Error;
		}

		expect(run).toHaveBeenCalledTimes(1);
		expect(chunks.map(c => c.content)).toEqual(['partial answer']);
		expect(chunks[0]).toMatchObject({ provider: 'cloudflare-ai', model: ALLOWED_MODEL });
		expect(streamError?.message).toBe('Stream interrupted after output began');
		expect(streamError?.message).not.toContain('raw provider failure');
	});

	it('does not make a second inference when the stream fails before any content', async () => {
		const run = vi.fn()
			.mockRejectedValueOnce(new Error('stream failed before content'));
		const provider = new CloudflareAIProvider({ AI: { run } } as any);
		const chain = new ProviderChain([provider]);

		const chunks = await collectStream(chain);

		expect(run).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith(ALLOWED_MODEL, expect.objectContaining({ stream: true }));
		expect(chunks).toEqual([{
			content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
			done: true,
			provider: 'fallback',
			model: null,
			diagnosticCode: 'ai_run_rejected',
		}]);
	});

	it('uses generic fallback attribution when the stream yields no content', async () => {
		const run = vi.fn()
			.mockResolvedValueOnce(asyncIterableFrom([]));
		const provider = new CloudflareAIProvider({ AI: { run } } as any);
		const chain = new ProviderChain([provider]);

		const chunks = await collectStream(chain);

		expect(run).toHaveBeenCalledTimes(1);
		expect(chunks[chunks.length - 1]).toEqual({
			content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
			done: true,
			provider: 'fallback',
			model: null,
			diagnosticCode: 'empty_output',
		});
	});

	it('cancels a readable Workers AI stream when its consumer signal aborts', async () => {
		const cancelUpstream = vi.fn();
		let first = true;
		const run = vi.fn(async () => new ReadableStream<{ response: string }>({
			pull(controller) {
				if (first) {
					first = false;
					controller.enqueue({ response: 'first' });
					return;
				}
				return new Promise<void>(() => {});
			},
			cancel: cancelUpstream,
		}, { highWaterMark: 0 }));
		const controller = new AbortController();
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const iterator = chain.stream([], { signal: controller.signal } as any)[Symbol.asyncIterator]();

		const firstChunk = await iterator.next();
		controller.abort();

		expect(firstChunk.value).toMatchObject({ content: 'first', provider: 'cloudflare-ai' });
		expect(cancelUpstream).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledOnce();
		await iterator.return?.();
	});

	it('attributes every successful chunk and terminal marker to the actual provider and model', async () => {
		const run = vi.fn().mockResolvedValueOnce(asyncIterableFrom([
			{ response: 'Hello ' },
			{ response: 'there' },
		]));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);

		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello ', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: 'there', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
	});

	it('call() fails closed when the AI binding is absent', async () => {
		const provider = new CloudflareAIProvider({} as any);
		await expect(provider.call([{ role: 'user', content: 'hi' }])).rejects.toThrowError(/Cloudflare Workers AI binding/);
	});
});

describe('ProviderChain streaming semantics', () => {
	it('advances after a pre-content error and attributes output to the succeeding provider', async () => {
		const provider1 = mockProvider('mock-1', async function* () {
			throw new Error('secret provider failure');
		});
		const provider2 = mockProvider('mock-2', async function* () {
			yield { content: 'Hello', done: false, provider: 'mock-2', model: 'mock-model-2' };
		});

		const chain = new ProviderChain([provider1, provider2]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'mock-2', model: 'mock-model-2' },
			{ content: '', done: true, provider: 'mock-2', model: 'mock-model-2' },
		]);
	});

	it('never advances after a non-empty chunk and terminates with a sanitized error', async () => {
		let secondProviderStarted = false;
		const provider1 = mockProvider('mock-1', async function* () {
			yield { content: 'partial', done: false, provider: 'mock-1', model: 'mock-model-1' };
			throw new Error('raw secret provider body');
		});
		const provider2 = mockProvider('mock-2', async function* () {
			secondProviderStarted = true;
			yield { content: 'must not append', done: false, provider: 'mock-2', model: 'mock-model-2' };
		});
		const chain = new ProviderChain([provider1, provider2]);
		const chunks: StreamChunk[] = [];
		let streamError: Error | undefined;
		try {
			for await (const chunk of chain.stream([])) chunks.push(chunk);
		} catch (error) {
			streamError = error as Error;
		}

		expect(chunks).toEqual([
			{ content: 'partial', done: false, provider: 'mock-1', model: 'mock-model-1' },
		]);
		expect(secondProviderStarted).toBe(false);
		expect(streamError?.message).toBe('Stream interrupted after output began');
		expect(streamError?.message).not.toContain('raw secret provider body');
	});

	it('does not yield empty done markers as successful content', async () => {
		const provider = mockProvider('mock', async function* () {
			yield { content: '', done: true, provider: 'mock', model: 'mock-model' };
		});

		const chain = new ProviderChain([provider]);
		const chunks = await collectStream(chain);

		// No content means the sanitized fallback message ends the stream.
		expect(chunks).toEqual([{
			content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
			done: true,
			provider: 'fallback',
			model: null,
			diagnosticCode: 'empty_output',
		}]);
	});

	it('sanitizes errors and does not expose raw provider error bodies', async () => {
		const provider = mockProvider('mock', async function* () {
			throw new Error('API error: secret-key-12345 - detailed error info');
		});

		const chain = new ProviderChain([provider]);
		const chunks = await collectStream(chain);

		const fallbackChunk = chunks.find(c => c.provider === 'fallback');
		expect(fallbackChunk).toBeDefined();
		expect(fallbackChunk!.content).not.toContain('secret-key-12345');
		expect(fallbackChunk!.content).not.toContain('detailed error info');
		expect(fallbackChunk!.content).toContain('El chat no está disponible');
		expect(fallbackChunk!.model).toBeNull();
	});
});

describe('Sanitized failure categories on fallback SSE', () => {
	const RAW_SENTINEL_RUN = 'raw-sentinel-ai-run-rejection-7f3a9b2c';
	const RAW_SENTINEL_STREAM = 'raw-sentinel-stream-read-failure-4d8e1f5a';

	it('classifies AI.run rejection as ai_run_rejected on the exhausted fallback', async () => {
		const run = vi.fn().mockRejectedValue(new Error(RAW_SENTINEL_RUN));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain, [{ role: 'user', content: 'hi' }]);
		const fallback = chunks.find(c => c.provider === 'fallback');

		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBe('ai_run_rejected');
		expect(JSON.stringify(chunks)).not.toContain(RAW_SENTINEL_RUN);
	});

	it('classifies stream read failure as stream_read_failed on the exhausted fallback', async () => {
		const run = vi.fn().mockResolvedValue(asyncIterableFrom([], new Error(RAW_SENTINEL_STREAM)));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain, [{ role: 'user', content: 'hi' }]);
		const fallback = chunks.find(c => c.provider === 'fallback');

		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBe('stream_read_failed');
		expect(JSON.stringify(chunks)).not.toContain(RAW_SENTINEL_STREAM);
	});

	it('classifies empty stream output as empty_output on the exhausted fallback', async () => {
		const run = vi.fn().mockResolvedValue(asyncIterableFrom([]));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain, [{ role: 'user', content: 'hi' }]);
		const fallback = chunks.find(c => c.provider === 'fallback');

		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBe('empty_output');
	});

	it('does not leak raw provider error strings through console warnings', async () => {
		const logWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const run = vi.fn().mockRejectedValue(new Error(RAW_SENTINEL_RUN));
			const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
			await collectStream(chain);

			const allLogs = JSON.stringify(logWarn.mock.calls);
			expect(allLogs).not.toContain(RAW_SENTINEL_RUN);
		} finally {
			logWarn.mockRestore();
		}
	});

	it('does not leak raw stream error strings through console warnings', async () => {
		const logWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const run = vi.fn().mockResolvedValue(asyncIterableFrom([], new Error(RAW_SENTINEL_STREAM)));
			const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
			await collectStream(chain);

			const allLogs = JSON.stringify(logWarn.mock.calls);
			expect(allLogs).not.toContain(RAW_SENTINEL_STREAM);
		} finally {
			logWarn.mockRestore();
		}
	});

	it('omits diagnosticCode when a provider throws an unknown generic exception', async () => {
		const UNKNOWN_SENTINEL = 'unknown-provider-error-9f8e7d6c5b4a';
		const provider = mockProvider('mock', async function* () {
			throw new Error(UNKNOWN_SENTINEL);
		});
		const chain = new ProviderChain([provider]);
		const chunks = await collectStream(chain);

		const fallback = chunks.find(c => c.provider === 'fallback');
		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBeUndefined();
		expect(JSON.stringify(chunks)).not.toContain(UNKNOWN_SENTINEL);
	});

	it('classifies actual ReadableStream reader rejection as stream_read_failed', async () => {
		const STREAM_SENTINEL = 'readable-stream-reader-rejection-3a2b1c';
		const run = vi.fn().mockResolvedValue(
			new ReadableStream<{ response?: string; text?: string; delta?: string }>({
				start(controller) {
					controller.error(new Error(STREAM_SENTINEL));
				},
			})
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		const fallback = chunks.find(c => c.provider === 'fallback');
		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBe('stream_read_failed');
		expect(JSON.stringify(chunks)).not.toContain(STREAM_SENTINEL);
	});
});

describe('CloudflareAIProvider binary SSE byte-stream parsing', () => {
	/**
	 * Cloudflare Workers AI docs describe streaming as a binary SSE
	 * `ReadableStream<Uint8Array>` emitting frames like
	 * `data: {"response":"..."}\n\n`. These tests verify the provider decodes
	 * UTF-8 incrementally across arbitrary chunk boundaries and extracts only
	 * the JSON `response` string.
	 */
	const enc = new TextEncoder();
	const toBytes = (s: string): Uint8Array => enc.encode(s);

	function readableStreamFromBytes(
		chunks: Uint8Array[],
		options: { cancel?: () => void } = {}
	): ReadableStream<Uint8Array> {
		let index = 0;
		return new ReadableStream<Uint8Array>({
			pull(controller) {
				if (index < chunks.length) {
					controller.enqueue(chunks[index++]);
				} else {
					controller.close();
				}
			},
			cancel: options.cancel,
		}, { highWaterMark: 0 });
	}

	it('parses a single SSE event delivered in one chunk', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([toBytes('data: {"response":"Hello"}\n\n')])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
	});

	it('parses a single SSE event split across two chunks mid-JSON', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([
				toBytes('data: {"res'),
				toBytes('ponse":"Hello"}\n\n'),
			])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
	});

	it('parses multiple SSE events delivered in one chunk', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([
				toBytes('data: {"response":"Hello"}\n\ndata: {"response":" world"}\n\n'),
			])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: ' world', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
	});

	it('parses multiple SSE events delivered one per chunk', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([
				toBytes('data: {"response":"Hello"}\n\n'),
				toBytes('data: {"response":" world"}\n\n'),
			])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: ' world', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
	});

	it('reconstructs a UTF-8 multibyte character split across byte chunks', async () => {
		// "ñ" is U+00F1, encoded as 0xC3 0xB1 in UTF-8. Split the two bytes
		// across two chunks, with the JSON framing split around them.
		const prefix = toBytes('data: {"response":"');
		const nBytes = toBytes('ñ');
		const suffix = toBytes('"}\n\n');
		const chunk1 = new Uint8Array(prefix.length + 1);
		chunk1.set(prefix, 0);
		chunk1[prefix.length] = nBytes[0]; // 0xC3
		const chunk2 = new Uint8Array(1 + suffix.length);
		chunk2[0] = nBytes[1]; // 0xB1
		chunk2.set(suffix, 1);

		const run = vi.fn().mockResolvedValueOnce(readableStreamFromBytes([chunk1, chunk2]));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks[0]).toMatchObject({
			content: 'ñ',
			done: false,
			provider: 'cloudflare-ai',
			model: ALLOWED_MODEL,
		});
	});

	it('handles CRLF event boundaries per the SSE spec', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([toBytes('data: {"response":"Hello"}\r\n\r\n')])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks[0]).toMatchObject({ content: 'Hello', done: false });
	});

	it('treats a [DONE] data event as a clean terminator', async () => {
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([
				toBytes('data: {"response":"Hello"}\n\ndata: [DONE]\n\n'),
			])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('cancels the underlying reader when [DONE] terminates the stream', async () => {
		const cancelUpstream = vi.fn();
		let pullCount = 0;
		const run = vi.fn(async () => new ReadableStream<Uint8Array>({
			pull(controller) {
				pullCount++;
				if (pullCount === 1) {
					controller.enqueue(new TextEncoder().encode(
						'data: {"response":"Hello"}\n\ndata: [DONE]\n\n'
					));
					return;
				}
				// Never resolves — simulates a server keeping connection open after [DONE].
				return new Promise<void>(() => {});
			},
			cancel: cancelUpstream,
		}, { highWaterMark: 0 }));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([
			{ content: 'Hello', done: false, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: ALLOWED_MODEL },
		]);
		expect(cancelUpstream).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledOnce();
	});

	it('yields empty_output fallback when the byte stream contains no events', async () => {
		const run = vi.fn().mockResolvedValueOnce(readableStreamFromBytes([]));
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		expect(chunks).toEqual([{
			content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
			done: true,
			provider: 'fallback',
			model: null,
			diagnosticCode: 'empty_output',
		}]);
	});

	it('cancels a byte-level ReadableStream when the consumer signal aborts', async () => {
		const cancelUpstream = vi.fn();
		let pullCount = 0;
		const run = vi.fn(async () => new ReadableStream<Uint8Array>({
			pull(controller) {
				pullCount++;
				if (pullCount === 1) {
					controller.enqueue(new TextEncoder().encode('data: {"response":"first"}\n\n'));
					return;
				}
				// Never resolves again — simulates a pending read.
				return new Promise<void>(() => {});
			},
			cancel: cancelUpstream,
		}, { highWaterMark: 0 }));
		const controller = new AbortController();
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const iterator = chain.stream([], { signal: controller.signal } as any)[Symbol.asyncIterator]();

		const firstChunk = await iterator.next();
		controller.abort();

		expect(firstChunk.value).toMatchObject({ content: 'first', provider: 'cloudflare-ai' });
		expect(cancelUpstream).toHaveBeenCalledOnce();
		expect(run).toHaveBeenCalledOnce();
		await iterator.return?.();
	});

	it('sanitizes malformed SSE data as stream_read_failed', async () => {
		const MALFORMED_SENTINEL = 'data: this is not valid json payload-xyz';
		const run = vi.fn().mockResolvedValueOnce(
			readableStreamFromBytes([toBytes(MALFORMED_SENTINEL + '\n\n')])
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		const fallback = chunks.find(c => c.provider === 'fallback');
		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBe('stream_read_failed');
		expect(JSON.stringify(chunks)).not.toContain('payload-xyz');
	});

	it('sanitizes a byte-stream read error as stream_read_failed', async () => {
		const STREAM_ERR_SENTINEL = 'byte-stream-read-error-7k9j2h';
		const run = vi.fn().mockResolvedValue(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.error(new Error(STREAM_ERR_SENTINEL));
				},
			})
		);
		const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
		const chunks = await collectStream(chain);

		const fallback = chunks.find(c => c.provider === 'fallback');
		expect(fallback).toBeDefined();
		expect(fallback!.diagnosticCode).toBe('stream_read_failed');
		expect(JSON.stringify(chunks)).not.toContain(STREAM_ERR_SENTINEL);
	});

	it('does not leak raw byte-stream bytes in any diagnostic output', async () => {
		const logWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const RAW_SENTINEL = 'raw-sse-bytes-must-not-leak-9z8y7x';
			const run = vi.fn().mockResolvedValueOnce(
				readableStreamFromBytes([toBytes(`data: ${RAW_SENTINEL}\n\n`)])
			);
			const chain = new ProviderChain([new CloudflareAIProvider({ AI: { run } } as any)]);
			const chunks = await collectStream(chain);

			const allLogs = JSON.stringify(chunks) + JSON.stringify(logWarn.mock.calls);
			expect(allLogs).not.toContain(RAW_SENTINEL);
		} finally {
			logWarn.mockRestore();
		}
	});
});
