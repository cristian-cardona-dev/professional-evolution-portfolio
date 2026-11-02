/**
 * Chat API Endpoint - /api/chat
 * Handles streaming chat with grounding in canonical portfolio data
 */

import { getFullKB } from '../lib/kb';
import { createProviderChain, Message, WorkersAIBinding } from '../lib/providers';

export interface Env {
	AI?: WorkersAIBinding;
}

interface ChatRequest {
	message: string;
	history?: Array<Pick<Message, 'role' | 'content'>>;
	locale?: 'en' | 'es';
}

function buildSystemPrompt(kb: string, locale: 'en' | 'es'): string {
	const isSpanish = locale === 'es';
	const basePrompt = isSpanish
		? `Eres un asistente de IA grounded EXCLUSIVAMENTE en los datos publicados del portafolio de Cristian Cardona.

REGLAS OBLIGATORIAS:
1. SOLO responde con información de los datos canónicos publicados
2. Si no sabes: "No tengo esa información publicada. Puedes preguntar por email."
3. CITA fuentes: "Según data/projects.json..." o "Según data/experience.json..."
4. NUNCA inventes métricas, quotes, o testimonios
5. NUNCA afirmes producción si status es "prototype", "lab", o "planned"
6. Responde en español

EJEMPLOS DE CITAS:
- "Según data/projects.json, el proyecto 'AI Chat API Lab' tiene status 'prototype'..."
- "Según data/experience.json, trabajó en Talan desde 2023-10..."
- "Según data/skills.json, tiene skill 'Azure' en categoría 'cloud'..."

CONOCIMIENTO DISPONIBLE:`
		: `You are an AI assistant grounded EXCLUSIVELY in the published data of Cristian Cardona's professional portfolio.

MANDATORY RULES:
1. ONLY answer with information from the published canonical data
2. If you don't know: "I don't have that information published. You can ask by email."
3. CITE sources: "According to data/projects.json..." or "According to data/experience.json..."
4. NEVER fabricate metrics, quotes, or testimonials
5. NEVER claim production status if status is "prototype", "lab", or "planned"
6. Respond in English

CITATION EXAMPLES:
- "According to data/projects.json, the 'AI Chat API Lab' project has status 'prototype'..."
- "According to data/experience.json, worked at Talan since 2023-10..."
- "According to data/skills.json, has skill 'Azure' in category 'cloud'..."

AVAILABLE KNOWLEDGE:`;

	return basePrompt + '\n\n' + kb;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405, headers: corsHeaders });
		}

		try {
			const body = await request.json() as { message?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }>; locale?: 'en' | 'es' };
			const { message, history = [], locale = 'en' } = body;

			if (!message || typeof message !== 'string') {
				return new Response(JSON.stringify({ error: 'Message required' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			const kb = getFullKB();
			const systemPrompt = buildSystemPrompt(kb, locale);

			const messages: Message[] = [
				{ role: 'system', content: systemPrompt },
				...history.slice(-6).map(h => ({ role: h.role, content: h.content })) as Message[],
				{ role: 'user', content: message },
			];

			const providerChain = createProviderChain(env);

			const stream = new ReadableStream({
				async start(controller) {
					const encoder = new TextEncoder();
					let hasContent = false;
					let actualProvider = 'fallback';
					let actualModel: string | null = null;

					try {
						for await (const chunk of providerChain.stream(messages, { stream: true, temperature: 0.3, maxTokens: 1024 })) {
							if (chunk.content.length > 0) {
								hasContent = true;
								actualProvider = chunk.provider;
								actualModel = chunk.model;
							}
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({
								content: chunk.content,
								done: chunk.done,
								provider: chunk.provider,
								model: chunk.model,
							})}\n\n`));
							if (chunk.done) break;
						}
					} catch {
						if (hasContent) {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({
								content: '',
								done: true,
								provider: actualProvider,
								model: actualModel,
								error: 'stream_interrupted',
							})}\n\n`));
						} else {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({
								content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
								done: true,
								provider: 'fallback',
								model: null,
							})}\n\n`));
						}
					} finally {
						controller.close();
					}
				},
			});

			return new Response(stream, {
				headers: {
					...corsHeaders,
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
				},
			});

		} catch (error) {
			console.error('Chat API error:', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}
	},
};
