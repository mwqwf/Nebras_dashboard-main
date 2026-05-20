/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبية [main → sub → secondary]
 *
 * يعتمد على قواعد موضوعية محلية تمنع خلط المجالات العلمية (فقه/عقيدة/تاريخ/آداب...)
 * ثم يملأ أي مستوى ناقص بقرار إنشاء تنفيذي يطبّقه engine.js.
 */

import { validateHierarchyPath } from './sectionsTree.js';

// ── Arabic normalization ────────────────
function normalizeArabic(s) {
	return String(s || '')
		.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '')
		.replace(/\u0640/g, '')
		.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
		.replace(/\u0649/g, '\u064A')
		.replace(/\u0629/g, '\u0647')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function overlapRatio(a, b) {
	if (!a.size || !b.size) return 0;
	let inter = 0;
	for (const t of a) if (b.has(t)) inter += 1;
	return inter / new Set([...a, ...b]).size;
}

function hasAny(haystack, aliases) {
	for (const alias of aliases || []) {
		const n = normalizeArabic(alias);
		if (n && haystack.includes(n)) return true;
	}
	return false;
}

function firstMatchingChoice(haystack, choices, fallback) {
	for (const choice of choices) {
		if (hasAny(haystack, choice.aliases)) return choice.name;
	}
	return fallback;
}

function buildHaystack(bookMeta) {
	return normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
}

/** يستخرج جذع العنوان بإزالة ترقيم الأجزاء الشائع. */
function seriesStemFromTitle(title) {
	let t = normalizeArabic(title);
	if (!t) return '';
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '');
	return t.replace(/\s+/g, ' ').trim();
}

function cleanSectionName(name, fallback) {
	const raw = String(name || '').trim().replace(/\s+/g, ' ');
	if (!raw) return fallback;
	return raw.slice(0, 70);
}

const SUBJECT_RULES = Object.freeze([
	{
		id: 'education',
		priority: 100,
		mainName: 'التربية والتعليم',
		subName: 'طلب العلم وآدابه',
		secondaryName: 'نصائح وتوجيهات علمية',
		aliases: [
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'آداب طالب العلم',
			'آداب طلب العلم',
			'التعليم',
			'التعلم',
			'المتعلم',
			'التربية والتعليم',
			'الدراسة',
			'منهجية',
			'النصائح العلمية',
			'توجيهات علمية',
			'وصايا للطلاب'
		],
		mainAliases: ['التربية والتعليم', 'التعليم', 'طلب العلم'],
		subAliases: ['طلب العلم', 'آداب طلب العلم', 'آداب طالب العلم', 'منهجية طلب العلم'],
		secondaryAliases: ['نصائح', 'توجيهات', 'وصايا', 'نصائح وتوجيهات علمية', 'آداب طالب العلم']
	},
	{
		id: 'fiqh',
		priority: 90,
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية عامة',
		aliases: [
			'فقه',
			'الفقه',
			'أصول الفقه',
			'اصول الفقه',
			'الشريعة',
			'الأحكام',
			'احكام',
			'فتاوى',
			'طهارة',
			'الصلاة',
			'الزكاة',
			'الصيام',
			'الحج',
			'المعاملات',
			'البيوع',
			'المواريث',
			'الفرائض',
			'النكاح',
			'الطلاق'
		],
		mainAliases: ['الفقه الإسلامي', 'فقه', 'الشريعة'],
		subAliases: ['الفقه وأصوله', 'أصول الفقه', 'فقه العبادات', 'فقه المعاملات'],
		secondaryAliases: ['الصلاة', 'الطهارة', 'الزكاة', 'الصيام', 'الحج', 'المعاملات', 'المواريث', 'أصول الفقه']
	},
	{
		id: 'aqeedah',
		priority: 88,
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة',
		aliases: [
			'عقيدة',
			'العقيدة',
			'توحيد',
			'الايمان',
			'الإيمان',
			'اسماء الله وصفاته',
			'الأسماء والصفات',
			'الفرق',
			'الملل والنحل',
			'السنة والجماعة',
			'أهل السنة'
		],
		mainAliases: ['العقيدة', 'التوحيد', 'الإيمان'],
		subAliases: ['العقيدة والتوحيد', 'التوحيد', 'أصول الاعتقاد', 'الفرق والمذاهب'],
		secondaryAliases: ['كتب العقيدة', 'التوحيد', 'الأسماء والصفات', 'الإيمان', 'الفرق']
	},
	{
		id: 'quran',
		priority: 86,
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		aliases: [
			'قرآن',
			'القرآن',
			'القران',
			'تفسير',
			'التفسير',
			'علوم القرآن',
			'علوم القران',
			'تجويد',
			'قراءات',
			'أسباب النزول',
			'المصحف'
		],
		mainAliases: ['القرآن الكريم', 'القران الكريم', 'القرآن', 'المصحف'],
		subAliases: ['التفسير وعلوم القرآن', 'التفسير', 'علوم القرآن', 'التجويد والقراءات'],
		secondaryAliases: ['التفسير', 'علوم القرآن', 'التجويد', 'القراءات', 'أسباب النزول']
	},
	{
		id: 'hadith',
		priority: 84,
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		secondaryName: 'متون الحديث وشروحه',
		aliases: [
			'حديث',
			'الحديث',
			'السنة',
			'صحيح البخاري',
			'صحيح مسلم',
			'سنن',
			'مسند',
			'مصطلح الحديث',
			'علل الحديث',
			'رجال الحديث',
			'الجرح والتعديل',
			'تخريج'
		],
		mainAliases: ['الحديث الشريف', 'الحديث', 'السنة النبوية'],
		subAliases: ['الحديث وعلومه', 'علوم الحديث', 'مصطلح الحديث', 'كتب السنة'],
		secondaryAliases: ['متون الحديث', 'شروح الحديث', 'مصطلح الحديث', 'رجال الحديث', 'التخريج']
	},
	{
		id: 'seerah',
		priority: 80,
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'السيرة النبوية',
		aliases: ['سيرة', 'السيرة', 'السيرة النبوية', 'الشمائل', 'المغازي', 'دلائل النبوة', 'محمد صلى الله عليه وسلم'],
		mainAliases: ['السيرة النبوية', 'السيرة', 'الشمائل'],
		subAliases: ['السيرة والشمائل', 'السيرة النبوية', 'المغازي', 'الشمائل المحمدية'],
		secondaryAliases: ['السيرة النبوية', 'الشمائل', 'المغازي', 'دلائل النبوة']
	},
	{
		id: 'history',
		priority: 76,
		mainName: 'التاريخ والتراجم',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'تاريخ وسير',
		aliases: [
			'تاريخ',
			'التاريخ',
			'تراجم',
			'سير أعلام',
			'طبقات',
			'البلدان',
			'الأندلس',
			'الخلافة',
			'الدولة الأموية',
			'الدولة العباسية'
		],
		mainAliases: ['التاريخ والتراجم', 'التاريخ الإسلامي', 'التاريخ', 'التراجم'],
		subAliases: ['التاريخ الإسلامي', 'التراجم والسير', 'الطبقات', 'تاريخ البلدان'],
		secondaryAliases: ['تاريخ وسير', 'التراجم', 'الطبقات', 'البلدان', 'تاريخ الدول']
	},
	{
		id: 'tazkiyah_adab',
		priority: 72,
		mainName: 'التزكية والأخلاق',
		subName: 'الآداب والأخلاق',
		secondaryName: 'آداب وأخلاق عامة',
		aliases: [
			'تزكية',
			'الأخلاق',
			'اخلاق',
			'الآداب',
			'اداب',
			'الزهد',
			'رقائق',
			'مواعظ',
			'موعظة',
			'القلوب',
			'السلوك'
		],
		mainAliases: ['التزكية والأخلاق', 'الأخلاق', 'الآداب', 'الزهد والرقائق'],
		subAliases: ['الآداب والأخلاق', 'التزكية', 'الزهد والرقائق', 'المواعظ'],
		secondaryAliases: ['آداب وأخلاق', 'الزهد', 'الرقائق', 'المواعظ', 'تهذيب النفس']
	},
	{
		id: 'arabic',
		priority: 68,
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		secondaryName: 'دراسات لغوية عامة',
		aliases: ['اللغة العربية', 'لغة عربية', 'النحو', 'نحو', 'الصرف', 'صرف', 'بلاغة', 'الأدب العربي', 'الشعر', 'العروض'],
		mainAliases: ['اللغة العربية', 'الأدب واللغة العربية'],
		subAliases: ['علوم اللغة العربية', 'النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondaryAliases: ['النحو', 'الصرف', 'البلاغة', 'الأدب العربي', 'العروض']
	},
	{
		id: 'dawah',
		priority: 58,
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'دروس ومحاضرات',
		aliases: ['دعوة', 'الدعوة', 'إرشاد', 'ارشاد', 'محاضرات', 'دروس', 'خطب', 'الوعظ', 'الثقافة الإسلامية'],
		mainAliases: ['الدعوة والثقافة الإسلامية', 'الدعوة', 'الثقافة الإسلامية'],
		subAliases: ['الدعوة والإرشاد', 'الدروس والمحاضرات', 'الخطب'],
		secondaryAliases: ['دروس ومحاضرات', 'خطب', 'مواد دعوية']
	},
	{
		id: 'general_islamic',
		priority: 10,
		mainName: 'المكتبة الإسلامية',
		subName: 'كتب إسلامية عامة',
		secondaryName: 'موضوعات عامة',
		aliases: ['كتب إسلامية', 'اسلامية', 'إسلامية', 'الدين الإسلامي', 'علوم إسلامية'],
		mainAliases: ['المكتبة الإسلامية', 'كتب إسلامية', 'علوم إسلامية'],
		subAliases: ['كتب إسلامية عامة', 'موضوعات إسلامية', 'كتب متنوعة'],
		secondaryAliases: ['موضوعات عامة', 'كتب متنوعة']
	}
]);

const DYNAMIC_SECONDARIES = Object.freeze({
	education: [
		{ name: 'آداب طالب العلم', aliases: ['آداب طالب العلم', 'آداب طلب العلم', 'اداب طالب العلم'] },
		{ name: 'نصائح وتوجيهات علمية', aliases: ['نصائح', 'توجيهات', 'وصايا', 'النصائح العلمية'] },
		{ name: 'منهجية طلب العلم', aliases: ['منهجية', 'خطة', 'برنامج علمي', 'الدراسة'] }
	],
	fiqh: [
		{ name: 'فقه الطهارة', aliases: ['طهارة', 'الطهارة', 'وضوء', 'غسل'] },
		{ name: 'فقه الصلاة', aliases: ['صلاة', 'الصلاة', 'مساجد', 'أذان'] },
		{ name: 'فقه الزكاة', aliases: ['زكاة', 'الزكاة'] },
		{ name: 'فقه الصيام', aliases: ['صيام', 'الصيام', 'رمضان'] },
		{ name: 'فقه الحج والعمرة', aliases: ['حج', 'الحج', 'عمرة', 'العمرة'] },
		{ name: 'فقه المعاملات', aliases: ['معاملات', 'البيوع', 'ربا', 'تجارة'] },
		{ name: 'فقه الأسرة', aliases: ['نكاح', 'زواج', 'طلاق', 'الأسرة', 'الاسرة'] },
		{ name: 'المواريث والفرائض', aliases: ['مواريث', 'فرائض', 'الميراث'] },
		{ name: 'أصول الفقه', aliases: ['أصول الفقه', 'اصول الفقه', 'القواعد الفقهية'] }
	],
	aqeedah: [
		{ name: 'التوحيد', aliases: ['توحيد', 'التوحيد'] },
		{ name: 'الأسماء والصفات', aliases: ['الأسماء والصفات', 'اسماء الله', 'صفات الله'] },
		{ name: 'الإيمان', aliases: ['إيمان', 'الايمان', 'الإيمان'] },
		{ name: 'الفرق والمذاهب', aliases: ['الفرق', 'المذاهب', 'الملل والنحل'] }
	],
	quran: [
		{ name: 'التفسير', aliases: ['تفسير', 'التفسير'] },
		{ name: 'علوم القرآن', aliases: ['علوم القرآن', 'علوم القران', 'أسباب النزول', 'اسباب النزول'] },
		{ name: 'التجويد والقراءات', aliases: ['تجويد', 'قراءات', 'القراءات'] }
	],
	hadith: [
		{ name: 'مصطلح الحديث', aliases: ['مصطلح الحديث', 'علوم الحديث'] },
		{ name: 'رجال الحديث والجرح والتعديل', aliases: ['رجال الحديث', 'الجرح والتعديل', 'العلل'] },
		{ name: 'متون الحديث وشروحه', aliases: ['صحيح', 'سنن', 'مسند', 'شرح الحديث', 'شروح الحديث'] },
		{ name: 'تخريج الأحاديث', aliases: ['تخريج', 'التخريج'] }
	],
	seerah: [
		{ name: 'السيرة النبوية', aliases: ['السيرة النبوية', 'السيرة'] },
		{ name: 'الشمائل المحمدية', aliases: ['شمائل', 'الشمائل'] },
		{ name: 'المغازي', aliases: ['مغازي', 'المغازي'] }
	],
	history: [
		{ name: 'التراجم والسير', aliases: ['تراجم', 'سير أعلام', 'طبقات'] },
		{ name: 'التاريخ الإسلامي', aliases: ['تاريخ', 'الخلافة', 'الأموي', 'العباسي'] },
		{ name: 'تاريخ البلدان', aliases: ['بلدان', 'الأندلس', 'مصر', 'الشام'] }
	],
	tazkiyah_adab: [
		{ name: 'آداب وأخلاق عامة', aliases: ['آداب', 'اداب', 'الأخلاق', 'اخلاق'] },
		{ name: 'الزهد والرقائق', aliases: ['زهد', 'الزهد', 'رقائق', 'القلوب'] },
		{ name: 'المواعظ', aliases: ['مواعظ', 'موعظة', 'وعظ'] }
	],
	arabic: [
		{ name: 'النحو والصرف', aliases: ['نحو', 'النحو', 'صرف', 'الصرف'] },
		{ name: 'البلاغة', aliases: ['بلاغة', 'البلاغة'] },
		{ name: 'الأدب العربي', aliases: ['الأدب العربي', 'الشعر', 'العروض'] }
	]
});

function scoreTextForAliases(haystack, tokens, aliases, weight = 1) {
	let score = 0;
	for (const alias of aliases || []) {
		const n = normalizeArabic(alias);
		if (!n) continue;
		const aliasTokens = tokensOf(n);
		if (haystack.includes(n)) score += (n.includes(' ') ? 6 : 4) * weight;
		for (const t of aliasTokens) {
			if (tokens.has(t)) score += 2 * weight;
		}
	}
	return score;
}

function scoreSectionName(sectionName, aliases, haystack, hayTokens) {
	const name = normalizeArabic(sectionName);
	if (!name) return 0;
	const nameTokens = tokensOf(name);
	let score = 0;

	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		const aliasTokens = tokensOf(a);
		if (name === a) score += 18;
		else if (a.length >= 3 && (name.includes(a) || a.includes(name))) score += 12;
		const r = overlapRatio(nameTokens, aliasTokens);
		if (r >= 0.5) score += 8;
		else if (r >= 0.25) score += 4;
	}

	if (name.length >= 4 && haystack.includes(name)) score += 5;
	score += overlapRatio(nameTokens, hayTokens) * 6;
	return score;
}

function pickSubjectRule(bookMeta) {
	const haystack = buildHaystack(bookMeta);
	const tokens = tokensOf(haystack);
	const hints = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	let best = null;
	let bestScore = 0;

	for (const rule of SUBJECT_RULES) {
		let score = scoreTextForAliases(haystack, tokens, rule.aliases, 1);
		score += scoreTextForAliases(hints, tokensOf(hints), rule.aliases, 1.8);
		if (score > bestScore || (score === bestScore && rule.priority > (best?.priority || 0))) {
			best = rule;
			bestScore = score;
		}
	}

	if (!best) return null;
	if (best.id === 'general_islamic') return bestScore >= 7 ? best : null;
	return bestScore >= 4 ? best : null;
}

function proposedSecondaryName(rule, bookMeta, haystack) {
	const dynamic = DYNAMIC_SECONDARIES[rule.id] || [];
	return firstMatchingChoice(haystack, dynamic, rule.secondaryName);
}

function targetNamesForRule(rule, bookMeta) {
	const haystack = buildHaystack(bookMeta);
	return {
		mainName: rule.mainName,
		subName: rule.subName,
		secondaryName: proposedSecondaryName(rule, bookMeta, haystack)
	};
}

function findBestPathForRule(sections, rule, bookMeta) {
	const haystack = buildHaystack(bookMeta);
	const hayTokens = tokensOf(haystack);
	const names = targetNamesForRule(rule, bookMeta);
	const mainAliases = [names.mainName, ...(rule.mainAliases || [])];
	const subAliases = [names.subName, ...(rule.subAliases || [])];
	const secondaryAliases = [names.secondaryName, ...(rule.secondaryAliases || [])];

	let bestMain = null;
	let bestMainScore = 0;
	let bestSubPath = null;
	let bestSubScore = 0;
	let bestSecondaryPath = null;
	let bestSecondaryScore = 0;

	for (const main of sections.tree || []) {
		const mainScore = scoreSectionName(main.name, mainAliases, haystack, hayTokens);
		let strongestChildScore = 0;

		for (const sub of main.children || []) {
			const subScore = scoreSectionName(sub.name, subAliases, haystack, hayTokens);
			strongestChildScore = Math.max(strongestChildScore, subScore);
			const subTotal = subScore * 2 + mainScore;
			if (subTotal > bestSubScore) {
				bestSubScore = subTotal;
				bestSubPath = { main, sub, score: subTotal };
			}

			for (const sec of sub.children || []) {
				const secScore = scoreSectionName(sec.name, secondaryAliases, haystack, hayTokens);
				const secTotal = secScore * 2 + subScore + mainScore * 0.5;
				if (secTotal > bestSecondaryScore) {
					bestSecondaryScore = secTotal;
					bestSecondaryPath = { main, sub, secondary: sec, score: secTotal };
				}
			}
		}

		const mainTotal = mainScore + strongestChildScore * 0.6;
		if (mainTotal > bestMainScore) {
			bestMainScore = mainTotal;
			bestMain = main;
		}
	}

	return {
		bestMain,
		bestMainScore,
		bestSubPath,
		bestSubScore,
		bestSecondaryPath,
		bestSecondaryScore,
		names
	};
}

function makeRuleDecision(sections, rule, bookMeta) {
	const path = findBestPathForRule(sections, rule, bookMeta);
	const confidenceBase = Math.min(0.94, 0.55 + Math.max(path.bestSubScore, path.bestMainScore) * 0.015);

	if (path.bestSecondaryPath && path.bestSecondaryScore >= 12) {
		return {
			kind: 'existing',
			mainId: String(path.bestSecondaryPath.main.id),
			subId: String(path.bestSecondaryPath.sub.id),
			secondaryId: String(path.bestSecondaryPath.secondary.id),
			confidence: confidenceBase,
			reasoning: `تصنيف موضوعي (${rule.id}): مسار موجود كامل.`,
			method: 'rules'
		};
	}

	if (path.bestSubPath && path.bestSubScore >= 12) {
		return {
			kind: 'create_secondary',
			mainId: String(path.bestSubPath.main.id),
			subId: String(path.bestSubPath.sub.id),
			secondaryId: null,
			newSecondaryName: path.names.secondaryName,
			confidence: confidenceBase,
			reasoning: `تصنيف موضوعي (${rule.id}): وُجد main/sub مناسب، ويلزم إنشاء قسم ثانوي.`,
			method: 'rules'
		};
	}

	if (path.bestMain && path.bestMainScore >= 7) {
		return {
			kind: 'create_sub',
			mainId: String(path.bestMain.id),
			subId: null,
			secondaryId: null,
			newSubName: path.names.subName,
			newSecondaryName: path.names.secondaryName,
			confidence: Math.min(0.86, 0.45 + path.bestMainScore * 0.02),
			reasoning: `تصنيف موضوعي (${rule.id}): وُجد قسم رئيسي مناسب، ويلزم إنشاء فرعي/ثانوي.`,
			method: 'rules'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: path.names.mainName,
		newSubName: path.names.subName,
		newSecondaryName: path.names.secondaryName,
		confidence: 0.42,
		reasoning: `تصنيف موضوعي (${rule.id}): لا يوجد مسار مناسب، إنشاء شجرة جديدة.`,
		method: 'rules'
	};
}

function fallbackHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const cleaned = cleanSectionName(
			String(hint || '')
				.replace(/^كتب\s+(?:في|عن)\s+/u, '')
				.replace(/^كتاب\s+/u, ''),
			''
		);
		if (cleaned && cleaned.length >= 4 && !/^الرئيسية$/u.test(cleaned)) return cleaned;
	}
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	return cleanSectionName(stem, 'كتب متنوعة');
}

/**
 * Heuristic fallback — يعطي درجة لكل section بمقدار تقاطع كلماته مع metadata.
 * لا يُستخدم إلا إذا تعذر تحديد مجال علمي واضح.
 */
function classifyHeuristic({ tree }, bookMeta) {
	const haystack = buildHaystack(bookMeta);
	const tokens = tokensOf(haystack);

	function scoreOf(name) {
		const n = normalizeArabic(name);
		if (!n) return 0;
		let score = 0;
		for (const w of n.split(' ')) {
			if (w.length >= 3 && tokens.has(w)) score += 1;
		}
		if (haystack.includes(n) && n.length >= 4) score += 3;
		return score;
	}

	let bestMain = null;
	let bestMainScore = 0;
	for (const m of tree || []) {
		const s = scoreOf(m.name);
		if (s > bestMainScore) {
			bestMainScore = s;
			bestMain = m;
		}
	}
	if (!bestMain) return null;

	let bestSub = null;
	let bestSubScore = 0;
	for (const sub of bestMain.children || []) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) {
			bestSubScore = s;
			bestSub = sub;
		}
	}

	let bestSec = null;
	let bestSecScore = 0;
	for (const sec of bestSub?.children || []) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) {
			bestSecScore = s;
			bestSec = sec;
		}
	}

	return {
		main: bestMain,
		sub: bestSub,
		secondary: bestSec,
		scores: { main: bestMainScore, sub: bestSubScore, secondary: bestSecScore }
	};
}

/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل للمعاينة.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = await classifyAutonomous(sections, bookMeta);
	const suggested = {
		mainId: decision.mainId || '',
		subId: decision.subId || '',
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		kind: decision.kind,
		newMainName: decision.newMainName,
		newSubName: decision.newSubName,
		newSecondaryName: decision.newSecondaryName
	};
	const validation = decision.kind === 'existing'
		? validateHierarchyPath(
				{ mainId: decision.mainId, subId: decision.subId, secondaryId: decision.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'requires_section_creation' };

	return {
		suggested,
		alternatives: [],
		validation,
		decision
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const rule = pickSubjectRule(bookMeta);
	if (rule) return makeRuleDecision(sections, rule, bookMeta);

	const hint = fallbackHint(bookMeta);
	const heuristic = classifyHeuristic(sections, bookMeta);
	if (heuristic?.main && heuristic.scores.main > 0) {
		if (heuristic.sub && heuristic.scores.sub > 0) {
			if (heuristic.secondary && heuristic.scores.secondary > 0) {
				return {
					kind: 'existing',
					mainId: String(heuristic.main.id),
					subId: String(heuristic.sub.id),
					secondaryId: String(heuristic.secondary.id),
					confidence: 0.45,
					reasoning: 'heuristic مطابقة محليّة كاملة عند غياب قاعدة موضوعية.',
					method: 'heuristic'
				};
			}
			return {
				kind: 'create_secondary',
				mainId: String(heuristic.main.id),
				subId: String(heuristic.sub.id),
				secondaryId: null,
				newSecondaryName: hint,
				confidence: 0.35,
				reasoning: 'heuristic وجد main/sub فقط — إنشاء secondary لتثبيت الهيكل الثلاثي.',
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_sub',
			mainId: String(heuristic.main.id),
			subId: null,
			secondaryId: null,
			newSubName: hint,
			newSecondaryName: 'كتب عامة',
			confidence: 0.3,
			reasoning: 'heuristic وجد main فقط — إنشاء sub/secondary لتجنّب الخلط.',
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: 'المكتبة الإسلامية',
		newSubName: hint || 'كتب متنوعة',
		newSecondaryName: 'موضوعات عامة',
		confidence: 0.25,
		reasoning: 'لم يظهر مسار مناسب في الشجرة — إنشاء مسار عام مستقل بدلاً من الخلط.',
		method: 'heuristic'
	};
}
