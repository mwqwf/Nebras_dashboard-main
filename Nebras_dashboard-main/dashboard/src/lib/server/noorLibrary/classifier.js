/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const MIN_MAIN_SCORE = 5;
const MIN_SUB_SCORE = 4;
const MIN_SECONDARY_SCORE = 5;

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

function tokensOf(s, minLen = 3) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= minLen));
}

function hasArabic(s) {
	return /[\u0600-\u06FF]/.test(String(s || ''));
}

function cleanSectionName(raw, fallback = '') {
	let s = String(raw || fallback || '').trim();
	if (!s) return '';
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 46) s = s.slice(0, 46).trim();
	return s;
}

const SCIENCE_DOMAINS = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير وعلوم القرآن',
		terms: [
			'قران',
			'القران',
			'تفسير',
			'تفاسير',
			'المفسر',
			'علوم القران',
			'القراءات',
			'التجويد',
			'اسباب النزول',
			'ناسخ',
			'منسوخ',
			'المصحف'
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث وعلومه',
		terms: [
			'حديث',
			'احاديث',
			'السنه',
			'سنن',
			'صحيح',
			'مسند',
			'الجرح',
			'التعديل',
			'العلل',
			'مصطلح الحديث',
			'رواه',
			'البخاري',
			'مسلم',
			'الترمذي',
			'النسائي',
			'ابي داود'
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'كتب الفقه',
		terms: [
			'فقه',
			'فقهي',
			'فقهيه',
			'اصول الفقه',
			'المذهب',
			'المذاهب',
			'الحنفي',
			'المالكي',
			'الشافعي',
			'الحنبلي',
			'طهاره',
			'صلاه',
			'زكاه',
			'صيام',
			'حج',
			'بيوع',
			'معاملات',
			'نكاح',
			'طلاق',
			'فرائض',
			'مواريث',
			'فتاوي',
			'فتوى',
			'قواعد فقهيه',
			'الاجتهاد'
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'كتب العقيدة والتوحيد',
		terms: [
			'عقيده',
			'اعتقاد',
			'توحيد',
			'ايمان',
			'اسماء الله',
			'صفات',
			'القدر',
			'اليوم الاخر',
			'الملائكه',
			'النبوات',
			'السلف',
			'اشعري',
			'ماتريدي',
			'جهميه',
			'معتزله'
		]
	},
	{
		id: 'seerah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة والتاريخ',
		secondaryName: 'كتب السيرة والتاريخ',
		terms: [
			'سيره',
			'سيرة',
			'المغازي',
			'شمائل',
			'تاريخ',
			'تراجم',
			'طبقات',
			'صحابه',
			'خلفاء',
			'الدوله الامويه',
			'الدوله العباسيه',
			'الاندلس',
			'الحضاره الاسلاميه'
		]
	},
	{
		id: 'tazkiyah_adab',
		mainName: 'التزكية والآداب',
		subName: 'الأخلاق والآداب',
		secondaryName: 'كتب الأخلاق والآداب',
		terms: [
			'تزكيه',
			'اخلاق',
			'اداب',
			'ادب',
			'زهد',
			'رقائق',
			'قلوب',
			'موعظه',
			'مواعظ',
			'سلوك',
			'تصوف',
			'تهذيب النفس',
			'بر الوالدين',
			'الاذكار'
		]
	},
	{
		id: 'arabic_literature',
		mainName: 'اللغة العربية وآدابها',
		subName: 'الأدب واللغة العربية',
		secondaryName: 'كتب اللغة والأدب',
		terms: [
			'لغه عربيه',
			'النحو',
			'صرف',
			'بلاغه',
			'ادب عربي',
			'شعر',
			'ديوان',
			'عروض',
			'قوافي',
			'معجم',
			'معاجم',
			'لسان العرب',
			'اعراب'
		]
	},
	{
		id: 'education_dawah',
		mainName: 'التعليم والدعوة',
		subName: 'التعليم الشرعي والدعوة',
		secondaryName: 'كتب التعليم والدعوة',
		terms: [
			'تعليم',
			'تعلم',
			'طالب العلم',
			'طلب العلم',
			'منهج',
			'مناهج',
			'تربيه',
			'دعوه',
			'دعاة',
			'ارشاد',
			'خطب',
			'محاضرات',
			'نصائح',
			'توجيهات'
		]
	}
]);

const DOMAIN_BY_ID = Object.fromEntries(SCIENCE_DOMAINS.map((d) => [d.id, d]));

const SECONDARY_HINTS = Object.freeze([
	{
		domainId: 'fiqh',
		name: 'العبادات',
		terms: ['طهاره', 'صلاه', 'زكاه', 'صيام', 'حج', 'عمره', 'اذان', 'جماعه']
	},
	{
		domainId: 'fiqh',
		name: 'المعاملات',
		terms: ['بيع', 'بيوع', 'ربا', 'معاملات', 'اجاره', 'شركة', 'وقف', 'قرض', 'دين']
	},
	{
		domainId: 'fiqh',
		name: 'فقه الأسرة',
		terms: ['نكاح', 'زواج', 'طلاق', 'خلع', 'عده', 'رضاع', 'حضانة', 'نفقه']
	},
	{
		domainId: 'fiqh',
		name: 'أصول الفقه والقواعد',
		terms: ['اصول الفقه', 'قواعد فقهيه', 'اجتهاد', 'قياس', 'استحسان', 'استصحاب']
	},
	{
		domainId: 'aqeedah',
		name: 'التوحيد',
		terms: ['توحيد', 'الشرك', 'العباده', 'الالوهيه', 'الربوبيه']
	},
	{
		domainId: 'aqeedah',
		name: 'الأسماء والصفات',
		terms: ['اسماء الله', 'صفات', 'الصفات', 'العرش', 'الاستواء']
	},
	{
		domainId: 'quran',
		name: 'التفسير',
		terms: ['تفسير', 'تفاسير', 'المفسر', 'معاني القران']
	},
	{
		domainId: 'quran',
		name: 'علوم القرآن',
		terms: ['علوم القران', 'اسباب النزول', 'ناسخ', 'منسوخ', 'المكي', 'المدني']
	},
	{
		domainId: 'quran',
		name: 'التجويد والقراءات',
		terms: ['تجويد', 'قراءات', 'روايه حفص', 'ورش', 'احكام التلاوه']
	},
	{
		domainId: 'hadith',
		name: 'مصطلح الحديث',
		terms: ['مصطلح الحديث', 'الجرح', 'التعديل', 'العلل', 'رواه', 'اسناد']
	},
	{
		domainId: 'hadith',
		name: 'كتب السنة',
		terms: ['صحيح', 'سنن', 'مسند', 'موطا', 'البخاري', 'مسلم']
	},
	{
		domainId: 'seerah_history',
		name: 'السيرة النبوية',
		terms: ['سيره', 'المغازي', 'شمائل', 'النبي', 'الرسول']
	},
	{
		domainId: 'seerah_history',
		name: 'التاريخ الإسلامي',
		terms: ['تاريخ', 'دوله', 'خلفاء', 'اموي', 'عباسي', 'اندلس']
	},
	{
		domainId: 'tazkiyah_adab',
		name: 'الأخلاق والآداب',
		terms: ['اخلاق', 'اداب', 'ادب', 'بر الوالدين', 'المروءه']
	},
	{
		domainId: 'tazkiyah_adab',
		name: 'الزهد والرقائق',
		terms: ['زهد', 'رقائق', 'قلوب', 'موعظه', 'مواعظ', 'تهذيب النفس']
	},
	{
		domainId: 'arabic_literature',
		name: 'النحو والصرف',
		terms: ['نحو', 'النحو', 'صرف', 'اعراب']
	},
	{
		domainId: 'arabic_literature',
		name: 'الأدب العربي',
		terms: ['ادب عربي', 'شعر', 'ديوان', 'عروض', 'قوافي']
	},
	{
		domainId: 'education_dawah',
		name: 'طلب العلم',
		terms: ['طلب العلم', 'طالب العلم', 'تعليم', 'تعلم', 'منهج', 'نصائح']
	},
	{
		domainId: 'education_dawah',
		name: 'الدعوة والإرشاد',
		terms: ['دعوه', 'دعاة', 'ارشاد', 'خطب', 'محاضرات']
	}
]);

function haystackFromBook(bookMeta) {
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

function tokenScore(terms, haystack, tokens) {
	let score = 0;
	for (const term of terms || []) {
		const n = normalizeArabic(term);
		if (!n) continue;
		if (haystack.includes(n)) {
			score += n.includes(' ') ? 4 : 3;
			continue;
		}
		for (const t of n.split(' ')) {
			if (t.length >= 3 && tokens.has(t)) score += 1;
		}
	}
	return score;
}

function inferDomainFromText(text) {
	const haystack = normalizeArabic(text);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const domain of SCIENCE_DOMAINS) {
		const score =
			tokenScore(domain.terms, haystack, tokens) +
			scoreTextAgainstName(domain.mainName, haystack, tokens) +
			scoreTextAgainstName(domain.subName, haystack, tokens);
		if (score > bestScore) {
			bestScore = score;
			best = domain;
		}
	}
	if (!best || bestScore < 3) return null;
	return { domain: best, score: bestScore };
}

function inferBookDomain(bookMeta) {
	return inferDomainFromText(
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

function scoreTextAgainstName(sectionName, haystack, tokens) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 4;
	return score;
}

function scoreSection(sectionName, haystack, tokens, expectedDomain = null) {
	let score = scoreTextAgainstName(sectionName, haystack, tokens);
	if (expectedDomain) {
		const sectionDomain = inferDomainFromText(sectionName)?.domain || null;
		score += scoreTextAgainstName(expectedDomain.mainName, normalizeArabic(sectionName), tokensOf(sectionName));
		score += scoreTextAgainstName(expectedDomain.subName, normalizeArabic(sectionName), tokensOf(sectionName));
		score += tokenScore(expectedDomain.terms, normalizeArabic(sectionName), tokensOf(sectionName));
		if (sectionDomain && sectionDomain.id === expectedDomain.id) score += 8;
		if (sectionDomain && sectionDomain.id !== expectedDomain.id) score -= 12;
	}
	return score;
}

function pickBestNode(nodes, haystack, tokens, expectedDomain, minScore) {
	let best = null;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (const node of nodes || []) {
		const score = scoreSection(node?.name || '', haystack, tokens, expectedDomain);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	if (!best || bestScore < minScore) return { node: null, score: bestScore };
	return { node: best, score: bestScore };
}

function pickSecondaryName(domain, bookMeta) {
	const haystack = haystackFromBook(bookMeta);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const hint of SECONDARY_HINTS) {
		if (domain && hint.domainId !== domain.id) continue;
		const score = tokenScore(hint.terms, haystack, tokens);
		if (score > bestScore) {
			best = hint;
			bestScore = score;
		}
	}
	if (best && bestScore > 0) return best.name;

	for (const hint of bookMeta?.categoryHints || []) {
		const cleaned = cleanSectionName(hint);
		if (cleaned && hasArabic(cleaned) && !/^كتب$/u.test(cleaned)) return cleaned;
	}
	return domain?.secondaryName || 'كتب متنوعة';
}

function defaultDomain() {
	return {
		id: 'general',
		mainName: 'المكتبة الإسلامية',
		subName: 'كتب متنوعة',
		secondaryName: 'كتب عامة',
		terms: []
	};
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = haystackFromBook(bookMeta);
	const tokens = tokensOf(haystack);
	const domain = inferBookDomain(bookMeta)?.domain || null;

	const { node: bestMain, score: bestMainScore } = pickBestNode(
		tree,
		haystack,
		tokens,
		domain,
		MIN_MAIN_SCORE
	);
	if (!bestMain) return null;

	const { node: bestSub, score: bestSubScore } = pickBestNode(
		bestMain.children,
		haystack,
		tokens,
		domain,
		MIN_SUB_SCORE
	);
	if (!bestSub) return null;

	const secondaryName = pickSecondaryName(domain, bookMeta);
	const { node: bestSec, score: bestSecScore } = pickBestNode(
		bestSub.children,
		haystack + ' ' + normalizeArabic(secondaryName),
		tokensOf(`${haystack} ${secondaryName}`),
		domain,
		MIN_SECONDARY_SCORE
	);

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec ? bestSec.id : null,
		confidence: Math.min(
			0.45 + Math.max(bestMainScore, 0) * 0.04 + Math.max(bestSubScore, 0) * 0.04 + Math.max(bestSecScore, 0) * 0.03,
			0.9
		),
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
	const domain = inferBookDomain(bookMeta)?.domain || defaultDomain();
	const secondaryName = pickSecondaryName(domain, bookMeta);

	if (treeIsEmpty) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: domain.mainName,
			newSubName: domain.subName,
			newSecondaryName: secondaryName,
			confidence: 0.3,
			reasoning: 'لا توجد شجرة أقسام مناسبة — إنشاء المسار الثلاثي الكامل.',
			method: 'heuristic'
		};
	}

	const haystack = haystackFromBook(bookMeta);
	const tokens = tokensOf(haystack);
	const { node: bestMain, score: mainScore } = pickBestNode(
		sections.tree,
		haystack,
		tokens,
		domain,
		MIN_MAIN_SCORE
	);

	if (!bestMain) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: domain.mainName,
			newSubName: domain.subName,
			newSecondaryName: secondaryName,
			confidence: 0.35,
			reasoning: `لم يُعثر على قسم رئيسي مناسب لمجال "${domain.mainName}" — إنشاء مسار جديد.`,
			method: 'heuristic'
		};
	}

	const { node: bestSub, score: subScore } = pickBestNode(
		bestMain.children,
		haystack,
		tokens,
		domain,
		MIN_SUB_SCORE
	);

	if (!bestSub) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.id),
			subId: null,
			secondaryId: null,
			newSubName: domain.subName,
			newSecondaryName: secondaryName,
			confidence: 0.45,
			reasoning: `القسم الرئيسي "${bestMain.name}" مناسب، ولا يوجد فرع ملائم — إنشاء فرع وثانوي.`,
			method: 'heuristic'
		};
	}

	let secId = null;
	const autoSec = pickReuseSecondary(sections, String(bestSub.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 8
	});
	if (autoSec) secId = autoSec.id;

	if (!secId) {
		const { node: bestSec } = pickBestNode(
			bestSub.children,
			`${haystack} ${normalizeArabic(secondaryName)}`,
			tokensOf(`${haystack} ${secondaryName}`),
			domain,
			MIN_SECONDARY_SCORE
		);
		if (bestSec) secId = String(bestSec.id);
	}

	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(bestMain.id),
			subId: String(bestSub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: 0.55,
			reasoning: `المسار "${bestMain.name} ← ${bestSub.name}" مناسب، ولا يوجد قسم ثانوي دقيق — إنشاء "${secondaryName}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(bestMain.id),
		subId: String(bestSub.id),
		secondaryId: secId,
		confidence: Math.min(0.5 + mainScore * 0.04 + subScore * 0.04, 0.9),
		reasoning: `مطابقة محليّة صارمة: ${bestMain.name} ← ${bestSub.name} ← ${secId}.`,
		method: 'heuristic'
	};
}
