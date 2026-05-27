/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف على قواعد علميّة
 * محليّة + مطابقة نصيّة عربية مع normalization، دون أيّ تكلفة شبكيّة.
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
		.replace(/[^\u0600-\u06FFa-z0-9\s]/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

const STOP_WORDS = new Set(
	[
		'كتاب',
		'كتب',
		'في',
		'من',
		'عن',
		'الى',
		'علي',
		'هذا',
		'هذه',
		'ذلك',
		'تلك',
		'مع',
		'شرح',
		'مختصر',
		'جامع',
		'رساله',
		'المجلد',
		'الجزء'
	].map(normalizeArabic)
);

function tokensOf(s) {
	return normalizeArabic(s)
		.split(' ')
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function haystackForBook(bookMeta) {
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

function includesPhrase(haystack, phrase) {
	const p = normalizeArabic(phrase);
	return Boolean(p && haystack.includes(p));
}

function tokenOverlapScore(left, right) {
	const a = new Set(tokensOf(left));
	const b = new Set(tokensOf(right));
	if (!a.size || !b.size) return 0;
	let score = 0;
	for (const token of a) {
		if (b.has(token)) score += 1;
	}
	return score;
}

/**
 * قواعد تصنيف علميّة صريحة. الهدف منها ألّا يقع الكتاب في "أقرب اسم"
 * عشوائياً؛ بل في مجال معرفي واضح، ثم مستوى فرعي، ثم ثانوي قبل المحتوى.
 */
const DISCIPLINE_RULES = Object.freeze([
	{
		id: 'quran-tafsir',
		mainName: 'القرآن وعلومه',
		mainCandidates: ['علوم القرآن', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'التفسير وعلوم القرآن',
		subCandidates: ['التفسير', 'علوم القرآن'],
		secondaryName: 'التفسير',
		secondaryCandidates: ['تفسير القرآن', 'كتب التفسير'],
		strong: ['تفسير القرآن', 'كتب التفسير', 'تفسير ابن كثير', 'تفسير الطبري', 'تفسير القرطبي'],
		keywords: ['تفسير', 'مفسر', 'القرآن', 'سورة', 'آية', 'معاني القرآن']
	},
	{
		id: 'quran-sciences',
		mainName: 'القرآن وعلومه',
		mainCandidates: ['علوم القرآن', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'التفسير وعلوم القرآن',
		subCandidates: ['علوم القرآن', 'التفسير'],
		secondaryName: 'علوم القرآن',
		secondaryCandidates: ['القراءات والتجويد', 'أسباب النزول'],
		strong: ['علوم القرآن', 'أسباب النزول', 'الناسخ والمنسوخ', 'رسم المصحف'],
		keywords: ['قراءات', 'تجويد', 'مصاحف', 'المصحف', 'نزول', 'سور', 'آيات']
	},
	{
		id: 'hadith-texts',
		mainName: 'الحديث وعلومه',
		mainCandidates: ['السنة النبوية', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'الحديث الشريف',
		subCandidates: ['كتب الحديث', 'السنة النبوية'],
		secondaryName: 'متون الحديث وشروحه',
		secondaryCandidates: ['شروح الحديث', 'متون الحديث'],
		strong: ['صحيح البخاري', 'صحيح مسلم', 'سنن أبي داود', 'جامع الترمذي', 'مسند أحمد'],
		keywords: ['حديث', 'أحاديث', 'سنن', 'صحيح', 'مسند', 'رواية', 'راوي', 'متون']
	},
	{
		id: 'hadith-methodology',
		mainName: 'الحديث وعلومه',
		mainCandidates: ['السنة النبوية', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'مصطلح الحديث',
		subCandidates: ['علوم الحديث', 'الجرح والتعديل'],
		secondaryName: 'علوم الحديث',
		secondaryCandidates: ['مصطلح الحديث', 'الجرح والتعديل', 'تخريج الحديث'],
		strong: ['مصطلح الحديث', 'علوم الحديث', 'الجرح والتعديل', 'تخريج الحديث'],
		keywords: ['إسناد', 'أسانيد', 'علل', 'رجال', 'رواة', 'تخريج', 'جرح', 'تعديل']
	},
	{
		id: 'fiqh-usul',
		mainName: 'الفقه وأصوله',
		mainCandidates: ['الفقه الإسلامي', 'الشريعة والفقه', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'أصول الفقه',
		subCandidates: ['الفقه وأصوله', 'الشريعة'],
		secondaryName: 'أصول الفقه والقواعد الفقهية',
		secondaryCandidates: ['أصول الفقه', 'القواعد الفقهية'],
		strong: ['أصول الفقه', 'القواعد الفقهية', 'مقاصد الشريعة', 'الاستدلال الفقهي'],
		keywords: ['أصولي', 'استنباط', 'قياس', 'إجماع', 'مقاصد', 'قواعد فقهية']
	},
	{
		id: 'fiqh-worship',
		mainName: 'الفقه وأصوله',
		mainCandidates: ['الفقه الإسلامي', 'الشريعة والفقه', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'الفقه الإسلامي',
		subCandidates: ['الفقه', 'فقه العبادات'],
		secondaryName: 'العبادات',
		secondaryCandidates: ['فقه العبادات', 'الصلاة والزكاة والصيام والحج'],
		strong: ['فقه العبادات', 'أحكام الصلاة', 'أحكام الزكاة', 'أحكام الصيام', 'أحكام الحج'],
		keywords: ['فقه', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'عمرة', 'عبادات']
	},
	{
		id: 'fiqh-transactions',
		mainName: 'الفقه وأصوله',
		mainCandidates: ['الفقه الإسلامي', 'الشريعة والفقه', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'الفقه الإسلامي',
		subCandidates: ['الفقه', 'فقه المعاملات'],
		secondaryName: 'المعاملات والأحوال الشخصية',
		secondaryCandidates: ['فقه المعاملات', 'الأحوال الشخصية'],
		strong: ['فقه المعاملات', 'الأحوال الشخصية', 'أحكام النكاح', 'أحكام الطلاق', 'المواريث'],
		keywords: ['بيع', 'ربا', 'نكاح', 'طلاق', 'ميراث', 'مواريث', 'وقف', 'قضاء', 'معاملات']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		mainCandidates: ['العقيدة الإسلامية', 'التوحيد', 'العلوم الشرعية', 'كتب إسلامية'],
		subName: 'العقيدة الإسلامية',
		subCandidates: ['التوحيد', 'الإيمان'],
		secondaryName: 'التوحيد والإيمان',
		secondaryCandidates: ['كتب العقيدة', 'أصول الاعتقاد'],
		strong: ['العقيدة', 'التوحيد', 'أصول الإيمان', 'شرح العقيدة', 'أصول الاعتقاد'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'الشرك', 'صفات', 'قدر', 'الاعتقاد', 'الواسطية']
	},
	{
		id: 'sira',
		mainName: 'السيرة والتاريخ',
		mainCandidates: ['السيرة النبوية', 'التاريخ الإسلامي', 'كتب إسلامية'],
		subName: 'السيرة النبوية',
		subCandidates: ['السيرة', 'شمائل النبي'],
		secondaryName: 'السيرة النبوية والشمائل',
		secondaryCandidates: ['السيرة النبوية', 'الشمائل المحمدية'],
		strong: ['السيرة النبوية', 'شمائل النبي', 'غزوات الرسول', 'دلائل النبوة'],
		keywords: ['سيرة', 'النبي', 'الرسول', 'غزوة', 'غزوات', 'شمائل', 'هجرة']
	},
	{
		id: 'history',
		mainName: 'السيرة والتاريخ',
		mainCandidates: ['التاريخ الإسلامي', 'التاريخ', 'كتب إسلامية'],
		subName: 'التاريخ الإسلامي',
		subCandidates: ['التاريخ', 'الحضارة الإسلامية'],
		secondaryName: 'التاريخ والتراجم',
		secondaryCandidates: ['التراجم والسير', 'الطبقات'],
		strong: ['التاريخ الإسلامي', 'تراجم الرجال', 'الطبقات', 'الحضارة الإسلامية'],
		keywords: ['تاريخ', 'تراجم', 'طبقات', 'خلافة', 'دولة', 'حضارة', 'أعلام', 'سير']
	},
	{
		id: 'akhlaq-adab',
		mainName: 'الآداب والأخلاق',
		mainCandidates: ['التزكية والأخلاق', 'الرقائق والآداب', 'كتب إسلامية'],
		subName: 'التزكية والآداب',
		subCandidates: ['الأخلاق', 'الآداب الشرعية', 'التزكية'],
		secondaryName: 'الآداب الشرعية والأخلاق',
		secondaryCandidates: ['الأخلاق والآداب', 'الرقائق'],
		strong: ['الآداب الشرعية', 'مكارم الأخلاق', 'تزكية النفس', 'آداب طالب العلم'],
		keywords: ['أدب', 'آداب', 'أخلاق', 'تزكية', 'رقائق', 'زهد', 'نصيحة', 'نصائح']
	},
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		mainCandidates: ['التعليم', 'الثقافة الإسلامية', 'كتب إسلامية'],
		subName: 'التعليم والإرشاد',
		subCandidates: ['طلب العلم', 'التربية العلمية', 'الإرشاد'],
		secondaryName: 'آداب طلب العلم والتعليم',
		secondaryCandidates: ['طلب العلم', 'آداب المتعلم والمعلم'],
		strong: ['طلب العلم', 'آداب طالب العلم', 'التعليم الشرعي', 'التعليمات العلمية', 'النصائح العلمية'],
		keywords: ['تعليم', 'تعلم', 'معلم', 'متعلم', 'طالب', 'علمية', 'دراسة', 'منهجية', 'نصائح']
	},
	{
		id: 'arabic-language',
		mainName: 'اللغة العربية',
		mainCandidates: ['علوم اللغة العربية', 'الأدب العربي'],
		subName: 'علوم اللغة العربية',
		subCandidates: ['النحو والصرف', 'البلاغة'],
		secondaryName: 'النحو والصرف والبلاغة',
		secondaryCandidates: ['النحو', 'الصرف', 'البلاغة'],
		strong: ['النحو والصرف', 'البلاغة العربية', 'علوم اللغة العربية'],
		keywords: ['نحو', 'صرف', 'بلاغة', 'إعراب', 'لغة', 'لسان', 'معجم', 'قاموس']
	},
	{
		id: 'dawah-thought',
		mainName: 'الدعوة والفكر',
		mainCandidates: ['الدعوة الإسلامية', 'الفكر الإسلامي', 'كتب إسلامية'],
		subName: 'الدعوة والثقافة الإسلامية',
		subCandidates: ['الدعوة', 'الثقافة الإسلامية'],
		secondaryName: 'الدعوة والإصلاح',
		secondaryCandidates: ['الفكر الإسلامي', 'الإصلاح'],
		strong: ['الدعوة الإسلامية', 'الفكر الإسلامي', 'الإصلاح', 'الثقافة الإسلامية'],
		keywords: ['دعوة', 'داعية', 'فكر', 'ثقافة', 'إصلاح', 'مجتمع', 'شبهات']
	}
]);

function scoreRule(rule, bookMeta) {
	const haystack = haystackForBook(bookMeta);
	let score = 0;
	for (const phrase of rule.strong || []) {
		if (includesPhrase(haystack, phrase)) score += 8;
	}
	for (const phrase of rule.keywords || []) {
		if (includesPhrase(haystack, phrase)) score += 4;
		else score += tokenOverlapScore(haystack, phrase);
	}
	for (const hint of bookMeta?.categoryHints || []) {
		const nHint = normalizeArabic(hint);
		for (const phrase of [...(rule.strong || []), ...(rule.keywords || [])]) {
			if (nHint.includes(normalizeArabic(phrase))) score += 3;
		}
	}
	return score;
}

function pickDisciplineRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of DISCIPLINE_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 5) return null;
	return { ...best, ruleScore: bestScore };
}

function nodeScore(node, names, haystack) {
	const nodeName = normalizeArabic(node?.name || '');
	if (!nodeName) return 0;
	let score = 0;
	for (const name of names.filter(Boolean)) {
		const n = normalizeArabic(name);
		if (!n) continue;
		if (nodeName === n) score += 100;
		else if (nodeName.includes(n) || n.includes(nodeName)) score += 55;
		score += tokenOverlapScore(nodeName, n) * 12;
	}
	if (haystack.includes(nodeName) && nodeName.length >= 4) score += 12;
	return score;
}

function pickBestNode(nodes, names, haystack, minScore = 24) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nodeScore(node, names, haystack);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function targetFromRule(rule) {
	return {
		mainName: rule.mainName,
		mainCandidates: [rule.mainName, ...(rule.mainCandidates || [])],
		subName: rule.subName,
		subCandidates: [rule.subName, ...(rule.subCandidates || [])],
		secondaryName: rule.secondaryName,
		secondaryCandidates: [rule.secondaryName, ...(rule.secondaryCandidates || [])],
		confidence: Math.min(0.68 + Number(rule.ruleScore || 0) * 0.02, 0.96),
		reasoning: `تصنيف علمي مضبوط: ${rule.id}`,
		method: 'discipline-rules'
	};
}

function cleanGeneratedSectionName(raw, fallback) {
	let name = String(raw || '')
		.replace(/^\s*(?:كتب|كتاب)\s+(?:في\s+)?/u, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!name || normalizeArabic(name).length < 3) name = fallback;
	return name.slice(0, 80);
}

function fallbackTarget(bookMeta) {
	const hint = (bookMeta?.categoryHints || []).find((x) => normalizeArabic(x).length >= 3) || '';
	const subName = cleanGeneratedSectionName(hint, 'كتب عامة');
	const secondaryName = seriesStemFromTitle(bookMeta?.title || '') || 'مصنفات عامة';
	return {
		mainName: 'مكتبة نور',
		mainCandidates: ['مكتبة نور', 'كتب إسلامية', 'الثقافة الإسلامية'],
		subName,
		subCandidates: [subName],
		secondaryName: cleanGeneratedSectionName(secondaryName, 'مصنفات عامة'),
		secondaryCandidates: [secondaryName],
		confidence: 0.35,
		reasoning: 'لم تظهر قرائن علمية كافية؛ إنشاء مسار عام منفصل لتجنّب الخلط.',
		method: 'fallback-create'
	};
}

function resolveTargetAgainstTree(sections, target) {
	const haystack = normalizeArabic(
		[
			target.mainName,
			target.subName,
			target.secondaryName,
			...(target.mainCandidates || []),
			...(target.subCandidates || []),
			...(target.secondaryCandidates || [])
		].join(' ')
	);
	const mainPick = pickBestNode(sections.tree || [], target.mainCandidates, haystack, 24);
	if (!mainPick) {
		return {
			kind: 'create_main',
			newMainName: target.mainName,
			newSubName: target.subName,
			newSecondaryName: target.secondaryName,
			confidence: target.confidence,
			reasoning: target.reasoning,
			method: target.method
		};
	}

	const mainNode = mainPick.node;
	const subPick = pickBestNode(mainNode.children || [], target.subCandidates, haystack, 24);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(mainNode.id),
			newSubName: target.subName,
			newSecondaryName: target.secondaryName,
			confidence: target.confidence,
			reasoning: target.reasoning,
			method: target.method
		};
	}

	const subNode = subPick.node;
	const secondaryPick = pickBestNode(
		subNode.children || [],
		target.secondaryCandidates,
		haystack,
		20
	);
	if (!secondaryPick) {
		return {
			kind: 'create_secondary',
			mainId: String(mainNode.id),
			subId: String(subNode.id),
			newSecondaryName: target.secondaryName,
			confidence: target.confidence,
			reasoning: target.reasoning,
			method: target.method
		};
	}

	return {
		kind: 'existing',
		mainId: String(mainNode.id),
		subId: String(subNode.id),
		secondaryId: String(secondaryPick.node.id),
		confidence: target.confidence,
		reasoning: target.reasoning,
		method: target.method
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
		confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05 + Math.max(bestSecScore, 0) * 0.03, 0.85),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic',
		scores: { main: bestMainScore, sub: bestSubScore, secondary: bestSecScore }
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
	const sug =
		decision.kind === 'existing'
			? {
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId || null,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method
				}
			: {
					mainId: decision.mainId || '',
					subId: decision.subId || '',
					secondaryId: decision.secondaryId || null,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method,
					create: {
						kind: decision.kind,
						mainName: decision.newMainName || null,
						subName: decision.newSubName || null,
						secondaryName: decision.newSecondaryName || null
					}
				};
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
	const rule = pickDisciplineRule(bookMeta);
	const target = rule ? targetFromRule(rule) : fallbackTarget(bookMeta);

	if (treeIsEmpty) {
		return {
			kind: 'create_main',
			newMainName: target.mainName,
			newSubName: target.subName,
			newSecondaryName: target.secondaryName,
			confidence: target.confidence,
			reasoning: `${target.reasoning} — لا توجد شجرة أقسام بعد.`,
			method: target.method
		};
	}

	const decision = resolveTargetAgainstTree(sections, target);
	if (decision.kind !== 'existing' || decision.secondaryId) return decision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (sug?.secondaryId) {
		const valid = validateHierarchyPath(
			{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId },
			sections.index
		);
		if (valid.valid && Number(sug.scores?.secondary || 0) > 0) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: String(sug.secondaryId),
				confidence: Math.min(sug.confidence, 0.76),
				reasoning: `${target.reasoning} + مطابقة ثانوية موجودة`,
				method: target.method
			};
		}
	}

	const autoSec = pickReuseSecondary(sections, String(decision.subId), bookMeta, {
		proposedNewName: target.secondaryName,
		minScore: 10
	});
	if (autoSec) {
		return {
			...decision,
			secondaryId: autoSec.id,
			reasoning: `${decision.reasoning} — إعادة استخدام قسم ثانوي مطابق: ${autoSec.name}`
		};
	}
	return decision;
}
