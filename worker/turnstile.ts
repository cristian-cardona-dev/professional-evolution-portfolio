/**
 * Server-side Turnstile verification (spec 8).
 *
 * Three outcomes, never a fourth:
 *   - `unconfigured` — no `TURNSTILE_SECRET`: the API answers 503. An
 *     unconfigured deployment must never silently accept an unverified POST.
 *   - `failed`       — a token was required and is missing/rejected.
 *   - `ok`           — verified by Cloudflare, or the test-only bypass.
 *
 * TEST SEAM (`TURNSTILE_BYPASS`): CI/local has no Turnstile widget. The bypass
 * is honoured ONLY when `ENVIRONMENT === 'test'`. Production can never reach it.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileEnv {
  TURNSTILE_SECRET?: string;
  TURNSTILE_BYPASS?: string;
  ENVIRONMENT?: string;
}

export type TurnstileResult = 'ok' | 'failed' | 'unconfigured';

export function isTurnstileBypassEnabled(env: TurnstileEnv): boolean {
  return env.ENVIRONMENT === 'test' && env.TURNSTILE_BYPASS === '1';
}

export async function verifyTurnstile(
  env: TurnstileEnv,
  token: unknown,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET) return 'unconfigured';
  if (isTurnstileBypassEnabled(env)) return 'ok';
  if (typeof token !== 'string' || token.trim().length === 0) return 'failed';
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token.trim(),
  });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!response.ok) return 'failed';
    const data = (await response.json()) as { success?: unknown };
    return data?.success === true ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}
