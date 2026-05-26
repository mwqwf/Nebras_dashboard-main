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

function sanitizeSectionName(raw, fallback = 'عام') {
	let s = String(raw || '').trim();
	if (!s) return fallback;
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s || fallback;
}

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

const SEMANTIC_ROUTES = Object.freeze([
	{
		main: 'الدعوة والتربية',
		sub: 'التربية والتعليم',
		secondary: 'النصائح والتوجيهات العلمية',
		terms: [
			'نصائح',
			'نصيحة',
			'توجيه',
			'توجيهات',
			'تعليمات',
			'تعليمية',
			'التربية',
			'التعليم',
			'طلب العلم',
			'طالب العلم',
			'آداب طالب العلم',
			'إرشاد'
		],
		reasoning: 'تصنيف دلالي: محتوى نصائح/توجيهات علمية يناسب التربية والتعليم.'
	},
	{
		main: 'الفقه الإسلامي',
		sub: 'الفقه وأصوله',
		secondary: 'المسائل الفقهية',
		terms: [
			'فقه',
			'فقهي',
			'أصول الفقه',
			'احكام',
			'أحكام',
			'العبادات',
			'المعاملات',
			'الطهارة',
			'الصلاة',
			'الزكاة',
			'الصيام',
			'الحج'
		],
		reasoning: 'تصنيف دلالي: إشارات فقهية واضحة.'
	},
	{
		main: 'العقيدة',
		sub: 'العقيدة الإسلامية',
		secondary: 'مسائل العقيدة',
		terms: ['عقيدة', 'توحيد', 'ايمان', 'إيمان', 'اسماء الله', 'أسماء الله', 'الصفات'],
		reasoning: 'تصنيف دلالي: إشارات عقدية واضحة.'
	},
	{
		main: 'التاريخ والسير',
		sub: 'التاريخ الإسلامي',
		secondary: 'كتب التاريخ الإسلامي',
		terms: ['تاريخ', 'تراجم', 'سير', 'سيرة', 'الخلفاء', 'الدولة', 'فتوح'],
		reasoning: 'تصنيف دلالي: إشارات تاريخية واضحة.'
	},
	{
		main: 'الأدب واللغة',
		sub: 'الأدب العربي',
		secondary: 'كتب الأدب',
		terms: ['أدب', 'ادب', 'شعر', 'نثر', 'بلاغة', 'قصائد', 'ديوان'],
		reasoning: 'تصنيف دلالي: إشارات أدبية واضحة.'
	}
]);

function findBySectionName(items, name) {
	const target = normalizeArabic(name);
	if (!target) return null;
	let loose = null;
	for (const item of items || []) {
		const n = normalizeArabic(item?.name || '');
		if (n === target) return item;
		if (!loose && n && (n.includes(target) || target.includes(n))) loose = item;
	}
	return loose;
}

function resolveSemanticRoute(sections, route, confidence = 0.86) {
	const main = findBySectionName(sections.tree || [], route.main);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: route.main,
			newSubName: route.sub,
			newSecondaryName: route.secondary,
			confidence,
			reasoning: route.reasoning,
			method: 'semantic'
		};
	}

	const sub = findBySectionName(main.children || [], route.sub);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: route.sub,
			newSecondaryName: route.secondary,
			confidence,
			reasoning: route.reasoning,
			method: 'semantic'
		};
	}

	const secondary = findBySectionName(sub.children || [], route.secondary);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence,
			reasoning: route.reasoning,
			method: 'semantic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: route.secondary,
		confidence,
		reasoning: route.reasoning,
		method: 'semantic'
	};
}

function classifySemantic(sections, bookMeta) {
	const haystack = semanticHaystack(bookMeta);
	if (!haystack) return null;
	let best = null;
	let bestScore = 0;
	for (const route of SEMANTIC_ROUTES) {
		let score = 0;
		for (const term of route.terms) {
			if (haystack.includes(normalizeArabic(term))) score += 1;
		}
		if (score > bestScore) {
			best = route;
			bestScore = score;
		}
	}
	if (!best || bestScore === 0) return null;
	return resolveSemanticRoute(sections, best, Math.min(0.78 + bestScore * 0.03, 0.94));
}

function pickCategoryHint(bookMeta, fallback = 'كتب عامة') {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint, '');
		if (clean && clean.length >= 2) return clean;
	}
	return fallback;
}

function proposeSecondaryName(bookMeta, fallback = 'عام') {
	const hint = pickCategoryHint(bookMeta, '');
	if (hint) return hint;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	return sanitizeSectionName(stem, fallback);
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

	const semantic = classifySemantic(sections, bookMeta);
	if (semantic && semantic.kind === 'existing') {
		const validation = validateHierarchyPath(
			{
				mainId: semantic.mainId,
				subId: semantic.subId,
				secondaryId: semantic.secondaryId
			},
			sections.index
		);
		return {
			suggested: semantic,
			alternatives: [],
			validation
		};
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

	const semantic = classifySemantic(sections, bookMeta);
	if (semantic) return semantic;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'المكتبة',
			newSubName: pickCategoryHint(bookMeta, 'كتب عامة'),
			newSecondaryName: proposeSecondaryName(bookMeta, 'كتب عامة'),
			confidence: 0.25,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — إنشاء مسار ثلاثي عام.',
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
			secondaryId: null,
			newSecondaryName: proposeSecondaryName(bookMeta, 'عام'),
			confidence: Math.max(0.35, sug.confidence - 0.1),
			reasoning: `${sug.reasoning} — لا يوجد قسم ثانوي مناسب، سيتم إنشاء قسم ثانوي قبل الرفع.`,
			method: sug.method || 'heuristic'
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
