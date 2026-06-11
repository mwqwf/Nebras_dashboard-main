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

function cleanSectionName(name, fallback = 'كتب عامة') {
	const cleaned = String(name || '')
		.replace(/[<>]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 90);
	return cleaned || fallback;
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

function displayStemFromTitle(title) {
	let t = String(title || '').replace(/\s+/g, ' ').trim();
	if (!t) return '';
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '');
	return cleanSectionName(t, '');
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

const TOPIC_RULES = Object.freeze([
	{
		id: 'scientific_guidance',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		minScore: 3,
		keywords: [
			'نصائح',
			'نصيحه',
			'وصايا',
			'تعليم',
			'تعليمات',
			'علمي',
			'علميه',
			'الساده',
			'طلاب',
			'طلبه',
			'تربيه',
			'توجيه'
		],
		matches(haystack) {
			const hasAdvice = haystack.includes('نصائح') || haystack.includes('نصيحه') || haystack.includes('وصايا');
			const hasLearning =
				haystack.includes('تعليم') ||
				haystack.includes('علمي') ||
				haystack.includes('علميه') ||
				haystack.includes('طلبه') ||
				haystack.includes('طلاب');
			return hasAdvice && hasLearning;
		}
	},
	{
		id: 'fiqh',
		mainName: 'العلوم الشرعية',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية',
		minScore: 2,
		keywords: ['فقه', 'فقهي', 'فقهيه', 'اصول الفقه', 'احكام', 'عبادات', 'معاملات', 'فتاوي']
	},
	{
		id: 'aqidah',
		mainName: 'العلوم الشرعية',
		subName: 'العقيدة',
		secondaryName: 'العقيدة الإسلامية',
		minScore: 2,
		keywords: ['عقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'اشاعره', 'سلف']
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		subName: 'التاريخ',
		secondaryName: 'دراسات تاريخية',
		minScore: 2,
		keywords: ['تاريخ', 'تاريخيه', 'حضاره', 'دوله', 'خلافه', 'سير', 'تراجم']
	},
	{
		id: 'literature',
		mainName: 'اللغة والأدب',
		subName: 'الأدب',
		secondaryName: 'كتب أدبية',
		minScore: 2,
		keywords: ['ادب', 'ادبيه', 'شعر', 'نثر', 'بلاغه', 'قصائد', 'روايه']
	}
]);

function ruleScore(rule, haystack) {
	if (typeof rule.matches === 'function' && rule.matches(haystack)) {
		return Math.max(rule.minScore, 3);
	}
	let score = 0;
	for (const keyword of rule.keywords || []) {
		if (haystack.includes(normalizeArabic(keyword))) score += 1;
	}
	return score;
}

function inferDesiredPath(bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	let bestRule = null;
	let bestScore = 0;

	for (const rule of TOPIC_RULES) {
		const score = ruleScore(rule, haystack);
		if (score > bestScore) {
			bestScore = score;
			bestRule = rule;
		}
	}

	if (bestRule && bestScore >= bestRule.minScore) {
		return {
			mainName: bestRule.mainName,
			subName: bestRule.subName,
			secondaryName: bestRule.secondaryName,
			confidence: Math.min(0.78 + bestScore * 0.03, 0.93),
			reasoning: `قاعدة موضوعية (${bestRule.id}) تمنع خلط المجال مع أقسام غير مناسبة.`,
			method: 'topic-rule'
		};
	}

	const hint = cleanSectionName(
		Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints.find(Boolean) : '',
		''
	);
	return {
		mainName: 'مكتبة نور',
		subName: hint || 'كتب عامة',
		secondaryName: displayStemFromTitle(bookMeta?.title || '') || hint || 'كتب عامة',
		confidence: 0.42,
		reasoning: 'لم تُعثَر مطابقة موضوعية آمنة — إنشاء مسار عام منظّم لمكتبة نور.',
		method: 'safe-create'
	};
}

function namesMatch(a, b) {
	const left = normalizeArabic(a);
	const right = normalizeArabic(b);
	return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function findMainByName(tree, name) {
	return (tree || []).find((main) => namesMatch(main.name, name)) || null;
}

function findSubByName(main, name) {
	return (main?.children || []).find((sub) => namesMatch(sub.name, name)) || null;
}

function findSecondaryByName(sub, name) {
	return (sub?.children || []).find((sec) => namesMatch(sec.name, name)) || null;
}

function decisionForDesiredPath(sections, path) {
	const main = findMainByName(sections.tree, path.mainName);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: cleanSectionName(path.mainName),
			newSubName: cleanSectionName(path.subName),
			newSecondaryName: cleanSectionName(path.secondaryName),
			confidence: path.confidence,
			reasoning: path.reasoning,
			method: path.method
		};
	}

	const sub = findSubByName(main, path.subName);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: cleanSectionName(path.subName),
			newSecondaryName: cleanSectionName(path.secondaryName),
			confidence: path.confidence,
			reasoning: path.reasoning,
			method: path.method
		};
	}

	const secondary = findSecondaryByName(sub, path.secondaryName);
	if (!secondary) {
		const reusable = pickReuseSecondary(sections, String(sub.id), path, {
			proposedNewName: path.secondaryName,
			minScore: 10
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(main.id),
				subId: String(sub.id),
				secondaryId: reusable.id,
				confidence: path.confidence,
				reasoning: `${path.reasoning} أُعيد استخدام قسم ثانوي قريب: ${reusable.name}.`,
				method: path.method
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: cleanSectionName(path.secondaryName),
			confidence: path.confidence,
			reasoning: path.reasoning,
			method: path.method
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: path.confidence,
		reasoning: path.reasoning,
		method: path.method
	};
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله. لا يُرجع نتيجة إن كانت
 * الدرجات صفرية كي لا يخلط الكتاب في أول قسم عشوائي.
 */
function classifyHeuristic({ tree }, bookMeta) {
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
		confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05 + Math.max(bestSecScore, 0) * 0.03, 0.85),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic'
	};
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
	const hay = bookMeta?.mainName || bookMeta?.subName || bookMeta?.secondaryName
		? normalizeArabic([bookMeta.mainName, bookMeta.subName, bookMeta.secondaryName].filter(Boolean).join(' '))
		: haystackForReuse(bookMeta);
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
	const decision = await classifyAutonomous(sections, bookMeta);
	const sug = decision.kind === 'existing'
		? {
				mainId: decision.mainId,
				subId: decision.subId,
				secondaryId: decision.secondaryId,
				confidence: decision.confidence,
				reasoning: decision.reasoning,
				method: decision.method
			}
		: {
				mainId: decision.mainId || '',
				subId: decision.subId || '',
				secondaryId: decision.secondaryId || null,
				confidence: decision.confidence,
				reasoning: `${decision.reasoning} (${decision.kind})`,
				method: decision.method
			};
	const validation = decision.kind === 'existing'
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: true, reason: 'will_create_missing_sections' };
	return {
		suggested: sug || {
			mainId: sections.tree?.[0]?.id || '',
			subId: sections.tree?.[0]?.children?.[0]?.id || '',
			secondaryId: null,
			confidence: 0.1,
			reasoning: 'لم تُعثَر مطابقة.',
			method: 'safe-create'
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
		return decisionForDesiredPath(sections, inferDesiredPath(bookMeta));
	}

	const desired = inferDesiredPath(bookMeta);
	if (desired.method === 'topic-rule') {
		return decisionForDesiredPath(sections, desired);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return decisionForDesiredPath(sections, desired);
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: displayStemFromTitle(bookMeta?.title || ''),
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
			newSecondaryName: displayStemFromTitle(bookMeta?.title || '') || desired.secondaryName,
			confidence: Math.max(0.45, sug.confidence - 0.1),
			reasoning: `${sug.reasoning} — لا يوجد قسم ثانوي مناسب، سيتم إنشاء قسم ثانوي للكتاب.`,
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
