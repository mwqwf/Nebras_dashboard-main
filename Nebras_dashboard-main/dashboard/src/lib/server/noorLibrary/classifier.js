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

function tokensOf(s) {
	return normalizeArabic(s)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3);
}

function bookHaystack(bookMeta) {
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

function includesAny(haystack, terms) {
	for (const term of terms || []) {
		const n = normalizeArabic(term);
		if (n && haystack.includes(n)) return true;
	}
	return false;
}

/**
 * خريطة فنون محافظة. الهدف ليس "تجميل" الشجرة، بل منع الخلط:
 * الفقه لا يدخل في الآداب، التاريخ لا يدخل في العقيدة، وهكذا.
 */
const SUBJECT_PROFILES = Object.freeze([
	{
		id: 'talab_alilm',
		mainName: 'التربية والتزكية',
		subName: 'طلب العلم وآدابه',
		secondaryName: 'آداب طالب العلم',
		mainAliases: ['التربية', 'التزكية', 'الأخلاق والتزكية', 'التزكية والأخلاق'],
		subAliases: ['طلب العلم', 'آداب طالب العلم', 'العلم وآدابه', 'التعليم الشرعي'],
		secondaryAliases: ['آداب طالب العلم', 'نصائح لطلاب العلم', 'وصايا طالب العلم'],
		keywords: [
			['طلب العلم', 9],
			['طالب العلم', 9],
			['طلاب العلم', 9],
			['آداب طالب العلم', 11],
			['آداب العلم', 9],
			['التعليم الشرعي', 8],
			['التعليمات العلمية', 8],
			['نصائح', 4],
			['وصايا', 4],
			['العلماء', 3]
		]
	},
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		mainAliases: ['القرآن', 'علوم القرآن', 'القرآن الكريم', 'كتب في التفسير وعلوم القرآن'],
		subAliases: ['التفسير', 'علوم القرآن', 'تفسير القرآن'],
		secondaryAliases: ['التفسير', 'تفسير القرآن', 'علوم القرآن'],
		keywords: [
			['تفسير', 8],
			['المفسر', 6],
			['القرآن', 7],
			['علوم القرآن', 10],
			['القراءات', 8],
			['التجويد', 8],
			['أسباب النزول', 8]
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'شروح الحديث',
		mainAliases: ['الحديث', 'السنة', 'علوم الحديث', 'كتب في الحديث وعلومه'],
		subAliases: ['الحديث وعلومه', 'علوم الحديث', 'السنة النبوية'],
		secondaryAliases: ['شروح الحديث', 'مصطلح الحديث', 'الأحاديث'],
		keywords: [
			['حديث', 8],
			['الأحاديث', 8],
			['السنة', 7],
			['صحيح البخاري', 10],
			['صحيح مسلم', 10],
			['سنن', 6],
			['مصطلح الحديث', 10],
			['الجرح والتعديل', 9],
			['الرواة', 7]
		]
	},
	{
		id: 'sirah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'السيرة النبوية',
		mainAliases: ['السيرة', 'الشمائل', 'كتب في السيرة النبوية'],
		subAliases: ['السيرة النبوية', 'الشمائل المحمدية', 'المغازي'],
		secondaryAliases: ['السيرة النبوية', 'الشمائل', 'المغازي'],
		keywords: [
			['السيرة', 9],
			['النبوية', 5],
			['الشمائل', 8],
			['المغازي', 8],
			['غزوة', 6],
			['الرسول', 5],
			['النبي', 5]
		]
	},
	{
		id: 'usul_fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'أصول الفقه والقواعد',
		secondaryName: 'أصول الفقه',
		mainAliases: ['الفقه', 'أصول الفقه', 'كتب في الفقه وأصوله'],
		subAliases: ['أصول الفقه', 'القواعد الفقهية', 'أصول الفقه والقواعد'],
		secondaryAliases: ['أصول الفقه', 'القواعد الفقهية', 'مقاصد الشريعة'],
		keywords: [
			['أصول الفقه', 12],
			['اصول الفقه', 12],
			['القواعد الفقهية', 10],
			['مقاصد الشريعة', 10],
			['الاستنباط', 6],
			['الإجماع', 5],
			['القياس', 5]
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الدراسات الفقهية',
		secondaryName: 'الفقه الإسلامي',
		mainAliases: ['الفقه', 'كتب في الفقه وأصوله', 'الشريعة'],
		subAliases: ['الفقه الإسلامي', 'الدراسات الفقهية', 'فقه العبادات', 'فقه المعاملات'],
		secondaryAliases: ['الفقه الإسلامي', 'فقه العبادات', 'فقه المعاملات', 'أحكام فقهية'],
		keywords: [
			['فقه', 8],
			['الفقه', 8],
			['الفتاوى', 8],
			['فتاوى', 8],
			['الطهارة', 6],
			['الصلاة', 6],
			['الزكاة', 6],
			['الصيام', 6],
			['الحج', 6],
			['المعاملات', 6],
			['النكاح', 6],
			['الطلاق', 6],
			['البيع', 5]
		],
		negativeTerms: ['فقه اللغة']
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة والتوحيد',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'التوحيد',
		mainAliases: ['العقيدة', 'التوحيد', 'كتب في العقيدة'],
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
		secondaryAliases: ['التوحيد', 'الإيمان', 'أسماء الله وصفاته'],
		keywords: [
			['العقيدة', 9],
			['عقيدة', 9],
			['التوحيد', 9],
			['الإيمان', 7],
			['الشرك', 7],
			['أسماء الله وصفاته', 10],
			['القدر', 6],
			['الفرقة الناجية', 7]
		]
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'التاريخ الإسلامي',
		mainAliases: ['التاريخ', 'التاريخ الإسلامي', 'السير والتراجم'],
		subAliases: ['التاريخ الإسلامي', 'التراجم', 'السير'],
		secondaryAliases: ['التاريخ الإسلامي', 'تراجم العلماء', 'السير'],
		keywords: [
			['التاريخ', 8],
			['تاريخ', 8],
			['التراجم', 7],
			['ترجمة', 5],
			['الطبقات', 7],
			['الدولة الأموية', 8],
			['الدولة العباسية', 8],
			['الأندلس', 7]
		],
		negativeTerms: ['تاريخ التشريع', 'تاريخ الفقه']
	},
	{
		id: 'akhlaq',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'الأخلاق الإسلامية',
		mainAliases: ['التزكية', 'الأخلاق', 'الآداب', 'كتب في التزكية والأخلاق'],
		subAliases: ['الأخلاق والآداب', 'الآداب الشرعية', 'الرقائق'],
		secondaryAliases: ['الأخلاق الإسلامية', 'الآداب الشرعية', 'الرقائق والزهد'],
		keywords: [
			['الأخلاق', 8],
			['أخلاق', 8],
			['الآداب', 8],
			['آداب', 8],
			['التزكية', 8],
			['الزهد', 7],
			['الرقائق', 7],
			['المواعظ', 6]
		],
		negativeTerms: ['آداب طالب العلم']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو والصرف',
		mainAliases: ['اللغة العربية', 'العربية', 'كتب في اللغة العربية'],
		subAliases: ['النحو', 'الصرف', 'البلاغة', 'علوم اللغة العربية'],
		secondaryAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي'],
		keywords: [
			['النحو', 8],
			['الصرف', 8],
			['البلاغة', 8],
			['اللغة العربية', 10],
			['فقه اللغة', 10],
			['الأدب العربي', 8],
			['العروض', 7]
		]
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة إلى الله',
		secondaryName: 'الدعوة والإرشاد',
		mainAliases: ['الدعوة', 'الثقافة الإسلامية', 'الدعوة الإسلامية'],
		subAliases: ['الدعوة إلى الله', 'الإرشاد', 'الحسبة'],
		secondaryAliases: ['الدعوة والإرشاد', 'الأمر بالمعروف والنهي عن المنكر'],
		keywords: [
			['الدعوة', 8],
			['داعية', 6],
			['الإرشاد', 6],
			['الحسبة', 7],
			['الأمر بالمعروف', 8],
			['النهي عن المنكر', 8],
			['الثقافة الإسلامية', 7]
		]
	}
]);

const MIN_PROFILE_SCORE = 8;
const MIN_NODE_MATCH = 5;

function scoreTerms(haystack, terms) {
	let score = 0;
	for (const pair of terms || []) {
		const [term, weight] = pair;
		const n = normalizeArabic(term);
		if (!n) continue;
		if (haystack.includes(n)) score += Number(weight) || 1;
	}
	return score;
}

function scoreProfile(profile, bookMeta) {
	const haystack = bookHaystack(bookMeta);
	let score = scoreTerms(haystack, profile.keywords);
	if (includesAny(haystack, profile.negativeTerms)) score -= 12;
	if (includesAny(haystack, profile.mainAliases)) score += 2;
	if (includesAny(haystack, profile.subAliases)) score += 3;
	if (includesAny(haystack, profile.secondaryAliases)) score += 4;
	return { profile, score };
}

function pickSubjectProfile(bookMeta) {
	const ranked = SUBJECT_PROFILES
		.map((profile) => scoreProfile(profile, bookMeta))
		.sort((a, b) => b.score - a.score);
	const best = ranked[0];
	if (!best || best.score < MIN_PROFILE_SCORE) return null;
	const runnerUp = ranked[1];
	if (runnerUp && runnerUp.score > 0 && best.score - runnerUp.score < 3) {
		// عند التباس فنّين متقاربين لا نُغامر بخلطهما في قسم موجود خطأ.
		return null;
	}
	return best;
}

function aliasList(...parts) {
	return parts.flat().filter(Boolean);
}

function scoreNodeAgainstAliases(name, aliases) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) score = Math.max(score, 12);
		else if (n.includes(a) || a.includes(n)) score = Math.max(score, 8);
		else {
			const nTokens = new Set(tokensOf(n));
			const aTokens = new Set(tokensOf(a));
			let overlap = 0;
			for (const t of aTokens) if (nTokens.has(t)) overlap += 1;
			if (overlap > 0) score = Math.max(score, Math.min(6, overlap * 3));
		}
	}
	return score;
}

function pickBestNode(nodes, aliases, minScore = MIN_NODE_MATCH) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNodeAgainstAliases(node?.name || '', aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

function proposedSecondaryName(profile, bookMeta) {
	const haystack = bookHaystack(bookMeta);
	if (profile.id === 'fiqh') {
		if (includesAny(haystack, ['الصلاة', 'الطهارة', 'الزكاة', 'الصيام', 'الحج'])) {
			return 'فقه العبادات';
		}
		if (includesAny(haystack, ['البيع', 'المعاملات', 'الربا', 'الشركات', 'الإجارة'])) {
			return 'فقه المعاملات';
		}
		if (includesAny(haystack, ['النكاح', 'الطلاق', 'الأسرة', 'المواريث'])) {
			return 'فقه الأسرة';
		}
	}
	if (profile.id === 'hadith') {
		if (includesAny(haystack, ['مصطلح الحديث', 'الجرح والتعديل', 'الرواة'])) {
			return 'مصطلح الحديث';
		}
	}
	if (profile.id === 'quran') {
		if (includesAny(haystack, ['التجويد', 'القراءات'])) return 'التجويد والقراءات';
		if (includesAny(haystack, ['علوم القرآن', 'أسباب النزول'])) return 'علوم القرآن';
	}
	if (profile.id === 'arabic') {
		if (includesAny(haystack, ['البلاغة'])) return 'البلاغة';
		if (includesAny(haystack, ['الأدب العربي'])) return 'الأدب العربي';
	}
	return profile.secondaryName;
}

function firstMeaningfulCategory(bookMeta) {
	const ignored = new Set(['كتب اسلاميه', 'كتب اسلامية', 'كتب', 'مكتبة نور']);
	for (const hint of bookMeta?.categoryHints || []) {
		let h = normalizeArabic(hint)
			.replace(/^كتب\s+في\s+/u, '')
			.replace(/^كتب\s+/u, '')
			.trim();
		if (h && !ignored.has(h) && h.length >= 4) return hint.replace(/^كتب\s+(?:في\s+)?/u, '').trim();
	}
	return '';
}

function fallbackSecondaryName(bookMeta) {
	const category = firstMeaningfulCategory(bookMeta);
	if (category) return category.slice(0, 80);
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length <= 80) return stem;
	return 'موضوعات عامة';
}

function classifyBySubjectProfile(sections, bookMeta, scoredProfile) {
	if (!scoredProfile) return null;
	const { profile, score } = scoredProfile;
	const secondaryName = proposedSecondaryName(profile, bookMeta);
	const mainAliases = aliasList(profile.mainName, profile.mainAliases);
	const subAliases = aliasList(profile.subName, profile.subAliases, secondaryName);
	const secondaryAliases = aliasList(secondaryName, profile.secondaryName, profile.secondaryAliases);

	const mainMatch = pickBestNode(sections.tree, mainAliases);
	if (!mainMatch) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: profile.mainName,
			newSubName: profile.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.72 + score * 0.02, 0.96),
			reasoning: `لا يوجد قسم رئيسي مناسب لفن "${profile.mainName}" — إنشاء مسار كامل.`,
			method: `subject:${profile.id}`
		};
	}

	const main = mainMatch.node;
	const subMatch = pickBestNode(main.children || [], subAliases);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: profile.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.72 + score * 0.02, 0.96),
			reasoning: `القسم الرئيسي مناسب، ولا يوجد قسم فرعي مناسب لفن "${profile.subName}".`,
			method: `subject:${profile.id}`
		};
	}

	const sub = subMatch.node;
	const secondaryMatch = pickBestNode(sub.children || [], secondaryAliases);
	if (!secondaryMatch) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.72 + score * 0.02, 0.96),
			reasoning: `المسار الرئيسي/الفرعي مناسب، ولا يوجد قسم ثانوي مناسب باسم "${secondaryName}".`,
			method: `subject:${profile.id}`
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondaryMatch.node.id),
		confidence: Math.min(0.75 + score * 0.02, 0.98),
		reasoning: `مطابقة موضوعية محافظة لفن "${profile.mainName}" ضمن مسار ثلاثي موجود.`,
		method: `subject:${profile.id}`
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
		scores: { main: bestMainScore, sub: bestSubScore, secondary: bestSecScore },
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
		const scored = pickSubjectProfile(bookMeta);
		const profile = scored?.profile;
		if (profile) {
			const secondaryName = proposedSecondaryName(profile, bookMeta);
			return {
				kind: 'create_main',
				mainId: null,
				subId: null,
				secondaryId: null,
				newMainName: profile.mainName,
				newSubName: profile.subName,
				newSecondaryName: secondaryName,
				confidence: Math.min(0.72 + scored.score * 0.02, 0.96),
				reasoning: 'الشجرة فارغة — إنشاء مسار ثلاثي حسب فن الكتاب.',
				method: `subject:${profile.id}`
			};
		}
		const secondaryName = fallbackSecondaryName(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'موضوعات إسلامية عامة',
			newSubName: 'متفرقات مكتبة نور',
			newSecondaryName: secondaryName,
			confidence: 0.45,
			reasoning: 'الشجرة فارغة ولا يوجد فن واضح — إنشاء مسار عام مستقل بدل خلطه بقسم خاطئ.',
			method: 'fallback:create_path'
		};
	}

	const subjectDecision = classifyBySubjectProfile(sections, bookMeta, pickSubjectProfile(bookMeta));
	if (subjectDecision) return subjectDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const secondaryName = fallbackSecondaryName(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'موضوعات إسلامية عامة',
			newSubName: 'متفرقات مكتبة نور',
			newSecondaryName: secondaryName,
			confidence: 0.35,
			reasoning: 'لا توجد مطابقة كافية — إنشاء مسار عام مستقل بدل خلط الكتاب.',
			method: 'fallback:create_path'
		};
	}

	const strongMainSubMatch = Number(sug.scores?.main || 0) + Number(sug.scores?.sub || 0) >= 4;
	if (!strongMainSubMatch) {
		const secondaryName = fallbackSecondaryName(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'موضوعات إسلامية عامة',
			newSubName: 'متفرقات مكتبة نور',
			newSecondaryName: secondaryName,
			confidence: 0.38,
			reasoning: 'المطابقة النصية ضعيفة — إنشاء مسار مستقل يمنع الخلط بين الفنون.',
			method: 'fallback:create_path'
		};
	}

	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: fallbackSecondaryName(bookMeta),
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
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: Math.max(0.45, sug.confidence),
			reasoning: 'وجدنا main/sub مناسبين، ولا يوجد قسم ثانوي مناسب — إنشاء ثانوي للكتاب.',
			method: 'heuristic:create_secondary'
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
