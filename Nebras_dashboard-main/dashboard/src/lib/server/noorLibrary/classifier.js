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

function includesAny(haystack, terms) {
	return (terms || []).some((term) => {
		const n = normalizeArabic(term);
		return n && haystack.includes(n);
	});
}

function matchesEveryGroup(haystack, groups) {
	return (groups || []).every((group) => includesAny(haystack, group));
}

const SEMANTIC_PATH_RULES = Object.freeze([
	{
		id: 'education_advice',
		mainName: 'الدعوة والتربية',
		mainAliases: ['الدعوة والتربية', 'التربية والدعوة', 'الدعوة', 'التربية'],
		subName: 'التربية والتعليم',
		subAliases: ['التربية والتعليم', 'التعليم', 'التربية', 'طلب العلم'],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح والتوجيهات العلمية',
			'النصائح العلمية',
			'التوجيهات العلمية',
			'آداب طلب العلم',
			'تعليمات علمية'
		],
		includeAll: [
			['نصائح', 'نصيحة', 'توجيهات', 'توجيه', 'تعليمات'],
			['تعليم', 'علمية', 'العلم', 'طلب العلم', 'التربية']
		],
		reasoning:
			'مطابقة دلالية: نصائح/توجيهات تعليمية تُصنّف ضمن التربية والتعليم لا ضمن الآداب أو الفقه.'
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه الإسلامي', 'الفقه', 'الفقه وأصوله'],
		subName: 'الفقه وأصوله',
		subAliases: ['الفقه وأصوله', 'أصول الفقه', 'العبادات', 'المعاملات'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['مسائل فقهية', 'كتب الفقه', 'الفقه'],
		includeAny: ['فقه', 'أصول الفقه', 'العبادات', 'المعاملات', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج'],
		reasoning: 'مطابقة دلالية: مادة فقهية، فلا تُخلط مع العقيدة أو التاريخ أو الآداب.'
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة الإسلامية',
		mainAliases: ['العقيدة الإسلامية', 'العقيدة', 'التوحيد'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['العقيدة والتوحيد', 'العقيدة', 'التوحيد'],
		secondaryName: 'كتب العقيدة',
		secondaryAliases: ['كتب العقيدة', 'شرح العقيدة', 'التوحيد'],
		includeAny: ['عقيدة', 'التوحيد', 'الإيمان', 'الاسماء والصفات', 'أسماء وصفات'],
		reasoning: 'مطابقة دلالية: مادة عقدية، فلا تُخلط مع الفقه أو التاريخ.'
	},
	{
		id: 'history',
		mainName: 'التاريخ الإسلامي',
		mainAliases: ['التاريخ الإسلامي', 'التاريخ', 'السير والتاريخ'],
		subName: 'التاريخ والسير',
		subAliases: ['التاريخ والسير', 'السيرة', 'السير', 'التاريخ'],
		secondaryName: 'كتب التاريخ',
		secondaryAliases: ['كتب التاريخ', 'التاريخ الإسلامي', 'السير'],
		includeAny: ['تاريخ', 'السيرة', 'سيرة', 'تراجم', 'الطبقات', 'الفتوح', 'الخلافة'],
		reasoning: 'مطابقة دلالية: مادة تاريخية، فلا تُخلط مع العقيدة أو الفقه.'
	},
	{
		id: 'adab',
		mainName: 'اللغة والأدب',
		mainAliases: ['اللغة والأدب', 'الأدب واللغة العربية', 'الأدب العربي', 'اللغة العربية'],
		subName: 'الأدب العربي',
		subAliases: ['الأدب العربي', 'الأدب', 'الشعر', 'النثر'],
		secondaryName: 'كتب الأدب',
		secondaryAliases: ['كتب الأدب', 'الأدب العربي', 'الآداب'],
		includeAny: ['أدب عربي', 'الأدب العربي', 'شعر', 'نثر', 'بلاغة', 'لغة عربية', 'نحو', 'صرف'],
		reasoning: 'مطابقة دلالية: مادة أدبية/لغوية، فلا تُخلط مع الفقه أو العقيدة.'
	}
]);

function semanticRuleFor(bookMeta) {
	const hay = haystackForReuse(bookMeta);
	for (const rule of SEMANTIC_PATH_RULES) {
		if (rule.includeAll && matchesEveryGroup(hay, rule.includeAll)) return rule;
		if (rule.includeAny && includesAny(hay, rule.includeAny)) return rule;
	}
	return null;
}

function tokenSet(s) {
	return new Set(normalizeArabic(s).split(' ').filter((w) => w.length >= 3));
}

function scoreAliasMatch(name, aliases) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let best = 0;
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) best = Math.max(best, 100);
		else if (n.includes(a) || a.includes(n)) best = Math.max(best, 75);
		else {
			const r = tokenSetsOverlapRatio(tokenSet(n), tokenSet(a));
			if (r >= 0.5) best = Math.max(best, 55);
			else if (r >= 0.34) best = Math.max(best, 35);
		}
	}
	return best;
}

function pickNodeByAliases(nodes, aliases) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreAliasMatch(node?.name || '', aliases);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return bestScore >= 35 ? best : null;
}

function cleanSectionName(raw, fallback) {
	let s = String(raw || '').trim();
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (!s) s = fallback;
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s || fallback;
}

function fallbackSecondaryName(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	return cleanSectionName(stem, 'كتب عامة');
}

function fallbackPath(bookMeta) {
	const secondaryName = fallbackSecondaryName(bookMeta);
	return {
		id: 'general',
		mainName: 'المكتبة الإسلامية',
		mainAliases: ['المكتبة الإسلامية', 'المكتبة', 'كتب إسلامية'],
		subName: 'كتب متفرقة',
		subAliases: ['كتب متفرقة', 'متفرقات', 'كتب عامة'],
		secondaryName,
		secondaryAliases: [secondaryName, 'كتب عامة'],
		reasoning: 'لم تظهر دلالة كافية لقسم قائم، فاقترح المحرّك مساراً عاماً كاملاً.'
	};
}

function resolvePathDecision(sections, bookMeta, path, confidence = 0.92) {
	const tree = sections.tree || [];
	const main = pickNodeByAliases(tree, [path.mainName, ...(path.mainAliases || [])]);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: path.mainName,
			newSubName: path.subName,
			newSecondaryName: path.secondaryName,
			confidence,
			reasoning: path.reasoning,
			method: 'semantic'
		};
	}

	const sub = pickNodeByAliases(main.children || [], [path.subName, ...(path.subAliases || [])]);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: path.subName,
			newSecondaryName: path.secondaryName,
			confidence,
			reasoning: path.reasoning,
			method: 'semantic'
		};
	}

	const secondary =
		pickNodeByAliases(sub.children || [], [
			path.secondaryName,
			...(path.secondaryAliases || [])
		]) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: path.secondaryName,
			minScore: 9
		});
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence,
			reasoning: path.reasoning,
			method: 'semantic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: path.secondaryName,
		confidence,
		reasoning: path.reasoning,
		method: 'semantic'
	};
}

function scoreExistingName(name, haystack, tokens) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	return score;
}

function pickBestScored(nodes, haystack, tokens) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreExistingName(node?.name || '', haystack, tokens);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return { node: best, score: bestScore };
}

function classifyStrictHeuristic(sections, bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = tokenSet(haystack);
	const tree = sections.tree || [];
	const proposed = fallbackPath(bookMeta);

	const bestMain = pickBestScored(tree, haystack, tokens);
	if (!bestMain.node || bestMain.score < 2) {
		return resolvePathDecision(sections, bookMeta, proposed, 0.48);
	}

	const bestSub = pickBestScored(bestMain.node.children || [], haystack, tokens);
	if (!bestSub.node || bestSub.score < 2) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.node.id),
			subId: null,
			secondaryId: null,
			newSubName: cleanSectionName(bookMeta?.categoryHints?.[0], proposed.subName),
			newSecondaryName: proposed.secondaryName,
			confidence: 0.58,
			reasoning: 'وُجد قسم رئيسي مناسب، ولم يوجد قسم فرعي كافٍ؛ سيتم إنشاء فرعي وثانوي كاملين.',
			method: 'heuristic'
		};
	}

	const bestSecondary = pickBestScored(bestSub.node.children || [], haystack, tokens);
	if (bestSecondary.node && bestSecondary.score >= 2) {
		return {
			kind: 'existing',
			mainId: String(bestMain.node.id),
			subId: String(bestSub.node.id),
			secondaryId: String(bestSecondary.node.id),
			confidence: Math.min(0.55 + (bestMain.score + bestSub.score + bestSecondary.score) * 0.04, 0.86),
			reasoning: 'heuristic مطابقة محليّة مع مسار ثلاثي كامل.',
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(bestMain.node.id),
		subId: String(bestSub.node.id),
		secondaryId: null,
		newSecondaryName: proposed.secondaryName,
		confidence: 0.62,
		reasoning: 'وُجد main/sub مناسب، ولم يوجد قسم ثانوي دقيق؛ سيتم إنشاء ثانوي تحت الفرعي.',
		method: 'heuristic'
	};
}


/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = await classifyAutonomous(sections, bookMeta);
	const sug = {
		mainId: decision.mainId || '',
		subId: decision.subId || '',
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		kind: decision.kind
	};
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId },
					sections.index,
					{ requireSecondary: true }
				)
			: { valid: false, reason: `${decision.kind}_required` };
	return {
		suggested: sug,
		alternatives: [],
		validation,
		createPlan:
			decision.kind === 'existing'
				? null
				: {
						kind: decision.kind,
						mainName: decision.newMainName || null,
						subName: decision.newSubName || null,
						secondaryName: decision.newSecondaryName || null
					}
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const semantic = semanticRuleFor(bookMeta);
	if (semantic) {
		return resolvePathDecision(sections, bookMeta, semantic, 0.92);
	}

	return classifyStrictHeuristic(sections, bookMeta);
}
