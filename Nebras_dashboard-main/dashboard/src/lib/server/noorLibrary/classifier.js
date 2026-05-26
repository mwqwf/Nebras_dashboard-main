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
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

const DEFAULT_NOOR_MAIN_NAME = 'مكتبة نور';
const DEFAULT_NOOR_SUB_NAME = 'كتب عامة';
const DEFAULT_NOOR_SECONDARY_NAME = 'كتب عامة';

const TOPIC_ROUTES = Object.freeze([
	{
		id: 'scientific_advice_education',
		requiredGroups: [
			['نصائح', 'نصيحة', 'وصايا', 'توجيهات', 'ارشادات', 'تعليمات'],
			['علمية', 'العلمية', 'التعليم', 'تعليمية', 'طلب العلم', 'السادة', 'الساده']
		],
		mainCandidates: ['الدعوة والتربية', 'التربية والتعليم', 'التربية'],
		subCandidates: ['التربية والتعليم', 'التعليم', 'التربية العلمية', 'آداب طالب العلم'],
		secondaryCandidates: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'النصائح حول التعليمات العلمية للسادة'
		],
		newMainName: 'الدعوة والتربية',
		newSubName: 'التربية والتعليم',
		newSecondaryName: 'النصائح والتوجيهات العلمية',
		confidence: 0.98
	},
	{
		id: 'fiqh',
		requiredGroups: [['فقه', 'فقهي', 'فقهية', 'اصول الفقه', 'احكام', 'الحلال', 'الحرام']],
		mainCandidates: ['الفقه الإسلامي', 'الفقه وأصوله', 'كتب الفقه وأصوله'],
		subCandidates: ['الفقه', 'أصول الفقه', 'فقه العبادات', 'فقه المعاملات'],
		secondaryCandidates: ['مسائل فقهية', 'دراسات فقهية'],
		newMainName: 'الفقه الإسلامي',
		newSubName: 'الفقه وأصوله',
		newSecondaryName: 'دراسات فقهية',
		confidence: 0.9
	},
	{
		id: 'aqeedah',
		requiredGroups: [['عقيدة', 'العقيدة', 'توحيد', 'الايمان', 'ايمان', 'اسماء الله', 'الصفات']],
		mainCandidates: ['العقيدة الإسلامية', 'العقيدة والتوحيد', 'العقيدة'],
		subCandidates: ['العقيدة والتوحيد', 'التوحيد', 'الإيمان', 'أسماء الله وصفاته'],
		secondaryCandidates: ['كتب العقيدة', 'مسائل العقيدة'],
		newMainName: 'العقيدة الإسلامية',
		newSubName: 'العقيدة والتوحيد',
		newSecondaryName: 'كتب العقيدة',
		confidence: 0.9
	},
	{
		id: 'history',
		requiredGroups: [['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'فتوح', 'خلافة']],
		mainCandidates: ['التاريخ والسير', 'التاريخ الإسلامي', 'السيرة والتاريخ'],
		subCandidates: ['التاريخ الإسلامي', 'السيرة النبوية', 'التراجم والطبقات'],
		secondaryCandidates: ['كتب التاريخ', 'دراسات تاريخية'],
		newMainName: 'التاريخ والسير',
		newSubName: 'التاريخ الإسلامي',
		newSecondaryName: 'دراسات تاريخية',
		confidence: 0.9
	},
	{
		id: 'adab_akhlaq',
		requiredGroups: [['اداب', 'ادب', 'اخلاق', 'الاخلاق', 'تزكية', 'الزهد', 'رقائق']],
		mainCandidates: ['الآداب والأخلاق', 'التزكية والأخلاق', 'الأخلاق والآداب'],
		subCandidates: ['الآداب والأخلاق', 'التزكية', 'الرقائق والزهد'],
		secondaryCandidates: ['كتب الآداب', 'كتب الأخلاق'],
		newMainName: 'الآداب والأخلاق',
		newSubName: 'الآداب والأخلاق',
		newSecondaryName: 'كتب الآداب والأخلاق',
		confidence: 0.9
	}
]);

function haystackForBook(bookMeta) {
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

function includesAny(haystack, terms) {
	return terms.some((term) => haystack.includes(normalizeArabic(term)));
}

function routeMatches(route, bookMeta) {
	const haystack = haystackForBook(bookMeta);
	if (!haystack) return false;
	return route.requiredGroups.every((terms) => includesAny(haystack, terms));
}

function candidateNameMatches(name, candidate) {
	const n = normalizeArabic(name);
	const c = normalizeArabic(candidate);
	if (!n || !c) return false;
	return n === c || n.includes(c) || c.includes(n);
}

function findNodeByCandidates(nodes, candidates) {
	for (const candidate of candidates || []) {
		const found = (nodes || []).find((node) => candidateNameMatches(node?.name, candidate));
		if (found) return found;
	}
	return null;
}

function findSubWithParentByCandidates(tree, candidates) {
	for (const main of tree || []) {
		const sub = findNodeByCandidates(main.children || [], candidates);
		if (sub) return { main, sub };
	}
	return null;
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

function proposeSecondaryName(bookMeta, fallback = DEFAULT_NOOR_SECONDARY_NAME) {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	const cleanedHint = hints
		.map((h) => String(h || '').trim())
		.find((h) => h.length >= 4 && h.length <= 70 && !/^(كتب|books)$/i.test(h));
	if (cleanedHint) return cleanedHint;

	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4 && stem.length <= 70) return stem;

	return fallback;
}

function routeDecision(sections, route, bookMeta) {
	let main = findNodeByCandidates(sections.tree, route.mainCandidates);
	let sub = null;

	if (main) {
		sub = findNodeByCandidates(main.children || [], route.subCandidates);
	} else {
		const bySub = findSubWithParentByCandidates(sections.tree, route.subCandidates);
		if (bySub) {
			main = bySub.main;
			sub = bySub.sub;
		}
	}

	const secondaryName = route.newSecondaryName || proposeSecondaryName(bookMeta, DEFAULT_NOOR_SECONDARY_NAME);

	if (!main) {
		return {
			kind: 'create_main',
			newMainName: route.newMainName,
			newSubName: route.newSubName,
			newSecondaryName: secondaryName,
			confidence: route.confidence,
			reasoning: `قاعدة موضوعية (${route.id}) — إنشاء مسار ثلاثي كامل دون خلط موضوعي.`,
			method: 'topic_route'
		};
	}

	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: route.newSubName,
			newSecondaryName: secondaryName,
			confidence: route.confidence,
			reasoning: `قاعدة موضوعية (${route.id}) — القسم الرئيسي مناسب والقسم الفرعي مفقود.`,
			method: 'topic_route'
		};
	}

	const directSecondary = findNodeByCandidates(sub.children || [], route.secondaryCandidates);
	if (directSecondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(directSecondary.id),
			confidence: route.confidence,
			reasoning: `قاعدة موضوعية (${route.id}) — استعمال القسم الثانوي المطابق.`,
			method: 'topic_route'
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 8
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: Math.min(route.confidence, 0.93),
			reasoning: `قاعدة موضوعية (${route.id}) — إعادة استخدام قسم ثانوي قريب: ${reusable.name}.`,
			method: 'topic_route'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: secondaryName,
		confidence: route.confidence,
		reasoning: `قاعدة موضوعية (${route.id}) — إنشاء قسم ثانوي مناسب تحت المسار الموجود.`,
		method: 'topic_route'
	};
}

function classifyByTopicRoute(sections, bookMeta) {
	for (const route of TOPIC_ROUTES) {
		if (routeMatches(route, bookMeta)) {
			return routeDecision(sections, route, bookMeta);
		}
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

	const routed = classifyByTopicRoute(sections, bookMeta);
	if (routed) {
		const validation = routed.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: routed.mainId, subId: routed.subId, secondaryId: routed.secondaryId },
					sections.index
				)
			: { valid: true, reason: 'will_create_missing_section' };
		return {
			suggested: {
				mainId: routed.mainId || null,
				subId: routed.subId || null,
				secondaryId: routed.secondaryId || null,
				confidence: routed.confidence,
				reasoning: routed.reasoning,
				method: routed.method,
				create: routed.kind !== 'existing'
					? {
							kind: routed.kind,
							mainName: routed.newMainName || null,
							subName: routed.newSubName || null,
							secondaryName: routed.newSecondaryName || null
						}
					: null
			},
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

	const routed = classifyByTopicRoute(sections, bookMeta);
	if (routed) return routed;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			newMainName: DEFAULT_NOOR_MAIN_NAME,
			newSubName: DEFAULT_NOOR_SUB_NAME,
			newSecondaryName: proposeSecondaryName(bookMeta),
			confidence: 0.35,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة آمنة — إنشاء مسار Noor مستقل بدل خلط الموضوعات.',
			method: 'safe_fallback'
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
	return {
		kind: secId ? 'existing' : 'create_secondary',
		mainId: String(sug.mainId),
		subId: String(sug.subId),
		...(secId ? { secondaryId: secId } : { newSecondaryName: proposeSecondaryName(bookMeta) }),
		confidence: sug.confidence,
		reasoning: secId
			? sug.reasoning
			: `${sug.reasoning} — لم يوجد قسم ثانوي مناسب، سننشئ ثانوياً للحفاظ على الهيكل الثلاثي.`,
		method: 'heuristic'
	};
}
