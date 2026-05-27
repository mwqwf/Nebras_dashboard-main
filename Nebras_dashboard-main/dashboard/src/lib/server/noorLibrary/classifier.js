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

const STOP_WORDS = new Set(
	[
		'كتاب',
		'كتب',
		'في',
		'من',
		'الى',
		'عن',
		'على',
		'هذا',
		'هذه',
		'ذلك',
		'تلك',
		'مع',
		'و',
		'او',
		'pdf',
		'تحميل',
		'قراءة'
	].map(normalizeArabic)
);

function tokenize(text) {
	return normalizeArabic(text)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function haystackFor(bookMeta) {
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

function cleanSectionName(name, fallback = 'كتب عامة') {
	let out = String(name || '')
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/^كتب\s+(?:في|عن)\s+/u, '')
		.replace(/^الكتب\s+/u, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!out) out = fallback;
	return out.slice(0, 80);
}

const TAXONOMY_RULES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		mainKeywords: ['قرآن', 'القران', 'تفسير', 'علوم القرآن', 'تجويد', 'قراءات', 'مصاحف'],
		subRules: [
			{ name: 'التفسير', keywords: ['تفسير', 'المفسرون', 'آيات', 'سور'], secondaryName: 'تفسير القرآن' },
			{ name: 'علوم القرآن', keywords: ['علوم القرآن', 'أسباب النزول', 'ناسخ', 'منسوخ', 'إعجاز'], secondaryName: 'مباحث علوم القرآن' },
			{ name: 'التجويد والقراءات', keywords: ['تجويد', 'قراءات', 'رواية حفص', 'رواية ورش'], secondaryName: 'أحكام التلاوة' }
		],
		fallbackSubName: 'علوم القرآن',
		fallbackSecondaryName: 'دراسات قرآنية'
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		mainKeywords: ['حديث', 'سنة', 'السنن', 'صحيح', 'رواة', 'إسناد', 'جرح', 'تعديل'],
		subRules: [
			{ name: 'متون الحديث', keywords: ['صحيح', 'سنن', 'مسند', 'موطأ', 'أحاديث'], secondaryName: 'كتب الحديث' },
			{ name: 'علوم الحديث', keywords: ['مصطلح الحديث', 'جرح', 'تعديل', 'رواة', 'إسناد', 'علل'], secondaryName: 'مصطلح الحديث' }
		],
		fallbackSubName: 'علوم الحديث',
		fallbackSecondaryName: 'دراسات حديثية'
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		mainKeywords: ['فقه', 'أصول الفقه', 'فتاوى', 'حلال', 'حرام', 'عبادات', 'معاملات', 'أحكام'],
		subRules: [
			{ name: 'العبادات', keywords: ['طهارة', 'صلاة', 'زكاة', 'صيام', 'حج', 'عمرة'], secondaryName: 'فقه العبادات' },
			{ name: 'المعاملات', keywords: ['بيع', 'شراء', 'ربا', 'إجارة', 'نكاح', 'طلاق', 'مواريث'], secondaryName: 'فقه المعاملات' },
			{ name: 'أصول الفقه', keywords: ['أصول الفقه', 'قواعد فقهية', 'اجتهاد', 'قياس', 'إجماع'], secondaryName: 'مباحث أصول الفقه' }
		],
		fallbackSubName: 'فقه عام',
		fallbackSecondaryName: 'مسائل فقهية'
	},
	{
		key: 'aqidah',
		mainName: 'العقيدة',
		mainKeywords: ['عقيدة', 'توحيد', 'إيمان', 'أسماء الله', 'صفات', 'الشرك', 'القدر', 'النبوات'],
		subRules: [
			{ name: 'التوحيد والإيمان', keywords: ['توحيد', 'إيمان', 'أسماء الله', 'صفات', 'شرك'], secondaryName: 'مسائل التوحيد' },
			{ name: 'الفرق والردود', keywords: ['فرق', 'ملل', 'نحل', 'ردود', 'شبهات'], secondaryName: 'الردود العقدية' }
		],
		fallbackSubName: 'العقيدة الإسلامية',
		fallbackSecondaryName: 'مسائل عقدية'
	},
	{
		key: 'sirah_history',
		mainName: 'السيرة والتاريخ',
		mainKeywords: ['سيرة', 'تاريخ', 'تراجم', 'طبقات', 'غزوات', 'خلفاء', 'أعلام'],
		subRules: [
			{ name: 'السيرة النبوية', keywords: ['سيرة نبوية', 'غزوات', 'شمائل', 'النبي'], secondaryName: 'السيرة النبوية' },
			{ name: 'التاريخ الإسلامي', keywords: ['تاريخ', 'خلفاء', 'دولة', 'فتوح'], secondaryName: 'أحداث التاريخ الإسلامي' },
			{ name: 'التراجم والطبقات', keywords: ['تراجم', 'طبقات', 'أعلام', 'رجال'], secondaryName: 'تراجم الأعلام' }
		],
		fallbackSubName: 'التاريخ الإسلامي',
		fallbackSecondaryName: 'دراسات تاريخية'
	},
	{
		key: 'education_adab',
		mainName: 'التربية والتزكية',
		mainKeywords: ['تزكية', 'أخلاق', 'اداب', 'آداب', 'رقائق', 'تربية', 'تعليم', 'علمية', 'نصائح', 'وصايا'],
		subRules: [
			{
				name: 'آداب طلب العلم',
				keywords: ['طلب العلم', 'طالب العلم', 'طلاب العلم', 'تعليمات علمية', 'علمية', 'نصائح', 'وصايا', 'تعلم', 'تعليم', 'العلماء'],
				secondaryName: 'آداب طالب العلم'
			},
			{ name: 'الأخلاق والآداب', keywords: ['أخلاق', 'آداب', 'اداب', 'سلوك', 'تهذيب'], secondaryName: 'مكارم الأخلاق' },
			{ name: 'الرقائق والتزكية', keywords: ['تزكية', 'رقائق', 'زهد', 'قلب', 'موعظة'], secondaryName: 'تزكية النفس' }
		],
		fallbackSubName: 'الأخلاق والآداب',
		fallbackSecondaryName: 'آداب إسلامية'
	},
	{
		key: 'arabic',
		mainName: 'اللغة العربية',
		mainKeywords: ['لغة عربية', 'نحو', 'صرف', 'بلاغة', 'أدب عربي', 'شعر', 'عروض'],
		subRules: [
			{ name: 'النحو والصرف', keywords: ['نحو', 'صرف', 'إعراب'], secondaryName: 'دروس النحو والصرف' },
			{ name: 'البلاغة والأدب', keywords: ['بلاغة', 'أدب', 'شعر', 'عروض'], secondaryName: 'الأدب والبلاغة' }
		],
		fallbackSubName: 'علوم اللغة',
		fallbackSecondaryName: 'دراسات لغوية'
	}
]);

function keywordScore(haystack, keywords) {
	const hayTokens = new Set(tokenize(haystack));
	let score = 0;
	for (const keyword of keywords || []) {
		const k = normalizeArabic(keyword);
		if (!k) continue;
		if (haystack.includes(k)) {
			score += k.includes(' ') ? 6 : 3;
			continue;
		}
		for (const part of tokenize(k)) {
			if (hayTokens.has(part)) score += 1;
		}
	}
	return score;
}

function pickTaxonomyRule(bookMeta) {
	const haystack = haystackFor(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		let score = keywordScore(haystack, rule.mainKeywords);
		for (const subRule of rule.subRules) score += keywordScore(haystack, subRule.keywords);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best && bestScore >= 3 ? { rule: best, score: bestScore } : null;
}

function pickSubRule(rule, bookMeta) {
	const haystack = haystackFor(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const subRule of rule.subRules || []) {
		const score = keywordScore(haystack, subRule.keywords);
		if (score > bestScore) {
			bestScore = score;
			best = subRule;
		}
	}
	return best || {
		name: rule.fallbackSubName,
		keywords: [rule.fallbackSubName],
		secondaryName: rule.fallbackSecondaryName
	};
}

function scoreNode(nodeName, candidates, bookMeta) {
	const node = normalizeArabic(nodeName);
	if (!node) return 0;
	const hay = haystackFor(bookMeta);
	const nodeTokens = new Set(tokenize(node));
	const hayTokens = new Set(tokenize(hay));
	let score = 0;
	for (const candidate of candidates || []) {
		const c = normalizeArabic(candidate);
		if (!c) continue;
		if (node === c) score += 18;
		else if (node.includes(c) || c.includes(node)) score += 12;
		const cTokens = new Set(tokenize(c));
		for (const t of cTokens) if (nodeTokens.has(t)) score += 3;
	}
	if (hay.includes(node) && node.length >= 4) score += 6;
	for (const t of nodeTokens) if (hayTokens.has(t)) score += 1;
	return score;
}

function pickNode(nodes, candidates, bookMeta, minScore = 6) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNode(node.name, candidates, bookMeta);
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
	const haystack = haystackFor(bookMeta);
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
		secondaryId: bestSec && bestSecScore > 0 ? bestSec.id : null,
		confidence: Math.min(0.45 + bestMainScore * 0.08 + bestSubScore * 0.08 + Math.max(bestSecScore, 0) * 0.04, 0.85),
		reasoning: 'heuristic مطابقة محليّة',
		method: 'heuristic',
		scores: { main: bestMainScore, sub: bestSubScore, secondary: Math.max(bestSecScore, 0) }
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

function deriveGeneralSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	const firstHint = hints.map((h) => cleanSectionName(h, '')).find(Boolean);
	if (firstHint) return firstHint;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	const cleanedStem = cleanSectionName(stem, '');
	return cleanedStem || fallback;
}

function buildCreateDecision(kind, patch, confidence, reasoning, method = 'taxonomy') {
	return {
		kind,
		confidence,
		reasoning,
		method,
		...patch
	};
}

function classifyByTaxonomy(sections, bookMeta) {
	const picked = pickTaxonomyRule(bookMeta);
	if (!picked) return null;
	const { rule, score } = picked;
	const subRule = pickSubRule(rule, bookMeta);
	const secondaryName = subRule.secondaryName || rule.fallbackSecondaryName || deriveGeneralSecondaryName(bookMeta);

	const mainCandidates = [rule.mainName, ...(rule.mainKeywords || [])];
	const mainMatch = pickNode(sections.tree, mainCandidates, bookMeta, 5);
	if (!mainMatch) {
		return buildCreateDecision(
			'create_main',
			{
				newMainName: rule.mainName,
				newSubName: subRule.name || rule.fallbackSubName,
				newSecondaryName: secondaryName
			},
			Math.min(0.62 + score * 0.02, 0.9),
			`taxonomy:${rule.key} — لا يوجد قسم رئيسي مناسب`
		);
	}

	const main = mainMatch.node;
	const subCandidates = [subRule.name, ...(subRule.keywords || [])];
	const subMatch = pickNode(main.children || [], subCandidates, bookMeta, 5);
	if (!subMatch) {
		return buildCreateDecision(
			'create_sub',
			{
				mainId: String(main.id),
				newSubName: subRule.name || rule.fallbackSubName,
				newSecondaryName: secondaryName
			},
			Math.min(0.64 + score * 0.02, 0.9),
			`taxonomy:${rule.key} — لا يوجد قسم فرعي مناسب`
		);
	}

	const sub = subMatch.node;
	const reuse = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 6
	});
	if (!reuse) {
		return buildCreateDecision(
			'create_secondary',
			{
				mainId: String(main.id),
				subId: String(sub.id),
				newSecondaryName: secondaryName
			},
			Math.min(0.66 + score * 0.02, 0.92),
			`taxonomy:${rule.key} — لا يوجد قسم ثانوي مناسب`
		);
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(reuse.id),
		confidence: Math.min(0.7 + score * 0.02, 0.94),
		reasoning: `taxonomy:${rule.key} — مطابقة قسم قائم`,
		method: 'taxonomy'
	};
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

	const auto = await classifyAutonomous(sections, bookMeta);
	const sug = auto.kind === 'existing'
		? {
				mainId: auto.mainId,
				subId: auto.subId,
				secondaryId: auto.secondaryId,
				confidence: auto.confidence,
				reasoning: auto.reasoning,
				method: auto.method
			}
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

	const taxonomyDecision = classifyByTaxonomy(sections, bookMeta);
	if (taxonomyDecision) return taxonomyDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const secondaryName = deriveGeneralSecondaryName(bookMeta, 'مصنفات عامة');
		return {
			kind: 'create_main',
			newMainName: 'المعارف العامة',
			newSubName: 'كتب عامة',
			newSecondaryName: secondaryName,
			confidence: 0.35,
			reasoning: 'لا توجد مطابقة موثوقة — إنشاء مسار عام منفصل بدل الخلط مع قسم غير مناسب.',
			method: 'fallback_create'
		};
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const proposed = deriveGeneralSecondaryName(bookMeta, 'كتب عامة');
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: proposed,
			minScore: 7
		});
		if (autoSec) secId = autoSec.id;
		if (!secId) {
			return {
				kind: 'create_secondary',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				newSecondaryName: proposed,
				confidence: Math.max(0.5, sug.confidence - 0.1),
				reasoning: `${sug.reasoning} — إنشاء قسم ثانوي لأنّ المحتوى لا يطابق أيّ قسم ثانوي قائم.`,
				method: sug.method
			};
		}
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
