/**
 * GET /api/fetcher/history?type=success|error&provider=...&jobId=...&limit=50&offset=0
 */

import { json } from '@sveltejs/kit';
import { getSuccessLogs, getErrorLogs } from '$lib/fetcher/store.js';

export async function GET({ url }) {
	const type = url.searchParams.get('type') || 'success';
	const providerId = url.searchParams.get('provider') || undefined;
	const jobId = url.searchParams.get('jobId')
		? Number(url.searchParams.get('jobId'))
		: undefined;
	const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
	const offset = Number(url.searchParams.get('offset')) || 0;

	if (type === 'error') {
		return json(getErrorLogs({ providerId, jobId, limit, offset }));
	}

	return json(getSuccessLogs({ providerId, jobId, limit, offset }));
}
