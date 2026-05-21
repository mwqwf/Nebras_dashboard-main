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
	if (bestMainScore <= 0) return null;

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
		secondaryId: bestSec && bestSecScore > 0 ? bestSec.id : null,
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

const SEMANTIC_RULES = Object.freeze([
	{
		key: 'scientific_advice_education',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'التربية', 'الدعوة'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم', 'التربية العلمية', 'طلب العلم'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'نصائح طلب العلم',
			'آداب طالب العلم',
			'التوجيهات العلمية'
		],
		include: [
			'نصيحه',
			'نصائح',
			'توجيه',
			'توجيهات',
			'تعليمات',
			'علميه',
			'طلب العلم',
			'طالب العلم',
			'التعليم',
			'تربيه'
		],
		exclude: ['فقه', 'عقيده', 'تاريخ', 'سيره', 'ادب عربي', 'شعر']
	},
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه الإسلامي', 'الفقه', 'فقه وأصوله', 'الفقه وأصوله'],
		subName: 'الفقه العام',
		subAliases: ['الفقه العام', 'مسائل فقهية', 'أحكام فقهية', 'العبادات', 'المعاملات'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'أحكام فقهية'],
		include: ['فقه', 'فقهي', 'احكام', 'عبادات', 'معاملات', 'طهاره', 'صلاه', 'زكاه'],
		exclude: ['تاريخ', 'عقيده', 'ادب', 'شعر']
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد والعقيدة', 'التوحيد'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان', 'أصول الاعتقاد'],
		secondaryName: 'مسائل العقيدة',
		secondaryAliases: ['مسائل العقيدة', 'أصول الاعتقاد', 'التوحيد'],
		include: ['عقيده', 'توحيد', 'ايمان', 'اعتقاد', 'اسماء الله', 'صفات الله'],
		exclude: ['فقه', 'تاريخ', 'ادب', 'شعر']
	},
	{
		key: 'history',
		mainName: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ الإسلامي', 'السيرة والتاريخ', 'التاريخ'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'السيرة النبوية', 'التراجم', 'الطبقات'],
		secondaryName: 'دراسات تاريخية',
		secondaryAliases: ['دراسات تاريخية', 'التاريخ الإسلامي', 'السيرة النبوية'],
		include: ['تاريخ', 'سيره', 'تراجم', 'طبقات', 'فتوح', 'خلافه', 'دوله'],
		exclude: ['فقه', 'عقيده', 'ادب', 'شعر']
	},
	{
		key: 'arabic_literature',
		mainName: 'الأدب واللغة',
		mainAliases: ['الأدب واللغة', 'اللغة العربية', 'الأدب العربي', 'الآداب'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الشعر', 'النثر', 'البلاغة'],
		secondaryName: 'كتب الأدب',
		secondaryAliases: ['كتب الأدب', 'الأدب العربي', 'الشعر والنثر'],
		include: ['ادب', 'اداب', 'شعر', 'نثر', 'بلاغه', 'لغه عربيه'],
		exclude: ['فقه', 'عقيده', 'تاريخ']
	}
]);

function phraseScore(haystack, phrases = []) {
	let score = 0;
	for (const phrase of phrases) {
		const n = normalizeArabic(phrase);
		if (!n) continue;
		if (haystack.includes(n)) score += n.includes(' ') ? 3 : 2;
	}
	return score;
}

function pickSemanticRule(bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of SEMANTIC_RULES) {
		const positives = phraseScore(haystack, rule.include);
		const negatives = phraseScore(haystack, rule.exclude);
		const score = positives - negatives * 2;
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 2) return null;
	return { rule: best, score: bestScore };
}

function findMainByAliases(tree, aliases = []) {
	const normalized = aliases.map(normalizeArabic).filter(Boolean);
	for (const main of tree || []) {
		const name = normalizeArabic(main?.name || '');
		if (!name) continue;
		if (normalized.some((a) => name === a || name.includes(a) || a.includes(name))) {
			return main;
		}
	}
	return null;
}

function findSubByAliases(main, aliases = []) {
	const normalized = aliases.map(normalizeArabic).filter(Boolean);
	for (const sub of main?.children || []) {
		const name = normalizeArabic(sub?.name || '');
		if (!name) continue;
		if (normalized.some((a) => name === a || name.includes(a) || a.includes(name))) {
			return sub;
		}
	}
	return null;
}

function findSecondaryByAliases(sub, aliases = []) {
	const normalized = aliases.map(normalizeArabic).filter(Boolean);
	for (const sec of sub?.children || []) {
		const name = normalizeArabic(sec?.name || '');
		if (!name) continue;
		if (normalized.some((a) => name === a || name.includes(a) || a.includes(name))) {
			return sec;
		}
	}
	return null;
}

function cleanSectionNameFromTitle(title) {
	const stem = seriesStemFromTitle(title);
	const raw = stem || title || 'موضوعات عامة';
	return String(raw).trim().replace(/\s+/g, ' ').slice(0, 80) || 'موضوعات عامة';
}

function buildDecisionFromRule(sections, ruleMatch, bookMeta) {
	if (!ruleMatch) return null;
	const { rule, score } = ruleMatch;
	const main = findMainByAliases(sections.tree, rule.mainAliases);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: Math.min(0.72 + score * 0.03, 0.94),
			reasoning: `تصنيف دلالي (${rule.key}) — إنشاء المسار الكامل لأنه غير موجود.`,
			method: 'semantic_rules'
		};
	}

	const sub = findSubByAliases(main, rule.subAliases);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence: Math.min(0.74 + score * 0.03, 0.95),
			reasoning: `تصنيف دلالي (${rule.key}) — إنشاء قسم فرعي وثانوي مناسبين.`,
			method: 'semantic_rules'
		};
	}

	const secondary =
		findSecondaryByAliases(sub, rule.secondaryAliases) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: rule.secondaryName,
			minScore: 7
		});
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence: Math.min(0.76 + score * 0.03, 0.96),
			reasoning: `تصنيف دلالي (${rule.key}) — إنشاء قسم ثانوي مخصّص.`,
			method: 'semantic_rules'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secondary.id),
		confidence: Math.min(0.8 + score * 0.03, 0.98),
		reasoning: `تصنيف دلالي (${rule.key}) — استعمال مسار موجود دون خلط المجالات.`,
		method: 'semantic_rules'
	};
}

function buildStrictFallbackDecision(sections, bookMeta, sug) {
	if (!sug) return null;
	const mainId = String(sug.mainId || '');
	const subId = String(sug.subId || '');
	if (!mainId || !subId) return null;
	const main = sections.index.mainsById[mainId];
	const sub = sections.index.subsById[subId];
	if (!main || !sub) return null;

	const proposedSecondaryName = cleanSectionNameFromTitle(bookMeta?.title);
	const reused =
		sug.secondaryId
			? { id: String(sug.secondaryId), name: sections.index.secondariesById[String(sug.secondaryId)]?.name }
			: pickReuseSecondary(sections, subId, bookMeta, {
					proposedNewName: proposedSecondaryName,
					minScore: 8
				});
	if (reused?.id) {
		return {
			kind: 'existing',
			mainId,
			subId,
			secondaryId: String(reused.id),
			confidence: sug.confidence,
			reasoning: `${sug.reasoning} — تثبيت قسم ثانوي موجود ضمن المسار الثلاثي.`,
			method: sug.method || 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId,
		subId,
		secondaryId: null,
		newSecondaryName: proposedSecondaryName,
		confidence: Math.min(Number(sug.confidence || 0.4), 0.72),
		reasoning: `${sug.reasoning} — لم يوجد قسم ثانوي دقيق، فسيُنشأ باسم موضوع الكتاب.`,
		method: sug.method || 'heuristic'
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

	const semantic = buildDecisionFromRule(sections, pickSemanticRule(bookMeta), bookMeta);
	const sug = semantic || buildStrictFallbackDecision(sections, bookMeta, classifyHeuristic(sections, bookMeta));
	const suggested = sug
		? {
				mainId: sug.mainId,
				subId: sug.subId,
				secondaryId: sug.secondaryId || null,
				confidence: sug.confidence,
				reasoning: sug.reasoning,
				method: sug.method,
				kind: sug.kind,
				newMainName: sug.newMainName || null,
				newSubName: sug.newSubName || null,
				newSecondaryName: sug.newSecondaryName || null
			}
		: {
				mainId: sections.tree[0].id,
				subId: sections.tree[0].children[0]?.id || '',
				secondaryId: null,
				confidence: 0.1,
				reasoning: 'لم تُعثَر مطابقة. سيُنشأ قسم ثانوي باسم موضوع الكتاب عند التشغيل الآلي.',
				method: 'fallback',
				kind: sections.tree[0].children[0]?.id ? 'create_secondary' : 'create_sub',
				newMainName: null,
				newSubName: sections.tree[0].children[0]?.id ? null : 'موضوعات عامة',
				newSecondaryName: cleanSectionNameFromTitle(bookMeta?.title)
			};
	const validation = suggested.mainId && suggested.subId
		? validateHierarchyPath(
				{ mainId: suggested.mainId, subId: suggested.subId, secondaryId: suggested.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'path_will_be_created' };
	return {
		suggested,
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

	const semanticDecision = buildDecisionFromRule(sections, pickSemanticRule(bookMeta), bookMeta);
	if (semanticDecision) return semanticDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	const strict = buildStrictFallbackDecision(sections, bookMeta, sug);
	if (strict) return strict;

	const firstMain = sections.tree[0];
	const firstSub = firstMain?.children?.[0] || null;
	if (!firstSub) {
		return {
			kind: 'create_sub',
			mainId: String(firstMain.id),
			subId: null,
			secondaryId: null,
			confidence: 0.1,
			newSubName: 'موضوعات عامة',
			newSecondaryName: cleanSectionNameFromTitle(bookMeta?.title),
			reasoning: 'لم تعطِ قواعد التصنيف نتيجة كافية — إنشاء فرعي/ثانوي عام مع منع إسقاط المحتوى مباشرة تحت مستوى أعلى.',
			method: 'fallback'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(firstMain.id),
		subId: String(firstSub.id),
		secondaryId: null,
		newSecondaryName: cleanSectionNameFromTitle(bookMeta?.title),
		confidence: 0.1,
		reasoning: 'لم تعطِ قواعد التصنيف نتيجة كافية — إنشاء قسم ثانوي باسم موضوع الكتاب بدلاً من خلطه مع قسم قائم.',
		method: 'fallback'
	};
}
