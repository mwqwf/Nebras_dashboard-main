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

const GENERIC_MAIN_NAME = 'مكتبة نور';
const GENERIC_SUB_NAME = 'كتب عامة';
const GENERIC_SECONDARY_NAME = 'كتب متنوعة';

const TAXONOMY_RULES = Object.freeze([
	{
		id: 'scientific-advice',
		main: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'التربية والتعليم'],
		sub: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم', 'التربية'],
		secondary: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'التعليمات العلمية',
			'نصائح التعليمات العلمية'
		],
		keywords: [
			'النصائح حول التعليمات العلمية للسادة',
			'نصائح التعليمات العلمية',
			'التعليمات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'التربية والتعليم'
		],
		confidence: 0.96
	},
	{
		id: 'fiqh',
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه وأصوله', 'الفقه الإسلامي', 'الفقه'],
		sub: 'الفقه الإسلامي',
		subAliases: ['الفقه الإسلامي', 'فقه العبادات', 'فقه المعاملات', 'الفقه'],
		secondary: 'مسائل فقهية عامة',
		secondaryAliases: ['مسائل فقهية عامة', 'أحكام فقهية', 'الفتاوى والمسائل'],
		keywords: ['فقه', 'فقهي', 'فقهية', 'أصول الفقه', 'فتاوى', 'عبادات', 'معاملات'],
		confidence: 0.9
	},
	{
		id: 'aqeedah',
		main: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة الإسلامية', 'العقيدة', 'التوحيد'],
		sub: 'أصول العقيدة',
		subAliases: ['أصول العقيدة', 'العقيدة', 'التوحيد'],
		secondary: 'مباحث العقيدة',
		secondaryAliases: ['مباحث العقيدة', 'شرح العقيدة', 'كتب العقيدة'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الإيمان', 'اسماء الله', 'صفات الله'],
		confidence: 0.9
	},
	{
		id: 'history',
		main: 'التاريخ والسير',
		mainAliases: ['التاريخ والسير', 'التاريخ الإسلامي', 'التاريخ'],
		sub: 'التاريخ الإسلامي',
		subAliases: ['التاريخ الإسلامي', 'السيرة والتاريخ', 'التاريخ'],
		secondary: 'كتب التاريخ',
		secondaryAliases: ['كتب التاريخ', 'تاريخ إسلامي', 'التراجم والسير'],
		keywords: ['تاريخ', 'التاريخ', 'سيرة', 'السيرة', 'تراجم', 'أعلام', 'طبقات'],
		confidence: 0.88
	},
	{
		id: 'ethics',
		main: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة'],
		sub: 'الأخلاق والآداب',
		subAliases: ['الأخلاق والآداب', 'الآداب الشرعية', 'الأخلاق'],
		secondary: 'آداب عامة',
		secondaryAliases: ['آداب عامة', 'الآداب الإسلامية', 'مكارم الأخلاق'],
		keywords: ['آداب', 'اداب', 'أخلاق', 'اخلاق', 'مواعظ', 'رقائق', 'تزكية'],
		confidence: 0.86
	},
	{
		id: 'literature',
		main: 'اللغة والأدب',
		mainAliases: ['اللغة والأدب', 'الأدب واللغة', 'الأدب العربي'],
		sub: 'الأدب',
		subAliases: ['الأدب', 'الأدب العربي', 'النثر والشعر'],
		secondary: 'كتب الأدب',
		secondaryAliases: ['كتب الأدب', 'النثر', 'الشعر'],
		keywords: ['أدب', 'ادب', 'شعر', 'رواية', 'قصص', 'بلاغة', 'نحو', 'لغة عربية'],
		confidence: 0.84
	}
]);

/**
 * Heuristic fallback — يعطي درجة لمسار كامل لا لقسم منفرد، حتى لا يخلط
 * الفقه بالآداب أو التاريخ بالعقيدة لمجرّد أنّ القسم الرئيسي ظهر أولاً.
 */
function classifyHeuristic({ tree }, bookMeta) {
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
				const score = mainScore * 2 + subScore * 3 + secScore * 4;
				if (!best || score > best.score) {
					best = { main: m, sub, secondary: sec, score, mainScore, subScore, secScore };
				}
			}
		}
	}
	if (!best || best.score < 3) return null;

	return {
		mainId: best.main.id,
		subId: best.sub.id,
		secondaryId: best.secondary ? best.secondary.id : null,
		confidence: Math.min(0.45 + best.score * 0.04, 0.84),
		reasoning: 'heuristic مطابقة محليّة لمسار ثلاثي',
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

function uniqueNames(...groups) {
	const out = [];
	const seen = new Set();
	for (const group of groups) {
		for (const name of Array.isArray(group) ? group : [group]) {
			const raw = String(name || '').trim();
			const n = normalizeArabic(raw);
			if (!raw || seen.has(n)) continue;
			seen.add(n);
			out.push(raw);
		}
	}
	return out;
}

function nameMatchScore(nodeName, wantedNames) {
	const node = normalizeArabic(nodeName);
	if (!node) return 0;
	let best = 0;
	const nodeTokens = new Set(node.split(' ').filter((w) => w.length >= 3));
	for (const wantedName of wantedNames) {
		const wanted = normalizeArabic(wantedName);
		if (!wanted) continue;
		if (node === wanted) best = Math.max(best, 100);
		else if (node.includes(wanted) || wanted.includes(node)) best = Math.max(best, 78);
		else {
			const wantedTokens = new Set(wanted.split(' ').filter((w) => w.length >= 3));
			best = Math.max(best, tokenSetsOverlapRatio(nodeTokens, wantedTokens) * 70);
		}
	}
	return best;
}

function findBestNamedNode(nodes, wantedNames, minScore = 45) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nameMatchScore(node?.name, wantedNames);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? best : null;
}

function haystackForRule(bookMeta) {
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

function scoreRule(rule, bookMeta) {
	const hay = haystackForRule(bookMeta);
	if (!hay) return 0;
	let score = 0;
	for (const keyword of rule.keywords || []) {
		const k = normalizeArabic(keyword);
		if (!k) continue;
		if (hay.includes(k)) score += Math.min(12, 4 + k.split(' ').length * 2);
	}

	// حالة الكتاب المذكور صراحةً: اختلاف "السادة/السادّة" أو نقص حرف لا
	// يجب أن يرميه إلى فقه/تاريخ/عقيدة.
	if (
		rule.id === 'scientific-advice' &&
		hay.includes('النصائح') &&
		(hay.includes('التعليمات العلميه') || hay.includes('التوجيهات العلميه'))
	) {
		score += 24;
	}
	return score;
}

function bestTaxonomyRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= 4 ? { rule: best, score: bestScore } : null;
}

function cleanSectionNameCandidate(name, fallback) {
	const cleaned = String(name || '')
		.replace(/[|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 70);
	return cleaned || fallback;
}

function deriveGenericPath(bookMeta) {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	const firstHint = hints.find((h) => String(h || '').trim().length >= 3);
	const sub = cleanSectionNameCandidate(firstHint, GENERIC_SUB_NAME);
	return {
		id: 'generic',
		main: GENERIC_MAIN_NAME,
		mainAliases: [GENERIC_MAIN_NAME],
		sub,
		subAliases: [sub, GENERIC_SUB_NAME],
		secondary: GENERIC_SECONDARY_NAME,
		secondaryAliases: [GENERIC_SECONDARY_NAME],
		keywords: [],
		confidence: 0.45
	};
}

function resolvePathDecision(sections, rule, bookMeta, extra = {}) {
	const mainNames = uniqueNames(rule.main, rule.mainAliases);
	const subNames = uniqueNames(rule.sub, rule.subAliases);
	const secondaryNames = uniqueNames(rule.secondary, rule.secondaryAliases);
	const main = findBestNamedNode(sections.tree, mainNames, 45);
	const base = {
		confidence: extra.confidence ?? rule.confidence ?? 0.8,
		reasoning: extra.reasoning || `قاعدة تصنيف محليّة: ${rule.id}`,
		method: extra.method || `taxonomy:${rule.id}`
	};

	if (!main) {
		return {
			...base,
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.main,
			newSubName: rule.sub,
			newSecondaryName: rule.secondary
		};
	}

	const sub = findBestNamedNode(main.children, subNames, 45);
	if (!sub) {
		return {
			...base,
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.sub,
			newSecondaryName: rule.secondary
		};
	}

	const secondary = findBestNamedNode(sub.children, secondaryNames, 45);
	if (secondary) {
		return {
			...base,
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id)
		};
	}

	const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: rule.secondary,
		minScore: 8
	});
	if (reusable) {
		return {
			...base,
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reusable.id,
			reasoning: `${base.reasoning} — استعمال قسم ثانوي موجود: ${reusable.name}`
		};
	}

	return {
		...base,
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: rule.secondary
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

	const decision = await classifyAutonomous(sections, bookMeta);
	const sug =
		decision.kind === 'existing'
			? {
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId || null,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method
				}
			: {
					mainId: decision.mainId || '',
					subId: decision.subId || '',
					secondaryId: decision.secondaryId || null,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method,
					create: {
						kind: decision.kind,
						newMainName: decision.newMainName || null,
						newSubName: decision.newSubName || null,
						newSecondaryName: decision.newSecondaryName || null
					}
				};
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

	const ruleMatch = bestTaxonomyRule(bookMeta);
	if (ruleMatch) {
		return resolvePathDecision(sections, ruleMatch.rule, bookMeta, {
			confidence: ruleMatch.rule.confidence,
			reasoning: `تصنيف موضوعي مضبوط (${ruleMatch.rule.id}) — يمنع خلط المجالات المتقاربة`,
			method: `taxonomy:${ruleMatch.rule.id}`
		});
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return resolvePathDecision(sections, deriveGenericPath(bookMeta), bookMeta, {
			confidence: 0.45,
			reasoning: 'لا توجد مطابقة كافية؛ إنشاء/استعمال مسار عام منظّم لمكتبة نور',
			method: 'taxonomy:generic'
		});
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: GENERIC_SECONDARY_NAME,
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
			newSecondaryName: GENERIC_SECONDARY_NAME,
			confidence: Math.max(0.5, sug.confidence - 0.08),
			reasoning: `${sug.reasoning} — إنشاء قسم ثانوي عام لاستكمال الهيكل الثلاثي`,
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
