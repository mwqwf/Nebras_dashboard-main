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

function tokensOf(s) {
	return normalizeArabic(s)
		.split(' ')
		.filter((w) => w.length >= 3);
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

function readableTitleStem(bookMeta, fallback = 'موضوعات عامة') {
	const raw = String(bookMeta?.title || '').trim();
	let stem = raw
		.replace(
			/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
			''
		)
		.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '')
		.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '')
		.replace(/^كتاب\s+/u, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (stem.length >= 4) return stem.slice(0, 80);
	return fallback;
}

function phraseHit(haystack, phrase) {
	const n = normalizeArabic(phrase);
	return n.length >= 3 && haystack.includes(n);
}

function countPhraseHits(haystack, phrases = []) {
	let score = 0;
	for (const phrase of phrases) {
		if (!phraseHit(haystack, phrase)) continue;
		const len = normalizeArabic(phrase).split(' ').length;
		score += Math.max(1, len);
	}
	return score;
}

/**
 * قواعد موضوعيّة تمنع الخلط بين العلوم؛ نختار المسار الدلالي أولاً ثم
 * نبحث عن أقسام موجودة تحمل المعنى نفسه، وإن غابت ننشئ المستوى الناقص.
 */
const SEMANTIC_PATH_RULES = Object.freeze([
	{
		id: 'education_guidance',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		mainCandidates: ['الدعوة والتربية', 'التربية والتعليم', 'التزكية والتربية'],
		subCandidates: ['التربية والتعليم', 'طلب العلم وآدابه', 'آداب طالب العلم'],
		secondaryCandidates: [
			'النصائح والتوجيهات العلمية',
			'آداب طالب العلم',
			'طلب العلم',
			'التوجيهات العلمية'
		],
		requiredAny: [
			'نصائح',
			'النصائح',
			'توجيهات',
			'وصايا',
			'تعليمات',
			'تعليم',
			'التربية والتعليم',
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'المتعلم',
			'المعلم'
		],
		keywords: ['علمية', 'العلمية', 'السادة']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل فقهية',
		mainCandidates: ['الفقه وأصوله', 'الفقه الإسلامي', 'العلوم الشرعية'],
		subCandidates: ['الفقه الإسلامي', 'العبادات', 'المعاملات', 'أصول الفقه'],
		secondaryCandidates: ['مسائل فقهية', 'الفقه الإسلامي', 'العبادات', 'المعاملات'],
		requiredAny: [
			'فقه',
			'فقهي',
			'أصول الفقه',
			'اصول الفقه',
			'فتاوى',
			'الطهارة',
			'الصلاة',
			'الزكاة',
			'الصيام',
			'الحج',
			'المعاملات',
			'النكاح',
			'الطلاق',
			'المواريث'
		],
		keywords: []
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'التوحيد والعقيدة',
		mainCandidates: ['العقيدة', 'العقيدة الإسلامية', 'العلوم الشرعية'],
		subCandidates: ['العقيدة والتوحيد', 'التوحيد', 'الإيمان'],
		secondaryCandidates: ['التوحيد والعقيدة', 'التوحيد', 'الإيمان'],
		requiredAny: [
			'عقيدة',
			'العقيدة',
			'توحيد',
			'التوحيد',
			'الإيمان',
			'الايمان',
			'الشرك',
			'البدعة',
			'الصفات',
			'أسماء الله',
			'اسماء الله'
		],
		keywords: []
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'التاريخ الإسلامي',
		mainCandidates: ['التاريخ والسير', 'التاريخ الإسلامي', 'السير والتراجم'],
		subCandidates: ['التاريخ الإسلامي', 'السير والتراجم', 'التراجم والطبقات'],
		secondaryCandidates: ['التاريخ الإسلامي', 'السير والتراجم', 'التراجم والطبقات'],
		requiredAny: [
			'تاريخ',
			'التاريخ',
			'تراجم',
			'طبقات',
			'الخلافة',
			'الدولة',
			'الحضارة',
			'الفتوح',
			'سير أعلام',
			'سير اعلام'
		],
		keywords: []
	},
	{
		id: 'adab_language',
		mainName: 'اللغة العربية وآدابها',
		subName: 'الأدب والبلاغة',
		secondaryName: 'الأدب العربي',
		mainCandidates: ['اللغة العربية وآدابها', 'اللغة العربية', 'الأدب العربي'],
		subCandidates: ['الأدب والبلاغة', 'الأدب العربي', 'النحو والصرف'],
		secondaryCandidates: ['الأدب العربي', 'الشعر', 'النثر', 'البلاغة'],
		requiredAny: [
			'الأدب العربي',
			'الادب العربي',
			'الشعر',
			'النثر',
			'البلاغة',
			'النحو',
			'الصرف',
			'العروض',
			'القوافي'
		],
		keywords: ['لغة عربية', 'اللغه العربيه']
	},
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير وعلوم القرآن',
		mainCandidates: ['القرآن الكريم وعلومه', 'القرآن وعلومه', 'التفسير وعلوم القرآن'],
		subCandidates: ['التفسير وعلوم القرآن', 'تفسير القرآن', 'علوم القرآن'],
		secondaryCandidates: ['التفسير وعلوم القرآن', 'تفسير القرآن', 'علوم القرآن'],
		requiredAny: ['قرآن', 'القرآن', 'القران', 'تفسير', 'التفسير', 'تجويد', 'قراءات'],
		keywords: []
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'علوم الحديث',
		secondaryName: 'علوم الحديث',
		mainCandidates: ['الحديث الشريف وعلومه', 'الحديث وعلومه', 'السنة النبوية'],
		subCandidates: ['علوم الحديث', 'الحديث الشريف', 'مصطلح الحديث'],
		secondaryCandidates: ['علوم الحديث', 'مصطلح الحديث', 'شرح الحديث'],
		requiredAny: ['حديث', 'الحديث', 'أحاديث', 'احاديث', 'مصطلح الحديث', 'السنة النبوية'],
		keywords: []
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة النبوية',
		secondaryName: 'سيرة النبي صلى الله عليه وسلم',
		mainCandidates: ['السيرة النبوية', 'السير والتراجم'],
		subCandidates: ['السيرة النبوية', 'سيرة النبي', 'شمائل النبي'],
		secondaryCandidates: ['سيرة النبي صلى الله عليه وسلم', 'السيرة النبوية', 'الشمائل'],
		requiredAny: ['سيرة النبي', 'السيرة النبوية', 'شمائل', 'المغازي', 'غزوات'],
		keywords: []
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والرقائق',
		secondaryName: 'التزكية والآداب الشرعية',
		mainCandidates: ['التزكية والأخلاق', 'التزكية والرقائق', 'الدعوة والتربية'],
		subCandidates: ['الأخلاق والرقائق', 'التزكية', 'الآداب الشرعية'],
		secondaryCandidates: ['التزكية والآداب الشرعية', 'الأخلاق الإسلامية', 'الرقائق'],
		requiredAny: ['تزكية', 'الأخلاق', 'اخلاق', 'رقائق', 'آداب شرعية', 'اداب شرعية'],
		keywords: []
	}
]);

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = buildHaystack(bookMeta);
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
		method: 'heuristic',
		scores: {
			main: bestMainScore,
			sub: bestSubScore,
			secondary: bestSecScore
		}
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

function scoreSemanticRule(rule, bookMeta) {
	const hay = buildHaystack(bookMeta);
	const requiredScore = countPhraseHits(hay, rule.requiredAny || []);
	if (requiredScore <= 0) return 0;
	return requiredScore * 10 + countPhraseHits(hay, rule.keywords || []) * 3;
}

function pickSemanticRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of SEMANTIC_PATH_RULES) {
		const score = scoreSemanticRule(rule, bookMeta);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best ? { rule: best, score: bestScore } : null;
}

function nameMatchScore(actual, wanted) {
	const a = normalizeArabic(actual);
	const w = normalizeArabic(wanted);
	if (!a || !w) return 0;
	if (a === w) return 100;
	if (a.includes(w) || w.includes(a)) return 86;
	const aTokens = new Set(tokensOf(a));
	const wTokens = new Set(tokensOf(w));
	return tokenSetsOverlapRatio(aTokens, wTokens) * 70;
}

function pickBestByNames(nodes, wantedNames, minScore = 45) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		for (const name of wantedNames || []) {
			const score = nameMatchScore(node?.name, name);
			if (score > bestScore) {
				bestScore = score;
				best = node;
			}
		}
	}
	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

function resolveSemanticPath(sections, bookMeta, ruleMatch) {
	const rule = ruleMatch.rule;
	const mainNames = [rule.mainName, ...(rule.mainCandidates || [])];
	const subNames = [rule.subName, ...(rule.subCandidates || [])];
	const secondaryNames = [rule.secondaryName, ...(rule.secondaryCandidates || [])];
	const mainPick = pickBestByNames(sections.tree || [], mainNames, 50);
	const confidence = Math.min(0.7 + ruleMatch.score / 100, 0.97);
	const reasoning = `تصنيف دلالي: ${rule.id}`;

	if (!mainPick) {
		return {
			kind: 'create_main',
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence,
			reasoning,
			method: 'semantic-rule'
		};
	}

	const main = mainPick.node;
	const subPick = pickBestByNames(main.children || [], subNames, 48);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence,
			reasoning,
			method: 'semantic-rule'
		};
	}

	const sub = subPick.node;
	const secondaryPick = pickBestByNames(sub.children || [], secondaryNames, 48);
	if (secondaryPick) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondaryPick.node.id),
			confidence,
			reasoning,
			method: 'semantic-rule'
		};
	}

	const reused = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: rule.secondaryName,
		minScore: 8
	});
	if (reused) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(reused.id),
			confidence,
			reasoning: `${reasoning} + إعادة استعمال قسم ثانوي مناسب`,
			method: 'semantic-rule'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		newSecondaryName: rule.secondaryName,
		confidence,
		reasoning,
		method: 'semantic-rule'
	};
}

function genericCreateDecision(bookMeta) {
	return {
		kind: 'create_main',
		newMainName: 'مكتبة نور',
		newSubName: 'كتب عامة',
		newSecondaryName: readableTitleStem(bookMeta, 'موضوعات عامة'),
		confidence: 0.2,
		reasoning: 'لم توجد مطابقة دلالية آمنة؛ إنشاء مسار عام مع قسم ثانوي باسم موضوع الكتاب.',
		method: 'generic-create'
	};
}

function decisionFromHeuristic(sections, sug, bookMeta) {
	const scores = sug?.scores || {};
	const mainScore = Number(scores.main || 0);
	const subScore = Number(scores.sub || 0);
	const secondaryScore = Number(scores.secondary || 0);

	if (!sug || mainScore <= 0 || subScore <= 0) {
		return genericCreateDecision(bookMeta);
	}

	const mainId = String(sug.mainId);
	const subId = String(sug.subId);
	if (sug.secondaryId && secondaryScore > 0) {
		return {
			kind: 'existing',
			mainId,
			subId,
			secondaryId: String(sug.secondaryId),
			confidence: sug.confidence,
			reasoning: sug.reasoning,
			method: sug.method
		};
	}

	const proposed = readableTitleStem(bookMeta, 'موضوعات عامة');
	const reused = pickReuseSecondary(sections, subId, bookMeta, {
		proposedNewName: proposed,
		minScore: 8
	});
	if (reused) {
		return {
			kind: 'existing',
			mainId,
			subId,
			secondaryId: reused.id,
			confidence: Math.min((sug.confidence || 0.5) + 0.05, 0.9),
			reasoning: `${sug.reasoning} + إعادة استعمال قسم ثانوي قريب`,
			method: sug.method
		};
	}

	return {
		kind: 'create_secondary',
		mainId,
		subId,
		newSecondaryName: proposed,
		confidence: Math.max(sug.confidence || 0.5, 0.55),
		reasoning: `${sug.reasoning}؛ لا يوجد قسم ثانوي مناسب تحت الفرع.`,
		method: sug.method
	};
}


/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	if (!sections.tree || sections.tree.length === 0) {
		const decision = genericCreateDecision(bookMeta);
		return {
			suggested: decision,
			alternatives: [],
			validation: { valid: false, reason: 'will_create_missing_hierarchy' }
		};
	}

	const semantic = pickSemanticRule(bookMeta);
	const decision = semantic
		? resolveSemanticPath(sections, bookMeta, semantic)
		: decisionFromHeuristic(sections, classifyHeuristic(sections, bookMeta), bookMeta);
	const validation = decision.kind === 'existing'
		? validateHierarchyPath(
				{
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId || null
				},
				sections.index
			)
		: { valid: false, reason: 'will_create_missing_hierarchy' };
	return {
		suggested: decision,
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
		const semantic = pickSemanticRule(bookMeta);
		if (semantic) return resolveSemanticPath(sections, bookMeta, semantic);
		return genericCreateDecision(bookMeta);
	}

	const semantic = pickSemanticRule(bookMeta);
	if (semantic) return resolveSemanticPath(sections, bookMeta, semantic);
	return decisionFromHeuristic(sections, classifyHeuristic(sections, bookMeta), bookMeta);
}
