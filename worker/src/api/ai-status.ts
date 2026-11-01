/**
 * AI Status Endpoint - /api/ai-status
 * Health check for AI providers
 */

import { getKBSections } from '../lib/kb';
import { createProviderChain } from '../lib/providers';

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

			const configured = [];
			if (env.GROQ_API_KEY) configured.push('groq');
			if (env.ANTHROPIC_API_KEY) configured.push('anthropic');
			configured.push('cloudflare-ai');

			const providerStatus = [];
			for (const name of configured) {
				try {
					const chain = await import('../lib/providers.js').then(m => m.createProviderChain({}));
					providerStatus.push({ name, available: true });
				} catch (e) {
					providerStatus.push({ name, available: false, error: String(e) });
				}
			}

			return new Response(JSON.stringify({
				available: true,
				kbSections,
				configuredProviders: configured,
				providerStatus,
				activeModel: 'llama-3.3-70b-versatile',
			}, null, 2), {
				headers: {
					...corsHeaders,
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache',
				},
			});
		} catch (error) {
			console.error('AI Status error:', error);
			return new Response(JSON.stringify({ available: false, error: String(error) }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}
	},
};