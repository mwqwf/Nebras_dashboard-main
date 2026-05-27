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

function tokenSetsOverlapRatio(setA, setB) {
	if (!setA.size || !setB.size) return 0;
	let inter = 0;
	for (const t of setA) if (setB.has(t)) inter += 1;
	return inter / new Set([...setA, ...setB]).size;
}

/**
 * قواعد معرفية صغيرة تمنع الخلط بين المجالات المتشابهة لفظياً:
 * "آداب طلب العلم" مثلاً ليس أدباً عربياً، و"التاريخ" ليس عقيدة.
 */
const TAXONOMY_RULES = Object.freeze([
	{
		id: 'education_guidance',
		keywords: [
			'تعليم',
			'التعليم',
			'تعليمات',
			'علمية',
			'العلمية',
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'المتعلم',
			'التعلم',
			'التدريس',
			'التربية',
			'نصائح',
			'النصائح',
			'إرشاد',
			'ارشاد',
			'إرشادات',
			'توجيه',
			'توجيهات'
		],
		mainNames: ['التربية والتعليم', 'التعليم', 'علوم التربية', 'المعرفة والتعليم'],
		subNames: ['التعليم والتوجيه العلمي', 'طلب العلم', 'التربية العلمية', 'الإرشاد التعليمي', 'التوجيه العلمي'],
		secondaryNames: ['إرشادات ونصائح علمية', 'النصائح العلمية', 'آداب طلب العلم'],
		minScore: 2
	},
	{
		id: 'fiqh',
		keywords: [
			'فقه',
			'الفقه',
			'فتاوى',
			'فتوى',
			'الأحكام',
			'احكام',
			'عبادات',
			'معاملات',
			'المذاهب',
			'المالكي',
			'الشافعي',
			'الحنفي',
			'الحنبلي',
			'أصول الفقه',
			'اصول الفقه'
		],
		mainNames: ['العلوم الشرعية', 'الإسلاميات', 'الشريعة', 'الدراسات الإسلامية'],
		subNames: ['الفقه الإسلامي', 'الفقه', 'أصول الفقه'],
		secondaryNames: ['فقه عام', 'مسائل فقهية'],
		minScore: 1
	},
	{
		id: 'aqeedah',
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الايمان', 'الإيمان', 'اسماء الله', 'أسماء الله', 'الصفات'],
		mainNames: ['العلوم الشرعية', 'الإسلاميات', 'الدراسات الإسلامية'],
		subNames: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد'],
		secondaryNames: ['عقيدة عامة', 'التوحيد'],
		minScore: 1
	},
	{
		id: 'history',
		keywords: ['تاريخ', 'التاريخ', 'تراجم', 'السير', 'الحضارة', 'الدول', 'الفتوحات', 'الوقائع'],
		mainNames: ['التاريخ والسير', 'التاريخ', 'السيرة والتاريخ'],
		subNames: ['التاريخ الإسلامي', 'التراجم والسير', 'التاريخ العام'],
		secondaryNames: ['تاريخ عام', 'تراجم وسير'],
		minScore: 1
	},
	{
		id: 'hadith',
		keywords: ['حديث', 'الحديث', 'السنة', 'سنن', 'صحيح', 'رواة', 'اسناد', 'إسناد', 'جرح وتعديل'],
		mainNames: ['العلوم الشرعية', 'الإسلاميات', 'الدراسات الإسلامية'],
		subNames: ['الحديث الشريف', 'علوم الحديث', 'السنة النبوية'],
		secondaryNames: ['حديث عام', 'علوم الحديث'],
		minScore: 1
	},
	{
		id: 'quran',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'التفسير', 'تجويد', 'القراءات', 'المصحف'],
		mainNames: ['القرآن الكريم وعلومه', 'القرآن الكريم', 'العلوم الشرعية', 'الإسلاميات'],
		subNames: ['التفسير', 'علوم القرآن', 'التجويد والقراءات'],
		secondaryNames: ['تفسير عام', 'علوم القرآن'],
		minScore: 1
	},
	{
		id: 'arabic_literature',
		keywords: ['الأدب العربي', 'ادب عربي', 'الشعر', 'نثر', 'بلاغة', 'رواية', 'قصص', 'ديوان', 'لغة عربية', 'النحو'],
		mainNames: ['اللغة العربية وآدابها', 'الأدب واللغة', 'الأدب العربي'],
		subNames: ['الأدب العربي', 'اللغة العربية', 'البلاغة والنقد'],
		secondaryNames: ['أدب عام', 'نصوص أدبية'],
		minScore: 1
	}
]);

function scoreRule(rule, haystack, tokens) {
	let score = 0;
	for (const kw of rule.keywords || []) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (n.includes(' ')) {
			if (haystack.includes(n)) score += 2;
			continue;
		}
		if (tokens.has(n)) score += 1;
	}
	return score;
}

function resolveTaxonomyIntent(bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		const score = scoreRule(rule, haystack, tokens);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < (best.minScore || 1)) return null;
	return { ...best, score: bestScore };
}

function sanitizeSectionName(raw, fallback = '') {
	let s = String(raw || '').trim();
	if (!s) s = fallback;
	s = String(s || '').trim();
	if (!s) return '';
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s
		.replace(/^(?:كتاب|كتب|مكتبة نور|الرئيسية)\s*[:\-–—]?\s*/u, '')
		.replace(/^[\s,،.\-–—_]+/, '')
		.replace(/[\s,،.\-–—_]+$/, '')
		.trim();
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s;
}

function preferredNameScore(sectionName, preferredNames = []) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	let best = 0;
	for (const p of preferredNames || []) {
		const pn = normalizeArabic(p);
		if (!pn) continue;
		if (n === pn) best = Math.max(best, 14);
		else if (n.includes(pn) || pn.includes(n)) best = Math.max(best, 10);
		else {
			const r = tokenSetsOverlapRatio(tokensOf(n), tokensOf(pn));
			if (r >= 0.45) best = Math.max(best, 7);
			else if (r >= 0.25) best = Math.max(best, 4);
		}
	}
	return best;
}

function scoreNode(node, haystack, tokens, preferredNames = []) {
	const n = normalizeArabic(node?.name || '');
	if (!n) return 0;
	let score = preferredNameScore(node.name, preferredNames);
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	return score;
}

function pickBestNode(nodes, haystack, tokens, preferredNames = [], minScore = 1) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNode(node, haystack, tokens, preferredNames);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

function pickBestCategoryHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint);
		if (clean && clean.length >= 2) return clean;
	}
	return '';
}

function newSubNameFor(bookMeta, intent) {
	return sanitizeSectionName(intent?.subNames?.[0]) || pickBestCategoryHint(bookMeta) || 'كتب عامة';
}

function newSecondaryNameFor(bookMeta, intent) {
	return (
		sanitizeSectionName(intent?.secondaryNames?.[0]) ||
		sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || '')) ||
		pickBestCategoryHint(bookMeta) ||
		'كتب عامة'
	);
}

/**
 * Heuristic تنفيذي: يختار مساراً ثلاثياً كاملاً. عند ضعف أي مستوى:
 * يقترح إنشاء المستوى الناقص بدلاً من إسقاط الكتاب في قسم قريب خطأً.
 */
function classifyHeuristic(sections, bookMeta) {
	const tree = sections.tree || [];
	if (!tree.length) return null;

	const haystack = haystackForReuse(bookMeta);
	const tokens = tokensOf(haystack);
	const intent = resolveTaxonomyIntent(bookMeta);
	const mainNames = intent?.mainNames || [];
	const subNames = intent?.subNames || [];
	const secondaryNames = intent?.secondaryNames || [];

	const mainPick = pickBestNode(tree, haystack, tokens, mainNames, intent ? 5 : 1);
	if (!mainPick) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: sanitizeSectionName(mainNames[0]) || 'مكتبة نور',
			newSubName: newSubNameFor(bookMeta, intent),
			newSecondaryName: newSecondaryNameFor(bookMeta, intent),
			confidence: intent ? 0.45 : 0.25,
			reasoning: intent
				? `لم يُعثَر على قسم رئيسي مناسب لمجال "${intent.subNames?.[0] || intent.id}" — إنشاء مسار جديد.`
				: 'لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار Noor جديد.',
			method: 'heuristic'
		};
	}

	const bestMain = mainPick.node;
	const subPick = pickBestNode(bestMain.children || [], haystack, tokens, subNames, intent ? 5 : 1);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.id),
			subId: null,
			secondaryId: null,
			newSubName: newSubNameFor(bookMeta, intent),
			newSecondaryName: newSecondaryNameFor(bookMeta, intent),
			confidence: Math.min(0.45 + mainPick.score * 0.03, 0.7),
			reasoning: `وُجد قسم رئيسي مناسب "${bestMain.name}" لكن لا يوجد قسم فرعي دقيق — إنشاء فرعي جديد.`,
			method: 'heuristic'
		};
	}

	const bestSub = subPick.node;
	const secPick = pickBestNode(
		bestSub.children || [],
		haystack,
		tokens,
		secondaryNames,
		intent ? 5 : 2
	);
	if (!secPick) {
		return {
			kind: 'create_secondary',
			mainId: String(bestMain.id),
			subId: String(bestSub.id),
			secondaryId: null,
			newSecondaryName: newSecondaryNameFor(bookMeta, intent),
			confidence: Math.min(0.5 + mainPick.score * 0.03 + subPick.score * 0.03, 0.78),
			reasoning: `وُجد المسار "${bestMain.name} ← ${bestSub.name}" لكن لا يوجد قسم ثانوي دقيق — إنشاء ثانوي جديد.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(bestMain.id),
		subId: String(bestSub.id),
		secondaryId: String(secPick.node.id),
		confidence: Math.min(0.55 + mainPick.score * 0.03 + subPick.score * 0.03 + secPick.score * 0.02, 0.92),
		reasoning: `مطابقة محلّيّة دقيقة: ${bestMain.name} ← ${bestSub.name} ← ${secPick.node.name}.`,
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
			kind: 'existing',
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
	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: newSubNameFor(bookMeta, null),
			newSecondaryName: newSecondaryNameFor(bookMeta, null),
			confidence: 0.2,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — إنشاء مسار Noor منظّم.',
			method: 'heuristic'
		};
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (sug.kind === 'existing' && !secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: '',
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	if (sug.kind === 'existing' && !secId) {
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: null,
			newSecondaryName: newSecondaryNameFor(bookMeta, resolveTaxonomyIntent(bookMeta)),
			confidence: Math.max(0.35, sug.confidence - 0.1),
			reasoning: 'وُجد main/sub مناسب، لكن لا يوجد secondary مناسب — إنشاء قسم ثانوي لضمان الهيكل الثلاثي.',
			method: 'heuristic'
		};
	}
	if (sug.kind !== 'existing') return sug;
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
