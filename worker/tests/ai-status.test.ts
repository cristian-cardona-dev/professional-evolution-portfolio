import { describe, it, expect, vi, afterEach } from 'vitest';
import aiStatusHandler from '../src/api/ai-status';

const ALLOWLISTED_PROVIDER = 'cloudflare-ai';
const ALLOWLISTED_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

describe('ai-status.ts - passive allowlisted status', () => {
	const createRequest = (method = 'GET', origin?: string) => {
		const headers = new Headers();
		if (origin !== undefined) headers.set('Origin', origin);
		return new Request('http://localhost/api/ai-status', { method, headers });
	};

	const getStatus = async (env: unknown) => {
		const response = await aiStatusHandler.fetch(createRequest(), env as any);
		return { response, data: await response.json() as any };
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('never calls AI.run and never issues a provider request', async () => {
		const run = vi.fn();
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const { response, data } = await getStatus({ AI: { run } });

		expect(response.status).toBe(200);
		expect(run).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(data.available).toBe(true);
	});

	it('reports exactly the allowlisted provider and model as configured_not_probed', async () => {
		const run = vi.fn();
		const { data } = await getStatus({ AI: { run } });

		expect(data.state).toBe('configured_not_probed');
		expect(data.providers).toEqual([
			{ name: ALLOWLISTED_PROVIDER, model: ALLOWLISTED_MODEL, status: 'configured_not_probed' },
		]);
		expect(Object.keys(data).sort()).toEqual([
			'available',
			'kbSections',
			'providers',
			'state',
			'status_note',
		]);
		expect(data.kbSections).toContain('SYSTEM_PROMPT');
		expect(run).not.toHaveBeenCalled();
	});

	it('reports unavailable when the AI binding is absent', async () => {
		const { data } = await getStatus({ GROQ_API_KEY: 'gsk-obsolete-groq-secret', ANTHROPIC_API_KEY: 'sk-ant-obsolete-secret' });

		expect(data.available).toBe(false);
		expect(data.state).toBe('unavailable');
		expect(data.providers).toEqual([]);
		expect(data.error).toBeUndefined();
	});

	it('never reports credential or model values supplied through obsolete Anthropic/Groq variables', async () => {
		const run = vi.fn();
		const { data } = await getStatus({
			AI: { run },
			GROQ_API_KEY: 'gsk-obsolete-groq-secret',
			GROQ_MODEL: 'llama-3.3-70b-versatile',
			ANTHROPIC_API_KEY: 'sk-ant-obsolete-secret',
			ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
		});

		expect(data.available).toBe(true);
		expect(data.state).toBe('configured_not_probed');
		expect(data.providers).toHaveLength(1);

		const body = JSON.stringify(data).toLowerCase();
		for (const forbidden of [
			'gsk-obsolete-groq-secret',
			'llama-3.3-70b-versatile',
			'sk-ant-obsolete-secret',
			'claude-3-haiku-20240307',
			'groq',
			'anthropic',
			'configured_incomplete',
		]) {
			expect(body).not.toContain(forbidden.toLowerCase());
		}
		expect(run).not.toHaveBeenCalled();
	});

	it('exposes no key, prompt, raw error, or unsupported-provider state', async () => {
		const { data } = await getStatus({
			GROQ_API_KEY: 'gsk-obsolete-groq-secret',
			GROQ_MODEL: 'llama-3.3-70b-versatile',
			ANTHROPIC_API_KEY: 'sk-ant-obsolete-secret',
			ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
			RESEND_API_KEY: 're_omit-me-too',
			CHAT_GUARD_SECRET: 'guard-secret-value',
		});

		expect(data.available).toBe(false);
		expect(data.state).toBe('unavailable');
		expect(data.providers).toEqual([]);

		const body = JSON.stringify(data).toLowerCase();
		for (const forbidden of [
			'gsk-obsolete-groq-secret',
			'llama-3.3-70b-versatile',
			'sk-ant-obsolete-secret',
			'claude-3-haiku-20240307',
			're_omit-me-too',
			'guard-secret-value',
			'unsupported',
			'configured_incomplete',
		]) {
			expect(body).not.toContain(forbidden.toLowerCase());
		}
	});

	it('states configured-not-probed explicitly in status_note', async () => {
		const { data } = await getStatus({ AI: { run: vi.fn() } });

		expect(data.status_note).toContain('configured');
		expect(data.status_note).toContain('not probed at runtime');
		expect(data.status_note).toContain('no provider request');
	});

	it('returns 405 for non-GET requests', async () => {
		const env = { AI: { run: vi.fn() } };
		const response = await aiStatusHandler.fetch(createRequest('POST'), env as any);
		expect(response.status).toBe(405);
	});

	it('allows only the official Pages origin on status responses', async () => {
		const pagesOrigin = 'https://cristian-cardona-dev.github.io';
		const response = await aiStatusHandler.fetch(createRequest('GET', pagesOrigin), { AI: { run: vi.fn() } } as any);
		const data = await response.json();

		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(pagesOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(data).toMatchObject({ available: true, state: 'configured_not_probed' });
	});

	it.each([
		['untrusted origin', 'https://evil.example'],
		['missing origin', undefined],
	])('omits allow-origin for status responses with %s', async (_label, origin) => {
		const response = await aiStatusHandler.fetch(createRequest('GET', origin), {} as any);

		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(response.headers.get('Vary')).toBe('Origin');
	});

	it('allows the official Pages origin on status preflight', async () => {
		const pagesOrigin = 'https://cristian-cardona-dev.github.io';
		const response = await aiStatusHandler.fetch(createRequest('OPTIONS', pagesOrigin), {} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(pagesOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
	});

	it.each([
		['untrusted origin', 'https://evil.example'],
		['missing origin', undefined],
	])('omits allow-origin for status preflight with %s', async (_label, origin) => {
		const response = await aiStatusHandler.fetch(createRequest('OPTIONS', origin), {} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
	});
});
