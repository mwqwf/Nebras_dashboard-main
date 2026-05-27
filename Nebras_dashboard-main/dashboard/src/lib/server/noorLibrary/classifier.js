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

const DEFAULT_MAIN_SECTION_NAME = 'مكتبة نور';
const DEFAULT_SUB_SECTION_NAME = 'كتب عامة';
const DEFAULT_SECONDARY_SECTION_NAME = 'مختارات مكتبة نور';

const EDUCATION_ADVICE_RULE = Object.freeze({
	id: 'education_advice',
	preferredMainName: 'الدعوة والتربية',
	preferredSubName: 'التربية والتعليم',
	preferredSecondaryName: 'النصائح والتوجيهات العلمية',
	mainNames: [
		'الدعوة والتربية',
		'التربية والدعوة',
		'الدعوة',
		'التربية'
	],
	subNames: [
		'التربية والتعليم',
		'التعليم والتربية',
		'التربية',
		'التعليم'
	],
	secondaryNames: [
		'النصائح والتوجيهات العلمية',
		'التوجيهات العلمية',
		'النصائح العلمية',
		'التعليمات العلمية',
		'النصائح حول التعليمات العلمية للسادة'
	],
	triggers: [
		'النصائح حول التعليمات العلمية للسادة',
		'النصائح حول التعليمات العلمية السادة',
		'النصائح والتعليمات العلمية',
		'النصائح العلمية',
		'التوجيهات العلمية'
	]
});

function normalizedWords(text) {
	return normalizeArabic(text)
		.split(' ')
		.filter((w) => w.length >= 3);
}

function scoreSectionName(name, haystack, tokens) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	if (haystack.includes(n) && n.length >= 4) score += 4;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	return score;
}

function aliasScore(name, aliases) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let best = 0;
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) best = Math.max(best, 100);
		else if (n.includes(a) || a.includes(n)) best = Math.max(best, 80);
		else {
			const aliasWords = normalizedWords(a);
			const matched = aliasWords.filter((w) => n.includes(w)).length;
			if (aliasWords.length && matched === aliasWords.length) best = Math.max(best, 60);
		}
	}
	return best;
}

function findNodeByAliases(nodes, aliases) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = aliasScore(node?.name, aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return bestScore >= 60 ? best : null;
}

function cleanCandidateName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function firstCategoryHint(bookMeta) {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	return cleanCandidateName(hints.find((h) => String(h || '').trim()) || '', '');
}

function inferSubSectionName(bookMeta) {
	return cleanCandidateName(firstCategoryHint(bookMeta), DEFAULT_SUB_SECTION_NAME);
}

function inferSecondarySectionName(bookMeta, fallback = DEFAULT_SECONDARY_SECTION_NAME) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4 && stem.length <= 80) return stem;
	return cleanCandidateName(firstCategoryHint(bookMeta), fallback);
}

function matchesEducationAdviceRule(bookMeta) {
	const hay = haystackForReuse(bookMeta);
	if (EDUCATION_ADVICE_RULE.triggers.some((t) => hay.includes(normalizeArabic(t)))) {
		return true;
	}
	const adviceWords = ['نصائح', 'النصائح', 'توجيهات', 'التوجيهات', 'ارشادات', 'الارشادات'];
	const educationWords = ['تعليم', 'التعليم', 'تعليمات', 'العلمية', 'علمية', 'التربية', 'تربية'];
	const hasAdvice = adviceWords.some((w) => hay.includes(normalizeArabic(w)));
	const hasEducation = educationWords.some((w) => hay.includes(normalizeArabic(w)));
	return hasAdvice && hasEducation;
}

function decisionForEducationAdvice(sections, bookMeta) {
	if (!matchesEducationAdviceRule(bookMeta)) return null;
	const main = findNodeByAliases(sections.tree, EDUCATION_ADVICE_RULE.mainNames);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: EDUCATION_ADVICE_RULE.preferredMainName,
			newSubName: EDUCATION_ADVICE_RULE.preferredSubName,
			newSecondaryName: EDUCATION_ADVICE_RULE.preferredSecondaryName,
			confidence: 0.97,
			reasoning: 'قاعدة موضوعية: نصائح/تعليمات علمية تُصنّف تحت الدعوة والتربية > التربية والتعليم.',
			method: 'rule:education_advice'
		};
	}

	const sub = findNodeByAliases(main.children, EDUCATION_ADVICE_RULE.subNames);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: EDUCATION_ADVICE_RULE.preferredSubName,
			newSecondaryName: EDUCATION_ADVICE_RULE.preferredSecondaryName,
			confidence: 0.96,
			reasoning: `قاعدة موضوعية: إنشاء فرع التربية والتعليم تحت "${main.name}".`,
			method: 'rule:education_advice'
		};
	}

	const secondary = findNodeByAliases(sub.children, EDUCATION_ADVICE_RULE.secondaryNames);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: EDUCATION_ADVICE_RULE.preferredSecondaryName,
			confidence: 0.95,
			reasoning: `قاعدة موضوعية: إنشاء قسم النصائح والتوجيهات العلمية تحت "${sub.name}".`,
			method: 'rule:education_advice'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: 0.98,
		reasoning: 'قاعدة موضوعية: وجدنا المسار التعليمي المناسب كاملاً.',
		method: 'rule:education_advice'
	};
}

function pickMainForCreation(sections, bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = new Set(haystack.split(' ').filter((t) => t.length >= 3));
	let bestMain = null;
	let bestScore = 0;
	for (const m of sections.tree || []) {
		const score = scoreSectionName(m.name, haystack, tokens);
		if (score > bestScore) {
			bestMain = m;
			bestScore = score;
		}
	}
	return bestScore >= 2 ? bestMain : null;
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

	let bestMain = null, bestMainScore = -1;
	for (const m of tree) {
		const s = scoreSectionName(m.name, haystack, tokens);
		if (s > bestMainScore) { bestMainScore = s; bestMain = m; }
	}
	if (!bestMain || bestMainScore <= 0) return null;

	let bestSub = null, bestSubScore = -1;
	for (const sub of bestMain.children) {
		const s = scoreSectionName(sub.name, haystack, tokens);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub || bestSubScore <= 0) return null;

	let bestSec = null, bestSecScore = -1;
	for (const sec of bestSub.children) {
		const s = scoreSectionName(sec.name, haystack, tokens);
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
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: DEFAULT_MAIN_SECTION_NAME,
			newSubName: inferSubSectionName(bookMeta),
			newSecondaryName: inferSecondarySectionName(bookMeta),
			confidence: 0.35,
			reasoning: 'لا توجد شجرة أقسام صالحة — إنشاء مسار مكتبة نور ثلاثي كامل.',
			method: 'fallback:create_full_hierarchy'
		};
	}

	const ruleDecision = decisionForEducationAdvice(sections, bookMeta);
	if (ruleDecision) return ruleDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const mainForCreation = pickMainForCreation(sections, bookMeta);
		if (mainForCreation) {
			return {
				kind: 'create_sub',
				mainId: String(mainForCreation.id),
				subId: null,
				secondaryId: null,
				newSubName: inferSubSectionName(bookMeta),
				newSecondaryName: inferSecondarySectionName(bookMeta),
				confidence: 0.45,
				reasoning: `وُجد قسم رئيسي مناسب "${mainForCreation.name}" دون فرع دقيق — إنشاء فرع/ثانوي جديدين.`,
				method: 'heuristic:create_sub'
			};
		}
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: DEFAULT_MAIN_SECTION_NAME,
			newSubName: inferSubSectionName(bookMeta),
			newSecondaryName: inferSecondarySectionName(bookMeta),
			confidence: 0.25,
			reasoning: 'لم توجد مطابقة آمنة — إنشاء مسار جديد بدل خلط الكتاب مع قسم غير مناسب.',
			method: 'heuristic:create_main'
		};
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: '',
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: null,
			newSecondaryName: inferSecondarySectionName(bookMeta),
			confidence: Math.max(0.4, Math.min(sug.confidence, 0.75)),
			reasoning: `${sug.reasoning} — إنشاء قسم ثانوي دقيق للحفاظ على main > sub > secondary > content.`,
			method: `${sug.method}:create_secondary`
		};
	}

	const validation = validateHierarchyPath(
		{ mainId: sug.mainId, subId: sug.subId, secondaryId: secId },
		sections.index
	);
	if (!validation.valid) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: DEFAULT_MAIN_SECTION_NAME,
			newSubName: inferSubSectionName(bookMeta),
			newSecondaryName: inferSecondarySectionName(bookMeta),
			confidence: 0.25,
			reasoning: `المسار المقترح غير صالح (${validation.reason}) — إنشاء مسار ثلاثي آمن.`,
			method: 'heuristic:invalid_path_create_main'
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
