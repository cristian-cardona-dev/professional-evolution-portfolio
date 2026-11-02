/**
 * Test AI Endpoint - /api/test-ai
 * Tests each provider individually with the real env
 */

import { CloudflareAIProvider } from '../lib/providers';

export interface Env {
	GROQ_API_KEY?: string;
	GROQ_MODEL?: string;
	ANTHROPIC_API_KEY?: string;
	ANTHROPIC_MODEL?: string;
	AI?: any;
};

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

		const results: any = {
			env: {
				hasGroqKey: !!env.GROQ_API_KEY,
				hasAnthropicKey: !!env.ANTHROPIC_API_KEY,
				hasAI: !!env.AI,
			},
			providers: {},
		};

		// Test Cloudflare AI directly
		try {
			console.log('Testing Cloudflare AI...');
			const cfProvider = new CloudflareAIProvider(env, '@cf/mistral/mistral-7b-instruct-v0.1');
			const cfResponse = await cfProvider.call([
				{ role: 'user', content: 'Say hello in Spanish' }
			]);
			results.providers.cloudflareAI = { success: true, response: cfResponse.content.substring(0, 100) };
		} catch (error) {
			results.providers.cloudflareAI = { success: false, error: String(error) };
		}

		// Test Groq if key exists
		if (env.GROQ_API_KEY) {
			try {
				console.log('Testing Groq...');
				const { GroqProvider } = await import('../lib/providers.js');
				const groqProvider = new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL ?? 'llama-3.1-70b-versatile');
				const groqResponse = await groqProvider.call([
					{ role: 'user', content: 'Say hello in Spanish' }
				]);
				results.providers.groq = { success: true, response: groqResponse.content.substring(0, 100) };
			} catch (error) {
				results.providers.groq = { success: false, error: String(error) };
			}
		} else {
			results.providers.groq = { success: false, error: 'GROQ_API_KEY not configured' };
		}

		return new Response(JSON.stringify(results, null, 2), {
			headers: {
				...corsHeaders,
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache',
			},
		});
	},
};