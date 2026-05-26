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

const ADVICE_EDUCATION_RULE = Object.freeze({
	mainName: 'الدعوة والتربية',
	mainAliases: ['الدعوة والتربية', 'الدعوة', 'التربية', 'التربية والدعوة'],
	subName: 'التربية والتعليم',
	subAliases: ['التربية والتعليم', 'التعليم والتربية', 'التعليم', 'التربية العلمية'],
	secondaryName: 'النصائح والتوجيهات العلمية',
	secondaryAliases: [
		'النصائح والتوجيهات العلمية',
		'نصائح علمية',
		'التوجيهات العلمية',
		'التعليمات العلمية',
		'النصائح العلمية'
	],
	triggers: ['نصائح', 'النصائح', 'تعليمات علميه', 'تعليم علمي', 'توجيهات علميه', 'الساده']
});

const TOPIC_RULES = Object.freeze([
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه الإسلامي', 'الفقه', 'كتب في الفقه وأصوله', 'الفقه وأصوله'],
		subName: 'الفقه وأصوله',
		subAliases: ['الفقه وأصوله', 'أصول الفقه', 'العبادات', 'المعاملات', 'الفقه الإسلامي'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'أحكام فقهية', 'فتاوى ومسائل'],
		triggers: ['فقه', 'فقهي', 'اصول الفقه', 'احكام', 'عبادات', 'معاملات', 'فتاوي']
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'كتب في العقيدة', 'التوحيد'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['العقيدة والتوحيد', 'التوحيد', 'الإيمان', 'اصول الاعتقاد'],
		secondaryName: 'مسائل العقيدة',
		secondaryAliases: ['مسائل العقيدة', 'التوحيد', 'الإيمان'],
		triggers: ['عقيده', 'توحيد', 'ايمان', 'اسماء وصفات', 'اعتقاد']
	},
	{
		key: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ الإسلامي', 'التاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'التاريخ', 'السير والتراجم', 'التراجم'],
		secondaryName: 'كتب التاريخ',
		secondaryAliases: ['كتب التاريخ', 'التاريخ العام', 'التراجم'],
		triggers: ['تاريخ', 'تراجم', 'حضاره', 'دول', 'فتوح', 'خلافه']
	},
	{
		key: 'adab',
		mainName: 'التزكية والأخلاق',
		mainAliases: ['التزكية والأخلاق', 'الأخلاق والآداب', 'الأدب والآداب', 'الآداب'],
		subName: 'الآداب والأخلاق',
		subAliases: ['الآداب والأخلاق', 'الأخلاق', 'الآداب', 'التزكية'],
		secondaryName: 'الآداب العامة',
		secondaryAliases: ['الآداب العامة', 'الأخلاق العامة', 'تهذيب السلوك'],
		triggers: ['ادب', 'اداب', 'اخلاق', 'تزكيه', 'سلوك', 'رقائق']
	},
	{
		key: 'education',
		mainName: ADVICE_EDUCATION_RULE.mainName,
		mainAliases: ADVICE_EDUCATION_RULE.mainAliases,
		subName: ADVICE_EDUCATION_RULE.subName,
		subAliases: ADVICE_EDUCATION_RULE.subAliases,
		secondaryName: ADVICE_EDUCATION_RULE.secondaryName,
		secondaryAliases: ADVICE_EDUCATION_RULE.secondaryAliases,
		triggers: ['تربيه', 'تعليم', 'تعليمات', 'ارشاد', 'نصائح', 'توجيهات']
	}
]);

function sanitizeSectionName(raw, fallback = 'كتب عامة') {
	let s = String(raw || '').trim();
	if (!s) return fallback;
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s || fallback;
}

function tokensOfNormalized(text) {
	return new Set(normalizeArabic(text).split(' ').filter((t) => t.length >= 3));
}

function haystackText(bookMeta) {
	return normalizeArabic(
		[
			bookMeta?.title,
			seriesStemFromTitle(bookMeta?.title || ''),
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
}

function matchesAllAdviceSignals(haystack) {
	const hasAdvice = haystack.includes('نصائح') || haystack.includes('النصائح');
	const hasEducation =
		haystack.includes('تعليم') ||
		haystack.includes('تعليمات') ||
		haystack.includes('توجيهات');
	const hasScientificOrSayyids =
		haystack.includes('علمي') ||
		haystack.includes('علميه') ||
		haystack.includes('الساده') ||
		haystack.includes('ساده');
	return hasAdvice && hasEducation && hasScientificOrSayyids;
}

function matchAliasScore(name, aliases) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let best = 0;
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) best = Math.max(best, 30);
		else if (n.includes(a) || a.includes(n)) best = Math.max(best, 20);
		else {
			const ratio = tokenSetsOverlapRatio(tokensOfNormalized(n), tokensOfNormalized(a));
			if (ratio >= 0.5) best = Math.max(best, 12);
			else if (ratio >= 0.3) best = Math.max(best, 6);
		}
	}
	return best;
}

function findBestByAliases(nodes, aliases) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = matchAliasScore(node?.name, aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return bestScore >= 12 ? best : null;
}

function pathDecisionFromRule(sections, rule, reasoning) {
	const main = findBestByAliases(sections.tree || [], rule.mainAliases);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.78,
			reasoning,
			method: 'heuristic'
		};
	}

	const sub = findBestByAliases(main.children || [], rule.subAliases);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.82,
			reasoning,
			method: 'heuristic'
		};
	}

	const secondary = findBestByAliases(sub.children || [], rule.secondaryAliases);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence: 0.86,
			reasoning,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: 0.92,
		reasoning,
		method: 'heuristic'
	};
}

function detectTopicRule(bookMeta) {
	const haystack = haystackText(bookMeta);
	if (matchesAllAdviceSignals(haystack)) return ADVICE_EDUCATION_RULE;

	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		let score = 0;
		for (const trigger of rule.triggers || []) {
			const t = normalizeArabic(trigger);
			if (t && haystack.includes(t)) score += t.length > 4 ? 2 : 1;
		}
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return bestScore > 0 ? best : null;
}

function pickBestCategoryHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint, '');
		if (clean && clean.length >= 2) return clean;
	}
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && stem.length >= 2) return stem;
	return 'كتب عامة';
}

function pickSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && stem.length >= 4) return stem;
	const hint = pickBestCategoryHint(bookMeta);
	return sanitizeSectionName(hint, fallback);
}

function scoreExistingNode(node, haystack, tokens, aliases = []) {
	const name = node?.name || '';
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = matchAliasScore(name, aliases);
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 2;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 6;
	return score;
}

function bestScoredNode(nodes, haystack, aliases = []) {
	const tokens = tokensOfNormalized(haystack);
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreExistingNode(node, haystack, tokens, aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return { node: best, score: bestScore };
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = normalizeArabic(
		[
			bookMeta.title,
			bookMeta.author,
			bookMeta.description,
			...(bookMeta.categoryHints || [])
		].filter(Boolean).join(' ')
	);
	const tokens = new Set(haystack.split(' ').filter((t) => t.length >= 3));

	function scoreOf(name) {
		const n = normalizeArabic(name);
		if (!n) return 0;
		let score = 0;
		for (const w of n.split(' ')) {
			if (w.length >= 3 && tokens.has(w)) score += 1;
			if (haystack.includes(n) && n.length >= 4) score += 2;
		}
		return score;
	}

	let bestMain = null, bestMainScore = -1;
	for (const m of tree) {
		const s = scoreOf(m.name);
		if (s > bestMainScore) { bestMainScore = s; bestMain = m; }
	}
	if (!bestMain) return null;

	let bestSub = null, bestSubScore = -1;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub) return null;

	let bestSec = null, bestSecScore = -1;
	for (const sec of bestSub.children) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) { bestSecScore = s; bestSec = sec; }
	}

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec ? bestSec.id : null,
		confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05, 0.85),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic'
	};
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

function haystackForReuse(bookMeta) {
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

function getSecondariesUnderSubInTree(tree, subId) {
	for (const m of tree || []) {
		for (const s of m.children || []) {
			if (String(s.id) === String(subId)) return s.children || [];
		}
	}
	return [];
}

function tokenSetsOverlapRatio(setA, setB) {
	if (!setA.size || !setB.size) return 0;
	let inter = 0;
	for (const t of setA) if (setB.has(t)) inter += 1;
	return inter / new Set([...setA, ...setB]).size;
}

function scoreSecondaryForReuse(secNode, bookMeta, proposedNewName) {
	const secN = normalizeArabic(secNode?.name || '');
	const propN = normalizeArabic(proposedNewName || '');
	const hay = haystackForReuse(bookMeta);
	if (!secN) return 0;
	const secTok = new Set(secN.split(' ').filter((w) => w.length >= 3));
	const hayTok = new Set(hay.split(' ').filter((w) => w.length >= 3));

	let score = 0;
	if (propN) {
		if (secN === propN) score += 14;
		else if (secN.includes(propN) || propN.includes(secN)) score += 11;
		else {
			const pTok = new Set(propN.split(' ').filter((w) => w.length >= 3));
			const r = tokenSetsOverlapRatio(pTok, secTok);
			if (r >= 0.45) score += 8;
			else if (r >= 0.25) score += 4;
		}
	}
	if (hay.includes(secN) && secN.length >= 4) score += 9;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	const stemTok = new Set(stem.split(' ').filter((w) => w.length >= 3));
	score += tokenSetsOverlapRatio(secTok, stemTok) * 10;
	score += tokenSetsOverlapRatio(secTok, hayTok) * 8;
	return score;
}

function pickReuseSecondary(sections, subId, bookMeta, options = {}) {
	const minScore = options.minScore ?? 6;
	const proposed = options.proposedNewName || '';
	const secs = getSecondariesUnderSubInTree(sections.tree, subId);
	if (!secs.length) return null;
	let best = null;
	let bestScore = 0;
	for (const sec of secs) {
		const sc = scoreSecondaryForReuse(sec, bookMeta, proposed);
		if (sc > bestScore) {
			bestScore = sc;
			best = sec;
		}
	}
	if (best && bestScore >= minScore) {
		return { id: String(best.id), name: best.name, score: bestScore };
	}
	return null;
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

	const sug = classifyHeuristic(sections, bookMeta);
	const validation = sug
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'heuristic_failed' };
	return {
		suggested: sug || {
			mainId: sections.tree[0].id,
			subId: sections.tree[0].children[0]?.id || '',
			secondaryId: null,
			confidence: 0.1,
			reasoning: 'لم تُعثَر مطابقة. تمّ اختيار أوّل قسم.',
			method: 'heuristic'
		},
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const tree = sections.tree || [];
	const topicRule = detectTopicRule(bookMeta);
	if (topicRule) {
		const isAdvice = topicRule === ADVICE_EDUCATION_RULE;
		return pathDecisionFromRule(
			{ ...sections, tree },
			topicRule,
			isAdvice
				? 'قاعدة صريحة: كتاب النصائح/التعليمات العلمية يُصنَّف تحت الدعوة والتربية ← التربية والتعليم ← النصائح والتوجيهات العلمية.'
				: `قاعدة موضوعية "${topicRule.key}" لمنع خلط الكتب بين الفقه/العقيدة/التاريخ/الآداب.`
		);
	}

	const hint = pickBestCategoryHint(bookMeta);
	const secondaryName = pickSecondaryName(bookMeta, hint);

	if (!tree.length) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: hint,
			newSecondaryName: secondaryName,
			confidence: 0.35,
			reasoning: 'الشجرة فارغة — إنشاء مسار ثلاثي كامل لمحتوى مكتبة نور.',
			method: 'heuristic'
		};
	}

	const haystack = haystackText(bookMeta);
	const bestMain = bestScoredNode(tree, haystack);
	if (!bestMain.node || bestMain.score < 2) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: hint,
			newSecondaryName: secondaryName,
			confidence: 0.38,
			reasoning: 'لم يظهر قسم رئيسي مناسب بدرجة كافية — إنشاء مسار ثلاثي جديد.',
			method: 'heuristic'
		};
	}

	const bestSub = bestScoredNode(bestMain.node.children || [], haystack);
	if (!bestSub.node || bestSub.score < 2) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.node.id),
			subId: null,
			secondaryId: null,
			newSubName: hint,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.45 + bestMain.score * 0.03, 0.75),
			reasoning: `وُجد قسم رئيسي مناسب "${bestMain.node.name}"، ولا يوجد فرعي مناسب — إنشاء فرعي وثانوي.`,
			method: 'heuristic'
		};
	}

	const reuse = pickReuseSecondary(sections, String(bestSub.node.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 6
	});
	if (reuse) {
		return {
			kind: 'existing',
			mainId: String(bestMain.node.id),
			subId: String(bestSub.node.id),
			secondaryId: reuse.id,
			confidence: Math.min(0.55 + bestMain.score * 0.03 + bestSub.score * 0.03, 0.9),
			reasoning: `مطابقة محلّيّة: ${bestMain.node.name} ← ${bestSub.node.name} ← ${reuse.name}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(bestMain.node.id),
		subId: String(bestSub.node.id),
		secondaryId: null,
		newSecondaryName: secondaryName,
		confidence: Math.min(0.5 + bestMain.score * 0.03 + bestSub.score * 0.03, 0.82),
		reasoning: `وُجد رئيسي وفرعي مناسبان (${bestMain.node.name} ← ${bestSub.node.name})، ولا يوجد ثانوي مناسب — إنشاء ثانوي.`,
		method: 'heuristic'
	};
}
