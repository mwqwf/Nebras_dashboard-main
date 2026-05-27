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

const ADVICE_EDUCATION_PATH = Object.freeze({
	mainName: 'الدعوة والتربية',
	subName: 'التربية والتعليم',
	secondaryName: 'النصائح والتوجيهات العلمية'
});

function textHaystack(bookMeta) {
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

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function hasAdviceEducationSignature(bookMeta) {
	const hay = textHaystack(bookMeta);
	if (!hay) return false;
	return (
		(hay.includes('النصائح') || hay.includes('نصائح')) &&
		(hay.includes('التعليمات') || hay.includes('تعليمات') || hay.includes('تعليميه')) &&
		(hay.includes('العلميه') || hay.includes('علميه') || hay.includes('الساده'))
	);
}

function findNodeByNames(nodes, names) {
	const targets = new Set(names.map(normalizeArabic).filter(Boolean));
	for (const node of nodes || []) {
		if (targets.has(normalizeArabic(node?.name || ''))) return node;
	}
	return null;
}

function sanitizeSectionName(raw) {
	let s = String(raw || '').trim();
	if (!s) return '';
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	s = s.replace(/^كتاب\s+/u, '').trim();
	if (s.length > 48) s = s.slice(0, 48).trim();
	return s;
}

function pickBestHint(bookMeta, fallback = 'كتب عامة') {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint);
		if (clean && clean.length >= 2) return clean;
	}
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	return stem || fallback;
}

function proposedSecondaryName(bookMeta) {
	if (hasAdviceEducationSignature(bookMeta)) return ADVICE_EDUCATION_PATH.secondaryName;
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	return stem || pickBestHint(bookMeta, 'مواد عامة');
}

function makeAdviceEducationDecision(sections, bookMeta) {
	if (!hasAdviceEducationSignature(bookMeta)) return null;

	const main = findNodeByNames(sections.tree, [
		ADVICE_EDUCATION_PATH.mainName,
		'التربية والدعوة'
	]);

	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: ADVICE_EDUCATION_PATH.mainName,
			newSubName: ADVICE_EDUCATION_PATH.subName,
			newSecondaryName: ADVICE_EDUCATION_PATH.secondaryName,
			confidence: 0.96,
			reasoning: 'قاعدة مخصّصة: كتاب النصائح/التعليمات العلمية يُصنَّف تحت الدعوة والتربية ← التربية والتعليم.',
			method: 'heuristic'
		};
	}

	const sub = findNodeByNames(main.children || [], [
		ADVICE_EDUCATION_PATH.subName,
		'التعليم والتربية',
		'التربية'
	]);

	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: ADVICE_EDUCATION_PATH.subName,
			newSecondaryName: ADVICE_EDUCATION_PATH.secondaryName,
			confidence: 0.94,
			reasoning: `قاعدة مخصّصة: وُجد "${main.name}" وسينشأ فرع "${ADVICE_EDUCATION_PATH.subName}".`,
			method: 'heuristic'
		};
	}

	const existingSecondary =
		findNodeByNames(sub.children || [], [
			ADVICE_EDUCATION_PATH.secondaryName,
			'نصائح وتوجيهات علمية',
			'النصائح العلمية',
			'التوجيهات العلمية'
		]) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: ADVICE_EDUCATION_PATH.secondaryName,
			minScore: 5
		});

	if (existingSecondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(existingSecondary.id),
			confidence: 0.97,
			reasoning: `قاعدة مخصّصة: المسار الأنسب موجود ${main.name} ← ${sub.name} ← ${existingSecondary.name}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: ADVICE_EDUCATION_PATH.secondaryName,
		confidence: 0.95,
		reasoning: `قاعدة مخصّصة: إنشاء قسم ثانوي "${ADVICE_EDUCATION_PATH.secondaryName}" تحت "${sub.name}".`,
		method: 'heuristic'
	};
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = textHaystack(bookMeta);
	const tokens = tokensOf(haystack);

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
		const subName = pickBestHint(bookMeta, ADVICE_EDUCATION_PATH.subName);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: hasAdviceEducationSignature(bookMeta)
				? ADVICE_EDUCATION_PATH.mainName
				: 'مكتبة نور',
			newSubName: hasAdviceEducationSignature(bookMeta)
				? ADVICE_EDUCATION_PATH.subName
				: subName,
			newSecondaryName: proposedSecondaryName(bookMeta),
			confidence: 0.35,
			reasoning: 'لا توجد أقسام مناسبة — إنشاء مسار كامل وفق الهيكل الثلاثي.',
			method: 'heuristic'
		};
	}

	const adviceDecision = makeAdviceEducationDecision(sections, bookMeta);
	if (adviceDecision) return adviceDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug || Number(sug.mainScore || 0) <= 0) {
		const subName = pickBestHint(bookMeta, 'كتب عامة');
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: subName,
			newSecondaryName: proposedSecondaryName(bookMeta),
			confidence: 0.3,
			reasoning: 'لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار كامل بدلاً من خلط التصنيفات.',
			method: 'heuristic'
		};
	}

	if (!sug.subId || Number(sug.subScore || 0) <= 0) {
		return {
			kind: 'create_sub',
			mainId: String(sug.mainId),
			subId: null,
			secondaryId: null,
			newSubName: pickBestHint(bookMeta, 'كتب عامة'),
			newSecondaryName: proposedSecondaryName(bookMeta),
			confidence: Math.min(0.45 + Number(sug.mainScore || 0) * 0.05, 0.75),
			reasoning: 'وُجد قسم رئيسي مناسب، لكن لا يوجد قسم فرعي ملائم — إنشاء فرع جديد.',
			method: 'heuristic'
		};
	}

	let secId = sug.secondaryId && Number(sug.secondaryScore || 0) > 0
		? String(sug.secondaryId)
		: null;
	const proposedSecName = proposedSecondaryName(bookMeta);
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: proposedSecName,
			minScore: 7
		});
		if (autoSec) secId = autoSec.id;
	}
	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: null,
			newSecondaryName: proposedSecName,
			confidence: Math.min(0.5 + Number(sug.mainScore || 0) * 0.05 + Number(sug.subScore || 0) * 0.05, 0.82),
			reasoning: 'وُجد قسم رئيسي وفرعي مناسبان، ولا يوجد قسم ثانوي دقيق — إنشاء قسم ثانوي قبل إضافة الكتاب.',
			method: 'heuristic'
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
