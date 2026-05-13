import { env } from '$env/dynamic/private';

/**
 * @returns {string}
 */
function baseUrl() {
	return String(env.CRAWL4AI_SERVICE_URL || '')
		.trim()
		.replace(/\/+$/, '');
}

/**
 * @returns {boolean}
 */
export function crawl4aiConfigured() {
	return Boolean(baseUrl());
}

/**
 * Forward a request to the Crawl4AI sidecar (server-side only).
 * @param {string} path - e.g. `/status`
 * @param {RequestInit} [init]
 * @returns {Promise<Response|null>} null if not configured
 */
export async function crawl4aiFetch(path, init = {}) {
	const base = baseUrl();
	if (!base) return null;

	const secret = String(env.CRAWL4AI_SERVICE_SECRET || '').trim();
	const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

	/** @type {Headers} */
	const headers = new Headers(/** @type {any} */ (init.headers || {}));
	if (secret) headers.set('X-Crawl4AI-Secret', secret);

	const timeoutMs = Number(env.CRAWL4AI_FETCH_TIMEOUT_MS || '120000') || 120000;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutMs);

	try {
		return await fetch(url, {
			...init,
			headers,
			signal: ac.signal
		});
	} finally {
		clearTimeout(timer);
	}
}
