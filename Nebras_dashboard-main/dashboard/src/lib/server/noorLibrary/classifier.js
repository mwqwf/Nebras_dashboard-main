/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
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

function normalizeToken(token) {
	let t = normalizeArabic(token);
	if (t.startsWith('وال')) t = t.slice(3);
	else if (t.startsWith('ال')) t = t.slice(2);
	else if (/^[وفبكل]/u.test(t) && t.length > 3) t = t.slice(1);
	return t;
}

const STOP_WORDS = new Set(
	[
		'كتاب',
		'كتب',
		'في',
		'من',
		'عن',
		'علي',
		'الى',
		'الي',
		'حول',
		'مع',
		'هذا',
		'هذه',
		'ذلك',
		'تلك',
		'التي',
		'الذي',
		'اسلاميه',
		'اسلامي',
		'الدين',
		'الشرعيه',
		'العربيه'
	].map(normalizeToken)
);

const TOPIC_RULES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		aliases: ['علوم القرآن', 'التفسير وعلوم القرآن', 'التفسير'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'تفاسير', 'تجويد', 'قراءات', 'مصحف', 'سورة', 'آيات'],
		defaultSubName: 'علوم القرآن',
		defaultSecondaryName: 'مصنفات قرآنية',
		subRules: [
			{
				name: 'التفسير',
				keywords: ['تفسير', 'تفاسير', 'المفسرون', 'الطبري', 'القرطبي'],
				secondaryName: 'كتب التفسير'
			},
			{
				name: 'التجويد والقراءات',
				keywords: ['تجويد', 'قراءات', 'رواية حفص', 'ورش'],
				secondaryName: 'التجويد والقراءات'
			},
			{
				name: 'علوم القرآن',
				keywords: ['علوم القرآن', 'أسباب النزول', 'ناسخ', 'منسوخ', 'إعجاز'],
				secondaryName: 'علوم القرآن'
			}
		]
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		aliases: ['الحديث', 'السنة النبوية', 'علوم الحديث'],
		keywords: ['حديث', 'أحاديث', 'السنة', 'سنن', 'صحيح', 'مسند', 'إسناد', 'رواة', 'جرح', 'تعديل'],
		defaultSubName: 'علوم الحديث',
		defaultSecondaryName: 'مصنفات حديثية',
		subRules: [
			{
				name: 'متون الحديث وشروحه',
				keywords: ['صحيح', 'سنن', 'مسند', 'موطأ', 'شرح الحديث', 'أحاديث'],
				secondaryName: 'متون الحديث وشروحه'
			},
			{
				name: 'مصطلح الحديث والرجال',
				keywords: ['مصطلح الحديث', 'رواة', 'جرح', 'تعديل', 'علل', 'إسناد'],
				secondaryName: 'مصطلح الحديث والرجال'
			}
		]
	},
	{
		key: 'aqidah',
		mainName: 'العقيدة',
		aliases: ['العقيدة الإسلامية', 'التوحيد', 'أصول الدين'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'شرك', 'أسماء', 'صفات', 'قدر', 'إلحاد', 'فرق', 'أديان'],
		defaultSubName: 'التوحيد والعقيدة',
		defaultSecondaryName: 'مصنفات العقيدة',
		subRules: [
			{
				name: 'التوحيد والعقيدة',
				keywords: ['توحيد', 'عقيدة', 'إيمان', 'شرك', 'أسماء', 'صفات'],
				secondaryName: 'التوحيد والعقيدة'
			},
			{
				name: 'الفرق والأديان',
				keywords: ['فرق', 'أديان', 'ملل', 'نحل', 'إلحاد'],
				secondaryName: 'الفرق والأديان'
			}
		]
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		aliases: ['الفقه الإسلامي', 'الفقه', 'أصول الفقه'],
		keywords: ['فقه', 'أصول الفقه', 'فتاوى', 'حلال', 'حرام', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'معاملات', 'مواريث'],
		defaultSubName: 'فقه عام',
		defaultSecondaryName: 'مصنفات فقهية',
		subRules: [
			{
				name: 'العبادات',
				keywords: ['طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'عمرة', 'عبادات'],
				secondaryName: 'فقه العبادات'
			},
			{
				name: 'المعاملات',
				keywords: ['بيع', 'شراء', 'ربا', 'نكاح', 'طلاق', 'معاملات', 'قضاء', 'جنايات'],
				secondaryName: 'فقه المعاملات'
			},
			{
				name: 'أصول الفقه والقواعد',
				keywords: ['أصول الفقه', 'قواعد فقهية', 'مقاصد', 'اجتهاد', 'قياس'],
				secondaryName: 'أصول الفقه والقواعد'
			}
		]
	},
	{
		key: 'seerah',
		mainName: 'السيرة النبوية',
		aliases: ['السيرة', 'الشمائل النبوية', 'المغازي'],
		keywords: ['سيرة', 'النبي', 'رسول', 'محمد', 'شمائل', 'مغازي', 'غزوات', 'هجرة'],
		defaultSubName: 'السيرة والشمائل',
		defaultSecondaryName: 'مصنفات السيرة',
		subRules: [
			{
				name: 'السيرة والشمائل',
				keywords: ['سيرة', 'شمائل', 'النبي', 'رسول', 'هجرة'],
				secondaryName: 'السيرة والشمائل'
			},
			{
				name: 'المغازي والغزوات',
				keywords: ['مغازي', 'غزوات', 'بدر', 'أحد', 'الخندق'],
				secondaryName: 'المغازي والغزوات'
			}
		]
	},
	{
		key: 'history',
		mainName: 'التاريخ والتراجم',
		aliases: ['التاريخ الإسلامي', 'التراجم', 'السير والتراجم'],
		keywords: ['تاريخ', 'تراجم', 'أعلام', 'طبقات', 'سير', 'وفيات', 'فتوح', 'دول', 'ملوك'],
		defaultSubName: 'التراجم والسير',
		defaultSecondaryName: 'مصنفات تاريخية',
		subRules: [
			{
				name: 'التاريخ الإسلامي',
				keywords: ['تاريخ', 'فتوح', 'دول', 'خلافة', 'ملوك'],
				secondaryName: 'التاريخ الإسلامي'
			},
			{
				name: 'التراجم والسير',
				keywords: ['تراجم', 'أعلام', 'طبقات', 'سير', 'وفيات'],
				secondaryName: 'التراجم والسير'
			}
		]
	},
	{
		key: 'adab_tazkiyah',
		mainName: 'الآداب والأخلاق والتزكية',
		aliases: ['الآداب', 'الأخلاق والتزكية', 'التزكية والرقائق', 'التربية الإسلامية'],
		keywords: [
			'أدب',
			'آداب',
			'أخلاق',
			'تزكية',
			'رقائق',
			'مواعظ',
			'موعظة',
			'نصائح',
			'وصايا',
			'تربية',
			'تعليم',
			'تعليمات',
			'علمية',
			'طالب العلم',
			'طلب العلم',
			'العالم والمتعلم'
		],
		defaultSubName: 'التزكية والأخلاق',
		defaultSecondaryName: 'نصائح وتوجيهات علمية',
		subRules: [
			{
				name: 'آداب طالب العلم',
				keywords: ['طالب العلم', 'طلب العلم', 'تعليم', 'تعليمات', 'علمية', 'العالم والمتعلم', 'نصائح', 'وصايا'],
				secondaryName: 'نصائح وتوجيهات علمية'
			},
			{
				name: 'التزكية والأخلاق',
				keywords: ['تزكية', 'أخلاق', 'رقائق', 'مواعظ', 'موعظة', 'وصايا'],
				secondaryName: 'التزكية والأخلاق'
			},
			{
				name: 'الآداب الشرعية',
				keywords: ['آداب', 'أدب', 'سلوك', 'معاملة'],
				secondaryName: 'الآداب الشرعية'
			}
		]
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والإرشاد',
		aliases: ['الدعوة', 'الإرشاد', 'الخطب والمحاضرات'],
		keywords: ['دعوة', 'داعية', 'إرشاد', 'خطب', 'محاضرات', 'نصح', 'وعظ'],
		defaultSubName: 'الدعوة العامة',
		defaultSecondaryName: 'مواد دعوية',
		subRules: [
			{
				name: 'الدعوة العامة',
				keywords: ['دعوة', 'إرشاد', 'نصح', 'وعظ'],
				secondaryName: 'مواد دعوية'
			},
			{
				name: 'الخطب والمحاضرات',
				keywords: ['خطب', 'خطبة', 'محاضرات', 'دروس'],
				secondaryName: 'الخطب والمحاضرات'
			}
		]
	},
	{
		key: 'arabic',
		mainName: 'اللغة العربية',
		aliases: ['علوم اللغة العربية', 'النحو والصرف', 'الأدب العربي'],
		keywords: ['لغة', 'عربية', 'نحو', 'صرف', 'بلاغة', 'شعر', 'أدب عربي', 'معاجم', 'إعراب'],
		defaultSubName: 'علوم اللغة',
		defaultSecondaryName: 'مصنفات لغوية',
		subRules: [
			{
				name: 'النحو والصرف',
				keywords: ['نحو', 'صرف', 'إعراب'],
				secondaryName: 'النحو والصرف'
			},
			{
				name: 'البلاغة والأدب',
				keywords: ['بلاغة', 'شعر', 'أدب عربي', 'بيان'],
				secondaryName: 'البلاغة والأدب'
			}
		]
	}
]);

const GENERAL_TOPIC = Object.freeze({
	key: 'general',
	mainName: 'المكتبة الإسلامية العامة',
	aliases: ['كتب إسلامية عامة', 'متفرقات إسلامية'],
	keywords: ['إسلام', 'إسلامية', 'شرعية', 'دين'],
	defaultSubName: 'مصنفات عامة',
	defaultSecondaryName: 'كتب إسلامية عامة',
	subRules: [
		{
			name: 'مصنفات عامة',
			keywords: ['إسلام', 'إسلامية', 'شرعية', 'دين'],
			secondaryName: 'كتب إسلامية عامة'
		}
	]
});

function tokensOf(s) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.map((t) => normalizeToken(t.trim()))
			.filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
	);
}

function bookContext(bookMeta) {
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
	return { haystack, tokens: tokensOf(haystack) };
}

function normalizedList(list) {
	return (list || []).map(normalizeArabic).filter(Boolean);
}

function scoreKeywords({ haystack, tokens }, keywords = []) {
	let score = 0;
	for (const raw of keywords || []) {
		const k = normalizeArabic(raw);
		if (!k) continue;
		if (k.includes(' ')) {
			if (haystack.includes(k)) score += 5;
			continue;
		}
		const kt = normalizeToken(k);
		if (tokens.has(kt)) score += 3;
		else if (haystack.includes(k) && k.length >= 4) score += 1;
	}
	return score;
}

function scoreRule(rule, ctx) {
	return scoreKeywords(ctx, [...(rule.keywords || []), rule.mainName, ...(rule.aliases || [])]);
}

function pickTopicRule(ctx) {
	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		const score = scoreRule(rule, ctx);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= 3 ? { rule: best, score: bestScore } : { rule: GENERAL_TOPIC, score: 1 };
}

function scoreNode(node, { targetNames = [], keywords = [], ctx }) {
	const n = normalizeArabic(node?.name || '');
	if (!n) return 0;
	let score = 0;
	for (const target of normalizedList(targetNames)) {
		if (n === target) score += 30;
		else if (n.includes(target) || target.includes(n)) score += 18;
	}
	if (ctx.haystack.includes(n) && n.length >= 4) score += 8;
	const nodeTokens = tokensOf(n);
	for (const t of nodeTokens) {
		if (ctx.tokens.has(t)) score += 2;
	}
	score += scoreKeywords({ haystack: n, tokens: nodeTokens }, keywords);
	return score;
}

function pickNode(nodes, opts, minScore) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNode(node, opts);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function pickSubRule(topic, ctx) {
	let best = null;
	let bestScore = 0;
	for (const rule of topic.subRules || []) {
		const score = scoreKeywords(ctx, [rule.name, ...(rule.keywords || [])]);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	if (best && bestScore >= 3) return best;
	return (
		(topic.subRules || []).find((r) => r.name === topic.defaultSubName) ||
		(topic.subRules || [])[0] || {
			name: topic.defaultSubName,
			keywords: topic.keywords || [],
			secondaryName: topic.defaultSecondaryName
		}
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
	const cleaned = String(name || '')
		.replace(/^كتب\s+(?:في\s+)?/u, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function isGenericHint(hint) {
	const n = normalizeArabic(hint);
	if (!n) return true;
	if (['كتب', 'كتاب', 'كتب اسلاميه', 'اسلاميه', 'الدين الاسلامي'].includes(n)) return true;
	return n.length < 4;
}

function proposeSecondaryName(bookMeta, topic, subRule) {
	if (subRule?.secondaryName) return cleanSectionName(subRule.secondaryName, topic.defaultSecondaryName);
	for (const hint of bookMeta?.categoryHints || []) {
		if (!isGenericHint(hint)) {
			return cleanSectionName(hint, topic.defaultSecondaryName);
		}
	}
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length <= 70) return cleanSectionName(stem, topic.defaultSecondaryName);
	return cleanSectionName(topic.defaultSecondaryName, 'مصنفات عامة');
}

function buildDecision(sections, bookMeta) {
	const ctx = bookContext(bookMeta);
	const { rule: topic, score: topicScore } = pickTopicRule(ctx);
	const subRule = pickSubRule(topic, ctx);
	const secondaryName = proposeSecondaryName(bookMeta, topic, subRule);
	const mainTargets = [topic.mainName, ...(topic.aliases || [])];
	const subTargets = [subRule.name, topic.defaultSubName].filter(Boolean);
	const secondaryTargets = [secondaryName, subRule.secondaryName, topic.defaultSecondaryName].filter(Boolean);

	const mainPick = pickNode(
		sections.tree || [],
		{ targetNames: mainTargets, keywords: topic.keywords || [], ctx },
		topic.key === 'general' ? 10 : 4
	);

	if (!mainPick) {
		return {
			kind: 'create_main',
			newMainName: topic.mainName,
			newSubName: subRule.name || topic.defaultSubName,
			newSecondaryName: secondaryName,
			confidence: topic.key === 'general' ? 0.45 : Math.min(0.72 + topicScore * 0.02, 0.9),
			reasoning: `لا يوجد قسم رئيسي مناسب؛ إنشاء مسار جديد لـ "${topic.mainName}".`,
			method: 'taxonomy'
		};
	}

	const mainNode = mainPick.node;
	const subPick = pickNode(
		mainNode.children || [],
		{ targetNames: subTargets, keywords: [...(subRule.keywords || []), ...(topic.keywords || [])], ctx },
		5
	);

	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(mainNode.id),
			newSubName: subRule.name || topic.defaultSubName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.65 + mainPick.score * 0.01, 0.88),
			reasoning: `القسم الرئيسي مناسب، ولا يوجد قسم فرعي دقيق؛ إنشاء "${subRule.name || topic.defaultSubName}".`,
			method: 'taxonomy'
		};
	}

	const subNode = subPick.node;
	const secondaryPick = pickNode(
		subNode.children || [],
		{
			targetNames: secondaryTargets,
			keywords: [...(subRule.keywords || []), secondaryName],
			ctx
		},
		6
	);

	if (!secondaryPick) {
		return {
			kind: 'create_secondary',
			mainId: String(mainNode.id),
			subId: String(subNode.id),
			newSecondaryName: secondaryName,
			confidence: Math.min(0.64 + subPick.score * 0.01, 0.88),
			reasoning: `المسار الرئيسي/الفرعي مناسب، ولا يوجد قسم ثانوي دقيق؛ إنشاء "${secondaryName}".`,
			method: 'taxonomy'
		};
	}

	return {
		kind: 'existing',
		mainId: String(mainNode.id),
		subId: String(subNode.id),
		secondaryId: String(secondaryPick.node.id),
		confidence: Math.min(0.7 + (mainPick.score + subPick.score + secondaryPick.score) * 0.005, 0.95),
		reasoning: 'مطابقة تصنيفية محلية مع الالتزام بالمسار الثلاثي.',
		method: 'taxonomy'
	};
}

/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = buildDecision(sections, bookMeta);
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: decision.mainId, subId: decision.subId, secondaryId: decision.secondaryId },
					sections.index
				)
			: { valid: true, pendingCreation: true, reason: decision.kind };
	return {
		suggested: decision,
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	return buildDecision(sections, bookMeta);
}
