/**
 * GET /api/fetcher — معلومات المحرك: المزوّدون المتاحون + الإحصائيات.
 */

import { json } from '@sveltejs/kit';
import { listProviders } from '$lib/fetcher/registry.js';
import { getStats, listJobs } from '$lib/fetcher/store.js';

export async function GET({ url }) {
	const providerId = url.searchParams.get('provider') || undefined;

	return json({
		providers: listProviders(),
		stats: getStats({ providerId }),
		recentJobs: listJobs({ providerId, limit: 10 })
	});
}
