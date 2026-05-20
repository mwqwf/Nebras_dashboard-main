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

const SCIENCE_RULES = Object.freeze([
	{
		id: 'talab_alilm_adab',
		mainName: 'التزكية والآداب',
		subName: 'آداب طلب العلم',
		secondaryName: 'نصائح وتوجيهات علمية',
		mainAliases: ['التزكية والآداب', 'التزكية والأخلاق', 'الأخلاق والآداب', 'الآداب'],
		subAliases: ['آداب طلب العلم', 'طلب العلم', 'آداب العلم', 'التعليم والتربية العلمية'],
		secondaryAliases: ['نصائح وتوجيهات علمية', 'وصايا طالب العلم', 'آداب طالب العلم'],
		keywords: [
			'طلب العلم',
			'طالب العلم',
			'آداب العلم',
			'اداب العلم',
			'نصائح',
			'وصايا',
			'توجيهات',
			'التعليمات العلمية',
			'تعليم',
			'المتعلم',
			'المعلم',
			'العلماء'
		],
		strong: ['طلب العلم', 'طالب العلم', 'آداب العلم', 'التعليمات العلمية']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل الفقه وأحكامه',
		mainAliases: ['الفقه وأصوله', 'الفقه الإسلامي', 'فقه', 'أصول الفقه'],
		subAliases: ['الفقه الإسلامي', 'أصول الفقه', 'العبادات', 'المعاملات', 'فقه العبادات'],
		secondaryAliases: ['مسائل الفقه وأحكامه', 'فتاوى وأحكام', 'فقه العبادات', 'فقه المعاملات'],
		keywords: [
			'فقه',
			'اصول الفقه',
			'أصول الفقه',
			'احكام',
			'أحكام',
			'فتاوى',
			'طهارة',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'نكاح',
			'طلاق',
			'بيوع',
			'مواريث',
			'فرائض',
			'حلال',
			'حرام'
		],
		strong: ['فقه', 'أصول الفقه', 'اصول الفقه', 'فتاوى']
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'التوحيد والإيمان',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان', 'الأسماء والصفات'],
		secondaryAliases: ['التوحيد والإيمان', 'الأسماء والصفات', 'أصول الاعتقاد'],
		keywords: [
			'عقيدة',
			'العقيده',
			'توحيد',
			'ايمان',
			'إيمان',
			'اسماء وصفات',
			'أسماء وصفات',
			'اهل السنة',
			'أهل السنة',
			'شرك',
			'كفر',
			'بدعة',
			'القدر',
			'النبوات',
			'اليوم الاخر'
		],
		strong: ['عقيدة', 'العقيده', 'توحيد', 'أسماء وصفات', 'اسماء وصفات']
	},
	{
		id: 'history_sirah',
		mainName: 'السيرة والتاريخ',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'السير والتراجم',
		mainAliases: ['السيرة والتاريخ', 'التاريخ الإسلامي', 'السيرة النبوية', 'التراجم والطبقات'],
		subAliases: ['التاريخ الإسلامي', 'السيرة النبوية', 'التراجم', 'الطبقات'],
		secondaryAliases: ['السير والتراجم', 'الطبقات', 'أعلام المسلمين', 'التاريخ'],
		keywords: [
			'تاريخ',
			'سيرة',
			'السيرة',
			'غزوات',
			'مغازي',
			'تراجم',
			'طبقات',
			'اعلام',
			'أعلام',
			'خلفاء',
			'دولة',
			'فتوح',
			'بلدان'
		],
		strong: ['تاريخ', 'سيرة', 'تراجم', 'طبقات']
	},
	{
		id: 'quran',
		mainName: 'القرآن وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن', 'القرآن الكريم', 'التفسير'],
		subAliases: ['التفسير وعلوم القرآن', 'التفسير', 'علوم القرآن', 'القراءات'],
		secondaryAliases: ['التفسير', 'علوم القرآن', 'القراءات والتجويد'],
		keywords: [
			'قرآن',
			'القران',
			'القرآن',
			'تفسير',
			'مفسر',
			'علوم القرآن',
			'علوم القران',
			'قراءات',
			'تجويد',
			'مصاحف',
			'سورة',
			'آية',
			'اية'
		],
		strong: ['قرآن', 'القرآن', 'القران', 'تفسير']
	},
	{
		id: 'hadith',
		mainName: 'الحديث وعلومه',
		subName: 'كتب الحديث',
		secondaryName: 'شروح الحديث وعلومه',
		mainAliases: ['الحديث وعلومه', 'الحديث الشريف', 'علوم الحديث'],
		subAliases: ['كتب الحديث', 'علوم الحديث', 'شروح الحديث', 'مصطلح الحديث'],
		secondaryAliases: ['شروح الحديث وعلومه', 'مصطلح الحديث', 'السنة النبوية'],
		keywords: [
			'حديث',
			'أحاديث',
			'احاديث',
			'سنة',
			'السنة',
			'صحيح البخاري',
			'صحيح مسلم',
			'سنن',
			'مسند',
			'مصطلح الحديث',
			'جرح وتعديل',
			'رواة'
		],
		strong: ['حديث', 'أحاديث', 'احاديث', 'مصطلح الحديث']
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو والصرف والبلاغة',
		mainAliases: ['اللغة العربية', 'العربية', 'علوم اللغة'],
		subAliases: ['علوم اللغة العربية', 'النحو', 'الصرف', 'البلاغة', 'الأدب العربي'],
		secondaryAliases: ['النحو والصرف والبلاغة', 'النحو', 'الصرف', 'البلاغة'],
		keywords: [
			'لغة عربية',
			'العربية',
			'نحو',
			'صرف',
			'بلاغة',
			'إعراب',
			'اعراب',
			'معجم',
			'قاموس',
			'أدب عربي',
			'ادب عربي'
		],
		strong: ['لغة عربية', 'نحو', 'صرف', 'بلاغة']
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'وسائل الدعوة والإصلاح',
		mainAliases: ['الدعوة والثقافة الإسلامية', 'الدعوة', 'الثقافة الإسلامية'],
		subAliases: ['الدعوة والإرشاد', 'الأمر بالمعروف', 'الإصلاح'],
		secondaryAliases: ['وسائل الدعوة والإصلاح', 'الدعوة إلى الله', 'الإرشاد'],
		keywords: [
			'دعوة',
			'الدعوة',
			'داعية',
			'إرشاد',
			'ارشاد',
			'أمر بالمعروف',
			'امر بالمعروف',
			'إصلاح',
			'اصلاح',
			'خطابة',
			'مواعظ'
		],
		strong: ['دعوة', 'الدعوة', 'إرشاد', 'ارشاد']
	}
]);

const FALLBACK_RULE = Object.freeze({
	id: 'general_islamic',
	mainName: 'متفرقات إسلامية',
	subName: 'كتب عامة',
	secondaryName: 'موضوعات عامة',
	mainAliases: ['متفرقات إسلامية', 'كتب إسلامية عامة', 'الإسلاميات'],
	subAliases: ['كتب عامة', 'موضوعات عامة', 'متفرقات'],
	secondaryAliases: ['موضوعات عامة', 'كتب عامة'],
	keywords: [],
	strong: []
});

function topicText(bookMeta, fields = ['title', 'author', 'description', 'categoryHints']) {
	const parts = [];
	if (fields.includes('title')) parts.push(bookMeta?.title);
	if (fields.includes('author')) parts.push(bookMeta?.author);
	if (fields.includes('description')) parts.push(bookMeta?.description);
	if (fields.includes('categoryHints')) parts.push(...(bookMeta?.categoryHints || []));
	return normalizeArabic(parts.filter(Boolean).join(' '));
}

function normalizedWords(s) {
	return normalizeArabic(s).split(' ').filter((w) => w.length >= 3);
}

function phraseScore(text, phrase) {
	const p = normalizeArabic(phrase);
	if (!p) return 0;
	if (text.includes(p)) return p.includes(' ') ? 5 : 3;
	const pWords = normalizedWords(p);
	if (!pWords.length) return 0;
	let matches = 0;
	for (const w of pWords) {
		if (text.includes(w)) matches += 1;
	}
	return matches >= Math.ceil(pWords.length * 0.7) ? matches : 0;
}

function scoreRule(rule, bookMeta) {
	const titleText = topicText(bookMeta, ['title']);
	const hintText = topicText(bookMeta, ['categoryHints']);
	const allText = topicText(bookMeta);
	let score = 0;
	for (const kw of rule.keywords || []) {
		score += phraseScore(allText, kw);
		score += phraseScore(titleText, kw) * 1.6;
		score += phraseScore(hintText, kw) * 1.8;
	}
	for (const kw of rule.strong || []) {
		score += phraseScore(allText, kw) * 2;
	}
	return score;
}

function pickScienceRule(bookMeta) {
	const ranked = SCIENCE_RULES
		.map((rule) => ({ rule, score: scoreRule(rule, bookMeta) }))
		.sort((a, b) => b.score - a.score);
	const best = ranked[0];
	if (!best || best.score < 5) return { rule: FALLBACK_RULE, score: 0, fallback: true };

	const byId = Object.fromEntries(ranked.map((x) => [x.rule.id, x.score]));
	// قواعد فصل واضحة: لا نُدخل التاريخ في العقيدة ولا الآداب في الفقه إلا بقرائن قوية.
	if (
		best.rule.id === 'aqidah' &&
		(byId.history_sirah || 0) >= best.score - 3 &&
		scoreRule(SCIENCE_RULES.find((r) => r.id === 'history_sirah'), bookMeta) >= 6
	) {
		return {
			rule: SCIENCE_RULES.find((r) => r.id === 'history_sirah'),
			score: byId.history_sirah,
			fallback: false
		};
	}
	if (
		best.rule.id === 'talab_alilm_adab' &&
		(byId.fiqh || 0) >= best.score + 4
	) {
		return {
			rule: SCIENCE_RULES.find((r) => r.id === 'fiqh'),
			score: byId.fiqh,
			fallback: false
		};
	}
	return { rule: best.rule, score: best.score, fallback: false };
}

function scoreNameAgainstAliases(name, aliases = []) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const alias of aliases) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) score = Math.max(score, 20);
		else if (n.includes(a) || a.includes(n)) score = Math.max(score, 14);
		else {
			const aWords = new Set(normalizedWords(a));
			const nWords = new Set(normalizedWords(n));
			let overlap = 0;
			for (const w of aWords) if (nWords.has(w)) overlap += 1;
			if (overlap > 0) score = Math.max(score, overlap * 4);
		}
	}
	return score;
}

function findBestMain(sections, rule) {
	let best = null;
	let bestScore = 0;
	const aliases = [rule.mainName, ...(rule.mainAliases || [])];
	for (const main of sections.tree || []) {
		const score = scoreNameAgainstAliases(main.name, aliases);
		if (score > bestScore) {
			best = main;
			bestScore = score;
		}
	}
	return best && bestScore >= 8 ? { node: best, score: bestScore } : null;
}

function findBestSub(mainNode, rule) {
	let best = null;
	let bestScore = 0;
	const aliases = [rule.subName, ...(rule.subAliases || []), ...(rule.mainAliases || [])];
	for (const sub of mainNode?.children || []) {
		const score = scoreNameAgainstAliases(sub.name, aliases);
		if (score > bestScore) {
			best = sub;
			bestScore = score;
		}
	}
	return best && bestScore >= 8 ? { node: best, score: bestScore } : null;
}

function findBestSecondary(subNode, rule, bookMeta) {
	let best = null;
	let bestScore = 0;
	const aliases = [rule.secondaryName, ...(rule.secondaryAliases || []), ...(rule.subAliases || [])];
	for (const sec of subNode?.children || []) {
		const aliasScore = scoreNameAgainstAliases(sec.name, aliases);
		const reuseScore = scoreSecondaryForReuse(sec, bookMeta, rule.secondaryName);
		const score = Math.max(aliasScore, reuseScore);
		if (score > bestScore) {
			best = sec;
			bestScore = score;
		}
	}
	return best && bestScore >= 6 ? { node: best, score: bestScore } : null;
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
		const picked = pickScienceRule(bookMeta);
		const rule = picked.rule;
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: picked.fallback ? 0.25 : Math.min(0.55 + picked.score * 0.02, 0.9),
			reasoning: picked.fallback
				? 'لم توجد شجرة أقسام، فاختير مسار إسلامي عام آمن.'
				: `قاعدة موضوعية: ${rule.mainName} > ${rule.subName} > ${rule.secondaryName}`,
			method: 'topic-rules'
		};
	}

	const picked = pickScienceRule(bookMeta);
	const rule = picked.rule;
	const mainMatch = findBestMain(sections, rule);
	if (!mainMatch) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: picked.fallback ? 0.25 : Math.min(0.55 + picked.score * 0.02, 0.9),
			reasoning: picked.fallback
				? 'لم توجد مطابقة علمية كافية؛ إنشاء مسار عام منفصل لتجنب خلط العلوم.'
				: `لا يوجد قسم رئيسي مناسب لقاعدة "${rule.mainName}"؛ إنشاء مسار جديد كامل.`,
			method: 'topic-rules'
		};
	}

	const subMatch = findBestSub(mainMatch.node, rule);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(mainMatch.node.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: picked.fallback ? 0.3 : Math.min(0.58 + picked.score * 0.02, 0.9),
			reasoning: `القسم الرئيسي مناسب (${mainMatch.node.name}) لكن لا يوجد فرع دقيق؛ إنشاء ${rule.subName} ثم ${rule.secondaryName}.`,
			method: 'topic-rules'
		};
	}

	const secondaryMatch = findBestSecondary(subMatch.node, rule, bookMeta);
	if (!secondaryMatch) {
		return {
			kind: 'create_secondary',
			mainId: String(mainMatch.node.id),
			subId: String(subMatch.node.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence: picked.fallback ? 0.35 : Math.min(0.62 + picked.score * 0.02, 0.92),
			reasoning: `المسار الرئيسي والفرعي مناسبان؛ إنشاء قسم ثانوي دقيق: ${rule.secondaryName}.`,
			method: 'topic-rules'
		};
	}

	const validation = validateHierarchyPath(
		{
			mainId: mainMatch.node.id,
			subId: subMatch.node.id,
			secondaryId: secondaryMatch.node.id
		},
		sections.index
	);
	if (!validation.valid) {
		const sug = classifyHeuristic(sections, bookMeta);
		if (sug?.secondaryId) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: String(sug.secondaryId),
				confidence: sug.confidence,
				reasoning: `${sug.reasoning} بعد فشل تحقق القاعدة الموضوعية: ${validation.reason}`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(mainMatch.node.id),
			subId: String(subMatch.node.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence: 0.45,
			reasoning: `تعذّر اعتماد القسم الثانوي الحالي (${validation.reason})؛ إنشاء قسم ثانوي آمن.`,
			method: 'topic-rules'
		};
	}

	return {
		kind: 'existing',
		mainId: String(mainMatch.node.id),
		subId: String(subMatch.node.id),
		secondaryId: String(secondaryMatch.node.id),
		confidence: picked.fallback ? 0.5 : Math.min(0.7 + picked.score * 0.015, 0.95),
		reasoning: `مطابقة موضوعية محافظة: ${rule.mainName} > ${rule.subName} > ${secondaryMatch.node.name}`,
		method: 'topic-rules'
	};
}
