/**
 * AI Status Endpoint - /api/ai-status
 *
 * Passive configuration report for the free-only provider chain. Cloudflare
 * Workers AI is the sole allowlisted provider, so the endpoint only reports
 * whether the `AI` binding exists: `configured_not_probed` when it does,
 * `unavailable` when it does not. It never calls `AI.run`, never sends a
 * provider request, and returns no key, prompt, raw error, or
 * unsupported-provider state.
 */

import { getKBSections } from '../lib/kb';
import type { WorkersAIBinding } from '../lib/providers';
import { corsHeaders } from '../lib/cors';

/** The only allowlisted provider in this tranche. */
const PROVIDER_NAME = 'cloudflare-ai';

/**
 * The only allowlisted model — a fixed literal, never selected from the
 * environment and never echoed from any other variable.
 */
const MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

export interface Env {
	AI?: WorkersAIBinding;
}

/** Binding present but never probed, or binding absent. */
export type AiStatusState = 'configured_not_probed' | 'unavailable';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const cors = corsHeaders(request.headers.get('Origin'), 'GET, OPTIONS');

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: cors });
		}

		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405, headers: cors });
		}

		try {
			const kbSections = getKBSections();

			const configured = Boolean(env?.AI);
			const state: AiStatusState = configured ? 'configured_not_probed' : 'unavailable';
			const providers = configured
				? [{ name: PROVIDER_NAME, model: MODEL, status: state }]
				: [];

			return new Response(JSON.stringify({
				available: configured,
				state,
				kbSections,
				providers,
				status_note:
					'Configuration report only: available means the allowlisted Cloudflare Workers AI binding is configured, ' +
					'configured_not_probed means configured but not probed at runtime; ' +
					'this endpoint makes no provider request and exposes no key, prompt, or raw error',
			}, null, 2), {
				headers: {
					...cors,
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache',
				},
			});
		} catch {
			// Sanitized: the raw error object is never logged or returned by this surface.
			console.error('AI Status error: internal failure');
			return new Response(JSON.stringify({ available: false, state: 'unavailable', error: 'Internal server error' }), {
				status: 500,
				headers: { ...cors, 'Content-Type': 'application/json' },
			});
		}
	},
};
