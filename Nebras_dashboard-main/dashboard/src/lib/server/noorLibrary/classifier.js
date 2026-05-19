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

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function overlapRatio(setA, setB) {
	if (!setA.size || !setB.size) return 0;
	let inter = 0;
	for (const t of setA) if (setB.has(t)) inter += 1;
	return inter / new Set([...setA, ...setB]).size;
}

function hasPhrase(haystack, phrase) {
	const n = normalizeArabic(phrase);
	return Boolean(n && haystack.includes(n));
}

function scoreKeywordList(haystack, tokens, keywords = []) {
	let score = 0;
	for (const kw of keywords) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (haystack.includes(n)) score += n.includes(' ') ? 4 : 2;
		else if (tokens.has(n)) score += 1;
	}
	return score;
}

/**
 * خرائط التصنيف المحافظة: كل ملف شخصي يصف "المكان الصحيح" للكتاب
 * دلالياً. الترتيب مهم: السياسة الشرعية قبل الآداب حتى لا تُخلط
 * نصائح الحكّام العامة مع كتب الأخلاق، والتاريخ مستقل عن العقيدة.
 */
const DOMAIN_PROFILES = Object.freeze([
	{
		id: 'governance_fiqh',
		main: 'الفقه الإسلامي',
		mainAliases: ['فقه', 'الشريعة الإسلامية', 'علوم الفقه'],
		sub: 'السياسة الشرعية',
		subAliases: ['الأحكام السلطانية', 'فقه الإمارة والحكم', 'فقه السياسة'],
		secondary: 'نصائح العلماء والحكام',
		secondaryAliases: ['الآداب السلطانية', 'نصائح الحكام', 'السلاطين والأمراء'],
		keywords: [
			'السياسة الشرعية',
			'الأحكام السلطانية',
			'السلاطين',
			'السلاطين والأمراء',
			'الأمراء',
			'الحكام',
			'الرعية',
			'الإمارة',
			'الولاية',
			'السلطان',
			'الملك'
		]
	},
	{
		id: 'quran',
		main: 'القرآن الكريم',
		mainAliases: ['علوم القرآن', 'القرآن وعلومه'],
		sub: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن', 'تفسير القرآن'],
		secondary: 'التفسير',
		secondaryAliases: ['تفاسير القرآن', 'معاني القرآن'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'سورة', 'آية', 'آيات', 'تجويد', 'قراءات', 'أسباب النزول']
	},
	{
		id: 'hadith',
		main: 'الحديث الشريف',
		mainAliases: ['الحديث وعلومه', 'السنة النبوية'],
		sub: 'كتب الحديث وعلومه',
		subAliases: ['علوم الحديث', 'مصطلح الحديث', 'شروح الحديث'],
		secondary: 'علوم الحديث',
		secondaryAliases: ['مصطلح الحديث', 'شروح الحديث'],
		keywords: ['حديث', 'الأحاديث', 'السنة', 'صحيح البخاري', 'صحيح مسلم', 'سنن', 'مسند', 'مصطلح الحديث']
	},
	{
		id: 'aqeedah',
		main: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة', 'التوحيد'],
		sub: 'العقيدة والتوحيد',
		subAliases: ['التوحيد', 'الإيمان', 'أصول الدين'],
		secondary: 'العقيدة والتوحيد',
		secondaryAliases: ['شرح العقيدة', 'كتب التوحيد'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'إيمان', 'الشرك', 'أسماء الله', 'صفات الله', 'أصول الدين']
	},
	{
		id: 'fiqh',
		main: 'الفقه الإسلامي',
		mainAliases: ['فقه', 'الشريعة الإسلامية', 'علوم الفقه'],
		sub: 'الفقه وأصوله',
		subAliases: ['أصول الفقه', 'العبادات', 'المعاملات', 'فتاوى'],
		secondary: 'الفقه وأصوله',
		secondaryAliases: ['أصول الفقه', 'فقه العبادات', 'فقه المعاملات'],
		keywords: ['فقه', 'أصول الفقه', 'فتوى', 'فتاوى', 'عبادات', 'معاملات', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج']
	},
	{
		id: 'seerah',
		main: 'السيرة النبوية',
		mainAliases: ['السيرة', 'شمائل النبي'],
		sub: 'السيرة والشمائل',
		subAliases: ['السيرة النبوية', 'الشمائل المحمدية', 'المغازي'],
		secondary: 'السيرة النبوية',
		secondaryAliases: ['الشمائل المحمدية', 'المغازي'],
		keywords: ['سيرة', 'النبي', 'الرسول', 'محمد صلى الله عليه وسلم', 'شمائل', 'مغازي', 'غزوات']
	},
	{
		id: 'history',
		main: 'التاريخ الإسلامي',
		mainAliases: ['التاريخ', 'التراجم والسير'],
		sub: 'التاريخ والتراجم',
		subAliases: ['تاريخ إسلامي', 'تراجم', 'طبقات', 'سير الأعلام'],
		secondary: 'التاريخ الإسلامي',
		secondaryAliases: ['التراجم', 'الطبقات'],
		keywords: ['تاريخ', 'تراجم', 'طبقات', 'أعلام', 'سير', 'خلافة', 'الدولة', 'فتوح', 'الأندلس']
	},
	{
		id: 'tazkiyah_adab',
		main: 'التزكية والأخلاق',
		mainAliases: ['الأخلاق والآداب', 'الآداب', 'الرقائق والزهد'],
		sub: 'الآداب والأخلاق',
		subAliases: ['الأخلاق', 'الآداب الشرعية', 'الرقائق', 'الزهد'],
		secondary: 'النصائح والآداب',
		secondaryAliases: ['نصائح تربوية', 'المواعظ', 'إصلاح البيوت'],
		keywords: ['أخلاق', 'آداب', 'تزكية', 'زهد', 'رقائق', 'موعظة', 'نصائح', 'تربية', 'إصلاح البيوت']
	},
	{
		id: 'education_research',
		main: 'العلوم والمعارف',
		mainAliases: ['التعليم والثقافة', 'الثقافة والمعرفة'],
		sub: 'التعليم والبحث العلمي',
		subAliases: ['البحث العلمي', 'مناهج البحث', 'التعليم'],
		secondary: 'نصائح وإرشادات علمية',
		secondaryAliases: ['إرشادات البحث العلمي', 'مهارات التعلم', 'كتابة البحث العلمي'],
		keywords: [
			'البحث العلمي',
			'مناهج البحث',
			'إعداد البحث',
			'ورقة بحثية',
			'رسالة علمية',
			'التعليم',
			'التعلم',
			'التدريس',
			'إرشادات علمية',
			'تعليمات علمية'
		]
	},
	{
		id: 'arabic_language',
		main: 'اللغة العربية',
		mainAliases: ['علوم اللغة العربية', 'العربية'],
		sub: 'علوم اللغة العربية',
		subAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondary: 'علوم اللغة العربية',
		secondaryAliases: ['النحو', 'الصرف', 'البلاغة'],
		keywords: ['لغة عربية', 'نحو', 'صرف', 'بلاغة', 'إعراب', 'أدب عربي', 'معجم', 'قاموس']
	},
	{
		id: 'dawah',
		main: 'الدعوة والإرشاد',
		mainAliases: ['الدعوة', 'الإرشاد'],
		sub: 'الدعوة إلى الله',
		subAliases: ['دروس إسلامية', 'خطب', 'محاضرات'],
		secondary: 'الدعوة والإرشاد',
		secondaryAliases: ['الخطب والمحاضرات', 'دروس دينية'],
		keywords: ['دعوة', 'داعية', 'إرشاد', 'خطب', 'خطبة', 'محاضرة', 'دروس دينية', 'درس ديني']
	}
]);

const FALLBACK_PROFILE = Object.freeze({
	id: 'general_library',
	main: 'المكتبة',
	mainAliases: ['كتب إسلامية', 'المكتبة الإسلامية', 'كتب متنوعة'],
	sub: 'كتب متنوّعة',
	subAliases: ['متفرقات', 'كتب عامة'],
	secondary: 'كتب متنوّعة',
	secondaryAliases: ['متفرقات'],
	keywords: []
});

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

function pickDomainProfile(bookMeta) {
	const haystack = bookHaystack(bookMeta);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const profile of DOMAIN_PROFILES) {
		let score = scoreKeywordList(haystack, tokens, profile.keywords);
		// لا نعدّ كلمة "العلماء" وحدها دليلاً على قسم التعليم/البحث العلمي.
		if (profile.id === 'education_research' && hasPhrase(haystack, 'العلماء') && score < 4) {
			score = 0;
		}
		if (score > bestScore) {
			bestScore = score;
			best = profile;
		}
	}
	return bestScore >= 2 ? best : FALLBACK_PROFILE;
}

function labelTokens(profile, level) {
	const main =
		level === 'main'
			? [profile.main, ...(profile.mainAliases || [])]
			: level === 'sub'
				? [profile.sub, ...(profile.subAliases || [])]
				: [profile.secondary, ...(profile.secondaryAliases || [])];
	return main.filter(Boolean);
}

function scoreSectionName(sectionName, profile, level, haystack, hayTokens) {
	const sectionN = normalizeArabic(sectionName);
	if (!sectionN) return 0;
	const sectionTokens = tokensOf(sectionN);
	let score = 0;
	for (const label of labelTokens(profile, level)) {
		const labelN = normalizeArabic(label);
		if (!labelN) continue;
		const labelTokensSet = tokensOf(labelN);
		if (sectionN === labelN) score += 18;
		else if (sectionN.includes(labelN) || labelN.includes(sectionN)) score += 12;
		score += overlapRatio(sectionTokens, labelTokensSet) * 10;
	}
	if (haystack.includes(sectionN) && sectionN.length >= 4) score += 5;
	score += overlapRatio(sectionTokens, hayTokens) * 4;
	return score;
}

function findBestNode(nodes, profile, level, haystack, hayTokens, minScore = 5) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreSectionName(node?.name || '', profile, level, haystack, hayTokens);
		if (score > bestScore) {
			bestScore = score;
			best = node;
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

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec ? bestSec.id : null,
		confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05, 0.85),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic'
	};
}

function proposeSecondaryName(profile, bookMeta) {
	if (profile.id === 'general_library') {
		const stem = seriesStemFromTitle(bookMeta?.title || '');
		if (stem && stem.length >= 4 && stem.length <= 70) return stem;
	}
	return profile.secondary || 'كتب متنوّعة';
}

function classifyWithCreation(sections, bookMeta) {
	const tree = sections.tree || [];
	const profile = pickDomainProfile(bookMeta);
	const haystack = bookHaystack(bookMeta);
	const hayTokens = tokensOf(haystack);
	const mainMatch = findBestNode(tree, profile, 'main', haystack, hayTokens, 5);
	const secondaryName = proposeSecondaryName(profile, bookMeta);

	if (!mainMatch) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: profile.main,
			newSubName: profile.sub,
			newSecondaryName: secondaryName,
			confidence: 0.42,
			reasoning: `لم يُعثَر على قسم رئيسي مناسب — إنشاء المسار: ${profile.main} ← ${profile.sub} ← ${secondaryName}.`,
			method: 'heuristic'
		};
	}

	const main = mainMatch.node;
	const subMatch = findBestNode(main.children || [], profile, 'sub', haystack, hayTokens, 5);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: profile.sub,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.48 + mainMatch.score * 0.02, 0.78),
			reasoning: `وُجد القسم الرئيسي "${main.name}" دون فرع مناسب — إنشاء: ${profile.sub} ← ${secondaryName}.`,
			method: 'heuristic'
		};
	}

	const sub = subMatch.node;
	const secondaryProfile = { ...profile, secondary: secondaryName };
	const secondaryMatch = findBestNode(
		sub.children || [],
		secondaryProfile,
		'secondary',
		haystack,
		hayTokens,
		5
	);
	if (!secondaryMatch) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.55 + (mainMatch.score + subMatch.score) * 0.02, 0.86),
			reasoning: `وُجد المسار حتى الفرع "${main.name} ← ${sub.name}" دون قسم ثانوي مناسب — إنشاء: ${secondaryName}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondaryMatch.node.id),
		confidence: Math.min(0.62 + (mainMatch.score + subMatch.score + secondaryMatch.score) * 0.015, 0.92),
		reasoning: `مطابقة محلّيّة محافظة: ${main.name} ← ${sub.name} ← ${secondaryMatch.node.name}.`,
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
	return classifyWithCreation(sections, bookMeta);
}
