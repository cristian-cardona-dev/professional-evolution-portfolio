/**
 * Lead Capture API — /api/lead
 * Stores leads in Cloudflare D1 + sends email notification
 */

import { Env } from '../index';

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
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		if (request.method !== 'POST') {
			return new Response('Method not allowed', { status: 405, headers: corsHeaders });
		}

		try {
			const body: LeadRequest = await request.json();
			const { name, email, intent, message, locale, timestamp } = body;

			if (!email || !message) {
				return new Response(JSON.stringify({ error: 'Email and message required' }), {
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			}

			// Store in D1
			if (env.DB) {
				await env.DB.prepare(`
					INSERT INTO leads (name, email, intent, message, locale, timestamp, created_at)
					VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
				`).bind(name || null, email, intent, message, locale, timestamp).run();
			}

			// Send email notification (Resend or SMTP)
			if (env.RESEND_API_KEY) {
				await sendEmailNotification(env, { name, email, intent, message, locale, timestamp });
			}

			return new Response(JSON.stringify({ success: true }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		} catch (error) {
			console.error('Lead capture error:', error);
			return new Response(JSON.stringify({ error: 'Internal server error' }), {
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
	} catch (error) {
		console.error('Email notification failed:', error);
	}
}