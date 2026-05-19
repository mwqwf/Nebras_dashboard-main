/**
 * classifier.js — تصنيف كتب مكتبة نور إلى المسار الذهبي:
 * main → sub → secondary → content.
 *
 * لا يكتب هذا الملف في Firestore. هو يقرر فقط هل نستعمل قسماً قائماً أو
 * نطلب من engine.js إنشاء main/sub/secondary مناسب قبل رفع الكتاب.
 */

import { validateHierarchyPath } from './sectionsTree.js';

// ── Arabic normalization ─────────────────────────────────────────────
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

function cleanName(name, fallback = '') {
	return String(name || fallback)
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 90);
}

function tokensOf(value, minLen = 3) {
	return new Set(
		normalizeArabic(value)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function includesPhrase(haystack, phrase) {
	const n = normalizeArabic(phrase);
	return n.length >= 3 && haystack.includes(n);
}

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

const DOMAIN_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'المفسر', 'مصحف', 'تجويد', 'قراءات', 'علوم القرآن']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث',
		keywords: ['حديث', 'الأحاديث', 'صحيح', 'سنن', 'مسند', 'مصنف', 'رواة', 'إسناد', 'مصطلح الحديث']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'كتب الفقه العامة',
		keywords: [
			'فقه',
			'أصول الفقه',
			'فتاوى',
			'عبادات',
			'معاملات',
			'طهارة',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'نكاح',
			'بيوع',
			'فرائض'
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'العقيدة والتوحيد',
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'الإيمان', 'صفات الله', 'أسماء الله', 'القدر', 'السنة والجماعة']
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'السيرة النبوية',
		keywords: ['سيرة', 'السيرة', 'المغازي', 'شمائل', 'النبي', 'رسول الله', 'صحابة']
	},
	{
		id: 'history',
		mainName: 'التاريخ الإسلامي',
		subName: 'التاريخ والتراجم',
		secondaryName: 'التاريخ الإسلامي',
		keywords: ['تاريخ', 'التاريخ', 'تراجم', 'طبقات', 'وفيات', 'بلدان', 'فتوح', 'خلفاء', 'دول']
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب الشرعية',
		secondaryName: 'الأخلاق والآداب',
		keywords: ['تزكية', 'أخلاق', 'الأخلاق', 'آداب', 'الآداب', 'رقائق', 'زهد', 'موعظة', 'تربية']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو واللغة',
		keywords: ['لغة عربية', 'النحو', 'صرف', 'بلاغة', 'معجم', 'إعراب', 'أدب عربي', 'شعر', 'عروض']
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'الدعوة والإرشاد',
		keywords: ['دعوة', 'الدعوة', 'إرشاد', 'ثقافة إسلامية', 'خطب', 'محاضرات', 'منهجية طلب العلم']
	}
]);

const GENERIC_MAIN_HINTS = ['كتب اسلاميه', 'اسلاميات', 'الشريعه', 'علوم شرعيه', 'المكتبه', 'كتب متنوعه'];
const GENERIC_SUB_HINTS = ['متفرقات', 'كتب متنوعه', 'عام', 'مكتبه', 'مواد متنوعه'];

function buildContext(bookMeta) {
	const fields = [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...(bookMeta?.categoryHints || [])
	].filter(Boolean);
	const haystack = normalizeArabic(fields.join(' '));
	const categoryHaystack = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	return {
		haystack,
		categoryHaystack,
		tokens: tokensOf(haystack),
		titleStem: cleanName(seriesStemFromTitle(bookMeta?.title || ''), bookMeta?.title || '')
	};
}

function scoreKeywordList(keywords, haystack, categoryHaystack) {
	let score = 0;
	for (const kw of keywords) {
		if (includesPhrase(categoryHaystack, kw)) score += 7;
		if (includesPhrase(haystack, kw)) score += 3;
	}
	return score;
}

function pickDomain(ctx) {
	let best = DOMAIN_RULES[DOMAIN_RULES.length - 1];
	let bestScore = -1;
	for (const domain of DOMAIN_RULES) {
		let score = scoreKeywordList(domain.keywords, ctx.haystack, ctx.categoryHaystack);
		// تعزيزات تمنع الخلط الشائع: التاريخ لا يذهب للعقيدة، والآداب لا تذهب للفقه.
		if (domain.id === 'history' && includesPhrase(ctx.haystack, 'تاريخ')) score += 4;
		if (domain.id === 'aqeedah' && includesPhrase(ctx.haystack, 'عقيدة')) score += 4;
		if (domain.id === 'fiqh' && includesPhrase(ctx.haystack, 'فقه')) score += 4;
		if (domain.id === 'tazkiyah' && (includesPhrase(ctx.haystack, 'آداب') || includesPhrase(ctx.haystack, 'أخلاق'))) {
			score += 4;
		}
		if (domain.id === 'arabic' && includesPhrase(ctx.haystack, 'أدب عربي')) score += 6;
		if (score > bestScore) {
			bestScore = score;
			best = domain;
		}
	}
	return { domain: best, score: bestScore };
}

function inferDomainFromSectionName(sectionName) {
	const n = normalizeArabic(sectionName);
	let best = null;
	let bestScore = 0;
	for (const domain of DOMAIN_RULES) {
		const score = scoreKeywordList(domain.keywords, n, n);
		if (score > bestScore) {
			bestScore = score;
			best = domain.id;
		}
	}
	return bestScore >= 3 ? best : null;
}

function isGenericSectionName(name, hints) {
	const n = normalizeArabic(name);
	return hints.some((hint) => n.includes(normalizeArabic(hint)));
}

function sectionLooksCompatible(sectionName, domain) {
	const sectionDomain = inferDomainFromSectionName(sectionName);
	return !sectionDomain || sectionDomain === domain.id || isGenericSectionName(sectionName, GENERIC_MAIN_HINTS);
}

function scoreSection(sectionName, domain, ctx, level) {
	const n = normalizeArabic(sectionName);
	if (!n || !sectionLooksCompatible(sectionName, domain)) return -100;

	let score = 0;
	const sectionTokens = tokensOf(sectionName);
	for (const t of sectionTokens) {
		if (ctx.tokens.has(t)) score += 1;
	}
	if (ctx.haystack.includes(n) && n.length >= 4) score += 4;
	score += scoreKeywordList(domain.keywords, n, n);

	if (level === 'main' && isGenericSectionName(sectionName, GENERIC_MAIN_HINTS)) score += 1;
	if (level !== 'main' && isGenericSectionName(sectionName, GENERIC_SUB_HINTS)) score += 1;
	return score;
}

function pickBestNode(nodes, domain, ctx, level, minScore) {
	let best = null;
	let bestScore = -100;
	for (const node of nodes || []) {
		const score = scoreSection(node.name, domain, ctx, level);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	if (!best || bestScore < minScore) return { node: null, score: bestScore };
	return { node: best, score: bestScore };
}

function topicNameForDomain(domain, ctx) {
	const hay = ctx.haystack;
	const has = (phrase) => includesPhrase(hay, phrase);

	if (domain.id === 'quran') {
		if (has('تجويد') || has('قراءات')) return 'التجويد والقراءات';
		if (has('علوم القرآن')) return 'علوم القرآن';
		return 'التفسير';
	}
	if (domain.id === 'hadith') {
		if (has('مصطلح الحديث') || has('رواة') || has('إسناد')) return 'مصطلح الحديث وعلومه';
		if (has('شرح') || has('شروح')) return 'شروح الحديث';
		if (has('صحيح') || has('سنن') || has('مسند')) return 'كتب السنة';
		return 'كتب الحديث';
	}
	if (domain.id === 'fiqh') {
		if (has('أصول الفقه')) return 'أصول الفقه';
		if (has('فتاوى')) return 'الفتاوى';
		if (has('فرائض') || has('مواريث')) return 'الفرائض والمواريث';
		if (has('بيوع') || has('معاملات')) return 'المعاملات';
		if (has('طهارة') || has('صلاة') || has('زكاة') || has('صيام') || has('حج')) return 'العبادات';
		return 'كتب الفقه العامة';
	}
	if (domain.id === 'aqeedah') {
		if (has('أسماء الله') || has('صفات الله')) return 'الأسماء والصفات';
		if (has('توحيد')) return 'التوحيد';
		return 'العقيدة والتوحيد';
	}
	if (domain.id === 'seerah') {
		if (has('شمائل')) return 'الشمائل المحمدية';
		if (has('صحابة')) return 'سير الصحابة';
		return 'السيرة النبوية';
	}
	if (domain.id === 'history') {
		if (has('تراجم') || has('طبقات') || has('وفيات')) return 'التراجم والطبقات';
		if (has('فتوح')) return 'الفتوح الإسلامية';
		return 'التاريخ الإسلامي';
	}
	if (domain.id === 'tazkiyah') {
		if (has('زهد') || has('رقائق')) return 'الرقائق والزهد';
		if (has('تربية')) return 'التربية الإيمانية';
		return 'الأخلاق والآداب';
	}
	if (domain.id === 'arabic') {
		if (has('نحو') || has('إعراب')) return 'النحو والإعراب';
		if (has('بلاغة')) return 'البلاغة';
		if (has('صرف')) return 'الصرف';
		if (has('شعر') || has('أدب عربي')) return 'الأدب العربي';
		return 'النحو واللغة';
	}
	return domain.secondaryName;
}

function decisionConfidence(mainScore, subScore, secondaryScore, domainScore, createdLevel = 0) {
	const raw =
		0.35 +
		Math.max(0, Math.min(domainScore, 20)) * 0.01 +
		Math.max(0, mainScore) * 0.03 +
		Math.max(0, subScore) * 0.03 +
		Math.max(0, secondaryScore) * 0.02 -
		createdLevel * 0.04;
	return Math.max(0.2, Math.min(raw, 0.9));
}

function makeCreateMainDecision(domain, topicName, domainScore) {
	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: domain.mainName,
		newSubName: domain.subName,
		newSecondaryName: topicName,
		confidence: decisionConfidence(0, 0, 0, domainScore, 3),
		reasoning: `لم يُعثَر على قسم رئيسي مناسب لمجال "${domain.mainName}" — سيُنشأ المسار الثلاثي كاملاً.`,
		method: 'heuristic'
	};
}

/**
 * الواجهة الرئيسيّة للمعاينة. ترجع قراراً لا يكتب شيئاً في قاعدة البيانات،
 * لكنه يوضح هل المسار قائم أو يحتاج إنشاء قسم.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = await classifyAutonomous(sections, bookMeta);
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
			: { valid: true, reason: 'will_create_missing_sections' };

	return {
		suggested: {
			mainId: decision.mainId,
			subId: decision.subId,
			secondaryId: decision.secondaryId,
			confidence: decision.confidence,
			reasoning: decision.reasoning,
			method: decision.method,
			kind: decision.kind,
			newMainName: decision.newMainName || null,
			newSubName: decision.newSubName || null,
			newSecondaryName: decision.newSecondaryName || null
		},
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي تنفيذي. يلتزم دائماً بـ main → sub → secondary قبل المحتوى.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const tree = sections.tree || [];
	const treeIsEmpty = tree.length === 0;
	const ctx = buildContext(bookMeta);
	const { domain, score: domainScore } = pickDomain(ctx);
	const topicName = cleanName(topicNameForDomain(domain, ctx), domain.secondaryName);

	if (treeIsEmpty) {
		return makeCreateMainDecision(domain, topicName, domainScore);
	}

	const mainPick = pickBestNode(tree, domain, ctx, 'main', 2);
	if (!mainPick.node) {
		return makeCreateMainDecision(domain, topicName, domainScore);
	}

	const mainId = String(mainPick.node.id);
	const subPick = pickBestNode(mainPick.node.children || [], domain, ctx, 'sub', 3);
	if (!subPick.node) {
		return {
			kind: 'create_sub',
			mainId,
			subId: null,
			secondaryId: null,
			newSubName: domain.subName,
			newSecondaryName: topicName,
			confidence: decisionConfidence(mainPick.score, 0, 0, domainScore, 2),
			reasoning: `وُجد القسم الرئيسي "${mainPick.node.name}"، ولا يوجد قسم فرعي مناسب لمجال "${domain.subName}" — سيُنشأ فرعي وثانوي.`,
			method: 'heuristic'
		};
	}

	const subId = String(subPick.node.id);
	const secondaryPick = pickBestNode(subPick.node.children || [], domain, ctx, 'secondary', 4);
	if (!secondaryPick.node) {
		return {
			kind: 'create_secondary',
			mainId,
			subId,
			secondaryId: null,
			newSecondaryName: topicName,
			confidence: decisionConfidence(mainPick.score, subPick.score, 0, domainScore, 1),
			reasoning: `وُجد المسار "${mainPick.node.name} ← ${subPick.node.name}"، ولا يوجد قسم ثانوي مناسب — سيُنشأ "${topicName}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId,
		subId,
		secondaryId: String(secondaryPick.node.id),
		confidence: decisionConfidence(mainPick.score, subPick.score, secondaryPick.score, domainScore, 0),
		reasoning: `مطابقة محلية صارمة: ${mainPick.node.name} ← ${subPick.node.name} ← ${secondaryPick.node.name}.`,
		method: 'heuristic'
	};
}
