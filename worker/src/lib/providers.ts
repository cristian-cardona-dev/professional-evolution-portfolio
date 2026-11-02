/**
 * Free-only provider chain.
 *
 * Binding policy (2026-11 free-worker tranche): Cloudflare Workers AI is the
 * ONLY provider. No API-key environment variable can activate any other
 * provider, and the model is a fixed allowlisted literal — never selected from
 * the environment. When the `AI` binding is absent the chain fails closed with
 * a sanitized configuration error; no fallback inference path exists.
 */

export interface Provider {
	name: string;
	call(messages: Message[], options?: CallOptions): Promise<ProviderResponse>;
	stream(messages: Message[], options?: CallOptions): AsyncIterable<StreamChunk>;
}

export interface Message {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface CallOptions {
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
}

export interface ProviderResponse {
	content: string;
	provider: string;
	model: string;
	usage?: { promptTokens: number; completionTokens: number };
}

export interface StreamChunk {
	content: string;
	done: boolean;
	provider: string;
	model: string | null;
}

/**
 * Minimal structural type for the Cloudflare Workers AI binding declared in
 * `worker/wrangler.jsonc` (`"ai": { "binding": "AI" }`). Kept structural so
 * tests can inject mocks without the full Workers runtime.
 */
export interface WorkersAIBinding {
	run(model: string, input: unknown): Promise<unknown>;
}

/** Environment accepted by the provider chain: only the `AI` binding matters. */
export interface ProviderEnv {
	AI?: WorkersAIBinding;
}

/**
 * The only allowlisted inference model in this tranche: Cloudflare Workers AI
 * (free-tier eligible). Literal by design — not environment-selectable.
 */
export const CLOUDFLARE_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';

/** Sanitized configuration error — carries no secret or provider detail. */
const AI_CONFIG_ERROR =
	'AI provider not configured: the Cloudflare Workers AI binding (env.AI) is required';

/** Sanitized internal error used when inference fails after output began. */
const STREAM_INTERRUPTED_ERROR = 'Stream interrupted after output began';

/** Sanitized message shown to visitors when no provider content is available. */
const CHAT_UNAVAILABLE_MESSAGE =
	'El chat no está disponible ahora. Usa el formulario de contacto.';

interface WorkersAIStreamChunk {
	response?: string;
	text?: string;
	delta?: string;
}

interface WorkersAIResponse {
	response?: string;
}

/**
 * Cloudflare AI Provider — the sole provider in this tranche, activated
 * exclusively by the `AI` binding (no API key, no env-selected model).
 */
export class CloudflareAIProvider implements Provider {
	name = 'cloudflare-ai';
	/** Allowlisted model — a fixed literal, never read from the environment. */
	readonly model = CLOUDFLARE_MODEL;
	private env: ProviderEnv;

	constructor(env: ProviderEnv) {
		this.env = env;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		const ai = this.env?.AI;
		if (!ai) {
			throw new Error(AI_CONFIG_ERROR);
		}

		const input = {
			messages: messages.map(m => ({ role: m.role, content: m.content })),
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 1024,
			stream: false,
		};

		const response = (await ai.run(this.model, input)) as WorkersAIResponse;

		return {
			content: response.response ?? '',
			provider: this.name,
			model: this.model,
		};
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		const ai = this.env?.AI;
		if (!ai) {
			throw new Error(AI_CONFIG_ERROR);
		}

		const input = {
			messages: messages.map(m => ({ role: m.role, content: m.content })),
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 1024,
			stream: true,
		};

		try {
			const streamResult = (await ai.run(this.model, input)) as AsyncIterable<WorkersAIStreamChunk>;
			for await (const chunk of streamResult) {
				const content = chunk?.response || chunk?.text || chunk?.delta;
				if (content) {
					yield { content, done: false, provider: this.name, model: this.model };
				}
			}
		} catch {
			// The chain decides whether another provider may be tried. Never
			// make a second inference with this provider after a stream error.
			throw new Error('Cloudflare AI stream failed');
		}

		yield { content: '', done: true, provider: this.name, model: this.model };
	}
}

/**
 * Provider chain. In this tranche it is always constructed with the single
 * Cloudflare provider; a provider is only advanced past when it emitted no
 * content at all, so fallback never happens after output has begun.
 */
export class ProviderChain {
	readonly providers: Provider[];

	constructor(providers: Provider[]) {
		this.providers = providers;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		let lastError: Error | null = null;

		for (const provider of this.providers) {
			try {
				const response = await provider.call(messages, options);
				return response;
			} catch (error) {
				console.warn(`Provider ${provider.name} failed`);
				lastError = error instanceof Error ? error : new Error(String(error));
				continue;
			}
		}

		throw lastError ?? new Error('All providers failed');
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		for (const provider of this.providers) {
			let hasContent = false;
			let model: string | null = null;
			try {
				if (!provider.stream) {
					console.warn(`Provider ${provider.name} does not support streaming`);
					continue;
				}
				for await (const chunk of provider.stream(messages, options)) {
					if (chunk.done) {
						// Don't yield bare done markers; they don't constitute content
						continue;
					}
					if (chunk.content && chunk.content.length > 0) {
						hasContent = true;
						model = chunk.model;
						yield chunk;
					}
				}
				if (hasContent) {
					yield { content: '', done: true, provider: provider.name, model };
					return;
				}
				console.warn(`Provider ${provider.name} yielded no content, advancing to fallback`);
			} catch {
				console.warn(`Streaming provider ${provider.name} failed`);
				if (hasContent) {
					throw new Error(STREAM_INTERRUPTED_ERROR);
				}
				continue;
			}
		}

		// All providers failed or yielded nothing: end with a sanitized error.
		yield {
			content: CHAT_UNAVAILABLE_MESSAGE,
			done: true,
			provider: 'fallback',
			model: null,
		};
	}
}

/**
 * Create the provider chain from the Worker environment.
 *
 * Free-only policy: Cloudflare Workers AI is the sole provider. The chain is
 * built only when the `AI` binding exists; every other environment variable
 * (API key or model name) is ignored and can never add a provider. Without
 * the binding the chain fails closed with a sanitized configuration error.
 */
export function createProviderChain(env: ProviderEnv): ProviderChain {
	if (!env?.AI) {
		throw new Error(AI_CONFIG_ERROR);
	}

	return new ProviderChain([new CloudflareAIProvider(env)]);
}
