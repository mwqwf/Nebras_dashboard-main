/**
 * GET /api/cron/internet-archive-tick
 *
 * Vercel Cron entrypoint للمحرّك. يعمل **فقط** إن:
 *   1) صحّ سرّ CRON_SECRET
 *   2) `ia_library_engine/config/enabled === true` (وإلا يخرج بدون عمل)
 *
 * يقرأ enabled من DB قبل runEngineTick() لأنّ runEngineTick نفسه لا يفحص
 * enabled (يفترض أنّ المستدعي تحقّق منه). على Vercel serverless الدورة
 * تموت بعد كلّ tick؛ Cron يستدعي هذا المسار كلّ X دقيقة.
 *
 * لا يمرّ عبر hooks.server.js لأنّ المسار تحت /api/cron/* وليس /api/admin/*.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAdminDatabase, isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { runEngineTick } from '$lib/server/internetArchive/engine.js';

function authorizeCron(event) {
	const secret = String(env.CRON_SECRET || '').trim();
	if (!secret) return { ok: false, reason: 'cron_secret_not_configured' };
	const header =
		event.request.headers.get('authorization') ||
		event.request.headers.get('Authorization') ||
		'';
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	const token = m ? m[1].trim() : '';
	if (!token || token !== secret) return { ok: false, reason: 'invalid_cron_secret' };
	return { ok: true };
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET(event) {
	const auth = authorizeCron(event);
	if (!auth.ok) {
		return json({ error: 'unauthorized', reason: auth.reason }, { status: 401 });
	}
	if (!isAdminConfigured()) {
		return json({ error: 'not_configured' }, { status: 501 });
	}

	try {
		const cfgSnap = await getAdminDatabase().ref('ia_library_engine/config/enabled').get();
		const enabled = Boolean(cfgSnap.exists() && cfgSnap.val() === true);
		if (!enabled) {
			return json({ ok: true, skipped: true, reason: 'engine_disabled' });
		}
		const r = await runEngineTick();
		return json({ ok: true, cron: true, ...r });
	} catch (err) {
		console.error('[cron/internet-archive-tick]', err);
		return json(
			{
				error: 'tick_failed',
				reason: err?.reason || 'unknown',
				message: err?.message || String(err)
			},
			{ status: err?.status || 500 }
		);
	}
}
