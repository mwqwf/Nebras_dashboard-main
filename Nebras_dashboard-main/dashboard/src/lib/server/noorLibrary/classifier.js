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

function tokenSet(s) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= 3));
}

function bookHaystack(bookMeta) {
	return normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		].filter(Boolean).join(' ')
	);
}

function keywordScore(haystack, keywords = []) {
	const hayTokens = tokenSet(haystack);
	let score = 0;
	for (const kw of keywords) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		const parts = n.split(' ').filter((p) => p.length >= 3);
		if (haystack.includes(n)) score += parts.length > 1 ? 7 : 4;
		else if (parts.length && parts.every((p) => hayTokens.has(p))) score += 3 + parts.length;
		else {
			for (const p of parts) {
				if (hayTokens.has(p)) score += 1;
			}
		}
	}
	return score;
}

function nameScore(sectionName, terms = []) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	const sectionTokens = tokenSet(n);
	let score = 0;
	for (const term of terms) {
		const t = normalizeArabic(term);
		if (!t) continue;
		if (n === t) score += 20;
		else if (n.includes(t) || t.includes(n)) score += 12;
		const termTokens = tokenSet(t);
		score += tokenSetsOverlapRatio(sectionTokens, termTokens) * 10;
	}
	return score;
}

function findBestNode(nodes, terms, minScore = 5) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nameScore(node?.name || '', terms);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

/**
 * خريطة مجالات محلية تمنع الخلط بين العلوم: الفقه لا يلتقط التاريخ،
 * والعقيدة لا تلتقط السيرة، والآداب العلمية لا تُرمى داخل الفقه.
 */
const DOMAIN_BLUEPRINTS = Object.freeze([
	{
		id: 'education_advice',
		mainName: 'التزكية والأخلاق والآداب',
		mainAliases: ['التزكية والأخلاق', 'الأخلاق والآداب', 'التربية والتعليم', 'الدعوة والتربية'],
		subName: 'طلب العلم وآدابه',
		subAliases: ['طلب العلم', 'آداب طالب العلم', 'التربية العلمية'],
		secondaryName: 'نصائح وتوجيهات علمية',
		secondaryAliases: ['نصائح علمية', 'توجيهات علمية', 'وصايا لطلاب العلم', 'آداب طالب العلم'],
		keywords: [
			'نصائح',
			'توجيهات',
			'تعليمات',
			'إرشادات',
			'ارشادات',
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'آداب طالب العلم',
			'اداب طالب العلم',
			'العالم والمتعلم',
			'التعليمات العلمية',
			'منهجية الطلب',
			'التحصيل العلمي'
		],
		negative: ['أصول الفقه', 'مسائل فقهية', 'العقيدة', 'التاريخ الإسلامي']
	},
	{
		id: 'quran_tafsir',
		mainName: 'القرآن الكريم وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن'],
		secondaryName: 'كتب التفسير',
		secondaryAliases: ['التفسير', 'تفاسير القرآن'],
		keywords: ['تفسير', 'المفسر', 'القرآن', 'القران', 'علوم القرآن', 'أسباب النزول', 'الناسخ والمنسوخ'],
		negative: ['حديث', 'فقه', 'تاريخ', 'عقيدة']
	},
	{
		id: 'quran_tajweed',
		mainName: 'القرآن الكريم وعلومه',
		mainAliases: ['القرآن وعلومه', 'علوم القرآن'],
		subName: 'التجويد والقراءات',
		subAliases: ['التجويد', 'القراءات'],
		secondaryName: 'أحكام التجويد والقراءات',
		secondaryAliases: ['أحكام التجويد', 'علم القراءات'],
		keywords: ['تجويد', 'قراءات', 'رواية حفص', 'أحكام التلاوة', 'مخارج الحروف'],
		negative: ['فقه', 'تاريخ']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		mainAliases: ['الحديث الشريف', 'الحديث وعلومه', 'السنة النبوية'],
		subName: 'كتب الحديث وشروحه',
		subAliases: ['شروح الحديث', 'الكتب الستة', 'مصطلح الحديث'],
		secondaryName: 'متون وشروح الحديث',
		secondaryAliases: ['شرح الحديث', 'متون الحديث', 'مصطلح الحديث'],
		keywords: ['حديث', 'أحاديث', 'سنة', 'صحيح البخاري', 'صحيح مسلم', 'سنن', 'مسند', 'مصطلح الحديث', 'تخريج'],
		negative: ['فقه', 'تاريخ', 'لغة عربية']
	},
	{
		id: 'fiqh_usul',
		mainName: 'الفقه الإسلامي وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه الإسلامي', 'الفقه'],
		subName: 'أصول الفقه والقواعد الفقهية',
		subAliases: ['أصول الفقه', 'القواعد الفقهية'],
		secondaryName: 'أصول الفقه',
		secondaryAliases: ['قواعد أصول الفقه', 'القواعد الأصولية'],
		keywords: ['أصول الفقه', 'اصول الفقه', 'القواعد الفقهية', 'الاستنباط', 'القياس', 'الإجماع', 'الاجماع'],
		negative: ['تاريخ', 'سيرة', 'عقيدة', 'أدب عربي']
	},
	{
		id: 'fiqh_general',
		mainName: 'الفقه الإسلامي وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه الإسلامي', 'الفقه'],
		subName: 'الفقه العام',
		subAliases: ['فقه العبادات', 'فقه المعاملات', 'المذاهب الفقهية'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['أحكام فقهية', 'فتاوى ومسائل'],
		keywords: ['فقه', 'فقهي', 'الأحكام', 'الحلال والحرام', 'الطهارة', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'البيع', 'النكاح', 'المعاملات'],
		negative: ['تاريخ', 'سيرة', 'عقيدة', 'أدب عربي', 'لغة']
	},
	{
		id: 'aqida',
		mainName: 'العقيدة والتوحيد',
		mainAliases: ['العقيدة', 'التوحيد', 'الإيمان'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['التوحيد', 'أصول الاعتقاد', 'الإيمان'],
		secondaryName: 'كتب العقيدة والتوحيد',
		secondaryAliases: ['شرح العقيدة', 'مسائل الاعتقاد'],
		keywords: ['عقيدة', 'اعتقاد', 'توحيد', 'الإيمان', 'الايمان', 'الشرك', 'أسماء الله وصفاته', 'الولاء والبراء', 'الفرق والمذاهب'],
		negative: ['تاريخ', 'سيرة', 'فقه', 'أدب']
	},
	{
		id: 'sira',
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'السيرة والتاريخ'],
		subName: 'السيرة النبوية',
		subAliases: ['السيرة', 'شمائل النبي', 'المغازي'],
		secondaryName: 'كتب السيرة النبوية',
		secondaryAliases: ['السيرة النبوية', 'الشمائل', 'المغازي'],
		keywords: ['سيرة', 'السيرة النبوية', 'شمائل', 'مغازي', 'غزوات', 'حياة النبي', 'الرسول'],
		negative: ['عقيدة', 'فقه', 'حديث']
	},
	{
		id: 'history',
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['التاريخ الإسلامي', 'السيرة والتاريخ', 'التاريخ'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['تاريخ الخلفاء', 'الدول الإسلامية', 'التراجم والطبقات'],
		secondaryName: 'كتب التاريخ والتراجم',
		secondaryAliases: ['التاريخ الإسلامي', 'التراجم', 'الطبقات'],
		keywords: ['تاريخ', 'الخلفاء', 'الدولة الأموية', 'الدولة العباسية', 'الأندلس', 'تراجم', 'طبقات', 'البلدان'],
		negative: ['عقيدة', 'فقه', 'تفسير']
	},
	{
		id: 'arabic_literature',
		mainName: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'الأدب العربي'],
		subName: 'الأدب العربي',
		subAliases: ['الشعر والنثر', 'النقد الأدبي'],
		secondaryName: 'الشعر والنثر',
		secondaryAliases: ['الشعر العربي', 'النثر العربي', 'النقد الأدبي'],
		keywords: ['أدب عربي', 'الادب العربي', 'شعر', 'ديوان', 'قصائد', 'نثر', 'بلاغة أدبية', 'نقد أدبي'],
		negative: ['فقه', 'عقيدة', 'حديث']
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'علوم اللغة'],
		subName: 'النحو والصرف والبلاغة',
		subAliases: ['النحو', 'الصرف', 'البلاغة'],
		secondaryName: 'علوم اللغة العربية',
		secondaryAliases: ['النحو والصرف', 'البلاغة العربية'],
		keywords: ['نحو', 'صرف', 'بلاغة', 'إعراب', 'اعراب', 'معجم', 'لغة عربية', 'لسان العرب'],
		negative: ['فقه', 'عقيدة', 'تاريخ']
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق والآداب',
		mainAliases: ['التزكية والأخلاق', 'الأخلاق والآداب', 'الرقائق'],
		subName: 'الأخلاق والرقائق',
		subAliases: ['التزكية', 'الأخلاق', 'الآداب الشرعية'],
		secondaryName: 'كتب الأخلاق والآداب',
		secondaryAliases: ['الرقائق', 'تهذيب النفس', 'الآداب الشرعية'],
		keywords: ['تزكية', 'أخلاق', 'اخلاق', 'آداب', 'اداب', 'رقائق', 'زهد', 'تهذيب النفس', 'موعظة'],
		negative: ['أدب عربي', 'فقه', 'تاريخ', 'عقيدة']
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة', 'التربية الإسلامية', 'التربية والتعليم'],
		subName: 'الدعوة والتربية الإسلامية',
		subAliases: ['الدعوة إلى الله', 'التربية الإسلامية'],
		secondaryName: 'مناهج الدعوة والتربية',
		secondaryAliases: ['وسائل الدعوة', 'التربية الإسلامية'],
		keywords: ['دعوة', 'الداعية', 'تربية', 'تربوي', 'إصلاح المجتمع', 'الإرشاد', 'الوعظ'],
		negative: ['فقه', 'تاريخ', 'عقيدة']
	}
]);

const GENERIC_BLUEPRINT = Object.freeze({
	id: 'general_islamic',
	mainName: 'المعارف الإسلامية العامة',
	mainAliases: ['كتب إسلامية', 'إسلاميات', 'المعارف الإسلامية', 'الثقافة الإسلامية'],
	subName: 'كتب إسلامية عامة',
	subAliases: ['موضوعات إسلامية عامة', 'ثقافة إسلامية'],
	secondaryName: 'موضوعات متنوعة',
	secondaryAliases: ['كتب متنوعة', 'عام'],
	keywords: []
});

function pickBlueprint(bookMeta) {
	const hay = bookHaystack(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const bp of DOMAIN_BLUEPRINTS) {
		const positive = keywordScore(hay, bp.keywords);
		const negative = keywordScore(hay, bp.negative || []);
		const score = positive - negative * 1.4;
		if (score > bestScore) {
			best = bp;
			bestScore = score;
		}
	}
	if (best && bestScore >= (best.minScore || 4)) {
		return { blueprint: best, score: bestScore };
	}
	return null;
}

function mainTerms(bp) {
	return [bp.mainName, ...(bp.mainAliases || [])];
}

function subTerms(bp) {
	return [bp.subName, ...(bp.subAliases || [])];
}

function secondaryTerms(bp) {
	return [bp.secondaryName, ...(bp.secondaryAliases || [])];
}

function decideFromBlueprint(sections, bp, confidence, reasoning, bookMeta = {}) {
	const main = findBestNode(sections.tree, mainTerms(bp), 5);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: bp.mainName,
			newSubName: bp.subName,
			newSecondaryName: bp.secondaryName,
			mainId: null,
			subId: null,
			secondaryId: null,
			confidence,
			reasoning,
			method: 'domain-blueprint'
		};
	}

	const sub = findBestNode(main.node.children || [], subTerms(bp), 5);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.node.id),
			subId: null,
			secondaryId: null,
			newSubName: bp.subName,
			newSecondaryName: bp.secondaryName,
			confidence,
			reasoning,
			method: 'domain-blueprint'
		};
	}

	const secByName = findBestNode(sub.node.children || [], secondaryTerms(bp), 5);
	const secByBook = pickReuseSecondary(sections, String(sub.node.id), bookMeta, {
		proposedNewName: bp.secondaryName,
		minScore: 8
	});
	const secondary = secByName?.node || (secByBook ? { id: secByBook.id, name: secByBook.name } : null);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.node.id),
			subId: String(sub.node.id),
			secondaryId: null,
			newSecondaryName: bp.secondaryName,
			confidence,
			reasoning,
			method: 'domain-blueprint'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.node.id),
		subId: String(sub.node.id),
		secondaryId: String(secondary.id),
		confidence,
		reasoning,
		method: 'domain-blueprint'
	};
}

/**
 * Heuristic fallback — يختار مساراً موجوداً فقط إذا كانت المطابقة واضحة
 * في المستويات الثلاثة. عند غياب الثانوي نرجع null لكي ينشئ المحرّك قسماً
 * ثانوياً بدلاً من وضع المحتوى مباشرة تحت الفرعي.
 */
function classifyHeuristic({ tree }, bookMeta) {
	const haystack = bookHaystack(bookMeta);
	const tokens = tokenSet(haystack);

	function scoreOf(name) {
		const n = normalizeArabic(name);
		if (!n) return 0;
		let score = 0;
		for (const w of n.split(' ')) {
			if (w.length >= 3 && tokens.has(w)) score += 1;
		}
		if (haystack.includes(n) && n.length >= 4) score += 4;
		return score;
	}

	let bestMain = null, bestMainScore = -1;
	for (const m of tree) {
		const s = scoreOf(m.name);
		if (s > bestMainScore) { bestMainScore = s; bestMain = m; }
	}
	if (!bestMain || bestMainScore <= 0) return null;

	let bestSub = null, bestSubScore = -1;
	for (const sub of bestMain.children || []) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub || bestSubScore <= 0) return null;

	let bestSec = null, bestSecScore = -1;
	for (const sec of bestSub.children || []) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) { bestSecScore = s; bestSec = sec; }
	}
	if (!bestSec || bestSecScore <= 0) return null;

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec.id,
		confidence: Math.min(0.55 + bestMainScore * 0.05 + bestSubScore * 0.05 + bestSecScore * 0.04, 0.86),
		reasoning: 'heuristic مطابقة محليّة واضحة في المستويات الثلاثة',
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

	const picked = pickBlueprint(bookMeta);
	const decision = picked
		? decideFromBlueprint(
				sections,
				picked.blueprint,
				Math.min(0.65 + picked.score * 0.03, 0.95),
				`domain-blueprint:${picked.blueprint.id}`,
				bookMeta
			)
		: null;
	const sug =
		decision?.kind === 'existing'
			? decision
			: classifyHeuristic(sections, bookMeta);
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

	const picked = pickBlueprint(bookMeta);
	if (picked) {
		return decideFromBlueprint(
			sections,
			picked.blueprint,
			Math.min(0.65 + picked.score * 0.03, 0.95),
			`اختيار مجال صارم يمنع خلط العلوم: ${picked.blueprint.id}`,
			bookMeta
		);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return decideFromBlueprint(
			sections,
			GENERIC_BLUEPRINT,
			0.35,
			'لم توجد مطابقة علمية دقيقة — إنشاء/استخدام مسار عام بدل الخلط بين الأقسام.',
			bookMeta
		);
	}

	return {
		kind: 'existing',
		mainId: String(sug.mainId),
		subId: String(sug.subId),
		secondaryId: String(sug.secondaryId),
		confidence: sug.confidence,
		reasoning: sug.reasoning,
		method: 'heuristic'
	};
}
