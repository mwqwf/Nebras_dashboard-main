/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const PROFILE_MIN_SCORE = 7;
const MAIN_MATCH_MIN_SCORE = 5;
const SUB_MATCH_MIN_SCORE = 5;
const SECONDARY_MATCH_MIN_SCORE = 5;

const GENERIC_MAIN = 'مكتبة إسلامية عامة';
const GENERIC_SUB = 'موضوعات عامة';
const GENERIC_SECONDARY = 'مصنفات عامة';

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

function uniqueList(values) {
	return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
}

function tokensOf(value) {
	return normalizeArabic(value).split(' ').filter((t) => t.length >= 3);
}

function buildBookHaystack(bookMeta) {
	const title = normalizeArabic(bookMeta?.title || '');
	const author = normalizeArabic(bookMeta?.author || '');
	const description = normalizeArabic(bookMeta?.description || '');
	const hints = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	const all = [title, author, description, hints].filter(Boolean).join(' ');
	return {
		title,
		author,
		description,
		hints,
		all,
		tokens: new Set(tokensOf(all))
	};
}

function keywordScoreInText(text, tokenSet, keywords, phraseWeight = 4) {
	const hay = normalizeArabic(text);
	if (!hay) return 0;
	let score = 0;
	for (const kw of uniqueList(keywords)) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (hay === n) score += phraseWeight + 6;
		else if (hay.includes(n) && n.length >= 4) score += phraseWeight;
		for (const t of tokensOf(n)) {
			if (tokenSet.has(t)) score += 1;
		}
	}
	return score;
}

function overlapScore(a, b) {
	const aTokens = tokensOf(a);
	const bTokens = tokensOf(b);
	if (!aTokens.length || !bTokens.length) return 0;
	const aSet = new Set(aTokens);
	const bSet = new Set(bTokens);
	let inter = 0;
	for (const t of aSet) if (bSet.has(t)) inter += 1;
	return (inter / new Set([...aSet, ...bSet]).size) * 10;
}

function scoreNameAgainst(name, preferredNames = [], keywords = []) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	const tokenSet = new Set(tokensOf(n));
	let score = 0;
	for (const target of uniqueList(preferredNames)) {
		const t = normalizeArabic(target);
		if (!t) continue;
		if (n === t) score += 24;
		else if (n.includes(t) || t.includes(n)) score += 12;
		score += overlapScore(n, t);
	}
	score += keywordScoreInText(n, tokenSet, keywords, 3);
	return score;
}

const TOPIC_PROFILES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		mainAliases: ['القرآن الكريم', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن'],
		secondaryName: 'تفسير القرآن',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'سورة', 'آية', 'القراءات', 'التجويد', 'أسباب النزول', 'علوم القرآن'],
		secondaryRules: [
			{ name: 'التجويد والقراءات', keywords: ['تجويد', 'قراءات', 'رواية حفص', 'ورش'] },
			{ name: 'علوم القرآن', keywords: ['علوم القرآن', 'أسباب النزول', 'الناسخ والمنسوخ', 'المكي والمدني'] },
			{ name: 'تفسير القرآن', keywords: ['تفسير', 'معاني القرآن', 'تدبر', 'سورة'] }
		]
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		mainAliases: ['الحديث الشريف', 'السنة النبوية', 'علوم الحديث'],
		subName: 'الحديث وعلومه',
		subAliases: ['متون الحديث', 'علوم الحديث'],
		secondaryName: 'كتب الحديث',
		keywords: ['حديث', 'الأحاديث', 'السنة', 'رواة', 'إسناد', 'صحيح', 'سنن', 'مسند', 'مصطلح الحديث', 'جرح وتعديل'],
		secondaryRules: [
			{ name: 'مصطلح الحديث', keywords: ['مصطلح الحديث', 'إسناد', 'رواية', 'دراية', 'علل الحديث'] },
			{ name: 'شروح الحديث', keywords: ['شرح الحديث', 'فتح الباري', 'شرح صحيح', 'عمدة القاري'] },
			{ name: 'كتب الحديث', keywords: ['صحيح', 'سنن', 'مسند', 'موطأ', 'الأحاديث'] }
		]
	},
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي وأصوله',
		mainAliases: ['الفقه الإسلامي', 'الفقه وأصوله', 'كتب الفقه'],
		subName: 'الفقه وأصوله',
		subAliases: ['الفقه', 'أصول الفقه'],
		secondaryName: 'مسائل فقهية عامة',
		keywords: ['فقه', 'أصول الفقه', 'فتاوى', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'نكاح', 'طلاق', 'بيع', 'معاملات', 'مواريث'],
		secondaryRules: [
			{ name: 'العبادات', keywords: ['طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'عبادات'] },
			{ name: 'المعاملات', keywords: ['بيع', 'ربا', 'إجارة', 'شركة', 'وقف', 'معاملات'] },
			{ name: 'الأحوال الشخصية', keywords: ['نكاح', 'زواج', 'طلاق', 'عدة', 'مواريث', 'وصية'] },
			{ name: 'أصول الفقه', keywords: ['أصول الفقه', 'قياس', 'إجماع', 'استحسان', 'الأدلة'] },
			{ name: 'مسائل فقهية عامة', keywords: ['فقه', 'فتاوى', 'أحكام'] }
		]
	},
	{
		key: 'aqidah',
		mainName: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة', 'التوحيد', 'أصول الدين'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['التوحيد', 'أصول الدين', 'الإيمان'],
		secondaryName: 'التوحيد والإيمان',
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'شرك', 'أسماء الله', 'صفات', 'القدر', 'النبوة', 'اليوم الآخر', 'الفرق'],
		secondaryRules: [
			{ name: 'التوحيد والإيمان', keywords: ['توحيد', 'إيمان', 'شرك', 'عبادة'] },
			{ name: 'الأسماء والصفات', keywords: ['أسماء الله', 'صفات', 'الصفات', 'الأسماء الحسنى'] },
			{ name: 'الفرق والمذاهب العقدية', keywords: ['فرق', 'مذاهب', 'جهمية', 'معتزلة', 'أشاعرة'] }
		]
	},
	{
		key: 'sirah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التراجم'],
		subName: 'السيرة والتاريخ',
		subAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التراجم والطبقات'],
		secondaryName: 'التاريخ الإسلامي',
		keywords: ['سيرة', 'النبي', 'رسول الله', 'غزوة', 'مغازي', 'تاريخ', 'خلافة', 'صحابة', 'تراجم', 'طبقات', 'أعلام'],
		secondaryRules: [
			{ name: 'السيرة النبوية', keywords: ['سيرة', 'النبي', 'رسول الله', 'غزوة', 'مغازي'] },
			{ name: 'التاريخ الإسلامي', keywords: ['تاريخ', 'خلافة', 'دولة', 'فتوح', 'أموي', 'عباسي'] },
			{ name: 'التراجم والطبقات', keywords: ['تراجم', 'طبقات', 'أعلام', 'صحابة'] }
		]
	},
	{
		key: 'education_adab',
		mainName: 'التربية والآداب',
		mainAliases: ['التربية والتعليم', 'الآداب والأخلاق', 'تزكية النفس'],
		subName: 'التربية والتعليم',
		subAliases: ['التعليم', 'طلب العلم', 'آداب طالب العلم'],
		secondaryName: 'التعليم وطلب العلم',
		keywords: ['تربية', 'تعليم', 'تعليمات', 'علمية', 'طلب العلم', 'طالب العلم', 'معلم', 'متعلم', 'نصائح', 'آداب', 'أخلاق', 'تزكية'],
		secondaryRules: [
			{ name: 'التعليم وطلب العلم', keywords: ['تعليم', 'تعليمات', 'علمية', 'طلب العلم', 'طالب العلم', 'معلم', 'متعلم', 'نصائح'] },
			{ name: 'الآداب والأخلاق', keywords: ['آداب', 'أدب', 'أخلاق', 'فضائل', 'سلوك'] },
			{ name: 'تزكية النفس', keywords: ['تزكية', 'رقائق', 'زهد', 'قلوب', 'محاسبة النفس'] }
		]
	},
	{
		key: 'language',
		mainName: 'اللغة العربية وعلومها',
		mainAliases: ['اللغة العربية', 'النحو والصرف', 'الأدب العربي'],
		subName: 'علوم اللغة العربية',
		subAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondaryName: 'اللغة العربية',
		keywords: ['لغة عربية', 'نحو', 'صرف', 'بلاغة', 'إعراب', 'معجم', 'قاموس', 'أدب عربي', 'شعر'],
		secondaryRules: [
			{ name: 'النحو والصرف', keywords: ['نحو', 'صرف', 'إعراب'] },
			{ name: 'البلاغة', keywords: ['بلاغة', 'بيان', 'بديع', 'معاني'] },
			{ name: 'الأدب العربي', keywords: ['أدب عربي', 'شعر', 'نثر'] },
			{ name: 'المعاجم واللغة', keywords: ['معجم', 'قاموس', 'لغة'] }
		]
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والإرشاد',
		mainAliases: ['الدعوة', 'الإرشاد', 'الخطب والدروس'],
		subName: 'الدعوة والإرشاد',
		subAliases: ['الخطب', 'المواعظ', 'الإرشاد'],
		secondaryName: 'الدعوة إلى الله',
		keywords: ['دعوة', 'داعية', 'إرشاد', 'خطب', 'محاضرات', 'موعظة', 'نصح', 'الأمر بالمعروف', 'النهي عن المنكر'],
		secondaryRules: [
			{ name: 'الدعوة إلى الله', keywords: ['دعوة', 'داعية', 'إرشاد'] },
			{ name: 'الخطب والمواعظ', keywords: ['خطب', 'خطبة', 'موعظة', 'مواعظ'] }
		]
	}
]);

function inferTopicProfile(bookMeta) {
	const hay = buildBookHaystack(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const profile of TOPIC_PROFILES) {
		const names = [
			profile.mainName,
			...(profile.mainAliases || []),
			profile.subName,
			...(profile.subAliases || [])
		];
		const keywords = [...(profile.keywords || []), ...names];
		let score = 0;
		score += keywordScoreInText(hay.title, new Set(tokensOf(hay.title)), keywords, 6) * 2;
		score += keywordScoreInText(hay.hints, new Set(tokensOf(hay.hints)), keywords, 5) * 2;
		score += keywordScoreInText(hay.description, new Set(tokensOf(hay.description)), keywords, 3);
		score += keywordScoreInText(hay.author, new Set(tokensOf(hay.author)), keywords, 2) * 0.5;
		for (const rule of profile.secondaryRules || []) {
			score += keywordScoreInText(hay.title, new Set(tokensOf(hay.title)), rule.keywords || [], 5);
			score += keywordScoreInText(hay.hints, new Set(tokensOf(hay.hints)), rule.keywords || [], 4);
		}
		if (score > bestScore) {
			bestScore = score;
			best = profile;
		}
	}
	if (!best || bestScore < PROFILE_MIN_SCORE) return null;
	return {
		profile: best,
		score: bestScore,
		confidence: Math.min(0.55 + bestScore * 0.025, 0.93)
	};
}

function chooseSecondaryName(profile, bookMeta) {
	const hay = buildBookHaystack(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of profile.secondaryRules || []) {
		const keywords = uniqueList([rule.name, ...(rule.keywords || [])]);
		let score = 0;
		score += keywordScoreInText(hay.title, new Set(tokensOf(hay.title)), keywords, 6) * 2;
		score += keywordScoreInText(hay.hints, new Set(tokensOf(hay.hints)), keywords, 5) * 2;
		score += keywordScoreInText(hay.description, new Set(tokensOf(hay.description)), keywords, 3);
		if (score > bestScore) {
			bestScore = score;
			best = rule.name;
		}
	}
	return best || profile.secondaryName || GENERIC_SECONDARY;
}

function pickBestMainForProfile(tree, profile) {
	const preferred = [profile.mainName, ...(profile.mainAliases || [])];
	const keywords = [profile.subName, ...(profile.subAliases || []), ...(profile.keywords || [])];
	let best = null;
	let bestScore = 0;
	for (const main of tree || []) {
		const score = scoreNameAgainst(main.name, preferred, keywords);
		if (score > bestScore) {
			bestScore = score;
			best = main;
		}
	}
	return best ? { node: best, score: bestScore } : null;
}

function pickBestSubForProfile(mainNode, profile) {
	const preferred = [profile.subName, ...(profile.subAliases || [])];
	const keywords = [...(profile.keywords || []), ...(profile.mainAliases || [])];
	let best = null;
	let bestScore = 0;
	for (const sub of mainNode?.children || []) {
		const score = scoreNameAgainst(sub.name, preferred, keywords);
		if (score > bestScore) {
			bestScore = score;
			best = sub;
		}
	}
	return best ? { node: best, score: bestScore } : null;
}

function pickBestSecondaryForProfile(subNode, profile, proposedName) {
	const preferred = [
		proposedName,
		profile.secondaryName,
		...(profile.secondaryRules || []).map((r) => r.name)
	];
	const keywords = uniqueList([
		...(profile.keywords || []),
		...(profile.secondaryRules || []).flatMap((r) => r.keywords || [])
	]);
	let best = null;
	let bestScore = 0;
	for (const sec of subNode?.children || []) {
		const score = scoreNameAgainst(sec.name, preferred, keywords);
		if (score > bestScore) {
			bestScore = score;
			best = sec;
		}
	}
	return best ? { node: best, score: bestScore } : null;
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

	let best = null;
	for (const m of tree) {
		const mainScore = scoreOf(m.name);
		for (const sub of m.children || []) {
			const subScore = scoreOf(sub.name);
			const secondaries = sub.children?.length ? sub.children : [null];
			for (const sec of secondaries) {
				const secScore = sec ? scoreOf(sec.name) : 0;
				const total = mainScore * 2 + subScore * 3 + secScore * 2;
				if (!best || total > best.total) {
					best = { main: m, sub, sec, mainScore, subScore, secScore, total };
				}
			}
		}
	}
	if (!best || best.total <= 0) return null;

	return {
		mainId: best.main.id,
		subId: best.sub.id,
		secondaryId: best.sec ? best.sec.id : null,
		confidence: Math.min(0.45 + best.total * 0.04, 0.82),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic',
		_scores: {
			main: best.mainScore,
			sub: best.subScore,
			secondary: best.secScore,
			total: best.total
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

function sectionNameFromBookTitle(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '')
		.replace(/^(?:كتاب|تحميل كتاب|شرح|مختصر)\s+/u, '')
		.trim();
	if (stem.length >= 6) return stem.slice(0, 80);
	return GENERIC_SECONDARY;
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

	const topic = inferTopicProfile(bookMeta);
	if (topic) {
		const { profile } = topic;
		const secondaryName = chooseSecondaryName(profile, bookMeta);
		const bestMain = pickBestMainForProfile(sections.tree, profile);

		if (!bestMain || bestMain.score < MAIN_MATCH_MIN_SCORE) {
			return {
				kind: 'create_main',
				newMainName: profile.mainName,
				newSubName: profile.subName,
				newSecondaryName: secondaryName,
				confidence: topic.confidence,
				reasoning: `تصنيف موضوعي: ${profile.mainName} / ${profile.subName} / ${secondaryName}`,
				method: 'taxonomy'
			};
		}

		const bestSub = pickBestSubForProfile(bestMain.node, profile);
		if (!bestSub || bestSub.score < SUB_MATCH_MIN_SCORE) {
			return {
				kind: 'create_sub',
				mainId: String(bestMain.node.id),
				newSubName: profile.subName,
				newSecondaryName: secondaryName,
				confidence: topic.confidence,
				reasoning: `القسم الرئيسي مناسب، ولا يوجد فرع مطابق؛ إنشاء ${profile.subName} / ${secondaryName}`,
				method: 'taxonomy'
			};
		}

		const bestSecondary = pickBestSecondaryForProfile(bestSub.node, profile, secondaryName);
		if (bestSecondary && bestSecondary.score >= SECONDARY_MATCH_MIN_SCORE) {
			return {
				kind: 'existing',
				mainId: String(bestMain.node.id),
				subId: String(bestSub.node.id),
				secondaryId: String(bestSecondary.node.id),
				confidence: topic.confidence,
				reasoning: `مسار ثلاثي موجود مناسب: ${bestMain.node.name} / ${bestSub.node.name} / ${bestSecondary.node.name}`,
				method: 'taxonomy'
			};
		}

		const reusable = pickReuseSecondary(sections, String(bestSub.node.id), bookMeta, {
			proposedNewName: secondaryName,
			minScore: 10
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(bestMain.node.id),
				subId: String(bestSub.node.id),
				secondaryId: reusable.id,
				confidence: topic.confidence,
				reasoning: `أُعيد استخدام قسم ثانوي قريب: ${reusable.name}`,
				method: 'taxonomy'
			};
		}

		return {
			kind: 'create_secondary',
			mainId: String(bestMain.node.id),
			subId: String(bestSub.node.id),
			newSecondaryName: secondaryName,
			confidence: topic.confidence,
			reasoning: `القسم الرئيسي والفرعي مناسبان، ولا يوجد قسم ثانوي مطابق؛ إنشاء ${secondaryName}`,
			method: 'taxonomy'
		};
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			newMainName: GENERIC_MAIN,
			newSubName: GENERIC_SUB,
			newSecondaryName: sectionNameFromBookTitle(bookMeta),
			confidence: 0.25,
			reasoning: 'لم تُعرَف مادة الكتاب بدقّة؛ إنشاء مسار عام ثلاثي بدلاً من خلطه مع قسم غير مناسب.',
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
			newSecondaryName: sectionNameFromBookTitle(bookMeta),
			confidence: Math.min(sug.confidence, 0.65),
			reasoning: 'وجدنا main/sub مناسبين بالـ heuristic، وأنشأنا مستوى ثانوي لإبقاء المحتوى تحت هيكل ثلاثي كامل.',
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
