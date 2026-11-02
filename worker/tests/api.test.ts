import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKER_SRC = resolve(import.meta.dirname, '..', 'src');

describe('Worker source files', () => {
	const requiredFiles = [
		'src/index.ts',
		'src/api/chat.ts',
		'src/api/ai-status.ts',
		'src/api/lead.ts',
		'src/lib/kb.ts',
		'src/lib/providers.ts',
		'wrangler.toml',
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
	it('has streaming and provider config', () => {
		const content = readFileSync(join(WORKER_SRC, 'api/chat.ts'), 'utf-8');
		expect(content).toContain('text/event-stream');
		expect(content).toContain('ReadableStream');
		expect(content).toContain('providerChain.stream');
		expect(content).toContain('GROQ_API_KEY');
		expect(content).toContain('ANTHROPIC_API_KEY');
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

describe('providers.ts has three providers with fallback chain', () => {
	it('has Groq, Anthropic, Cloudflare AI providers', () => {
		const content = readFileSync(join(WORKER_SRC, 'lib/providers.ts'), 'utf-8');
		expect(content).toContain('GroqProvider');
		expect(content).toContain('AnthropicProvider');
		expect(content).toContain('CloudflareAIProvider');
		expect(content).toContain('ProviderChain');
		expect(content).toContain('createProviderChain');
		expect(content).toContain('GROQ_API_KEY');
		expect(content).toContain('ANTHROPIC_API_KEY');
		expect(content).toContain('env.AI');
	});
});

describe('wrangler.toml has correct configuration', () => {
	it('has worker config, AI binding, D1, KV', () => {
		const content = readFileSync(resolve(WORKER_SRC, '..', 'wrangler.toml'), 'utf-8');
		expect(content).toContain('portfolio-ai-chat-worker');
		expect(content).toContain('binding = "AI"');
		expect(content).toContain('d1_databases');
		expect(content).toContain('portfolio-leads');
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