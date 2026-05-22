/**
 * معجم عوامل الخطر لتدقيق المحتوى — يُصنّف المحتوى المشتبه بناءً على
 * إشارات حقيقيّة (أسماء/كلمات) لا على مجرّد كونه رفعاً يدويّاً.
 *
 * كلّ فئة تحوي أنماطاً (نصّ يُطابَق بعد التطبيع) لاكتشاف:
 *   • terrorism : إصدارات/تنظيمات متطرّفة معروفة.
 *   • copyright : علامات تجاريّة/منصّات تدلّ على محتوًى محميّ بحقوق.
 *   • sexual    : محتوًى جنسيّ صريح.
 *
 * ملاحظة مهمّة لتقليل الإيجابيات الكاذبة:
 *   - لا نُدرج كلمات قرآنيّة بريئة مفردة (مثل «النبأ» سورة قرآنيّة) — بل
 *     نشترط سياقاً صريحاً («صحيفة النبأ» / «مجلة النبأ») لإصدار داعش.
 *   - المطابقة على حدود تقريبيّة لتفادي مطابقة جزء من كلمة أطول.
 */

/** تطبيع عربيّ/لاتينيّ خفيف للمطابقة: توحيد الألف/الهاء/الياء وإزالة التشكيل. */
export function normalizeForMatch(input) {
	return String(input || '')
		.toLowerCase()
		.replace(/[ً-ٰٟ]/g, '') // التشكيل
		.replace(/[إأآا]/g, 'ا')
		.replace(/ى/g, 'ي')
		.replace(/ة/g, 'ه')
		.replace(/ـ/g, '') // التطويل
		.replace(/[^\p{L}\p{N}\s]/gu, ' ') // رموز → مسافات
		.replace(/\s+/g, ' ')
		.trim();
}

/** أنماط كلّ فئة (مطبّعة مسبقاً عند الإمكان). */
const LEXICON = {
	terrorism: [
		// إصدارات داعش/القاعدة (سياق صريح لتجنّب سورة «النبأ»):
		'صحيفه النبا',
		'مجله النبا',
		'نشره النبا',
		'دابق',
		'روميه',
		'al naba',
		'al-naba',
		'dabiq',
		'rumiyah',
		'inspire magazine',
		// تنظيمات:
		'داعش',
		'الدوله الاسلاميه',
		'دوله الخلافه',
		'تنظيم القاعده',
		'القاعده في',
		'جبهه النصره',
		'بوكو حرام',
		'isis',
		'isil',
		'islamic state',
		'al qaeda',
		'al-qaeda',
		'boko haram',
		'taliban propaganda'
	],
	copyright: [
		// منصّات/علامات تجاريّة تدلّ على محتوًى محميّ:
		'youtube',
		'يوتيوب',
		'netflix',
		'نتفليكس',
		'disney',
		'ديزني',
		'shahid',
		'شاهد نت',
		'bein',
		'بي ان سبورت',
		'osn',
		'mbc',
		'amazon prime',
		'hbo',
		// إشارات صريحة لحقوق:
		'جميع الحقوق محفوظه',
		'حقوق الطبع',
		'حقوق النشر محفوظه',
		'all rights reserved',
		'copyright ',
		'(c) '
	],
	sexual: [
		'اباحي',
		'اباحيه',
		'جنس صريح',
		'سكس',
		'porn',
		'porno',
		'xxx',
		'nude',
		'nudes',
		'explicit sex'
	]
};

/**
 * يفحص نصّاً ويعيد المطابقات حسب الفئة.
 * @param {string} text
 * @returns {{ category: string, terms: string[] }[]}
 */
export function scanRisk(text) {
	const hay = normalizeForMatch(text);
	if (!hay) return [];
	const out = [];
	for (const [category, patterns] of Object.entries(LEXICON)) {
		const hits = [];
		for (const p of patterns) {
			const needle = normalizeForMatch(p);
			if (needle && hay.includes(needle)) hits.push(p.trim());
		}
		if (hits.length) out.push({ category, terms: hits });
	}
	return out;
}
