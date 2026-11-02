/**
 * Lead Capture API - /api/lead
 * Stores leads in Cloudflare D1 + sends email notification
 */

import { Env } from '../index';
import { corsHeaders } from '../lib/cors';

interface LeadRequest {
	name: string;
	email: string;
	intent: string;
	message: string;
	locale: 'en' | 'es';
	timestamp: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const cors = corsHeaders(request.headers.get('Origin'), 'POST, OPTIONS');

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: cors });
		}

		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405, headers: cors });
		}

		if (!env.DB) {
			return new Response(JSON.stringify({ error: 'Lead capture is temporarily unavailable' }), {
				status: 503,
				headers: { ...cors, 'Content-Type': 'application/json' },
			});
		}

		try {
			const body = await request.json() as LeadRequest;
			const { name, email, intent, message, locale, timestamp } = body;

			if (!email || !message) {
				return new Response(JSON.stringify({ error: 'Email and message required' }), {
					status: 400,
					headers: { ...cors, 'Content-Type': 'application/json' },
				});
			}

			try {
				await env.DB.prepare(
					`INSERT INTO leads (name, email, intent, message, locale, timestamp, created_at)
					VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
				).bind(name || null, email, intent, message, locale, timestamp).run();
			} catch {
				console.error('Lead persistence failed');
				return new Response(JSON.stringify({ error: 'Internal server error' }), {
					status: 500,
					headers: { ...cors, 'Content-Type': 'application/json' },
				});
			}

			if (env.RESEND_API_KEY) {
				await sendEmailNotification(env, { name, email, intent, message, locale, timestamp });
			}

			return new Response(JSON.stringify({ success: true }), {
				headers: { ...cors, 'Content-Type': 'application/json' },
			});
		} catch {
			console.error('Lead capture failed');
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { ...cors, 'Content-Type': 'application/json' },
			});
		}
	},
};

async function sendEmailNotification(env: any, lead: any): Promise<void> {
	if (!env.RESEND_API_KEY) return;

	try {
		await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: 'Portfolio Chat <noreply@cristian-cardona.dev>',
				to: ['crisss198@gmail.com'],
				subject: `New lead: ${lead.intent} - ${lead.email}`,
				html: `
					<h2>New portfolio lead</h2>
					<p><strong>Name:</strong> ${lead.name || 'Not provided'}</p>
					<p><strong>Email:</strong> ${lead.email}</p>
					<p><strong>Intent:</strong> ${lead.intent}</p>
					<p><strong>Locale:</strong> ${lead.locale}</p>
					<p><strong>Timestamp:</strong> ${lead.timestamp}</p>
					<hr>
					<p><strong>Message:</strong></p>
					<p>${lead.message}</p>
				`,
			}),
		});
	} catch {
		console.error('Email notification failed');
	}
}
