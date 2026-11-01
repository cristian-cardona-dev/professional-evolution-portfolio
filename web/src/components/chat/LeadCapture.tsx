/**
 * Lead Capture Form — captures contact intent from chat
 * Stores in Cloudflare D1 + sends email notification
 */

import { useState } from 'react';

interface Props {
	copy: any;
	locale: 'en' | 'es';
	onClose: () => void;
}

interface LeadData {
	name: string;
	email: string;
	intent: string;
	message: string;
}

const INTENT_OPTIONS = {
	en: [
		{ value: 'hiring', label: 'Hiring / Contract work' },
		{ value: 'collaboration', label: 'Technical collaboration' },
		{ value: 'question', label: 'Technical question' },
		{ value: 'other', label: 'Other' },
	],
	es: [
		{ value: 'hiring', label: 'Contratación / Trabajo por contrato' },
		{ value: 'collaboration', label: 'Colaboración técnica' },
		{ value: 'question', label: 'Pregunta técnica' },
		{ value: 'other', label: 'Otro' },
	],
};

export default function LeadCapture({ copy, locale, onClose }: Props) {
	const intents = INTENT_OPTIONS[locale];
	const [formData, setFormData] = useState<{
		name: string;
		email: string;
		intent: string;
		message: string;
	}>({
		name: '',
		email: '',
		intent: 'question',
		message: '',
	});
	const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setStatus('submitting');
		setError(null);

		try {
			const response = await fetch('/api/lead', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...formData,
					locale,
					timestamp: new Date().toISOString(),
				}),
			});

			if (!response.ok) {
				const err = await response.json();
				throw new Error(err.error || 'Failed to submit');
			}

			setStatus('success');
			setTimeout(onClose, 2000);
		} catch (err) {
			setStatus('error');
			setError(err instanceof Error ? err.message : 'Failed to submit');
		}
	};

	const handleChange = (field: string, value: string) => {
		setFormData(prev => ({ ...prev, [field]: value }));
	};

	return (
		<form className="chat-lead-form" onSubmit={handleSubmit}>
			<h3 className="chat-lead-form__title">
				{copy.leadCapture?.title ?? 'Get in touch'}
			</h3>

			<div className="chat-lead-form__field">
				<label htmlFor="lead-name" className="chat-lead-form__label">
					{copy.leadCapture?.nameLabel ?? 'Name (optional)'}
				</label>
				<input
					type="text"
					id="lead-name"
					className="chat-lead-form__input"
					value={formData.name}
					onChange={e => handleChange('name', e.target.value)}
					placeholder="Your name"
				/>
			</div>

			<div className="chat-lead-form__field">
				<label htmlFor="lead-email" className="chat-lead-form__label">
					{copy.leadCapture?.emailLabel ?? 'Email *'}
				</label>
				<input
					type="email"
					id="lead-email"
					className="chat-lead-form__input"
					value={formData.email}
					onChange={e => handleChange('email', e.target.value)}
					placeholder="your@email.com"
					required
				/>
			</div>

			<div className="chat-lead-form__field">
				<label htmlFor="lead-intent" className="chat-lead-form__label">
					{copy.leadCapture?.intentLabel ?? 'What is this about?'}
				</label>
				<select
					id="lead-intent"
					className="chat-lead-form__select"
					value={formData.intent}
					onChange={e => handleChange('intent', e.target.value)}
				>
					{intents.map(opt => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			<div className="chat-lead-form__field">
				<label htmlFor="lead-message" className="chat-lead-form__label">
					{copy.leadCapture?.messageLabel ?? 'Message *'}
				</label>
				<textarea
					id="lead-message"
					className="chat-lead-form__input"
					value={formData.message}
					onChange={e => handleChange('message', e.target.value)}
					rows={4}
					placeholder={copy.leadCapture?.messagePlaceholder ?? 'Tell me more...'}
					required
				/>
			</div>

			{status === 'error' && (
				<div className="chat-lead-form__error" role="alert">
					{error}
				</div>
			)}

			<button
				type="submit"
				className="chat-lead-form__submit"
				disabled={status === 'submitting'}
			>
				{status === 'submitting'
					? copy.leadCapture?.submitting ?? 'Sending...'
					: copy.leadCapture?.submit ?? 'Send'}
			</button>

			{status === 'success' && (
				<div className="chat-lead-form__success" role="status">
					{copy.leadCapture?.success ?? 'Thanks! I\'ll get back to you soon.'}
				</div>
			)}

			<button
				type="button"
				className="chat-lead-form__skip"
				onClick={onClose}
			>
				{copy.leadCapture?.skip ?? 'Not now'}
			</button>
		</form>
	);
}