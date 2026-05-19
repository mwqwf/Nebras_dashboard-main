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

const TAXONOMY_RULES = Object.freeze([
	{
		main: 'القرآن الكريم وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		sub: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن'],
		secondary: 'التفسير',
		secondaryAliases: ['كتب التفسير', 'تفاسير القرآن'],
		keywords: ['تفسير', 'المفسرون', 'الطبري', 'القرطبي', 'ابن كثير', 'معاني القرآن']
	},
	{
		main: 'القرآن الكريم وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		sub: 'التفسير وعلوم القرآن',
		subAliases: ['علوم القرآن'],
		secondary: 'علوم القرآن',
		secondaryAliases: ['مباحث علوم القرآن'],
		keywords: ['علوم القرآن', 'أسباب النزول', 'الناسخ والمنسوخ', 'إعجاز القرآن', 'رسم المصحف', 'المكي والمدني']
	},
	{
		main: 'القرآن الكريم وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		sub: 'التجويد والقراءات',
		subAliases: ['القراءات', 'التجويد'],
		secondary: 'التجويد والقراءات',
		secondaryAliases: ['أحكام التجويد', 'علم القراءات'],
		keywords: ['تجويد', 'قراءات', 'القراءات', 'ورش', 'حفص', 'رواية', 'أحكام التلاوة']
	},
	{
		main: 'الحديث الشريف وعلومه',
		mainAliases: ['الحديث وعلومه', 'السنة النبوية', 'علوم الحديث'],
		sub: 'كتب الحديث وشروحه',
		subAliases: ['الحديث الشريف', 'شروح الحديث'],
		secondary: 'متون وشروح الحديث',
		secondaryAliases: ['كتب الحديث', 'شروح الحديث'],
		keywords: ['حديث', 'أحاديث', 'صحيح البخاري', 'صحيح مسلم', 'سنن', 'مسند', 'موطأ', 'رياض الصالحين', 'الأربعين النووية']
	},
	{
		main: 'الحديث الشريف وعلومه',
		mainAliases: ['الحديث وعلومه', 'علوم الحديث'],
		sub: 'علوم الحديث',
		subAliases: ['مصطلح الحديث'],
		secondary: 'مصطلح الحديث وعلله',
		secondaryAliases: ['مصطلح الحديث', 'علل الحديث'],
		keywords: ['مصطلح الحديث', 'علل الحديث', 'جرح وتعديل', 'رجال الحديث', 'تخريج', 'إسناد', 'رواة']
	},
	{
		main: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة', 'العقيدة والتوحيد', 'التوحيد'],
		sub: 'العقيدة والتوحيد',
		subAliases: ['التوحيد', 'أصول الاعتقاد'],
		secondary: 'التوحيد وأصول الاعتقاد',
		secondaryAliases: ['كتب التوحيد', 'أصول الاعتقاد'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'أسماء وصفات', 'الإيمان', 'الشرك', 'الإلحاد', 'أصول الاعتقاد']
	},
	{
		main: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة', 'العقيدة والتوحيد'],
		sub: 'الفرق والردود',
		subAliases: ['الفرق', 'الردود'],
		secondary: 'الفرق والردود العقدية',
		secondaryAliases: ['الرد على الفرق', 'الملل والنحل'],
		keywords: ['الفرق', 'الرد على', 'الجهمية', 'المعتزلة', 'الأشاعرة', 'الرافضة', 'القدرية', 'الملل والنحل']
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه إسلامي', 'الفقه'],
		sub: 'العبادات',
		subAliases: ['فقه العبادات'],
		secondary: 'فقه العبادات',
		secondaryAliases: ['أحكام العبادات'],
		keywords: ['طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'عمرة', 'عبادات', 'الأذان', 'الجنائز']
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه إسلامي', 'الفقه'],
		sub: 'المعاملات',
		subAliases: ['فقه المعاملات'],
		secondary: 'فقه المعاملات',
		secondaryAliases: ['أحكام المعاملات'],
		keywords: ['بيوع', 'بيع', 'ربا', 'إجارة', 'وقف', 'شركة', 'معاملات', 'اقتصاد إسلامي', 'قضاء', 'سياسة شرعية']
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه إسلامي', 'الفقه'],
		sub: 'فقه الأسرة',
		subAliases: ['الأحوال الشخصية', 'النكاح والطلاق'],
		secondary: 'فقه الأسرة والأحوال الشخصية',
		secondaryAliases: ['الأحوال الشخصية', 'النكاح والطلاق'],
		keywords: ['نكاح', 'زواج', 'طلاق', 'عدة', 'رضاع', 'حضانة', 'نفقة', 'أسرة', 'أحوال شخصية']
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه إسلامي', 'الفقه'],
		sub: 'المواريث',
		subAliases: ['الفرائض'],
		secondary: 'المواريث والفرائض',
		secondaryAliases: ['علم الفرائض'],
		keywords: ['ميراث', 'مواريث', 'فرائض', 'تركة', 'وارث']
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه إسلامي', 'الفقه'],
		sub: 'أصول الفقه والقواعد',
		subAliases: ['أصول الفقه', 'القواعد الفقهية'],
		secondary: 'أصول الفقه والقواعد',
		secondaryAliases: ['القواعد الفقهية', 'مقاصد الشريعة'],
		keywords: ['أصول الفقه', 'قواعد فقهية', 'مقاصد', 'استصحاب', 'قياس', 'إجماع', 'استحسان']
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه إسلامي', 'الفقه'],
		sub: 'الفقه العام',
		subAliases: ['كتب الفقه', 'فقه عام'],
		secondary: 'مسائل فقهية عامة',
		secondaryAliases: ['الفقه العام', 'فتاوى'],
		keywords: ['فقه', 'أحكام', 'فتاوى', 'فتوى', 'حلال', 'حرام', 'مسائل فقهية']
	},
	{
		main: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة والتاريخ', 'السيرة النبوية', 'التاريخ الإسلامي'],
		sub: 'السيرة النبوية',
		subAliases: ['السيرة', 'الشمائل والمغازي'],
		secondary: 'السيرة النبوية والشمائل',
		secondaryAliases: ['السيرة النبوية', 'الشمائل', 'المغازي'],
		keywords: ['سيرة', 'السيرة النبوية', 'شمائل', 'مغازي', 'غزوات', 'النبي', 'الرسول']
	},
	{
		main: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة والتاريخ', 'التاريخ الإسلامي'],
		sub: 'التاريخ الإسلامي',
		subAliases: ['تاريخ الإسلام'],
		secondary: 'التاريخ الإسلامي',
		secondaryAliases: ['تاريخ المسلمين'],
		keywords: ['تاريخ', 'الخلافة', 'الدولة الأموية', 'الدولة العباسية', 'الأندلس', 'فتوحات', 'حضارة إسلامية']
	},
	{
		main: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة والتاريخ', 'التراجم والطبقات'],
		sub: 'التراجم والطبقات',
		subAliases: ['تراجم', 'طبقات', 'سير الأعلام'],
		secondary: 'التراجم وسير الأعلام',
		secondaryAliases: ['سير الأعلام', 'الطبقات'],
		keywords: ['تراجم', 'طبقات', 'أعلام', 'سير أعلام', 'وفيات', 'الصحابة', 'التابعين']
	},
	{
		main: 'التزكية والأخلاق والآداب',
		mainAliases: ['الأخلاق والآداب', 'التزكية', 'الرقائق'],
		sub: 'التزكية والرقائق',
		subAliases: ['الرقائق والزهد', 'تزكية النفس'],
		secondary: 'التزكية والرقائق',
		secondaryAliases: ['تزكية النفس', 'الزهد والرقائق'],
		keywords: ['تزكية', 'رقائق', 'زهد', 'ورع', 'سلوك', 'تهذيب النفس', 'محاسبة النفس']
	},
	{
		main: 'التزكية والأخلاق والآداب',
		mainAliases: ['الأخلاق والآداب', 'الآداب الشرعية'],
		sub: 'الأخلاق والآداب',
		subAliases: ['الآداب الشرعية', 'الأخلاق الإسلامية'],
		secondary: 'الأخلاق والآداب الشرعية',
		secondaryAliases: ['الأخلاق الإسلامية', 'آداب إسلامية'],
		keywords: ['أخلاق', 'آداب', 'أدب', 'تربية', 'بر الوالدين', 'حسن الخلق', 'حقوق المسلم']
	},
	{
		main: 'الدعوة والثقافة الإسلامية',
		mainAliases: ['الدعوة', 'الثقافة الإسلامية'],
		sub: 'الدعوة والإرشاد',
		subAliases: ['الدعوة إلى الله', 'خطب ودروس'],
		secondary: 'الدعوة والإرشاد',
		secondaryAliases: ['خطب ودروس', 'الوعظ والإرشاد'],
		keywords: ['دعوة', 'داعية', 'خطب', 'خطبة', 'محاضرات', 'وعظ', 'إرشاد', 'ثقافة إسلامية']
	},
	{
		main: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'علوم اللغة العربية'],
		sub: 'النحو والصرف',
		subAliases: ['النحو', 'الصرف'],
		secondary: 'النحو والصرف',
		secondaryAliases: ['كتب النحو', 'كتب الصرف'],
		keywords: ['نحو', 'صرف', 'إعراب', 'ألفية ابن مالك', 'الأجرومية', 'الآجرومية']
	},
	{
		main: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'البلاغة'],
		sub: 'البلاغة والأدب',
		subAliases: ['البلاغة', 'الأدب العربي'],
		secondary: 'البلاغة والأدب العربي',
		secondaryAliases: ['الأدب العربي', 'الشعر العربي'],
		keywords: ['بلاغة', 'بيان', 'بديع', 'معاني', 'أدب عربي', 'شعر', 'ديوان']
	},
	{
		main: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'معاجم اللغة'],
		sub: 'المعاجم واللغة',
		subAliases: ['المعاجم', 'اللغة'],
		secondary: 'المعاجم واللغة',
		secondaryAliases: ['قواميس', 'معاجم'],
		keywords: ['لغة عربية', 'معجم', 'قاموس', 'لسان العرب', 'مفردات', 'غريب القرآن', 'غريب الحديث']
	},
	{
		main: 'علوم إسلامية عامة',
		mainAliases: ['الدراسات الإسلامية', 'مكتبة إسلامية عامة'],
		sub: 'دراسات إسلامية عامة',
		subAliases: ['موضوعات إسلامية عامة', 'ثقافة إسلامية عامة'],
		secondary: 'مباحث عامة',
		secondaryAliases: ['موضوعات عامة', 'كتب إسلامية عامة'],
		keywords: ['علوم إسلامية', 'دراسات إسلامية', 'كتب إسلامية', 'الإسلام', 'مسلم']
	}
]);

function uniqueList(items) {
	return [...new Set((items || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function namesFor(rule, level) {
	if (level === 'main') return uniqueList([rule.main, ...(rule.mainAliases || [])]);
	if (level === 'sub') return uniqueList([rule.sub, ...(rule.subAliases || [])]);
	return uniqueList([rule.secondary, ...(rule.secondaryAliases || [])]);
}

function nameMatchScore(actual, names) {
	const n = normalizeArabic(actual);
	if (!n) return 0;
	let best = 0;
	for (const raw of names) {
		const target = normalizeArabic(raw);
		if (!target) continue;
		if (n === target) best = Math.max(best, 100);
		else if ((n.includes(target) || target.includes(n)) && Math.min(n.length, target.length) >= 4) {
			best = Math.max(best, 82);
		} else {
			const a = new Set(n.split(' ').filter((w) => w.length >= 3));
			const b = new Set(target.split(' ').filter((w) => w.length >= 3));
			best = Math.max(best, tokenSetsOverlapRatio(a, b) * 72);
		}
	}
	return best;
}

function findBestByNames(nodes, names, minScore = 58) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nameMatchScore(node?.name, names);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? best : null;
}

function findMainByRule(sections, rule) {
	return findBestByNames(sections.tree || [], namesFor(rule, 'main'));
}

function findSubByRule(mainNode, rule) {
	return findBestByNames(mainNode?.children || [], namesFor(rule, 'sub'));
}

function findSecondaryByRule(subNode, rule) {
	return findBestByNames(subNode?.children || [], namesFor(rule, 'secondary'));
}

function scoreRule(rule, bookMeta) {
	const title = normalizeArabic(bookMeta?.title || '');
	const hints = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	const haystack = haystackForReuse(bookMeta);
	let score = 0;
	for (const raw of rule.keywords || []) {
		const kw = normalizeArabic(raw);
		if (!kw) continue;
		if (haystack.includes(kw)) score += kw.includes(' ') ? 7 : 4;
		if (title.includes(kw)) score += 3;
		if (hints.includes(kw)) score += 4;
	}
	for (const name of [rule.main, rule.sub, rule.secondary]) {
		const n = normalizeArabic(name);
		if (n && haystack.includes(n)) score += 3;
	}
	return score;
}

function pickTaxonomyRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= 6 ? { rule: best, score: bestScore } : null;
}

function cleanSectionName(name, fallback = 'مباحث عامة') {
	const value = String(name || '')
		.replace(/\s+/g, ' ')
		.replace(/^(?:كتب|كتاب)\s+(?:في\s+)?/u, '')
		.trim();
	return (value || fallback).slice(0, 90);
}

function deriveFallbackSecondaryName(bookMeta) {
	const ignored = new Set(
		['الرئيسية', 'home', 'كتب', 'كتب اسلامية', 'كتب إسلامية', 'الإسلام', 'اسلام', 'إسلامية']
			.map(normalizeArabic)
	);
	for (const hint of bookMeta?.categoryHints || []) {
		if (ignored.has(normalizeArabic(hint))) continue;
		const cleaned = cleanSectionName(hint, '');
		if (cleaned && cleaned.length >= 4 && !ignored.has(normalizeArabic(cleaned))) return cleaned;
	}
	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && stem.length >= 4 && stem.length <= 70) return stem;
	return 'مباحث عامة';
}

function decisionBase(confidence, reasoning, method = 'taxonomy') {
	return { confidence, reasoning, method };
}

function resolveRuleDecision(sections, bookMeta, picked) {
	const { rule, score } = picked;
	const confidence = Math.min(0.62 + score * 0.025, 0.96);
	const reasoning = `تصنيف علمي محافظ حسب كلمات: ${rule.keywords.slice(0, 4).join('، ')}`;
	const main = findMainByRule(sections, rule);
	const newSecondaryName = cleanSectionName(rule.secondary || deriveFallbackSecondaryName(bookMeta));

	if (!main) {
		return {
			kind: 'create_main',
			newMainName: cleanSectionName(rule.main),
			newSubName: cleanSectionName(rule.sub),
			newSecondaryName,
			...decisionBase(confidence, reasoning)
		};
	}

	const sub = findSubByRule(main, rule);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: cleanSectionName(rule.sub),
			newSecondaryName,
			...decisionBase(confidence, reasoning)
		};
	}

	let secondary = findSecondaryByRule(sub, rule);
	if (!secondary) {
		const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: newSecondaryName,
			minScore: 10
		});
		if (reusable) {
			secondary = { id: reusable.id, name: reusable.name };
		}
	}

	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			newSecondaryName,
			...decisionBase(confidence, reasoning)
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		...decisionBase(confidence, reasoning)
	};
}

function genericRuleWithSecondary(bookMeta) {
	const secondary = deriveFallbackSecondaryName(bookMeta);
	return {
		main: 'علوم إسلامية عامة',
		mainAliases: ['الدراسات الإسلامية', 'مكتبة إسلامية عامة'],
		sub: 'دراسات إسلامية عامة',
		subAliases: ['موضوعات إسلامية عامة', 'ثقافة إسلامية عامة'],
		secondary,
		secondaryAliases: ['مباحث عامة', secondary],
		keywords: []
	};
}

function resolveGenericDecision(sections, bookMeta) {
	const sug = classifyHeuristic(sections, bookMeta);
	if (sug) {
		const validation = validateHierarchyPath(
			{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
			sections.index
		);
		if (validation.valid) {
			if (sug.secondaryId) {
				return {
					kind: 'existing',
					mainId: String(sug.mainId),
					subId: String(sug.subId),
					secondaryId: String(sug.secondaryId),
					confidence: Math.min(sug.confidence, 0.7),
					reasoning: 'مطابقة نصية محلية مع إلزام المسار الثلاثي.',
					method: 'heuristic'
				};
			}
			return {
				kind: 'create_secondary',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				newSecondaryName: deriveFallbackSecondaryName(bookMeta),
				confidence: Math.min(sug.confidence, 0.62),
				reasoning: 'وجدنا main/sub مناسبين لكن لا يوجد قسم ثانوي آمن؛ سيتم إنشاء ثانوي.',
				method: 'heuristic'
			};
		}
	}
	return resolveRuleDecision(sections, bookMeta, {
		rule: genericRuleWithSecondary(bookMeta),
		score: 1
	});
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

	const decision = await classifyAutonomous(sections, bookMeta);
	const suggested = {
		mainId: decision.mainId || '',
		subId: decision.subId || '',
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		decisionKind: decision.kind,
		newMainName: decision.newMainName || null,
		newSubName: decision.newSubName || null,
		newSecondaryName: decision.newSecondaryName || null
	};
	const validation =
		decision.kind === 'existing'
		? validateHierarchyPath(
				{
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId || null
				},
				sections.index
			)
		: { valid: false, reason: 'new_sections_required' };
	return {
		suggested,
		alternatives: [],
		validation,
		decision
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
	const picked = pickTaxonomyRule(bookMeta);
	return picked ? resolveRuleDecision(sections, bookMeta, picked) : resolveGenericDecision(sections, bookMeta);
}
