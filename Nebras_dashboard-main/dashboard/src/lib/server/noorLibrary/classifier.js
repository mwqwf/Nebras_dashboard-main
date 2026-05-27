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
	if (!bestSub || bestSubScore <= 0) return null;

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

function findMainByName(tree, names) {
	const wanted = new Set(names.map(normalizeArabic).filter(Boolean));
	for (const main of tree || []) {
		if (wanted.has(normalizeArabic(main?.name))) return main;
	}
	return null;
}

function findSubByName(main, names) {
	const wanted = new Set(names.map(normalizeArabic).filter(Boolean));
	for (const sub of main?.children || []) {
		if (wanted.has(normalizeArabic(sub?.name))) return sub;
	}
	return null;
}

function findSecondaryByName(sub, names) {
	const wanted = new Set(names.map(normalizeArabic).filter(Boolean));
	for (const sec of sub?.children || []) {
		if (wanted.has(normalizeArabic(sec?.name))) return sec;
	}
	return null;
}

function metadataHaystack(bookMeta) {
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

function titleStemForSectionName(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4) return stem.slice(0, 80);
	const hint = String(bookMeta?.categoryHints?.[0] || '').trim();
	if (hint) return hint.slice(0, 80);
	return 'كتب عامة';
}

/**
 * قواعد قليلة وحذرة تمنع خلط المجالات المعرفية عند غياب تطابق كافٍ في
 * الشجرة. القاعدة الأولى تغطي طلب "النصائح حول التعليمات العلمية للسادة".
 */
const SUBJECT_PATH_RULES = Object.freeze([
	{
		id: 'scientific-advice',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم والتربية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: ['النصائح والتوجيهات العلمية', 'التوجيهات العلمية', 'النصائح العلمية'],
		matches(hay) {
			return (
				hay.includes('النصائح حول التعليمات العلميه للساده') ||
				(hay.includes('النصائح') &&
					(hay.includes('التعليمات العلميه') || hay.includes('التوجيهات العلميه'))) ||
				(hay.includes('الساده') && hay.includes('التعليمات العلميه'))
			);
		}
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه الإسلامي', 'الفقه الاسلامي', 'الفقه', 'الفقه وأصوله'],
		subName: 'الفقه العام',
		subAliases: ['الفقه العام', 'كتب الفقه', 'مسائل فقهية'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'كتب الفقه'],
		matches(hay) {
			return /\b(فقه|فقهي|فقهيه|فتاوي|فتاوى|احكام|عبادات|معاملات)\b/u.test(hay);
		}
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيده', 'العقيدة الإسلامية', 'العقيده الاسلاميه'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'العقيده الاسلاميه', 'كتب العقيدة'],
		secondaryName: 'كتب العقيدة',
		secondaryAliases: ['كتب العقيدة', 'كتب العقيده'],
		matches(hay) {
			return /\b(عقيده|توحيد|ايمان|اسماء الله|الاسماء والصفات|الفرق)\b/u.test(hay);
		}
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ', 'السيرة والتاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'التاريخ الاسلامي', 'السير والتراجم'],
		secondaryName: 'كتب التاريخ والسير',
		secondaryAliases: ['كتب التاريخ والسير', 'كتب التاريخ', 'السير والتراجم'],
		matches(hay) {
			return /\b(تاريخ|سيره|السيره|تراجم|طبقات|مغازي|خلفاء|فتوح)\b/u.test(hay);
		}
	},
	{
		id: 'literature',
		mainName: 'اللغة والأدب',
		mainAliases: ['اللغة والأدب', 'اللغه والادب', 'الأدب', 'الادب'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الادب العربي', 'كتب الأدب'],
		secondaryName: 'كتب الأدب',
		secondaryAliases: ['كتب الأدب', 'كتب الادب'],
		matches(hay) {
			return /\b(ادب|ادبي|شعر|بلاغه|نثر|لغه عربيه|نحو|صرف)\b/u.test(hay);
		}
	}
]);

function pickSubjectPath(bookMeta) {
	const hay = metadataHaystack(bookMeta);
	return SUBJECT_PATH_RULES.find((rule) => rule.matches(hay)) || null;
}

function decisionForSubjectPath(sections, bookMeta, rule) {
	const main = findMainByName(sections.tree, [rule.mainName, ...rule.mainAliases]);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.92,
			reasoning: `قاعدة تصنيف محفوظة: ${rule.id} — إنشاء المسار الكامل.`,
			method: 'rule'
		};
	}

	const sub = findSubByName(main, [rule.subName, ...rule.subAliases]);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.92,
			reasoning: `قاعدة تصنيف محفوظة: ${rule.id} — إنشاء فرع مناسب تحت القسم الرئيسي.`,
			method: 'rule'
		};
	}

	const secondary = findSecondaryByName(sub, [rule.secondaryName, ...rule.secondaryAliases]);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: 0.95,
			reasoning: `قاعدة تصنيف محفوظة: ${rule.id} — استخدام قسم ثانوي موجود.`,
			method: 'rule'
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: rule.secondaryName,
		minScore: 7
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: 0.9,
			reasoning: `قاعدة تصنيف محفوظة: ${rule.id} — إعادة استخدام قسم ثانوي قريب: ${reusable.name}.`,
			method: 'rule'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: rule.secondaryName,
		confidence: 0.92,
		reasoning: `قاعدة تصنيف محفوظة: ${rule.id} — إنشاء قسم ثانوي مناسب.`,
		method: 'rule'
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
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const subjectRule = pickSubjectPath(bookMeta);
	if (subjectRule) {
		return decisionForSubjectPath(sections, bookMeta, subjectRule);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const fallback = pickSubjectPath({ ...bookMeta, categoryHints: ['كتب عامة'] });
		if (fallback) return decisionForSubjectPath(sections, bookMeta, fallback);
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName: 'كتب عامة',
			newSecondaryName: titleStemForSectionName(bookMeta),
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة موثوقة — إنشاء مسار عام بدلاً من خلطه بقسم غير مناسب.',
			method: 'heuristic'
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
			newSecondaryName: titleStemForSectionName(bookMeta),
			confidence: Math.max(0.45, sug.confidence - 0.1),
			reasoning: `${sug.reasoning} — إنشاء قسم ثانوي لحفظ التسلسل الرئيسي > الفرعي > الثانوي > المحتوى.`,
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
