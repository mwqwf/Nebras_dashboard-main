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
	'شرح',
	'مختصر',
	'رساله',
	'رسالة',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'الي',
	'على',
	'عن',
	'في',
	'من',
	'مع',
	'او',
	'وهو',
	'وهي'
].map(normalizeArabic));

const DOMAIN_RULES = Object.freeze([
	{
		mainName: 'القرآن الكريم',
		mainAliases: ['التفسير وعلوم القرآن', 'علوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن'],
		secondaryName: 'التفسير',
		secondaryAliases: ['تفسير القرآن', 'كتب التفسير'],
		keywords: ['تفسير', 'القرآن', 'القران', 'سورة', 'آية', 'اية', 'أسباب النزول', 'اسباب النزول', 'علوم القرآن'],
		negativeKeywords: ['حديث', 'فقه', 'عقيدة']
	},
	{
		mainName: 'القرآن الكريم',
		mainAliases: ['التفسير وعلوم القرآن', 'علوم القرآن'],
		subName: 'التجويد والقراءات',
		subAliases: ['القراءات', 'التجويد'],
		secondaryName: 'التجويد والقراءات',
		secondaryAliases: ['أحكام التجويد', 'روايات القراءات'],
		keywords: ['تجويد', 'قراءات', 'قراءة', 'رواية حفص', 'رواية ورش', 'مخارج الحروف'],
		negativeKeywords: ['فقه', 'تاريخ']
	},
	{
		mainName: 'الحديث الشريف',
		mainAliases: ['الحديث وعلومه', 'السنة النبوية'],
		subName: 'الحديث وعلومه',
		subAliases: ['علوم الحديث', 'كتب الحديث'],
		secondaryName: 'كتب الحديث وشروحه',
		secondaryAliases: ['شروح الحديث', 'السنن والمسانيد', 'الصحيحين'],
		keywords: ['حديث', 'صحيح البخاري', 'صحيح مسلم', 'سنن', 'مسند', 'موطأ', 'موطا', 'الأحاديث', 'الاحاديث', 'شرح الحديث'],
		negativeKeywords: ['فقه مقارن', 'تاريخ']
	},
	{
		mainName: 'الحديث الشريف',
		mainAliases: ['الحديث وعلومه', 'السنة النبوية'],
		subName: 'مصطلح الحديث',
		subAliases: ['علوم الحديث'],
		secondaryName: 'مصطلح الحديث والجرح والتعديل',
		secondaryAliases: ['الجرح والتعديل', 'علل الحديث', 'رجال الحديث'],
		keywords: ['مصطلح الحديث', 'الجرح والتعديل', 'علل الحديث', 'رجال الحديث', 'تخريج', 'إسناد', 'اسناد', 'رواة'],
		negativeKeywords: ['فقه', 'تفسير']
	},
	{
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه وأصوله', 'الفقه'],
		subName: 'الفقه وأصوله',
		subAliases: ['أصول الفقه', 'اصول الفقه', 'فقه العبادات', 'فقه المعاملات'],
		secondaryName: 'الفقه العام',
		secondaryAliases: ['الفقه الإسلامي', 'كتب الفقه'],
		keywords: ['فقه', 'الأحكام', 'الاحكام', 'فتاوى', 'مذهب', 'المذاهب الفقهية', 'حلال وحرام'],
		negativeKeywords: ['تاريخ', 'سيرة', 'عقيدة', 'أدب عربي']
	},
	{
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه وأصوله', 'الفقه'],
		subName: 'العبادات',
		subAliases: ['فقه العبادات'],
		secondaryName: 'فقه العبادات',
		secondaryAliases: ['الصلاة والزكاة والصيام والحج'],
		keywords: ['صلاة', 'الصلاة', 'زكاة', 'الزكاة', 'صيام', 'الصوم', 'حج', 'الحج', 'طهارة', 'وضوء', 'عبادات'],
		negativeKeywords: ['تاريخ', 'عقيدة']
	},
	{
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه وأصوله', 'الفقه'],
		subName: 'المعاملات',
		subAliases: ['فقه المعاملات'],
		secondaryName: 'فقه المعاملات',
		secondaryAliases: ['البيوع والمعاملات'],
		keywords: ['معاملات', 'بيع', 'بيوع', 'ربا', 'إجارة', 'اجارة', 'نكاح', 'طلاق', 'مواريث', 'فرائض'],
		negativeKeywords: ['تاريخ', 'عقيدة']
	},
	{
		mainName: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة', 'التوحيد'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['التوحيد', 'أصول الاعتقاد', 'اصول الاعتقاد'],
		secondaryName: 'التوحيد والعقيدة',
		secondaryAliases: ['كتب العقيدة', 'أسماء الله وصفاته', 'اسماء الله وصفاته'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'ايمان', 'الشرك', 'أسماء الله', 'اسماء الله', 'صفات الله', 'السنة والجماعة', 'الإيمان'],
		negativeKeywords: ['تاريخ', 'فقه العبادات', 'أدب']
	},
	{
		mainName: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة', 'التوحيد'],
		subName: 'الفرق والردود',
		subAliases: ['الفرق والمذاهب', 'الملل والنحل'],
		secondaryName: 'الفرق والمذاهب والردود',
		secondaryAliases: ['الردود', 'الفرق'],
		keywords: ['فرق', 'الفرق', 'مذاهب', 'الملل والنحل', 'رد على', 'الجهمية', 'المعتزلة', 'الأشاعرة', 'الاشاعرة', 'الرافضة'],
		negativeKeywords: ['فقه', 'تاريخ عام']
	},
	{
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التاريخ والسير'],
		subName: 'السيرة النبوية',
		subAliases: ['سيرة النبي', 'شمائل النبي'],
		secondaryName: 'السيرة النبوية',
		secondaryAliases: ['غزوات الرسول', 'شمائل النبي'],
		keywords: ['سيرة', 'النبي', 'الرسول', 'غزوة', 'غزوات', 'شمائل', 'الهجرة', 'المغازي'],
		negativeKeywords: ['فقه', 'عقيدة']
	},
	{
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التاريخ والسير'],
		subName: 'التاريخ الإسلامي والتراجم',
		subAliases: ['التاريخ الإسلامي', 'التراجم والطبقات', 'السير'],
		secondaryName: 'التراجم والطبقات',
		secondaryAliases: ['أعلام المسلمين', 'اعلام المسلمين', 'تراجم'],
		keywords: ['تاريخ', 'تراجم', 'طبقات', 'أعلام', 'اعلام', 'وفيات', 'الخلفاء', 'الصحابة', 'التابعين'],
		negativeKeywords: ['فقه', 'عقيدة']
	},
	{
		mainName: 'الأخلاق والتزكية',
		mainAliases: ['التزكية والأخلاق', 'الرقائق والآداب'],
		subName: 'التزكية والرقائق',
		subAliases: ['الرقائق', 'الزهد'],
		secondaryName: 'الرقائق والزهد',
		secondaryAliases: ['تزكية النفس', 'المواعظ'],
		keywords: ['تزكية', 'رقائق', 'زهد', 'موعظة', 'مواعظ', 'قلوب', 'النفس', 'محاسبة النفس'],
		negativeKeywords: ['فقه', 'تاريخ']
	},
	{
		mainName: 'الأخلاق والتزكية',
		mainAliases: ['التزكية والأخلاق', 'الآداب الإسلامية'],
		subName: 'الأخلاق والآداب',
		subAliases: ['الآداب', 'الأخلاق الإسلامية'],
		secondaryName: 'الأخلاق والآداب الإسلامية',
		secondaryAliases: ['آداب إسلامية', 'مكارم الأخلاق'],
		keywords: ['أخلاق', 'اخلاق', 'آداب', 'اداب', 'مكارم الأخلاق', 'فضائل', 'النصائح', 'وصايا'],
		negativeKeywords: ['فقه', 'تاريخ', 'نحو']
	},
	{
		mainName: 'التربية والتعليم',
		mainAliases: ['طلب العلم', 'التعليم والدعوة'],
		subName: 'طلب العلم وآدابه',
		subAliases: ['آداب طالب العلم', 'اداب طالب العلم', 'التعليم الشرعي'],
		secondaryName: 'آداب طالب العلم',
		secondaryAliases: ['نصائح لطالب العلم', 'وصايا لطالب العلم', 'التعليمات العلمية'],
		keywords: ['طلب العلم', 'طالب العلم', 'آداب طالب العلم', 'اداب طالب العلم', 'نصائح لطالب العلم', 'وصايا لطالب العلم', 'التعليمات العلمية', 'التعلم والتعليم', 'التربية العلمية'],
		negativeKeywords: ['فقه', 'تاريخ', 'عقيدة الفرق']
	},
	{
		mainName: 'الدعوة والثقافة الإسلامية',
		mainAliases: ['الدعوة', 'الثقافة الإسلامية'],
		subName: 'الدعوة والإرشاد',
		subAliases: ['الدعوة إلى الله', 'الإرشاد'],
		secondaryName: 'الدعوة والإرشاد',
		secondaryAliases: ['فقه الدعوة', 'وسائل الدعوة'],
		keywords: ['دعوة', 'الدعاة', 'إرشاد', 'ارشاد', 'الأمر بالمعروف', 'النهي عن المنكر', 'خطب', 'محاضرات'],
		negativeKeywords: ['فقه العبادات', 'تاريخ']
	},
	{
		mainName: 'اللغة العربية',
		mainAliases: ['علوم اللغة العربية', 'اللغة والأدب'],
		subName: 'النحو والصرف',
		subAliases: ['النحو', 'الصرف'],
		secondaryName: 'النحو والصرف',
		secondaryAliases: ['قواعد اللغة العربية'],
		keywords: ['نحو', 'صرف', 'إعراب', 'اعراب', 'قواعد اللغة', 'الأجرومية', 'الاجرومية', 'ألفية ابن مالك', 'الفية ابن مالك'],
		negativeKeywords: ['فقه', 'عقيدة']
	},
	{
		mainName: 'اللغة العربية',
		mainAliases: ['علوم اللغة العربية', 'الأدب العربي'],
		subName: 'الأدب والبلاغة',
		subAliases: ['البلاغة', 'الأدب العربي'],
		secondaryName: 'الأدب والبلاغة',
		secondaryAliases: ['الشعر والنثر', 'علوم البلاغة'],
		keywords: ['بلاغة', 'أدب عربي', 'ادب عربي', 'شعر', 'نثر', 'بيان', 'معاني', 'بديع'],
		negativeKeywords: ['فقه', 'عقيدة']
	}
]);

function tokensFrom(s) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.map((w) => w.trim())
			.filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
	);
}

function namesFor(rule, key) {
	const primary = rule[`${key}Name`];
	const aliases = rule[`${key}Aliases`] || [];
	return [primary, ...aliases].filter(Boolean);
}

function textForBook(bookMeta) {
	return [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...(bookMeta?.categoryHints || [])
	]
		.filter(Boolean)
		.join(' ');
}

function scoreRule(rule, bookMeta) {
	const hay = normalizeArabic(textForBook(bookMeta));
	const hayTokens = tokensFrom(hay);
	let score = 0;
	for (const kw of rule.keywords || []) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (hay.includes(n)) {
			score += n.includes(' ') ? 8 : 5;
			continue;
		}
		const kwTokens = tokensFrom(n);
		let matched = 0;
		for (const t of kwTokens) if (hayTokens.has(t)) matched += 1;
		if (matched > 0 && matched === kwTokens.size) score += 4;
		else if (matched > 0 && kwTokens.size > 1) score += 1;
	}
	for (const kw of rule.negativeKeywords || []) {
		const n = normalizeArabic(kw);
		if (n && hay.includes(n)) score -= n.includes(' ') ? 5 : 3;
	}
	for (const name of [rule.mainName, rule.subName, rule.secondaryName]) {
		const n = normalizeArabic(name);
		if (n && hay.includes(n)) score += 4;
	}
	return score;
}

function pickDomainRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 6) return null;
	return { rule: best, score: bestScore };
}

function scoreNodeName(nodeName, preferredNames, haystack) {
	const node = normalizeArabic(nodeName);
	if (!node) return 0;
	const nodeTokens = tokensFrom(node);
	let score = 0;
	for (const name of preferredNames) {
		const n = normalizeArabic(name);
		if (!n) continue;
		if (node === n) score += 18;
		else if (node.includes(n) || n.includes(node)) score += 12;
		const wanted = tokensFrom(n);
		const overlap = tokenSetsOverlapRatio(nodeTokens, wanted);
		if (overlap >= 0.5) score += 8;
		else if (overlap >= 0.25) score += 4;
	}
	if (haystack.includes(node) && node.length >= 4) score += 4;
	return score;
}

function pickNode(nodes, preferredNames, haystack, minScore = 8) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNodeName(node?.name, preferredNames, haystack);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function fallbackSecondaryName(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4 && stem.length <= 80) return stem;
	const hint = (bookMeta?.categoryHints || []).map((x) => String(x || '').trim()).find((x) => x.length >= 4);
	return hint || 'موضوعات عامة';
}

function fallbackRule(bookMeta) {
	return {
		mainName: 'متفرقات إسلامية',
		mainAliases: ['مكتبة إسلامية عامة', 'كتب إسلامية عامة'],
		subName: 'كتب عامة',
		subAliases: ['موضوعات عامة'],
		secondaryName: fallbackSecondaryName(bookMeta),
		secondaryAliases: [],
		keywords: [],
		negativeKeywords: []
	};
}

function classifyByCuratedRules(sections, bookMeta) {
	const picked = pickDomainRule(bookMeta);
	const rule = picked?.rule || fallbackRule(bookMeta);
	const haystack = normalizeArabic(textForBook(bookMeta));

	const mainPick = pickNode(sections.tree, namesFor(rule, 'main'), haystack, 8);
	if (!mainPick) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: picked ? Math.min(0.55 + picked.score * 0.025, 0.9) : 0.35,
			reasoning: picked
				? `تصنيف موضوعي: إنشاء مسار ${rule.mainName} > ${rule.subName} > ${rule.secondaryName}`
				: 'لم يظهر مجال مناسب في الشجرة؛ إنشاء مسار عام بثلاثة مستويات.',
			method: picked ? 'curated_rules' : 'curated_fallback'
		};
	}

	const main = mainPick.node;
	const subPick = pickNode(main.children || [], namesFor(rule, 'sub'), haystack, 8);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: picked ? Math.min(0.6 + picked.score * 0.02, 0.9) : 0.4,
			reasoning: `وُجد القسم الرئيسي "${main.name}" ولم يوجد فرع مناسب؛ إنشاء ${rule.subName} > ${rule.secondaryName}.`,
			method: picked ? 'curated_rules' : 'curated_fallback'
		};
	}

	const sub = subPick.node;
	const secPick =
		pickNode(sub.children || [], namesFor(rule, 'secondary'), haystack, 8) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: rule.secondaryName,
			minScore: 9
		});
	if (!secPick) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence: picked ? Math.min(0.65 + picked.score * 0.02, 0.92) : 0.45,
			reasoning: `وُجد المسار ${main.name} > ${sub.name} دون قسم ثانوي مناسب؛ إنشاء "${rule.secondaryName}".`,
			method: picked ? 'curated_rules' : 'curated_fallback'
		};
	}

	const sec = secPick.node || secPick;
	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(sec.id),
		confidence: picked ? Math.min(0.7 + picked.score * 0.02, 0.95) : 0.5,
		reasoning: `مطابقة موضوعية ضمن ${main.name} > ${sub.name} > ${sec.name}.`,
		method: picked ? 'curated_rules' : 'curated_fallback'
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

	const autonomous = classifyByCuratedRules(sections, bookMeta);
	const sug =
		autonomous.kind === 'existing'
			? autonomous
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
	return classifyByCuratedRules(sections, bookMeta);
}
