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
 * أنماط تشير صراحةً إلى حقوق طبع محفوظة — نرفضها فوراً حتى لو كان العنصر
 * في مجموعة موثوقة. هذا حارس الامتثال لـ Google Play / DMCA.
 *
 * أي عنصر يحوي licenseurl أو rights يطابق هذه الأنماط = رفض قطعي،
 * يُسجَّل في failures registry كـ blacklist دائم.
 */
const COPYRIGHT_DENY_PATTERNS = Object.freeze([
	/all\s*rights?\s*reserved/i,
	/copyright(ed)?/i,
	/\bcr\b/i, // rights:CR (IA shorthand)
	/proprietary/i,
	/non\s*commercial/i, // CC-BY-NC — Google Play لا يقبل القيود التجاريّة
	/no\s*derivatives/i, // CC-BY-ND
	/-nc-/i, // أي CC variant فيه NC
	/-nd-/i, // أي CC variant فيه ND
	/-nc$/i,
	/-nd$/i
]);

/**
 * يفحص إن كان النصّ يدلّ صراحةً على حقوق طبع محفوظة. حارس Google Play.
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeCopyrighted(text) {
	if (!text) return false;
	const s = String(text).trim();
	if (!s) return false;
	for (const pat of COPYRIGHT_DENY_PATTERNS) {
		if (pat.test(s)) return true;
	}
	return false;
}

/**
 * مجموعات IA معروفة بمحتوى عامّ آمن للنشر (allowlist تشغيلي).
 * مسمّيات IA الفعليّة — تحقّقنا منها بـ Scrape API. القائمة القديمة كانت
 * تحوي مسمّيات وهميّة (community_texts/opensource_arabic) لا تُعيد نتائج.
 */
export const DEFAULT_TRUSTED_COLLECTIONS = Object.freeze([
	'booksbylanguage_arabic',
	'booksbylanguage',
	'folkscanomy_religion',
	'folkscanomy_religion_quran',
	'folkscanomy',
	'audio_islamic',
	'audio_religion',
	'opensource_movies',
	'opensource_audio',
	'opensource'
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
	new Set([
		'license_not_allowed',
		'license_missing',
		'license_missing_and_not_trusted',
		'license_copyrighted_explicit', // ⚠ حارس Google Play — لا يُعاد المحاولة
		'license_rights_copyrighted_explicit'
	])
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

	const licenseUrl = String(item?.licenseurl || '').trim();
	const licenseField = String(item?.license || '').trim();
	const rightsField = String(item?.rights || '').trim();

	// ───────── 🚨 HARD GATE — رفض صريح للمحتوى المحميّ ─────────
	// (Google Play / DMCA compliance — لا نخاطر بأيّ عنصر يحوي إشارة
	//  واضحة لحقوق محفوظة، حتى لو كان أيضاً في مجموعة موثوقة).
	if (looksLikeCopyrighted(licenseUrl) || looksLikeCopyrighted(licenseField)) {
		return {
			ok: false,
			reason: 'license_copyrighted_explicit',
			licenseMatched: licenseUrl || licenseField
		};
	}
	if (looksLikeCopyrighted(rightsField)) {
		return {
			ok: false,
			reason: 'license_rights_copyrighted_explicit',
			licenseMatched: rightsField
		};
	}

	// ───────── ✅ ALLOWED — ترخيص صريح PD/CC ─────────
	const licenseRaw = pickString(licenseUrl, licenseField, rightsField);
	const licenseStr = String(licenseRaw || '').trim();

	if (licenseStr) {
		for (const pat of ALLOWED_LICENSE_PATTERNS) {
			if (pat.test(licenseStr)) {
				return { ok: true, reason: 'license_allowed', licenseMatched: licenseStr };
			}
		}
		return { ok: false, reason: 'license_not_allowed', licenseMatched: licenseStr };
	}

	// ───────── ⚠️ TRUSTED COLLECTION FALLBACK ─────────
	// لا يوجد ترخيص صريح — هل العنصر ضمن مجموعة موثوقة + الوضع المسموح؟
	// نقبله مشروطاً، ونصنّفه `community_collection` (وليس verified PD)
	// حتى نستطيع تمييزه في Firestore + متجر التطبيق لاحقاً.
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
			return {
				ok: true,
				reason: 'trusted_collection_fallback',
				collection: cn,
				// تصنيف license مخفّض — يستعمله adminUploader لوسم الوثيقة
				// في Firestore بـ __license_status: 'community_collection'
				licenseTier: 'community_collection'
			};
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
