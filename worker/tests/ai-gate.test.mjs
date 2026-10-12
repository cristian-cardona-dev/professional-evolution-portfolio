/**
 * Unit gate for the comment core's pure logic and its two test seams.
 *
 * The critical assertions here are the *negative* ones: the AI mock and the
 * Turnstile bypass must be unreachable unless `ENVIRONMENT === 'test'`.
 * Production must never honour either flag, whatever else is set.
 *
 * Node 24 strips the TypeScript types on import, so the Worker source is
 * exercised directly — no duplicate JS implementation to drift.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isMockEnabled,
  moderate,
  parseGuardVerdict,
  translate,
  NEURONS_PER_GUARD,
  NEURONS_PER_TRANSLATION,
} from '../ai.ts';
import {
  isTurnstileBypassEnabled,
  verifyTurnstile,
} from '../turnstile.ts';
import { normalizePage, normalizeSourceLang, pageLocale, utcDay } from '../language.ts';

test('AI mock is only reachable in the test environment', () => {
  assert.equal(isMockEnabled({ ENVIRONMENT: 'test', AI_MOCK: '1' }), true);

  // Production never honours AI_MOCK, in any combination.
  assert.equal(isMockEnabled({ ENVIRONMENT: 'production', AI_MOCK: '1' }), false);
  assert.equal(isMockEnabled({ AI_MOCK: '1' }), false);
  assert.equal(isMockEnabled({ ENVIRONMENT: 'staging', AI_MOCK: '1' }), false);
  assert.equal(isMockEnabled({ ENVIRONMENT: 'test' }), false);
  assert.equal(isMockEnabled({ ENVIRONMENT: 'production' }), false);
  assert.equal(isMockEnabled({ ENVIRONMENT: 'Test', AI_MOCK: '1' }), false);
});

test('a production-shaped env can never produce a mock verdict', async () => {
  const env = { ENVIRONMENT: 'production', AI_MOCK: '1' };
  // No AI binding and no mock: the call must throw, and the caller turns that
  // throw into `pending`. It must NOT return a mocked "safe".
  await assert.rejects(() => moderate(env, 'anything at all'));
  await assert.rejects(() => translate(env, 'hola', 'es', 'en'));
});

test('llama-guard output is parsed strictly, fail-closed', () => {
  assert.deepEqual(parseGuardVerdict('safe'), { safe: true });
  assert.deepEqual(parseGuardVerdict(' safe \n'), { safe: true });
  assert.deepEqual(parseGuardVerdict('unsafe\nS1'), { safe: false, category: 'S1' });
  assert.deepEqual(parseGuardVerdict('UNSAFE\nS9'), { safe: false, category: 'S9' });
  assert.deepEqual(parseGuardVerdict('unsafe'), { safe: false });
  assert.throws(() => parseGuardVerdict(''));
  assert.throws(() => parseGuardVerdict('I cannot help with that.'));
  assert.throws(() => parseGuardVerdict(undefined));
  assert.throws(() => parseGuardVerdict('safe and sound, no problem'));
});

test('the mock translation seam is deterministic and exercises both failure paths', async () => {
  const env = { ENVIRONMENT: 'test', AI_MOCK: '1' };
  assert.equal(await translate(env, 'hola', 'es', 'en'), '[en] hola');
  assert.equal(await translate(env, 'hola', 'es', 'en').then(() => true), true);
  await assert.rejects(() => translate(env, 'x [[fail-translate]]', 'es', 'en'));
  const disagreement = await translate(env, 'neutral [[disagree]]', 'es', 'en');
  assert.match(disagreement, /\[\[unsafe\]\]/);
});

test('Turnstile bypass is only reachable in the test environment', () => {
  assert.equal(isTurnstileBypassEnabled({ ENVIRONMENT: 'test', TURNSTILE_BYPASS: '1' }), true);
  assert.equal(
    isTurnstileBypassEnabled({ ENVIRONMENT: 'production', TURNSTILE_BYPASS: '1' }),
    false,
  );
  assert.equal(isTurnstileBypassEnabled({ TURNSTILE_BYPASS: '1' }), false);
  assert.equal(isTurnstileBypassEnabled({ ENVIRONMENT: 'test' }), false);
});

test('an unconfigured Turnstile secret is an honest failure, never an accept', async () => {
  const env = { ENVIRONMENT: 'test', TURNSTILE_BYPASS: '1' };
  assert.equal(await verifyTurnstile(env, 'token', null), 'unconfigured');
  assert.equal(await verifyTurnstile({}, undefined, null), 'unconfigured');
});

test('production ignores the Turnstile bypass and still verifies', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ success: false }), { status: 200 });
  };
  try {
    const result = await verifyTurnstile(
      { ENVIRONMENT: 'production', TURNSTILE_SECRET: 'secret', TURNSTILE_BYPASS: '1' },
      'token',
      '203.0.113.7',
    );
    assert.equal(result, 'failed');
    assert.equal(calls.length, 1, 'production must call the real verification endpoint');
    assert.match(calls[0], /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Turnstile maps Cloudflare success to ok', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
  try {
    assert.equal(
      await verifyTurnstile({ TURNSTILE_SECRET: 'secret' }, 'token', null),
      'ok',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page locale follows the site convention', () => {
  assert.equal(pageLocale('work/'), 'en');
  assert.equal(pageLocale('work/cloud-dashboard/'), 'en');
  assert.equal(pageLocale('es/'), 'es');
  assert.equal(pageLocale('es/work/cloud-dashboard/'), 'es');
});

test('declared language maps to the stored column and the m2m100 source code', () => {
  assert.deepEqual(normalizeSourceLang('en'), { stored: 'en', translateFrom: 'en' });
  assert.deepEqual(normalizeSourceLang('ES'), { stored: 'es', translateFrom: 'es' });
  assert.deepEqual(normalizeSourceLang('fr'), { stored: 'other', translateFrom: 'fr' });
  assert.deepEqual(normalizeSourceLang('other'), { stored: 'other', translateFrom: null });
  assert.deepEqual(normalizeSourceLang(''), { stored: 'other', translateFrom: null });
  assert.deepEqual(normalizeSourceLang(undefined), { stored: 'other', translateFrom: null });
  assert.deepEqual(normalizeSourceLang('english'), { stored: 'other', translateFrom: null });
});

test('page ids are normalized to the spec shape and reject junk', () => {
  assert.equal(normalizePage('work/cloud-dashboard/'), 'work/cloud-dashboard/');
  assert.equal(normalizePage('work/cloud-dashboard'), 'work/cloud-dashboard/');
  assert.equal(normalizePage('  es/work/  '), 'es/work/');
  assert.equal(normalizePage(''), null);
  assert.equal(normalizePage('../../etc/passwd'), null);
  assert.equal(normalizePage('a?b'), null);
  assert.equal(normalizePage('a b'), null);
  assert.equal(normalizePage('x'.repeat(400)), null);
});

test('the neuron estimates match the spec cost model (~16 per comment)', () => {
  assert.equal(NEURONS_PER_GUARD + NEURONS_PER_GUARD + NEURONS_PER_TRANSLATION, 16);
});

test('utcDay is a stable day key', () => {
  assert.equal(utcDay(Date.UTC(2026, 9, 12, 23, 59)), '2026-10-12');
  assert.equal(utcDay(Date.UTC(2026, 9, 13, 0, 0)), '2026-10-13');
});
