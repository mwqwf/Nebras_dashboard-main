/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath, isBlacklistedSectionName } from './sectionsTree.js';

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

const GENERIC_SECTION_NAMES = new Set([
	normalizeArabic('كتب إسلامية'),
	normalizeArabic('مكتبة نور'),
	normalizeArabic('كتب عامة'),
	normalizeArabic('عام'),
	normalizeArabic('متفرقات')
]);

function uniq(values) {
	return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

function textIncludesAny(text, words = []) {
	const n = normalizeArabic(text);
	return words.some((w) => {
		const nw = normalizeArabic(w);
		return nw && n.includes(nw);
	});
}

function tokensOf(text) {
	return new Set(normalizeArabic(text).split(' ').filter((t) => t.length >= 3));
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

const TOPIC_RULES = [
	{
		key: 'learning_advice',
		mainName: 'التربية والأخلاق والآداب',
		mainAliases: ['التربية والأخلاق والآداب', 'الأخلاق والآداب', 'التزكية والأخلاق'],
		subName: 'آداب طلب العلم',
		subAliases: ['آداب طلب العلم', 'طلب العلم', 'التعليم والتعلم', 'آداب العالم والمتعلم'],
		secondaryName: 'نصائح وتوجيهات علمية',
		secondaryAliases: ['نصائح وتوجيهات علمية', 'وصايا طلب العلم', 'إرشادات طالب العلم'],
		keywords: ['طلب العلم', 'طالب العلم', 'طلاب العلم', 'آداب العالم', 'المتعلم', 'التعليم', 'التعلم', 'نصائح', 'وصايا', 'توجيهات علمية', 'المنهجية العلمية'],
		priority: 8
	},
	{
		key: 'fiqh_usul',
		mainName: 'الفقه وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه الإسلامي', 'فقه', 'أصول الفقه'],
		subName: 'أصول الفقه',
		subAliases: ['أصول الفقه', 'القواعد الفقهية', 'الاجتهاد والفتوى'],
		secondaryName: 'أصول الفقه وقواعده',
		secondaryAliases: ['أصول الفقه وقواعده', 'أصول الفقه', 'القواعد الفقهية'],
		keywords: ['أصول الفقه', 'القواعد الفقهية', 'قياس', 'إجماع', 'اجتهاد', 'الفتوى', 'المقاصد'],
		priority: 7
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه الإسلامي', 'فقه'],
		subName: 'الفقه الإسلامي',
		subAliases: ['الفقه الإسلامي', 'فقه العبادات', 'فقه المعاملات', 'فقه الأسرة'],
		secondaryName: 'مسائل فقهية عامة',
		secondaryAliases: ['مسائل فقهية عامة', 'فقه عام', 'المسائل الفقهية'],
		keywords: ['فقه', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'نكاح', 'طلاق', 'بيوع', 'معاملات', 'مواريث', 'جنايات', 'العبادات', 'المعاملات'],
		priority: 5
	},
	{
		key: 'aqida',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان', 'الفرق والمذاهب'],
		secondaryName: 'التوحيد والإيمان',
		secondaryAliases: ['التوحيد والإيمان', 'التوحيد', 'الإيمان', 'أسماء الله وصفاته'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'الشرك', 'الأسماء والصفات', 'صفات الله', 'القدر', 'الفرق', 'السلف', 'أهل السنة'],
		priority: 6
	},
	{
		key: 'quran_tafsir',
		mainName: 'القرآن وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن', 'القرآن الكريم'],
		subName: 'التفسير',
		subAliases: ['التفسير', 'تفاسير', 'تفسير القرآن'],
		secondaryName: 'تفسير القرآن الكريم',
		secondaryAliases: ['تفسير القرآن الكريم', 'التفسير العام', 'تفاسير القرآن'],
		keywords: ['تفسير', 'المفسر', 'القرآن', 'القران', 'سورة', 'آية', 'أسباب النزول', 'الطبري', 'ابن كثير', 'القرطبي'],
		priority: 5
	},
	{
		key: 'quran_recitation',
		mainName: 'القرآن وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن', 'القرآن الكريم'],
		subName: 'التجويد والقراءات',
		subAliases: ['التجويد والقراءات', 'التجويد', 'القراءات'],
		secondaryName: 'التجويد',
		secondaryAliases: ['التجويد', 'أحكام التجويد', 'القراءات القرآنية'],
		keywords: ['تجويد', 'قراءات', 'رواية حفص', 'ورش', 'أحكام التلاوة', 'ترتيل'],
		priority: 6
	},
	{
		key: 'hadith',
		mainName: 'الحديث وعلومه',
		mainAliases: ['الحديث وعلومه', 'الحديث الشريف', 'علوم الحديث'],
		subName: 'علوم الحديث',
		subAliases: ['علوم الحديث', 'مصطلح الحديث', 'الجرح والتعديل', 'كتب الحديث'],
		secondaryName: 'مصطلح الحديث',
		secondaryAliases: ['مصطلح الحديث', 'علوم الحديث', 'شرح الحديث'],
		keywords: ['حديث', 'أحاديث', 'السنة', 'سنن', 'صحيح البخاري', 'صحيح مسلم', 'مصطلح الحديث', 'الجرح والتعديل', 'الرواة', 'الإسناد'],
		priority: 5
	},
	{
		key: 'sirah',
		mainName: 'السيرة والتاريخ',
		mainAliases: ['السيرة والتاريخ', 'السيرة النبوية', 'التاريخ الإسلامي'],
		subName: 'السيرة النبوية',
		subAliases: ['السيرة النبوية', 'شمائل النبي', 'المغازي'],
		secondaryName: 'السيرة النبوية',
		secondaryAliases: ['السيرة النبوية', 'المغازي', 'الشمائل المحمدية'],
		keywords: ['سيرة', 'النبي', 'الرسول', 'محمد صلى الله عليه وسلم', 'شمائل', 'مغازي', 'غزوة'],
		priority: 6
	},
	{
		key: 'history',
		mainName: 'السيرة والتاريخ',
		mainAliases: ['السيرة والتاريخ', 'التاريخ الإسلامي', 'التاريخ'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'تاريخ الخلفاء', 'تاريخ الدول'],
		secondaryName: 'وقائع وتراجم تاريخية',
		secondaryAliases: ['وقائع وتراجم تاريخية', 'التاريخ العام', 'تاريخ الدول الإسلامية'],
		keywords: ['تاريخ', 'الدولة', 'الخلافة', 'الخلفاء', 'الأموي', 'العباسي', 'الأندلس', 'فتوح', 'وقائع'],
		priority: 4
	},
	{
		key: 'biographies',
		mainName: 'التراجم والأعلام',
		mainAliases: ['التراجم والأعلام', 'تراجم', 'سير الأعلام', 'الطبقات'],
		subName: 'تراجم العلماء والأعلام',
		subAliases: ['تراجم العلماء والأعلام', 'سير الأعلام', 'الطبقات'],
		secondaryName: 'تراجم وسير',
		secondaryAliases: ['تراجم وسير', 'سير الأعلام', 'تراجم العلماء'],
		keywords: ['ترجمة', 'تراجم', 'سير أعلام', 'الأعلام', 'الطبقات', 'وفيات', 'حياة', 'العلماء'],
		priority: 4
	},
	{
		key: 'arabic_language',
		mainName: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية وآدابها', 'اللغة العربية', 'العربية'],
		subName: 'النحو والصرف',
		subAliases: ['النحو والصرف', 'النحو', 'الصرف', 'الإعراب'],
		secondaryName: 'النحو والصرف',
		secondaryAliases: ['النحو والصرف', 'النحو', 'الصرف'],
		keywords: ['نحو', 'صرف', 'إعراب', 'لغة عربية', 'اللغة العربية', 'الأجرومية', 'ألفية ابن مالك'],
		priority: 5
	},
	{
		key: 'arabic_literature',
		mainName: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية وآدابها', 'الأدب العربي', 'الآداب'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الشعر والنثر', 'البلاغة'],
		secondaryName: 'نصوص ودراسات أدبية',
		secondaryAliases: ['نصوص ودراسات أدبية', 'الشعر العربي', 'النثر العربي'],
		keywords: ['أدب عربي', 'الأدب', 'شعر', 'ديوان', 'نثر', 'بلاغة', 'قصة', 'رواية', 'مقامات'],
		priority: 3
	},
	{
		key: 'tazkiya',
		mainName: 'التربية والأخلاق والآداب',
		mainAliases: ['التربية والأخلاق والآداب', 'الأخلاق والآداب', 'التزكية والأخلاق'],
		subName: 'الأخلاق والتزكية',
		subAliases: ['الأخلاق والتزكية', 'تزكية النفس', 'الرقائق', 'الآداب الشرعية'],
		secondaryName: 'تزكية النفس والرقائق',
		secondaryAliases: ['تزكية النفس والرقائق', 'الرقائق', 'الأخلاق الإسلامية'],
		keywords: ['أخلاق', 'تزكية', 'رقائق', 'زهد', 'آداب', 'موعظة', 'نصيحة', 'قلوب', 'سلوك'],
		priority: 3
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		mainAliases: ['الدعوة والثقافة الإسلامية', 'الدعوة', 'الثقافة الإسلامية'],
		subName: 'الدعوة والإرشاد',
		subAliases: ['الدعوة والإرشاد', 'الدعوة', 'الإرشاد'],
		secondaryName: 'قضايا دعوية وثقافية',
		secondaryAliases: ['قضايا دعوية وثقافية', 'الدعوة والإرشاد', 'الثقافة الإسلامية'],
		keywords: ['دعوة', 'داعية', 'إرشاد', 'ثقافة إسلامية', 'قضايا معاصرة', 'محاضرات', 'خطبة', 'خطب'],
		priority: 3
	}
];

const SECONDARY_OVERRIDES = [
	{ name: 'الصلاة', words: ['صلاة', 'الصلوات', 'الصلاه'] },
	{ name: 'الزكاة', words: ['زكاة', 'الزكاه'] },
	{ name: 'الصيام', words: ['صيام', 'الصوم', 'رمضان'] },
	{ name: 'الحج والعمرة', words: ['حج', 'عمرة', 'مناسك'] },
	{ name: 'فقه الأسرة', words: ['نكاح', 'زواج', 'طلاق', 'أسرة', 'الاسرة'] },
	{ name: 'المعاملات المالية', words: ['بيوع', 'بيع', 'ربا', 'معاملات', 'تجارة'] },
	{ name: 'أسماء الله وصفاته', words: ['أسماء الله', 'صفات الله', 'الأسماء والصفات'] },
	{ name: 'الفرق والمذاهب', words: ['فرق', 'مذاهب', 'الجهمية', 'المعتزلة', 'الأشاعرة'] },
	{ name: 'القراءات القرآنية', words: ['قراءات', 'رواية حفص', 'ورش'] },
	{ name: 'أسباب النزول', words: ['أسباب النزول', 'اسباب النزول'] },
	{ name: 'الجرح والتعديل', words: ['جرح وتعديل', 'الجرح والتعديل', 'الرواة'] },
	{ name: 'الشعر العربي', words: ['شعر', 'ديوان', 'قصائد'] },
	{ name: 'البلاغة', words: ['بلاغة', 'بيان', 'بديع', 'معاني'] }
];

function ruleScore(rule, haystack) {
	let score = Number(rule.priority || 0);
	for (const kw of rule.keywords || []) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (haystack.includes(n)) score += n.includes(' ') ? 6 : 3;
	}
	return score;
}

function pickTopicRule(bookMeta) {
	const haystack = haystackForBook(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		const score = ruleScore(rule, haystack);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= 9 ? { ...best, score: bestScore } : null;
}

function refineSecondaryName(rule, bookMeta) {
	const haystack = haystackForBook(bookMeta);
	for (const item of SECONDARY_OVERRIDES) {
		if (textIncludesAny(haystack, item.words)) return item.name;
	}
	return rule.secondaryName;
}

function sectionNameScore(name, aliases = []) {
	const n = normalizeArabic(name);
	if (!n || GENERIC_SECTION_NAMES.has(n) || isBlacklistedSectionName(name)) return 0;
	let score = 0;
	for (const alias of aliases) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) score += 14;
		else if (n.includes(a) || a.includes(n)) score += 10;
		else {
			const ratio = tokenSetsOverlapRatio(tokensOf(n), tokensOf(a));
			if (ratio >= 0.5) score += 7;
			else if (ratio >= 0.25) score += 3;
		}
	}
	return score;
}

function findBestNode(nodes, aliases, minScore = 8) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = sectionNameScore(node?.name, aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
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

	const confidence = Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05, 0.85);
	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec ? bestSec.id : null,
		confidence,
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

function decisionForRule(sections, rule, bookMeta) {
	const secondaryName = refineSecondaryName(rule, bookMeta);
	const secondaryAliases = uniq([secondaryName, ...(rule.secondaryAliases || [])]);
	const main = findBestNode(sections.tree, rule.mainAliases || [rule.mainName], 8);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.72 + rule.score * 0.01, 0.96),
			reasoning: `قاعدة موضوعية: إنشاء مسار جديد لـ ${rule.mainName} > ${rule.subName} > ${secondaryName}`,
			method: `topic:${rule.key}`
		};
	}

	const sub = findBestNode(main.node.children || [], rule.subAliases || [rule.subName], 7);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.node.id),
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.73 + rule.score * 0.01, 0.97),
			reasoning: `قاعدة موضوعية: القسم الرئيسي موجود، وسيُنشأ فرع ${rule.subName} ثم ${secondaryName}`,
			method: `topic:${rule.key}`
		};
	}

	const secondary = findBestNode(sub.node.children || [], secondaryAliases, 7);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.node.id),
			subId: String(sub.node.id),
			newSecondaryName: secondaryName,
			confidence: Math.min(0.75 + rule.score * 0.01, 0.98),
			reasoning: `قاعدة موضوعية: المسار الأب موجود، وسيُنشأ قسم ثانوي ${secondaryName}`,
			method: `topic:${rule.key}`
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.node.id),
		subId: String(sub.node.id),
		secondaryId: String(secondary.node.id),
		confidence: Math.min(0.8 + rule.score * 0.01, 0.99),
		reasoning: `قاعدة موضوعية: وُجد مسار مناسب لـ ${rule.mainName} > ${rule.subName} > ${secondary.node.name}`,
		method: `topic:${rule.key}`
	};
}

function fallbackSecondaryName(bookMeta) {
	const hint = String(bookMeta?.categoryHints?.[0] || '').trim();
	if (hint && hint.length <= 80 && !isBlacklistedSectionName(hint)) return hint;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4 && stem.length <= 80 && !isBlacklistedSectionName(stem)) return stem;
	return 'متفرقات';
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
	const rule = pickTopicRule(bookMeta);
	if (rule) return decisionForRule(sections, rule, bookMeta);

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName: 'كتب عامة',
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة آمنة — إنشاء مسار عام ثلاثي المستويات.',
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
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: Math.min(sug.confidence, 0.7),
			reasoning: 'مطابقة محليّة وجدت main/sub فقط — إنشاء قسم ثانوي لضمان الهيكل الثلاثي.',
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
