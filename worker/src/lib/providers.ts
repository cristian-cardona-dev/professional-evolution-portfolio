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
}

/**
 * Groq Provider — optional, only activated when both GROQ_API_KEY and
 * GROQ_MODEL are explicitly configured. No default model is provided
 * because prior defaults (llama3-70b-8192, llama-3.3-70b-versatile) have
 * been decommissioned and available free models require explicit opt-in.
 * Free tier: https://console.groq.com
 */
export class GroqProvider implements Provider {
	name = 'groq';
	private apiKey: string;
	private model: string;
	private baseUrl = 'https://api.groq.com/openai/v1';

	constructor(apiKey: string, model: string) {
		this.apiKey = apiKey;
		this.model = model;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.model,
				messages: messages.map(m => ({ role: m.role, content: m.content })),
				temperature: options.temperature ?? 0.3,
				max_tokens: options.maxTokens ?? 1024,
				stream: false,
			}),
		});

		if (!response.ok) {
			console.warn(`Groq API error: ${response.status}`);
			throw new Error(`Groq API error: ${response.status}`);
		}

		const data = await response.json() as any;
		return {
			content: data.choices?.[0]?.message?.content ?? '',
			provider: 'groq',
			model: this.model,
			usage: data.usage,
		};
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.model,
				messages: messages.map(m => ({ role: m.role, content: m.content })),
				temperature: options.temperature ?? 0.3,
				max_tokens: options.maxTokens ?? 1024,
				stream: true,
			}),
		});

		if (!response.ok) {
			console.warn(`Groq API error: ${response.status}`);
			throw new Error(`Groq API error: ${response.status}`);
		}

		const reader = response.body?.getReader();
		const decoder = new TextDecoder();

		if (!reader) {
			throw new Error('No response body');
		}

		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					if (data === '[DONE]') {
						yield { content: '', done: true, provider: 'groq' };
						return;
					}
					try {
						const parsed = JSON.parse(data);
						const content = parsed.choices?.[0]?.delta?.content ?? '';
						if (content) {
							yield { content, done: false, provider: 'groq' };
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		}
	}
}

/**
 * Anthropic Provider (Fallback) — Claude Haiku
 * Free tier: https://console.anthropic.com
 */
export class AnthropicProvider implements Provider {
	name = 'anthropic';
	private apiKey: string;
	private model: string;
	private baseUrl = 'https://api.anthropic.com/v1';

	constructor(apiKey: string, model = 'claude-3-haiku-20240307') {
		this.apiKey = apiKey;
		this.model = model;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		const systemMessage = messages.find(m => m.role === 'system');
		const userMessages = messages.filter(m => m.role !== 'system');

		const response = await fetch(`${this.baseUrl}/messages`, {
			method: 'POST',
			headers: {
				'x-api-key': this.apiKey,
				'Content-Type': 'application/json',
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: this.model,
				system: systemMessage?.content ?? '',
				messages: userMessages.map(m => ({ role: m.role, content: m.content })),
				temperature: options.temperature ?? 0.3,
				max_tokens: options.maxTokens ?? 1024,
				stream: false,
			}),
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		const data = await response.json() as any;
		return {
			content: data.content?.[0]?.text ?? '',
			provider: 'anthropic',
			model: this.model,
			usage: data.usage,
		};
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		const systemMessage = messages.find(m => m.role === 'system');
		const userMessages = messages.filter(m => m.role !== 'system');

		const response = await fetch(`${this.baseUrl}/messages`, {
			method: 'POST',
			headers: {
				'x-api-key': this.apiKey,
				'Content-Type': 'application/json',
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: this.model,
				system: systemMessage?.content ?? '',
				messages: userMessages.map(m => ({ role: m.role, content: m.content })),
				temperature: options.temperature ?? 0.3,
				max_tokens: options.maxTokens ?? 1024,
				stream: true,
			}),
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		const reader = response.body?.getReader();
		const decoder = new TextDecoder();

		if (!reader) {
			throw new Error('No response body');
		}

		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = line.slice(6);
					try {
						const parsed = JSON.parse(data);
						if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
							yield { content: parsed.delta.text, done: false, provider: 'anthropic' };
						} else if (parsed.type === 'message_stop') {
							yield { content: '', done: true, provider: 'anthropic' };
							return;
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		}
	}
}

/**
 * Cloudflare AI Provider (Fallback) — Always available on Workers
 * Uses Mistral 7B as the fallback model when Groq is not configured
 */
export class CloudflareAIProvider implements Provider {
	name = 'cloudflare-ai';
	private env: any;
	private model: string;

	constructor(env: any, model = '@cf/mistral/mistral-7b-instruct-v0.1') {
		this.env = env;
		this.model = model;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		if (!this.env?.AI) {
			throw new Error('Cloudflare AI not available (no env.AI binding)');
		}

		const input = {
			messages: messages.map(m => ({ role: m.role, content: m.content })),
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 1024,
			stream: false,
		};

		const response = await this.env.AI.run(this.model, input);

		return {
			content: response.response ?? '',
			provider: 'cloudflare-ai',
			model: this.model,
		};
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		if (!this.env?.AI) {
			throw new Error('Cloudflare AI not available');
		}

		const input = {
			messages: messages.map(m => ({ role: m.role, content: m.content })),
			temperature: options.temperature ?? 0.3,
			max_tokens: options.maxTokens ?? 1024,
			stream: true,
		};

		try {
			const stream = await this.env.AI.run(this.model, input);

			let hasContent = false;
			for await (const chunk of stream as any) {
				if (chunk.response) {
					hasContent = true;
					yield { content: chunk.response, done: false, provider: 'cloudflare-ai' };
				} else if (chunk.text) {
					hasContent = true;
					yield { content: chunk.text, done: false, provider: 'cloudflare-ai' };
				} else if (chunk.delta) {
					hasContent = true;
					yield { content: chunk.delta, done: false, provider: 'cloudflare-ai' };
				}
			}

			// If streaming didn't yield any content, fall back to non-streaming
			if (!hasContent) {
				const nonStreamInput = { ...input, stream: false };
				const response = await this.env.AI.run(this.model, nonStreamInput);
				if (response.response) {
					yield { content: response.response, done: false, provider: 'cloudflare-ai' };
				}
			}
		} catch (error) {
			console.warn('Cloudflare AI streaming failed, falling back to non-streaming');
			// Fallback to non-streaming on any error
			const nonStreamInput = { ...input, stream: false };
			const response = await this.env.AI.run(this.model, nonStreamInput);
			if (response.response) {
				yield { content: response.response, done: false, provider: 'cloudflare-ai' };
			}
		}

		yield { content: '', done: true, provider: 'cloudflare-ai' };
	}
}

/**
 * Provider chain with fallback
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
		let lastError: Error | null = null;
		for (const provider of this.providers) {
			try {
				if (!provider.stream) {
					console.warn(`Provider ${provider.name} does not support streaming`);
					continue;
				}
				let hasContent = false;
				for await (const chunk of provider.stream(messages, options)) {
					if (chunk.done) {
						// Don't yield bare done markers; they don't constitute content
						continue;
					}
					if (chunk.content && chunk.content.length > 0) {
						hasContent = true;
						yield chunk;
					}
				}
				if (hasContent) {
					yield { content: '', done: true, provider: provider.name };
					return;
				}
				console.warn(`Provider ${provider.name} yielded no content, advancing to fallback`);
			} catch (error) {
				console.warn(`Streaming provider ${provider.name} failed`);
				lastError = error instanceof Error ? error : new Error(String(error));
				continue;
			}
		}

		// All providers failed or yielded nothing
		yield {
			content: 'El chat no está disponible ahora. Usa el formulario de contacto.',
			done: true,
			provider: 'fallback',
		};
	}
}

/**
 * Create provider chain from environment
 */
export function createProviderChain(env: any): ProviderChain {
	const providers: Provider[] = [];

	// Provider order (highest to lowest priority):
	// 1. Groq - only when BOTH GROQ_API_KEY and explicit GROQ_MODEL are configured
	// 2. Cloudflare Mistral - fallback, always available on Workers
	// 3. Anthropic - optional, only when ANTHROPIC_API_KEY is configured

	// Base fallback: Cloudflare Mistral (always available on Workers)
	providers.push(new CloudflareAIProvider(env, '@cf/mistral/mistral-7b-instruct-v0.1'));

	// Highest priority: Groq only when BOTH key and explicit model are configured.
	// No default model - prior defaults (llama3-70b-8192, llama-3.3-70b-versatile)
	// are decommissioned. Must be explicitly configured.
	if (env.GROQ_API_KEY && env.GROQ_MODEL) {
		providers.unshift(new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL));
	}

	// Lowest priority: Anthropic (optional, only when key is configured)
	if (env.ANTHROPIC_API_KEY) {
		providers.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL ?? 'claude-3-haiku-20240307'));
	}

	if (providers.length === 0) {
		throw new Error('No AI providers configured');
	}

	return new ProviderChain(providers);
}