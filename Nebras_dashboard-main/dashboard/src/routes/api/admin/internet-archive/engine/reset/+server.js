/**
 * POST /api/admin/internet-archive/engine/reset
 *
 * type=cursor → إعادة المؤشّر فقط
 * type=factory → حذف كلّ ما رُفع بعلامة __provider === 'internet_archive'
 */
import { json } from '@sveltejs/kit';
import { resetCursor, factoryReset } from '$lib/server/internetArchive/engine.js';
import { requireAdminRole, requireAdminSdk } from '$lib/server/adminApiAuth.js';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	const gate = requireAdminRole(event);
	if (!gate.ok) return gate.response;
	const sdk = requireAdminSdk();
	if (!sdk.ok) return sdk.response;

	let body;
	try {
		body = await event.request.json();
	} catch {
		body = {};
	}
	const type = String(body?.type || 'cursor').toLowerCase();
	try {
		if (type === 'factory') {
			const r = await factoryReset();
			return json({ ok: true, type, ...r });
		}
		const c = await resetCursor();
		return json({ ok: true, type, cursor: c });
	} catch (err) {
		return json({ error: 'reset_failed', message: err?.message || String(err) }, { status: 500 });
	}
}
