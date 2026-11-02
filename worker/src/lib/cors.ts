const ALLOWED_ORIGIN = 'https://cristian-cardona-dev.github.io';

export function corsHeaders(origin: string | null, methods: string): Record<string, string> {
	const headers: Record<string, string> = {
		'Access-Control-Allow-Methods': methods,
		'Access-Control-Allow-Headers': 'Content-Type',
		'Vary': 'Origin',
	};

	if (origin === ALLOWED_ORIGIN) {
		headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
	}

	return headers;
}
