/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 *
 * لا نختار "أقرب قسم" بدرجة صفرية. نحدّد المجال المعرفي أوّلاً (فقه،
 * عقيدة، تاريخ، أدب...) ثم نبحث داخل ذلك المجال فقط، وإلا نعيد قرار
 * إنشاء قسم في المستوى الصحيح لكي لا تختلط كتب الآداب بالفقه أو التاريخ
 * بالعقيدة.
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
	'مكتبه',
	'نور',
	'تحميل',
	'قراءه',
	'pdf',
	'في',
	'من',
	'الي',
	'على',
	'عن',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'التي',
	'الذي',
	'لدي',
	'لدى',
	'مع',
	'او',
	'و'
]);

const MIN_DOMAIN_SCORE = 3;
const MIN_MAIN_SCORE = 6;
const MIN_SUB_SCORE = 5;
const MIN_SECONDARY_SCORE = 6;

const DOMAIN_PROFILES = Object.freeze([
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		defaultSubName: 'مسائل فقهية',
		defaultSecondaryName: 'فقه عام',
		aliases: ['الفقه', 'فقه', 'الفقه الاسلامي', 'الشريعه', 'اصول الفقه'],
		keywords: [
			'فقه',
			'الفقه',
			'شرعي',
			'الشريعه',
			'احكام',
			'حكم',
			'فتاوي',
			'فتوى',
			'مسائل',
			'اصول الفقه',
			'عبادات',
			'معاملات',
			'طهاره',
			'صلاه',
			'زكاه',
			'صيام',
			'حج',
			'نكاح',
			'طلاق',
			'مواريث'
		],
		topics: [
			{ subName: 'العبادات', secondaryName: 'الطهارة', keywords: ['طهاره', 'وضوء', 'غسل', 'تيمم'] },
			{ subName: 'العبادات', secondaryName: 'الصلاة', keywords: ['صلاه', 'الصلوه', 'امامه', 'اذان', 'مسجد'] },
			{ subName: 'العبادات', secondaryName: 'الزكاة', keywords: ['زكاه', 'صدقه', 'نصاب'] },
			{ subName: 'العبادات', secondaryName: 'الصيام', keywords: ['صيام', 'رمضان', 'فطر'] },
			{ subName: 'العبادات', secondaryName: 'الحج والعمرة', keywords: ['حج', 'عمره', 'مناسك'] },
			{ subName: 'المعاملات', secondaryName: 'البيوع والمعاملات', keywords: ['بيع', 'بيوع', 'ربا', 'معاملات', 'تجاره'] },
			{ subName: 'الأحوال الشخصية', secondaryName: 'النكاح والطلاق', keywords: ['نكاح', 'زواج', 'طلاق', 'خلع', 'نفقه'] },
			{ subName: 'المواريث', secondaryName: 'الفرائض', keywords: ['مواريث', 'ميراث', 'فرائض', 'تركات'] },
			{ subName: 'أصول الفقه', secondaryName: 'قواعد أصول الفقه', keywords: ['اصول الفقه', 'استنباط', 'اجماع', 'قياس'] }
		]
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة',
		defaultSubName: 'العقيدة الإسلامية',
		defaultSecondaryName: 'مسائل العقيدة',
		aliases: ['العقيده', 'عقيده', 'التوحيد', 'ايمان'],
		keywords: [
			'عقيده',
			'العقيده',
			'توحيد',
			'ايمان',
			'اسماء الله',
			'صفات',
			'قدر',
			'ايمان',
			'شرك',
			'بدعه',
			'سنه',
			'اهل السنه',
			'فرق',
			'ملل',
			'نحل'
		],
		topics: [
			{ subName: 'التوحيد', secondaryName: 'توحيد الألوهية والربوبية', keywords: ['توحيد', 'الوهيه', 'ربوبيه'] },
			{ subName: 'الأسماء والصفات', secondaryName: 'أسماء الله وصفاته', keywords: ['اسماء', 'صفات', 'الاسماء والصفات'] },
			{ subName: 'الإيمان', secondaryName: 'أركان الإيمان', keywords: ['ايمان', 'اركان الايمان', 'قدر', 'ملائكه'] },
			{ subName: 'الفرق والمذاهب', secondaryName: 'الفرق الكلامية', keywords: ['فرق', 'ملل', 'نحل', 'جهميه', 'معتزله', 'اشاعره'] }
		]
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف',
		defaultSubName: 'علوم الحديث',
		defaultSecondaryName: 'حديث عام',
		aliases: ['حديث', 'الحديث', 'السنه النبويه', 'علوم الحديث'],
		keywords: [
			'حديث',
			'احاديث',
			'السنه',
			'رواه',
			'روايه',
			'اسناد',
			'متن',
			'صحيح',
			'ضعيف',
			'سنن',
			'مسند',
			'الجرح',
			'التعديل',
			'مصطلح الحديث'
		],
		topics: [
			{ subName: 'كتب الحديث', secondaryName: 'الصحيح والسنن', keywords: ['صحيح', 'سنن', 'مسند', 'موطا'] },
			{ subName: 'علوم الحديث', secondaryName: 'مصطلح الحديث', keywords: ['مصطلح', 'اسناد', 'متن', 'رواه'] },
			{ subName: 'الجرح والتعديل', secondaryName: 'تراجم الرواة', keywords: ['جرح', 'تعديل', 'رواه', 'رجال الحديث'] }
		]
	},
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		defaultSubName: 'علوم القرآن',
		defaultSecondaryName: 'قرآن عام',
		aliases: ['قران', 'القران', 'التفسير', 'علوم القران', 'تجويد'],
		keywords: [
			'قران',
			'القران',
			'تفسير',
			'مصحف',
			'تجويد',
			'قراءه',
			'قراءات',
			'سوره',
			'ايات',
			'اسباب النزول',
			'علوم القران'
		],
		topics: [
			{ subName: 'التفسير', secondaryName: 'كتب التفسير', keywords: ['تفسير', 'مفسر', 'معاني القران'] },
			{ subName: 'علوم القرآن', secondaryName: 'أسباب النزول', keywords: ['اسباب النزول', 'نزول'] },
			{ subName: 'التجويد والقراءات', secondaryName: 'أحكام التجويد', keywords: ['تجويد', 'احكام التجويد'] },
			{ subName: 'التجويد والقراءات', secondaryName: 'القراءات', keywords: ['قراءات', 'قراءه'] }
		]
	},
	{
		key: 'seerah',
		mainName: 'السيرة النبوية',
		defaultSubName: 'السيرة النبوية',
		defaultSecondaryName: 'سيرة عامة',
		aliases: ['السيره', 'سيره', 'السيره النبويه', 'شمائل'],
		keywords: [
			'سيره',
			'السيره',
			'النبي',
			'رسول الله',
			'محمد',
			'غزوه',
			'غزوات',
			'شمائل',
			'مغازي'
		],
		topics: [
			{ subName: 'السيرة النبوية', secondaryName: 'مراحل السيرة', keywords: ['مكي', 'مدني', 'هجره', 'بعثه'] },
			{ subName: 'المغازي', secondaryName: 'الغزوات', keywords: ['غزوه', 'غزوات', 'بدر', 'احد'] },
			{ subName: 'الشمائل', secondaryName: 'شمائل النبي', keywords: ['شمائل', 'اخلاق النبي'] }
		]
	},
	{
		key: 'history',
		mainName: 'التاريخ والحضارة',
		defaultSubName: 'التاريخ الإسلامي',
		defaultSecondaryName: 'تاريخ عام',
		aliases: ['تاريخ', 'التاريخ', 'حضاره', 'تراجم', 'اعلام', 'بلدان'],
		keywords: [
			'تاريخ',
			'التاريخ',
			'حضاره',
			'دوله',
			'دول',
			'خلافه',
			'اموي',
			'عباسي',
			'اندلس',
			'سلاطين',
			'ملوك',
			'فتوح',
			'تراجم',
			'اعلام',
			'طبقات',
			'بلدان'
		],
		topics: [
			{ subName: 'التاريخ الإسلامي', secondaryName: 'الدول والخلافات', keywords: ['خلافه', 'اموي', 'عباسي', 'عثماني', 'اندلس'] },
			{ subName: 'التراجم والأعلام', secondaryName: 'تراجم العلماء والأعلام', keywords: ['تراجم', 'اعلام', 'طبقات', 'وفيات'] },
			{ subName: 'تاريخ البلدان', secondaryName: 'البلدان والرحلات', keywords: ['بلدان', 'رحلات', 'جغرافيا'] }
		]
	},
	{
		key: 'literature',
		mainName: 'الأدب والبلاغة',
		defaultSubName: 'الأدب العربي',
		defaultSecondaryName: 'أدب عام',
		aliases: ['ادب', 'الادب', 'شعر', 'بلاغه', 'نثر', 'قصص'],
		keywords: [
			'ادب',
			'الادب',
			'شعر',
			'ديوان',
			'قصيده',
			'قصائد',
			'نثر',
			'بلاغه',
			'بيان',
			'بديع',
			'معاني',
			'روايه',
			'قصه',
			'قصص',
			'مقامات'
		],
		topics: [
			{ subName: 'الشعر والدواوين', secondaryName: 'دواوين الشعر', keywords: ['شعر', 'ديوان', 'قصيده', 'قصائد'] },
			{ subName: 'النثر والقصص', secondaryName: 'القصص والروايات', keywords: ['نثر', 'قصه', 'قصص', 'روايه', 'مقامات'] },
			{ subName: 'البلاغة', secondaryName: 'علوم البلاغة', keywords: ['بلاغه', 'بيان', 'بديع', 'معاني'] }
		]
	},
	{
		key: 'language',
		mainName: 'اللغة العربية',
		defaultSubName: 'علوم اللغة',
		defaultSecondaryName: 'لغة عامة',
		aliases: ['اللغه العربيه', 'نحو', 'صرف', 'معاجم', 'قاموس'],
		keywords: [
			'لغه',
			'اللغه',
			'عربيه',
			'نحو',
			'صرف',
			'اعراب',
			'معجم',
			'معاجم',
			'قاموس',
			'لسان العرب',
			'مفردات'
		],
		topics: [
			{ subName: 'النحو والصرف', secondaryName: 'النحو', keywords: ['نحو', 'اعراب'] },
			{ subName: 'النحو والصرف', secondaryName: 'الصرف', keywords: ['صرف', 'تصريف'] },
			{ subName: 'المعاجم والقواميس', secondaryName: 'معاجم عربية', keywords: ['معجم', 'معاجم', 'قاموس', 'لسان العرب'] }
		]
	},
	{
		key: 'education',
		mainName: 'التربية والتعليم',
		defaultSubName: 'التعليم وطرقه',
		defaultSecondaryName: 'تعليم عام',
		aliases: ['تربيه', 'تعليم', 'مناهج', 'تدريس'],
		keywords: [
			'تربيه',
			'تعليم',
			'تعلم',
			'تدريس',
			'مدرسه',
			'مدارس',
			'منهج',
			'مناهج',
			'طفل',
			'اطفال',
			'طلاب',
			'معلم'
		],
		topics: [
			{ subName: 'طرق التدريس', secondaryName: 'استراتيجيات التعليم', keywords: ['تدريس', 'طرق التدريس', 'استراتيجيات'] },
			{ subName: 'المناهج', secondaryName: 'المناهج التعليمية', keywords: ['منهج', 'مناهج'] },
			{ subName: 'تربية الأطفال', secondaryName: 'تعليم الأطفال', keywords: ['طفل', 'اطفال', 'رياض الاطفال'] }
		]
	},
	{
		key: 'thought',
		mainName: 'الفكر والثقافة',
		defaultSubName: 'الفكر والثقافة',
		defaultSecondaryName: 'ثقافة عامة',
		aliases: ['فكر', 'ثقافه', 'فلسفه', 'منطق'],
		keywords: [
			'فكر',
			'ثقافه',
			'ثقافي',
			'فلسفه',
			'منطق',
			'نهضه',
			'حضاري',
			'مجتمع',
			'اجتماع'
		],
		topics: [
			{ subName: 'الفكر الإسلامي', secondaryName: 'قضايا فكرية', keywords: ['فكر اسلامي', 'نهضه', 'حضاري'] },
			{ subName: 'الفلسفة والمنطق', secondaryName: 'الفلسفة', keywords: ['فلسفه', 'منطق'] },
			{ subName: 'الثقافة العامة', secondaryName: 'قضايا ثقافية', keywords: ['ثقافه', 'ثقافي'] }
		]
	}
]);

function tokenizeNormalized(s) {
	return normalizeArabic(s)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function makeContext(bookMeta) {
	const categoryHints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	const text = [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...categoryHints
	]
		.filter(Boolean)
		.join(' ');
	const normalized = normalizeArabic(text);
	return {
		normalized,
		tokens: new Set(tokenizeNormalized(normalized)),
		categoryHints: categoryHints.map((x) => String(x || '').trim()).filter(Boolean)
	};
}

function phraseScore(phrases, context) {
	let score = 0;
	for (const phrase of phrases || []) {
		const n = normalizeArabic(phrase);
		if (!n) continue;
		if (context.normalized.includes(n)) {
			score += n.includes(' ') ? 4 : 2;
			continue;
		}
		const words = tokenizeNormalized(n);
		for (const w of words) {
			if (context.tokens.has(w)) score += 1;
		}
	}
	return score;
}

function sectionNameScore(name, expectedPhrases, context) {
	const normalizedName = normalizeArabic(name);
	if (!normalizedName) return 0;
	let score = 0;
	for (const expected of expectedPhrases || []) {
		const n = normalizeArabic(expected);
		if (!n) continue;
		if (normalizedName === n) score += 12;
		else if (normalizedName.includes(n) || n.includes(normalizedName)) score += 8;
	}
	const nameTokens = new Set(tokenizeNormalized(normalizedName));
	for (const token of nameTokens) {
		if (context.tokens.has(token)) score += 2;
	}
	if (context.normalized.includes(normalizedName) && normalizedName.length >= 4) score += 5;
	return score;
}

function pickDomainProfile(context) {
	let best = null;
	let bestScore = 0;
	for (const profile of DOMAIN_PROFILES) {
		const score =
			phraseScore(profile.keywords, context) +
			phraseScore(profile.aliases, context) +
			phraseScore(profile.topics?.flatMap((t) => t.keywords || []), context) * 0.7;
		if (score > bestScore) {
			bestScore = score;
			best = profile;
		}
	}
	if (!best || bestScore < MIN_DOMAIN_SCORE) return null;
	return { profile: best, score: bestScore };
}

function pickTopic(profile, context) {
	let best = null;
	let bestScore = 0;
	for (const topic of profile?.topics || []) {
		const score =
			phraseScore(topic.keywords, context) +
			sectionNameScore(topic.subName, [topic.subName], context) * 0.25 +
			sectionNameScore(topic.secondaryName, [topic.secondaryName], context) * 0.25;
		if (score > bestScore) {
			bestScore = score;
			best = topic;
		}
	}
	return bestScore >= 2 ? best : null;
}

function findBestMain(tree, profile, context) {
	let best = null;
	let bestScore = 0;
	const expected = [profile.mainName, ...(profile.aliases || [])];
	for (const main of tree || []) {
		const score = sectionNameScore(main.name, expected, context);
		if (score > bestScore) {
			bestScore = score;
			best = main;
		}
	}
	return best && bestScore >= MIN_MAIN_SCORE ? { node: best, score: bestScore } : null;
}

function findBestSub(mainNode, profile, topic, context) {
	let best = null;
	let bestScore = 0;
	const expected = [
		topic?.subName,
		profile.defaultSubName,
		...(topic?.keywords || []),
		...(profile.aliases || [])
	].filter(Boolean);
	for (const sub of mainNode?.children || []) {
		const score = sectionNameScore(sub.name, expected, context);
		if (score > bestScore) {
			bestScore = score;
			best = sub;
		}
	}
	return best && bestScore >= MIN_SUB_SCORE ? { node: best, score: bestScore } : null;
}

function findBestSecondary(subNode, profile, topic, context, bookMeta) {
	let best = null;
	let bestScore = 0;
	const expectedName = topic?.secondaryName || profile.defaultSecondaryName;
	for (const sec of subNode?.children || []) {
		const score =
			sectionNameScore(sec.name, [expectedName, ...(topic?.keywords || [])], context) +
			scoreSecondaryForReuse(sec, bookMeta, expectedName) * 0.5;
		if (score > bestScore) {
			bestScore = score;
			best = sec;
		}
	}
	return best && bestScore >= MIN_SECONDARY_SCORE ? { node: best, score: bestScore } : null;
}

function cleanSectionName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/[|/\\]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function meaningfulCategoryHint(context) {
	for (const hint of context.categoryHints) {
		const n = normalizeArabic(hint);
		if (!n || STOP_WORDS.has(n) || n === 'الرئيسيه') continue;
		if (/^(كتب|الرئيسيه|home)$/i.test(hint)) continue;
		return cleanSectionName(hint, '');
	}
	return '';
}

function fallbackSecondaryName(bookMeta, context, fallback) {
	const hint = meaningfulCategoryHint(context);
	if (hint && normalizeArabic(hint) !== normalizeArabic(fallback)) return hint;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	const compact = stem
		.split(' ')
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
		.slice(0, 5)
		.join(' ');
	return cleanSectionName(compact, fallback);
}

function confidenceFromScores(...scores) {
	const total = scores.reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
	return Math.max(0.35, Math.min(0.95, 0.45 + total * 0.025));
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree }, bookMeta) {
	const context = makeContext(bookMeta);

	let bestMain = null, bestMainScore = 0;
	for (const m of tree) {
		const s = sectionNameScore(m.name, [m.name], context);
		if (s > bestMainScore) { bestMainScore = s; bestMain = m; }
	}
	if (!bestMain || bestMainScore < 4) return null;

	let bestSub = null, bestSubScore = 0;
	for (const sub of bestMain.children) {
		const s = sectionNameScore(sub.name, [sub.name], context);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub || bestSubScore < 3) return null;

	let bestSec = null, bestSecScore = 0;
	for (const sec of bestSub.children) {
		const s = scoreSecondaryForReuse(sec, bookMeta, meaningfulCategoryHint(context));
		if (s > bestSecScore) { bestSecScore = s; bestSec = sec; }
	}

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec && bestSecScore >= MIN_SECONDARY_SCORE ? bestSec.id : null,
		confidence: confidenceFromScores(bestMainScore, bestSubScore, bestSecScore),
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

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const context = makeContext(bookMeta);
	const domain = pickDomainProfile(context);
	if (domain) {
		const { profile, score: domainScore } = domain;
		const topic = pickTopic(profile, context);
		const newSubName = cleanSectionName(topic?.subName || profile.defaultSubName, profile.defaultSubName);
		const newSecondaryName = cleanSectionName(
			topic?.secondaryName || fallbackSecondaryName(bookMeta, context, profile.defaultSecondaryName),
			profile.defaultSecondaryName
		);
		const mainMatch = findBestMain(sections.tree, profile, context);

		if (!mainMatch) {
			return {
				kind: 'create_main',
				newMainName: profile.mainName,
				newSubName,
				newSecondaryName,
				confidence: confidenceFromScores(domainScore),
				reasoning: `لم يوجد قسم رئيسي مناسب لمجال "${profile.mainName}" — إنشاء مسار جديد.`,
				method: 'taxonomy'
			};
		}

		const subMatch = findBestSub(mainMatch.node, profile, topic, context);
		if (!subMatch) {
			return {
				kind: 'create_sub',
				mainId: String(mainMatch.node.id),
				newSubName,
				newSecondaryName,
				confidence: confidenceFromScores(domainScore, mainMatch.score),
				reasoning: `وُجد "${mainMatch.node.name}" لكن لا يوجد فرع مناسب لـ "${newSubName}".`,
				method: 'taxonomy'
			};
		}

		const secondaryMatch = findBestSecondary(subMatch.node, profile, topic, context, bookMeta);
		if (!secondaryMatch) {
			const reusable = pickReuseSecondary(sections, String(subMatch.node.id), bookMeta, {
				proposedNewName: newSecondaryName,
				minScore: MIN_SECONDARY_SCORE + 2
			});
			if (reusable) {
				return {
					kind: 'existing',
					mainId: String(mainMatch.node.id),
					subId: String(subMatch.node.id),
					secondaryId: reusable.id,
					confidence: confidenceFromScores(domainScore, mainMatch.score, subMatch.score, reusable.score),
					reasoning: `استخدام قسم ثانوي قائم مناسب: "${reusable.name}".`,
					method: 'taxonomy'
				};
			}
			return {
				kind: 'create_secondary',
				mainId: String(mainMatch.node.id),
				subId: String(subMatch.node.id),
				newSecondaryName,
				confidence: confidenceFromScores(domainScore, mainMatch.score, subMatch.score),
				reasoning: `وُجد المسار الأعلى لكن لا يوجد قسم ثانوي مناسب لـ "${newSecondaryName}".`,
				method: 'taxonomy'
			};
		}

		return {
			kind: 'existing',
			mainId: String(mainMatch.node.id),
			subId: String(subMatch.node.id),
			secondaryId: String(secondaryMatch.node.id),
			confidence: confidenceFromScores(
				domainScore,
				mainMatch.score,
				subMatch.score,
				secondaryMatch.score
			),
			reasoning: `مطابقة تصنيفية ضمن "${profile.mainName}" دون خلط المجالات.`,
			method: 'taxonomy'
		};
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (sug?.mainId && sug?.subId) {
		let secId = sug.secondaryId ? String(sug.secondaryId) : null;
		const proposed = fallbackSecondaryName(bookMeta, context, 'موضوعات عامة');
		if (!secId) {
			const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
				proposedNewName: proposed,
				minScore: MIN_SECONDARY_SCORE + 3
			});
			if (autoSec) secId = autoSec.id;
		}
		if (secId) {
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
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			newSecondaryName: proposed,
			confidence: Math.max(0.35, sug.confidence - 0.1),
			reasoning: `المطابقة العامة وجدت main/sub فقط؛ إنشاء قسم ثانوي "${proposed}".`,
			method: 'heuristic'
		};
	}

	const category = meaningfulCategoryHint(context);
	const newMainName = cleanSectionName(category || 'معارف عامة', 'معارف عامة');
	const newSubName = category ? `كتب ${category}`.slice(0, 80) : 'كتب عامة';
	const newSecondaryName = fallbackSecondaryName(bookMeta, context, 'موضوعات عامة');
	return {
		kind: 'create_main',
		newMainName,
		newSubName,
		newSecondaryName,
		confidence: 0.35,
		reasoning: 'لم توجد مطابقة آمنة في الشجرة الحالية — إنشاء مسار عام مستقل بدلاً من خلط المجالات.',
		method: 'heuristic'
	};
}
