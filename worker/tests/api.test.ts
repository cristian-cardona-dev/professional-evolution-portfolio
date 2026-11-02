import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chat from '../src/api/chat';
import { getFullKB } from '../src/lib/kb';

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

function chatRequest(message = 'published data question'): Request {
	return new Request('https://portfolio.test/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message }),
	});
}

describe('Worker source files', () => {
	const requiredFiles = [
		'src/index.ts',
		'src/api/chat.ts',
		'src/api/ai-status.ts',
		'src/api/lead.ts',
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
		// Free-only policy: no provider API keys or model vars in config.
		expect(content).not.toContain('GROQ_');
		expect(content).not.toContain('ANTHROPIC_');
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
		const response = await chat.fetch(chatRequest('unpublished-question-marker'), { AI: { run } } as any);

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(sseEvents(await response.text())).toEqual([
			{ content: 'First ', done: false, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
			{ content: 'answer', done: false, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
			{ content: '', done: true, provider: 'cloudflare-ai', model: CLOUDFLARE_MODEL },
		]);
		const systemMessage = inferenceInput?.messages.find(message => message.role === 'system');
		expect(systemMessage?.content.endsWith(getFullKB())).toBe(true);
		expect(systemMessage?.content).not.toContain('unpublished-question-marker');
	});

	it('emits exactly one sanitized attributed terminal error after partial output', async () => {
		const run = vi.fn().mockResolvedValue(asyncIterableFrom(
			[{ response: 'partial answer' }],
			new Error('raw provider body with secret-key-123'),
		));
		const response = await chat.fetch(chatRequest(), { AI: { run } } as any);
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
});
