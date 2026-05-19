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
import { isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { autoBootIfNeeded } from '$lib/server/internetArchive/engine.js';

function authorizeCron(event) {
	const secret = String(env.CRON_SECRET || '').trim();
	// إذا لم يقم المستخدم بإعداد CRON_SECRET، نسمح بالوصول لكي يعمل المحرّك تلقائياً 
	// عبر GitHub Actions بدون أيّ إعداد يدوي من المستخدم.
	if (!secret) return { ok: true, reason: 'cron_secret_not_configured_but_allowed' };
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
		// المحرّك يعمل دائماً في الخلفية — لا يعتمد على لوحة تحكّم أو أزرار.
		const r = await autoBootIfNeeded({ runInlineTick: true, forceTick: true });
		if (!r.booted) {
			return json({ ok: true, skipped: true, reason: r.reason });
		}
		if (r.tickError) {
			return json(
				{
					ok: false,
					cron: true,
					error: 'tick_failed',
					...r.tickError,
					...(r.inlineTickResult || {})
				},
				{ status: 500 }
			);
		}
		return json({
			ok: true,
			cron: true,
			skippedInlineTick: Boolean(r.skippedInlineTick),
			...(r.inlineTickResult || {})
		});
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
