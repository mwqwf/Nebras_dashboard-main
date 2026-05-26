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

const TOPICAL_RULES = Object.freeze([
	{
		id: 'scientific-advice',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم والتربية', 'التعليم'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'الإرشادات العلمية',
			'التعليمات العلمية'
		],
		match(haystack) {
			const hasAdvice = ['نصائح', 'النصائح', 'توجيهات', 'التوجيهات', 'ارشادات', 'الارشادات']
				.some((word) => haystack.includes(normalizeArabic(word)));
			const hasLearning = ['تعليمات علميه', 'توجيهات علميه', 'نصائح علميه', 'التعليم', 'العلميه']
				.some((word) => haystack.includes(normalizeArabic(word)));
			return hasAdvice && hasLearning;
		}
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه واصوله', 'الفقه الإسلامي', 'الفقه'],
		subName: 'الفقه الإسلامي',
		subAliases: ['الفقه الإسلامي', 'الفقه', 'الأحكام الفقهية', 'احكام فقهية'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'أحكام فقهية', 'الفتاوى', 'العبادات', 'المعاملات'],
		match(haystack) {
			return ['فقه', 'فقهي', 'فقهيه', 'فتاوي', 'فتاوى', 'احكام', 'عبادات', 'معاملات']
				.some((word) => haystack.includes(normalizeArabic(word)));
		}
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيده', 'العقيدة الإسلامية', 'التوحيد'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'العقيدة', 'التوحيد'],
		secondaryName: 'مسائل العقيدة',
		secondaryAliases: ['مسائل العقيدة', 'التوحيد', 'الإيمان'],
		match(haystack) {
			return ['عقيده', 'العقيده', 'عقيدة', 'العقيدة', 'توحيد', 'ايمان'].some((word) =>
				haystack.includes(normalizeArabic(word))
			);
		}
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ', 'السيرة والتاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'التاريخ', 'السيرة النبوية', 'السير والتراجم'],
		secondaryName: 'التاريخ والتراجم',
		secondaryAliases: ['التاريخ والتراجم', 'التراجم', 'السير', 'السيرة'],
		match(haystack) {
			return ['تاريخ', 'السيره', 'سيره', 'تراجم', 'الطبقات', 'المغازي'].some((word) =>
				haystack.includes(normalizeArabic(word))
			);
		}
	},
	{
		id: 'adab',
		mainName: 'الآداب والأخلاق',
		mainAliases: ['الآداب والأخلاق', 'الاداب والاخلاق', 'الأدب', 'الآداب'],
		subName: 'الآداب العامة',
		subAliases: ['الآداب العامة', 'الاداب العامه', 'الأخلاق', 'الأدب'],
		secondaryName: 'الآداب والأخلاق',
		secondaryAliases: ['الآداب والأخلاق', 'الأخلاق', 'الآداب العامة'],
		match(haystack) {
			return ['اداب', 'الاداب', 'اخلاق', 'الاخلاق', 'ادب'].some((word) =>
				haystack.includes(normalizeArabic(word))
			);
		}
	}
]);

function namesFor(primary, aliases = []) {
	return [primary, ...aliases].map(normalizeArabic).filter(Boolean);
}

function findMainByNames(tree, names) {
	const targets = new Set(namesFor(names[0], names.slice(1)));
	return (tree || []).find((m) => targets.has(normalizeArabic(m?.name || ''))) || null;
}

function findSubByNames(mainNode, names) {
	const targets = new Set(namesFor(names[0], names.slice(1)));
	return (mainNode?.children || []).find((s) => targets.has(normalizeArabic(s?.name || ''))) || null;
}

function findSecondaryByNames(subNode, names) {
	const targets = new Set(namesFor(names[0], names.slice(1)));
	return (subNode?.children || []).find((s) => targets.has(normalizeArabic(s?.name || ''))) || null;
}

function haystackForRules(bookMeta) {
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

function detectTopicalRule(bookMeta) {
	const haystack = haystackForRules(bookMeta);
	return TOPICAL_RULES.find((rule) => rule.match(haystack)) || null;
}

function cleanSectionProposal(name, fallback = 'كتب عامة') {
	const cleaned = String(name || '')
		.replace(/[()\[\]{}]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function proposeSecondaryName(bookMeta, subNode = null) {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	for (const hint of hints) {
		const cleaned = cleanSectionProposal(hint, '');
		if (!cleaned) continue;
		if (subNode && normalizeArabic(cleaned) === normalizeArabic(subNode.name)) continue;
		return cleaned;
	}
	const stem = cleanSectionProposal(seriesStemFromTitle(bookMeta?.title || ''), '');
	return stem || 'كتب عامة';
}

function resolveDesiredPath(sections, desired, bookMeta) {
	const mainNames = [desired.mainName, ...(desired.mainAliases || [])];
	const subNames = [desired.subName, ...(desired.subAliases || [])];
	const secondaryNames = [desired.secondaryName, ...(desired.secondaryAliases || [])];
	const main = findMainByNames(sections.tree, mainNames);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: desired.mainName,
			newSubName: desired.subName,
			newSecondaryName: desired.secondaryName,
			confidence: 0.96,
			reasoning: `قاعدة موضوعية: إنشاء مسار ${desired.mainName} > ${desired.subName} > ${desired.secondaryName}`,
			method: `rule:${desired.id}`
		};
	}

	const sub = findSubByNames(main, subNames);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: desired.subName,
			newSecondaryName: desired.secondaryName,
			confidence: 0.94,
			reasoning: `قاعدة موضوعية: إنشاء ${desired.subName} > ${desired.secondaryName} تحت ${main.name}`,
			method: `rule:${desired.id}`
		};
	}

	const secondary = findSecondaryByNames(sub, secondaryNames);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: 0.98,
			reasoning: `قاعدة موضوعية: استخدام المسار الموجود ${main.name} > ${sub.name} > ${secondary.name}`,
			method: `rule:${desired.id}`
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: desired.secondaryName,
		minScore: 7
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: 0.92,
			reasoning: `قاعدة موضوعية: إعادة استخدام قسم ثانوي قريب (${reusable.name})`,
			method: `rule:${desired.id}`
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: desired.secondaryName,
		confidence: 0.93,
		reasoning: `قاعدة موضوعية: إنشاء قسم ثانوي ${desired.secondaryName} تحت ${main.name} > ${sub.name}`,
		method: `rule:${desired.id}`
	};
}

function fallbackNoMixingDecision(sections, bookMeta) {
	const main = findMainByNames(sections.tree, ['مكتبة نور']);
	const subName = cleanSectionProposal(
		Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints[0] : '',
		'كتب عامة'
	);
	const secondaryName = proposeSecondaryName(bookMeta);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: 0.45,
			reasoning: 'لم توجد مطابقة موضوعية آمنة — إنشاء مسار عام مستقل لمكتبة نور بدل خلطه مع قسم قائم.',
			method: 'safe-fallback'
		};
	}
	const sub = findSubByNames(main, [subName]);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: 0.48,
			reasoning: 'لم توجد مطابقة موضوعية آمنة — إنشاء فرع مستقل تحت مكتبة نور.',
			method: 'safe-fallback'
		};
	}
	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 6
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: 0.55,
			reasoning: 'إعادة استخدام قسم ثانوي عام قريب تحت مكتبة نور.',
			method: 'safe-fallback'
		};
	}
	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: secondaryName,
		confidence: 0.5,
		reasoning: 'لم توجد مطابقة موضوعية آمنة — إنشاء قسم ثانوي مستقل تحت مكتبة نور.',
		method: 'safe-fallback'
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
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName: cleanSectionProposal(
				Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints[0] : '',
				'كتب عامة'
			),
			newSecondaryName: proposeSecondaryName(bookMeta),
			confidence: 0.4,
			reasoning: 'الشجرة فارغة — إنشاء مسار مكتبة نور الثلاثي قبل إضافة المحتوى.',
			method: 'empty-tree-bootstrap'
		};
	}

	const topicalRule = detectTopicalRule(bookMeta);
	if (topicalRule) {
		return resolveDesiredPath(sections, topicalRule, bookMeta);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return fallbackNoMixingDecision(sections, bookMeta);
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: proposeSecondaryName(bookMeta),
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	if (!secId) {
		const subNode = sections.index.subsById[String(sug.subId)];
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			newSecondaryName: proposeSecondaryName(bookMeta, subNode),
			confidence: Math.max(0.55, sug.confidence - 0.05),
			reasoning: `${sug.reasoning} — لم يوجد قسم ثانوي مناسب، فسيُنشأ مستوى ثالث مستقل.`,
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
