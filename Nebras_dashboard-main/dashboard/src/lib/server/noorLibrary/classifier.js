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

const DEFAULT_SECONDARY_NAME = 'كتب عامة';

const SEMANTIC_PROFILES = Object.freeze([
	{
		id: 'education_advice',
		targetMain: 'الدعوة والتربية',
		targetSub: 'التربية والتعليم',
		targetSecondary: 'النصائح والتوجيهات العلمية',
		mainKeywords: ['دعوه', 'تربيه', 'تعليم'],
		subKeywords: ['تربيه', 'تعليم', 'ارشاد'],
		secondaryKeywords: ['نصائح', 'توجيهات', 'تعليمات', 'علميه', 'ارشادات'],
		matchAny: ['نصائح', 'نصيحه', 'توجيهات', 'ارشادات', 'تعليمات'],
		matchAllAny: [['علميه', 'تعليم', 'تربيه', 'الساده']]
	},
	{
		id: 'fiqh',
		targetMain: 'الفقه الإسلامي',
		targetSub: 'الفقه وأصوله',
		targetSecondary: 'مسائل فقهية',
		mainKeywords: ['فقه', 'فقهي', 'فقهيه'],
		subKeywords: ['فقه', 'اصول'],
		secondaryKeywords: ['مسائل', 'احكام', 'فقهيه'],
		matchAny: ['فقه', 'فقهي', 'فقهيه', 'احكام', 'عبادات', 'معاملات']
	},
	{
		id: 'aqeedah',
		targetMain: 'العقيدة',
		targetSub: 'العقيدة الإسلامية',
		targetSecondary: 'مسائل عقدية',
		mainKeywords: ['عقيده', 'توحيد', 'ايمان'],
		subKeywords: ['عقيده', 'توحيد'],
		secondaryKeywords: ['مسائل', 'عقديه', 'ايمان'],
		matchAny: ['عقيده', 'عقديه', 'توحيد', 'ايمان', 'اسماء', 'صفات']
	},
	{
		id: 'history',
		targetMain: 'التاريخ والسير',
		targetSub: 'التاريخ الإسلامي',
		targetSecondary: 'كتب تاريخية',
		mainKeywords: ['تاريخ', 'سير', 'تراجم'],
		subKeywords: ['تاريخ', 'اسلامي', 'سيره'],
		secondaryKeywords: ['تاريخيه', 'وقائع', 'احداث'],
		matchAny: ['تاريخ', 'تاريخيه', 'سيره', 'سير', 'تراجم', 'وقائع']
	},
	{
		id: 'adab',
		targetMain: 'الآداب والأخلاق',
		targetSub: 'الآداب العامة',
		targetSecondary: 'كتب أدبية',
		mainKeywords: ['اداب', 'اخلاق', 'ادب'],
		subKeywords: ['اداب', 'ادب'],
		secondaryKeywords: ['ادبيه', 'نصوص', 'بلاغه'],
		matchAny: ['ادب', 'اداب', 'ادبيه', 'بلاغه', 'شعر', 'نثر']
	}
]);

function containsAny(haystack, words) {
	return (words || []).some((word) => haystack.includes(normalizeArabic(word)));
}

function matchesProfile(profile, bookMeta) {
	const hay = haystackForReuse(bookMeta);
	if (!containsAny(hay, profile.matchAny)) return false;
	for (const group of profile.matchAllAny || []) {
		if (!containsAny(hay, group)) return false;
	}
	return true;
}

function scoreNodeForTarget(node, targetName, keywords = []) {
	const n = normalizeArabic(node?.name || '');
	const target = normalizeArabic(targetName);
	if (!n) return 0;
	if (n === target) return 100;
	if (n.includes(target) || target.includes(n)) return 70;
	let score = 0;
	for (const kw of keywords) {
		const k = normalizeArabic(kw);
		if (k && n.includes(k)) score += 12;
	}
	const nodeTokens = new Set(n.split(' ').filter((w) => w.length >= 3));
	const targetTokens = new Set(target.split(' ').filter((w) => w.length >= 3));
	score += tokenSetsOverlapRatio(nodeTokens, targetTokens) * 40;
	return score;
}

function pickNode(nodes, targetName, keywords = [], minScore = 12) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNodeForTarget(node, targetName, keywords);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? best : null;
}

function deriveSubName(bookMeta) {
	const hint = Array.isArray(bookMeta?.categoryHints) ? String(bookMeta.categoryHints[0] || '').trim() : '';
	return hint.slice(0, 60) || 'كتب عامة';
}

function deriveSecondaryName(bookMeta, preferred = '') {
	const p = String(preferred || '').trim();
	if (p) return p.slice(0, 80);
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	return (stem || DEFAULT_SECONDARY_NAME).slice(0, 80);
}

function decisionFromTarget(sections, profile, bookMeta) {
	const main = pickNode(sections.tree, profile.targetMain, profile.mainKeywords, 10);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: profile.targetMain,
			newSubName: profile.targetSub,
			newSecondaryName: profile.targetSecondary,
			confidence: 0.92,
			reasoning: `تصنيف دلالي (${profile.id}) — إنشاء مسار كامل مناسب.`,
			method: 'semantic'
		};
	}

	const sub = pickNode(main.children || [], profile.targetSub, profile.subKeywords, 10);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: profile.targetSub,
			newSecondaryName: profile.targetSecondary,
			confidence: 0.91,
			reasoning: `تصنيف دلالي (${profile.id}) — إنشاء قسم فرعي داخل "${main.name}".`,
			method: 'semantic'
		};
	}

	const secondary =
		pickNode(sub.children || [], profile.targetSecondary, profile.secondaryKeywords, 10) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: profile.targetSecondary,
			minScore: 8
		});
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: 0.94,
			reasoning: `تصنيف دلالي (${profile.id}) — استعمال المسار المناسب الموجود.`,
			method: 'semantic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: profile.targetSecondary,
		confidence: 0.9,
		reasoning: `تصنيف دلالي (${profile.id}) — إنشاء قسم ثانوي تحت "${sub.name}".`,
		method: 'semantic'
	};
}

function classifySemantic(sections, bookMeta) {
	for (const profile of SEMANTIC_PROFILES) {
		if (matchesProfile(profile, bookMeta)) {
			return decisionFromTarget(sections, profile, bookMeta);
		}
	}
	return null;
}

function firstMainWithAnySub(sections) {
	for (const main of sections.tree || []) {
		if ((main.children || []).length > 0) return main;
	}
	return sections.tree?.[0] || null;
}

function completeDecisionWithSecondary(sections, decision, bookMeta) {
	const mainId = decision.mainId ? String(decision.mainId) : '';
	if (!mainId) return decision;

	if (!decision.subId) {
		return {
			...decision,
			kind: 'create_sub',
			mainId,
			newSubName: decision.newSubName || deriveSubName(bookMeta),
			newSecondaryName: deriveSecondaryName(bookMeta, decision.newSecondaryName),
			reasoning: `${decision.reasoning || 'تصنيف محلي'} — إنشاء قسم فرعي وثانوي لإكمال الهيكل الثلاثي.`
		};
	}

	const subId = String(decision.subId);
	if (decision.secondaryId) {
		return { ...decision, mainId, subId, secondaryId: String(decision.secondaryId) };
	}

	const proposed = deriveSecondaryName(bookMeta, decision.newSecondaryName);
	const reused = pickReuseSecondary(sections, subId, bookMeta, {
		proposedNewName: proposed,
		minScore: 8
	});
	if (reused) {
		return {
			...decision,
			kind: 'existing',
			mainId,
			subId,
			secondaryId: reused.id,
			reasoning: `${decision.reasoning || 'تصنيف محلي'} — استعمال قسم ثانوي موجود قريب من عنوان الكتاب.`
		};
	}

	return {
		...decision,
		kind: 'create_secondary',
		mainId,
		subId,
		newSecondaryName: proposed,
		reasoning: `${decision.reasoning || 'تصنيف محلي'} — إنشاء قسم ثانوي لإكمال الهيكل الثلاثي.`
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

	const semantic = classifySemantic(sections, bookMeta);
	const sug = semantic || classifyHeuristic(sections, bookMeta);
	const completed = sug
		? completeDecisionWithSecondary(sections, sug, bookMeta)
		: completeDecisionWithSecondary(
				sections,
				{
					kind: 'existing',
					mainId: firstMainWithAnySub(sections)?.id || sections.tree[0].id,
					subId: firstMainWithAnySub(sections)?.children?.[0]?.id || '',
					secondaryId: null,
					confidence: 0.1,
					reasoning: 'لم تُعثَر مطابقة. تمّ اختيار أوّل قسم متاح مع إنشاء المستوى الناقص.',
					method: 'heuristic'
				},
				bookMeta
			);
	const validation = completed?.kind === 'existing'
		? validateHierarchyPath(
				{ mainId: completed.mainId, subId: completed.subId, secondaryId: completed.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: `${completed?.kind || 'classification'}_requires_section_creation` };
	return {
		suggested: completed,
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
	if (sug) return completeDecisionWithSecondary(sections, sug, bookMeta);

	const fallbackMain = firstMainWithAnySub(sections);
	return completeDecisionWithSecondary(
		sections,
		{
			kind: 'existing',
			mainId: fallbackMain?.id || sections.tree[0].id,
			subId: fallbackMain?.children?.[0]?.id || '',
			secondaryId: null,
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — أوّل مسار متاح.',
			method: 'heuristic'
		},
		bookMeta
	);
}
