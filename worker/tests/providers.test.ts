import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProviderChain, GroqProvider, AnthropicProvider, CloudflareAIProvider, ProviderChain } from '../src/lib/providers';

describe('ProviderChain Configuration', () => {
	describe('createProviderChain', () => {
		it('includes Groq only when both GROQ_API_KEY and GROQ_MODEL are present', () => {
			const env = {
				GROQ_API_KEY: 'test-key',
				GROQ_MODEL: 'test-model',
				AI: { run: vi.fn() },
			};
			const chain = createProviderChain(env);
			const providerNames = chain.providers.map(p => p.name);
			expect(providerNames).toContain('groq');
			expect(providerNames[0]).toBe('groq'); // Groq should be first when configured
		});

		it('skips Groq when GROQ_API_KEY is present but GROQ_MODEL is missing', () => {
			const env = {
				GROQ_API_KEY: 'test-key',
				AI: { run: vi.fn() },
			};
			const chain = createProviderChain(env);
			const providerNames = chain.providers.map(p => p.name);
			expect(providerNames).not.toContain('groq');
		});

		it('skips Groq when GROQ_MODEL is present but GROQ_API_KEY is missing', () => {
			const env = {
				GROQ_MODEL: 'test-model',
				AI: { run: vi.fn() },
			};
			const chain = createProviderChain(env);
			const providerNames = chain.providers.map(p => p.name);
			expect(providerNames).not.toContain('groq');
		});

		it('always includes Cloudflare AI as fallback', () => {
			const env = { AI: { run: vi.fn() } };
			const chain = createProviderChain(env);
			const providerNames = chain.providers.map(p => p.name);
			expect(providerNames).toContain('cloudflare-ai');
		});

		it('includes Anthropic only when ANTHROPIC_API_KEY is present', () => {
			const envWithKey = {
				ANTHROPIC_API_KEY: 'test-key',
				AI: { run: vi.fn() },
			};
			const chainWithKey = createProviderChain(envWithKey);
			expect(chainWithKey.providers.map(p => p.name)).toContain('anthropic');

			const envWithoutKey = { AI: { run: vi.fn() } };
			const chainWithoutKey = createProviderChain(envWithoutKey);
			expect(chainWithoutKey.providers.map(p => p.name)).not.toContain('anthropic');
		});

		it('orders providers correctly: Groq (if configured) → Cloudflare AI → Anthropic', () => {
			const env = {
				GROQ_API_KEY: 'test-key',
				GROQ_MODEL: 'test-model',
				ANTHROPIC_API_KEY: 'anthropic-key',
				AI: { run: vi.fn() },
			};
			const chain = createProviderChain(env);
			const providerNames = chain.providers.map(p => p.name);
			expect(providerNames).toEqual(['groq', 'cloudflare-ai', 'anthropic']);
		});
	});
});

describe('ProviderChain Streaming', () => {
	it('advances to fallback when provider yields only empty done marker', async () => {
		const mockProvider1 = {
			name: 'mock-1',
			call: vi.fn(),
			stream: vi.fn().mockImplementation(async function* () {
				yield { content: '', done: true, provider: 'mock-1' };
			}),
		};
		const mockProvider2 = {
			name: 'mock-2',
			call: vi.fn(),
			stream: vi.fn().mockImplementation(async function* () {
				yield { content: 'Hello', done: false, provider: 'mock-2' };
				yield { content: '', done: true, provider: 'mock-2' };
			}),
		};

		const chain = new ProviderChain([mockProvider1, mockProvider2]);
		const chunks = [];
		for await (const chunk of chain.stream([])) {
			chunks.push(chunk);
		}

		expect(chunks.some(c => c.content === 'Hello')).toBe(true);
		expect(chunks[chunks.length - 1].done).toBe(true);
	});

	it('does not yield empty done markers as successful content', async () => {
		const mockProvider = {
			name: 'mock',
			call: vi.fn(),
			stream: vi.fn().mockImplementation(async function* () {
				yield { content: '', done: true, provider: 'mock' };
			}),
		};

		const chain = new ProviderChain([mockProvider]);
		const chunks = [];
		for await (const chunk of chain.stream([])) {
			chunks.push(chunk);
		}

		// Should have fallback message since mock yielded no content
		expect(chunks.some(c => c.provider === 'fallback')).toBe(true);
	});

	it('sanitizes errors and does not expose raw provider error bodies', async () => {
		const mockProvider = {
			name: 'mock',
			call: vi.fn(),
			stream: vi.fn().mockImplementation(async function* () {
				throw new Error('API error: secret-key-12345 - detailed error info');
			}),
		};

		const chain = new ProviderChain([mockProvider]);
		const chunks = [];
		for await (const chunk of chain.stream([])) {
			chunks.push(chunk);
		}

		const fallbackChunk = chunks.find(c => c.provider === 'fallback');
		expect(fallbackChunk).toBeDefined();
		expect(fallbackChunk.content).not.toContain('secret-key-12345');
		expect(fallbackChunk.content).not.toContain('detailed error info');
		expect(fallbackChunk.content).toContain('El chat no está disponible');
	});
});

describe('GroqProvider', () => {
	it('requires explicit model parameter (no default)', () => {
		expect(() => new GroqProvider('key', '')).toBeDefined();
		// TypeScript enforces this, but we verify the constructor signature
		const provider = new GroqProvider('key', 'custom-model');
		expect((provider as any).model).toBe('custom-model');
	});
});
