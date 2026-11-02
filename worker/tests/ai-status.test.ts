import { describe, it, expect, vi } from 'vitest';
import aiStatusHandler from '../src/api/ai-status';

describe('ai-status.ts - honest available field', () => {
	const createRequest = (method = 'GET') => {
		return new Request('http://localhost/api/ai-status', { method });
	};

	it('returns available: false when no providers are configured', async () => {
		const env = {};
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(false);
		expect(data.providers).toEqual([]);
	});

	it('returns available: true when Cloudflare AI is configured', async () => {
		const env = { AI: {} };
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(true);
		expect(data.providers).toHaveLength(1);
		expect(data.providers[0].name).toBe('cloudflare-ai');
	});

	it('returns available: true when Groq is fully configured', async () => {
		const env = {
			GROQ_API_KEY: 'test-key',
			GROQ_MODEL: 'test-model',
		};
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(true);
		expect(data.providers).toHaveLength(1);
		expect(data.providers[0].name).toBe('groq');
		expect(data.providers[0].status).toBe('configured');
	});

	it('returns available: false but marks Groq as incomplete when only API key is set', async () => {
		const env = { GROQ_API_KEY: 'test-key' };
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(false);
		expect(data.providers).toHaveLength(1);
		expect(data.providers[0].name).toBe('groq');
		expect(data.providers[0].status).toBe('configured_incomplete');
		expect(data.providers[0].note).toContain('GROQ_MODEL missing');
	});

	it('returns available: true when Groq is incomplete but Anthropic is configured', async () => {
		const env = {
			GROQ_API_KEY: 'test-key',
			ANTHROPIC_API_KEY: 'test-key',
		};
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(true);
		expect(data.providers).toHaveLength(2);
		expect(data.providers[0].name).toBe('groq');
		expect(data.providers[0].status).toBe('configured_incomplete');
		expect(data.providers[1].name).toBe('anthropic');
		expect(data.providers[1].status).toBe('configured');
	});

	it('returns available: true when Anthropic is configured', async () => {
		const env = { ANTHROPIC_API_KEY: 'test-key' };
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(true);
		expect(data.providers).toHaveLength(1);
		expect(data.providers[0].name).toBe('anthropic');
	});

	it('returns available: true with multiple providers configured', async () => {
		const env = {
			GROQ_API_KEY: 'test-key',
			GROQ_MODEL: 'test-model',
			ANTHROPIC_API_KEY: 'test-key',
			AI: {},
		};
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.available).toBe(true);
		expect(data.providers).toHaveLength(3);
	});

	it('includes status_note explaining available field', async () => {
		const env = { AI: {} };
		const response = await aiStatusHandler.fetch(createRequest(), env);
		const data = await response.json();
		expect(data.status_note).toBeDefined();
		expect(data.status_note).toContain('configured');
		expect(data.status_note).toContain('not probed at runtime');
	});

	it('returns 405 for non-GET requests', async () => {
		const env = { AI: {} };
		const response = await aiStatusHandler.fetch(createRequest('POST'), env);
		expect(response.status).toBe(405);
	});

	it('handles CORS preflight', async () => {
		const env = {};
		const response = await aiStatusHandler.fetch(createRequest('OPTIONS'), env);
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});
});
