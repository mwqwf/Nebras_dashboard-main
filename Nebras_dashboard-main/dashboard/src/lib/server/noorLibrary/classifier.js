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

const MATCH = Object.freeze({
	main: 4,
	sub: 4,
	secondary: 6
});

const DISCIPLINES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		mainAliases: ['قرآن', 'القرآن', 'علوم القرآن', 'تفسير'],
		subAliases: ['تفسير', 'علوم القرآن', 'تجويد', 'قراءات', 'مصاحف'],
		keywords: ['قرآن', 'القران', 'تفسير', 'مفسر', 'علوم القرآن', 'تجويد', 'قراءات', 'سورة'],
		topics: [
			{ name: 'التفسير', keywords: ['تفسير', 'المفسر'] },
			{ name: 'علوم القرآن', keywords: ['علوم القرآن', 'اسباب النزول', 'المكي والمدني'] },
			{ name: 'التجويد والقراءات', keywords: ['تجويد', 'قراءات', 'رواية حفص'] }
		]
	},
	{
		key: 'hadith',
		mainName: 'السنة النبوية وعلومها',
		subName: 'الحديث الشريف وعلومه',
		mainAliases: ['حديث', 'السنة', 'السنه', 'علوم الحديث'],
		subAliases: ['حديث', 'مصطلح الحديث', 'شروح الحديث', 'رجال الحديث'],
		keywords: ['حديث', 'الأحاديث', 'الاحاديث', 'السنة', 'السنه', 'صحيح البخاري', 'صحيح مسلم', 'سنن', 'مسند', 'مصطلح الحديث', 'جرح وتعديل'],
		topics: [
			{ name: 'شروح الحديث', keywords: ['شرح الحديث', 'شروح الحديث', 'فتح الباري', 'صحيح البخاري', 'صحيح مسلم'] },
			{ name: 'مصطلح الحديث', keywords: ['مصطلح الحديث', 'علوم الحديث', 'العلل', 'التخريج'] },
			{ name: 'الرجال والجرح والتعديل', keywords: ['رجال الحديث', 'جرح وتعديل', 'تراجم الرواة'] }
		]
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		mainAliases: ['فقه', 'الفقه', 'أصول الفقه', 'اصول الفقه', 'فتاوى'],
		subAliases: ['عبادات', 'معاملات', 'أصول الفقه', 'اصول الفقه', 'فتاوى'],
		keywords: ['فقه', 'الفقه', 'أصول الفقه', 'اصول الفقه', 'فتوى', 'فتاوى', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'نكاح', 'طلاق', 'بيوع', 'معاملات', 'مواريث', 'فرائض'],
		topics: [
			{ name: 'الطهارة والصلاة', keywords: ['طهارة', 'وضوء', 'غسل', 'صلاة', 'المساجد'] },
			{ name: 'الزكاة والصيام والحج', keywords: ['زكاة', 'صيام', 'رمضان', 'حج', 'عمرة', 'مناسك'] },
			{ name: 'المعاملات المالية', keywords: ['بيع', 'بيوع', 'ربا', 'معاملات', 'إجارة', 'اجارة'] },
			{ name: 'فقه الأسرة', keywords: ['نكاح', 'زواج', 'طلاق', 'أسرة', 'اسرة', 'حضانة'] },
			{ name: 'أصول الفقه والقواعد', keywords: ['أصول الفقه', 'اصول الفقه', 'قواعد فقهية', 'الاجتهاد'] },
			{ name: 'الفرائض والمواريث', keywords: ['فرائض', 'مواريث', 'ميراث', 'التركات'] }
		]
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		mainAliases: ['عقيدة', 'العقيدة', 'توحيد', 'أصول الدين', 'اصول الدين'],
		subAliases: ['توحيد', 'أصول الدين', 'اصول الدين', 'الإيمان', 'الايمان'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'أصول الدين', 'اصول الدين', 'إيمان', 'ايمان', 'أسماء وصفات', 'اسماء وصفات', 'القدر', 'الإرجاء', 'ارجاء', 'الفرق', 'الملل والنحل'],
		topics: [
			{ name: 'التوحيد', keywords: ['توحيد', 'لا إله إلا الله', 'لا اله الا الله'] },
			{ name: 'الإيمان وأصول الدين', keywords: ['إيمان', 'ايمان', 'أصول الدين', 'اصول الدين', 'قدر'] },
			{ name: 'الأسماء والصفات', keywords: ['أسماء وصفات', 'اسماء وصفات', 'صفات الله'] },
			{ name: 'الفرق والأديان', keywords: ['فرق', 'أديان', 'اديان', 'الملل والنحل'] }
		]
	},
	{
		key: 'seerah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة والتاريخ',
		mainAliases: ['سيرة', 'السيرة', 'تاريخ', 'التاريخ الإسلامي', 'تراجم'],
		subAliases: ['سيرة نبوية', 'تاريخ إسلامي', 'تراجم', 'طبقات'],
		keywords: ['سيرة', 'السيرة', 'المغازي', 'شمائل', 'تاريخ', 'التاريخ', 'خلافة', 'فتوحات', 'تراجم', 'طبقات', 'صحابة', 'الصحابة'],
		topics: [
			{ name: 'السيرة النبوية', keywords: ['سيرة', 'السيرة النبوية', 'المغازي', 'شمائل'] },
			{ name: 'التاريخ الإسلامي', keywords: ['تاريخ', 'الخلافة', 'فتوحات', 'دولة'] },
			{ name: 'التراجم والطبقات', keywords: ['تراجم', 'طبقات', 'أعلام', 'اعلام', 'صحابة'] }
		]
	},
	{
		key: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب الشرعية',
		mainAliases: ['تزكية', 'أخلاق', 'اخلاق', 'رقائق', 'آداب شرعية', 'اداب شرعية'],
		subAliases: ['أخلاق', 'اخلاق', 'رقائق', 'زهد', 'آداب شرعية', 'اداب شرعية'],
		keywords: ['تزكية', 'أخلاق', 'اخلاق', 'رقائق', 'زهد', 'ورع', 'آداب شرعية', 'اداب شرعية', 'تربية إيمانية', 'تربية ايمانية'],
		topics: [
			{ name: 'الأخلاق والآداب', keywords: ['أخلاق', 'اخلاق', 'آداب', 'اداب'] },
			{ name: 'الرقائق والزهد', keywords: ['رقائق', 'زهد', 'ورع', 'موعظة'] },
			{ name: 'تزكية النفس', keywords: ['تزكية', 'تزكية النفس', 'القلب', 'القلوب'] }
		]
	},
	{
		key: 'arabic',
		mainName: 'اللغة العربية وآدابها',
		subName: 'علوم اللغة العربية',
		mainAliases: ['لغة عربية', 'اللغة العربية', 'نحو', 'صرف', 'بلاغة', 'الأدب العربي'],
		subAliases: ['نحو', 'صرف', 'بلاغة', 'معاجم', 'الأدب العربي'],
		keywords: ['لغة عربية', 'اللغة العربية', 'نحو', 'صرف', 'بلاغة', 'معجم', 'معاجم', 'شعر', 'الأدب العربي', 'ادب عربي', 'ديوان'],
		topics: [
			{ name: 'النحو والصرف', keywords: ['نحو', 'صرف', 'إعراب', 'اعراب'] },
			{ name: 'البلاغة والأدب', keywords: ['بلاغة', 'الأدب العربي', 'ادب عربي', 'شعر', 'ديوان'] },
			{ name: 'المعاجم واللغة', keywords: ['معجم', 'معاجم', 'لغة عربية'] }
		]
	},
	{
		key: 'education',
		mainName: 'الدعوة والتعليم الشرعي',
		subName: 'طلب العلم والتعليم',
		mainAliases: ['دعوة', 'تعليم', 'طلب العلم', 'دروس', 'منهجية'],
		subAliases: ['طلب العلم', 'تعليم شرعي', 'آداب طالب العلم', 'اداب طالب العلم', 'مناهج'],
		keywords: ['طلب العلم', 'طالب العلم', 'تعليم', 'التعليم', 'تعلم', 'تعلّم', 'منهجية', 'منهجية الطلب', 'آداب طالب العلم', 'اداب طالب العلم', 'المعلم', 'المتعلم', 'دعوة', 'دروس علمية'],
		topics: [
			{ name: 'آداب طالب العلم', keywords: ['آداب طالب العلم', 'اداب طالب العلم', 'طالب العلم', 'طلب العلم'] },
			{ name: 'مناهج التعليم الشرعي', keywords: ['منهجية', 'مناهج', 'تعليم شرعي', 'دروس علمية'] },
			{ name: 'الدعوة والإرشاد', keywords: ['دعوة', 'إرشاد', 'ارشاد', 'خطب'] }
		]
	},
	{
		key: 'general',
		mainName: 'المكتبة الإسلامية',
		subName: 'كتب إسلامية عامة',
		mainAliases: ['مكتبة', 'كتب إسلامية', 'اسلامية'],
		subAliases: ['عام', 'متنوع', 'كتب إسلامية'],
		keywords: ['إسلام', 'اسلام', 'شرعي', 'ديني'],
		topics: [{ name: 'كتب متفرقة', keywords: ['متفرقات', 'عام'] }]
	}
]);

function tokensOf(s) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= 3));
}

function keywordScore(haystack, keywords = []) {
	let score = 0;
	for (const kw of keywords) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (haystack.includes(n)) score += n.includes(' ') ? 4 : 2;
	}
	return score;
}

function buildHaystack(bookMeta) {
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

function detectDiscipline(bookMeta) {
	const haystack = buildHaystack(bookMeta);
	let best = DISCIPLINES[DISCIPLINES.length - 1];
	let bestScore = 0;
	for (const d of DISCIPLINES) {
		const score =
			keywordScore(haystack, d.keywords) +
			keywordScore(haystack, d.mainAliases) +
			keywordScore(haystack, d.subAliases);
		if (score > bestScore) {
			best = d;
			bestScore = score;
		}
	}
	return { discipline: best, score: bestScore, haystack };
}

function sectionNameScore(name, haystack, tokens, aliases = []) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	for (const alias of aliases) {
		const a = normalizeArabic(alias);
		if (!a || a.length < 3) continue;
		if (n.includes(a) || a.includes(n)) score += a.includes(' ') ? 5 : 3;
	}
	return score;
}

function cleanDisplayName(name) {
	return String(name || '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^[\s\-–—:؛،.]+|[\s\-–—:؛،.]+$/g, '')
		.slice(0, 80);
}

function displayStemFromTitle(title) {
	let t = cleanDisplayName(title)
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/\s*-\s*مكتبة نور.*$/u, '');
	if (!t) return '';
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '');
	return cleanDisplayName(t);
}

function pickTopicName(bookMeta, discipline, fallbackSubName = '') {
	const haystack = buildHaystack(bookMeta);
	for (const topic of discipline.topics || []) {
		if (keywordScore(haystack, topic.keywords) > 0) return topic.name;
	}
	const stem = displayStemFromTitle(bookMeta?.title || '');
	const normalizedStem = normalizeArabic(stem);
	const normalizedSub = normalizeArabic(fallbackSubName || discipline.subName);
	if (
		stem &&
		normalizedStem.length >= 8 &&
		normalizedStem !== normalizedSub &&
		!['كتاب', 'كتب', 'اسلام', 'اسلاميه'].includes(normalizedStem)
	) {
		return stem;
	}
	const base = cleanDisplayName(fallbackSubName || discipline.subName || 'القسم');
	return base.startsWith('كتب ') ? base : `كتب متفرقة في ${base}`;
}

function findBestNode(nodes, haystack, tokens, aliases, minScore) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = sectionNameScore(node?.name, haystack, tokens, aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	if (!best || bestScore < minScore) return { node: null, score: bestScore };
	return { node: best, score: bestScore };
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

	const { discipline, score: disciplineScore, haystack } = detectDiscipline(bookMeta);
	const tokens = tokensOf(haystack);
	const mainMatch = findBestNode(
		sections.tree,
		haystack,
		tokens,
		[discipline.mainName, ...discipline.mainAliases],
		disciplineScore > 0 ? MATCH.main : MATCH.main + 2
	);

	if (!mainMatch.node) {
		const newSubName = discipline.subName;
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: discipline.mainName,
			newSubName,
			newSecondaryName: pickTopicName(bookMeta, discipline, newSubName),
			confidence: disciplineScore > 0 ? 0.45 : 0.3,
			reasoning:
				disciplineScore > 0
					? `لم يُعثَر على قسم رئيسي مناسب لمجال "${discipline.mainName}" — إنشاء مسار جديد.`
					: 'لم تُعثَر مطابقة علمية كافية — إنشاء مسار عام آمن بدل الخلط مع قسم غير مناسب.',
			method: 'heuristic'
		};
	}

	const subMatch = findBestNode(
		mainMatch.node.children || [],
		haystack,
		tokens,
		[discipline.subName, ...discipline.subAliases],
		MATCH.sub
	);

	if (!subMatch.node) {
		return {
			kind: 'create_sub',
			mainId: String(mainMatch.node.id),
			subId: null,
			secondaryId: null,
			newSubName: discipline.subName,
			newSecondaryName: pickTopicName(bookMeta, discipline, discipline.subName),
			confidence: Math.min(0.55 + mainMatch.score * 0.04, 0.78),
			reasoning: `وُجد القسم الرئيسي "${mainMatch.node.name}" دون فرع مناسب لمجال "${discipline.subName}" — إنشاء فرع جديد.`,
			method: 'heuristic'
		};
	}

	const proposedSecondaryName = pickTopicName(bookMeta, discipline, subMatch.node.name);
	const reuseSecondary = pickReuseSecondary(sections, String(subMatch.node.id), bookMeta, {
		proposedNewName: proposedSecondaryName,
		minScore: MATCH.secondary
	});
	if (reuseSecondary) {
		return {
			kind: 'existing',
			mainId: String(mainMatch.node.id),
			subId: String(subMatch.node.id),
			secondaryId: reuseSecondary.id,
			confidence: Math.min(0.6 + mainMatch.score * 0.03 + subMatch.score * 0.03, 0.9),
			reasoning: `مطابقة علمية: ${mainMatch.node.name} ← ${subMatch.node.name} ← ${reuseSecondary.name}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(mainMatch.node.id),
		subId: String(subMatch.node.id),
		secondaryId: null,
		newSecondaryName: proposedSecondaryName,
		confidence: Math.min(0.5 + mainMatch.score * 0.03 + subMatch.score * 0.03, 0.82),
		reasoning: `وُجد مسار رئيسي/فرعي مناسب (${mainMatch.node.name} ← ${subMatch.node.name}) دون قسم ثانوي مناسب — إنشاء "${proposedSecondaryName}".`,
		method: 'heuristic'
	};
}
