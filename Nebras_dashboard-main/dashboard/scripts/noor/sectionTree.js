/**
 * Canonical Noor import tree.
 *
 * The importer must keep every book under the full hierarchy:
 * main section > sub section > secondary section > content.
 */

export const DEFAULT_SECTION_STATE = Object.freeze({
	order_index: 0,
	is_listed: true,
	thumbnail: null
});

export const SECTION_TREE = Object.freeze([
	{
		name: 'التربية والتعليم',
		children: [
			{
				name: 'التعليم والتدريس',
				children: [
					{
						name: 'إرشادات ومهارات تعليمية',
						keywords: [
							'نصائح تعليمية',
							'نصائح للمعلمين',
							'تعليمات علمية',
							'التدريس',
							'المعلم',
							'المعلمين',
							'التربية'
						]
					},
					{
						name: 'إدارة الصف والتعلم',
						keywords: ['إدارة الصف', 'ضبط الفصل', 'التحصيل', 'التعلم']
					}
				]
			},
			{
				name: 'التعليم العالي والبحث',
				children: [
					{
						name: 'الدراسات العليا',
						keywords: ['الدراسات العليا', 'الماجستير', 'الدكتوراه']
					}
				]
			}
		]
	},
	{
		name: 'علوم ومعارف',
		children: [
			{
				name: 'البحث العلمي',
				children: [
					{
						name: 'منهجية البحث والكتابة العلمية',
						keywords: ['البحث العلمي', 'الكتابة العلمية', 'إعداد البحث', 'مناهج البحث']
					}
				]
			}
		]
	},
	{
		name: 'العلوم الشرعية',
		children: [
			{
				name: 'العقيدة',
				children: [{ name: 'مسائل العقيدة', keywords: ['العقيدة', 'التوحيد', 'الإيمان'] }]
			},
			{
				name: 'الفقه',
				children: [{ name: 'فقه عام', keywords: ['الفقه', 'الأحكام', 'فتاوى'] }]
			},
			{
				name: 'الآداب والرقائق',
				children: [{ name: 'الآداب الإسلامية', keywords: ['الآداب', 'الأخلاق', 'الرقائق'] }]
			}
		]
	},
	{
		name: 'التاريخ والسير',
		children: [
			{
				name: 'التاريخ الإسلامي',
				children: [{ name: 'تراجم وسير', keywords: ['التاريخ', 'السيرة', 'التراجم'] }]
			}
		]
	}
]);

/**
 * Known bad spellings or unusable bucket names. These are never matched and
 * should be skipped if they are encountered in external data.
 */
export const IGNORED_SECTION_NAMES = Object.freeze([
	'دروس بتدكصهك',
	'غير مصنف',
	'عام',
	'اخري',
	'أخرى',
	'متفرقات',
	'اسلاميات عامه',
	'التاريح',
	'العقيده',
	'الفقهخ'
]);

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g;

export function normalizeArabic(input) {
	return String(input || '')
		.replace(ARABIC_DIACRITICS, '')
		.replace(/\u0640/g, '')
		.replace(/[\u0622\u0623\u0625\u0671]/g, 'ا')
		.replace(/\u0649/g, 'ي')
		.replace(/\u0629/g, 'ه')
		.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

const ignoredNormalized = new Set(IGNORED_SECTION_NAMES.map(normalizeArabic));

export function isIgnoredSectionName(name) {
	const normalized = normalizeArabic(name);
	return !normalized || ignoredNormalized.has(normalized);
}

export function assertValidPath(path) {
	const parts = [path?.main, path?.sub, path?.secondary].map((x) => String(x || '').trim());
	if (parts.some((x) => !x)) {
		throw new Error('Classification must include main, sub, and secondary sections.');
	}
	for (const part of parts) {
		if (isIgnoredSectionName(part)) {
			throw new Error(`Ignored or misspelled section name cannot be used: ${part}`);
		}
	}
	return { main: parts[0], sub: parts[1], secondary: parts[2] };
}

function scoreText(text, keywords = []) {
	const normalizedText = normalizeArabic(text);
	let score = 0;
	for (const keyword of keywords) {
		if (normalizedText.includes(normalizeArabic(keyword))) score += 1;
	}
	return score;
}

export function classifyBook(title, description = '') {
	const text = `${title || ''} ${description || ''}`;
	let best = null;

	for (const main of SECTION_TREE) {
		if (isIgnoredSectionName(main.name)) continue;
		for (const sub of main.children || []) {
			if (isIgnoredSectionName(sub.name)) continue;
			for (const secondary of sub.children || []) {
				if (isIgnoredSectionName(secondary.name)) continue;
				const score = scoreText(text, secondary.keywords || []);
				if (!best || score > best.score) {
					best = {
						score,
						path: { main: main.name, sub: sub.name, secondary: secondary.name }
					};
				}
			}
		}
	}

	if (best && best.score > 0) return assertValidPath(best.path);

	// Conservative fallback for instructional/scientific advice titles.
	const normalized = normalizeArabic(text);
	if (
		normalized.includes('نصائح') &&
		(normalized.includes('تعليم') || normalized.includes('علمي') || normalized.includes('معلم'))
	) {
		return assertValidPath({
			main: 'التربية والتعليم',
			sub: 'التعليم والتدريس',
			secondary: 'إرشادات ومهارات تعليمية'
		});
	}

	return assertValidPath({
		main: 'علوم ومعارف',
		sub: 'البحث العلمي',
		secondary: 'منهجية البحث والكتابة العلمية'
	});
}
