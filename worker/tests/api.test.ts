import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chat from '../src/api/chat';
import * as providers from '../src/lib/providers';

const WORKER_SRC = resolve(import.meta.dirname, '..', 'src');
const CLOUDFLARE_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

function sseEvents(text: string): unknown[] {
	return text.trim().split('\n\n').map(frame => JSON.parse(frame.slice('data: '.length)));
}

function asyncIterableFrom<T>(chunks: T[], errorAfter?: Error): AsyncIterable<T> {
	return {
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) yield chunk;
			if (errorAfter) throw errorAfter;
		},
	};
}

function chatRequest(message = 'published data question', origin?: string): Request {
	const headers = new Headers({ 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' });
	if (origin !== undefined) headers.set('Origin', origin);
	return new Request('https://portfolio.test/api/chat', {
		method: 'POST',
		headers,
		body: JSON.stringify({ message }),
	});
}

function chatEnv(run: ReturnType<typeof vi.fn>) {
	return {
		AI: { run },
		CHAT_GUARD: {
			idFromName: vi.fn((name: string) => name),
			get: vi.fn(() => ({ fetch: vi.fn(async () => new Response(JSON.stringify({ allowed: true, reason: null }), { status: 200 })) })),
		},
	} as any;
}

describe('Worker source files', () => {
	const requiredFiles = [
		'src/index.ts',
		'src/api/chat.ts',
		'src/api/ai-status.ts',
		'src/api/lead.ts',
		'src/chat-guard.ts',
		'src/lib/kb.ts',
		'src/lib/providers.ts',
		'wrangler.jsonc',
		'package.json',
		'tsconfig.json',
		'migrations/0001_leads.sql',
	];

	for (const file of requiredFiles) {
		it('has ' + file, () => {
			const path = join(WORKER_SRC, '..', file);
			expect(existsSync(path)).toBe(true);
		});
	}
});

describe('index.ts routes to all three endpoints', () => {
	it('routes to chat, ai-status, and lead', () => {
		const content = readFileSync(join(WORKER_SRC, 'index.ts'), 'utf-8');
		expect(content).toContain('/api/chat');
		expect(content).toContain('/api/ai-status');
		expect(content).toContain('/api/lead');
		expect(content).toContain('chat.fetch');
		expect(content).toContain('aiStatus.fetch');
		expect(content).toContain('lead.fetch');
	});
});

describe('chat.ts has streaming SSE endpoint', () => {
	it('has streaming and the free-only provider chain', () => {
		const content = readFileSync(join(WORKER_SRC, 'api/chat.ts'), 'utf-8');
		expect(content).toContain('text/event-stream');
		expect(content).toContain('ReadableStream');
		expect(content).toContain('providerChain.stream');
		// Free-only policy: no Groq/Anthropic activation path may exist.
		expect(content).not.toContain('GROQ_');
		expect(content).not.toContain('ANTHROPIC_');
	});
});

describe('ai-status.ts has health check endpoint', () => {
	it('has health check and provider status', () => {
		const content = readFileSync(join(WORKER_SRC, 'api/ai-status.ts'), 'utf-8');
		expect(content).toContain('GET');
		expect(content).toContain('providers');
		expect(content).toContain('kbSections');
		expect(content).toContain('status_note');
	});
});

describe('lead.ts stores in D1 and sends email', () => {
	it('stores in D1 and sends email', () => {
		const content = readFileSync(join(WORKER_SRC, 'api/lead.ts'), 'utf-8');
		expect(content).toContain('DB.prepare');
		expect(content).toContain('INSERT INTO leads');
		expect(content).toContain('RESEND_API_KEY');
		expect(content).toContain('sendEmailNotification');
	});
});

describe('kb.ts loads all KB files', () => {
	it('exports KB functions', () => {
		const content = readFileSync(join(WORKER_SRC, 'lib/kb.ts'), 'utf-8');
		expect(content).toContain('getFullKB');
		expect(content).toContain('getKBSection');
		expect(content).toContain('getKBSections');
	});
});

describe('providers.ts has the free-only Cloudflare provider', () => {
	it('has only CloudflareAIProvider with the allowlisted model', () => {
		const content = readFileSync(join(WORKER_SRC, 'lib/providers.ts'), 'utf-8');
		expect(content).toContain('CloudflareAIProvider');
		expect(content).toContain('ProviderChain');
		expect(content).toContain('createProviderChain');
		expect(content).toContain('@cf/mistral/mistral-7b-instruct-v0.1');
		expect(content).toContain('env.AI');
		// Free-only policy: no other provider adapter or activation variable.
		expect(content).not.toContain('GroqProvider');
		expect(content).not.toContain('AnthropicProvider');
		expect(content).not.toContain('GROQ_');
		expect(content).not.toContain('ANTHROPIC_');
	});
});

describe('wrangler.jsonc has correct configuration', () => {
	it('has worker config, AI binding, D1, KV and no provider vars', () => {
		const content = readFileSync(resolve(WORKER_SRC, '..', 'wrangler.jsonc'), 'utf-8');
		expect(content).toContain('portfolio-ai-chat-worker');
		expect(content).toContain('"binding": "AI"');
		expect(content).toContain('d1_databases');
		expect(content).toContain('portfolio-leads');
		expect(content).toContain('durable_objects');
		expect(content).toContain('CHAT_GUARD');
		expect(content).toContain('new_sqlite_classes');
		// Free-only policy: no provider API keys or model vars in config.
		expect(content).not.toContain('GROQ_');
		expect(content).not.toContain('ANTHROPIC_');
	});

	it('isolates preview bindings to Workers AI and its own ChatGuard Durable Object', () => {
		const content = readFileSync(resolve(WORKER_SRC, '..', 'wrangler.jsonc'), 'utf-8');
		const config = JSON.parse(content.replace(/^\s*\/\/.*$/gmu, ''));

		expect(config.name).toBe('portfolio-ai-chat-worker');
		expect(Object.keys(config.previews).sort()).toEqual(['ai', 'durable_objects']);
		expect(config.previews.ai).toEqual({ binding: 'AI' });
		expect(config.previews.durable_objects).toEqual({
			bindings: [{ name: 'CHAT_GUARD', class_name: 'ChatGuard' }],
		});
		expect(config.previews).not.toHaveProperty('d1_databases');
		expect(config.previews).not.toHaveProperty('kv_namespaces');
	});
});

describe('chat CORS policy', () => {
	const pagesOrigin = 'https://cristian-cardona-dev.github.io';

	it('allows only the official Pages origin on chat responses', async () => {
		const run = vi.fn(async () => asyncIterableFrom([{ response: 'ok' }]));
		const response = await chat.fetch(chatRequest('question', pagesOrigin), chatEnv(run));
		await response.text();

		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(pagesOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
	});

	it.each([
		['untrusted origin', 'https://evil.example'],
		['missing origin', undefined],
	])('omits allow-origin for chat preflight with %s', async (_label, origin) => {
		const headers = origin === undefined ? undefined : { Origin: origin };
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'OPTIONS',
			headers,
		}), chatEnv(vi.fn()));

		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
	});

	it('returns the restricted headers for the official chat preflight origin', async () => {
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'OPTIONS',
			headers: { Origin: pagesOrigin },
		}), chatEnv(vi.fn()));

		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(pagesOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
	});
});

describe('wrangler.toml is removed (wrangler.jsonc is authoritative)', () => {
	it('no stale TOML config exists next to wrangler.jsonc', () => {
		expect(existsSync(resolve(WORKER_SRC, '..', 'wrangler.toml'))).toBe(false);
	});
});

describe('migrations/0001_leads.sql creates leads table with indexes', () => {
	it('creates leads table with all fields and indexes', () => {
		const content = readFileSync(resolve(WORKER_SRC, '..', 'migrations/0001_leads.sql'), 'utf-8');
		expect(content).toContain('CREATE TABLE IF NOT EXISTS leads');
		expect(content).toContain('name TEXT');
		expect(content).toContain('email TEXT NOT NULL');
		expect(content).toContain('intent TEXT NOT NULL');
		expect(content).toContain('message TEXT NOT NULL');
		expect(content).toContain('locale TEXT NOT NULL');
		expect(content).toContain('timestamp TEXT NOT NULL');
		expect(content).toContain('idx_leads_email');
		expect(content).toContain('idx_leads_created_at');
		expect(content).toContain('idx_leads_intent');
	});
});

describe('package.json has required dependencies', () => {
	it('has hono, wrangler, typescript, vitest', () => {
		const content = readFileSync(resolve(WORKER_SRC, '..', 'package.json'), 'utf-8');
		const pkg = JSON.parse(content);
		expect(pkg.dependencies.hono).toBeDefined();
		expect(pkg.devDependencies.wrangler).toBeDefined();
		expect(pkg.devDependencies.typescript).toBeDefined();
		expect(pkg.devDependencies.vitest).toBeDefined();
		expect(pkg.scripts.dev).toBeDefined();
		expect(pkg.scripts.deploy).toBeDefined();
		expect(pkg.scripts.test).toBeDefined();
	});
});

describe('chat SSE streaming boundary', () => {
	it('preserves actual provider/model on every content and terminal event and grounds only in published KB data', async () => {
		let inferenceInput: { messages: Array<{ role: string; content: string }> } | undefined;
		const run = vi.fn(async (_model: string, input: unknown) => {
			inferenceInput = input as typeof inferenceInput;
			return asyncIterableFrom([{ response: 'First ' }, { response: 'answer' }]);
		});
		const response = await chat.fetch(chatRequest('unpublished-question-marker'), chatEnv(run));

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(sseEvents(await response.text())).toEqual([
			{ content: 'First ', done: false, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
			{ content: 'answer', done: false, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
		]);
		const systemMessage = inferenceInput?.messages.find(message => message.role === 'system');
		expect(systemMessage?.content).toContain('crisss198@gmail.com');
		const hasFormKeyField = systemMessage?.content.split('\n').some(line => /^\s*-\s*\*\*Key\*\*:/u.test(line));
		expect(hasFormKeyField).toBe(false);
		expect(systemMessage?.content).not.toContain('unpublished-question-marker');
	});

	it('returns 413 for an advertised body larger than 128 KiB before quota or inference', async () => {
		const run = vi.fn();
		const env = chatEnv(run);
		const request = new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': String(131_073),
				'cf-connecting-ip': '198.51.100.5',
			},
			body: JSON.stringify({ message: 'hello' }),
		});

		const response = await chat.fetch(request, env);

		expect(response.status).toBe(413);
		expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it('accepts a valid request whose actual serialized body is exactly 128 KiB', async () => {
		const run = vi.fn(async () => asyncIterableFrom([{ response: 'ok' }]));
		const serialized = JSON.stringify({ message: 'hello' });
		const body = serialized + ' '.repeat(131_072 - new TextEncoder().encode(serialized).byteLength);
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Content-Length': '131072', 'cf-connecting-ip': '198.51.100.5' },
			body,
		}), chatEnv(run));

		expect(response.status).toBe(200);
		await response.text();
		expect(run).toHaveBeenCalledOnce();
	});

	it('counts actual streamed bytes without Content-Length, cancels on overflow, and rejects before quota or inference', async () => {
		const run = vi.fn();
		const env = chatEnv(run);
		const cancelBody = vi.fn();
		let sentOverflow = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sentOverflow) controller.close();
				else {
					sentOverflow = true;
					controller.enqueue(new Uint8Array(131_073).fill(0x20));
				}
			},
			cancel: cancelBody,
		}, { highWaterMark: 0 });
		const request = new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
			body,
			duplex: 'half',
		} as RequestInit);

		const response = await chat.fetch(request, env);

		expect(response.status).toBe(413);
		expect(cancelBody).toHaveBeenCalledOnce();
		expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it('cancels a stalled incoming body reader at the 30-second deadline', async () => {
		vi.useFakeTimers();
		const run = vi.fn();
		const env = chatEnv(run);
		const cancelBody = vi.fn();
		const body = new ReadableStream<Uint8Array>({
			pull() { return new Promise<void>(() => {}); },
			cancel: cancelBody,
		}, { highWaterMark: 0 });
		const request = new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
			body,
			duplex: 'half',
		} as RequestInit);
		try {
			const pendingResponse = chat.fetch(request, env);
			await vi.advanceTimersByTimeAsync(30_000);
			const response = await pendingResponse;

			expect(response.status).toBe(503);
			expect(cancelBody).toHaveBeenCalledOnce();
			expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
			expect(run).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('emits exactly one sanitized attributed terminal error after partial output', async () => {
		const run = vi.fn().mockResolvedValue(asyncIterableFrom(
			[{ response: 'partial answer' }],
			new Error('raw provider body with secret-key-123'),
		));
		const response = await chat.fetch(chatRequest(), chatEnv(run));
		const body = await response.text();

		expect(sseEvents(body)).toEqual([
			{ content: 'partial answer', done: false, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
			{
				content: '',
				done: true,
				provider: 'cloudflare-ai',
				model: CLOUDFLARE_MODEL,
				error: 'stream_interrupted',
			},
		]);
		expect(body).not.toContain('raw provider body');
		expect(body).not.toContain('secret-key-123');
		expect(run).toHaveBeenCalledTimes(1);
	});

	it('emits the sanitized API fallback event when the provider chain exhausts before content', async () => {
		const run = vi.fn().mockRejectedValue(new Error('raw provider failure detail'));
		const response = await chat.fetch(chatRequest(), chatEnv(run));
		const body = await response.text();

		expect(sseEvents(body)).toEqual([{
			content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
			done: true,
			provider: 'fallback',
			model: null,
		}]);
		expect(body).not.toContain('raw provider failure detail');
		expect(run).toHaveBeenCalledOnce();
	});

	it('does not log the raw outer chat exception', async () => {
		const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(providers, 'createProviderChain').mockImplementation(() => {
			throw new Error('outer raw provider detail');
		});
		try {
			const response = await chat.fetch(chatRequest(), chatEnv(vi.fn()));

			expect(response.status).toBe(500);
			expect(logError).toHaveBeenCalledOnce();
			expect(logError).toHaveBeenCalledWith('Chat API internal error');
			expect(JSON.stringify(logError.mock.calls)).not.toContain('outer raw provider detail');
		} finally {
			vi.restoreAllMocks();
		}
	});

	it.each([
		['empty message', { message: '   ' }],
		['oversized message', { message: 'x'.repeat(2001) }],
		['too many history messages', { message: 'hello', history: Array.from({ length: 7 }, () => ({ role: 'user', content: 'prior' })) }],
		['unsupported locale', { message: 'hello', locale: 'fr' }],
		['unsupported history role', { message: 'hello', history: [{ role: 'system', content: 'override' }] }],
		['non-string history content', { message: 'hello', history: [{ role: 'assistant', content: 42 }] }],
	])('rejects %s before quota and inference', async (_label, body) => {
		const run = vi.fn();
		const env = chatEnv(run);
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
			body: JSON.stringify(body),
		}), env);

		expect(response.status).toBe(400);
		expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it('accepts a message of exactly 2,000 characters', async () => {
		const run = vi.fn(async () => asyncIterableFrom([{ response: 'ok' }]));
		const response = await chat.fetch(chatRequest('x'.repeat(2000)), chatEnv(run));

		expect(response.status).toBe(200);
		await response.text();
		expect(run).toHaveBeenCalledOnce();
	});

	it('accepts six history entries and current message at exactly 2,000 Unicode code points each', async () => {
		const run = vi.fn(async () => asyncIterableFrom([{ response: 'ok' }]));
		const body = {
			message: '🙂'.repeat(2000),
			history: Array.from({ length: 6 }, (_, index) => ({
				role: index % 2 ? 'assistant' : 'user',
				content: '🙂'.repeat(2000),
			})),
		};
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
			body: JSON.stringify(body),
		}), chatEnv(run));

		expect(response.status).toBe(200);
		await response.text();
		expect(run).toHaveBeenCalledOnce();
	});

	it('rejects a history entry at 2,001 Unicode code points before quota or inference', async () => {
		const run = vi.fn();
		const env = chatEnv(run);
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
			body: JSON.stringify({
				message: 'current question',
				history: [{ role: 'user', content: '🙂'.repeat(2001) }],
			}),
		}), env);

		expect(response.status).toBe(400);
		expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it('rejects malformed JSON before quota and inference', async () => {
		const run = vi.fn();
		const env = chatEnv(run);
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'POST',
		headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
			body: '{not json',
		}), env);

		expect(response.status).toBe(400);
		expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it('fails closed on quota denial or quota service failure before calling AI', async () => {
		for (const quotaResponse of [
			new Response(JSON.stringify({ allowed: false, reason: 'ip_limit' }), { status: 200 }),
			new Response('internal quota failure', { status: 503 }),
		]) {
			const run = vi.fn();
			const env = chatEnv(run);
			env.CHAT_GUARD.get.mockReturnValue({ fetch: vi.fn(async () => quotaResponse.clone()) });
			const response = await chat.fetch(chatRequest(), env);

			expect(response.status).toBe(quotaResponse.status === 200 ? 429 : 503);
			expect(run).not.toHaveBeenCalled();
		}
	});

	it('does not trust forwarded IP headers when the Cloudflare source IP is absent', async () => {
		const run = vi.fn();
		const env = chatEnv(run);
		const response = await chat.fetch(new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.99' },
			body: JSON.stringify({ message: 'hello' }),
		}), env);

		expect(response.status).toBe(503);
		expect(env.CHAT_GUARD.get).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it('applies the same 30-second request deadline while quota storage is pending', async () => {
		vi.useFakeTimers();
		const run = vi.fn();
		const env = chatEnv(run);
		env.CHAT_GUARD.get.mockReturnValue({ fetch: () => new Promise<Response>(() => {}) });
		try {
			const pendingResponse = chat.fetch(chatRequest(), env);
			await vi.advanceTimersByTimeAsync(30_000);
			const response = await pendingResponse;

			expect(response.status).toBe(503);
			expect(run).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('uses only Cloudflare source IP and passes all six allowed history messages with 1024 output tokens', async () => {
		let inferenceInput: { messages: Array<{ role: string; content: string }>; max_tokens: number } | undefined;
		const run = vi.fn(async (_model: string, input: unknown) => {
			inferenceInput = input as typeof inferenceInput;
			return asyncIterableFrom([{ response: 'ok' }]);
		});
		const env = chatEnv(run);
		const history = Array.from({ length: 6 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `prior-${index}` }));
		const request = new Request('https://portfolio.test/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.6', 'x-forwarded-for': '192.0.2.99' },
			body: JSON.stringify({ message: 'question', history, locale: 'es' }),
		});

		const response = await chat.fetch(request, env);
		await response.text();
		const guardFetch = env.CHAT_GUARD.get.mock.results[0].value.fetch;

		expect(guardFetch).toHaveBeenCalledOnce();
		const quotaRequest = guardFetch.mock.calls[0][0] as Request;
		expect(await quotaRequest.text()).toBe(JSON.stringify({ ip: '198.51.100.6' }));
		expect(inferenceInput?.messages.map(message => message.content)).toEqual(expect.arrayContaining(history.map(item => item.content)));
		expect(inferenceInput?.max_tokens).toBe(1024);
	});

	it('terminates at 30 seconds, requests iterator cancellation, and does not retry inference', async () => {
		vi.useFakeTimers();
		const run = vi.fn();
		let started = false;
		const next = vi.fn(() => {
			if (!started) {
				started = true;
				run('@cf/mistral/mistral-7b-instruct-v0.1', { stream: true });
			}
			return new Promise<IteratorResult<any>>(() => {});
		});
		const returnIterator = vi.fn(async () => ({ done: true, value: undefined }));
		vi.spyOn(providers, 'createProviderChain').mockReturnValue({
			stream: () => ({ [Symbol.asyncIterator]: () => ({ next, return: returnIterator }) }),
		} as any);
		try {
			const response = await chat.fetch(chatRequest(), chatEnv(run));
			const reader = response.body!.getReader();
			const read = reader.read();
			await vi.advanceTimersByTimeAsync(30_000);
			const terminal = await read;

			expect(terminal.done).toBe(false);
			expect(JSON.parse(new TextDecoder().decode(terminal.value).slice('data: '.length))).toMatchObject({ done: true });
			expect(returnIterator).toHaveBeenCalledOnce();
			expect(run).toHaveBeenCalledOnce();
		} finally {
			vi.restoreAllMocks();
			vi.useRealTimers();
		}
	});

	it('ends with the attributed sanitized terminal event when the deadline follows partial content', async () => {
		vi.useFakeTimers();
		const run = vi.fn();
		const next = vi.fn()
			.mockImplementationOnce(() => {
				run('@cf/mistral/mistral-7b-instruct-v0.1', { stream: true });
				return Promise.resolve({ done: false, value: { content: 'partial', done: false, provider: 'cloudflare-ai', model: '@cf/mistral/mistral-7b-instruct-v0.1' } });
			})
			.mockImplementation(() => new Promise<IteratorResult<any>>(() => {}));
		const returnIterator = vi.fn(async () => ({ done: true, value: undefined }));
		vi.spyOn(providers, 'createProviderChain').mockReturnValue({
			stream: () => ({ [Symbol.asyncIterator]: () => ({ next, return: returnIterator }) }),
		} as any);
		try {
			const response = await chat.fetch(chatRequest(), chatEnv(run));
			const reader = response.body!.getReader();
			const first = await reader.read();
			const terminalRead = reader.read();
			await vi.advanceTimersByTimeAsync(30_000);
			const terminal = await terminalRead;

			expect(sseEvents(new TextDecoder().decode(first.value) + new TextDecoder().decode(terminal.value))).toEqual([
				{ content: 'partial', done: false, provider: 'cloudflare-ai', model: '@cf/mistral/mistral-7b-instruct-v0.1' },
				{ content: '', done: true, provider: 'cloudflare-ai', model: '@cf/mistral/mistral-7b-instruct-v0.1', error: 'stream_interrupted' },
			]);
			expect(returnIterator).toHaveBeenCalledOnce();
			expect(run).toHaveBeenCalledOnce();
		} finally {
			vi.restoreAllMocks();
			vi.useRealTimers();
		}
	});

	it('cancels the active iterator when the response reader is cancelled', async () => {
		const run = vi.fn();
		let started = false;
		const next = vi.fn(() => {
			if (!started) {
				started = true;
				run('@cf/mistral/mistral-7b-instruct-v0.1', { stream: true });
			}
			return new Promise<IteratorResult<any>>(() => {});
		});
		const returnIterator = vi.fn(async () => ({ done: true, value: undefined }));
		vi.spyOn(providers, 'createProviderChain').mockReturnValue({
			stream: () => ({ [Symbol.asyncIterator]: () => ({ next, return: returnIterator }) }),
		} as any);
		try {
			const response = await chat.fetch(chatRequest(), chatEnv(run));
			await response.body!.getReader().cancel();

			expect(returnIterator).toHaveBeenCalledOnce();
			expect(run).toHaveBeenCalledOnce();
		} finally {
			vi.restoreAllMocks();
		}
	});

	it('cancels the real Cloudflare provider readable stream when the response reader is cancelled', async () => {
		const cancelUpstream = vi.fn();
		let enqueueFirstChunk = true;
		const run = vi.fn(async () => new ReadableStream<{ response: string }>({
			pull(controller) {
				if (enqueueFirstChunk) {
					enqueueFirstChunk = false;
					controller.enqueue({ response: 'first' });
					return;
				}
				return new Promise<void>(() => {});
			},
			cancel: cancelUpstream,
		}, { highWaterMark: 0 }));
		const response = await chat.fetch(chatRequest(), chatEnv(run));
		const reader = response.body!.getReader();

		try {
			const first = await reader.read();
			expect(new TextDecoder().decode(first.value)).toContain('first');
			await reader.cancel();

			expect(cancelUpstream).toHaveBeenCalledOnce();
			expect(run).toHaveBeenCalledOnce();
		} finally {
			vi.restoreAllMocks();
		}
	});
});
