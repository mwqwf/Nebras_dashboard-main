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
import { autoBootIfNeeded, runEngineTick } from '$lib/server/internetArchive/engine.js';

/** Vercel Pro: حتى 300s؛ Hobby: 10s — نطلب 60 حيث يُسمح. */
export const config = {
	maxDuration: 60
};

// تسريع: ننفّذ عدّة دورات في نداء cron واحد ضمن ميزانية زمنيّة آمنة بدل
// دورة واحدة. يضاعف الإنتاجيّة دون تجاوز مهلة Vercel ودون لمس المجلوب سابقاً
// (الـ registry يمنع التكرار + تحقّق magic bytes يمنع التلف).
const CRON_TIME_BUDGET_MS = 45_000;
// رُفِع للسرعة القصوى: السقف الزمنيّ (45s) هو الحدّ الفعليّ؛ رفع عدد الدورات
// يسمح باستغلال الميزانية كاملةً حين تكون الدورات سريعة.
const CRON_MAX_TICKS = 12;

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
		// 1) نضمن وجود الإعدادات (enabled/seeds) بلا دورة inline.
		//    إن كان booted=false فالمستخدم أوقف المحرّك صراحةً → نحترم القرار.
		const boot = await autoBootIfNeeded({ runInlineTick: false });
		if (!boot.booted) {
			return json({ ok: true, skipped: true, reason: boot.reason || 'engine_disabled' });
		}

		// 2) حلقة دورات ضمن الميزانية الزمنيّة — تسريع آمن.
		const startedAt = Date.now();
		let ticks = 0;
		let processed = 0;
		let skipped = 0;
		let failed = 0;
		let lastError = null;
		const samples = [];
		while (ticks < CRON_MAX_TICKS && Date.now() - startedAt < CRON_TIME_BUDGET_MS) {
			try {
				const t = await runEngineTick();
				ticks += 1;
				processed += Number(t?.processed || 0);
				skipped += Number(t?.skipped || 0);
				failed += Number(t?.failed || 0);
				if (Array.isArray(t?.failureSamples) && samples.length < 6) {
					samples.push(...t.failureSamples.slice(0, 6 - samples.length));
				}
			} catch (e) {
				lastError = e?.message || String(e);
				break; // خطأ دورة → نتوقّف بهدوء (الـ cron التالي يعيد).
			}
		}
		return json({
			ok: true,
			cron: true,
			ticks,
			processed,
			skipped,
			failed,
			elapsedMs: Date.now() - startedAt,
			lastError,
			failureSamples: samples
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
