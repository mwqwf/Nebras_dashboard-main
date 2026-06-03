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

function cleanSectionName(name, fallback = 'عام') {
	const s = String(name || '')
		.replace(/^كتب\s+(?:في|عن)\s+/u, '')
		.replace(/^كتاب\s+(?:في|عن)\s+/u, '')
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return s || fallback;
}

function textForBook(bookMeta) {
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

function hasAny(haystack, words) {
	return words.some((w) => haystack.includes(normalizeArabic(w)));
}

function hasAllGroups(haystack, groups) {
	return groups.every((group) => hasAny(haystack, group));
}

const SEMANTIC_RULES = Object.freeze([
	{
		id: 'scientific_advice_education',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'التربية'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم والتربية', 'التعليم', 'التربية العلمية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'التعليمات العلمية',
			'وصايا العلماء'
		],
		matchGroups: [
			['نصائح', 'النصائح', 'توجيهات', 'وصايا', 'إرشادات'],
			['تعليمات', 'التعليمات', 'تعليم', 'تربية', 'التربية'],
			['علمية', 'العلمية', 'علماء', 'السادة']
		],
		confidence: 0.96
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه الاسلامي', 'الفقه'],
		subName: 'الفقه الإسلامي',
		subAliases: ['الفقه الإسلامي', 'الفقه', 'فقه العبادات', 'فقه المعاملات'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'العبادات', 'المعاملات', 'أحكام فقهية'],
		matchGroups: [['فقه', 'فقهي', 'فقهية', 'أصول الفقه', 'احكام', 'أحكام']],
		confidence: 0.9
	},
	{
		id: 'aqida',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
		secondaryName: 'مباحث العقيدة',
		secondaryAliases: ['مباحث العقيدة', 'التوحيد', 'الإيمان', 'أصول الاعتقاد'],
		matchGroups: [['عقيدة', 'العقيدة', 'توحيد', 'الإيمان', 'ايمان']],
		confidence: 0.9
	},
	{
		id: 'history_sira',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ', 'السيرة والتاريخ'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'السيرة النبوية', 'السير والتراجم', 'التراجم'],
		secondaryName: 'السير والتراجم',
		secondaryAliases: ['السير والتراجم', 'التراجم', 'السيرة النبوية', 'أعلام التاريخ'],
		matchGroups: [['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'أعلام']],
		confidence: 0.88
	},
	{
		id: 'ethics_adab',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'التزكية والأخلاق'],
		subName: 'التزكية والأخلاق',
		subAliases: ['التزكية والأخلاق', 'الأخلاق', 'الآداب الإسلامية', 'الرقائق'],
		secondaryName: 'الآداب والأخلاق',
		secondaryAliases: ['الآداب والأخلاق', 'الأخلاق', 'آداب إسلامية', 'الرقائق'],
		matchGroups: [['اخلاق', 'أخلاق', 'تزكية', 'آداب', 'اداب', 'رقائق']],
		confidence: 0.88
	},
	{
		id: 'arabic_literature',
		mainName: 'اللغة والأدب',
		mainAliases: ['اللغة والأدب', 'اللغة العربية', 'الأدب العربي'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الأدب', 'الشعر', 'النثر'],
		secondaryName: 'نصوص ودراسات أدبية',
		secondaryAliases: ['نصوص ودراسات أدبية', 'الشعر', 'النثر', 'دراسات أدبية'],
		matchGroups: [['أدب', 'ادب', 'شعر', 'نثر', 'بلاغة', 'رواية']],
		confidence: 0.86
	}
]);

function matchSemanticRule(bookMeta) {
	const haystack = textForBook(bookMeta);
	if (!haystack) return null;
	for (const rule of SEMANTIC_RULES) {
		if (hasAllGroups(haystack, rule.matchGroups)) return rule;
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

function nodeNameScore(nodeName, names) {
	const current = normalizeArabic(nodeName);
	if (!current) return 0;
	const currentTokens = new Set(current.split(' ').filter((w) => w.length >= 3));
	let best = 0;
	for (const raw of names) {
		const wanted = normalizeArabic(raw);
		if (!wanted) continue;
		if (current === wanted) best = Math.max(best, 100);
		else if (current.includes(wanted) || wanted.includes(current)) best = Math.max(best, 82);
		else {
			const wantedTokens = new Set(wanted.split(' ').filter((w) => w.length >= 3));
			const overlap = tokenSetsOverlapRatio(currentTokens, wantedTokens);
			if (overlap >= 0.6) best = Math.max(best, 58);
			else if (overlap >= 0.4) best = Math.max(best, 42);
		}
	}
	return best;
}

function pickNodeByNames(nodes, names) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nodeNameScore(node?.name, names);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return bestScore >= 58 ? best : null;
}

function namesForRule(rule, key) {
	if (key === 'main') return [rule.mainName, ...(rule.mainAliases || [])];
	if (key === 'sub') return [rule.subName, ...(rule.subAliases || [])];
	return [rule.secondaryName, ...(rule.secondaryAliases || [])];
}

function inferSecondaryName(bookMeta, fallback = 'عام') {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	const hint = hints.map((h) => cleanSectionName(h, '')).find(Boolean);
	if (hint && normalizeArabic(hint) !== normalizeArabic(fallback)) return hint;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.split(' ').length <= 5) return cleanSectionName(stem, fallback);
	return fallback;
}

function fallbackRuleFromBook(bookMeta) {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	const firstHint = cleanSectionName(hints[0] || '', 'كتب عامة');
	return {
		id: 'noor_fallback',
		mainName: 'مكتبة نور',
		mainAliases: ['مكتبة نور'],
		subName: firstHint,
		subAliases: [firstHint],
		secondaryName: inferSecondaryName(bookMeta, 'عام'),
		secondaryAliases: [inferSecondaryName(bookMeta, 'عام')],
		confidence: 0.42
	};
}

function resolveRulePath(sections, bookMeta, rule) {
	const main = pickNodeByNames(sections.tree, namesForRule(rule, 'main'));
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: rule.confidence,
			reasoning: `قاعدة دلالية (${rule.id}) — إنشاء المسار الكامل المفقود.`,
			method: 'semantic_rule'
		};
	}

	const sub = pickNodeByNames(main.children, namesForRule(rule, 'sub'));
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: rule.confidence,
			reasoning: `قاعدة دلالية (${rule.id}) — إنشاء القسم الفرعي الناقص تحت "${main.name}".`,
			method: 'semantic_rule'
		};
	}

	const secondary = pickNodeByNames(sub.children, namesForRule(rule, 'secondary'));
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: rule.confidence,
			reasoning: `قاعدة دلالية (${rule.id}) — استعمال المسار الموجود.`,
			method: 'semantic_rule'
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: rule.secondaryName,
		minScore: 10
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: rule.confidence,
			reasoning: `قاعدة دلالية (${rule.id}) — استعمال قسم ثانوي قريب: "${reusable.name}".`,
			method: 'semantic_rule'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: rule.secondaryName,
		confidence: rule.confidence,
		reasoning: `قاعدة دلالية (${rule.id}) — إنشاء القسم الثانوي الناقص تحت "${sub.name}".`,
		method: 'semantic_rule'
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
	const semanticRule = matchSemanticRule(bookMeta);

	if (treeIsEmpty) {
		const rule = semanticRule || fallbackRuleFromBook(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: semanticRule ? rule.confidence : 0.35,
			reasoning: semanticRule
				? `قاعدة دلالية (${rule.id}) — لا توجد شجرة، إنشاء المسار الكامل.`
				: 'لا توجد شجرة أقسام — إنشاء مسار Noor عام بدل خلط الكتاب في قسم غير مناسب.',
			method: semanticRule ? 'semantic_rule' : 'fallback_category'
		};
	}

	if (semanticRule) return resolveRulePath(sections, bookMeta, semanticRule);

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return resolveRulePath(sections, bookMeta, fallbackRuleFromBook(bookMeta));
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: inferSecondaryName(bookMeta, 'عام'),
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
			newSecondaryName: inferSecondaryName(bookMeta, 'عام'),
			confidence: Math.max(0.45, sug.confidence - 0.1),
			reasoning: `${sug.reasoning} — إنشاء قسم ثانوي لإكمال الهيكل الثلاثي.`,
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
