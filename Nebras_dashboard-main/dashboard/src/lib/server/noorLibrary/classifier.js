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

const SEMANTIC_PROFILES = Object.freeze([
	{
		id: 'scientific_guidance_education',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والتعليم', 'التربية', 'الدعوة'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم', 'التربية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'التعليمات العلمية'
		],
		keywords: ['نصائح', 'النصائح', 'توجيهات', 'تعليمات', 'التعليمات', 'علمية', 'علميه', 'تعليم', 'تربية', 'التربية', 'السادة'],
		requiredAny: ['نصائح', 'النصائح', 'توجيهات', 'تعليمات', 'التعليمات'],
		minScore: 4,
		confidence: 0.94,
		reasoning: 'مطابقة دلالية: نصائح/تعليمات علمية تُصنّف ضمن التربية والتعليم لا الفقه أو العقيدة أو التاريخ.'
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه الإسلامي', 'الفقه', 'الشريعة والفقه'],
		subName: 'الفقه وأصوله',
		subAliases: ['الفقه وأصوله', 'أصول الفقه', 'العبادات', 'المعاملات', 'فقه العبادات'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'أحكام فقهية', 'فتاوى ومسائل'],
		keywords: ['فقه', 'الفقه', 'أحكام', 'احكام', 'حلال', 'حرام', 'صلاة', 'زكاة', 'صيام', 'حج', 'طهارة', 'أصول الفقه'],
		requiredAny: ['فقه', 'الفقه', 'أحكام', 'احكام', 'صلاة', 'زكاة', 'صيام', 'حج'],
		minScore: 2,
		confidence: 0.9,
		reasoning: 'مطابقة دلالية فقهية.'
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['العقيدة والتوحيد', 'التوحيد', 'الإيمان', 'الايمان'],
		secondaryName: 'مسائل العقيدة',
		secondaryAliases: ['مسائل العقيدة', 'التوحيد والإيمان', 'أصول الاعتقاد'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الايمان', 'الإيمان', 'اسماء الله', 'صفات الله', 'اعتقاد'],
		requiredAny: ['عقيدة', 'العقيدة', 'توحيد', 'اعتقاد'],
		minScore: 2,
		confidence: 0.9,
		reasoning: 'مطابقة دلالية عقدية.'
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'السيرة', 'التراجم', 'السير'],
		secondaryName: 'دراسات تاريخية',
		secondaryAliases: ['دراسات تاريخية', 'أحداث تاريخية', 'تراجم وسير'],
		keywords: ['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'ترجمة', 'أحداث', 'احداث'],
		requiredAny: ['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم'],
		minScore: 2,
		confidence: 0.88,
		reasoning: 'مطابقة دلالية تاريخية.'
	},
	{
		id: 'arabic_literature',
		mainName: 'اللغة والأدب',
		mainAliases: ['اللغة والأدب', 'اللغة العربية', 'الأدب العربي', 'الادب العربي'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الادب العربي', 'النثر', 'الشعر'],
		secondaryName: 'نصوص ودراسات أدبية',
		secondaryAliases: ['نصوص ودراسات أدبية', 'دراسات أدبية', 'النصوص الأدبية'],
		keywords: ['أدب', 'ادب', 'الأدب', 'الادب', 'شعر', 'نثر', 'بلاغة', 'لغة عربية'],
		requiredAny: ['أدب', 'ادب', 'الأدب', 'الادب', 'شعر', 'نثر'],
		minScore: 2,
		confidence: 0.88,
		reasoning: 'مطابقة دلالية أدبية/لغوية.'
	}
]);

function haystackForSemantic(bookMeta) {
	return normalizeArabic(
		[
			bookMeta?.title,
			seriesStemFromTitle(bookMeta?.title || ''),
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
}

function phrasePresent(haystack, phrase) {
	const n = normalizeArabic(phrase);
	return n && haystack.includes(n);
}

function semanticScore(profile, bookMeta) {
	const hay = haystackForSemantic(bookMeta);
	if (!hay) return 0;
	const requiredHit = (profile.requiredAny || []).some((kw) => phrasePresent(hay, kw));
	if (!requiredHit) return 0;
	let score = 0;
	for (const kw of profile.keywords || []) {
		if (phrasePresent(hay, kw)) score += 1;
	}
	if (
		profile.id === 'scientific_guidance_education' &&
		(phrasePresent(hay, 'النصائح حول التعليمات العلمية') ||
			(phrasePresent(hay, 'نصائح') && phrasePresent(hay, 'تعليمات') && phrasePresent(hay, 'علمية')))
	) {
		score += 8;
	}
	return score;
}

function pickSemanticProfile(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const profile of SEMANTIC_PROFILES) {
		const score = semanticScore(profile, bookMeta);
		if (score > bestScore) {
			bestScore = score;
			best = profile;
		}
	}
	if (!best || bestScore < (best.minScore || 1)) return null;
	return { profile: best, score: bestScore };
}

function sectionNameScore(name, aliases = []) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let best = 0;
	for (const alias of aliases) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) best = Math.max(best, 100);
		else if (n.includes(a) || a.includes(n)) best = Math.max(best, 75);
		else {
			const aTokens = new Set(a.split(' ').filter((w) => w.length >= 3));
			const nTokens = new Set(n.split(' ').filter((w) => w.length >= 3));
			const overlap = tokenSetsOverlapRatio(aTokens, nTokens);
			if (overlap >= 0.5) best = Math.max(best, 55);
			else if (overlap >= 0.25) best = Math.max(best, 30);
		}
	}
	return best;
}

function pickNamedNode(nodes, aliases, minScore = 55) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = sectionNameScore(node?.name, aliases);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return best && bestScore >= minScore ? best : null;
}

function secondaryNameFromBook(bookMeta, fallback = 'كتب عامة') {
	const titleStem = seriesStemFromTitle(bookMeta?.title || '');
	if (titleStem && titleStem.length >= 4 && titleStem.length <= 70) return titleStem;
	const hint = normalizeArabic((bookMeta?.categoryHints || []).find(Boolean) || '');
	if (hint && hint.length >= 4 && hint.length <= 70) return hint;
	return fallback;
}

function decisionForProfile(sections, bookMeta, profileHit) {
	const { profile, score } = profileHit;
	const mainAliases = profile.mainAliases || [profile.mainName];
	const subAliases = profile.subAliases || [profile.subName];
	const secondaryAliases = profile.secondaryAliases || [profile.secondaryName];
	const main = pickNamedNode(sections.tree, mainAliases, 55);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: profile.mainName,
			newSubName: profile.subName,
			newSecondaryName: profile.secondaryName,
			confidence: profile.confidence,
			reasoning: profile.reasoning,
			method: 'semantic',
			semanticProfile: profile.id,
			semanticScore: score
		};
	}
	const sub = pickNamedNode(main.children || [], subAliases, 50);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: profile.subName,
			newSecondaryName: profile.secondaryName,
			confidence: profile.confidence,
			reasoning: profile.reasoning,
			method: 'semantic',
			semanticProfile: profile.id,
			semanticScore: score
		};
	}
	const secondary =
		pickNamedNode(sub.children || [], secondaryAliases, 50) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: profile.secondaryName,
			minScore: 9
		});
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: profile.confidence,
			reasoning: profile.reasoning,
			method: 'semantic',
			semanticProfile: profile.id,
			semanticScore: score
		};
	}
	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: profile.secondaryName,
		confidence: profile.confidence,
		reasoning: profile.reasoning,
		method: 'semantic',
		semanticProfile: profile.id,
		semanticScore: score
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

	const semantic = pickSemanticProfile(bookMeta);
	const sug = semantic
		? decisionForProfile(sections, bookMeta, semantic)
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
	const semantic = pickSemanticProfile(bookMeta);
	if (semantic) return decisionForProfile(sections, bookMeta, semantic);

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const firstMain = sections.tree[0];
		return {
			kind: firstMain?.children?.[0] ? 'create_secondary' : 'create_sub',
			mainId: String(firstMain?.id || ''),
			subId: firstMain?.children?.[0]?.id ? String(firstMain.children[0].id) : '',
			newSubName: 'كتب عامة',
			newSecondaryName: secondaryNameFromBook(bookMeta, 'كتب عامة'),
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — إنشاء مستوى ثانوي عام داخل أقرب مسار متاح.',
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
			newSecondaryName: secondaryNameFromBook(bookMeta, 'كتب عامة'),
			confidence: Math.max(0.35, sug.confidence - 0.1),
			reasoning: `${sug.reasoning} — لا يوجد قسم ثانوي مناسب، لذلك سيُنشأ قسم ثانوي مخصّص.`,
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
