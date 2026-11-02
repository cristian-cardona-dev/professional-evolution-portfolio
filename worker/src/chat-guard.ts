interface IPQuota {
	acceptedAt: number[];
}

interface DailyQuota {
	day: string;
	accepted: number;
}

type DenialReason = 'ip_limit' | 'daily_limit' | null;

const HOUR_MS = 60 * 60 * 1000;
const IP_LIMIT = 5;
const DAILY_LIMIT = 100;
const SALT_KEY = 'salt';
const DAILY_KEY = 'daily';

function jsonResponse(status: number, allowed: boolean, reason: DenialReason): Response {
	return new Response(JSON.stringify({ allowed, reason }), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
}

function randomSalt(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function saltedIpHash(salt: string, ip: string): Promise<string> {
	const encoded = new TextEncoder().encode(`${salt}:${ip}`);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Serializes and enforces chat quotas without retaining source IP addresses. */
export default class ChatGuard {
	constructor(
		private readonly state: DurableObjectState,
		_env: unknown,
	) {}

	async fetch(request: Request): Promise<Response> {
		if (request.method !== 'POST' || new URL(request.url).pathname !== '/consume') {
			return new Response('Not found', { status: 404 });
		}

		let ip: unknown;
		try {
			const body: unknown = await request.json();
			if (body === null || typeof body !== 'object' || Array.isArray(body)) return jsonResponse(400, false, null);
			ip = (body as { ip?: unknown }).ip;
		} catch {
			return jsonResponse(400, false, null);
		}
		if (typeof ip !== 'string' || ip.length === 0) return jsonResponse(400, false, null);

		try {
			const salt = await this.state.storage.transaction(async transaction => {
				const storedSalt = await transaction.get<string>(SALT_KEY);
				if (storedSalt) return storedSalt;
				const newSalt = randomSalt();
				await transaction.put(SALT_KEY, newSalt);
				return newSalt;
			});
			const ipKey = `ip:${await saltedIpHash(salt, ip)}`;
			const result = await this.state.storage.transaction(async transaction => {
				const now = Date.now();
				const storedIp = await transaction.get<IPQuota>(ipKey);
				const acceptedAt = (storedIp?.acceptedAt ?? []).filter(timestamp => timestamp > now - HOUR_MS);
				if (acceptedAt.length >= IP_LIMIT) return { allowed: false, reason: 'ip_limit' as const };

				const day = new Date(now).toISOString().slice(0, 10);
				const storedDaily = await transaction.get<DailyQuota>(DAILY_KEY);
				const daily = storedDaily?.day === day ? storedDaily : { day, accepted: 0 };
				if (daily.accepted >= DAILY_LIMIT) return { allowed: false, reason: 'daily_limit' as const };

				await transaction.put(ipKey, { acceptedAt: [...acceptedAt, now] } satisfies IPQuota);
				await transaction.put(DAILY_KEY, { day, accepted: daily.accepted + 1 } satisfies DailyQuota);
				return { allowed: true, reason: null };
			});
			return jsonResponse(200, result.allowed, result.reason);
		} catch {
			// Storage and hashing errors fail closed. Never return or log the source IP.
			return jsonResponse(503, false, null);
		}
	}
}
