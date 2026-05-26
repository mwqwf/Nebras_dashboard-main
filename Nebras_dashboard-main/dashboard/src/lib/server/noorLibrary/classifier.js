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

const FALLBACK_MAIN_NAME = 'مكتبة نور';
const FALLBACK_SUB_NAME = 'كتب عامة';
const FALLBACK_SECONDARY_NAME = 'كتب عامة';

const STOP_WORDS = new Set(
	[
		'كتاب',
		'كتب',
		'حول',
		'الى',
		'الي',
		'على',
		'علي',
		'عن',
		'في',
		'من',
		'مع',
		'هذا',
		'هذه',
		'ذلك',
		'تلك',
		'التي',
		'الذي',
		'للشيخ',
		'الشيخ',
		'الدكتور',
		'دكتور'
	].map(normalizeArabic)
);

const ROUTING_RULES = Object.freeze([
	{
		id: 'scientific-advice-education',
		keywords: [
			'النصائح',
			'نصائح',
			'التعليمات العلمية',
			'تعليمات علمية',
			'السادة',
			'للسادة',
			'التوجيهات العلمية',
			'طلب العلم',
			'آداب طالب العلم',
			'اداب طالب العلم'
		],
		mainName: 'الدعوة والتربية',
		mainAliases: ['التربية والدعوة', 'الدعوة والتربية الإسلامية'],
		subName: 'التربية والتعليم',
		subAliases: ['التعليم والتربية', 'التعليم', 'التربية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: ['النصائح العلمية', 'التوجيهات العلمية', 'نصائح وتوجيهات علمية'],
		minScore: 2,
		reasoning: 'قاعدة مخصّصة لكتب النصائح والتوجيهات العلمية'
	},
	{
		id: 'fiqh',
		keywords: ['فقه', 'الفقه', 'فتاوى', 'فتوي', 'عبادات', 'معاملات', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج'],
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه', 'فقه'],
		subName: 'فقه عام',
		subAliases: ['الفقه العام', 'مسائل فقهية'],
		secondaryName: 'كتب الفقه العامة',
		secondaryAliases: ['فقه عام', 'مسائل فقهية عامة'],
		minScore: 1,
		reasoning: 'قاعدة فصل كتب الفقه عن الأقسام غير الفقهية'
	},
	{
		id: 'aqida',
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الايمان', 'الإيمان', 'اسماء الله', 'أسماء الله'],
		mainName: 'العقيدة',
		mainAliases: ['العقيدة الإسلامية', 'التوحيد'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['التوحيد', 'أصول الاعتقاد', 'اصول الاعتقاد'],
		secondaryName: 'كتب العقيدة العامة',
		secondaryAliases: ['عقيدة عامة', 'التوحيد'],
		minScore: 1,
		reasoning: 'قاعدة فصل كتب العقيدة عن التاريخ والفقه'
	},
	{
		id: 'history',
		keywords: ['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'طبقات', 'غزوات'],
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ', 'السيرة والتاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['السيرة النبوية', 'السير والتراجم', 'التراجم'],
		secondaryName: 'كتب التاريخ والسير العامة',
		secondaryAliases: ['تاريخ عام', 'سير وتراجم'],
		minScore: 1,
		reasoning: 'قاعدة فصل كتب التاريخ والسير عن العقيدة'
	},
	{
		id: 'adab',
		keywords: ['ادب', 'أدب', 'الادب', 'الأدب', 'شعر', 'بلاغة', 'نحو', 'لغة عربية'],
		mainName: 'اللغة والأدب',
		mainAliases: ['اللغة العربية', 'الأدب واللغة', 'الادب واللغة'],
		subName: 'الأدب',
		subAliases: ['الادب', 'النثر والشعر', 'البلاغة'],
		secondaryName: 'كتب الأدب العامة',
		secondaryAliases: ['الأدب العام', 'الادب العام'],
		minScore: 1,
		reasoning: 'قاعدة فصل كتب الأدب عن الفقه'
	}
]);

function normalizedTokens(s) {
	return normalizeArabic(s)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function metaHaystack(bookMeta) {
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

function ruleScore(rule, haystack, tokens) {
	let score = 0;
	for (const keyword of rule.keywords || []) {
		const n = normalizeArabic(keyword);
		if (!n) continue;
		if (haystack.includes(n)) {
			score += n.includes(' ') ? 3 : 1;
			continue;
		}
		const parts = normalizedTokens(n);
		if (parts.length && parts.every((p) => tokens.has(p))) score += parts.length;
	}
	return score;
}

function chooseRoutingRule(bookMeta) {
	const haystack = metaHaystack(bookMeta);
	const tokens = new Set(normalizedTokens(haystack));
	let best = null;
	let bestScore = 0;
	for (const rule of ROUTING_RULES) {
		const score = ruleScore(rule, haystack, tokens);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (best && bestScore >= (best.minScore || 1)) {
		return { rule: best, score: bestScore };
	}
	return null;
}

function normalizedNameChoices(name, aliases = []) {
	return new Set([name, ...(aliases || [])].map(normalizeArabic).filter(Boolean));
}

function namesMatch(actualName, choices) {
	const actual = normalizeArabic(actualName);
	if (!actual) return false;
	if (choices.has(actual)) return true;
	for (const choice of choices) {
		if (choice.length >= 8 && (actual.includes(choice) || choice.includes(actual))) return true;
	}
	return false;
}

function findMainNode(sections, rule) {
	const choices = normalizedNameChoices(rule.mainName, rule.mainAliases);
	return (sections.tree || []).find((main) => namesMatch(main.name, choices)) || null;
}

function findSubNode(mainNode, rule) {
	const choices = normalizedNameChoices(rule.subName, rule.subAliases);
	return (mainNode?.children || []).find((sub) => namesMatch(sub.name, choices)) || null;
}

function findSecondaryNode(subNode, rule) {
	const choices = normalizedNameChoices(rule.secondaryName, rule.secondaryAliases);
	return (subNode?.children || []).find((sec) => namesMatch(sec.name, choices)) || null;
}

function buildRuleDecision(sections, bookMeta, matchedRule) {
	const { rule, score } = matchedRule;
	const main = findMainNode(sections, rule);
	const base = {
		confidence: Math.min(0.72 + score * 0.04, 0.96),
		reasoning: rule.reasoning || 'قاعدة تصنيف موضوعية',
		method: `rule:${rule.id}`
	};
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			...base
		};
	}

	const sub = findSubNode(main, rule);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			...base
		};
	}

	const secondary = findSecondaryNode(sub, rule);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			...base
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: rule.secondaryName,
		minScore: 8
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			...base,
			reasoning: `${base.reasoning} — استعمال قسم ثانوي قريب: ${reusable.name}`
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: rule.secondaryName,
		...base
	};
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
	if (!bestMain || bestMainScore <= 0) return null;

	let bestSub = null, bestSubScore = -1;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub || bestSubScore <= 0) return null;

	let bestSec = null, bestSecScore = -1;
	for (const sec of bestSub.children) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) { bestSecScore = s; bestSec = sec; }
	}
	if (bestSecScore <= 0) bestSec = null;

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

function cleanSectionName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^كتاب\s+/u, '')
		.slice(0, 80);
	return cleaned || fallback;
}

function titleStemForSectionName(title) {
	let t = String(title || '').replace(/\s+/g, ' ').trim();
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '');
	return cleanSectionName(t, '');
}

function firstMeaningfulHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const cleaned = cleanSectionName(hint, '');
		if (normalizedTokens(cleaned).length > 0) return cleaned;
	}
	return '';
}

function genericNewSecondaryName(bookMeta) {
	return (
		titleStemForSectionName(bookMeta?.title) ||
		firstMeaningfulHint(bookMeta) ||
		FALLBACK_SECONDARY_NAME
	);
}

function genericCreateDecision(bookMeta) {
	const hint = firstMeaningfulHint(bookMeta);
	return {
		kind: 'create_main',
		newMainName: FALLBACK_MAIN_NAME,
		newSubName: cleanSectionName(hint, FALLBACK_SUB_NAME),
		newSecondaryName: genericNewSecondaryName(bookMeta),
		confidence: 0.35,
		reasoning: 'لا يوجد قسم مناسب بثقة كافية؛ إنشاء مسار مكتبة نور مستقلّ بدل خلط الكتاب في قسم غير مطابق.',
		method: 'generic-create'
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

	const decision = await classifyAutonomous(sections, bookMeta);
	const sug = decision.kind === 'existing'
		? {
				mainId: decision.mainId,
				subId: decision.subId,
				secondaryId: decision.secondaryId,
				confidence: decision.confidence,
				reasoning: decision.reasoning,
				method: decision.method
			}
		: {
				mainId: decision.mainId || '',
				subId: decision.subId || '',
				secondaryId: '',
				newMainName: decision.newMainName || '',
				newSubName: decision.newSubName || '',
				newSecondaryName: decision.newSecondaryName || '',
				confidence: decision.confidence,
				reasoning: decision.reasoning,
				method: decision.method,
				kind: decision.kind
			};
	const validation = sug
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'classification_failed' };
	return {
		suggested: sug,
		alternatives: [],
		validation: decision.kind === 'existing' ? validation : { valid: true, reason: 'will_create_missing_sections' }
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

	const ruleDecision = chooseRoutingRule(bookMeta);
	if (ruleDecision) {
		return buildRuleDecision(sections, bookMeta, ruleDecision);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return genericCreateDecision(bookMeta);
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	const proposedSecondaryName = genericNewSecondaryName(bookMeta);
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: proposedSecondaryName,
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			newSecondaryName: proposedSecondaryName,
			confidence: Math.max(0.45, sug.confidence - 0.1),
			reasoning: 'وُجد قسم رئيسي وفرعي مناسب، لكن لا يوجد قسم ثانوي مناسب؛ سيُنشأ قسم ثانوي قبل إضافة الكتاب.',
			method: 'heuristic-create-secondary'
		};
	}
	return {
		kind: 'existing',
		mainId: String(sug.mainId),
		subId: String(sug.subId),
		secondaryId: secId,
		confidence: sug.confidence,
		reasoning: sug.reasoning,
		method: 'heuristic'
	};
}
