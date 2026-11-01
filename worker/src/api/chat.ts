/**
 * Chat API Endpoint - /api/chat
 * Handles streaming chat with grounding in canonical portfolio data
 */

import { getFullKB, getKBSections } from '../lib/kb';
import { createProviderChain, Message } from '../lib/providers';

export interface Env {
	GROQ_API_KEY?: string;
	GROQ_MODEL?: string;
	ANTHROPIC_API_KEY?: string;
	ANTHROPIC_MODEL?: string;
	AI?: any;
}

interface ChatRequest {
	message: string;
	history?: Array<Pick<Message, 'role' | 'content'>>;
	locale?: 'en' | 'es';
}

function buildSystemPrompt(kb: string, locale: 'en' | 'es'): string {
	const basePrompt = `Eres un asistente de IA grounded EXCLUSIVAMENTE en los datos publicados del portafolio de Cristian Cardona.

REGLAS OBLIGATORIAS:
1. SOLO responde con información de los datos canónicos publicados
2. Si no sabes: "No tengo esa información publicada. Puedes preguntar por email."
3. CITA fuentes: "Según data/projects.json..." o "Según data/experience.json..."
4. NUNCA inventes métricas, quotes, o testimonios
5. NUNCA afirmes producción si status es "prototype", "lab", o "planned"
6. Responde en ${locale === 'es' ? 'español' : 'inglés'}

EJEMPLOS DE CITAS:
- "Según data/projects.json, el proyecto 'AI Chat API Lab' tiene status 'prototype'..."
- "Según data/experience.json, trabajó en Talan desde 2023-10..."
- "Según data/skills.json, tiene skill 'Azure' en categoría 'cloud'..."

CONOCIMIENTO DISPONIBLE:`;

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
					let fullResponse = '';

					try {
						for await (const chunk of providerChain.stream(messages, { stream: true, temperature: 0.3, maxTokens: 1024 })) {
							fullResponse += chunk.content;
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.content, done: chunk.done, provider: chunk.provider })}\n\n`));
							if (chunk.done) break;
						}
					} catch (error) {
						console.error('Streaming error:', error);
						const errorMsg = 'El chat no está disponible ahora. Usa el formulario de contacto.';
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: errorMsg, done: true, provider: 'fallback' })}\n\n`));
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