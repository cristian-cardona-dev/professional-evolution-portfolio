/**
 * Minimal ambient types for the Cloudflare Worker runtime.
 *
 * The project deliberately ships zero runtime and build dependencies for the
 * Worker (`wrangler` bundles TypeScript with esbuild, no type package needed),
 * so instead of pulling `@cloudflare/workers-types` this file declares the
 * handful of runtime surfaces the comment core actually touches. It exists for
 * `tsc -p worker/tsconfig.json` (and editor support) only — esbuild ignores it.
 */

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  /**
   * RPC stub: the generic parameter is the Durable Object class being called,
   * so `env.COMMENTS.get<CommentsRoom>(id).list(...)` type-checks.
   */
  get<T = DurableObjectStub>(id: DurableObjectId): T;
}

interface SqlStorageCursor<Row = Record<string, unknown>> {
  toArray(): Row[];
  one(): Row;
}

interface SqlStorage {
  exec<Row = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<Row>;
}

interface DurableObjectStorage {
  readonly sql: SqlStorage;
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage;
  /** Open WebSockets — the F-B presence source. Empty in F-A. */
  getWebSockets(): WebSocket[];
}

interface AiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

interface Env {
  /** Workers AI binding (`ai` in wrangler.jsonc). Absent in CI/local-without-auth. */
  AI?: AiBinding;
  /** Static-asset binding; only used when a request falls through to the Worker. */
  ASSETS?: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
  /** Durable Object namespace for the per-page comment rooms. */
  COMMENTS: DurableObjectNamespace;
  /** `production` by default. Only `test` unlocks the AI_MOCK / TURNSTILE_BYPASS seams. */
  ENVIRONMENT?: string;
  /** TEST-ONLY. Never honoured unless ENVIRONMENT === 'test'. */
  AI_MOCK?: string;
  /** TEST-ONLY. Never honoured unless ENVIRONMENT === 'test'. */
  TURNSTILE_BYPASS?: string;
  /** Turnstile secret. Absent => the API is honestly unavailable (503). */
  TURNSTILE_SECRET?: string;
  /** Admin moderation bearer token. Absent => admin API is honestly unavailable (503). */
  COMMENTS_ADMIN_TOKEN?: string;
}

declare module 'cloudflare:workers' {
  export class DurableObject<E = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: E;
    constructor(ctx: DurableObjectState, env: E);
  }
}
