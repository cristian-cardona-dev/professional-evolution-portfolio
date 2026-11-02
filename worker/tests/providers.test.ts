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

		const chunks = await collectStream(chain, [{ role: 'user', content: 'hi' }]);

		expect(run).toHaveBeenCalledTimes(1);
		const text = chunks.map(c => c.content).join('');
		expect(text).toContain('partial answer');
		expect(text).toContain('El chat no está disponible');
		expect(chunks[chunks.length - 1].done).toBe(true);
		expect(text).not.toContain('raw provider failure');
	});

	it('may retry once non-streaming when the stream fails before any content', async () => {
		const run = vi.fn()
			.mockRejectedValueOnce(new Error('stream failed before content'))
			.mockResolvedValueOnce({ response: 'complete answer' });
		const provider = new CloudflareAIProvider({ AI: { run } } as any);
		const chain = new ProviderChain([provider]);

		const chunks = await collectStream(chain);

		expect(run).toHaveBeenCalledTimes(2);
		expect(run).toHaveBeenNthCalledWith(2, ALLOWED_MODEL, expect.objectContaining({ stream: false }));
		const text = chunks.map(c => c.content).join('');
		expect(text).toContain('complete answer');
		expect(chunks[chunks.length - 1].done).toBe(true);
	});

	it('falls back to one non-streaming call when the stream yields no content', async () => {
		const run = vi.fn()
			.mockResolvedValueOnce(asyncIterableFrom([]))
			.mockResolvedValueOnce({ response: 'complete answer' });
		const provider = new CloudflareAIProvider({ AI: { run } } as any);
		const chain = new ProviderChain([provider]);

		const chunks = await collectStream(chain);

		expect(run).toHaveBeenCalledTimes(2);
		expect(run).toHaveBeenNthCalledWith(2, ALLOWED_MODEL, expect.objectContaining({ stream: false }));
		const text = chunks.map(c => c.content).join('');
		expect(text).toContain('complete answer');
		expect(chunks[chunks.length - 1].done).toBe(true);
	});

	it('call() fails closed when the AI binding is absent', async () => {
		const provider = new CloudflareAIProvider({} as any);
		await expect(provider.call([{ role: 'user', content: 'hi' }])).rejects.toThrowError(/Cloudflare Workers AI binding/);
	});
});

describe('ProviderChain streaming semantics', () => {
	it('advances to a fallback provider only when no content was emitted', async () => {
		const provider1 = mockProvider('mock-1', async function* () {
			yield { content: '', done: true, provider: 'mock-1' };
		});
		const provider2 = mockProvider('mock-2', async function* () {
			yield { content: 'Hello', done: false, provider: 'mock-2' };
			yield { content: '', done: true, provider: 'mock-2' };
		});

		const chain = new ProviderChain([provider1, provider2]);
		const chunks = await collectStream(chain);

		expect(chunks.some(c => c.content === 'Hello')).toBe(true);
		expect(chunks[chunks.length - 1].done).toBe(true);
	});

	it('does not yield empty done markers as successful content', async () => {
		const provider = mockProvider('mock', async function* () {
			yield { content: '', done: true, provider: 'mock' };
		});

		const chain = new ProviderChain([provider]);
		const chunks = await collectStream(chain);

		// No content means the sanitized fallback message ends the stream.
		expect(chunks.some(c => c.provider === 'fallback')).toBe(true);
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
	});
});
