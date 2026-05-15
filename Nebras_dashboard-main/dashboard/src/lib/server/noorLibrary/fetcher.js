/**
 * fetcher.js — جلب بيانات كتاب من مكتبة نور (noor-book.com).
 *
 * مكتبة نور لا تنشر API رسميّاً. هذه الوحدة تستخرج البيانات من صفحة
 * الكتاب عبر heuristics على HTML (Open Graph + JSON-LD + meta tags +
 * أنماط شائعة في القالب). كلّ heuristic معزول داخل دالة مستقلّة لكي
 * يسهل تعديله إن تغيّر القالب مستقبلاً.
 *
 * الواجهة العامّة:
 *   - parseNoorUrl(url) → { canonicalUrl, bookId } | null
 *   - fetchBookMetadata(url) → { title, author, description, thumbnail,
 *                                 categoryHints[], fileUrl, fileType,
 *                                 source: { url, bookId, fetchedAt } }
 *   - downloadBookFile(fileUrl) → { buffer, contentType, filename, size }
 *
 * يرمي خطأ بالشكل: Error مع .status (HTTP) و .reason (تصنيف داخلي).
 */

import {
	isPuppeteerEnabled,
	fetchHtmlViaBrowser,
	downloadBufferViaBrowser,
	findBookFileUrlViaBrowser
} from './noorBrowser.js';

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/124.0 Safari/537.36 NebrasDashboard/1.0';

const HOST_ALIASES = ['noor-book.com', 'www.noor-book.com'];

function looksLikeCloudflareChallenge(html) {
	if (!html || html.length < 200) return true;
	const lower = html.toLowerCase();
	return (
		lower.includes('just a moment') ||
		lower.includes('checking your browser') ||
		lower.includes('cf-browser-verification') ||
		lower.includes('challenge-platform') ||
		lower.includes('cf-mitigated') ||
		lower.includes('attention required! | cloudflare')
	);
}

/**
 * يحلّل رابط مكتبة نور. يدعم:
 *   - https://www.noor-book.com/book/review/{slug}
 *   - https://www.noor-book.com/كتاب-{slug}
 *   - https://www.noor-book.com/en/book/{slug}
 *
 * @param {string} input
 * @returns {{ canonicalUrl: string, bookId: string } | null}
 */
export function parseNoorUrl(input) {
	const raw = String(input || '').trim();
	if (!raw) return null;
	let u;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	if (!HOST_ALIASES.includes(u.hostname.toLowerCase())) return null;

	// نرمز الـ pathname إلى bookId مستقرّ (slug آخر مقطع غير فارغ).
	const segs = u.pathname.split('/').filter(Boolean);
	const bookId = decodeURIComponent(segs[segs.length - 1] || '');
	if (!bookId) return null;

	// نوحّد الـ canonical على المسار الإنجليزيّ القياسيّ إن وُجد.
	const canonicalUrl = `https://www.noor-book.com${u.pathname}${u.search}`;
	return { canonicalUrl, bookId };
}

function makeError(message, reason, status = 0, cause = null) {
	const err = /** @type {any} */ (new Error(message));
	err.reason = reason;
	err.status = status;
	if (cause) err.cause = cause;
	return err;
}

/**
 * يجلب HTML بـ Puppeteer إن كان متاحاً (لاجتياز Cloudflare)، وإلا fetch.
 * في كلتا الحالتيْن يفشل بوضوح لو وُجد تحدّي Cloudflare في الـ HTML.
 */
async function fetchHtml(url) {
	const usePuppeteer = await isPuppeteerEnabled().catch(() => false);

	if (usePuppeteer) {
		try {
			const r = await fetchHtmlViaBrowser(url, { waitForCloudflare: true });
			if (!looksLikeCloudflareChallenge(r.html) && r.html.length >= 200) {
				return { html: r.html, finalUrl: r.finalUrl };
			}
			throw makeError(
				'Cloudflare لم يُجتَز حتى مع Puppeteer (تحدّي مستمرّ).',
				'cloudflare_challenge_persistent',
				403
			);
		} catch (err) {
			if (err?.reason === 'cloudflare_challenge_persistent') throw err;
			// نسقط لـ fetch العاديّ كمحاولة أخيرة.
		}
	}

	let res;
	try {
		res = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'ar,en;q=0.7',
				'Cache-Control': 'no-cache'
			},
			redirect: 'follow'
		});
	} catch (err) {
		throw makeError('تعذّر الوصول إلى مكتبة نور — تحقّق من الإنترنت.', 'network_error', 0, err);
	}
	if (!res.ok) {
		throw makeError(
			`مكتبة نور أرجعت حالة ${res.status} للرابط: ${url}` +
				(res.status === 403 || res.status === 503
					? ' — يبدو أنّ Cloudflare يعترض. فعّل Puppeteer (NOOR_USE_PUPPETEER=true).'
					: ''),
			'upstream_error',
			res.status
		);
	}
	const html = await res.text();
	if (!html || html.length < 200) {
		throw makeError('استجابة فارغة أو مقطوعة من مكتبة نور.', 'empty_response', res.status);
	}
	if (looksLikeCloudflareChallenge(html)) {
		throw makeError(
			'الرّد عبارة عن تحدّي Cloudflare. يلزم Puppeteer (NOOR_USE_PUPPETEER=true).',
			'cloudflare_challenge_detected',
			403
		);
	}
	return { html, finalUrl: res.url || url };
}

// ── Heuristic extractors (HTML-only, regex-based) ────────────────

function decodeHtmlEntities(s) {
	return String(s || '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractMeta(html, property) {
	const re = new RegExp(
		`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
		'i'
	);
	const m = html.match(re);
	if (m) return decodeHtmlEntities(m[1]).trim();
	const reAlt = new RegExp(
		`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
		'i'
	);
	const m2 = html.match(reAlt);
	return m2 ? decodeHtmlEntities(m2[1]).trim() : '';
}

function extractTitle(html) {
	const og = extractMeta(html, 'og:title');
	if (og) return og;
	const tw = extractMeta(html, 'twitter:title');
	if (tw) return tw;
	const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (m) {
		// مكتبة نور غالباً تضيف "| مكتبة نور" — نحذفها.
		return decodeHtmlEntities(m[1]).replace(/\s*\|\s*مكتبة نور.*$/u, '').trim();
	}
	return '';
}

function extractDescription(html) {
	return (
		extractMeta(html, 'og:description') ||
		extractMeta(html, 'twitter:description') ||
		extractMeta(html, 'description') ||
		''
	);
}

function extractThumbnail(html) {
	return (
		extractMeta(html, 'og:image') ||
		extractMeta(html, 'twitter:image') ||
		extractMeta(html, 'image') ||
		''
	);
}

function extractAuthor(html) {
	const meta =
		extractMeta(html, 'book:author') ||
		extractMeta(html, 'author') ||
		extractMeta(html, 'article:author');
	if (meta) return meta;

	// JSON-LD: ابحث عن "author":{"name":"..."}
	const ld = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
	if (ld) {
		try {
			const data = JSON.parse(ld[1].trim());
			const items = Array.isArray(data) ? data : [data];
			for (const it of items) {
				const a = it?.author;
				if (typeof a === 'string') return a;
				if (Array.isArray(a) && a[0]?.name) return String(a[0].name);
				if (a?.name) return String(a.name);
			}
		} catch {
			// تجاهل JSON المعطوب — سنحاول heuristics أخرى.
		}
	}

	// نمط شائع في صفحات نور: "تأليف: <اسم>" أو "المؤلف: <اسم>".
	const m = html.match(/(?:تأليف|المؤلف|الكاتب)\s*[:\-]\s*<[^>]+>\s*([^<]+?)\s*</);
	return m ? decodeHtmlEntities(m[1]).trim() : '';
}

function extractCategoryHints(html) {
	const hints = [];
	// Open Graph: book:tag (قد يتكرّر) + meta keywords + breadcrumbs.
	const tagRe = /<meta[^>]*property=["']book:tag["'][^>]*content=["']([^"']+)["']/gi;
	let m;
	while ((m = tagRe.exec(html))) {
		hints.push(decodeHtmlEntities(m[1]).trim());
	}
	const kw = extractMeta(html, 'keywords');
	if (kw) {
		for (const part of kw.split(/[,،]/)) {
			const t = part.trim();
			if (t) hints.push(t);
		}
	}
	// breadcrumb anchors داخل <ol class="breadcrumb"> أو <nav>.
	const bcMatch = html.match(/<(?:ol|ul)[^>]*breadcrumb[^>]*>([\s\S]*?)<\/(?:ol|ul)>/i);
	if (bcMatch) {
		const itemRe = />([^<>]{2,80})</g;
		let im;
		while ((im = itemRe.exec(bcMatch[1]))) {
			const t = decodeHtmlEntities(im[1]).trim();
			if (t && !/^(الرئيسية|home|كتب)$/i.test(t)) hints.push(t);
		}
	}
	return [...new Set(hints.filter(Boolean))].slice(0, 12);
}

function guessContentType(url) {
	const lower = String(url || '').toLowerCase().split('?')[0];
	if (lower.endsWith('.pdf')) return 'application/pdf';
	if (lower.endsWith('.epub')) return 'application/epub+zip';
	if (lower.endsWith('.mp3')) return 'audio/mpeg';
	if (lower.endsWith('.m4a')) return 'audio/mp4';
	if (lower.endsWith('.wav')) return 'audio/wav';
	if (lower.endsWith('.mp4')) return 'video/mp4';
	if (lower.endsWith('.docx'))
		return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
	if (lower.endsWith('.doc')) return 'application/msword';
	return 'application/octet-stream';
}

/**
 * يستخرج رابط تنزيل الكتاب من HTML. مكتبة نور تستعمل أنماطاً كثيرة
 * متغيّرة، فنحاول كلّ ما هو معروف:
 *   1) أيّ href ينتهي بامتداد ملفّ معروف (.pdf/.epub/...).
 *   2) iframe إلى PDF أو امتداد معروف.
 *   3) أيّ href لـ /download/ أو /file/ أو /files/ أو /book/download.
 *   4) أيّ href يحوي تسمية "تحميل-كتاب" بالعربيّة.
 *   5) data-* attributes (data-download / data-file / data-url / data-href).
 *   6) <a> يحتوي نصّاً "تحميل" / "حمل" / "Download" → نأخذ href.
 *   7) <embed> أو <object> بـ src يشير إلى PDF.
 *   8) JSON-LD: contentUrl أو url لكتاب.
 *
 * @returns {{ url: string, type: string } | null}
 */
function extractFileUrl(html, baseUrl) {
	const candidates = [];

	// 1) أيّ href ينتهي بامتداد ملفّ
	const directRe = /href=["']([^"']+\.(?:pdf|epub|mp3|mp4|m4a|wav|docx?))(?:\?[^"']*)?["']/gi;
	let m;
	while ((m = directRe.exec(html))) candidates.push(m[1]);

	// 2) iframes containing obvious file extensions
	const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
	while ((m = iframeRe.exec(html))) {
		const src = m[1];
		if (
			/\.(?:pdf|epub|mp3|mp4|m4a)(?:\?|$)/i.test(src)
		) {
			candidates.push(src);
		}
	}

	// 3) hrefs تحت أنماط تنزيل نور المعروفة:
	//    /download/, /file/, /files/, /book/download/, /book-pdf/, /bk-pdf/,
	//    /dl/, /get/, /reader/   (آخر اثنين قد تكون صفحات وسيطة لكنّها مفيدة).
	const dlPathRe =
		/href=["']([^"']*\/(?:download|file|files|book\/download|book-pdf|bk-pdf|dl|get|reader)\/[^"']+)["']/gi;
	while ((m = dlPathRe.exec(html))) candidates.push(m[1]);

	// 3b) أزرار "<a class="...download...">" أو "btn-download" حتّى بدون نصّ.
	const dlClassRe =
		/<a[^>]+class=["'][^"']*(?:btn-download|downloadbutton|download-btn|btn-dl|dl-btn|btnDownload)[^"']*["'][^>]+href=["']([^"']+)["']/gi;
	while ((m = dlClassRe.exec(html))) candidates.push(m[1]);
	// نفس الفكرة بترتيب معكوس (href قبل class)
	const dlClassRe2 =
		/<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*(?:btn-download|downloadbutton|download-btn|btn-dl|dl-btn|btnDownload)[^"']*["']/gi;
	while ((m = dlClassRe2.exec(html))) candidates.push(m[1]);

	// 4) hrefs بصيغة عربية "تحميل-كتاب"
	const arabicDlRe =
		/href=["']([^"']*(?:تحميل-كتاب|%D8%AA%D8%AD%D9%85%D9%8A%D9%84-%D9%83%D8%AA%D8%A7%D8%A8)[^"']*)["']/gi;
	while ((m = arabicDlRe.exec(html))) candidates.push(m[1]);

	// 5) data-* attributes
	const dataAttrRe =
		/data-(?:download|file|url|href|src|pdf)=["']([^"']+)["']/gi;
	while ((m = dataAttrRe.exec(html))) candidates.push(m[1]);

	// 6) <a> يحوي نصّ "تحميل" / "حمل" / "Download" — نأخذ الـ href منها
	const dlByTextRe =
		/<a[^>]+href=["']([^"']+)["'][^>]*>[^<]*(?:تحميل|تحميل الكتاب|حمل|تنزيل|download|Download)[^<]*<\/a>/gi;
	while ((m = dlByTextRe.exec(html))) candidates.push(m[1]);

	// 7) <embed> / <object> بـ src أو data
	const embedRe = /<(?:embed|object)[^>]+(?:src|data)=["']([^"']+)["']/gi;
	while ((m = embedRe.exec(html))) {
		if (/\.(?:pdf|epub)(?:\?|$)/i.test(m[1])) candidates.push(m[1]);
	}

	// 8) JSON-LD contentUrl/url
	const ldRe =
		/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	while ((m = ldRe.exec(html))) {
		try {
			const data = JSON.parse(m[1].trim());
			const items = Array.isArray(data) ? data : [data];
			for (const it of items) {
				if (typeof it?.contentUrl === 'string') candidates.push(it.contentUrl);
				if (typeof it?.url === 'string' && /\.(?:pdf|epub|mp3)/i.test(it.url)) {
					candidates.push(it.url);
				}
			}
		} catch {
			// تجاهل JSON المعطوب
		}
	}

	// نظِّف التكرار + حوِّل لروابط مطلقة + رتِّب: روابط ذات امتداد معروف أوّلاً.
	const seen = new Set();
	const absCandidates = [];
	for (const c of candidates) {
		try {
			const abs = new URL(c, baseUrl).toString();
			if (seen.has(abs)) continue;
			seen.add(abs);
			absCandidates.push(abs);
		} catch {
			// تجاهل الـ URLs غير الصالحة
		}
	}

	// رتِّب: روابط ملفّات مباشرة (لها امتداد) قبل صفحات التنزيل
	const hasFileExt = (u) => /\.(?:pdf|epub|mp3|mp4|m4a|wav|docx?)(?:\?|$)/i.test(u);
	absCandidates.sort((a, b) => {
		const aExt = hasFileExt(a) ? 1 : 0;
		const bExt = hasFileExt(b) ? 1 : 0;
		return bExt - aExt;
	});

	if (absCandidates.length === 0) return null;
	return { url: absCandidates[0], type: guessContentType(absCandidates[0]) };
}

/**
 * الواجهة الرئيسيّة — تجلب metadata كاملة لكتاب معيّن.
 * @param {string} pageUrl  رابط صفحة الكتاب على noor-book.com.
 */
export async function fetchBookMetadata(pageUrl) {
	const parsed = parseNoorUrl(pageUrl);
	if (!parsed) {
		throw makeError(
			'الرابط لا ينتمي إلى noor-book.com. الرجاء لصق رابط كتاب صحيح.',
			'invalid_url',
			400
		);
	}

	const { html, finalUrl } = await fetchHtml(parsed.canonicalUrl);

	const title = extractTitle(html);
	const description = extractDescription(html);
	const author = extractAuthor(html);
	const thumbnail = extractThumbnail(html);
	const categoryHints = extractCategoryHints(html);
	let file = extractFileUrl(html, finalUrl);

	// خطّة بديلة: لو لم نجد رابط الملفّ في HTML الخام، نستعمل Puppeteer
	// لتشغيل JS داخل الصفحة وقراءة الـ DOM المُعالَج (الزرّ الفعليّ، iframe…).
	// هذه أهمّ خطوة لأنّ noor-book.com يبني زرّ التنزيل ديناميكيّاً.
	if (!file) {
		const usePuppeteer = await isPuppeteerEnabled().catch(() => false);
		if (usePuppeteer) {
			try {
				const found = await findBookFileUrlViaBrowser(finalUrl, {
					timeoutMs: 35000,
					clickDownload: true
				});
				if (found?.url) {
					file = { url: found.url, type: guessContentType(found.url) };
				}
			} catch (err) {
				// لا نُسقط العمليّة كاملةً — نسمح بـ no_file_url لاحقاً ليُسجَّل
				// في سجلّ الفشل بدلاً من إيقاف الجلب.
				console.warn(
					'[noorLibrary] findBookFileUrlViaBrowser failed for',
					finalUrl,
					'-',
					/** @type {Error} */ (err)?.message
				);
			}
		}
	}

	if (!title) {
		throw makeError(
			'تعذّر استخراج عنوان الكتاب من الصفحة — قد يكون القالب تغيّر أو الرابط لصفحة غير كتاب.',
			'no_title',
			422
		);
	}

	return {
		title,
		description,
		author,
		thumbnail,
		categoryHints,
		fileUrl: file?.url || '',
		fileType: file?.type || '',
		source: {
			url: parsed.canonicalUrl,
			finalUrl,
			bookId: parsed.bookId,
			provider: 'noor-book.com',
			fetchedAt: new Date().toISOString()
		}
	};
}

/**
 * تنزيل ملفّ الكتاب (PDF/Audio/...) كـ Buffer لتمريره إلى Firebase Storage Admin.
 *
 * @param {string} fileUrl
 * @returns {Promise<{ buffer: Buffer, contentType: string, filename: string, size: number }>}
 */
export async function downloadBookFile(fileUrl, opts = {}) {
	if (!fileUrl) throw makeError('لا يوجد رابط ملف للتنزيل.', 'no_file_url', 400);

	const refererUrl = opts?.refererUrl || null;
	const usePuppeteer = await isPuppeteerEnabled().catch(() => false);
	let lastPuppeteerErr = null;

	// 🌐 المسار الأساسي: تنزيل عبر Puppeteer (in-page fetch) — هذا الوحيد
	// الذي يعمل مع noor-book.com لأنّه محميّ بـ Cloudflare ويتطلّب جلسة
	// متصفّح حقيقيّة + كوكيز cf_clearance + Referer صحيح.
	if (usePuppeteer) {
		try {
			const r = await downloadBufferViaBrowser(fileUrl, {
				timeoutMs: 90000,
				refererUrl
			});
			if (r.buffer && r.buffer.byteLength > 0) {
				return {
					buffer: r.buffer,
					contentType: r.contentType,
					filename: r.filename,
					size: r.buffer.byteLength
				};
			}
		} catch (err) {
			lastPuppeteerErr = err;
			// لا نسقط لـ fetch إلا إن لم يكن المضيف cloudflare-protected. تحت
			// نُلاحظ أنّ noor-book.com يعطي 403 على fetch دائماً، فلا فائدة منها.
		}
	}

	// 🪂 آخر محاولة: fetch HTTP عاديّ — يعمل فقط لروابط مباشرة بلا Cloudflare
	// لـ noor-book.com لا يعمل
	// أبداً، لذا إن كان المضيف نور، نكتفي برمي خطأ Puppeteer الأصلي.
	let host = '';
	try {
		host = new URL(fileUrl).host.toLowerCase();
	} catch {
		host = '';
	}
	const isNoorHost = /(?:^|\.)noor-book\.com$/.test(host);

	if (isNoorHost) {
		throw makeError(
			lastPuppeteerErr?.message ||
				'تعذّر تنزيل الملفّ من noor-book.com — Cloudflare يحجب fetch العاديّ.',
			'download_failed_cf',
			lastPuppeteerErr?.status || 403,
			lastPuppeteerErr
		);
	}

	let res;
	try {
		res = await fetch(fileUrl, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: '*/*',
				...(refererUrl ? { Referer: refererUrl } : {})
			},
			redirect: 'follow'
		});
	} catch (err) {
		throw makeError(
			'تعذّر تنزيل ملفّ الكتاب — قد يكون الخادم البعيد محظوراً أو الرابط منتهي.',
			'download_failed',
			0,
			err
		);
	}
	if (!res.ok) {
		throw makeError(
			`فشل تنزيل الملفّ — حالة HTTP ${res.status}.`,
			'download_failed',
			res.status
		);
	}

	const arrayBuf = await res.arrayBuffer();
	const buffer = Buffer.from(arrayBuf);
	const contentType = res.headers.get('content-type') || 'application/octet-stream';

	// استنتاج اسم الملف من Content-Disposition أو من الـ URL.
	let filename = '';
	const cd = res.headers.get('content-disposition') || '';
	const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^;"']+)/i);
	if (cdMatch) {
		try {
			filename = decodeURIComponent(cdMatch[1]);
		} catch {
			filename = cdMatch[1];
		}
	}
	if (!filename) {
		try {
			const u = new URL(fileUrl);
			filename = decodeURIComponent(u.pathname.split('/').pop() || 'book.pdf');
		} catch {
			filename = 'book.pdf';
		}
	}

	return { buffer, contentType, filename, size: buffer.byteLength };
}
