/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const DEFAULT_GENERAL_PATH = Object.freeze({
	main: 'المعارف الإسلامية العامة',
	sub: 'موضوعات متنوعة',
	secondary: 'كتب عامة'
});

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
		secondaryId: bestSec ? bestSec.id : null,
		bestMainScore,
		bestSubScore,
		bestSecondaryScore: bestSecScore,
		confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05, 0.85),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic'
	};
}

function cleanSectionName(name) {
	return String(name || '')
		.replace(/\s+/g, ' ')
		.replace(/[|،,:؛]+$/g, '')
		.trim()
		.slice(0, 90);
}

function makeTokens(value) {
	return new Set(
		normalizeArabic(value)
			.split(' ')
			.map((w) => w.trim())
			.filter((w) => w.length >= 3)
	);
}

function textForClassification(bookMeta) {
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

function scoreNameAgainstCandidates(nodeName, candidates) {
	const node = normalizeArabic(nodeName);
	if (!node) return 0;
	const nodeTokens = makeTokens(node);
	let best = 0;
	for (const candidate of candidates) {
		const cand = normalizeArabic(candidate);
		if (!cand) continue;
		if (node === cand) best = Math.max(best, 30);
		else if (node.includes(cand) || cand.includes(node)) best = Math.max(best, 22);
		else {
			const candTokens = makeTokens(cand);
			const ratio = tokenSetsOverlapRatio(nodeTokens, candTokens);
			if (ratio >= 0.6) best = Math.max(best, 16);
			else if (ratio >= 0.35) best = Math.max(best, 10);
			else if (ratio > 0) best = Math.max(best, 4);
		}
	}
	return best;
}

function pickNodeByNames(nodes, names, { minScore = 10 } = {}) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNameAgainstCandidates(node?.name, names);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return best && bestScore >= minScore ? best : null;
}

function semanticRuleScore(rule, haystack) {
	let score = 0;
	for (const pattern of rule.any || []) {
		if (pattern.test(haystack)) score += 4;
	}
	for (const pattern of rule.strong || []) {
		if (pattern.test(haystack)) score += 8;
	}
	for (const pattern of rule.negative || []) {
		if (pattern.test(haystack)) score -= 10;
	}
	return score;
}

const SEMANTIC_RULES = Object.freeze([
	{
		id: 'scientific_advice',
		main: 'الدعوة والتربية',
		sub: 'التربية والتعليم',
		secondary: 'النصائح والتوجيهات العلمية',
		mainAliases: ['التربية والدعوة', 'الدعوة', 'التزكية والتربية'],
		subAliases: ['التعليم والتربية', 'التربية العلمية', 'التوجيه التربوي'],
		secondaryAliases: ['النصائح العلمية', 'التوجيهات العلمية', 'آداب طلب العلم'],
		strong: [/نصائح?\s+.*علم/u, /توجيهات?\s+.*علم/u, /تعليمات?\s+.*علم/u],
		any: [/نصائح?/u, /توجيه/u, /تعليم/u, /تربيه/u, /طلب\s+العلم/u, /الساده/u],
		negative: [/فقه/u, /عقيده/u, /تاريخ/u, /سيره/u]
	},
	{
		id: 'fiqh',
		main: 'الفقه الإسلامي',
		sub: 'الفقه وأصوله',
		secondary: 'مسائل فقهية عامة',
		mainAliases: ['الفقه', 'الفقه وأصوله'],
		subAliases: ['أصول الفقه', 'فقه العبادات', 'فقه المعاملات'],
		secondaryAliases: ['الفقه العام', 'فتاوى ومسائل فقهية'],
		strong: [/فقه/u, /اصول\s+الفقه/u, /فتاوي/u],
		any: [/طهاره/u, /صلاه/u, /زكاه/u, /صيام/u, /حج/u, /معاملات/u, /نكاح/u, /بيوع/u],
		negative: [/تاريخ/u, /سيره/u, /ادب/u]
	},
	{
		id: 'aqeedah',
		main: 'العقيدة الإسلامية',
		sub: 'العقيدة والتوحيد',
		secondary: 'مسائل العقيدة',
		mainAliases: ['العقيدة', 'التوحيد والعقيدة'],
		subAliases: ['التوحيد', 'الإيمان', 'أصول الاعتقاد'],
		secondaryAliases: ['التوحيد', 'الإيمان والاعتقاد'],
		strong: [/عقيده/u, /توحيد/u, /ايمان/u],
		any: [/اسماء\s+الله/u, /صفات/u, /قدر/u, /شرك/u, /ايمان/u],
		negative: [/تاريخ/u, /ادب/u, /فقه/u]
	},
	{
		id: 'history',
		main: 'التاريخ والسير',
		sub: 'التاريخ الإسلامي',
		secondary: 'تاريخ عام',
		mainAliases: ['التاريخ', 'السير والتراجم'],
		subAliases: ['التاريخ', 'تاريخ الإسلام', 'التراجم'],
		secondaryAliases: ['تاريخ إسلامي', 'التراجم والطبقات'],
		strong: [/تاريخ/u, /تراجم/u, /طبقات/u],
		any: [/دوله/u, /خلافه/u, /اموي/u, /عباسي/u, /اندلس/u, /اعلام/u],
		negative: [/عقيده/u, /فقه/u]
	},
	{
		id: 'seerah',
		main: 'التاريخ والسير',
		sub: 'السيرة النبوية',
		secondary: 'السيرة النبوية',
		mainAliases: ['السيرة والتاريخ', 'السير والتراجم'],
		subAliases: ['السيرة', 'سيرة النبي'],
		secondaryAliases: ['شمائل النبي', 'دلائل النبوة'],
		strong: [/سيره\s+النبي/u, /السيره\s+النبويه/u, /شمائل/u],
		any: [/مغازي/u, /هجره/u, /غزوه/u, /نبويه/u],
		negative: [/فقه/u, /عقيده/u]
	},
	{
		id: 'adab_akhlaq',
		main: 'التزكية والأخلاق',
		sub: 'الآداب والأخلاق',
		secondary: 'آداب وأخلاق عامة',
		mainAliases: ['الأخلاق والتزكية', 'الزهد والرقائق', 'الدعوة والتربية'],
		subAliases: ['الأخلاق', 'الآداب', 'الزهد والرقائق'],
		secondaryAliases: ['الآداب الشرعية', 'مكارم الأخلاق'],
		strong: [/اخلاق/u, /اداب/u, /تزكيه/u],
		any: [/زهد/u, /رقائق/u, /سلوك/u, /موعظه/u, /تهذيب/u],
		negative: [/فقه/u, /تاريخ/u]
	},
	{
		id: 'tafsir',
		main: 'القرآن الكريم وعلومه',
		sub: 'التفسير وعلوم القرآن',
		secondary: 'التفسير',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن'],
		subAliases: ['التفسير', 'علوم القرآن'],
		secondaryAliases: ['تفاسير القرآن', 'علوم القرآن'],
		strong: [/تفسير/u, /قران/u],
		any: [/سوره/u, /اسباب\s+النزول/u, /تجويد/u, /قراءات/u],
		negative: [/حديث/u, /فقه/u]
	},
	{
		id: 'hadith',
		main: 'الحديث الشريف وعلومه',
		sub: 'الحديث وعلومه',
		secondary: 'الحديث الشريف',
		mainAliases: ['الحديث', 'السنة النبوية'],
		subAliases: ['علوم الحديث', 'مصطلح الحديث', 'السنة'],
		secondaryAliases: ['كتب الحديث', 'مصطلح الحديث'],
		strong: [/حديث/u, /سنه/u],
		any: [/اسناد/u, /رواه/u, /صحيح/u, /سنن/u, /مصطلح/u],
		negative: [/تفسير/u, /تاريخ/u]
	},
	{
		id: 'arabic',
		main: 'اللغة العربية',
		sub: 'علوم اللغة العربية',
		secondary: 'اللغة والنحو',
		mainAliases: ['العربية وعلومها', 'لغة عربية'],
		subAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondaryAliases: ['النحو', 'الصرف', 'البلاغة'],
		strong: [/لغه\s+عربيه/u, /نحو/u, /صرف/u, /بلاغه/u],
		any: [/اعراب/u, /معجم/u, /ادب\s+عربي/u, /شعر/u],
		negative: [/فقه/u, /عقيده/u]
	}
]);

function pickSemanticRule(bookMeta) {
	const haystack = textForClassification(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of SEMANTIC_RULES) {
		const score = semanticRuleScore(rule, haystack);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best && bestScore >= 8 ? { rule: best, score: bestScore } : null;
}

function derivedSecondaryName(bookMeta, fallback = DEFAULT_GENERAL_PATH.secondary) {
	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	if (stem && stem.length >= 4) return stem;
	return fallback;
}

function decisionForSemanticRule(sections, bookMeta, rule, confidence, reasoning) {
	const mainNames = [rule.main, ...(rule.mainAliases || [])];
	const subNames = [rule.sub, ...(rule.subAliases || [])];
	const secondaryNames = [rule.secondary, ...(rule.secondaryAliases || [])];

	const main = pickNodeByNames(sections.tree, mainNames, { minScore: 10 });
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: rule.main,
			newSubName: rule.sub,
			newSecondaryName: rule.secondary,
			confidence,
			reasoning,
			method: 'semantic'
		};
	}

	const sub = pickNodeByNames(main.children || [], subNames, { minScore: 10 });
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.sub,
			newSecondaryName: rule.secondary,
			confidence,
			reasoning,
			method: 'semantic'
		};
	}

	const secondary =
		pickNodeByNames(sub.children || [], secondaryNames, { minScore: 10 }) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: rule.secondary,
			minScore: 7
		});
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence,
			reasoning,
			method: 'semantic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: rule.secondary,
		confidence,
		reasoning,
		method: 'semantic'
	};
}

function fallbackCreateDecision(bookMeta) {
	return {
		kind: 'create_main',
		newMainName: DEFAULT_GENERAL_PATH.main,
		newSubName: DEFAULT_GENERAL_PATH.sub,
		newSecondaryName: derivedSecondaryName(bookMeta, DEFAULT_GENERAL_PATH.secondary),
		confidence: 0.25,
		reasoning: 'لم توجد مطابقة آمنة؛ إنشاء مسار عام مستقل لتجنّب خلط التصنيفات.',
		method: 'fallback'
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
	const decision = await classifyAutonomous(sections, bookMeta);
	const sug = decision.kind === 'existing' ? decision : null;
	const validation = sug && sections.index
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: `requires_${decision.kind}` };
	return {
		suggested: sug || {
			mainId: decision.mainId || null,
			subId: decision.subId || null,
			secondaryId: decision.secondaryId || null,
			newMainName: decision.newMainName,
			newSubName: decision.newSubName,
			newSecondaryName: decision.newSecondaryName,
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
		return fallbackCreateDecision(bookMeta);
	}

	const semantic = pickSemanticRule(bookMeta);
	if (semantic) {
		return decisionForSemanticRule(
			sections,
			bookMeta,
			semantic.rule,
			Math.min(0.65 + semantic.score * 0.02, 0.95),
			`semantic:${semantic.rule.id} — تصنيف موضوعي يمنع خلط الفقه/العقيدة/التاريخ/الآداب.`
		);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return fallbackCreateDecision(bookMeta);
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: derivedSecondaryName(bookMeta),
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			newSecondaryName: derivedSecondaryName(bookMeta),
			confidence: Math.min(sug.confidence, 0.7),
			reasoning: 'مطابقة محلية للقسمين الرئيسي والفرعي، وإنشاء قسم ثانوي لإكمال الهيكل الثلاثي.',
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
