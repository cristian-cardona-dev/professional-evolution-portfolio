import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatGuard from '../src/chat-guard';

type StoredValue = unknown;

function makeState() {
	const values = new Map<string, StoredValue>();
	let transactionTail = Promise.resolve();
	const storage = {
		get: vi.fn(async <T>(key: string) => values.get(key) as T | undefined),
		put: vi.fn(async (key: string, value: StoredValue) => { values.set(key, value); }),
		transaction: vi.fn(async <T>(callback: (txn: typeof storage) => Promise<T>) => {
			const previous = transactionTail;
			let release!: () => void;
			transactionTail = new Promise<void>(resolve => { release = resolve; });
			await previous;
			try {
				return await callback(storage);
			} finally {
				release();
			}
		}),
	};
	return { values, state: { storage } as any };
}

function consume(guard: ChatGuard, ip: string) {
	return guard.fetch(new Request('https://guard.test/consume', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ip }),
	}));
}

async function consumeResult(guard: ChatGuard, ip: string) {
	const response = await consume(guard, ip);
	return { status: response.status, ...(await response.json()) as { allowed: boolean; reason: string | null } };
}

describe('ChatGuard quota Durable Object', () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it('allows five requests per source IP in a rolling hour and then denies the sixth', async () => {
		const { state } = makeState();
		const guard = new ChatGuard(state, {} as any);
		const results = await Promise.all(Array.from({ length: 6 }, () => consumeResult(guard, '198.51.100.24')));

		expect(results.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => ({ status: 200, allowed: true, reason: null })));
		expect(results[5]).toEqual({ status: 200, allowed: false, reason: 'ip_limit' });
	});

	it('serializes concurrent requests so no more than five same-IP requests pass', async () => {
		const { state } = makeState();
		const guard = new ChatGuard(state, {} as any);
		const results = await Promise.all(Array.from({ length: 20 }, () => consumeResult(guard, '198.51.100.25')));

		expect(results.filter(result => result.allowed)).toHaveLength(5);
		expect(results.filter(result => !result.allowed && result.reason === 'ip_limit')).toHaveLength(15);
	});

	it('caps accepted requests at 100 per UTC day and resets on UTC-day rollover', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-02T23:59:00.000Z'));
		const { state } = makeState();
		const guard = new ChatGuard(state, {} as any);
		const dayOne = await Promise.all(Array.from({ length: 130 }, (_, index) => consumeResult(guard, `198.51.100.${index + 1}`)));
		const overLimit = await consumeResult(guard, '203.0.113.1');
		vi.setSystemTime(new Date('2026-11-03T00:00:00.000Z'));
		const dayTwo = await consumeResult(guard, '203.0.113.1');

		expect(dayOne.filter(result => result.allowed)).toHaveLength(100);
		expect(dayOne.filter(result => !result.allowed && result.reason === 'daily_limit')).toHaveLength(30);
		expect(overLimit).toEqual({ status: 200, allowed: false, reason: 'daily_limit' });
		expect(dayTwo).toEqual({ status: 200, allowed: true, reason: null });
	});

	it('expires IP quota timestamps at the rolling one-hour boundary', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
		const { state } = makeState();
		const guard = new ChatGuard(state, {} as any);
		for (let request = 0; request < 5; request++) await consumeResult(guard, '198.51.100.90');
		vi.setSystemTime(new Date('2026-11-02T13:00:00.000Z'));

		expect(await consumeResult(guard, '198.51.100.90')).toEqual({ status: 200, allowed: true, reason: null });
	});

	it('persists salted IP hashes but never the source IP itself', async () => {
		const { state, values } = makeState();
		const guard = new ChatGuard(state, {} as any);
		const sourceIp = '203.0.113.81';

		await consumeResult(guard, sourceIp);

		const persisted = JSON.stringify({ keys: [...values.keys()], values: [...values.values()] });
		expect(persisted).not.toContain(sourceIp);
		expect([...values.keys()].some(key => /^ip:[a-f0-9]{64}$/.test(key))).toBe(true);
	});

	it('fails closed with a sanitized response when quota storage fails', async () => {
		const state = { storage: { transaction: vi.fn().mockRejectedValue(new Error('raw storage detail')) } } as any;
		const guard = new ChatGuard(state, {} as any);
		const response = await consume(guard, '203.0.113.82');

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ allowed: false, reason: null });
		expect(await response.text().catch(() => '')).not.toContain('raw storage detail');
	});
});
