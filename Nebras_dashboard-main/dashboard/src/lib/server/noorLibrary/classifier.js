/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبية [main → sub → secondary].
 *
 * التصنيف محلي بالكامل، لكنه صار واعياً بالمجالات الشرعية حتى لا يخلط
 * الفقه بالأدب، أو التاريخ بالعقيدة، أو آداب طلب العلم بالأدب اللغوي.
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

const DOMAIN_RULES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'علوم القرآن',
		keywords: [
			'قرآن',
			'القرآن',
			'تفسير',
			'علوم القرآن',
			'تجويد',
			'قراءات',
			'مصحف',
			'سور',
			'آيات'
		]
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		secondaryName: 'علوم الحديث',
		keywords: [
			'حديث',
			'الأحاديث',
			'السنة',
			'سنن',
			'صحيح',
			'مسند',
			'مصطلح الحديث',
			'جرح وتعديل',
			'رواة'
		]
	},
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية',
		keywords: [
			'فقه',
			'أصول الفقه',
			'فتاوى',
			'عبادات',
			'معاملات',
			'طهارة',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'نكاح',
			'طلاق',
			'مواريث',
			'قضاء'
		]
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'مسائل العقيدة',
		keywords: [
			'عقيدة',
			'توحيد',
			'إيمان',
			'الأسماء والصفات',
			'الفرق',
			'الملل والنحل',
			'الرد على',
			'شبهات',
			'سلفية'
		]
	},
	{
		key: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'شمائل وسير',
		keywords: [
			'سيرة',
			'السيرة النبوية',
			'شمائل',
			'مغازي',
			'غزوات',
			'النبي',
			'الرسول',
			'صحابة',
			'الخلفاء الراشدون'
		]
	},
	{
		key: 'history',
		mainName: 'التاريخ الإسلامي',
		subName: 'التاريخ والتراجم',
		secondaryName: 'تراجم وأحداث',
		keywords: [
			'تاريخ',
			'تراجم',
			'طبقات',
			'سير أعلام',
			'دولة',
			'خلافة',
			'أندلس',
			'فتوحات',
			'وقائع'
		]
	},
	{
		key: 'adab_education',
		mainName: 'التربية والآداب الشرعية',
		subName: 'آداب طلب العلم والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		keywords: [
			'آداب طلب العلم',
			'اداب طلب العلم',
			'طلب العلم',
			'طالب العلم',
			'التعليمات العلمية',
			'تعليمات علمية',
			'النصائح العلمية',
			'نصائح علمية',
			'التربية',
			'تهذيب',
			'تزكية',
			'أخلاق',
			'اخلاق',
			'آداب',
			'اداب',
			'رقائق',
			'مواعظ',
			'نصائح',
			'سلوك',
			'تعليم',
			'تعلم',
			'المعلم',
			'المتعلم'
		],
		negativeKeywords: ['شعر', 'رواية', 'قصة', 'نحو', 'بلاغة', 'صرف']
	},
	{
		key: 'arabic_literature',
		mainName: 'اللغة العربية وآدابها',
		subName: 'الأدب العربي',
		secondaryName: 'النصوص والبلاغة',
		keywords: [
			'لغة عربية',
			'اللغة العربية',
			'نحو',
			'صرف',
			'بلاغة',
			'معاجم',
			'قاموس',
			'شعر',
			'أدب عربي',
			'ادب عربي',
			'نثر',
			'رواية',
			'قصة'
		]
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والإرشاد',
		subName: 'الدعوة والخطب',
		secondaryName: 'مواد دعوية',
		keywords: ['دعوة', 'دعاة', 'خطب', 'خطبة', 'إرشاد', 'وعظ', 'منبر', 'مطويات']
	}
]);

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

function scoreKeywordList(haystack, tokens, keywords = []) {
	let score = 0;
	for (const kw of keywords) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (n.length >= 4 && haystack.includes(n)) {
			score += n.includes(' ') ? 7 : 4;
			continue;
		}
		const kwTokens = n.split(' ').filter((w) => w.length >= 3);
		for (const w of kwTokens) {
			if (tokens.has(w)) score += 1;
		}
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

function pickDomain(bookMeta) {
	const haystack = buildHaystack(bookMeta);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		let score = scoreKeywordList(haystack, tokens, [
			rule.mainName,
			rule.subName,
			rule.secondaryName,
			...(rule.keywords || [])
		]);
		score -= scoreKeywordList(haystack, tokens, rule.negativeKeywords || []) * 0.75;
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 2) return null;
	return { ...best, score: bestScore };
}

function scoreSectionName(name, haystack, tokens, domain = null) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 4;
	if (domain) {
		const domainNames = [
			domain.mainName,
			domain.subName,
			domain.secondaryName,
			...(domain.keywords || [])
		];
		score += scoreKeywordList(n, tokensOf(n), domainNames) * 1.5;
		const domainTokens = tokensOf(domainNames.join(' '));
		const sectionTokens = tokensOf(name);
		score += tokenSetsOverlapRatio(domainTokens, sectionTokens) * 8;
	}
	return score;
}

function bestChildScore(children, haystack, tokens, domain) {
	let best = 0;
	for (const child of children || []) {
		const own = scoreSectionName(child.name, haystack, tokens, domain);
		const nested = bestChildScore(child.children || [], haystack, tokens, domain) * 0.5;
		best = Math.max(best, own + nested);
	}
	return best;
}

function pickBestMain(sections, haystack, tokens, domain) {
	let best = null;
	let bestScore = 0;
	for (const main of sections.tree || []) {
		const score =
			scoreSectionName(main.name, haystack, tokens, domain) +
			bestChildScore(main.children || [], haystack, tokens, domain) * 0.7;
		if (score > bestScore) {
			bestScore = score;
			best = main;
		}
	}
	return { node: best, score: bestScore };
}

function pickBestSub(main, haystack, tokens, domain) {
	let best = null;
	let bestScore = 0;
	for (const sub of main?.children || []) {
		const score =
			scoreSectionName(sub.name, haystack, tokens, domain) +
			bestChildScore(sub.children || [], haystack, tokens, domain) * 0.6;
		if (score > bestScore) {
			bestScore = score;
			best = sub;
		}
	}
	return { node: best, score: bestScore };
}

function pickBestSecondary(sub, haystack, tokens, domain) {
	let best = null;
	let bestScore = 0;
	for (const sec of sub?.children || []) {
		const score = scoreSectionName(sec.name, haystack, tokens, domain);
		if (score > bestScore) {
			bestScore = score;
			best = sec;
		}
	}
	return { node: best, score: bestScore };
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

function readableStemFromTitle(title) {
	let raw = String(title || '').trim();
	raw = raw.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	raw = raw.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanHintName(name) {
	let n = String(name || '').trim();
	n = n
		.replace(/^كتب\s+(?:في|عن)\s+/u, '')
		.replace(/^كتاب\s+(?:في|عن)\s+/u, '')
		.replace(/\s*[-|]\s*مكتبة\s+نور.*$/u, '')
		.trim();
	return n.slice(0, 80);
}

function pickBestHintName(bookMeta, domain, fallback) {
	for (const hint of bookMeta?.categoryHints || []) {
		const cleaned = cleanHintName(hint);
		if (cleaned && cleaned.length >= 3 && cleaned.length <= 60) return cleaned;
	}
	if (domain?.secondaryName) return domain.secondaryName;
	const stem = readableStemFromTitle(bookMeta?.title || '');
	return stem && stem.length >= 4 ? stem : fallback;
}

function makeDecisionBase(domain, confidence, reasoning) {
	return {
		confidence,
		reasoning,
		method: 'heuristic',
		domain: domain?.key || 'generic'
	};
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

	const decision = await classifyAutonomous(sections, bookMeta);
	const sug = decision.kind === 'existing' || decision.kind === 'create_secondary'
		? {
				mainId: decision.mainId,
				subId: decision.subId,
				secondaryId: decision.secondaryId || null,
				confidence: decision.confidence,
				reasoning: decision.reasoning,
				method: decision.method
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

	const haystack = buildHaystack(bookMeta);
	const tokens = tokensOf(haystack);
	const domain = pickDomain(bookMeta);
	const mainPick = pickBestMain(sections, haystack, tokens, domain);
	const mainThreshold = domain ? 3 : 4;
	const subThreshold = domain ? 3 : 4;
	const secondaryThreshold = domain ? 3 : 4;
	const fallbackMainName = domain?.mainName || 'المكتبة الإسلامية';
	const fallbackSubName = domain?.subName || pickBestHintName(bookMeta, domain, 'كتب متنوعة');
	const fallbackSecondaryName =
		domain?.secondaryName || pickBestHintName(bookMeta, domain, 'كتب عامة');

	if (!mainPick.node || mainPick.score < mainThreshold) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: fallbackMainName,
			newSubName: fallbackSubName,
			newSecondaryName: fallbackSecondaryName,
			...makeDecisionBase(
				domain,
				domain ? 0.42 : 0.28,
				`لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار ثلاثي جديد لـ "${fallbackMainName}".`
			)
		};
	}

	const main = mainPick.node;
	const subPick = pickBestSub(main, haystack, tokens, domain);
	if (!subPick.node || subPick.score < subThreshold) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: fallbackSubName,
			newSecondaryName: fallbackSecondaryName,
			...makeDecisionBase(
				domain,
				Math.min(0.5 + mainPick.score * 0.03, 0.78),
				`وُجد القسم الرئيسي "${main.name}" ولم يوجد فرعي مناسب — إنشاء "${fallbackSubName}".`
			)
		};
	}

	const sub = subPick.node;
	const secPick = pickBestSecondary(sub, haystack, tokens, domain);
	if (secPick.node && secPick.score >= secondaryThreshold) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secPick.node.id),
			...makeDecisionBase(
				domain,
				Math.min(0.55 + (mainPick.score + subPick.score + secPick.score) * 0.025, 0.92),
				`مطابقة محلية: ${main.name} ← ${sub.name} ← ${secPick.node.name}.`
			)
		};
	}

	const proposedSecondaryName =
		domain?.secondaryName || pickBestHintName(bookMeta, domain, readableStemFromTitle(bookMeta?.title));
	const autoSec = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: proposedSecondaryName,
		minScore: 9
	});
	if (autoSec) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: autoSec.id,
			...makeDecisionBase(
				domain,
				Math.min(0.52 + (mainPick.score + subPick.score + autoSec.score) * 0.02, 0.88),
				`إعادة استعمال قسم ثانوي مناسب: ${main.name} ← ${sub.name} ← ${autoSec.name}.`
			)
		};
	}

	if (!domain) {
		const legacy = classifyHeuristic(sections, bookMeta);
		const legacyValid =
			legacy?.mainId &&
			legacy?.subId &&
			validateHierarchyPath(
				{ mainId: legacy.mainId, subId: legacy.subId, secondaryId: legacy.secondaryId || null },
				sections.index
			).valid;
		if (legacyValid && legacy.secondaryId) {
			return {
				kind: 'existing',
				mainId: String(legacy.mainId),
				subId: String(legacy.subId),
				secondaryId: String(legacy.secondaryId),
				...makeDecisionBase(null, legacy.confidence, legacy.reasoning)
			};
		}
		if (legacyValid) {
			const reuse = pickReuseSecondary(sections, String(legacy.subId), bookMeta, {
				proposedNewName: proposedSecondaryName,
				minScore: 9
			});
			if (reuse) {
				return {
					kind: 'existing',
					mainId: String(legacy.mainId),
					subId: String(legacy.subId),
					secondaryId: reuse.id,
					...makeDecisionBase(null, 0.45, `مطابقة عامة مع إعادة استعمال "${reuse.name}".`)
				};
			}
		}
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: proposedSecondaryName,
		...makeDecisionBase(
			domain,
			Math.min(0.48 + (mainPick.score + subPick.score) * 0.025, 0.82),
			`وُجد المسار ${main.name} ← ${sub.name} دون قسم ثانوي مناسب — إنشاء "${proposedSecondaryName}".`
		)
	};
}
