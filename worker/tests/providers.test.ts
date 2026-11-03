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
