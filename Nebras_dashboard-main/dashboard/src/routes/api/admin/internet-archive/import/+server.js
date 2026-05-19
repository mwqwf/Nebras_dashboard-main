/**
 * POST /api/admin/internet-archive/import
 *
 * استيراد يدويّ لعنصر IA واحد إلى مكان محدّد في شجرة الأقسام. يمرّ بكلّ
 * البوّابات: ترخيص → صيغة قابلة للتشغيل → تنزيل + magic bytes → رفع +
 * كتابة مرآة مزدوجة + تسجيل في registry + إشعار FCM.
 *
 * Body:
 *   {
 *     identifier: string,
 *     hierarchy: { mainId, subId, secondaryId?: string|null },
 *     trustedCollections?: string[],
 *     allowMissingLicenseInTrustedCollections?: boolean
 *   }
 */

import { json } from '@sveltejs/kit';
import { importItem } from '$lib/server/internetArchive/engine.js';
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
		return json({ error: 'bad_request', reason: 'invalid_json' }, { status: 400 });
	}

	const identifier = String(body?.identifier || '').trim();
	const mainId = String(body?.hierarchy?.mainId || '').trim();
	const subId = String(body?.hierarchy?.subId || '').trim();
	const secondaryId = body?.hierarchy?.secondaryId
		? String(body.hierarchy.secondaryId).trim()
		: null;

	if (!identifier) {
		return json({ error: 'bad_request', reason: 'identifier_required' }, { status: 400 });
	}
	if (!mainId || !subId) {
		return json(
			{ error: 'bad_request', reason: 'hierarchy_required' },
			{ status: 400 }
		);
	}

	// نُكوّن seed-مؤقّت لاستيراد فوريّ (لا يُحفظ في cfg.seeds).
	const seed = {
		id: `manual_${identifier}`,
		label: `يدوي: ${identifier}`,
		hierarchy: { mainId, subId, secondaryId }
	};
	const cfg = {
		trustedCollections: Array.isArray(body?.trustedCollections) ? body.trustedCollections : [],
		allowMissingLicenseInTrustedCollections: Boolean(
			body?.allowMissingLicenseInTrustedCollections
		)
	};

	try {
		const result = await importItem(identifier, seed, cfg);
		return json({ ok: true, result });
	} catch (err) {
		return json(
			{
				error: 'import_failed',
				reason: err?.reason || 'unknown',
				message: err?.message || String(err)
			},
			{ status: err?.status || 500 }
		);
	}
}
