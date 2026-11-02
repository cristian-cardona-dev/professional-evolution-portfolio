import { afterEach, describe, expect, it, vi } from 'vitest';
import lead from '../src/api/lead';

const PAGES_ORIGIN = 'https://cristian-cardona-dev.github.io';

function leadPayload() {
	return {
		name: 'Lead name marker',
		email: 'lead-email-marker@example.test',
		intent: 'Lead intent marker',
		message: 'Lead message marker',
		locale: 'en' as const,
		timestamp: '2026-11-02T00:00:00.000Z',
	};
}

function leadRequest(origin?: string): Request {
	const headers = new Headers({ 'Content-Type': 'application/json' });
	if (origin !== undefined) headers.set('Origin', origin);
	return new Request('https://portfolio.test/api/lead', {
		method: 'POST',
		headers,
		body: JSON.stringify(leadPayload()),
	});
}

function dbWith(run: ReturnType<typeof vi.fn> = vi.fn(async () => ({ success: true }))) {
	const statement = { bind: vi.fn(() => ({ run })) };
	return { DB: { prepare: vi.fn(() => statement) }, statement, run };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('lead API CORS policy', () => {
	it.each([
		{ label: 'official Pages origin', origin: PAGES_ORIGIN, allowOrigin: PAGES_ORIGIN },
		{ label: 'untrusted origin', origin: 'https://evil.example', allowOrigin: null },
		{ label: 'missing origin', origin: undefined, allowOrigin: null },
	])('applies the Pages allowlist on successful requests with $label', async ({ origin, allowOrigin }) => {
		const env = dbWith();
		const response = await lead.fetch(leadRequest(origin), env as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
	});

	it.each([
		{ label: 'official Pages origin', origin: PAGES_ORIGIN, allowOrigin: PAGES_ORIGIN },
		{ label: 'untrusted origin', origin: 'https://evil.example', allowOrigin: null },
		{ label: 'missing origin', origin: undefined, allowOrigin: null },
	])('applies the Pages allowlist on insert errors with $label', async ({ origin, allowOrigin }) => {
		const rawError = 'raw-database-error-marker';
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const env = dbWith(vi.fn(async () => { throw new Error(rawError); }));
		const response = await lead.fetch(leadRequest(origin), env as any);
		const responseBody = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(responseBody).not.toContain(rawError);
		expect(responseBody).not.toContain('Lead ');
		expect(log).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledWith('Lead persistence failed');
		expect(JSON.stringify(log.mock.calls)).not.toContain(rawError);
		expect(JSON.stringify(log.mock.calls)).not.toContain('lead-email-marker');
	});

	it.each([
		{ label: 'official Pages origin', origin: PAGES_ORIGIN, allowOrigin: PAGES_ORIGIN },
		{ label: 'untrusted origin', origin: 'https://evil.example', allowOrigin: null },
		{ label: 'missing origin', origin: undefined, allowOrigin: null },
	])('applies the Pages allowlist on preflight with $label', async ({ origin, allowOrigin }) => {
		const headers = new Headers();
		if (origin !== undefined) headers.set('Origin', origin);
		const response = await lead.fetch(new Request('https://portfolio.test/api/lead', {
			method: 'OPTIONS',
			headers,
		}), {} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowOrigin);
		expect(response.headers.get('Vary')).toBe('Origin');
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
	});
});

describe('lead API persistence boundary', () => {
	it('returns 503 without consuming the request body or calling D1/Resend when DB is absent', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const request = leadRequest(PAGES_ORIGIN);

		const response = await lead.fetch(request, { RESEND_API_KEY: 'resend-test-key' } as any);
		const responseBody = await response.json();

		expect(response.status).toBe(503);
		expect(responseBody).toEqual({ error: 'Lead capture is temporarily unavailable' });
		expect(request.bodyUsed).toBe(false);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(responseBody).not.toHaveProperty('success');
	});

	it.each([false, true])('preserves successful D1 persistence with optional email enabled=%s', async (sendEmail) => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
		const env = { ...dbWith(), ...(sendEmail ? { RESEND_API_KEY: 'resend-test-key' } : {}) };
		const response = await lead.fetch(leadRequest(PAGES_ORIGIN), env as any);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(env.DB.prepare).toHaveBeenCalledOnce();
		expect(env.DB.prepare.mock.results[0].value.bind).toHaveBeenCalledOnce();
		expect(env.DB.prepare.mock.results[0].value.bind.mock.results[0].value.run).toHaveBeenCalledOnce();
		expect(fetchSpy).toHaveBeenCalledTimes(sendEmail ? 1 : 0);
	});

	it('does not log or return lead fields or raw errors when email notification fails', async () => {
		const rawError = 'raw-email-error-marker';
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchSpy = vi.fn(async () => { throw new Error(rawError); });
		vi.stubGlobal('fetch', fetchSpy);
		const response = await lead.fetch(leadRequest(PAGES_ORIGIN), {
			...dbWith(),
			RESEND_API_KEY: 'resend-test-key',
		} as any);
		const responseBody = await response.text();

		expect(response.status).toBe(200);
		expect(responseBody).toBe(JSON.stringify({ success: true }));
		expect(log).toHaveBeenCalledOnce();
		expect(log).toHaveBeenCalledWith('Email notification failed');
		const logged = JSON.stringify(log.mock.calls);
		for (const marker of [rawError, 'Lead name marker', 'lead-email-marker', 'Lead intent marker', 'Lead message marker']) {
			expect(responseBody).not.toContain(marker);
			expect(logged).not.toContain(marker);
		}
	});
});
