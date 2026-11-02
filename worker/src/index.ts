/**
 * Worker Entry Point - routes to API endpoints
 */

import chat from './api/chat';
import aiStatus from './api/ai-status';
import lead from './api/lead';
import ChatGuard from './chat-guard';
import { WorkersAIBinding } from './lib/providers';

export interface Env {
	AI?: WorkersAIBinding;
	CHAT_GUARD: DurableObjectNamespace;
	DB?: D1Database;
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

export { ChatGuard };
