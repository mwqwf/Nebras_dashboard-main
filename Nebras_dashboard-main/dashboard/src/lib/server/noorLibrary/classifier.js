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
	if (!bestSub || bestSubScore <= 0) {
		return {
			mainId: bestMain.id,
			subId: null,
			secondaryId: null,
			confidence: Math.min(0.45 + bestMainScore * 0.05, 0.65),
			reasoning: 'heuristic مطابقة رئيسيّة فقط — يحتاج فرعاً وثانوياً جديدَيْن',
			method: 'heuristic'
		};
	}

	let bestSec = null, bestSecScore = -1;
	for (const sec of bestSub.children) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) { bestSecScore = s; bestSec = sec; }
	}

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec && bestSecScore > 0 ? bestSec.id : null,
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

function findByName(nodes, name) {
	const target = normalizeArabic(name);
	if (!target) return null;
	for (const node of nodes || []) {
		if (normalizeArabic(node?.name || '') === target) return node;
	}
	return null;
}

function compactTitleForSection(title) {
	const stem = seriesStemFromTitle(title);
	let t = String(stem || title || '').trim();
	t = t
		.replace(/^كتاب\s+/u, '')
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (t.length > 70) t = t.slice(0, 70).trim();
	return t;
}

function deriveSubName(bookMeta) {
	const hint = Array.isArray(bookMeta?.categoryHints) ? String(bookMeta.categoryHints[0] || '').trim() : '';
	return hint.slice(0, 60) || 'كتب عامة';
}

function deriveSecondaryName(bookMeta) {
	return compactTitleForSection(bookMeta?.title) || deriveSubName(bookMeta) || 'كتب عامة';
}

const SEMANTIC_RULES = Object.freeze([
	{
		id: 'scientific_advice_for_sayyids',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		confidence: 0.96,
		reasoning:
			'مطابقة دلالية: نصائح/تعليمات علمية؛ تُحفظ تحت التربية والتعليم لا الفقه أو العقيدة أو التاريخ أو الآداب.',
		match(hay) {
			return (
				/(?:نصيحه|نصائح|النصائح)/u.test(hay) &&
				/(?:تعليمات|تعليم|علميه|علمي)/u.test(hay) &&
				/(?:الساده|للساده|ساده)/u.test(hay)
			);
		}
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية',
		confidence: 0.9,
		reasoning: 'مطابقة دلالية: ألفاظ فقهية صريحة؛ يمنع خلطها مع الآداب أو التاريخ أو العقيدة.',
		match(hay) {
			return /(?:فقه|اصول الفقه|فتاوي|فتوى|العبادات|المعاملات|طهاره|صلاه|زكاه|صيام|حج)/u.test(hay);
		}
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة',
		confidence: 0.9,
		reasoning: 'مطابقة دلالية: ألفاظ العقيدة والتوحيد؛ يمنع خلطها مع التاريخ أو الفقه.',
		match(hay) {
			return /(?:عقيده|توحيد|ايمان|اسماء الله|صفات الله|الشرك|القدر)/u.test(hay);
		}
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'كتب التاريخ',
		confidence: 0.88,
		reasoning: 'مطابقة دلالية: ألفاظ تاريخ وسير؛ يمنع خلطها مع العقيدة أو الفقه.',
		match(hay) {
			return /(?:تاريخ|سيره|تراجم|طبقات|دول|خلافه|فتوحات|اندلس)/u.test(hay);
		}
	},
	{
		id: 'adab',
		mainName: 'الآداب والأخلاق',
		subName: 'الآداب والتزكية',
		secondaryName: 'كتب الآداب والأخلاق',
		confidence: 0.88,
		reasoning: 'مطابقة دلالية: ألفاظ الآداب والأخلاق؛ يمنع خلطها مع الفقه.',
		match(hay) {
			return /(?:ادب|اداب|اخلاق|تزكيه|رقائق|موعظه|مواعظ|سلوك)/u.test(hay);
		}
	}
]);

function semanticHaystack(bookMeta) {
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

function pickSemanticRule(bookMeta) {
	const hay = semanticHaystack(bookMeta);
	return SEMANTIC_RULES.find((rule) => rule.match(hay)) || null;
}

function decisionFromSemanticRule(sections, bookMeta, rule) {
	const main = findByName(sections.tree, rule.mainName);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: rule.confidence,
			reasoning: rule.reasoning,
			method: `semantic:${rule.id}`
		};
	}

	const sub = findByName(main.children, rule.subName);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: rule.confidence,
			reasoning: rule.reasoning,
			method: `semantic:${rule.id}`
		};
	}

	const secondary = findByName(sub.children, rule.secondaryName);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: rule.confidence,
			reasoning: rule.reasoning,
			method: `semantic:${rule.id}`
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
			confidence: rule.confidence,
			reasoning: `${rule.reasoning} — استُخدم قسم ثانوي قائم قريب: ${reusable.name}.`,
			method: `semantic:${rule.id}:reuse_secondary`
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: rule.secondaryName,
		confidence: rule.confidence,
		reasoning: rule.reasoning,
		method: `semantic:${rule.id}`
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

	const semanticRule = pickSemanticRule(bookMeta);
	const semanticDecision = semanticRule
		? decisionFromSemanticRule(sections, bookMeta, semanticRule)
		: null;
	const sug = semanticDecision?.kind === 'existing'
		? {
				mainId: semanticDecision.mainId,
				subId: semanticDecision.subId,
				secondaryId: semanticDecision.secondaryId,
				confidence: semanticDecision.confidence,
				reasoning: semanticDecision.reasoning,
				method: semanticDecision.method
			}
		: classifyHeuristic(sections, bookMeta);
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
		createSuggestion: semanticDecision && semanticDecision.kind !== 'existing' ? semanticDecision : null,
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		const semanticRule = pickSemanticRule(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: semanticRule?.mainName || 'مكتبة نور',
			newSubName: semanticRule?.subName || deriveSubName(bookMeta),
			newSecondaryName: semanticRule?.secondaryName || deriveSecondaryName(bookMeta),
			confidence: semanticRule?.confidence || 0.6,
			reasoning: semanticRule?.reasoning || 'لا توجد شجرة أقسام؛ إنشاء مسار ثلاثي كامل.',
			method: semanticRule ? `semantic:${semanticRule.id}` : 'heuristic:create_empty_tree'
		};
	}

	const semanticRule = pickSemanticRule(bookMeta);
	if (semanticRule) {
		return decisionFromSemanticRule(sections, bookMeta, semanticRule);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: deriveSubName(bookMeta),
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: 0.35,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة مناسبة؛ إنشاء مسار ثلاثي مستقل.',
			method: 'heuristic:create_path'
		};
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!sug.subId) {
		return {
			kind: 'create_sub',
			mainId: String(sug.mainId),
			subId: null,
			secondaryId: null,
			newSubName: deriveSubName(bookMeta),
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: Math.max(0.4, sug.confidence),
			reasoning: 'وُجد قسم رئيسي مناسب بلا فرع مناسب؛ إنشاء فرع وثانوي للكتاب.',
			method: 'heuristic:create_sub'
		};
	}
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: deriveSecondaryName(bookMeta),
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
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: Math.max(0.45, sug.confidence),
			reasoning: 'وُجد main/sub مناسب، ولا يوجد قسم ثانوي مناسب؛ إنشاء المستوى الثانوي قبل الإضافة.',
			method: 'heuristic:create_secondary'
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
