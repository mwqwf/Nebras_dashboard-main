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
	if (!bestSub || bestSubScore <= 0) {
		return {
			mainId: bestMain.id,
			subId: null,
			secondaryId: null,
			confidence: Math.min(0.45 + bestMainScore * 0.05, 0.7),
			reasoning: 'heuristic وجد قسماً رئيسياً فقط',
			method: 'heuristic'
		};
	}

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

const SUBJECT_RULES = Object.freeze([
	{
		id: 'scientific_advice_for_sada',
		mainNames: ['الدعوة والتربية', 'التربية والدعوة', 'الدعوة'],
		subNames: ['التربية والتعليم', 'التعليم والتربية', 'التربية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		match(haystack) {
			return (
				(haystack.includes('النصائح') || haystack.includes('نصائح')) &&
				(
					haystack.includes('التعليمات العلميه') ||
					haystack.includes('التوجيهات العلميه') ||
					haystack.includes('التعليم العلم') ||
					haystack.includes('الساده')
				)
			);
		}
	},
	{
		id: 'fiqh',
		mainNames: ['الفقه الإسلامي', 'الفقه', 'فقه'],
		subNames: ['الفقه وأصوله', 'العبادات', 'المعاملات'],
		secondaryName: 'مسائل فقهية',
		keywords: ['فقه', 'فتاوي', 'فتوى', 'الطهاره', 'الصلاه', 'الزكاه', 'الصيام', 'الحج', 'المعاملات']
	},
	{
		id: 'aqeedah',
		mainNames: ['العقيدة الإسلامية', 'العقيدة', 'التوحيد'],
		subNames: ['العقيدة والتوحيد', 'التوحيد', 'الإيمان'],
		secondaryName: 'مباحث العقيدة',
		keywords: ['عقيده', 'توحيد', 'الايمان', 'اسماء الله', 'الصفات', 'الشرك']
	},
	{
		id: 'history',
		mainNames: ['التاريخ والسير', 'التاريخ الإسلامي', 'التاريخ'],
		subNames: ['التاريخ الإسلامي', 'السير والتراجم', 'السيرة النبوية'],
		secondaryName: 'دراسات تاريخية',
		keywords: ['تاريخ', 'سيره', 'السيره', 'تراجم', 'اعلام', 'خلفاء', 'الدوله']
	},
	{
		id: 'adab',
		mainNames: ['الآداب والأخلاق', 'الأدب والأخلاق', 'الآداب', 'الأخلاق'],
		subNames: ['الأخلاق والآداب', 'الآداب العامة', 'الرقائق'],
		secondaryName: 'آداب وتوجيهات',
		keywords: ['اداب', 'ادب', 'اخلاق', 'الاخلاق', 'رقائق', 'تزكيه']
	},
	{
		id: 'education',
		mainNames: ['الدعوة والتربية', 'التربية والدعوة', 'الدعوة'],
		subNames: ['التربية والتعليم', 'التعليم والتربية', 'التربية'],
		secondaryName: 'التربية والتعليم',
		keywords: ['تعليم', 'تربيه', 'مدرسه', 'منهج', 'ارشاد', 'توجيه']
	}
]);

function ruleMatches(rule, bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	if (typeof rule.match === 'function') return rule.match(haystack);
	return (rule.keywords || []).some((kw) => haystack.includes(normalizeArabic(kw)));
}

function sectionNameMatches(name, candidates) {
	const n = normalizeArabic(name);
	if (!n) return false;
	return (candidates || []).some((candidate) => {
		const c = normalizeArabic(candidate);
		return c && (n === c || n.includes(c) || c.includes(n));
	});
}

function findMainByNames(sections, names) {
	return (sections.tree || []).find((main) => sectionNameMatches(main.name, names)) || null;
}

function findSubByNames(mainNode, names) {
	return (mainNode?.children || []).find((sub) => sectionNameMatches(sub.name, names)) || null;
}

function findSecondaryByName(subNode, name) {
	return (
		(subNode?.children || []).find((sec) => sectionNameMatches(sec.name, [name])) || null
	);
}

function cleanSectionNameCandidate(value) {
	let out = String(value || '')
		.replace(/\.(pdf|docx?|epub|mobi)$/i, '')
		.replace(/^(?:كتاب|تحميل|قراءة|شرح)\s+/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (out.length > 80) out = out.slice(0, 80).trim();
	return out;
}

function inferSubName(bookMeta, fallback = 'كتب عامة') {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	for (const hint of hints) {
		const cleaned = cleanSectionNameCandidate(hint);
		if (cleaned && normalizeArabic(cleaned) !== normalizeArabic('مكتبة نور')) return cleaned;
	}
	return fallback;
}

function inferSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const hints = Array.isArray(bookMeta?.categoryHints) ? [...bookMeta.categoryHints].reverse() : [];
	for (const hint of hints) {
		const cleaned = cleanSectionNameCandidate(hint);
		if (cleaned && normalizeArabic(cleaned) !== normalizeArabic('مكتبة نور')) return cleaned;
	}
	return cleanSectionNameCandidate(seriesStemFromTitle(bookMeta?.title || '') || bookMeta?.title) || fallback;
}

function decisionFromRule(sections, bookMeta, rule) {
	const main = findMainByNames(sections, rule.mainNames);
	const mainName = rule.mainNames[0];
	const subName = rule.subNames[0];
	const secondaryName = rule.secondaryName;

	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: mainName,
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: 0.96,
			reasoning: `قاعدة تصنيف صارمة (${rule.id}) — إنشاء المسار الثلاثي الكامل.`,
			method: 'subject_rule'
		};
	}

	const sub = findSubByNames(main, rule.subNames);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: 0.95,
			reasoning: `قاعدة تصنيف صارمة (${rule.id}) — إنشاء فرع ثم قسم ثانوي مناسب.`,
			method: 'subject_rule'
		};
	}

	const secondary = findSecondaryByName(sub, secondaryName);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: 0.95,
			reasoning: `قاعدة تصنيف صارمة (${rule.id}) — إنشاء القسم الثانوي المناسب.`,
			method: 'subject_rule'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: 0.98,
		reasoning: `قاعدة تصنيف صارمة (${rule.id}) — مسار موجود مطابق.`,
		method: 'subject_rule'
	};
}

function classifyBySubjectRules(sections, bookMeta) {
	const rule = SUBJECT_RULES.find((candidate) => ruleMatches(candidate, bookMeta));
	return rule ? decisionFromRule(sections, bookMeta, rule) : null;
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

	const subjectDecision = classifyBySubjectRules(sections, bookMeta);
	if (subjectDecision) return subjectDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			confidence: 0.1,
			newMainName: 'مكتبة نور',
			newSubName: inferSubName(bookMeta),
			newSecondaryName: inferSecondaryName(bookMeta),
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — إنشاء مسار ثلاثي مستقل لمكتبة نور.',
			method: 'heuristic_create'
		};
	}
	if (!sug.subId) {
		return {
			kind: 'create_sub',
			mainId: String(sug.mainId),
			subId: null,
			secondaryId: null,
			newSubName: inferSubName(bookMeta),
			newSecondaryName: inferSecondaryName(bookMeta),
			confidence: Math.max(0.35, sug.confidence),
			reasoning: 'وُجد قسم رئيسي مناسب دون فرع دقيق — إنشاء فرع وقسم ثانوي للكتاب.',
			method: 'heuristic_create'
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
			newSecondaryName: inferSecondaryName(bookMeta),
			confidence: Math.max(0.35, sug.confidence),
			reasoning: 'وُجد main/sub مناسب دون قسم ثانوي دقيق — إنشاء المستوى الثالث قبل إضافة المحتوى.',
			method: 'heuristic_create'
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
