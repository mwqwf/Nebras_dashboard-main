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

const TAXONOMY_RULES = Object.freeze([
	{
		mainName: 'القرآن وعلومه',
		mainAliases: ['القرآن الكريم وعلومه', 'كتب في التفسير وعلوم القرآن', 'التفسير وعلوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['علوم القرآن', 'التفسير'],
		secondaryName: 'التفسير',
		strong: ['تفسير', 'المفسر', 'تدبر القران', 'معاني القران'],
		keywords: ['القران', 'سوره', 'ايات', 'اسباب النزول', 'الناسخ والمنسوخ']
	},
	{
		mainName: 'القرآن وعلومه',
		mainAliases: ['القرآن الكريم وعلومه', 'كتب في التفسير وعلوم القرآن', 'التفسير وعلوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['علوم القرآن', 'التفسير'],
		secondaryName: 'التجويد والقراءات',
		strong: ['تجويد', 'قراءات', 'روايه حفص', 'روايه ورش'],
		keywords: ['احكام التلاوه', 'رسم المصحف', 'الاداء القراني']
	},
	{
		mainName: 'الحديث الشريف وعلومه',
		mainAliases: ['كتب في الحديث وعلومه', 'الحديث وعلومه', 'الحديث النبوي'],
		subName: 'علوم الحديث',
		subAliases: ['مصطلح الحديث', 'الحديث'],
		secondaryName: 'مصطلح الحديث',
		strong: ['مصطلح الحديث', 'علوم الحديث', 'الجرح والتعديل', 'علل الحديث'],
		keywords: ['اسناد', 'رواه', 'صحيح', 'ضعيف', 'سنن', 'مسند']
	},
	{
		mainName: 'الحديث الشريف وعلومه',
		mainAliases: ['كتب في الحديث وعلومه', 'الحديث وعلومه', 'الحديث النبوي'],
		subName: 'الحديث النبوي وشروحه',
		subAliases: ['شروح الحديث', 'الحديث'],
		secondaryName: 'شروح الحديث',
		strong: ['شرح الحديث', 'فتح الباري', 'شرح صحيح', 'شرح سنن'],
		keywords: ['صحيح البخاري', 'صحيح مسلم', 'سنن ابي داود', 'الترمذي', 'النسائي']
	},
	{
		mainName: 'الفقه وأصوله',
		mainAliases: ['كتب في الفقه وأصوله', 'الفقه الإسلامي', 'فقه وأصوله'],
		subName: 'أصول الفقه',
		subAliases: ['اصول الفقه', 'القواعد الأصولية'],
		secondaryName: 'أصول الفقه',
		strong: ['اصول الفقه', 'القياس', 'الاجماع', 'الاستحسان', 'المصالح المرسله'],
		keywords: ['الدلالات', 'العام والخاص', 'المطلق والمقيد', 'الناسخ والمنسوخ']
	},
	{
		mainName: 'الفقه وأصوله',
		mainAliases: ['كتب في الفقه وأصوله', 'الفقه الإسلامي', 'فقه وأصوله'],
		subName: 'الفقه الإسلامي',
		subAliases: ['فقه العبادات', 'فقه المعاملات', 'الفقه'],
		secondaryName: 'الفقه العام',
		strong: ['فقه', 'احكام', 'فتاوي', 'مسائل فقهيه'],
		keywords: ['الصلاه', 'الزكاه', 'الصيام', 'الحج', 'الطهاره', 'البيع', 'النكاح', 'المواريث']
	},
	{
		mainName: 'العقيدة الإسلامية',
		mainAliases: ['كتب في العقيدة', 'العقيدة والتوحيد', 'التوحيد والعقيدة'],
		subName: 'التوحيد والعقيدة',
		subAliases: ['العقيدة', 'التوحيد'],
		secondaryName: 'العقيدة',
		strong: ['عقيده', 'توحيد', 'اسماء الله وصفاته', 'الايمان', 'الشرك'],
		keywords: ['السنه والجماعه', 'الايمان بالملائكه', 'الايمان بالقدر', 'الولاء والبراء']
	},
	{
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['كتب في السيرة النبوية', 'التاريخ الإسلامي', 'السيرة النبوية والتاريخ'],
		subName: 'السيرة النبوية',
		subAliases: ['السيرة', 'شمائل النبي'],
		secondaryName: 'السيرة النبوية',
		strong: ['سيره النبي', 'السيره النبويه', 'شمائل', 'المغازي'],
		keywords: ['غزوه', 'الهجره', 'الرسول', 'النبي صلي الله عليه وسلم']
	},
	{
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['كتب في التاريخ الإسلامي', 'التاريخ الإسلامي', 'السيرة النبوية والتاريخ'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['تاريخ', 'التاريخ'],
		secondaryName: 'التاريخ الإسلامي',
		priority: 3,
		strong: ['تاريخ', 'الخلافه', 'الدوله الامويه', 'الدوله العباسيه', 'الفتوحات'],
		keywords: ['الاندلس', 'الحضاره', 'العصر', 'الحروب الصليبيه']
	},
	{
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['التراجم والطبقات', 'السيرة النبوية والتاريخ'],
		subName: 'التراجم والطبقات',
		subAliases: ['تراجم', 'طبقات', 'سير الأعلام'],
		secondaryName: 'تراجم العلماء',
		strong: ['ترجمه', 'تراجم', 'طبقات', 'اعلام', 'سير اعلام'],
		keywords: ['وفيات', 'رجال', 'مشاهير', 'علماء']
	},
	{
		mainName: 'التزكية والآداب والأخلاق',
		mainAliases: ['كتب في التزكية والأخلاق', 'الأخلاق والآداب', 'الرقائق والآداب'],
		subName: 'الأخلاق والآداب الشرعية',
		subAliases: ['الآداب الشرعية', 'الأخلاق', 'الاداب'],
		secondaryName: 'آداب طالب العلم',
		priority: 3,
		strong: ['اداب طالب العلم', 'طلب العلم', 'تعليم العلم', 'النصائح العلميه', 'تعليمات علميه', 'وصايا طالب العلم', 'اداب', 'اخلاق'],
		keywords: ['النصيحه', 'نصائح', 'العلماء', 'المتعلم', 'التعليم']
	},
	{
		mainName: 'التزكية والآداب والأخلاق',
		mainAliases: ['كتب في التزكية والأخلاق', 'الأخلاق والآداب', 'الرقائق والآداب'],
		subName: 'تزكية النفس',
		subAliases: ['التزكية', 'الرقائق', 'السلوك'],
		secondaryName: 'الرقائق وتزكية النفس',
		strong: ['تزكيه النفس', 'الرقائق', 'الزهد', 'محاسبه النفس'],
		keywords: ['القلب', 'الاخلاص', 'التوبه', 'الورع', 'الخشوع']
	},
	{
		mainName: 'الدعوة والتربية الإسلامية',
		mainAliases: ['الدعوة', 'التربية الإسلامية', 'التعليم الشرعي'],
		subName: 'التعليم الشرعي',
		subAliases: ['التربية والتعليم', 'مناهج التعليم', 'التعليم'],
		secondaryName: 'مناهج التعليم الشرعي',
		strong: ['التعليم الشرعي', 'مناهج التعليم', 'التربيه الاسلاميه', 'المناهج العلميه'],
		keywords: ['التدريس', 'المعلم', 'المتعلم', 'المدرسه', 'المنهج']
	},
	{
		mainName: 'اللغة العربية وعلومها',
		mainAliases: ['كتب في اللغة العربية', 'اللغة العربية', 'العربية وعلومها'],
		subName: 'علوم اللغة العربية',
		subAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondaryName: 'النحو والصرف',
		strong: ['نحو', 'صرف', 'اعراب', 'الاجريه', 'الفية ابن مالك'],
		keywords: ['اللغه العربيه', 'البلاغه', 'العروض', 'القواعد']
	},
	{
		mainName: 'الثقافة الإسلامية العامة',
		mainAliases: ['كتب إسلامية', 'موضوعات إسلامية عامة', 'الثقافة الإسلامية'],
		subName: 'موضوعات إسلامية عامة',
		subAliases: ['عام', 'متفرقات', 'موضوعات عامة'],
		secondaryName: 'كتب عامة',
		strong: ['اسلاميه', 'اسلامي', 'الدين'],
		keywords: ['كتاب', 'رساله', 'بحث']
	}
]);

function metaHaystack(bookMeta) {
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

function categoryHaystack(bookMeta) {
	return normalizeArabic((bookMeta?.categoryHints || []).filter(Boolean).join(' '));
}

function includesPhrase(haystack, phrase) {
	const n = normalizeArabic(phrase);
	return !!n && haystack.includes(n);
}

function scoreTaxonomyRule(rule, bookMeta) {
	const hay = metaHaystack(bookMeta);
	const categories = categoryHaystack(bookMeta);
	let score = 0;
	for (const phrase of rule.strong || []) {
		if (includesPhrase(hay, phrase)) score += 5;
		if (includesPhrase(categories, phrase)) score += 3;
	}
	for (const phrase of rule.keywords || []) {
		if (includesPhrase(hay, phrase)) score += 2;
		if (includesPhrase(categories, phrase)) score += 2;
	}
	for (const phrase of [rule.mainName, ...(rule.mainAliases || []), rule.subName, ...(rule.subAliases || [])]) {
		if (includesPhrase(categories, phrase)) score += 4;
	}
	return score;
}

function detectTaxonomyPath(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		const score = scoreTaxonomyRule(rule, bookMeta);
		if (score > bestScore || (score === bestScore && (rule.priority || 0) > (best?.priority || 0))) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 4) return null;
	return {
		...best,
		confidence: Math.min(0.62 + bestScore * 0.035, 0.96),
		reasoning: `تصنيف موضوعي محلي (${best.mainName} ← ${best.subName} ← ${best.secondaryName})`
	};
}

function fallbackTaxonomyPath() {
	return {
		mainName: 'الثقافة الإسلامية العامة',
		mainAliases: ['كتب إسلامية', 'موضوعات إسلامية عامة', 'الثقافة الإسلامية'],
		subName: 'موضوعات إسلامية عامة',
		subAliases: ['عام', 'متفرقات', 'موضوعات عامة'],
		secondaryName: 'كتب عامة',
		secondaryAliases: ['متفرقات', 'كتب متنوعة'],
		confidence: 0.35,
		reasoning: 'لم تظهر قرينة علمية كافية؛ استعمال مسار عام دون خلطه مع الفقه أو العقيدة أو التاريخ.'
	};
}

function nameVariants(primary, aliases = []) {
	return [primary, ...aliases].map(normalizeArabic).filter(Boolean);
}

function tokenSet(text) {
	return new Set(normalizeArabic(text).split(' ').filter((w) => w.length >= 3));
}

function nameMatchScore(existingName, variants) {
	const current = normalizeArabic(existingName);
	if (!current) return 0;
	let best = 0;
	const currentTokens = tokenSet(current);
	for (const variant of variants) {
		if (!variant) continue;
		if (current === variant) best = Math.max(best, 10);
		else if (current.includes(variant) || variant.includes(current)) best = Math.max(best, 8);
		else {
			const variantTokens = tokenSet(variant);
			const overlap = tokenSetsOverlapRatio(currentTokens, variantTokens);
			if (overlap >= 0.6) best = Math.max(best, 6);
			else if (overlap >= 0.4) best = Math.max(best, 4);
		}
	}
	return best;
}

function findNodeByNames(nodes, primaryName, aliases = []) {
	const variants = nameVariants(primaryName, aliases);
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nameMatchScore(node?.name, variants);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return bestScore >= 6 ? best : null;
}

function resolveTaxonomyDecision(sections, path, method = 'taxonomy') {
	const main = findNodeByNames(sections.tree, path.mainName, path.mainAliases);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: path.mainName,
			newSubName: path.subName,
			newSecondaryName: path.secondaryName,
			confidence: path.confidence,
			reasoning: path.reasoning,
			method
		};
	}

	const sub = findNodeByNames(main.children, path.subName, path.subAliases);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: path.subName,
			newSecondaryName: path.secondaryName,
			confidence: path.confidence,
			reasoning: path.reasoning,
			method
		};
	}

	const secondary = findNodeByNames(
		sub.children,
		path.secondaryName,
		path.secondaryAliases || []
	);
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence: path.confidence,
			reasoning: path.reasoning,
			method
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: path.secondaryName,
		confidence: path.confidence,
		reasoning: path.reasoning,
		method
	};
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = metaHaystack(bookMeta);
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

	let bestMain = null, bestMainScore = 0;
	for (const m of tree) {
		const s = scoreOf(m.name);
		if (s > bestMainScore) { bestMainScore = s; bestMain = m; }
	}
	if (!bestMain) return null;

	let bestSub = null, bestSubScore = 0;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub) return null;

	let bestSec = null, bestSecScore = 0;
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
		method: 'heuristic',
		_scores: { main: bestMainScore, sub: bestSubScore, secondary: bestSecScore }
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

	const taxonomyPath = detectTaxonomyPath(bookMeta);
	if (taxonomyPath) {
		return resolveTaxonomyDecision(sections, taxonomyPath, 'taxonomy');
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug || sug.confidence < 0.58 || sug._scores.main <= 0 || sug._scores.sub <= 0) {
		return resolveTaxonomyDecision(sections, fallbackTaxonomyPath(), 'fallback_taxonomy');
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
			newSecondaryName: 'كتب متنوعة',
			confidence: Math.max(0.45, sug.confidence - 0.12),
			reasoning: `${sug.reasoning} — لم يوجد قسم ثانوي دقيق، سيُنشأ قسم عام تحت الفرع المناسب.`,
			method: 'heuristic'
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
