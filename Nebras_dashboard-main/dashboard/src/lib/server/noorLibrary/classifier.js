/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const SUBJECT_PROFILES = Object.freeze([
	{
		id: 'quran_tafsir',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		keywords: [
			'قرآن',
			'القرآن',
			'تفسير',
			'المفسر',
			'علوم القرآن',
			'أسباب النزول',
			'القراءات',
			'التجويد',
			'المصحف'
		],
		mainAliases: ['القرآن الكريم', 'علوم القرآن', 'كتب التفسير', 'القرآن الكريم وعلومه'],
		subAliases: ['التفسير', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		secondaryAliases: ['التفسير', 'تفسير القرآن', 'علوم القرآن', 'القراءات', 'التجويد']
	},
	{
		id: 'hadith',
		mainName: 'السنة النبوية وعلوم الحديث',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث',
		keywords: [
			'حديث',
			'الأحاديث',
			'الحديث',
			'السنة',
			'صحيح البخاري',
			'صحيح مسلم',
			'سنن',
			'المسانيد',
			'مصطلح الحديث',
			'الجرح والتعديل',
			'الرواة'
		],
		mainAliases: ['الحديث', 'السنة', 'السنة النبوية', 'علوم الحديث', 'الحديث الشريف'],
		subAliases: ['الحديث وعلومه', 'علوم الحديث', 'مصطلح الحديث', 'كتب الحديث'],
		secondaryAliases: ['كتب الحديث', 'مصطلح الحديث', 'شروح الحديث', 'الرواة والجرح والتعديل']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'أحكام فقهية',
		keywords: [
			'فقه',
			'الفقه',
			'فتوى',
			'فتاوى',
			'الأحكام',
			'الطهارة',
			'الصلاة',
			'الزكاة',
			'الصوم',
			'الحج',
			'المعاملات',
			'البيع',
			'النكاح',
			'الطلاق',
			'المواريث',
			'الفرائض'
		],
		mainAliases: ['الفقه', 'الفقه وأصوله', 'كتب الفقه', 'الفقه الإسلامي'],
		subAliases: ['الفقه الإسلامي', 'أحكام فقهية', 'العبادات', 'المعاملات', 'فقه العبادات'],
		secondaryAliases: ['أحكام فقهية', 'العبادات', 'المعاملات', 'فقه الأسرة', 'المواريث']
	},
	{
		id: 'usul_fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'أصول الفقه',
		secondaryName: 'أصول الفقه والقواعد الفقهية',
		keywords: [
			'أصول الفقه',
			'اصول الفقه',
			'القواعد الفقهية',
			'المقاصد',
			'الاستدلال',
			'الإجماع',
			'القياس',
			'الاجتهاد',
			'التقليد'
		],
		mainAliases: ['الفقه وأصوله', 'أصول الفقه', 'اصول الفقه'],
		subAliases: ['أصول الفقه', 'القواعد الفقهية', 'مقاصد الشريعة'],
		secondaryAliases: ['أصول الفقه والقواعد الفقهية', 'مقاصد الشريعة', 'القواعد الفقهية']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة الإسلامية',
		subName: 'التوحيد والعقيدة',
		secondaryName: 'العقيدة',
		keywords: [
			'عقيدة',
			'العقيدة',
			'التوحيد',
			'الإيمان',
			'الايمان',
			'الأسماء والصفات',
			'اسماء الله',
			'القدر',
			'الرد على',
			'الفرق',
			'الملل والنحل'
		],
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد', 'أصول الدين'],
		subAliases: ['التوحيد والعقيدة', 'أصول الدين', 'الإيمان', 'الفرق والردود'],
		secondaryAliases: ['العقيدة', 'التوحيد', 'الأسماء والصفات', 'الفرق والردود']
	},
	{
		id: 'seerah',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة النبوية',
		secondaryName: 'السيرة النبوية',
		keywords: [
			'السيرة',
			'سيرة',
			'النبوية',
			'المغازي',
			'شمائل',
			'الرسول',
			'النبي',
			'محمد صلى الله عليه وسلم'
		],
		mainAliases: ['السيرة', 'السيرة النبوية', 'السيرة والتاريخ الإسلامي'],
		subAliases: ['السيرة النبوية', 'المغازي', 'شمائل النبي'],
		secondaryAliases: ['السيرة النبوية', 'المغازي', 'شمائل النبي']
	},
	{
		id: 'history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'التاريخ الإسلامي',
		keywords: [
			'تاريخ',
			'التاريخ',
			'الدولة',
			'الخلافة',
			'الأموي',
			'العباسي',
			'الأندلس',
			'الفتوح',
			'الصحابة',
			'التراجم',
			'الطبقات'
		],
		mainAliases: ['التاريخ الإسلامي', 'السيرة والتاريخ الإسلامي', 'التاريخ والسير'],
		subAliases: ['التاريخ الإسلامي', 'التراجم والطبقات', 'الفتوح الإسلامية'],
		secondaryAliases: ['التاريخ الإسلامي', 'التراجم والطبقات', 'الفتوح الإسلامية']
	},
	{
		id: 'adab_tazkiyah',
		mainName: 'التزكية والآداب',
		subName: 'الأخلاق والآداب',
		secondaryName: 'آداب طالب العلم',
		keywords: [
			'أدب',
			'ادب',
			'آداب',
			'الآداب',
			'الأخلاق',
			'اخلاق',
			'تزكية',
			'الزهد',
			'الرقائق',
			'النصيحة',
			'النصائح',
			'طلب العلم',
			'طالب العلم',
			'آداب العالم والمتعلم',
			'التعليمات العلمية',
			'تعليمات علمية',
			'المواعظ'
		],
		mainAliases: ['التزكية والآداب', 'الأخلاق', 'الآداب', 'الرقائق والزهد'],
		subAliases: ['الأخلاق والآداب', 'التزكية', 'آداب طالب العلم', 'الرقائق والزهد'],
		secondaryAliases: ['آداب طالب العلم', 'طلب العلم', 'النصائح والمواعظ', 'الأخلاق والآداب']
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية وعلومها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو والصرف',
		keywords: [
			'لغة عربية',
			'العربية',
			'النحو',
			'الصرف',
			'البلاغة',
			'الإعراب',
			'اعراب',
			'العروض',
			'القوافي',
			'المعاجم'
		],
		mainAliases: ['اللغة العربية', 'علوم اللغة', 'اللغة العربية وعلومها'],
		subAliases: ['علوم اللغة العربية', 'النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondaryAliases: ['النحو والصرف', 'البلاغة', 'المعاجم', 'العروض والقوافي']
	},
	{
		id: 'dawah_education',
		mainName: 'الدعوة والتعليم الشرعي',
		subName: 'التعليم الشرعي',
		secondaryName: 'مناهج طلب العلم',
		keywords: [
			'دعوة',
			'الدعوة',
			'تعليم',
			'التعليم',
			'منهج',
			'مناهج',
			'طلب العلم',
			'التعليم الشرعي',
			'التربية الإسلامية',
			'تربية إسلامية'
		],
		mainAliases: ['الدعوة والتعليم', 'الدعوة والتعليم الشرعي', 'التربية الإسلامية'],
		subAliases: ['التعليم الشرعي', 'الدعوة', 'مناهج طلب العلم'],
		secondaryAliases: ['مناهج طلب العلم', 'التعليم الشرعي', 'الدعوة إلى الله']
	}
]);

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

function normalizedTokens(value) {
	return new Set(normalizeArabic(value).split(' ').filter((w) => w.length >= 3));
}

function collectAliases(profile, level) {
	const key = `${level}Aliases`;
	return [
		profile?.[`${level}Name`],
		...(Array.isArray(profile?.[key]) ? profile[key] : [])
	].filter(Boolean);
}

function scoreNameAgainstAliases(name, aliases) {
	const node = normalizeArabic(name);
	if (!node) return 0;
	const nodeTokens = normalizedTokens(node);
	let best = 0;
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (node === a) best = Math.max(best, 20);
		else if (node.includes(a) || a.includes(node)) best = Math.max(best, 14);
		const aliasTokens = normalizedTokens(a);
		const overlap = tokenSetsOverlapRatio(nodeTokens, aliasTokens);
		if (overlap >= 0.5) best = Math.max(best, 10 + overlap * 4);
		else if (overlap >= 0.25) best = Math.max(best, 6 + overlap * 4);
	}
	return best;
}

function scoreProfile(profile, bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	if (!haystack) return 0;
	let score = 0;
	for (const raw of profile.keywords || []) {
		const kw = normalizeArabic(raw);
		if (!kw) continue;
		if (haystack.includes(kw)) {
			score += kw.includes(' ') ? 5 : 2;
		}
	}
	return score;
}

function findBestMain(tree, profile, minScore = 7) {
	let best = null;
	let bestScore = 0;
	const aliases = collectAliases(profile, 'main');
	for (const main of tree || []) {
		const score = scoreNameAgainstAliases(main?.name, aliases);
		if (score > bestScore) {
			best = main;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function findBestSubUnder(main, profile, minScore = 7) {
	let best = null;
	let bestScore = 0;
	const aliases = collectAliases(profile, 'sub');
	for (const sub of main?.children || []) {
		const score = scoreNameAgainstAliases(sub?.name, aliases);
		if (score > bestScore) {
			best = sub;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function findBestSecondaryUnder(sub, profile, bookMeta, minScore = 7) {
	let best = null;
	let bestScore = 0;
	const aliases = [
		...collectAliases(profile, 'secondary'),
		deriveSecondaryName(bookMeta, profile)
	].filter(Boolean);
	for (const sec of sub?.children || []) {
		const aliasScore = scoreNameAgainstAliases(sec?.name, aliases);
		const reuseScore = scoreSecondaryForReuse(sec, bookMeta, profile.secondaryName);
		const score = Math.max(aliasScore, reuseScore);
		if (score > bestScore) {
			best = sec;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function findBestSubGlobal(tree, profile, minScore = 7) {
	let best = null;
	let bestMain = null;
	let bestScore = 0;
	for (const main of tree || []) {
		for (const sub of main.children || []) {
			const score = scoreNameAgainstAliases(sub?.name, collectAliases(profile, 'sub'));
			if (score > bestScore) {
				best = sub;
				bestMain = main;
				bestScore = score;
			}
		}
	}
	return best && bestMain && bestScore >= minScore
		? { main: bestMain, sub: best, score: bestScore }
		: null;
}

function findBestSecondaryGlobal(tree, profile, bookMeta, minScore = 7) {
	let best = null;
	let bestSub = null;
	let bestMain = null;
	let bestScore = 0;
	for (const main of tree || []) {
		for (const sub of main.children || []) {
			const sec = findBestSecondaryUnder(sub, profile, bookMeta, minScore);
			if (sec && sec.score > bestScore) {
				best = sec.node;
				bestSub = sub;
				bestMain = main;
				bestScore = sec.score;
			}
		}
	}
	return best && bestSub && bestMain
		? { main: bestMain, sub: bestSub, secondary: best, score: bestScore }
		: null;
}

function chooseProfile(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const profile of SUBJECT_PROFILES) {
		const score = scoreProfile(profile, bookMeta);
		if (score > bestScore) {
			best = profile;
			bestScore = score;
		}
	}
	if (best && bestScore >= 4) return { profile: best, score: bestScore };
	return null;
}

function cleanTopicName(value) {
	return String(value || '')
		.replace(/^كتب\s+(?:في|عن)?\s*/u, '')
		.replace(/^كتاب\s+/u, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

function deriveSecondaryName(bookMeta, profile = null) {
	if (profile?.secondaryName) return profile.secondaryName;
	for (const hint of bookMeta?.categoryHints || []) {
		const cleaned = cleanTopicName(hint);
		if (cleaned && cleaned.length >= 4 && !/^(الرئيسية|home|كتب)$/i.test(cleaned)) {
			return cleaned;
		}
	}
	const stem = cleanTopicName(seriesStemFromTitle(bookMeta?.title || ''));
	return stem && stem.length >= 4 ? stem : 'كتب عامة';
}

function resolveProfileDecision(sections, bookMeta, profileMatch) {
	const { profile, score } = profileMatch;
	const secondaryName = deriveSecondaryName(bookMeta, profile);
	const secondaryGlobal = findBestSecondaryGlobal(sections.tree, profile, bookMeta);
	if (secondaryGlobal) {
		return {
			kind: 'existing',
			mainId: String(secondaryGlobal.main.id),
			subId: String(secondaryGlobal.sub.id),
			secondaryId: String(secondaryGlobal.secondary.id),
			confidence: Math.min(0.75 + score * 0.02, 0.97),
			reasoning: `مطابقة موضوعية دقيقة: ${profile.subName} > ${secondaryGlobal.secondary.name}`,
			method: 'profile'
		};
	}

	const subGlobal = findBestSubGlobal(sections.tree, profile);
	if (subGlobal) {
		return {
			kind: 'create_secondary',
			mainId: String(subGlobal.main.id),
			subId: String(subGlobal.sub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.7 + score * 0.02, 0.94),
			reasoning: `وُجد القسم الفرعي المناسب "${subGlobal.sub.name}"، وسيُنشأ قسم ثانوي للموضوع.`,
			method: 'profile'
		};
	}

	const main = findBestMain(sections.tree, profile);
	if (main) {
		const sub = findBestSubUnder(main.node, profile);
		if (sub) {
			return {
				kind: 'create_secondary',
				mainId: String(main.node.id),
				subId: String(sub.node.id),
				secondaryId: null,
				newSecondaryName: secondaryName,
				confidence: Math.min(0.68 + score * 0.02, 0.92),
				reasoning: `وُجد المسار الأعلى، وسيُنشأ القسم الثانوي "${secondaryName}".`,
				method: 'profile'
			};
		}
		return {
			kind: 'create_sub',
			mainId: String(main.node.id),
			subId: null,
			secondaryId: null,
			newSubName: profile.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.64 + score * 0.02, 0.9),
			reasoning: `وُجد القسم الرئيسي "${main.node.name}" دون فرع مناسب؛ سيُنشأ الفرع والثانوي.`,
			method: 'profile'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: profile.mainName,
		newSubName: profile.subName,
		newSecondaryName: secondaryName,
		confidence: Math.min(0.6 + score * 0.02, 0.88),
		reasoning: `لا يوجد مسار مناسب لموضوع "${profile.subName}"؛ سيُنشأ مسار كامل جديد.`,
		method: 'profile'
	};
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

	const profileMatch = chooseProfile(bookMeta);
	if (profileMatch) {
		return resolveProfileDecision(sections, bookMeta, profileMatch);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	const validation = sug
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false };
	if (!sug || !validation.valid || sug.confidence < 0.65) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'الموضوعات الإسلامية العامة',
			newSubName: 'كتب عامة',
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: 0.35,
			reasoning: 'لم توجد مطابقة آمنة؛ إنشاء مسار عام مستقل لتفادي خلط المجالات.',
			method: 'fallback_create'
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
			secondaryId: null,
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: sug.confidence,
			reasoning: 'وُجد القسم الفرعي المناسب دون ثانوي مناسب؛ سيُنشأ قسم ثانوي للكتاب.',
			method: 'heuristic_create_secondary'
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
