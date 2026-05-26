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
	if (!bestMain) return null;

	let bestSub = null, bestSubScore = -1;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub) return null;
	if (bestMainScore <= 0 && bestSubScore <= 0) return null;

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

const SEMANTIC_RULES = Object.freeze([
	{
		id: 'fiqh',
		matchAny: ['فقه', 'فقهي', 'الفتاوى', 'فتاوى', 'العبادات', 'المعاملات', 'الصلاة', 'الزكاة'],
		mainNames: ['الفقه الإسلامي', 'الفقه'],
		subNames: ['العبادات والمعاملات', 'الفقه العام', 'فقه العبادات'],
		secondaryName: 'مسائل الفقه'
	},
	{
		id: 'aqeedah',
		matchAny: ['عقيدة', 'العقيدة', 'توحيد', 'الإيمان', 'الايمان', 'الملل والنحل'],
		mainNames: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد والعقيدة'],
		subNames: ['العقيدة الإسلامية', 'التوحيد'],
		secondaryName: 'مسائل العقيدة'
	},
	{
		id: 'history',
		matchAny: ['تاريخ', 'التاريخ', 'السيرة', 'سيرة', 'تراجم', 'طبقات', 'أعلام'],
		mainNames: ['التاريخ والسير', 'التاريخ', 'السير والتراجم'],
		subNames: ['التاريخ الإسلامي', 'السير والتراجم', 'التراجم'],
		secondaryName: 'التراجم والسير'
	},
	{
		id: 'adab',
		matchAny: ['أدب', 'آداب', 'اداب', 'الادب', 'الأدب', 'الآداب', 'شعر', 'بلاغة', 'نحو', 'لغة', 'رواية'],
		mainNames: ['الأدب واللغة', 'اللغة العربية وآدابها', 'الآداب'],
		subNames: ['الأدب العربي', 'اللغة العربية', 'البلاغة والنحو'],
		secondaryName: 'الأدب والنصوص'
	},
	{
		id: 'scientific_advice',
		matchAny: [
			'النصائح',
			'نصائح',
			'التعليمات العلمية',
			'التوجيهات العلمية',
			'طلب العلم',
			'طالب العلم',
			'التربية والتعليم',
			'تعليمية',
			'علمية'
		],
		rejectAny: ['فقه', 'عقيدة', 'عقيده', 'تاريخ', 'سيرة', 'سيره', 'أدب', 'آداب', 'ادب', 'اداب'],
		mainNames: ['الدعوة والتربية', 'التربية والدعوة', 'الدعوة'],
		subNames: ['التربية والتعليم', 'التعليم', 'طلب العلم'],
		secondaryName: 'النصائح والتوجيهات العلمية'
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

function containsAny(haystack, words) {
	return (words || []).some((w) => {
		const n = normalizeArabic(w);
		return n && haystack.includes(n);
	});
}

function cleanSectionName(name, fallback) {
	const n = String(name || '').replace(/\s+/g, ' ').trim();
	return (n || fallback).slice(0, 80);
}

function deriveSubName(bookMeta) {
	const hint = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints.find(Boolean) : '';
	return cleanSectionName(hint, 'كتب عامة');
}

function deriveSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length <= 80) return cleanSectionName(stem, fallback);
	const hint = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints.find(Boolean) : '';
	return cleanSectionName(hint, fallback);
}

function nameMatchesCandidate(nodeName, candidate) {
	const a = normalizeArabic(nodeName);
	const b = normalizeArabic(candidate);
	if (!a || !b) return false;
	if (a === b) return true;
	if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
	const aTokens = new Set(a.split(' ').filter((w) => w.length >= 3));
	const bTokens = new Set(b.split(' ').filter((w) => w.length >= 3));
	if (!aTokens.size || !bTokens.size) return false;
	let shared = 0;
	for (const t of aTokens) if (bTokens.has(t)) shared += 1;
	return shared >= Math.min(2, bTokens.size);
}

function findNodeByNames(nodes, names) {
	for (const node of nodes || []) {
		if ((names || []).some((name) => normalizeArabic(node?.name) === normalizeArabic(name))) {
			return node;
		}
	}
	for (const node of nodes || []) {
		if ((names || []).some((name) => nameMatchesCandidate(node?.name, name))) {
			return node;
		}
	}
	return null;
}

function buildSemanticDecision(sections, bookMeta) {
	const hay = semanticHaystack(bookMeta);
	const rule = SEMANTIC_RULES.find(
		(r) => containsAny(hay, r.matchAny) && !containsAny(hay, r.rejectAny || [])
	);
	if (!rule) return null;

	const main = findNodeByNames(sections.tree, rule.mainNames);
	const newMainName = rule.mainNames[0];
	const newSubName = rule.subNames[0];
	const newSecondaryName = rule.secondaryName;
	const reasoning = `تصنيف دلالي محافظ: ${newMainName} > ${newSubName} > ${newSecondaryName}`;

	if (!main) {
		return {
			kind: 'create_main',
			newMainName,
			newSubName,
			newSecondaryName,
			confidence: 0.92,
			reasoning,
			method: `semantic:${rule.id}`
		};
	}

	const sub = findNodeByNames(main.children, rule.subNames);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName,
			newSecondaryName,
			confidence: 0.9,
			reasoning,
			method: `semantic:${rule.id}`
		};
	}

	const secondary = findNodeByNames(sub.children, [newSecondaryName]);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			newSecondaryName,
			confidence: 0.9,
			reasoning,
			method: `semantic:${rule.id}`
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: 0.94,
		reasoning,
		method: `semantic:${rule.id}`
	};
}

function fallbackCreateDecision(sections, bookMeta) {
	const main = findNodeByNames(sections.tree, ['مكتبة نور']);
	const newSubName = deriveSubName(bookMeta);
	const newSecondaryName = deriveSecondaryName(bookMeta, newSubName);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName,
			newSecondaryName,
			confidence: 0.35,
			reasoning: 'لم تُعثَر مطابقة آمنة؛ إنشاء مسار مستقل داخل مكتبة نور.',
			method: 'fallback_create'
		};
	}
	const sub = findNodeByNames(main.children, [newSubName]);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName,
			newSecondaryName,
			confidence: 0.38,
			reasoning: 'لم تُعثَر مطابقة آمنة؛ إنشاء فرع مستقل داخل مكتبة نور.',
			method: 'fallback_create'
		};
	}
	const secondary = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: newSecondaryName,
		minScore: 7
	});
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: secondary.id,
			confidence: 0.45,
			reasoning: `إعادة استخدام قسم ثانوي قريب: ${secondary.name}`,
			method: 'fallback_reuse'
		};
	}
	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName,
		confidence: 0.38,
		reasoning: 'لم تُعثَر مطابقة ثانوية آمنة؛ إنشاء قسم ثانوي جديد.',
		method: 'fallback_create'
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
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}
	const semanticDecision = buildSemanticDecision(sections, bookMeta);
	if (semanticDecision) return semanticDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return fallbackCreateDecision(sections, bookMeta);
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
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
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: Math.min(sug.confidence, 0.72),
			reasoning: `${sug.reasoning} — لا يوجد قسم ثانوي مناسب، سيتم إنشاؤه.`,
			method: sug.method
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
