/**
 * GET /api/admin/libraries/diagnose?source=noor|hindawi
 *
 * تشخيص حيّ لسبب عدم عمل محرّكَي مكتبة نور / مؤسسة هنداوي:
 *   1) هل crawl4ai مضبوطة وتستجيب (/health)؟
 *   2) هل تجلب HTML لصفحة فهرسة فعليّة (وليس تحدّي Cloudflare)؟
 *   3) هل تُستخرج روابط كتب من تلك الصفحة؟
 *
 * يُرجع verdict واضحاً + الخطوة التالية المقترَحة. للمالك/المشرف فقط.
 */
import { json } from '@sveltejs/kit';
import { isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { crawl4aiHealth, crawl4aiFetchHtml, crawl4aiConfigured } from '$lib/server/crawl4aiClient.js';
import { extractBookLinks as noorExtract, DEFAULT_SEED_URLS } from '$lib/server/noorLibrary/crawler.js';
import { extractBookLinks as hindawiExtract, buildListingUrl } from '$lib/server/hindawi/crawler.js';

function looksLikeCloudflare(html) {
	const s = String(html || '').toLowerCase();
	return (
		s.includes('just a moment') ||
		s.includes('challenge-platform') ||
		s.includes('cf-mitigated') ||
		s.includes('attention required')
	);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET(event) {
	const auth = event.locals?.auth;
	if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });
	if (auth.role !== 'owner' && auth.role !== 'supervisor') {
		return json({ error: 'forbidden', reason: 'role_not_allowed' }, { status: 403 });
	}
	if (!isAdminConfigured()) return json({ error: 'not_configured' }, { status: 501 });

	const source = String(event.url.searchParams.get('source') || 'noor').toLowerCase();
	const sampleUrl =
		source === 'hindawi' ? buildListingUrl(1) : DEFAULT_SEED_URLS[0];

	const steps = [];
	let verdict = '';
	let nextStep = '';

	// 1) صحّة crawl4ai
	const health = await crawl4aiHealth();
	steps.push({ step: 'crawl4ai_health', ...health });

	if (!health.configured) {
		verdict = '⛔ crawl4ai غير مضبوطة — لهذا لا يجلب المحرّك شيئاً.';
		nextStep = 'انشر crawl4ai عبر deploy-all.ps1 ثمّ اضبط CRAWL4AI_SERVICE_URL و CRAWL4AI_SERVICE_SECRET في Vercel وأعد النشر.';
		return json({ ok: true, source, sampleUrl, steps, verdict, nextStep });
	}
	if (!health.reachable) {
		verdict = '⛔ crawl4ai مضبوطة لكنّها لا تستجيب (الرابط/السرّ خطأ أو الخدمة متوقّفة).';
		nextStep = 'تأكّد أنّ خدمة Cloud Run تعمل وأنّ CRAWL4AI_SERVICE_URL/SECRET مطابقان لها.';
		return json({ ok: true, source, sampleUrl, steps, verdict, nextStep });
	}

	// 2) جلب صفحة فهرسة فعليّة عبر crawl4ai
	let html = '';
	let fetchOk = false;
	let fetchDetail = '';
	try {
		const r = await crawl4aiFetchHtml(sampleUrl, { timeoutMs: 60000 });
		if (r && r.html) {
			html = r.html;
			fetchOk = true;
			fetchDetail = `طول HTML = ${html.length}`;
		} else {
			fetchDetail = 'لا HTML من crawl4ai.';
		}
	} catch (e) {
		fetchDetail = e?.message || String(e);
	}
	const cf = looksLikeCloudflare(html);
	steps.push({ step: 'fetch_listing', url: sampleUrl, ok: fetchOk, cloudflareChallenge: cf, detail: fetchDetail });

	if (!fetchOk) {
		verdict = '⛔ crawl4ai تعمل لكنّها لم تُرجع HTML للصفحة (مهلة/خطأ متصفّح).';
		nextStep = 'راجع سجلّ خدمة Cloud Run (الذاكرة/المهلة). جرّب رفع memory إلى 4Gi.';
		return json({ ok: true, source, sampleUrl, steps, verdict, nextStep });
	}
	if (cf) {
		verdict = '⚠ Cloudflare يحجب الصفحة حتى عبر المتصفّح (شائع مع IP مراكز البيانات).';
		nextStep = source === 'noor'
			? 'نور خلف Cloudflare صارم؛ قد لا تنجح من IP السحابة. هنداوي بديل موثوق (CDN مفتوح).'
			: 'غير متوقّع لهنداوي — أعد المحاولة، وإن تكرّر بلّغني.';
		return json({ ok: true, source, sampleUrl, steps, verdict, nextStep });
	}

	// 3) استخراج روابط الكتب
	const links = source === 'hindawi' ? hindawiExtract(html) : noorExtract(html, sampleUrl);
	steps.push({ step: 'extract_book_links', count: links.length, sample: links.slice(0, 3) });

	if (links.length === 0) {
		verdict = '⚠ جُلِبت الصفحة لكن لم تُستخرج روابط كتب (تغيّر بنية الموقع؟).';
		nextStep = 'بلّغني — أحدّث أنماط الاستخراج (regex) في crawler الخاص بهذا المصدر.';
	} else {
		verdict = `✅ كل شيء سليم: crawl4ai تعمل، والصفحة تُجلب، واستُخرج ${links.length} رابط كتاب. اضغط «دورة الآن» لبدء الجلب.`;
		nextStep = 'شغّل «دورة الآن» وراقب السجلّ. الـ cron سيواصل تلقائياً.';
	}

	return json({ ok: true, source, sampleUrl, steps, verdict, nextStep });
}
