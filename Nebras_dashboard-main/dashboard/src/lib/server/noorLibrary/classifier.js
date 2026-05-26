/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى المسار الثلاثي الصارم:
 * [main → sub → secondary → content].
 *
 * القاعدة: لا نضع الكتاب في أقرب قسم عشوائي. نعيد استعمال قسم موجود فقط
 * عندما يكون متوافقاً مع مجال الكتاب، وإلا نعيد قرار إنشاء القسم الناقص
 * في المستوى الصحيح. هذا يمنع خلط الأدب بالفقه، أو التاريخ بالعقيدة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const DOMAIN_RULES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير وعلوم القرآن',
		keywords: ['قرآن', 'القران', 'مصحف', 'تفسير', 'تفاسير', 'تجويد', 'قراءات', 'علوم القرآن']
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث وعلومه',
		keywords: ['حديث', 'احاديث', 'صحيح', 'سنن', 'مسند', 'رواة', 'رجال الحديث', 'جرح', 'تعديل']
	},
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية عامة',
		keywords: ['فقه', 'فقهي', 'اصول الفقه', 'احكام', 'فتاوى', 'عبادات', 'معاملات', 'صلاة', 'زكاة', 'صوم', 'حج', 'نكاح', 'طلاق', 'مواريث']
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة والتوحيد',
		keywords: ['عقيدة', 'العقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'قدر', 'الرد على', 'فرق', 'مذاهب عقدية']
	},
	{
		key: 'seerah',
		mainName: 'السيرة والتراجم',
		subName: 'السيرة النبوية',
		secondaryName: 'كتب السيرة النبوية',
		keywords: ['سيرة', 'السيره', 'النبوية', 'النبي', 'رسول الله', 'شمائل', 'غزوات', 'هجرة']
	},
	{
		key: 'history',
		mainName: 'التاريخ والحضارة',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'كتب التاريخ الإسلامي',
		keywords: ['تاريخ', 'التاريخ', 'حضارة', 'دولة', 'خلافة', 'فتوح', 'اندلس', 'تراجم', 'طبقات', 'بلدان']
	},
	{
		key: 'adab',
		mainName: 'الأدب واللغة العربية',
		subName: 'الأدب العربي',
		secondaryName: 'نصوص ودراسات أدبية',
		keywords: ['ادب', 'الأدب', 'شعر', 'ديوان', 'رواية', 'قصة', 'بلاغة', 'نقد', 'نثر', 'مقامات']
	},
	{
		key: 'language',
		mainName: 'الأدب واللغة العربية',
		subName: 'اللغة العربية وعلومها',
		secondaryName: 'النحو والصرف والبلاغة',
		keywords: ['لغة عربية', 'نحو', 'صرف', 'اعراب', 'معجم', 'قاموس', 'لسان العرب', 'بلاغة']
	},
	{
		key: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'كتب الأخلاق والآداب',
		keywords: ['تزكية', 'اخلاق', 'الاخلاق', 'آداب', 'اداب', 'رقائق', 'زهد', 'موعظة', 'تربية النفس']
	},
	{
		key: 'education',
		mainName: 'التربية والتعليم',
		subName: 'التعليم وآداب طلب العلم',
		secondaryName: 'آداب طلب العلم',
		keywords: ['تعليم', 'تربية', 'طلب العلم', 'طالب العلم', 'تعلم', 'تعليمات', 'منهج علمي', 'نصائح علمية', 'آداب العلم']
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'كتب الدعوة والإرشاد',
		keywords: ['دعوة', 'دعاة', 'ارشاد', 'خطب', 'محاضرات', 'ثقافة اسلامية', 'وعظ']
	},
	{
		key: 'general',
		mainName: 'المكتبة العامة',
		subName: 'كتب عامة',
		secondaryName: 'موضوعات عامة',
		keywords: ['كتاب', 'كتب', 'مكتبة', 'عام', 'متنوعة']
	}
]);

const GENERIC_SECTION_WORDS = Object.freeze([
	'مكتبه',
	'مكتبة',
	'كتب',
	'اسلاميه',
	'اسلامية',
	'عام',
	'عامه',
	'عامة',
	'متنوع',
	'متنوعه',
	'متنوعة',
	'مواد',
	'محتوي',
	'محتوى'
]);

function normalizeArabic(s) {
	return String(s || '')
		.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '')
		.replace(/\u0640/g, '')
		.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
		.replace(/\u0649/g, '\u064A')
		.replace(/\u0629/g, '\u0647')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function tokensOf(s, minLen = 3) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= minLen));
}

function scorePhraseOrTokens(name, haystack, hayTokens) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	const nameTokens = n.split(' ').filter((t) => t.length >= 3);
	for (const w of nameTokens) {
		if (hayTokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 4;
	return score;
}

function scoreRule(rule, haystack, hayTokens) {
	let score = 0;
	for (const kw of rule.keywords || []) {
		score += scorePhraseOrTokens(kw, haystack, hayTokens);
	}
	return score;
}

function isGenericSectionName(name) {
	const n = normalizeArabic(name);
	if (!n) return false;
	const words = n.split(' ');
	return words.some((w) => GENERIC_SECTION_WORDS.includes(w));
}

function detectDomainForText(text) {
	const haystack = normalizeArabic(text);
	const hayTokens = tokensOf(haystack);
	let best = DOMAIN_RULES[DOMAIN_RULES.length - 1];
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		const score = scoreRule(rule, haystack, hayTokens);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return { rule: best, score: bestScore };
}

function detectDomainForBook(bookMeta) {
	const text = [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...(bookMeta?.categoryHints || [])
	]
		.filter(Boolean)
		.join(' ');
	const detected = detectDomainForText(text);
	return detected.score > 0 ? detected.rule : DOMAIN_RULES.find((r) => r.key === 'general');
}

function detectDomainKeyForSectionName(name) {
	const detected = detectDomainForText(name);
	return detected.score > 0 ? detected.rule.key : null;
}

function isCompatibleSectionName(name, targetRule) {
	if (!targetRule || targetRule.key === 'general') return true;
	const sectionDomain = detectDomainKeyForSectionName(name);
	if (!sectionDomain) return isGenericSectionName(name);
	return sectionDomain === targetRule.key;
}

function scoreNode(node, haystack, hayTokens, targetRule) {
	const name = String(node?.name || '');
	if (!isCompatibleSectionName(name, targetRule)) return Number.NEGATIVE_INFINITY;
	let score = scorePhraseOrTokens(name, haystack, hayTokens);
	if (detectDomainKeyForSectionName(name) === targetRule.key) score += 4;
	if (isGenericSectionName(name)) score += 1;
	return score;
}

function pickBestNode(nodes, haystack, hayTokens, targetRule, minScore) {
	let best = null;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const node of nodes || []) {
		const score = scoreNode(node, haystack, hayTokens, targetRule);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	if (best && bestScore >= minScore) return { node: best, score: bestScore };

	for (const node of nodes || []) {
		if (isCompatibleSectionName(node?.name, targetRule) && isGenericSectionName(node?.name)) {
			return { node, score: 1 };
		}
	}
	return null;
}

function cleanSectionName(name, fallback) {
	const s = String(name || '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return s || fallback;
}

function categoryHintForDomain(bookMeta, rule) {
	const hints = (bookMeta?.categoryHints || [])
		.map((h) => cleanSectionName(h, ''))
		.filter(Boolean);
	for (const hint of hints) {
		if (detectDomainKeyForSectionName(hint) === rule.key) return hint;
	}
	for (const hint of hints) {
		if (isCompatibleSectionName(hint, rule)) return hint;
	}
	return '';
}

function secondaryNameForBook(bookMeta, rule) {
	const hint = categoryHintForDomain(bookMeta, rule);
	if (hint && normalizeArabic(hint) !== normalizeArabic(rule.subName)) return hint;
	return rule.secondaryName;
}

function classifyStrict(sections, bookMeta) {
	const tree = sections.tree || [];
	const targetRule = detectDomainForBook(bookMeta);
	const haystack = normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
	const hayTokens = tokensOf(haystack);
	const newMainName = cleanSectionName(targetRule.mainName, 'المكتبة العامة');
	const newSubName = cleanSectionName(categoryHintForDomain(bookMeta, targetRule) || targetRule.subName, targetRule.subName);
	const newSecondaryName = cleanSectionName(secondaryNameForBook(bookMeta, targetRule), targetRule.secondaryName);

	const mainPick = pickBestNode(tree, haystack, hayTokens, targetRule, 2);
	if (!mainPick) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName,
			newSubName,
			newSecondaryName,
			confidence: 0.38,
			reasoning: `لم يُعثَر على قسم رئيسي مناسب لمجال "${newMainName}" — إنشاء مسار ثلاثي جديد.`,
			method: 'heuristic'
		};
	}

	const main = mainPick.node;
	const subPick = pickBestNode(main.children || [], haystack, hayTokens, targetRule, 2);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName,
			newSecondaryName,
			confidence: Math.min(0.5 + mainPick.score * 0.04, 0.75),
			reasoning: `القسم الرئيسي مناسب "${main.name}" لكن لا يوجد فرع مناسب لمجال "${newSubName}".`,
			method: 'heuristic'
		};
	}

	const sub = subPick.node;
	const secPick = pickBestNode(sub.children || [], haystack, hayTokens, targetRule, 3);
	if (!secPick) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName,
			confidence: Math.min(0.55 + (mainPick.score + subPick.score) * 0.035, 0.82),
			reasoning: `المسار "${main.name} ← ${sub.name}" مناسب، وسينشأ قسم ثانوي "${newSecondaryName}" لإكمال الهيكل الثلاثي.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secPick.node.id),
		confidence: Math.min(0.62 + (mainPick.score + subPick.score + secPick.score) * 0.03, 0.92),
		reasoning: `مطابقة منضبطة: ${main.name} ← ${sub.name} ← ${secPick.node.name}.`,
		method: 'heuristic'
	};
}

/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	if (!sections.tree || sections.tree.length === 0) {
		throw Object.assign(
			new Error('لا توجد أقسام رئيسيّة في قاعدة البيانات — أنشئ قسماً واحداً على الأقل قبل استخدام الجلب الآلي.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const decision = classifyStrict(sections, bookMeta);
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{
						mainId: decision.mainId,
						subId: decision.subId,
						secondaryId: decision.secondaryId
					},
					sections.index
				)
			: { valid: false, reason: decision.kind };

	return {
		suggested: {
			mainId: decision.mainId,
			subId: decision.subId,
			secondaryId: decision.secondaryId,
			newMainName: decision.newMainName,
			newSubName: decision.newSubName,
			newSecondaryName: decision.newSecondaryName,
			confidence: decision.confidence,
			reasoning: decision.reasoning,
			method: decision.method,
			kind: decision.kind
		},
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	if (!sections.tree || sections.tree.length === 0) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}
	return classifyStrict(sections, bookMeta);
}
