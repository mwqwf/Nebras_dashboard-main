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
		.replace(/[\r\n\t]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function tokenSet(value) {
	return new Set(normalizeArabic(value).split(' ').filter((w) => w.length >= 3));
}

function scoreTextAgainstNames(value, names) {
	const n = normalizeArabic(value);
	if (!n) return 0;
	const valueTokens = tokenSet(n);
	let best = 0;
	for (const name of names || []) {
		const candidate = normalizeArabic(name);
		if (!candidate) continue;
		let score = 0;
		if (n === candidate) score += 20;
		else if (n.includes(candidate) || candidate.includes(n)) score += 14;
		const candidateTokens = tokenSet(candidate);
		score += tokenSetsOverlapRatio(valueTokens, candidateTokens) * 10;
		if (score > best) best = score;
	}
	return best;
}

function findBestNodeByNames(nodes, names, minScore = 7) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreTextAgainstNames(node?.name || '', names);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function includesAnyNormalized(haystack, words) {
	const hay = normalizeArabic(haystack);
	return (words || []).some((w) => {
		const needle = normalizeArabic(w);
		return needle && hay.includes(needle);
	});
}

function scoreRule(rule, bookMeta) {
	const hay = haystackForReuse(bookMeta);
	let score = 0;
	for (const keyword of rule.keywords || []) {
		const k = normalizeArabic(keyword);
		if (k && hay.includes(k)) score += k.includes(' ') ? 3 : 1.5;
	}
	if (rule.requiredAny && !includesAnyNormalized(hay, rule.requiredAny)) return 0;
	return score;
}

const SEMANTIC_RULES = Object.freeze([
	{
		id: 'education_scientific_advice',
		newMainName: 'الدعوة والتربية',
		newSubName: 'التربية والتعليم',
		newSecondaryName: 'النصائح والتوجيهات العلمية',
		mainNames: ['الدعوة والتربية', 'التربية والتعليم', 'التربية', 'التعليم'],
		subNames: ['التربية والتعليم', 'التعليم', 'التربية', 'طلب العلم'],
		secondaryNames: [
			'النصائح والتوجيهات العلمية',
			'التوجيهات العلمية',
			'التعليمات العلمية',
			'آداب طالب العلم',
			'طلب العلم'
		],
		requiredAny: ['نصائح', 'تعليمات', 'توجيهات', 'تعليم', 'تربية', 'طلب العلم', 'طالب العلم'],
		keywords: [
			'نصائح',
			'النصائح',
			'تعليمات',
			'التعليمات',
			'توجيهات',
			'التوجيهات',
			'علمية',
			'العلمية',
			'تعليم',
			'التعليم',
			'تربية',
			'التربية',
			'طلب العلم',
			'طالب العلم',
			'السادة'
		]
	},
	{
		id: 'fiqh',
		newMainName: 'الفقه الإسلامي',
		newSubName: 'الفقه وأصوله',
		newSecondaryName: 'مسائل فقهية عامة',
		mainNames: ['الفقه الإسلامي', 'الفقه وأصوله', 'الفقه'],
		subNames: ['الفقه وأصوله', 'الفقه', 'أصول الفقه', 'العبادات', 'المعاملات'],
		secondaryNames: ['مسائل فقهية عامة', 'الفتاوى', 'العبادات', 'المعاملات', 'أصول الفقه'],
		requiredAny: ['فقه', 'فقهي', 'فتاوى', 'حلال', 'حرام', 'عبادات', 'معاملات'],
		keywords: ['فقه', 'فقهي', 'فقهية', 'أصول الفقه', 'فتاوى', 'العبادات', 'المعاملات', 'حلال', 'حرام']
	},
	{
		id: 'aqeedah',
		newMainName: 'العقيدة الإسلامية',
		newSubName: 'العقيدة والتوحيد',
		newSecondaryName: 'كتب العقيدة والتوحيد',
		mainNames: ['العقيدة الإسلامية', 'العقيدة والتوحيد', 'العقيدة', 'التوحيد'],
		subNames: ['العقيدة والتوحيد', 'العقيدة', 'التوحيد', 'الإيمان'],
		secondaryNames: ['كتب العقيدة والتوحيد', 'التوحيد', 'الإيمان', 'أصول الاعتقاد'],
		requiredAny: ['عقيدة', 'توحيد', 'إيمان', 'اعتقاد'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'التوحيد', 'إيمان', 'الإيمان', 'اعتقاد']
	},
	{
		id: 'history',
		newMainName: 'السيرة والتاريخ',
		newSubName: 'التاريخ الإسلامي',
		newSecondaryName: 'كتب التاريخ الإسلامي',
		mainNames: ['السيرة والتاريخ', 'التاريخ الإسلامي', 'التاريخ', 'السيرة'],
		subNames: ['التاريخ الإسلامي', 'التاريخ', 'السيرة النبوية', 'التراجم'],
		secondaryNames: ['كتب التاريخ الإسلامي', 'السيرة النبوية', 'التراجم', 'الفتوح'],
		requiredAny: ['تاريخ', 'سيرة', 'تراجم', 'فتوح'],
		keywords: ['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'الفتوح', 'المغازي']
	},
	{
		id: 'adab_akhlaq',
		newMainName: 'الآداب والأخلاق',
		newSubName: 'الأخلاق والآداب',
		newSecondaryName: 'كتب الآداب والأخلاق',
		mainNames: ['الآداب والأخلاق', 'الأدب والأخلاق', 'الأخلاق', 'الآداب'],
		subNames: ['الأخلاق والآداب', 'الأخلاق', 'الآداب', 'الرقائق'],
		secondaryNames: ['كتب الآداب والأخلاق', 'مكارم الأخلاق', 'الرقائق', 'آداب إسلامية'],
		requiredAny: ['أدب', 'آداب', 'أخلاق', 'رقائق'],
		keywords: ['أدب', 'آداب', 'الأدب', 'الآداب', 'أخلاق', 'الأخلاق', 'رقائق', 'تهذيب']
	},
	{
		id: 'quran',
		newMainName: 'القرآن الكريم',
		newSubName: 'علوم القرآن والتفسير',
		newSecondaryName: 'كتب التفسير وعلوم القرآن',
		mainNames: ['القرآن الكريم', 'علوم القرآن', 'التفسير'],
		subNames: ['علوم القرآن والتفسير', 'التفسير', 'علوم القرآن', 'تجويد القرآن'],
		secondaryNames: ['كتب التفسير وعلوم القرآن', 'التفسير', 'علوم القرآن', 'التجويد'],
		requiredAny: ['قرآن', 'تفسير', 'تجويد', 'مصاحف'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'التفسير', 'تجويد', 'المصحف', 'مصاحف']
	},
	{
		id: 'hadith',
		newMainName: 'الحديث الشريف',
		newSubName: 'علوم الحديث',
		newSecondaryName: 'كتب الحديث وعلومه',
		mainNames: ['الحديث الشريف', 'الحديث', 'علوم الحديث'],
		subNames: ['علوم الحديث', 'الحديث', 'شروح الحديث', 'مصطلح الحديث'],
		secondaryNames: ['كتب الحديث وعلومه', 'مصطلح الحديث', 'شروح الحديث', 'السنة النبوية'],
		requiredAny: ['حديث', 'سنة', 'مصطلح الحديث', 'رواة'],
		keywords: ['حديث', 'الحديث', 'سنة', 'السنة', 'مصطلح الحديث', 'رواة', 'الأسانيد']
	}
]);

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
		mainScore: bestMainScore,
		subScore: bestSubScore,
		secondaryScore: bestSecScore,
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

function pickSemanticRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of SEMANTIC_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= 2 ? { rule: best, score: bestScore } : null;
}

function inferGenericMainName(bookMeta) {
	const hints = (bookMeta?.categoryHints || [])
		.map((h) =>
			cleanSectionName(
				String(h || '')
					.replace(/^كتب\s+(?:في|عن)\s+/u, '')
					.replace(/^قسم\s+/u, '')
			)
		)
		.filter(Boolean);
	return hints[0] || 'كتب إسلامية عامة';
}

function inferGenericSubName(bookMeta, mainName) {
	const hints = (bookMeta?.categoryHints || [])
		.map((h) =>
			cleanSectionName(
				String(h || '')
					.replace(/^كتب\s+(?:في|عن)\s+/u, '')
					.replace(/^قسم\s+/u, '')
			)
		)
		.filter(Boolean);
	return hints.find((h) => normalizeArabic(h) !== normalizeArabic(mainName)) || mainName || 'كتب عامة';
}

function inferSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const titleStem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (titleStem && titleStem.length <= 72) return titleStem;
	return cleanSectionName(fallback, 'كتب عامة');
}

function resolveSemanticDecision(sections, bookMeta) {
	const picked = pickSemanticRule(bookMeta);
	if (!picked) return null;
	const { rule, score } = picked;

	const mainMatch = findBestNodeByNames(sections.tree, rule.mainNames, 6);
	if (!mainMatch) {
		return {
			kind: 'create_main',
			newMainName: rule.newMainName,
			newSubName: rule.newSubName,
			newSecondaryName: rule.newSecondaryName,
			confidence: Math.min(0.72 + score * 0.03, 0.96),
			reasoning: `قاعدة دلالية (${rule.id}) — لا يوجد قسم رئيسي مناسب، سيتم إنشاؤه بالمسار الثلاثي.`,
			method: 'semantic'
		};
	}

	const main = mainMatch.node;
	const subMatch = findBestNodeByNames(main.children, rule.subNames, 6);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.newSubName,
			newSecondaryName: rule.newSecondaryName,
			confidence: Math.min(0.74 + score * 0.03, 0.97),
			reasoning: `قاعدة دلالية (${rule.id}) — القسم الرئيسي مناسب، والقسم الفرعي غير موجود.`,
			method: 'semantic'
		};
	}

	const sub = subMatch.node;
	const secMatch = findBestNodeByNames(sub.children, rule.secondaryNames, 6);
	if (secMatch) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secMatch.node.id),
			confidence: Math.min(0.8 + score * 0.03, 0.98),
			reasoning: `قاعدة دلالية (${rule.id}) — وُجد مسار ثلاثي مناسب.`,
			method: 'semantic'
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: rule.newSecondaryName,
		minScore: 8
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: Math.min(0.76 + score * 0.03, 0.96),
			reasoning: `قاعدة دلالية (${rule.id}) — أُعيد استخدام قسم ثانوي قريب.`,
			method: 'semantic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: rule.newSecondaryName,
		confidence: Math.min(0.74 + score * 0.03, 0.97),
		reasoning: `قاعدة دلالية (${rule.id}) — القسمان الرئيسي والفرعي مناسبان، وسيُنشأ الثانوي الناقص.`,
		method: 'semantic'
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

	const semanticDecision = resolveSemanticDecision(sections, bookMeta);
	const sug =
		semanticDecision?.kind === 'existing'
			? {
					mainId: semanticDecision.mainId,
					subId: semanticDecision.subId,
					secondaryId: semanticDecision.secondaryId,
					confidence: semanticDecision.confidence,
					reasoning: semanticDecision.reasoning,
					method: semanticDecision.method
				}
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

	const semanticDecision = resolveSemanticDecision(sections, bookMeta);
	if (semanticDecision) return semanticDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const mainName = inferGenericMainName(bookMeta);
		return {
			kind: 'create_main',
			newMainName: mainName,
			newSubName: inferGenericSubName(bookMeta, mainName),
			newSecondaryName: inferSecondaryName(bookMeta, 'كتب عامة'),
			confidence: 0.25,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — سيتم إنشاء مسار ثلاثي محافظ من بيانات نور.',
			method: 'heuristic'
		};
	}
	if ((sug.mainScore ?? 0) <= 0 || (sug.subScore ?? 0) <= 0) {
		const mainName = inferGenericMainName(bookMeta);
		return {
			kind: 'create_main',
			newMainName: mainName,
			newSubName: inferGenericSubName(bookMeta, mainName),
			newSecondaryName: inferSecondaryName(bookMeta, 'كتب عامة'),
			confidence: 0.28,
			reasoning: 'لا توجد مطابقة دلالية كافية مع الأقسام الحالية — إنشاء مسار ثلاثي جديد.',
			method: 'heuristic'
		};
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (secId && (sug.secondaryScore ?? 0) <= 0) {
		secId = null;
	}
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: inferSecondaryName(bookMeta, ''),
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			newSecondaryName: inferSecondaryName(bookMeta, sections.index.subsById[String(sug.subId)]?.name || 'كتب عامة'),
			confidence: Math.max(0.35, sug.confidence),
			reasoning: 'وُجد رئيسي وفرعي مناسبان، لكن لا يوجد قسم ثانوي مناسب — سيتم إنشاء الثانوي الناقص.',
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
