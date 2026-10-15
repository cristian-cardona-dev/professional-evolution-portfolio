/**
 * Workers AI wrappers for the comment pipeline (spec 6.1 / 6.2 / 6.3).
 *
 * Two models, no runtime dependency:
 *   - `@cf/meta/llama-guard-3-8b` — moderation verdict, temperature 0,
 *     max_tokens 16, strict `safe` / `unsafe` parse.
 *   - `@cf/meta/m2m100-1.2b` — one-shot EN<->ES (many-to-many) translation.
 *
 * TEST SEAM (`AI_MOCK`): CI has no Workers AI. The mock below is honoured ONLY
 * when `ENVIRONMENT === 'test'`. Production (`ENVIRONMENT === 'production'`,
 * the default in `wrangler.jsonc`) can never reach it, even if `AI_MOCK=1` is
 * somehow present — asserted in `worker/tests/ai-gate.test.mjs` and in the API
 * integration suite.
 *
 * This module imports nothing from `cloudflare:workers`, so Node's type
 * stripping can import it directly in tests.
 */

const GUARD_MODEL = '@cf/meta/llama-guard-3-8b';
const TRANSLATE_MODEL = '@cf/meta/m2m100-1.2b';

/**
 * Neuron estimates per inference, used by the DO budget guardrail. The spec's
 * cost model is ~16 neurons per comment (both gates + one translation); these
 * two constants sum to exactly that, so the 5,000/day threshold matches the
 * spec's 50%-of-free-allocation intent.
 */
export const NEURONS_PER_GUARD = 4;
export const NEURONS_PER_TRANSLATION = 8;

export interface AiEnv {
  AI?: AiBinding;
  ENVIRONMENT?: string;
  AI_MOCK?: string;
}

export interface Verdict {
  safe: boolean;
  category?: string;
}

/**
 * The single gate that decides whether the deterministic mock may run.
 * Fail-closed by construction: anything other than `test` + `AI_MOCK=1` means
 * the real model path.
 */
export function isMockEnabled(env: AiEnv): boolean {
  return env.ENVIRONMENT === 'test' && env.AI_MOCK === '1';
}

/**
 * Deterministic mock verdicts.
 *   - `[[unsafe]]` or the word `unsafe`  -> unsafe
 *   - anything else                      -> safe
 */
function mockModerate(text: string): Verdict {
  return /\[\[unsafe\]\]|\bunsafe\b/i.test(text)
    ? { safe: false, category: 'S1' }
    : { safe: true };
}

/**
 * Deterministic mock translation.
 *   - `[[fail-translate]]` -> throws, exercising the moderation "translation
 *     failure -> pending" branch.
 *   - `[[fail-reading-translate]]` -> throws only for explicit public reading,
 *     so its fallback can be tested without weakening moderation coverage.
 *   - `[[disagree]]`       -> the translation carries `[[unsafe]]`, so the
 *     source gate is safe while the translation gate is unsafe: the
 *     disagreement path (verdicts differ -> pending).
 *   - otherwise            -> `[<target>] <text>`, a visibly machine string.
 */
function mockTranslate(text: string, target: string, purpose: 'moderation' | 'reading'): string {
  if (text.includes('[[fail-translate]]')) throw new Error('mock: translation failure');
  if (purpose === 'reading' && text.includes('[[fail-reading-translate]]')) {
    throw new Error('mock: reading translation failure');
  }
  const marker = text.includes('[[disagree]]') ? '[[unsafe]] ' : '';
  return `${marker}[${target}] ${text}`;
}

/**
 * Strict parse of the llama-guard output. The model answers `safe` or
 * `unsafe\n<category>`. Anything else (empty, truncated, a refusal, a
 * different model's prose) throws — and the caller turns a throw into
 * `pending`. Fail-closed: an unparseable verdict is never "safe".
 */
export function parseGuardVerdict(raw: unknown): Verdict {
  const out = String(raw ?? '').trim();
  const [firstLine = '', secondLine = ''] = out.split('\n');
  const first = firstLine.trim().toLowerCase();
  if (first === 'safe') return { safe: true };
  if (first === 'unsafe') {
    const category = secondLine.trim();
    return category ? { safe: false, category } : { safe: false };
  }
  throw new Error(`unparseable llama-guard verdict: ${JSON.stringify(out.slice(0, 80))}`);
}

/** Moderate one text. Throws on model failure or unparseable output. */
export async function moderate(env: AiEnv, text: string): Promise<Verdict> {
  if (isMockEnabled(env)) return mockModerate(text);
  if (!env.AI) throw new Error('Workers AI binding unavailable');
  const result = (await env.AI.run(GUARD_MODEL, {
    messages: [{ role: 'user', content: text }],
    temperature: 0,
    max_tokens: 16,
  })) as { response?: unknown };
  return parseGuardVerdict(result?.response);
}

/**
 * One-shot translation using the existing model. Moderation callers use the
 * default purpose and fail closed (queueing the comment); reading callers are
 * explicit and cache successful output separately. Both throw on model failure
 * or an empty translation.
 * `sourceLang` is omitted when the language is genuinely unknown; m2m100 is
 * many-to-many and may still answer, and a failure is handled as a failure.
 */
export async function translate(
  env: AiEnv,
  text: string,
  sourceLang: string | null,
  targetLang: string,
  purpose: 'moderation' | 'reading' = 'moderation',
): Promise<string> {
  if (isMockEnabled(env)) return mockTranslate(text, targetLang, purpose);
  if (!env.AI) throw new Error('Workers AI binding unavailable');
  const input: Record<string, unknown> = { text, target_lang: targetLang };
  if (sourceLang) input.source_lang = sourceLang;
  const result = (await env.AI.run(TRANSLATE_MODEL, input)) as { translated_text?: unknown };
  const translated = typeof result?.translated_text === 'string' ? result.translated_text.trim() : '';
  if (translated.length === 0) throw new Error('m2m100 returned no translation');
  return translated;
}
