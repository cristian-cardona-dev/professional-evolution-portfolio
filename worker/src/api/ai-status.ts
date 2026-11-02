/**
 * AI Status Endpoint - /api/ai-status
 * Reports configured providers (not tested). No provider calls, no secret values.
 */

import { getKBSections } from '../lib/kb';

export interface Env {
	GROQ_API_KEY?: string;
	GROQ_MODEL?: string;
	ANTHROPIC_API_KEY?: string;
	ANTHROPIC_MODEL?: string;
	AI?: any;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405, headers: corsHeaders });
		}

		try {
			const kbSections = getKBSections();

			const providers = [];
			if (env.GROQ_API_KEY && env.GROQ_MODEL) {
				providers.push({ name: 'groq', model: env.GROQ_MODEL, status: 'configured' });
			} else if (env.GROQ_API_KEY) {
				providers.push({ name: 'groq', model: null, status: 'configured_incomplete', note: 'GROQ_API_KEY set but GROQ_MODEL missing' });
			}
			if (env.ANTHROPIC_API_KEY) {
				providers.push({ name: 'anthropic', model: env.ANTHROPIC_MODEL ?? 'claude-3-haiku-20240307', status: 'configured' });
			}
			if (env.AI) {
				providers.push({ name: 'cloudflare-ai', model: '@cf/mistral/mistral-7b-instruct-v0.1', status: 'configured' });
			}

			const configuredProviders = providers.filter(p => p.status === 'configured');
			return new Response(JSON.stringify({
				available: configuredProviders.length > 0,
				kbSections,
				providers,
				status_note: 'available = at least one provider fully configured (not just key present); not probed at runtime',
			}, null, 2), {
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache',
				},
			});
		} catch (error) {
			console.error('AI Status error:', error);
			return new Response(JSON.stringify({ available: false, error: 'Internal server error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}
	},
};