/**
 * crawler.js — استكشاف روابط كتب هنداوي من صفحات الفهرسة.
 *
 * صفحات الفهرسة: https://www.hindawi.org/books/{page}/   (page = 1..~215)
 * كلّ صفحة تحوي روابط كتب: /books/{bookId}/   (bookId رقم كبير ≥ 4 خانات)
 *
 * نميّز رابط الكتاب عن رابط الترقيم: معرّفات الكتب أرقام كبيرة (آلاف فأكثر)
 * بينما أرقام صفحات الفهرسة صغيرة (1..~215). فنقبل فقط ما طوله ≥ 4 خانات.
 *
 * هنداوي قد تحجب طلبات الخوادم (403) → نجلب عبر crawl4ai (متصفّح حقيقي)
 * ثمّ fetch عاديّ احتياطاً.
 */

import { crawl4aiFetchHtml } from '$lib/server/crawl4aiClient.js';

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/124.0 Safari/537.36 NebrasDashboard/1.0';

const LISTING_BASE = 'https://www.hindawi.org/books';
/** أقصى عدد صفحات فهرسة قبل اللفّ من جديد (هنداوي ~215، نأخذ هامشاً). */
export const MAX_LISTING_PAGES = 260;

function makeError(message, reason, status = 0, cause = null) {
	const err = /** @type {any} */ (new Error(message));
	err.reason = reason;
	err.status = status;
	if (cause) err.cause = cause;
	return err;
}

export function buildListingUrl(page) {
	const n = Math.max(1, Math.floor(Number(page) || 1));
	return `${LISTING_BASE}/${n}/`;
}

async function fetchHtml(url) {
	try {
		const viaCrawl4ai = await crawl4aiFetchHtml(url, { timeoutMs: 45000 });
		if (viaCrawl4ai && viaCrawl4ai.html.length >= 200) {
			return { html: viaCrawl4ai.html, finalUrl: viaCrawl4ai.finalUrl };
		}
	} catch {
		// fallback
	}
	let res;
	try {
		res = await fetch(url, {
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'ar,en;q=0.7'
			},
			redirect: 'follow'
		});
	} catch (err) {
		throw makeError('تعذّر الاتصال بمؤسسة هنداوي.', 'crawler_network_error', 0, err);
	}
	if (!res.ok) {
		throw makeError(`هنداوي أرجعت ${res.status} لـ ${url}`, 'crawler_upstream_error', res.status);
	}
	return { html: await res.text(), finalUrl: res.url || url };
}

/**
 * يستخرج روابط الكتب من HTML صفحة الفهرسة.
 * @param {string} html
 * @returns {Array<{ bookId:string, url:string }>}
 */
export function extractBookLinks(html) {
	const out = new Map();
	const re = /href=["'](?:https?:\/\/(?:www\.)?hindawi\.org)?\/books\/(\d{4,})\/?["']/gi;
	let m;
	while ((m = re.exec(html))) {
		const bookId = m[1];
		if (!out.has(bookId)) {
			out.set(bookId, `https://www.hindawi.org/books/${bookId}/`);
		}
	}
	return Array.from(out.entries()).map(([bookId, url]) => ({ bookId, url }));
}

/**
 * يجلب صفحات فهرسة متتالية حتّى يجمع batchSize كتاباً **جديداً** أو يستهلك
 * maxPagesPerCall. مطابق لواجهة discoverNewBooks في محرّك نور.
 *
 * @param {{ startPage:number, batchSize:number, maxPagesPerCall:number, knownIds:Set<string> }} args
 * @returns {Promise<{ newBooks:Array<{bookId:string,url:string}>, pagesScanned:number, nextPage:number|null, exhausted:boolean }>}
 */
export async function discoverNewBooks({
	startPage = 1,
	batchSize = 5,
	maxPagesPerCall = 4,
	knownIds = new Set()
}) {
	const collected = new Map();
	let page = Math.max(1, startPage);
	let pagesScanned = 0;
	let nextPage = null;
	let exhausted = false;

	while (pagesScanned < maxPagesPerCall && collected.size < batchSize) {
		if (page > MAX_LISTING_PAGES) {
			exhausted = true;
			break;
		}
		let result;
		try {
			result = await fetchHtml(buildListingUrl(page));
		} catch {
			pagesScanned++;
			page++;
			continue;
		}
		pagesScanned++;
		const links = extractBookLinks(result.html);

		// صفحة بلا روابط كتب = نهاية الفهرس → لفّ من جديد.
		if (links.length === 0) {
			exhausted = true;
			break;
		}

		for (const link of links) {
			if (knownIds.has(link.bookId)) continue;
			if (collected.has(link.bookId)) continue;
			collected.set(link.bookId, link);
			if (collected.size >= batchSize) break;
		}
		nextPage = page + 1;
		page += 1;
	}

	return {
		newBooks: Array.from(collected.values()),
		pagesScanned,
		nextPage: exhausted ? null : nextPage || page,
		exhausted
	};
}
