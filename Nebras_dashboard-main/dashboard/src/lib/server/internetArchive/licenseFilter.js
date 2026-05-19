/**
 * licenseFilter.js — فلتر التراخيص لمحرّك Internet Archive.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  لماذا يهمّ هذا الملف:                                            ║
 * ║  Internet Archive يستضيف محتوى بتراخيص متعدّدة. حين ننشر تطبيقاً  ║
 * ║  على Google Play لا يحقّ لنا تضمين محتوى محميّ بحقوق طبع. هذا     ║
 * ║  الفلتر يقبل فقط ما هو **آمن قانونياً للنشر**:                     ║
 * ║   • Public Domain (PD)                                            ║
 * ║   • Creative Commons (CC0, CC-BY, CC-BY-SA)                       ║
 * ║   • مجموعات إسلامية معروفة المصدر (allowlist يدوي)                ║
 * ║                                                                  ║
 * ║  أيّ شيء آخر — بما فيه CC-BY-NC، All Rights Reserved، أو غياب     ║
 * ║  ترخيص واضح — مرفوض افتراضياً.                                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

/**
 * أكواد ترخيص Creative Commons / Public Domain التي نقبلها افتراضياً.
 * نُطابقها على licenseurl وlicense النصّي بعد تطبيع.
 */
const ALLOWED_LICENSE_PATTERNS = Object.freeze([
	/publicdomain/i,
	/public-domain/i,
	/^pd$/i,
	/creativecommons\.org\/publicdomain/i,
	/cc0/i,
	/cc-by(?!-nc)(?!-nd)/i, // CC-BY و CC-BY-SA — نمنع NC و ND
	/creativecommons\.org\/licenses\/by\/[0-9.]+/i,
	/creativecommons\.org\/licenses\/by-sa\/[0-9.]+/i
]);

/**
 * مجموعات IA معروفة بمحتوى عامّ آمن للنشر (allowlist تشغيلي). يُستعمل
 * كاحتياط حين تفقد العناصر حقل license. غير مفعّل إلا إن صرّح المسؤول.
 */
export const DEFAULT_TRUSTED_COLLECTIONS = Object.freeze([
	'opensource_arabic',
	'community_texts',
	'arabicliterature',
	'arabicliteratureandlinguistics',
	'islamicbooks_archive',
	'islamic-books',
	'shamela'
]);

/**
 * يفحص ترخيص عنصر IA. يقبل إن وُجد license/licenseurl يطابق الأنماط
 * المسموحة. إن غاب الترخيص، يقبل **فقط** إذا كان العنصر ضمن مجموعة
 * موثوقة (trustedCollections) ومُفعَّل وضع التساهل بالمجموعات.
 *
 * @param {Object} item metadata الخام من IA Metadata API (.metadata)
 * @param {{
 *   trustedCollections?: string[],
 *   allowMissingLicenseInTrustedCollections?: boolean
 * }} [opts]
 * @returns {{ ok: boolean, reason: string, licenseMatched?: string, collection?: string }}
 */
/** أسباب فشل لا تُعاد محاولتها (blacklist فوري). */
export const PERMANENT_FAILURE_REASONS = Object.freeze(
	new Set(['license_not_allowed', 'license_missing', 'license_missing_and_not_trusted'])
);

/**
 * فحص سريع على صفّ نتيجة scrape (يحتوي licenseurl/rights/collection).
 * @param {Record<string, unknown>} scrapeRow
 * @param {Parameters<typeof evaluateLicense>[1]} [opts]
 */
export function isLicenseAllowedScrapeItem(scrapeRow, opts = {}) {
	return evaluateLicense(scrapeRow, opts).ok;
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {Parameters<typeof evaluateLicense>[1]} [opts]
 */
export function filterScrapeItemsByLicense(items, opts = {}) {
	return (items || []).filter((row) => isLicenseAllowedScrapeItem(row, opts));
}

export function evaluateLicense(item, opts = {}) {
	const trusted = new Set(
		(opts.trustedCollections && opts.trustedCollections.length
			? opts.trustedCollections
			: DEFAULT_TRUSTED_COLLECTIONS
		).map((s) => String(s).toLowerCase())
	);
	const allowMissingInTrusted = Boolean(opts.allowMissingLicenseInTrustedCollections);

	const licenseRaw = pickString(item?.licenseurl, item?.license, item?.['rights']);
	const licenseStr = String(licenseRaw || '').trim();

	if (licenseStr) {
		for (const pat of ALLOWED_LICENSE_PATTERNS) {
			if (pat.test(licenseStr)) {
				return { ok: true, reason: 'license_allowed', licenseMatched: licenseStr };
			}
		}
		return { ok: false, reason: 'license_not_allowed', licenseMatched: licenseStr };
	}

	// لا يوجد ترخيص صريح — هل العنصر ضمن مجموعة موثوقة + الوضع المسموح؟
	if (!allowMissingInTrusted) {
		return { ok: false, reason: 'license_missing' };
	}
	const collections = Array.isArray(item?.collection)
		? item.collection
		: item?.collection
			? [item.collection]
			: [];
	for (const c of collections) {
		const cn = String(c || '').toLowerCase();
		if (trusted.has(cn)) {
			return { ok: true, reason: 'trusted_collection_fallback', collection: cn };
		}
	}
	return { ok: false, reason: 'license_missing_and_not_trusted' };
}

function pickString(...values) {
	for (const v of values) {
		if (v == null) continue;
		if (Array.isArray(v) && v.length > 0) return String(v[0] || '');
		const s = String(v || '').trim();
		if (s) return s;
	}
	return '';
}
