/**
 * GET /api/fetcher/categories?provider=noor-library
 * يعيد تصنيفات المصدر الخارجي المتاحة للجلب.
 */

import { json } from '@sveltejs/kit';
import { getProvider } from '$lib/fetcher/registry.js';

export async function GET({ url }) {
	const providerId = url.searchParams.get('provider');
	if (!providerId) {
		return json({ error: 'provider is required' }, { status: 400 });
	}

	const provider = getProvider(providerId);
	if (!provider) {
		return json({ error: `Unknown provider: ${providerId}` }, { status: 404 });
	}

	try {
		const categories = await provider.fetchCategories();
		return json({ categories });
	} catch (err) {
		return json(
			{ error: 'Failed to fetch categories', detail: err?.message },
			{ status: 500 }
		);
	}
}
