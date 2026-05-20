/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary].
 *
 * الهدف التشغيلي هنا ليس "أقرب كلمة" فقط؛ بل منع خلط الفنون: الفقه لا
 * يختلط بالآداب، والتاريخ لا يختلط بالعقيدة، وكتب طلب العلم لها مسار واضح.
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

function normalizeList(list) {
	return [...new Set((list || []).map(normalizeArabic).filter(Boolean))];
}

function tokensOf(text) {
	return new Set(normalizeArabic(text).split(' ').filter((t) => t.length >= 3));
}

function tokenOverlapScore(a, b) {
	if (!a.size || !b.size) return 0;
	let score = 0;
	for (const t of a) if (b.has(t)) score += 1;
	return score;
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

function haystackForBook(bookMeta) {
	return normalizeArabic(
		[
			seriesStemFromTitle(bookMeta?.title || ''),
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
}

const TOPIC_RULES = Object.freeze([
	{
		id: 'student-of-knowledge',
		mainName: 'التربية والتعليم',
		mainAliases: ['التربية', 'التعليم', 'المناهج', 'طلب العلم', 'التوجيه'],
		subName: 'طلب العلم والتربية العلمية',
		subAliases: ['طلب العلم', 'التربية العلمية', 'آداب طالب العلم', 'مناهج طلب العلم'],
		secondaryName: 'آداب طالب العلم',
		keywords: [
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'آداب طالب العلم',
			'اداب طالب العلم',
			'العالم والمتعلم',
			'المتعلم',
			'التعليم',
			'التعلم',
			'التحصيل العلمي',
			'التوجيهات العلمية',
			'منهجية الطلب',
			'الرحلة في طلب العلم'
		],
		secondaries: [
			{ name: 'آداب طالب العلم', keywords: ['آداب طالب العلم', 'اداب طالب العلم', 'طالب العلم', 'العالم والمتعلم'] },
			{ name: 'مناهج التعلم والتعليم', keywords: ['التعليم', 'التعلم', 'المناهج', 'منهجية', 'التحصيل'] }
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العلوم الشرعية',
		mainAliases: ['العلوم الشرعية', 'العلوم الاسلامية', 'العقيدة', 'التوحيد'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['العقيدة', 'التوحيد', 'الايمان', 'الاسماء والصفات', 'الفرق والمذاهب'],
		secondaryName: 'كتب العقيدة',
		keywords: ['العقيدة', 'عقيدة', 'التوحيد', 'الايمان', 'الإيمان', 'الشرك', 'الاسماء والصفات', 'القدر', 'الايمان بالملائكة', 'الفرق', 'الجهمية', 'المعتزلة'],
		secondaries: [
			{ name: 'التوحيد', keywords: ['التوحيد', 'الشرك', 'لا اله الا الله'] },
			{ name: 'الإيمان وأركانه', keywords: ['الايمان', 'الإيمان', 'اركان الايمان', 'القدر'] },
			{ name: 'الأسماء والصفات', keywords: ['الاسماء والصفات', 'الصفات', 'اسماء الله'] },
			{ name: 'الفرق والمذاهب العقدية', keywords: ['الفرق', 'المذاهب', 'الجهمية', 'المعتزلة', 'الاشاعرة'] }
		]
	},
	{
		id: 'fiqh',
		mainName: 'العلوم الشرعية',
		mainAliases: ['العلوم الشرعية', 'العلوم الاسلامية', 'الفقه', 'الشريعة'],
		subName: 'الفقه وأصوله',
		subAliases: ['الفقه', 'اصول الفقه', 'أصول الفقه', 'القواعد الفقهية', 'الفتاوى'],
		secondaryName: 'مسائل فقهية عامة',
		keywords: ['الفقه', 'فقه', 'اصول الفقه', 'أصول الفقه', 'الفتاوى', 'فتاوى', 'الاحكام', 'أحكام', 'طهارة', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'النكاح', 'البيع', 'المعاملات', 'الفرائض'],
		secondaries: [
			{ name: 'العبادات', keywords: ['طهارة', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'العبادات'] },
			{ name: 'المعاملات', keywords: ['البيع', 'البيوع', 'المعاملات', 'الربا', 'الشركات'] },
			{ name: 'أصول الفقه والقواعد', keywords: ['اصول الفقه', 'أصول الفقه', 'القواعد الفقهية', 'المقاصد'] },
			{ name: 'الفتاوى', keywords: ['الفتاوى', 'فتاوى', 'سؤال وجواب'] }
		]
	},
	{
		id: 'quran',
		mainName: 'العلوم الشرعية',
		mainAliases: ['العلوم الشرعية', 'العلوم الاسلامية', 'القرآن', 'القران', 'التفسير'],
		subName: 'القرآن وعلومه',
		subAliases: ['القرآن', 'القران', 'التفسير', 'علوم القرآن', 'علوم القران', 'التجويد', 'القراءات'],
		secondaryName: 'التفسير وعلوم القرآن',
		keywords: ['القرآن', 'القران', 'تفسير', 'التفسير', 'علوم القرآن', 'علوم القران', 'التجويد', 'القراءات', 'المصحف', 'الآيات', 'الايات', 'السور'],
		secondaries: [
			{ name: 'التفسير', keywords: ['تفسير', 'التفسير', 'المفسر'] },
			{ name: 'علوم القرآن', keywords: ['علوم القرآن', 'علوم القران', 'اسباب النزول', 'ناسخ ومنسوخ'] },
			{ name: 'التجويد والقراءات', keywords: ['التجويد', 'القراءات', 'رواية حفص'] }
		]
	},
	{
		id: 'hadith',
		mainName: 'العلوم الشرعية',
		mainAliases: ['العلوم الشرعية', 'العلوم الاسلامية', 'الحديث', 'السنة'],
		subName: 'الحديث وعلومه',
		subAliases: ['الحديث', 'علوم الحديث', 'السنة', 'المصطلح', 'الجرح والتعديل'],
		secondaryName: 'كتب الحديث',
		keywords: ['الحديث', 'حديث', 'السنة', 'السنن', 'الصحيح', 'صحيح البخاري', 'صحيح مسلم', 'مصطلح الحديث', 'الجرح والتعديل', 'الرواة', 'الاسناد', 'الأسانيد'],
		secondaries: [
			{ name: 'متون الحديث وشروحها', keywords: ['الصحيح', 'السنن', 'الموطأ', 'مسند', 'شرح الحديث'] },
			{ name: 'مصطلح الحديث', keywords: ['مصطلح الحديث', 'المصطلح', 'علوم الحديث'] },
			{ name: 'الجرح والتعديل والرواة', keywords: ['الجرح والتعديل', 'الرواة', 'الرجال', 'الاسناد'] }
		]
	},
	{
		id: 'seerah-history',
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة', 'التاريخ', 'التاريخ الاسلامي', 'السيرة النبوية'],
		subName: 'السيرة والتاريخ',
		subAliases: ['السيرة', 'السيرة النبوية', 'التاريخ', 'التراجم', 'الطبقات', 'الخلفاء'],
		secondaryName: 'كتب السيرة والتاريخ',
		keywords: ['السيرة', 'سيرة', 'المغازي', 'الغزوات', 'التاريخ', 'تاريخ', 'التراجم', 'الطبقات', 'الخلفاء', 'الصحابة', 'الفتوح', 'الدولة'],
		secondaries: [
			{ name: 'السيرة النبوية', keywords: ['السيرة النبوية', 'المغازي', 'الغزوات', 'شمائل'] },
			{ name: 'التاريخ الإسلامي', keywords: ['التاريخ', 'تاريخ', 'الخلفاء', 'الفتوح', 'الدولة'] },
			{ name: 'التراجم والطبقات', keywords: ['التراجم', 'الطبقات', 'اعلام', 'سير اعلام'] }
		]
	},
	{
		id: 'tazkiyah-adab',
		mainName: 'التزكية والأخلاق والآداب',
		mainAliases: ['التزكية', 'الأخلاق', 'الاخلاق', 'الآداب', 'الاداب', 'الرقائق'],
		subName: 'الأخلاق والآداب',
		subAliases: ['الأخلاق', 'الاخلاق', 'الآداب', 'الاداب', 'التزكية', 'الرقائق', 'السلوك'],
		secondaryName: 'كتب الأخلاق والآداب',
		keywords: ['الأخلاق', 'الاخلاق', 'آداب', 'اداب', 'التزكية', 'الرقائق', 'السلوك', 'الزهد', 'الورع', 'القلوب', 'المواعظ', 'التهذيب'],
		secondaries: [
			{ name: 'تزكية النفوس', keywords: ['التزكية', 'القلوب', 'الزهد', 'الورع', 'الرقائق'] },
			{ name: 'الأخلاق والآداب العامة', keywords: ['الأخلاق', 'الاخلاق', 'آداب', 'اداب', 'المواعظ'] }
		]
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'العربية', 'النحو', 'الصرف', 'البلاغة', 'الأدب العربي'],
		subName: 'علوم اللغة العربية',
		subAliases: ['النحو', 'الصرف', 'البلاغة', 'اللغة العربية', 'العربية', 'المعاجم'],
		secondaryName: 'كتب اللغة العربية',
		keywords: ['النحو', 'الصرف', 'البلاغة', 'العروض', 'القوافي', 'اللغة العربية', 'المعاجم', 'لسان العرب', 'الشعر', 'الأدب العربي', 'الادب العربي'],
		secondaries: [
			{ name: 'النحو والصرف', keywords: ['النحو', 'الصرف', 'الإعراب', 'اعراب'] },
			{ name: 'البلاغة والأدب', keywords: ['البلاغة', 'الأدب العربي', 'الادب العربي', 'الشعر'] },
			{ name: 'المعاجم واللغة', keywords: ['المعاجم', 'لسان العرب', 'القاموس', 'اللغة'] }
		]
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		mainAliases: ['الدعوة', 'الثقافة الاسلامية', 'الفكر الاسلامي'],
		subName: 'الدعوة والفكر الإسلامي',
		subAliases: ['الدعوة', 'الفكر الاسلامي', 'الثقافة الاسلامية', 'الحسبة'],
		secondaryName: 'كتب الدعوة والفكر',
		keywords: ['الدعوة', 'الدعاة', 'الحسبة', 'الامر بالمعروف', 'النهي عن المنكر', 'الفكر الاسلامي', 'الثقافة الاسلامية', 'الشبهات'],
		secondaries: [
			{ name: 'الدعوة والإرشاد', keywords: ['الدعوة', 'الدعاة', 'الإرشاد', 'الحسبة'] },
			{ name: 'الفكر والشبهات', keywords: ['الفكر الاسلامي', 'الشبهات', 'الغزو الفكري'] }
		]
	}
]);

const FALLBACK_RULE = Object.freeze({
	id: 'general-islamic',
	mainName: 'العلوم الشرعية',
	mainAliases: ['العلوم الشرعية', 'العلوم الاسلامية', 'اسلاميات', 'كتب اسلامية'],
	subName: 'مكتبة إسلامية عامة',
	subAliases: ['مكتبة إسلامية', 'كتب اسلامية', 'متفرقات اسلامية'],
	secondaryName: 'كتب إسلامية متنوعة',
	keywords: ['اسلام', 'اسلامية', 'شرعية', 'دين', 'كتاب'],
	secondaries: []
});

function scoreKeywordList(haystack, hayTokens, keywords) {
	let score = 0;
	for (const kw of normalizeList(keywords)) {
		if (!kw) continue;
		if (haystack.includes(kw)) score += kw.includes(' ') ? 8 : 4;
		const kwTokens = tokensOf(kw);
		score += tokenOverlapScore(kwTokens, hayTokens);
	}
	return score;
}

function pickTopicRule(bookMeta) {
	const haystack = haystackForBook(bookMeta);
	const hayTokens = tokensOf(haystack);
	let best = { rule: FALLBACK_RULE, score: 0 };
	for (const rule of TOPIC_RULES) {
		let score = scoreKeywordList(haystack, hayTokens, rule.keywords);
		score += scoreKeywordList(haystack, hayTokens, rule.subAliases) * 0.8;
		if (score > best.score) best = { rule, score };
	}
	if (best.score < 3) {
		return { rule: FALLBACK_RULE, score: Math.max(best.score, 1) };
	}
	return best;
}

function pickSecondaryName(rule, bookMeta) {
	const haystack = haystackForBook(bookMeta);
	const hayTokens = tokensOf(haystack);
	let best = { name: rule.secondaryName, score: 0 };
	for (const sec of rule.secondaries || []) {
		const score = scoreKeywordList(haystack, hayTokens, sec.keywords);
		if (score > best.score) best = { name: sec.name, score };
	}
	return best.name || rule.secondaryName;
}

function scoreNodeName(name, aliases, haystack, hayTokens) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	const nodeTokens = tokensOf(n);

	for (const alias of normalizeList(aliases)) {
		if (n === alias) score += 20;
		else if (n.includes(alias) || alias.includes(n)) score += 14;
		score += tokenOverlapScore(nodeTokens, tokensOf(alias)) * 3;
	}

	if (haystack.includes(n) && n.length >= 4) score += 8;
	score += tokenOverlapScore(nodeTokens, hayTokens) * 2;
	return score;
}

function pickBestNode(nodes, aliases, bookMeta, minScore) {
	const haystack = haystackForBook(bookMeta);
	const hayTokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNodeName(node?.name, aliases, haystack, hayTokens);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function confidenceFromScores(topicScore, mainScore = 0, subScore = 0, secScore = 0) {
	return Math.min(0.99, 0.45 + topicScore * 0.025 + mainScore * 0.008 + subScore * 0.01 + secScore * 0.01);
}

function mainAliasesFor(rule) {
	return [
		rule.mainName,
		...(rule.mainAliases || []),
		rule.subName,
		...(rule.subAliases || [])
	];
}

function subAliasesFor(rule) {
	return [rule.subName, ...(rule.subAliases || [])];
}

function secondaryAliasesFor(rule, secondaryName) {
	return [
		secondaryName,
		rule.secondaryName,
		...(rule.subAliases || []),
		...(rule.secondaries || []).flatMap((s) => [s.name, ...(s.keywords || [])])
	];
}

function buildReason(rule, secondaryName, action) {
	return `تصنيف موضوعي: ${rule.subName} ← ${secondaryName}. الإجراء: ${action}.`;
}

function asDecision(base) {
	return {
		method: 'local_topic_taxonomy',
		...base
	};
}

function classifyHeuristic(sections, bookMeta) {
	const { rule, score: topicScore } = pickTopicRule(bookMeta);
	const secondaryName = pickSecondaryName(rule, bookMeta);
	const mainPick = pickBestNode(sections.tree || [], mainAliasesFor(rule), bookMeta, 6);

	if (!mainPick) {
		return asDecision({
			kind: 'create_main',
			mainId: '',
			subId: '',
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: confidenceFromScores(topicScore),
			reasoning: buildReason(rule, secondaryName, 'إنشاء قسم رئيسي/فرعي/ثانوي لأن المسار غير موجود')
		});
	}

	const mainNode = mainPick.node;
	const subPick = pickBestNode(mainNode.children || [], subAliasesFor(rule), bookMeta, 6);
	if (!subPick) {
		return asDecision({
			kind: 'create_sub',
			mainId: String(mainNode.id),
			subId: '',
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: confidenceFromScores(topicScore, mainPick.score),
			reasoning: buildReason(rule, secondaryName, `استخدام "${mainNode.name}" وإنشاء الفرع الناقص`)
		});
	}

	const subNode = subPick.node;
	const secPick = pickBestNode(
		subNode.children || [],
		secondaryAliasesFor(rule, secondaryName),
		bookMeta,
		7
	);
	if (!secPick) {
		return asDecision({
			kind: 'create_secondary',
			mainId: String(mainNode.id),
			subId: String(subNode.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: confidenceFromScores(topicScore, mainPick.score, subPick.score),
			reasoning: buildReason(rule, secondaryName, `استخدام "${mainNode.name} > ${subNode.name}" وإنشاء الثانوي الناقص`)
		});
	}

	return asDecision({
		kind: 'existing',
		mainId: String(mainNode.id),
		subId: String(subNode.id),
		secondaryId: String(secPick.node.id),
		confidence: confidenceFromScores(topicScore, mainPick.score, subPick.score, secPick.score),
		reasoning: buildReason(rule, secondaryName, `استخدام المسار القائم "${mainNode.name} > ${subNode.name} > ${secPick.node.name}"`)
	});
}

/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = classifyHeuristic(sections, bookMeta);
	const suggested = {
		mainId: decision.mainId,
		subId: decision.subId,
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		kind: decision.kind,
		newMainName: decision.newMainName,
		newSubName: decision.newSubName,
		newSecondaryName: decision.newSecondaryName
	};
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: suggested.mainId, subId: suggested.subId, secondaryId: suggested.secondaryId },
					sections.index
				)
			: { valid: true, reason: 'will_create_missing_sections' };
	return { suggested, alternatives: [], validation };
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	return classifyHeuristic(sections, bookMeta);
}
