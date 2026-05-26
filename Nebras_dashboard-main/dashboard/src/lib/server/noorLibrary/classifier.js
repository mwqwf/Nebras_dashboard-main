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

function tokensOf(value) {
	return normalizeArabic(value)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3);
}

function haystackFromBook(bookMeta) {
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

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree }, bookMeta) {
	const haystack = haystackFromBook(bookMeta);
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
		mainScore: bestMainScore,
		subScore: bestSubScore,
		secondaryScore: bestSecScore,
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

function findMainByNames(tree, names) {
	const targets = names.map(normalizeArabic).filter(Boolean);
	for (const main of tree || []) {
		const n = normalizeArabic(main?.name || '');
		if (targets.includes(n)) return main;
	}
	for (const main of tree || []) {
		const n = normalizeArabic(main?.name || '');
		if (n && targets.some((t) => n.includes(t) || t.includes(n))) return main;
	}
	return null;
}

function findSubByNames(main, names) {
	const targets = names.map(normalizeArabic).filter(Boolean);
	for (const sub of main?.children || []) {
		const n = normalizeArabic(sub?.name || '');
		if (targets.includes(n)) return sub;
	}
	for (const sub of main?.children || []) {
		const n = normalizeArabic(sub?.name || '');
		if (n && targets.some((t) => n.includes(t) || t.includes(n))) return sub;
	}
	return null;
}

function findSecondaryByName(sub, name) {
	const target = normalizeArabic(name);
	if (!target) return null;
	for (const sec of sub?.children || []) {
		const n = normalizeArabic(sec?.name || '');
		if (n && (n === target || n.includes(target) || target.includes(n))) return sec;
	}
	return null;
}

const DOMAIN_RULES = Object.freeze([
	{
		id: 'scientific_advice_instructions',
		mainName: 'الدعوة والتربية',
		mainNames: ['الدعوة والتربية', 'الدعوة و التربية'],
		subName: 'التربية والتعليم',
		subNames: ['التربية والتعليم', 'التعليم والتربية', 'التربية', 'التعليم'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		confidence: 0.96,
		matchPhrases: [
			'النصائح حول التعليمات العلمية للسادة',
			'النصائح حول التعليمات العلمية السادة',
			'التعليمات العلمية للسادة',
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'تعليمات علمية',
			'نصائح علمية'
		]
	}
]);

function matchDomainRule(bookMeta) {
	const hay = haystackFromBook(bookMeta);
	for (const rule of DOMAIN_RULES) {
		if (rule.matchPhrases.some((phrase) => hay.includes(normalizeArabic(phrase)))) {
			return rule;
		}
	}
	return null;
}

function decisionFromRule(sections, bookMeta, rule) {
	const main = findMainByNames(sections.tree, rule.mainNames);
	const reasoning =
		`قاعدة تصنيف مخصّصة: "${bookMeta?.title || ''}" يناسب ${rule.mainName} > ${rule.subName} > ${rule.secondaryName}.`;

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
			reasoning,
			method: `rule:${rule.id}`
		};
	}

	const sub = findSubByNames(main, rule.subNames);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: rule.confidence,
			reasoning,
			method: `rule:${rule.id}`
		};
	}

	const secondary = findSecondaryByName(sub, rule.secondaryName);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: rule.confidence,
			reasoning,
			method: `rule:${rule.id}`
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: rule.secondaryName,
		confidence: rule.confidence,
		reasoning,
		method: `rule:${rule.id}`
	};
}

function cleanSectionName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/\s+/g, ' ')
		.replace(/[|｜].*$/u, '')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function inferSubName(bookMeta) {
	const hint = (bookMeta?.categoryHints || []).find(Boolean);
	return cleanSectionName(hint, 'كتب عامة');
}

function inferSecondaryName(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && tokensOf(stem).length >= 2) return cleanSectionName(stem, 'كتب عامة');
	const hint = (bookMeta?.categoryHints || []).find(Boolean);
	return cleanSectionName(hint, 'كتب عامة');
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

	const domainRule = matchDomainRule(bookMeta);
	if (domainRule) {
		return decisionFromRule(sections, bookMeta, domainRule);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: inferSubName(bookMeta),
			newSecondaryName: inferSecondaryName(bookMeta),
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة مناسبة — إنشاء مسار ثلاثي مستقلّ.',
			method: 'heuristic'
		};
	}

	if (sug.mainScore <= 0 && sug.subScore <= 0) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: inferSubName(bookMeta),
			newSecondaryName: inferSecondaryName(bookMeta),
			confidence: 0.2,
			reasoning: 'لا يوجد قسم رئيسي أو فرعي مناسب بدرجة كافية — إنشاء مسار ثلاثي جديد.',
			method: 'heuristic'
		};
	}

	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: inferSecondaryName(bookMeta),
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
			newSecondaryName: inferSecondaryName(bookMeta),
			confidence: Math.max(0.35, sug.confidence - 0.1),
			reasoning: `${sug.reasoning} — لم يوجد قسم ثانوي دقيق، سيتم إنشاء مستوى ثالث مستقلّ.`,
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
