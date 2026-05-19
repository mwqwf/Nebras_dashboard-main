/**
 * GET /api/cron/internet-archive-tick
 *
 * Vercel Cron entrypoint للمحرّك الآلي. السلوك:
 *   1) يتحقّق من Bearer $CRON_SECRET.
 *   2) يستدعي autoBootIfNeeded() — يضمن أنّ DEFAULT_CONFIG مكتوب في RTDB.
 *   3) ينفّذ runEngineTick() مباشرة — لا يتوقّف عند enabled=false إلا إن
 *      كان المستخدم أوقفه يدوياً عبر stopEngine (الذي يضع enabled=false).
 *      وإن غاب enabled كاملاً، autoBoot يضعه true ⇒ Cron يستمرّ.
 *
 * هذا يضمن: حتى بدون أيّ طلب admin، Vercel Cron وحده كافٍ لإطعام التطبيق.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAdminDatabase, isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { autoBootIfNeeded, runEngineTick } from '$lib/server/internetArchive/engine.js';

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
		// إقلاع آلي (يكتب DEFAULT_CONFIG إن لم يوجد config أصلاً).
		await autoBootIfNeeded();

		// قراءة enabled — لو المستخدم أوقفه صراحةً نحترم القرار.
		const enabledSnap = await getAdminDatabase()
			.ref('ia_library_engine/config/enabled')
			.get();
		const enabled = enabledSnap.exists() ? enabledSnap.val() !== false : true;
		if (!enabled) {
			return json({ ok: true, skipped: true, reason: 'engine_disabled_by_user' });
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
