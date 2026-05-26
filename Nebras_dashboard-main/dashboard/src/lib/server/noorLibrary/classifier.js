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

function sanitizeSectionName(raw, fallback = 'كتب عامة') {
	let s = String(raw || '').trim();
	if (!s) return fallback;
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (!s || /^(الرئيسية|home|كتب|book|books)$/i.test(s)) return fallback;
	if (s.length > 48) s = s.slice(0, 48).trim();
	return s || fallback;
}

function pickBestHint(bookMeta, fallback = 'كتب عامة') {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint, '');
		if (clean && clean.length >= 3) return clean;
	}
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && stem.length >= 3 && stem.length <= 48) return stem;
	return fallback;
}

function pickSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const hint = pickBestHint(bookMeta, '');
	if (hint && normalizeArabic(hint) !== 'كتب عامه') return hint;
	return fallback;
}

function tokensOverlapText(a, b) {
	return tokenSetsOverlapRatio(
		new Set(normalizeArabic(a).split(' ').filter((w) => w.length >= 3)),
		new Set(normalizeArabic(b).split(' ').filter((w) => w.length >= 3))
	);
}

function sectionNameMatchScore(name, desired, aliases = []) {
	const n = normalizeArabic(name);
	const candidates = [desired, ...aliases].map(normalizeArabic).filter(Boolean);
	if (!n || candidates.length === 0) return 0;
	let best = 0;
	for (const d of candidates) {
		if (n === d) best = Math.max(best, 100);
		else if (n.includes(d) || (d.includes(n) && n.length >= 4)) best = Math.max(best, 82);
		else best = Math.max(best, tokensOverlapText(n, d) * 70);
	}
	return best;
}

function pickBestByDesired(nodes, desired, aliases = []) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = sectionNameMatchScore(node?.name, desired, aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= 35 ? best : null;
}

const TAXONOMY_RULES = Object.freeze([
	{
		id: 'scientific_advice',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة', 'التربية'],
		subName: 'التربية والتعليم',
		subAliases: ['التعليم', 'التربية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: ['النصائح العلمية', 'التوجيهات العلمية', 'نصائح علمية'],
		match(hay) {
			return (
				(hay.includes('النصائح') || hay.includes('نصائح')) &&
				(
					hay.includes('التعليمات العلميه') ||
					hay.includes('التوجيهات العلميه') ||
					hay.includes('نصائح علميه') ||
					hay.includes('الساده')
				)
			);
		}
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه', 'فقه'],
		subName: 'الفقه وأصوله',
		subAliases: ['أصول الفقه', 'كتب الفقه', 'الفقه'],
		secondaryName: 'كتب الفقه',
		markers: ['فقه', 'الفقه', 'فقهي', 'فقهيه', 'اصول الفقه', 'فتاوي', 'فتاوى', 'عبادات', 'معاملات']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		mainAliases: ['العقيده', 'التوحيد'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['التوحيد', 'كتب العقيدة'],
		secondaryName: 'مسائل العقيدة',
		markers: ['عقيده', 'العقيده', 'توحيد', 'الايمان', 'الايمان', 'الاسماء والصفات']
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ', 'التراجم', 'السير'],
		secondaryName: 'كتب التاريخ',
		markers: ['تاريخ', 'التاريخ', 'تراجم', 'طبقات', 'سير اعلام', 'السيره']
	},
	{
		id: 'literature',
		mainName: 'الأدب واللغة',
		mainAliases: ['الأدب', 'الادب', 'اللغة العربية'],
		subName: 'الأدب العربي',
		subAliases: ['الادب العربي', 'الشعر', 'النثر'],
		secondaryName: 'كتب الأدب',
		markers: ['ادب', 'الادب', 'شعر', 'ديوان', 'بلاغه', 'نقد ادبي', 'نثر']
	}
]);

function ruleMatches(rule, haystack) {
	if (typeof rule.match === 'function') return rule.match(haystack);
	return (rule.markers || []).some((marker) => haystack.includes(normalizeArabic(marker)));
}

function decisionFromRule(sections, rule) {
	const main = pickBestByDesired(sections.tree, rule.mainName, rule.mainAliases);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.78,
			reasoning: `قاعدة تصنيف "${rule.id}": لا يوجد قسم رئيسي مناسب، سيتم إنشاء المسار الكامل.`,
			method: 'heuristic'
		};
	}

	const sub = pickBestByDesired(main.children || [], rule.subName, rule.subAliases);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.82,
			reasoning: `قاعدة تصنيف "${rule.id}": وُجد "${main.name}" وسيُنشأ فرع "${rule.subName}".`,
			method: 'heuristic'
		};
	}

	const secondary = pickBestByDesired(sub.children || [], rule.secondaryName, rule.secondaryAliases);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence: 0.88,
			reasoning: `قاعدة تصنيف "${rule.id}": وُجد المسار الأب وسيُنشأ القسم الثانوي المناسب.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: 0.94,
		reasoning: `قاعدة تصنيف "${rule.id}": استعمال مسار قائم ${main.name} ← ${sub.name} ← ${secondary.name}.`,
		method: 'heuristic'
	};
}

function classifyByTaxonomyRules(sections, bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	for (const rule of TAXONOMY_RULES) {
		if (ruleMatches(rule, haystack)) return decisionFromRule(sections, rule);
	}
	return null;
}

function classifyStructuredFallback(sections, bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = new Set(haystack.split(' ').filter((t) => t.length >= 3));

	function scoreOfName(name) {
		const n = normalizeArabic(name);
		if (!n) return 0;
		let score = 0;
		for (const w of n.split(' ')) {
			if (w.length >= 3 && tokens.has(w)) score += 1;
		}
		if (haystack.includes(n) && n.length >= 4) score += 3;
		return score;
	}

	let bestMain = null;
	let bestMainScore = 0;
	for (const m of sections.tree || []) {
		const s = scoreOfName(m.name);
		if (s > bestMainScore) {
			bestMain = m;
			bestMainScore = s;
		}
	}

	const subName = pickBestHint(bookMeta, 'كتب عامة');
	const secondaryName = pickSecondaryName(bookMeta, subName);
	if (!bestMain || bestMainScore === 0) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: 0.35,
			reasoning: 'لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار Noor من ثلاثة مستويات.',
			method: 'heuristic'
		};
	}

	let bestSub = null;
	let bestSubScore = 0;
	for (const sub of bestMain.children || []) {
		const s = scoreOfName(sub.name);
		if (s > bestSubScore) {
			bestSub = sub;
			bestSubScore = s;
		}
	}

	if (!bestSub || bestSubScore === 0) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.id),
			subId: null,
			secondaryId: null,
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: 0.45,
			reasoning: `وُجد قسم رئيسي مناسب "${bestMain.name}" — إنشاء فرع وثانوي للمحتوى.`,
			method: 'heuristic'
		};
	}

	let bestSec = null;
	let bestSecScore = 0;
	for (const sec of bestSub.children || []) {
		const s = scoreOfName(sec.name);
		if (s > bestSecScore) {
			bestSec = sec;
			bestSecScore = s;
		}
	}

	if (!bestSec || bestSecScore === 0) {
		const reusable = pickReuseSecondary(sections, String(bestSub.id), bookMeta, {
			proposedNewName: secondaryName,
			minScore: 7
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(bestMain.id),
				subId: String(bestSub.id),
				secondaryId: reusable.id,
				confidence: 0.72,
				reasoning: `إعادة استعمال قسم ثانوي قائم "${reusable.name}" ضمن "${bestSub.name}".`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(bestMain.id),
			subId: String(bestSub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: 0.58,
			reasoning: `وُجد "${bestMain.name} ← ${bestSub.name}" بلا قسم ثانوي مناسب — إنشاء "${secondaryName}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(bestMain.id),
		subId: String(bestSub.id),
		secondaryId: String(bestSec.id),
		confidence: Math.min(0.55 + bestMainScore * 0.05 + bestSubScore * 0.05 + bestSecScore * 0.03, 0.9),
		reasoning: `مطابقة محلّيّة صارمة: ${bestMain.name} ← ${bestSub.name} ← ${bestSec.name}.`,
		method: 'heuristic'
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
	return classifyByTaxonomyRules(sections, bookMeta) || classifyStructuredFallback(sections, bookMeta);
}
