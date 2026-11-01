/**
 * Worker Entry Point — routes to API endpoints
 */

import chat from './api/chat';
import aiStatus from './api/ai-status';
import lead from './api/lead';

export interface Env {
	GROQ_API_KEY?: string;
	GROQ_MODEL?: string;
	ANTHROPIC_API_KEY?: string;
	ANTHROPIC_MODEL?: string;
	AI?: any;
	DB?: any;
	RESEND_API_KEY?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Route to API endpoints
		if (path.startsWith('/api/chat')) {
			return chat.fetch(request, env);
		}
		if (path.startsWith('/api/ai-status')) {
			return aiStatus.fetch(request, env);
		}
		if (path.startsWith('/api/lead')) {
			return lead.fetch(request, env);
		}

		// 404 for other paths
		return new Response('Not Found', { status: 404 });
	},
};