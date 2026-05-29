/**
 * GET /api/cron/noor-library-tick
 *
 * نقطة دخول Cron لمحرّك مكتبة نور — مطابقة لنمط internet-archive-tick.
 * يُستدعى من GitHub Action دورياً (App Hosting/Vercel لا يُبقي الحلقة حيّة).
 *
 *   1) يتحقّق من Bearer $CRON_SECRET (أو يسمح إن لم يُضبط — تشغيل بلا إعداد).
 *   2) ينفّذ runCronTick() الذي يحترم إيقاف المستخدم الصريح.
 *
 * المحرّك يجلب فقط الكتب الحرّة الترخيص (بوابة licenseFilter) عبر crawl4ai.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { runCronTick } from '$lib/server/noorLibrary/engine.js';

export const config = {
	maxDuration: 60
};

function authorizeCron(event) {
	const secret = String(env.CRON_SECRET || '').trim();
	// 🔒 fail-closed: بلا CRON_SECRET نرفض (يمنع تشغيل المحرّك من الخارج).
	if (!secret) return { ok: false, reason: 'cron_secret_required' };
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
		const r = await runCronTick();
		return json(r, { status: r.ok === false ? 500 : 200 });
	} catch (err) {
		console.error('[cron/noor-library-tick]', err);
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
