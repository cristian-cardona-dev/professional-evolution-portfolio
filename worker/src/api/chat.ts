/**
 * Chat API Endpoint - /api/chat
 * Handles streaming chat with grounding in canonical portfolio data
 */

import { getAssistantKB } from '../lib/kb';
import { createProviderChain, Message, WorkersAIBinding } from '../lib/providers';

export interface Env {
	AI?: WorkersAIBinding;
	CHAT_GUARD?: DurableObjectNamespace;
}

interface ChatRequest {
	message: string;
	history?: Array<Pick<Message, 'role' | 'content'>>;
	locale?: 'en' | 'es';
}

const MAX_REQUEST_BODY_BYTES = 131_072;

type BodyReadResult =
	| { kind: 'body'; text: string }
	| { kind: 'too-large' }
	| { kind: 'deadline' };

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

function jsonError(status: number, error: string, corsHeaders: Record<string, string>): Response {
	return new Response(JSON.stringify({ error }), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}

function readChatBody(value: unknown): ChatRequest | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const body = value as Record<string, unknown>;
	if (typeof body.message !== 'string' || body.message.trim().length === 0 || Array.from(body.message).length > 2000) return null;
	if (body.locale !== undefined && body.locale !== 'en' && body.locale !== 'es') return null;
	if (body.history !== undefined && !Array.isArray(body.history)) return null;
	const history = (body.history ?? []) as unknown[];
	if (history.length > 6) return null;
	for (const item of history) {
		if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
		const prior = item as Record<string, unknown>;
		if (
			(prior.role !== 'user' && prior.role !== 'assistant') ||
			typeof prior.content !== 'string' ||
			Array.from(prior.content).length > 2000
		) return null;
	}
	return {
		message: body.message,
		history: history as ChatRequest['history'],
		locale: (body.locale ?? 'en') as 'en' | 'es',
	};
}

async function checkQuota(env: Env, request: Request): Promise<'allowed' | 'limited' | 'unavailable'> {
	const sourceIp = request.headers.get('cf-connecting-ip');
	if (!sourceIp || !env.CHAT_GUARD) return 'unavailable';
	try {
		const guard = env.CHAT_GUARD.get(env.CHAT_GUARD.idFromName('global-chat-quota'));
		const response = await guard.fetch(new Request('https://chat-guard/consume', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ip: sourceIp }),
		}));
		if (!response.ok) return 'unavailable';
		const value: unknown = await response.json();
		if (value === null || typeof value !== 'object') return 'unavailable';
		const result = value as { allowed?: unknown; reason?: unknown };
		if (result.allowed === true && result.reason === null) return 'allowed';
		if (result.allowed === false && (result.reason === 'ip_limit' || result.reason === 'daily_limit')) return 'limited';
		return 'unavailable';
	} catch {
		return 'unavailable';
	}
}

const RESPONSE_DEADLINE_MS = 30_000;
const DEADLINE_EXPIRED = Symbol('deadline-expired');

async function readBoundedBody(request: Request, deadlineAt: number): Promise<BodyReadResult> {
	const advertisedLength = request.headers.get('Content-Length');
	if (advertisedLength && /^\d+$/u.test(advertisedLength) && Number(advertisedLength) > MAX_REQUEST_BODY_BYTES) {
		void request.body?.cancel('request body exceeds size limit').catch(() => undefined);
		return { kind: 'too-large' };
	}

	if (!request.body) return { kind: 'body', text: '' };
	const reader = request.body.getReader();
	const readAll = async (): Promise<Exclude<BodyReadResult, { kind: 'deadline' }>> => {
		const chunks: Uint8Array[] = [];
		let byteLength = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				byteLength += value.byteLength;
				if (byteLength > MAX_REQUEST_BODY_BYTES) {
					void reader.cancel('request body exceeds size limit').catch(() => undefined);
					return { kind: 'too-large' };
				}
				chunks.push(value);
			}

			const bytes = new Uint8Array(byteLength);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			return { kind: 'body', text: new TextDecoder().decode(bytes) };
		} finally {
			reader.releaseLock();
		}
	};

	const result = await withinDeadline(readAll(), deadlineAt);
	if (result === DEADLINE_EXPIRED) {
		void reader.cancel('request body deadline expired').catch(() => undefined);
		return { kind: 'deadline' };
	}
	return result;
}

async function withinDeadline<T>(operation: Promise<T>, deadlineAt: number): Promise<T | typeof DEADLINE_EXPIRED> {
	const remaining = deadlineAt - Date.now();
	if (remaining <= 0) return DEADLINE_EXPIRED;
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<typeof DEADLINE_EXPIRED>(resolve => {
		timer = setTimeout(() => resolve(DEADLINE_EXPIRED), remaining);
	});
	try {
		return await Promise.race([operation, timeout]);
	} finally {
		clearTimeout(timer!);
	}
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
		const deadlineAt = Date.now() + RESPONSE_DEADLINE_MS;

		let rawBody: unknown;
		try {
			const body = await readBoundedBody(request, deadlineAt);
			if (body.kind === 'too-large') return jsonError(413, 'Chat request body is too large', corsHeaders);
			if (body.kind === 'deadline') return jsonError(503, 'Chat is temporarily unavailable', corsHeaders);
			rawBody = JSON.parse(body.text);
		} catch {
			return jsonError(400, 'Invalid chat request', corsHeaders);
		}
		const chatBody = readChatBody(rawBody);
		if (!chatBody) return jsonError(400, 'Invalid chat request', corsHeaders);

		const quota = await withinDeadline(checkQuota(env, request), deadlineAt);
		if (quota === DEADLINE_EXPIRED) return jsonError(503, 'Chat is temporarily unavailable', corsHeaders);
		if (quota === 'limited') return jsonError(429, 'Chat limit reached', corsHeaders);
		if (quota === 'unavailable') return jsonError(503, 'Chat is temporarily unavailable', corsHeaders);

		try {
			const { message, history = [], locale = 'en' } = chatBody;
			const kb = getAssistantKB();
			const systemPrompt = buildSystemPrompt(kb, locale);

			const messages: Message[] = [
				{ role: 'system', content: systemPrompt },
				...history.map(h => ({ role: h.role, content: h.content })) as Message[],
				{ role: 'user', content: message },
			];

			const providerChain = createProviderChain(env);
			const providerAbortController = new AbortController();

			let cancelStream = () => {};
			const stream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					let hasContent = false;
					let actualProvider = 'fallback';
					let actualModel: string | null = null;
					let finished = false;
					let stopReason: 'timeout' | 'cancel' | null = null;
					let resolveStopped!: (reason: 'timeout' | 'cancel') => void;
					const stopped = new Promise<'timeout' | 'cancel'>(resolve => { resolveStopped = resolve; });
					const iterator = providerChain.stream(messages, {
						stream: true,
						temperature: 0.3,
						maxTokens: 1024,
						signal: providerAbortController.signal,
					})[Symbol.asyncIterator]();
					let timer: ReturnType<typeof setTimeout>;
					const stop = (reason: 'timeout' | 'cancel') => {
						if (finished || stopReason) return;
						stopReason = reason;
						if (reason === 'cancel') clearTimeout(timer);
						providerAbortController.abort();
						resolveStopped(reason);
						try {
							const closing = iterator.return?.();
							if (closing) void closing.catch(() => undefined);
						} catch {
							// Iterator cancellation is best-effort; response lifetime remains bounded.
						}
					};
					cancelStream = () => stop('cancel');
					const abortFromRequest = () => stop('cancel');
					const emitFailure = () => {
						if (hasContent) {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '', done: true, provider: actualProvider, model: actualModel, error: 'stream_interrupted' })}\n\n`));
						} else {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: 'El chat no está disponible ahora. Usa el formulario de contacto.', done: true, provider: 'fallback', model: null })}\n\n`));
						}
					};
					timer = setTimeout(() => stop('timeout'), Math.max(0, deadlineAt - Date.now()));
					request.signal.addEventListener('abort', abortFromRequest, { once: true });
					if (request.signal.aborted) stop('cancel');

					void (async () => {
						try {
							while (!stopReason) {
								const next = iterator.next().then(value => ({ kind: 'chunk' as const, value }));
								const outcome = await Promise.race([next, stopped.then(reason => reason === 'timeout' ? { kind: 'timeout' as const } : { kind: 'cancel' as const })]);
								if (outcome.kind === 'cancel') break;
								if (outcome.kind === 'timeout') {
									emitFailure();
									break;
								}
								if (outcome.value.done) break;
								const chunk = outcome.value.value;
								if (stopReason === 'cancel') break;
								if (chunk.content.length > 0) {
									hasContent = true;
									actualProvider = chunk.provider;
									actualModel = chunk.model;
								}
								controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.content, done: chunk.done, provider: chunk.provider, model: chunk.model })}\n\n`));
								if (chunk.done) break;
							}
						} catch {
							if (!stopReason) emitFailure();
						} finally {
							finished = true;
							clearTimeout(timer);
							request.signal.removeEventListener('abort', abortFromRequest);
							if (stopReason !== 'cancel') {
								try { controller.close(); } catch { /* response already cancelled */ }
							}
						}
					})();
				},
				cancel() {
					cancelStream();
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
			console.error('Chat API internal error');
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}
	},
};
