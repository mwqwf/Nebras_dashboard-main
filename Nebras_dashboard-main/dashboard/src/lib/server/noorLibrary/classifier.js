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

const AUTONOMOUS_PATH_RULES = Object.freeze([
	{
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		minScore: 3,
		keywords: [
			'النصائح حول التعليمات العلمية للسادة',
			'النصائح حول التعليمات العلمية السادة',
			'التعليمات العلمية',
			'التوجيهات العلمية',
			'النصائح العلمية',
			'النصائح',
			'توجيهات',
			'تعليمية',
			'التربية والتعليم'
		]
	},
	{
		mainName: 'الفقه الإسلامي',
		subName: 'العبادات',
		secondaryName: 'مسائل العبادات',
		minScore: 4,
		keywords: ['فقه', 'الفقه', 'العبادات', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'الطهارة']
	},
	{
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'مسائل العقيدة',
		minScore: 3,
		keywords: ['عقيدة', 'العقيدة', 'التوحيد', 'الإيمان', 'الايمان', 'الأسماء والصفات']
	},
	{
		mainName: 'التاريخ والسيرة',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'دراسات تاريخية',
		minScore: 3,
		keywords: ['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'الطبقات']
	},
	{
		mainName: 'اللغة العربية وآدابها',
		subName: 'الأدب العربي',
		secondaryName: 'دراسات أدبية',
		minScore: 3,
		keywords: ['أدب', 'الادب', 'الأدب', 'الشعر', 'النثر', 'البلاغة']
	}
]);

function cleanSectionName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function bestRuleForMeta(bookMeta) {
	const haystack = normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
	if (!haystack) return null;

	let best = null;
	let bestScore = 0;
	for (const rule of AUTONOMOUS_PATH_RULES) {
		let score = 0;
		for (const kw of rule.keywords) {
			const n = normalizeArabic(kw);
			if (!n) continue;
			if (haystack.includes(n)) score += n.split(' ').length > 1 ? 2 : 1;
		}
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (best && bestScore >= best.minScore) return { ...best, score: bestScore };
	return null;
}

function findMainByName(tree, name) {
	const target = normalizeArabic(name);
	if (!target) return null;
	return (tree || []).find((m) => normalizeArabic(m.name) === target) || null;
}

function findSubByName(main, name) {
	const target = normalizeArabic(name);
	if (!target) return null;
	return (main?.children || []).find((s) => normalizeArabic(s.name) === target) || null;
}

function findSecondaryByName(sub, name) {
	const target = normalizeArabic(name);
	if (!target) return null;
	return (sub?.children || []).find((s) => normalizeArabic(s.name) === target) || null;
}

function inferSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	for (let i = hints.length - 1; i >= 0; i -= 1) {
		const hint = cleanSectionName(hints[i], '');
		if (hint && normalizeArabic(hint) !== normalizeArabic('مكتبة نور')) return hint;
	}
	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && stem.length >= 4) return stem;
	return fallback;
}

function pathFromHints(bookMeta) {
	const hints = (Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [])
		.map((h) => cleanSectionName(h, ''))
		.filter(Boolean);
	return {
		mainName: hints[0] || 'مكتبة نور',
		subName: hints[1] || hints[0] || 'كتب عامة',
		secondaryName: hints[2] || inferSecondaryName(bookMeta, 'كتب عامة')
	};
}

function resolveDesiredPath(sections, desired, bookMeta, meta = {}) {
	const tree = sections.tree || [];
	const desiredMain = cleanSectionName(desired.mainName, 'مكتبة نور');
	const desiredSub = cleanSectionName(desired.subName, 'كتب عامة');
	const desiredSecondary = cleanSectionName(
		desired.secondaryName || inferSecondaryName(bookMeta, 'كتب عامة'),
		'كتب عامة'
	);

	const main = desired.mainId
		? tree.find((m) => String(m.id) === String(desired.mainId))
		: findMainByName(tree, desiredMain);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: desiredMain,
			newSubName: desiredSub,
			newSecondaryName: desiredSecondary,
			confidence: meta.confidence ?? 0.78,
			reasoning: meta.reasoning || 'لم يوجد المسار المناسب؛ إنشاء سلسلة main/sub/secondary.',
			method: meta.method || 'autonomous_path'
		};
	}

	const sub = desired.subId
		? (main.children || []).find((s) => String(s.id) === String(desired.subId))
		: findSubByName(main, desiredSub);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: desiredSub,
			newSecondaryName: desiredSecondary,
			confidence: meta.confidence ?? 0.76,
			reasoning: meta.reasoning || 'القسم الرئيسي موجود، والفرعي المناسب غير موجود.',
			method: meta.method || 'autonomous_path'
		};
	}

	const exactSec = desired.secondaryId
		? (sub.children || []).find((s) => String(s.id) === String(desired.secondaryId))
		: findSecondaryByName(sub, desiredSecondary);
	if (exactSec) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(exactSec.id),
			confidence: meta.confidence ?? 0.9,
			reasoning: meta.reasoning || 'وُجد المسار الثلاثي المناسب.',
			method: meta.method || 'autonomous_path'
		};
	}

	const reused = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: desiredSecondary,
		minScore: meta.reuseMinScore ?? 7
	});
	if (reused) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reused.id,
			confidence: meta.confidence ?? 0.86,
			reasoning: `استُخدم قسم ثانوي قائم قريب: "${reused.name}".`,
			method: meta.method || 'autonomous_path'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: desiredSecondary,
		confidence: meta.confidence ?? 0.74,
		reasoning: meta.reasoning || 'القسمان الرئيسي والفرعي موجودان، والثانوي المناسب غير موجود.',
		method: meta.method || 'autonomous_path'
	};
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
	const decision = await classifyAutonomous(sections, bookMeta);
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{
						mainId: decision.mainId,
						subId: decision.subId,
						secondaryId: decision.secondaryId
					},
					sections.index
				)
			: decision.kind === 'create_secondary'
				? validateHierarchyPath(
						{ mainId: decision.mainId, subId: decision.subId, secondaryId: null },
						sections.index
					)
				: { valid: false, reason: `${decision.kind}_planned` };

	return {
		suggested: {
			mainId: decision.mainId || null,
			subId: decision.subId || null,
			secondaryId: decision.secondaryId || null,
			newMainName: decision.newMainName || null,
			newSubName: decision.newSubName || null,
			newSecondaryName: decision.newSecondaryName || null,
			action: decision.kind,
			confidence: decision.confidence,
			reasoning: decision.reasoning,
			method: decision.method
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
		const rule = bestRuleForMeta(bookMeta);
		const desired = rule || pathFromHints(bookMeta);
		return {
			kind: 'create_main',
			newMainName: cleanSectionName(desired.mainName, 'مكتبة نور'),
			newSubName: cleanSectionName(desired.subName, 'كتب عامة'),
			newSecondaryName: cleanSectionName(
				desired.secondaryName || inferSecondaryName(bookMeta, 'كتب عامة'),
				'كتب عامة'
			),
			confidence: rule ? 0.78 : 0.45,
			reasoning: 'الشجرة فارغة؛ إنشاء أول مسار ثلاثي كامل.',
			method: rule ? 'rule_based_path' : 'hint_path'
		};
	}

	const rule = bestRuleForMeta(bookMeta);
	if (rule) {
		return resolveDesiredPath(sections, rule, bookMeta, {
			confidence: Math.min(0.72 + rule.score * 0.04, 0.94),
			reasoning: `قاعدة مجال-واعية اختارت: ${rule.mainName} > ${rule.subName} > ${rule.secondaryName}.`,
			method: 'rule_based_path',
			reuseMinScore: 5
		});
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return resolveDesiredPath(sections, pathFromHints(bookMeta), bookMeta, {
			confidence: 0.45,
			reasoning: 'لم توجد مطابقة موثوقة؛ إنشاء/استخدام مسار من تصنيفات المصدر.',
			method: 'hint_path'
		});
	}

	const main = sections.index.mainsById[String(sug.mainId)];
	const sub = sections.index.subsById[String(sug.subId)];
	return resolveDesiredPath(
		sections,
		{
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: sug.secondaryId ? String(sug.secondaryId) : null,
			mainName: main?.name || 'مكتبة نور',
			subName: sub?.name || 'كتب عامة',
			secondaryName: inferSecondaryName(bookMeta, 'كتب عامة')
		},
		bookMeta,
		{
			confidence: sug.confidence,
			reasoning: `${sug.reasoning} مع فرض المستوى الثانوي قبل الرفع.`,
			method: 'heuristic_strict_triple'
		}
	);
}
