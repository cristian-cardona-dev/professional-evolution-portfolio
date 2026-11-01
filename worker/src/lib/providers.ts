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
 * Groq Provider (Primary) — Llama 3.3 70B
 * Free tier: https://console.groq.com
 */
export class GroqProvider implements Provider {
	name = 'groq';
	private apiKey: string;
	private model: string;
	private baseUrl = 'https://api.groq.com/openai/v1';

	constructor(apiKey: string, model = 'llama-3.3-70b-versatile') {
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
			const error = await response.text();
			throw new Error(`Groq API error: ${response.status} - ${error}`);
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
			const error = await response.text();
			throw new Error(`Groq API error: ${response.status} - ${error}`);
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
			const error = await response.text();
			throw new Error(`Anthropic API error: ${response.status} - ${error}`);
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
			const error = await response.text();
			throw new Error(`Anthropic API error: ${response.status} - ${error}`);
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
 * Cloudflare AI Provider (Backup) — Always available on Workers
 * Models: @cf/meta/llama-3.1-8b-instruct, @cf/meta/llama-3.3-70b-instruct
 */
export class CloudflareAIProvider implements Provider {
	name = 'cloudflare-ai';
	private env: any;
	private model: string;

	constructor(env: any, model = '@cf/meta/llama-3.3-70b-instruct') {
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

		const stream = await this.env.AI.run(this.model, input);

		for await (const chunk of stream as any) {
			if (chunk.response) {
				yield { content: chunk.response, done: false, provider: 'cloudflare-ai' };
			}
		}
		yield { content: '', done: true, provider: 'cloudflare-ai' };
	}
}

/**
 * Provider chain with fallback
 */
export class ProviderChain {
	private providers: Provider[];

	constructor(providers: Provider[]) {
		this.providers = providers;
	}

	async call(messages: Message[], options: CallOptions = {}): Promise<ProviderResponse> {
		let lastError: Error | null = null;

		for (const provider of this.providers) {
			try {
				console.log(`Trying provider: ${provider.name}`);
				const response = await provider.call(messages, options);
				console.log(`Provider ${provider.name} succeeded`);
				return response;
			} catch (error) {
				console.warn(`Provider ${provider.name} failed:`, error instanceof Error ? error.message : error);
				lastError = error instanceof Error ? error : new Error(String(error));
				continue;
			}
		}

		throw lastError ?? new Error('All providers failed');
	}

	async *stream(messages: Message[], options: CallOptions = {}): AsyncIterable<StreamChunk> {
		for (const provider of this.providers) {
			try {
				console.log(`Trying streaming provider: ${provider.name}`);
				if (!provider.stream) {
					console.warn(`Provider ${provider.name} does not support streaming`);
					continue;
				}
				let hasContent = false;
				for await (const chunk of provider.stream(messages, options)) {
					hasContent = true;
					yield chunk;
				}
				if (hasContent) return;
			} catch (error) {
				console.warn(`Streaming provider ${provider.name} failed:`, error instanceof Error ? error.message : error);
				continue;
			}
		}

		// All providers failed
		yield {
			content: 'El chat no est� disponible ahora. Usa el formulario de contacto.',
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

	// Primary: Groq
	if (env.GROQ_API_KEY) {
		providers.push(new GroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'));
	}

	// Fallback: Anthropic
	if (env.ANTHROPIC_API_KEY) {
		providers.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL ?? 'claude-3-haiku-20240307'));
	}

	// Backup: Cloudflare AI (always available on Workers)
	providers.push(new CloudflareAIProvider(env, '@cf/meta/llama-3.3-70b-instruct'));

	if (providers.length === 0) {
		throw new Error('No AI providers configured');
	}

	return new ProviderChain(providers);
}