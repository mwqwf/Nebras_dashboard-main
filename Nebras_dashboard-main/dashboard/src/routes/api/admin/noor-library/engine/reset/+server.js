/**
 * DELETE /api/admin/noor-library/engine/reset
 *
 * "الزرّ النووي" (Factory Reset) — يمسح كلّ ما أحدثه المحرّك الآلي:
 *   • noor_library_registry  + noor_library_failures + engine/cursor.
 *   • أيّ قسم (main/sub/secondary) يحمل علامة __createdBy='noor_library_engine'.
 *   • أيّ كتاب في dashboard_uploads / content_unified/files يحمل
 *     علامة __provider='noor-library'.
 *
 * ⚠️ عمليّة غير قابلة للتراجع. الواجهة تطلب تأكيد المستخدم قبل الاستدعاء.
 *
 * 🔒 Nebras Only — يتطلّب دور owner أو supervisor.
 */

import { json } from '@sveltejs/kit';
import { factoryReset } from '$lib/server/noorLibrary/engine.js';
import { isAdminConfigured } from '$lib/server/firebaseAdmin.js';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function DELETE(event) {
	const auth = event.locals?.auth;
	if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });
	if (auth.role !== 'owner' && auth.role !== 'supervisor') {
		return json({ error: 'forbidden', reason: 'role_not_allowed' }, { status: 403 });
	}
	if (!isAdminConfigured()) {
		return json(
			{
				error: 'not_configured',
				reason: 'admin_service_account_missing',
				message: 'تأكّد من أنّ NEBRAS_SERVICE_ACCOUNT_PATH معرَّف في .env و الملفّ موجود.'
			},
			{ status: 501 }
		);
	}

	const startedAt = Date.now();
	try {
		const result = await factoryReset();
		return json({ ok: true, elapsedMs: Date.now() - startedAt, ...result });
	} catch (err) {
		return json(
			{
				error: 'reset_failed',
				reason: err?.reason || 'reset_failed',
				message: err?.message || String(err),
				elapsedMs: Date.now() - startedAt
			},
			{ status: err?.status || 500 }
		);
	}
}
