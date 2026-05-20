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

const STOP_WORDS = new Set([
	'كتاب',
	'كتب',
	'في',
	'من',
	'الى',
	'علي',
	'عن',
	'مع',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'دار',
	'مكتبه',
	'نور',
	'اسلاميه',
	'الاسلاميه',
	'العربيه',
	'العربي'
]);

/**
 * خريطة موضوعيّة محافظة تمنع خلط المجالات المتقاربة ظاهرياً:
 * الآداب/الأخلاق لا تُرمى في الفقه، والتاريخ لا يُرمى في العقيدة، وهكذا.
 */
const TAXONOMY_RULES = Object.freeze([
	{
		id: 'quran',
		mainNames: ['القرآن الكريم وعلومه', 'التفسير وعلوم القرآن', 'علوم القرآن'],
		subNames: ['التفسير وعلوم القرآن', 'التفسير', 'علوم القرآن'],
		secondaryNames: ['التفسير وعلوم القرآن'],
		keywords: ['قران', 'القران', 'تفسير', 'تفاسير', 'المصحف', 'تجويد', 'قراءات', 'اسباب النزول']
	},
	{
		id: 'hadith',
		mainNames: ['الحديث الشريف وعلومه', 'الحديث وعلومه', 'السنة النبوية'],
		subNames: ['الحديث وعلومه', 'علوم الحديث', 'كتب الحديث'],
		secondaryNames: ['علوم الحديث وشروحه'],
		keywords: ['حديث', 'احاديث', 'سنه', 'السنه', 'اسناد', 'رواه', 'البخاري', 'مسلم', 'سنن', 'صحيح']
	},
	{
		id: 'aqeedah',
		mainNames: ['العقيدة الإسلامية', 'العقيدة', 'التوحيد'],
		subNames: ['العقيدة والتوحيد', 'التوحيد', 'العقيدة'],
		secondaryNames: ['مسائل العقيدة والتوحيد'],
		keywords: ['عقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'القدر', 'الشرك', 'الايمان']
	},
	{
		id: 'usul-fiqh',
		mainNames: ['الفقه الإسلامي', 'الفقه وأصوله', 'الفقه الاسلامي'],
		subNames: ['أصول الفقه', 'اصول الفقه', 'الفقه وأصوله'],
		secondaryNames: ['أصول الفقه والقواعد الفقهية'],
		keywords: ['اصول الفقه', 'القواعد الفقهيه', 'مقاصد الشريعه', 'استنباط', 'الاجتهاد', 'القياس']
	},
	{
		id: 'fiqh',
		mainNames: ['الفقه الإسلامي', 'الفقه وأصوله', 'الفقه الاسلامي'],
		subNames: ['الفقه', 'الفقه وأصوله', 'الأحكام الفقهية'],
		secondaryNames: ['أحكام فقهية عامة'],
		keywords: ['فقه', 'احكام', 'طهاره', 'صلاه', 'زكاه', 'صيام', 'حج', 'معاملات', 'نكاح', 'طلاق', 'فتاوي']
	},
	{
		id: 'seerah',
		mainNames: ['السيرة النبوية', 'السيرة والشمائل', 'السيرة'],
		subNames: ['السيرة النبوية', 'الشمائل النبوية'],
		secondaryNames: ['السيرة والشمائل'],
		keywords: ['سيره', 'النبي', 'الرسول', 'محمد', 'شمائل', 'غزوات', 'الهجره']
	},
	{
		id: 'history',
		mainNames: ['التاريخ الإسلامي', 'التاريخ والسير', 'التاريخ'],
		subNames: ['التاريخ الإسلامي', 'التراجم والسير'],
		secondaryNames: ['أحداث وتراجم تاريخية'],
		keywords: ['تاريخ', 'تراجم', 'سير اعلام', 'اعلام', 'خلفاء', 'دوله', 'اندلس', 'فتوح']
	},
	{
		id: 'adab-akhlaq',
		mainNames: ['التزكية والآداب والأخلاق', 'الآداب والأخلاق', 'التربية والتزكية'],
		subNames: ['الآداب الشرعية', 'الأخلاق والآداب', 'التزكية'],
		secondaryNames: ['طلب العلم وآدابه', 'آداب طالب العلم', 'النصائح والتوجيهات العلمية'],
		keywords: [
			'اداب',
			'اخلاق',
			'تزكيه',
			'رقائق',
			'نصيحه',
			'نصائح',
			'توجيهات',
			'تعليمات علميه',
			'طلب العلم',
			'طالب العلم',
			'العلماء',
			'العلميه'
		]
	},
	{
		id: 'arabic',
		mainNames: ['اللغة العربية', 'علوم اللغة العربية', 'العربية'],
		subNames: ['النحو والصرف', 'اللغة العربية وعلومها'],
		secondaryNames: ['علوم اللغة العربية'],
		keywords: ['لغه عربيه', 'نحو', 'صرف', 'بلاغه', 'اعراب', 'معاجم', 'ادب عربي']
	},
	{
		id: 'dawah',
		mainNames: ['الدعوة والإرشاد', 'الدعوة الإسلامية'],
		subNames: ['الدعوة والإرشاد', 'الخطب والدروس'],
		secondaryNames: ['الدعوة والتوجيه'],
		keywords: ['دعوه', 'ارشاد', 'خطب', 'محاضرات', 'دروس', 'وعظ']
	},
	{
		id: 'general-islamic',
		mainNames: ['المكتبة الإسلامية العامة', 'كتب إسلامية', 'الإسلام العام'],
		subNames: ['موضوعات إسلامية متنوعة', 'كتب إسلامية عامة'],
		secondaryNames: ['متفرقات إسلامية'],
		keywords: ['اسلام', 'اسلاميه', 'الشريعه', 'الدين']
	}
]);

const GENERIC_CATEGORY_HINTS = new Set(
	[
		'كتب',
		'كتاب',
		'كتب اسلاميه',
		'اسلاميه',
		'اسلام',
		'الدين',
		'الشريعه',
		'مكتبه نور'
	].map(normalizeArabic)
);

function tokenizeNormalized(text) {
	return normalizeArabic(text)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function contextForBook(bookMeta) {
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

function scorePhrase(haystack, phrase) {
	const n = normalizeArabic(phrase);
	if (!n) return 0;
	if (haystack.includes(n)) return n.includes(' ') ? 8 : 5;
	let score = 0;
	for (const token of tokenizeNormalized(n)) {
		if (haystack.includes(token)) score += 2;
	}
	return score;
}

function scoreRule(rule, bookMeta) {
	const haystack = contextForBook(bookMeta);
	let score = 0;
	for (const kw of rule.keywords || []) score += scorePhrase(haystack, kw);
	for (const name of [
		...(rule.mainNames || []),
		...(rule.subNames || []),
		...(rule.secondaryNames || [])
	]) {
		score += scorePhrase(haystack, name) * 0.5;
	}
	return score;
}

function pickTaxonomyRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best && bestScore >= 5 ? { rule: best, score: bestScore } : null;
}

function nodeNameScore(nodeName, candidateNames = [], haystack = '') {
	const n = normalizeArabic(nodeName);
	if (!n) return 0;
	let score = 0;
	for (const candidate of candidateNames) {
		const c = normalizeArabic(candidate);
		if (!c) continue;
		if (n === c) score += 40;
		else if (n.includes(c) || c.includes(n)) score += 28;
		else {
			const nodeTokens = new Set(tokenizeNormalized(n));
			const candTokens = new Set(tokenizeNormalized(c));
			score += tokenSetsOverlapRatio(nodeTokens, candTokens) * 18;
		}
	}
	if (haystack && haystack.includes(n) && n.length >= 4) score += 8;
	return score;
}

function pickBestNode(nodes = [], candidateNames = [], haystack = '', minScore = 12) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes) {
		const score = nodeNameScore(node?.name, candidateNames, haystack);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function cleanSectionName(name) {
	return String(name || '')
		.replace(/\s+/g, ' ')
		.replace(/^[\s:؛،,.-]+|[\s:؛،,.-]+$/g, '')
		.slice(0, 80)
		.trim();
}

function categoryHintName(bookMeta) {
	for (const rawHint of bookMeta?.categoryHints || []) {
		const direct = cleanSectionName(rawHint);
		if (!direct || /^(الرئيسية|home|كتب|مكتبة نور)$/i.test(direct)) continue;
		const cleaned = cleanSectionName(
			direct
			.replace(/^كتب\s+(?:في|عن)?\s*/u, '')
			.replace(/^الكتب\s+(?:في|عن)?\s*/u, '')
		);
		const normalized = normalizeArabic(cleaned);
		if (normalized.length < 5 || GENERIC_CATEGORY_HINTS.has(normalized)) continue;
		return cleaned;
	}
	return '';
}

function proposedSecondaryName(rule, bookMeta) {
	const hint = categoryHintName(bookMeta);
	if (hint) return hint;
	return cleanSectionName(rule?.secondaryNames?.[0] || seriesStemFromTitle(bookMeta?.title || '') || 'متفرقات');
}

function classifyByTaxonomy(sections, bookMeta) {
	const picked = pickTaxonomyRule(bookMeta);
	if (!picked) return null;

	const { rule, score } = picked;
	const haystack = contextForBook(bookMeta);
	const secondaryName = proposedSecondaryName(rule, bookMeta);
	const mainPick = pickBestNode(sections.tree, rule.mainNames, haystack, 12);
	if (!mainPick) {
		return {
			kind: 'create_main',
			newMainName: rule.mainNames[0],
			newSubName: rule.subNames[0],
			newSecondaryName: secondaryName,
			confidence: Math.min(0.68 + score * 0.01, 0.94),
			reasoning: `تصنيف موضوعي (${rule.id}) — لا يوجد قسم رئيسي مناسب، سيُنشأ المسار الثلاثي.`,
			method: 'taxonomy'
		};
	}

	const main = mainPick.node;
	const subPick = pickBestNode(main.children || [], rule.subNames, haystack, 12);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.subNames[0],
			newSecondaryName: secondaryName,
			confidence: Math.min(0.7 + score * 0.01, 0.95),
			reasoning: `تصنيف موضوعي (${rule.id}) — القسم الرئيسي موجود ولا يوجد فرعي مناسب.`,
			method: 'taxonomy'
		};
	}

	const sub = subPick.node;
	const secPick = pickBestNode(
		sub.children || [],
		[secondaryName, ...(rule.secondaryNames || [])],
		haystack,
		10
	);
	if (!secPick) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			newSecondaryName: secondaryName,
			confidence: Math.min(0.72 + score * 0.01, 0.96),
			reasoning: `تصنيف موضوعي (${rule.id}) — المسار موجود ويحتاج قسماً ثانوياً مناسباً.`,
			method: 'taxonomy'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secPick.node.id),
		confidence: Math.min(0.76 + score * 0.01, 0.98),
		reasoning: `تصنيف موضوعي (${rule.id}) إلى مسار ثلاثي موجود.`,
		method: 'taxonomy'
	};
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
		method: 'heuristic',
		scores: {
			main: bestMainScore,
			sub: bestSubScore,
			secondary: bestSecScore
		}
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

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}
	const taxonomyDecision = classifyByTaxonomy(sections, bookMeta);
	if (taxonomyDecision) return taxonomyDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			newMainName: 'المكتبة الإسلامية العامة',
			newSubName: 'موضوعات إسلامية متنوعة',
			newSecondaryName: proposedSecondaryName(TAXONOMY_RULES.at(-1), bookMeta),
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة آمنة — إنشاء مسار عام ثلاثي بدلاً من الخلط.',
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
			newSecondaryName: proposedSecondaryName(TAXONOMY_RULES.at(-1), bookMeta),
			confidence: Math.max(0.35, Math.min(sug.confidence, 0.7)),
			reasoning: 'وجد المصنّف قسماً رئيسياً وفرعياً فقط — إنشاء قسم ثانوي لإكمال الهيكل الثلاثي.',
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
