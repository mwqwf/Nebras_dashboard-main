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

function compactArabic(s) {
	return normalizeArabic(s).replace(/\s+/g, '');
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

function includesAny(haystack, words) {
	return words.some((word) => haystack.includes(normalizeArabic(word)));
}

function includesAnyCompact(haystack, words) {
	const compact = compactArabic(haystack);
	return words.some((word) => compact.includes(compactArabic(word)));
}

const DOMAIN_RULES = Object.freeze([
	{
		id: 'scientific_advice_for_instructions',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'الدعوة', 'التربية'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم والتربية', 'التعليم', 'التربية'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'التعليمات العلمية',
			'نصائح علمية'
		],
		matches: (hay) =>
			(includesAny(hay, ['النصائح', 'نصائح', 'توجيهات']) &&
				includesAny(hay, ['التعليمات العلمية', 'تعليمات علمية', 'علمية', 'تعليم'])) ||
			includesAnyCompact(hay, [
				'النصائح حول التعليمات العلمية للسادة',
				'النصائح حول التعليمات العلمية السادة',
				'النصائح حول التعليمات العلمية السائدة'
			])
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه الإسلامي', 'الفقه', 'فقه وأصوله'],
		subName: 'الفقه وأصوله',
		subAliases: ['الفقه وأصوله', 'أصول الفقه', 'الفقه', 'العبادات', 'المعاملات'],
		secondaryName: 'كتب الفقه',
		secondaryAliases: ['كتب الفقه', 'فقه عام', 'مسائل فقهية'],
		matches: (hay) =>
			includesAny(hay, [
				'فقه',
				'فقهي',
				'أحكام',
				'احكام',
				'فتاوى',
				'فتاوي',
				'عبادات',
				'معاملات',
				'طهارة',
				'صلاة',
				'زكاة',
				'صيام',
				'حج'
			])
	},
	{
		id: 'aqida',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'العقيدة', 'التوحيد', 'الإيمان'],
		secondaryName: 'كتب العقيدة',
		secondaryAliases: ['كتب العقيدة', 'التوحيد', 'الإيمان'],
		matches: (hay) =>
			includesAny(hay, ['عقيدة', 'عقيده', 'توحيد', 'إيمان', 'ايمان', 'أسماء وصفات', 'اسماء وصفات'])
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ', 'السير والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'التاريخ', 'السيرة', 'السير', 'التراجم'],
		secondaryName: 'كتب التاريخ والسير',
		secondaryAliases: ['كتب التاريخ والسير', 'كتب التاريخ', 'السير والتراجم'],
		matches: (hay) =>
			includesAny(hay, ['تاريخ', 'سيرة', 'سيره', 'تراجم', 'طبقات', 'غزوات', 'فتوح'])
	},
	{
		id: 'literature',
		mainName: 'اللغة والأدب',
		mainAliases: ['اللغة والأدب', 'الأدب واللغة', 'اللغة العربية', 'الأدب'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الأدب', 'البلاغة', 'النحو', 'الصرف'],
		secondaryName: 'كتب الأدب واللغة',
		secondaryAliases: ['كتب الأدب واللغة', 'كتب الأدب', 'اللغة العربية'],
		matches: (hay) =>
			includesAny(hay, ['أدب', 'ادب', 'شعر', 'بلاغة', 'بلاغه', 'نحو', 'صرف', 'لغة عربية', 'لغه عربيه'])
	},
	{
		id: 'education',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'التربية', 'الدعوة'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم والتربية', 'التربية', 'التعليم'],
		secondaryName: 'كتب التربية والتعليم',
		secondaryAliases: ['كتب التربية والتعليم', 'التربية والتعليم', 'مناهج التعليم'],
		matches: (hay) =>
			includesAny(hay, ['تربية', 'تربيه', 'تعليم', 'تعلم', 'مناهج', 'طلاب', 'معلم', 'معلمين'])
	}
]);

function normalizedAliasSet(names) {
	return new Set((names || []).map(normalizeArabic).filter(Boolean));
}

function nameMatchesAliases(name, aliases) {
	const n = normalizeArabic(name);
	if (!n) return false;
	const set = normalizedAliasSet(aliases);
	if (set.has(n)) return true;
	for (const alias of set) {
		if (alias.length >= 4 && (n.includes(alias) || alias.includes(n))) return true;
	}
	return false;
}

function findMainByAliases(tree, aliases) {
	return (tree || []).find((main) => nameMatchesAliases(main.name, aliases)) || null;
}

function findSubByAliases(main, aliases) {
	return (main?.children || []).find((sub) => nameMatchesAliases(sub.name, aliases)) || null;
}

function findSecondaryByAliases(sub, aliases) {
	return (sub?.children || []).find((sec) => nameMatchesAliases(sec.name, aliases)) || null;
}

function resolveRuleDecision(sections, rule) {
	const mainAliases = [rule.mainName, ...(rule.mainAliases || [])];
	const subAliases = [rule.subName, ...(rule.subAliases || [])];
	const secondaryAliases = [rule.secondaryName, ...(rule.secondaryAliases || [])];

	const main = findMainByAliases(sections.tree, mainAliases);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.94,
			reasoning: `قاعدة نطاقية (${rule.id}) — إنشاء المسار الثلاثي الكامل.`,
			method: 'domain-rule'
		};
	}

	const sub = findSubByAliases(main, subAliases);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: 0.93,
			reasoning: `قاعدة نطاقية (${rule.id}) — إنشاء القسم الفرعي والثانوي تحت القسم الرئيسي المناسب.`,
			method: 'domain-rule'
		};
	}

	const secondary = findSecondaryByAliases(sub, secondaryAliases);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			newSecondaryName: rule.secondaryName,
			confidence: 0.92,
			reasoning: `قاعدة نطاقية (${rule.id}) — إنشاء قسم ثانوي مناسب بدل خلط المحتوى.`,
			method: 'domain-rule'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: 0.95,
		reasoning: `قاعدة نطاقية (${rule.id}) — استعمال المسار الموجود.`,
		method: 'domain-rule'
	};
}

function pickDomainRule(bookMeta) {
	const hay = bookHaystack(bookMeta);
	if (!hay) return null;
	return DOMAIN_RULES.find((rule) => rule.matches(hay)) || null;
}

function fallbackSecondaryName(bookMeta) {
	const hints = (bookMeta?.categoryHints || [])
		.map((h) => String(h || '').trim())
		.filter(Boolean);
	const lastHint = hints[hints.length - 1] || hints[0] || '';
	if (lastHint && lastHint.length <= 80) return lastHint;
	return 'كتب عامة';
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
	if (bestSecScore <= 0) bestSec = null;

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

	const domainRule = pickDomainRule(bookMeta);
	if (domainRule) {
		return resolveRuleDecision(sections, domainRule);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName: 'كتب عامة',
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — إنشاء مسار ثلاثي مستقل لمكتبة نور.',
			method: 'heuristic'
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
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: Math.max(sug.confidence, 0.55),
			reasoning: `${sug.reasoning} — لا يوجد قسم ثانوي مناسب، لذلك سينشأ مستوى ثالث قبل إضافة المحتوى.`,
			method: sug.method
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
