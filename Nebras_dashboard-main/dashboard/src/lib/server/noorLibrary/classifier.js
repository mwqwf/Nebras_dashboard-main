/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 *
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic عربي محلي يراعي حدود العلوم الشرعية حتى لا تختلط كتب الآداب
 * بالفقه أو التاريخ بالعقيدة عند ضعف المطابقة النصية.
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

const GENERIC_HINTS = new Set(
	[
		'كتب',
		'كتاب',
		'كتب اسلاميه',
		'اسلاميه',
		'الدين الاسلامي',
		'علوم اسلاميه',
		'مكتبه',
		'عام',
		'متنوعه'
	].map(normalizeArabic)
);

const DISCIPLINES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryFallback: 'علوم القرآن',
		keywords: [
			'قرآن',
			'القرآن',
			'تفسير',
			'مفسر',
			'التجويد',
			'القراءات',
			'أسباب النزول',
			'علوم القرآن',
			'المصحف'
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		secondaryFallback: 'علوم الحديث',
		keywords: [
			'حديث',
			'الأحاديث',
			'السنة',
			'سنن',
			'صحيح',
			'مسند',
			'مصطلح الحديث',
			'جرح وتعديل',
			'الرواة'
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryFallback: 'مسائل فقهية',
		keywords: [
			'فقه',
			'فقهي',
			'أصول الفقه',
			'اصول الفقه',
			'فتاوى',
			'طهارة',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'معاملات',
			'مواريث',
			'نكاح',
			'طلاق'
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryFallback: 'التوحيد والعقيدة',
		keywords: [
			'عقيدة',
			'العقيدة',
			'توحيد',
			'الإيمان',
			'ايمان',
			'أسماء الله',
			'اسماء الله',
			'صفات',
			'الشرك',
			'البدع',
			'الفرق',
			'الرد على'
		]
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryFallback: 'السيرة النبوية',
		keywords: [
			'سيرة',
			'السيرة',
			'شمائل',
			'المغازي',
			'غزوة',
			'الهجرة',
			'النبي',
			'الرسول',
			'محمد صلى الله عليه وسلم'
		]
	},
	{
		id: 'history',
		mainName: 'التاريخ الإسلامي',
		subName: 'التاريخ والتراجم',
		secondaryFallback: 'التراجم والسير',
		keywords: [
			'تاريخ',
			'التاريخ',
			'تراجم',
			'طبقات',
			'أعلام',
			'اعلام',
			'سير',
			'الدولة',
			'الخلافة',
			'الفتوح'
		]
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الآداب والأخلاق',
		secondaryFallback: 'آداب وأخلاق',
		keywords: [
			'تزكية',
			'أخلاق',
			'اخلاق',
			'آداب',
			'اداب',
			'رقائق',
			'مواعظ',
			'زهد',
			'أدب',
			'ادب'
		]
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية',
		subName: 'اللغة والأدب',
		secondaryFallback: 'علوم اللغة العربية',
		keywords: [
			'لغة عربية',
			'النحو',
			'صرف',
			'بلاغة',
			'أدب عربي',
			'شعر',
			'معاجم',
			'إعراب',
			'اعراب'
		]
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryFallback: 'الدعوة والإرشاد',
		keywords: ['دعوة', 'الدعوة', 'إرشاد', 'ارشاد', 'خطب', 'محاضرات', 'الوعظ', 'المسلم الجديد']
	},
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		subName: 'التعليم والتوجيه',
		secondaryFallback: 'التعليم الشرعي',
		keywords: [
			'تعليم',
			'التعليم',
			'تربية',
			'التربية',
			'منهج',
			'مناهج',
			'تعلم',
			'تدريس',
			'طالب العلم',
			'العلمية'
		]
	}
]);

const TOPIC_HINTS = Object.freeze([
	{ discipline: 'fiqh', name: 'الطهارة', keywords: ['طهارة', 'وضوء', 'غسل', 'تيمم'] },
	{ discipline: 'fiqh', name: 'الصلاة', keywords: ['صلاة', 'الصلاة', 'أذان', 'اذان', 'إمامة'] },
	{ discipline: 'fiqh', name: 'الزكاة', keywords: ['زكاة', 'الزكاة', 'صدقة'] },
	{ discipline: 'fiqh', name: 'الصيام', keywords: ['صيام', 'الصوم', 'رمضان'] },
	{ discipline: 'fiqh', name: 'الحج والعمرة', keywords: ['حج', 'الحج', 'عمرة', 'العمرة', 'مناسك'] },
	{ discipline: 'fiqh', name: 'المعاملات', keywords: ['معاملات', 'بيع', 'ربا', 'إجارة', 'اجارة', 'شركة'] },
	{ discipline: 'fiqh', name: 'الأسرة والنكاح', keywords: ['نكاح', 'زواج', 'طلاق', 'خلع', 'عدة', 'الأسرة'] },
	{ discipline: 'fiqh', name: 'المواريث', keywords: ['مواريث', 'فرائض', 'ميراث'] },
	{ discipline: 'quran', name: 'التفسير', keywords: ['تفسير', 'المفسر', 'معاني القرآن'] },
	{ discipline: 'quran', name: 'التجويد والقراءات', keywords: ['تجويد', 'قراءات', 'رواية حفص'] },
	{ discipline: 'hadith', name: 'مصطلح الحديث', keywords: ['مصطلح الحديث', 'علوم الحديث'] },
	{ discipline: 'hadith', name: 'شروح الحديث', keywords: ['شرح الحديث', 'شرح صحيح', 'فتح الباري'] },
	{ discipline: 'aqeedah', name: 'التوحيد', keywords: ['توحيد', 'الشرك', 'لا إله إلا الله'] },
	{ discipline: 'aqeedah', name: 'الفرق والردود', keywords: ['الفرق', 'الرد على', 'البدع'] },
	{ discipline: 'seerah', name: 'السيرة النبوية', keywords: ['سيرة', 'المغازي', 'الهجرة'] },
	{ discipline: 'history', name: 'التراجم والسير', keywords: ['تراجم', 'طبقات', 'أعلام', 'سير'] },
	{ discipline: 'history', name: 'التاريخ الإسلامي', keywords: ['تاريخ', 'الخلافة', 'الدولة', 'الفتوح'] },
	{ discipline: 'tazkiyah', name: 'الأخلاق والآداب', keywords: ['أخلاق', 'اخلاق', 'آداب', 'اداب'] },
	{ discipline: 'tazkiyah', name: 'الرقائق والمواعظ', keywords: ['رقائق', 'مواعظ', 'زهد'] },
	{ discipline: 'arabic', name: 'النحو والصرف', keywords: ['النحو', 'صرف', 'إعراب', 'اعراب'] },
	{ discipline: 'arabic', name: 'الأدب العربي', keywords: ['أدب عربي', 'شعر', 'ديوان'] },
	{ discipline: 'education', name: 'التعليم الشرعي', keywords: ['تعليم', 'تعلم', 'طالب العلم', 'العلمية'] }
]);

function tokensOf(s) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= 3));
}

function hasArabic(s) {
	return /[\u0600-\u06FF]/.test(String(s || ''));
}

function scoreTextAgainstDiscipline(text, discipline) {
	const hay = normalizeArabic(text);
	if (!hay) return 0;
	let score = 0;
	for (const keyword of discipline.keywords) {
		const n = normalizeArabic(keyword);
		if (!n) continue;
		if (hay.includes(n)) score += n.includes(' ') ? 3 : 2;
	}
	return score;
}

function inferSectionDiscipline(name) {
	let best = null;
	let bestScore = 0;
	for (const discipline of DISCIPLINES) {
		const score = scoreTextAgainstDiscipline(name, discipline);
		if (score > bestScore) {
			bestScore = score;
			best = discipline;
		}
	}
	return bestScore > 0 ? best : null;
}

function detectDominantDiscipline(bookMeta) {
	const title = normalizeArabic(bookMeta?.title || '');
	const hints = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	const description = normalizeArabic(bookMeta?.description || '');
	let best = null;
	let bestScore = 0;
	let secondScore = 0;

	for (const discipline of DISCIPLINES) {
		const score =
			scoreTextAgainstDiscipline(hints, discipline) * 3 +
			scoreTextAgainstDiscipline(title, discipline) * 2 +
			scoreTextAgainstDiscipline(description, discipline);
		if (score > bestScore) {
			secondScore = bestScore;
			bestScore = score;
			best = discipline;
		} else if (score > secondScore) {
			secondScore = score;
		}
	}

	if (!best || bestScore < 2) return null;
	// إن تقاربت الدرجات جداً نترك المطابقة النصية تقرر بدون قيد علمي صارم.
	if (secondScore > 0 && bestScore - secondScore <= 1) return null;
	return best;
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
	const discipline = detectDominantDiscipline(bookMeta);

	function scoreOf(name) {
		const n = normalizeArabic(name);
		if (!n) return 0;
		let score = 0;
		for (const w of n.split(' ')) {
			if (w.length >= 3 && tokens.has(w)) score += 1;
			if (haystack.includes(n) && n.length >= 4) score += 2;
		}
		if (discipline) {
			const sectionDiscipline = inferSectionDiscipline(name);
			if (sectionDiscipline?.id === discipline.id) score += 8;
			else if (sectionDiscipline && sectionDiscipline.id !== discipline.id) score -= 6;
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
		reasoning: discipline
			? `heuristic مطابقة محليّة ضمن مجال ${discipline.mainName}`
			: 'heuristic مطابقة محليّة',
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

function firstUsefulHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const raw = String(hint || '').trim();
		const n = normalizeArabic(raw);
		if (!raw || raw.length > 60) continue;
		if (!hasArabic(raw)) continue;
		if (GENERIC_HINTS.has(n)) continue;
		if (/^(الرئيسية|home|كتب)$/i.test(raw)) continue;
		return raw;
	}
	return '';
}

function pickTopicName(bookMeta, discipline) {
	const hay = normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
	const scoped = TOPIC_HINTS.filter((topic) => !discipline || topic.discipline === discipline.id);
	for (const topic of scoped) {
		for (const keyword of topic.keywords) {
			if (hay.includes(normalizeArabic(keyword))) return topic.name;
		}
	}
	const hint = firstUsefulHint(bookMeta);
	if (hint) return hint;
	return discipline?.secondaryFallback || 'كتب متنوّعة';
}

function pickSubName(bookMeta, discipline) {
	const hint = firstUsefulHint(bookMeta);
	if (hint) {
		const hintDiscipline = inferSectionDiscipline(hint);
		if (!discipline || !hintDiscipline || hintDiscipline.id === discipline.id) return hint;
	}
	return discipline?.subName || 'كتب متنوّعة';
}

function pickMainName(discipline) {
	return discipline?.mainName || 'المكتبة الإسلامية';
}

function buildBookScoringContext(bookMeta) {
	const haystack = normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
	return { haystack, tokens: tokensOf(haystack) };
}

function scoreNodeForBook(node, context, discipline) {
	const n = normalizeArabic(node?.name || '');
	if (!n) return -Infinity;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && context.tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && context.haystack.includes(n)) score += 3;
	if (discipline) {
		const nodeDiscipline = inferSectionDiscipline(node.name);
		if (nodeDiscipline?.id === discipline.id) score += 8;
		else if (nodeDiscipline && nodeDiscipline.id !== discipline.id) score -= 8;
	}
	return score;
}

function findBestNode(nodes, bookMeta, discipline, { minScore = 1 } = {}) {
	const context = buildBookScoringContext(bookMeta);
	let best = null;
	let bestScore = -Infinity;

	for (const node of nodes || []) {
		const score = scoreNodeForBook(node, context, discipline);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}

	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

function isGenericMainNode(node) {
	const name = normalizeArabic(node?.name || '');
	if (!name) return false;
	if (GENERIC_HINTS.has(name)) return true;
	return name.includes('اسلام') || name.includes('مكتبه') || name.includes('علوم شرعيه');
}

function findGenericMain(tree) {
	return (tree || []).find(isGenericMainNode) || null;
}

function findBestSubPath(tree, bookMeta, discipline, { minScore = 1 } = {}) {
	const context = buildBookScoringContext(bookMeta);
	let best = null;
	let bestScore = -Infinity;
	for (const main of tree || []) {
		const mainScore = Math.max(0, scoreNodeForBook(main, context, discipline));
		for (const sub of main.children || []) {
			const subScore = scoreNodeForBook(sub, context, discipline);
			const total = subScore + mainScore * 0.25;
			if (total > bestScore) {
				bestScore = total;
				best = { main, sub, mainScore, subScore };
			}
		}
	}
	if (!best || bestScore < minScore) return null;
	return best;
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
	const tree = sections.tree || [];
	const discipline = detectDominantDiscipline(bookMeta);
	const newMainName = pickMainName(discipline);
	const newSubName = pickSubName(bookMeta, discipline);
	const newSecondaryName = pickTopicName(bookMeta, discipline);

	if (tree.length === 0) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName,
			newSubName,
			newSecondaryName,
			confidence: 0.3,
			reasoning: 'لا توجد شجرة صالحة بعد الفلترة — إنشاء مسار ثلاثي جديد.',
			method: 'heuristic'
		};
	}

	let mainPick = findBestNode(tree, bookMeta, discipline, { minScore: discipline ? 4 : 1 });
	let main = mainPick?.node || null;
	let subPick = main
		? findBestNode(main.children || [], bookMeta, discipline, {
				minScore: discipline ? 4 : 1
			})
		: null;

	// إن كان الـ main عاماً لكن يوجد sub علمي مناسب في أي مكان، أعد استخدامه.
	if (!subPick) {
		const crossSub = findBestSubPath(tree, bookMeta, discipline, {
			minScore: discipline ? 4 : 1
		});
		if (crossSub) {
			main = crossSub.main;
			mainPick = { node: crossSub.main, score: crossSub.mainScore };
			subPick = { node: crossSub.sub, score: crossSub.subScore };
		}
	}

	if (!mainPick || !main) {
		const genericMain = findGenericMain(tree);
		if (genericMain) {
			return {
				kind: 'create_sub',
				mainId: String(genericMain.id),
				subId: null,
				secondaryId: null,
				newSubName,
				newSecondaryName,
				confidence: 0.4,
				reasoning: `لم يوجد قسم رئيسي متخصص، لكن "${genericMain.name}" عام مناسب — إنشاء فرعي وثانوي تحته.`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName,
			newSubName,
			newSecondaryName,
			confidence: 0.35,
			reasoning: discipline
				? `لا يوجد قسم رئيسي مناسب لمجال ${discipline.mainName} — إنشاء مسار جديد.`
				: 'لا يوجد قسم رئيسي مناسب — إنشاء مسار جديد.',
			method: 'heuristic'
		};
	}

	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName,
			newSecondaryName,
			confidence: Math.min(0.45 + mainPick.score * 0.03, 0.75),
			reasoning: `وُجد قسم رئيسي مناسب "${main.name}" ولا يوجد قسم فرعي أدق — إنشاء فرعي وثانوي.`,
			method: 'heuristic'
		};
	}

	const sub = subPick.node;
	const proposedSecondary = newSecondaryName;
	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: proposedSecondary,
		minScore: 6
	});
	if (reusable) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			confidence: Math.min(0.55 + mainPick.score * 0.03 + subPick.score * 0.03, 0.9),
			reasoning: `مطابقة ثلاثية: ${main.name} ← ${sub.name} ← ${reusable.name}.`,
			method: 'heuristic'
		};
	}

	const secPick = findBestNode(sub.children || [], bookMeta, discipline, {
		minScore: discipline ? 4 : 1
	});
	if (secPick) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secPick.node.id),
			confidence: Math.min(0.55 + mainPick.score * 0.03 + subPick.score * 0.03, 0.9),
			reasoning: `مطابقة ثلاثية: ${main.name} ← ${sub.name} ← ${secPick.node.name}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: proposedSecondary,
		confidence: Math.min(0.45 + mainPick.score * 0.03 + subPick.score * 0.03, 0.8),
		reasoning: `وُجد المسار ${main.name} ← ${sub.name} دون قسم ثانوي مناسب — إنشاء "${proposedSecondary}".`,
		method: 'heuristic'
	};
}
