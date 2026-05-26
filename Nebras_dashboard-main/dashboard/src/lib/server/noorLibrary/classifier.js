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

const MAIN_REUSE_MIN_SCORE = 4;
const SUB_REUSE_MIN_SCORE = 4;
const SECONDARY_REUSE_MIN_SCORE = 5;

const GENERIC_SECONDARY_NAME = 'كتب عامة';

const DOMAIN_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير وعلوم القرآن',
		keywords: [
			'قرآن', 'القرآن', 'تفسير', 'تفاسير', 'مصحف', 'تجويد', 'قراءات',
			'ناسخ', 'منسوخ', 'اسباب النزول', 'علوم القرآن'
		],
		aliases: ['القرآن', 'علوم القرآن', 'التفسير', 'التفسير وعلوم القرآن']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث وعلومه',
		keywords: [
			'حديث', 'احاديث', 'السنة', 'سنن', 'صحيح', 'البخاري', 'مسلم',
			'ترمذي', 'نسائي', 'ابن ماجه', 'مصطلح الحديث', 'جرح', 'تعديل', 'اسناد'
		],
		aliases: ['الحديث', 'الحديث الشريف', 'علوم الحديث', 'مصطلح الحديث']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'كتب الفقه وأصوله',
		keywords: [
			'فقه', 'اصول الفقه', 'فتوى', 'فتاوى', 'حلال', 'حرام', 'طهارة',
			'صلاة', 'زكاة', 'صيام', 'حج', 'نكاح', 'طلاق', 'ميراث', 'فرائض',
			'معاملات', 'عبادات', 'مذهب', 'مذاهب'
		],
		aliases: ['الفقه', 'الفقه الإسلامي', 'الفقه وأصوله', 'أصول الفقه']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة والتوحيد',
		keywords: [
			'عقيدة', 'العقيدة', 'توحيد', 'ايمان', 'ايمانيات', 'اسماء الله',
			'صفات', 'قدر', 'الولاء والبراء', 'الفرق', 'اشاعرة', 'ماتريدية',
			'سلفية', 'اعتقاد'
		],
		aliases: ['العقيدة', 'التوحيد', 'العقيدة والتوحيد', 'أصول الدين']
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'كتب السيرة والشمائل',
		keywords: [
			'سيرة', 'السيرة', 'النبوية', 'النبي', 'الرسول', 'محمد صلى',
			'غزوة', 'غزوات', 'شمائل', 'مغازي'
		],
		aliases: ['السيرة', 'السيرة النبوية', 'الشمائل', 'المغازي']
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'كتب التاريخ الإسلامي',
		keywords: [
			'تاريخ', 'التاريخ', 'حضارة', 'دولة', 'دول', 'خلافة', 'فتوح',
			'تراجم', 'اعلام', 'طبقات', 'انساب', 'وفيات'
		],
		aliases: ['التاريخ', 'التاريخ الإسلامي', 'السير', 'التراجم', 'الطبقات']
	},
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		subName: 'التعليم والتوجيه العلمي',
		secondaryName: 'النصائح والتعليمات العلمية',
		keywords: [
			'تعليم', 'تعليمات', 'تعليمية', 'تعليمي', 'تعليمية', 'تربية',
			'تربوي', 'دراسة', 'دراسات', 'منهج', 'مناهج', 'مدرسة', 'مدارس',
			'نصائح', 'ارشاد', 'توجيه', 'علمية', 'علمي', 'طلب العلم', 'طلاب العلم'
		],
		aliases: ['التربية', 'التعليم', 'التربية والتعليم', 'التعليم والتوجيه العلمي']
	},
	{
		id: 'ethics',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'كتب الأخلاق والآداب',
		keywords: [
			'تزكية', 'اخلاق', 'الأخلاق', 'اداب', 'آداب', 'رقائق', 'موعظة',
			'مواعظ', 'زهد', 'ورع', 'سلوك', 'تصوف', 'تصوّف'
		],
		aliases: ['التزكية', 'الأخلاق', 'الآداب', 'التزكية والأخلاق']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وآدابها',
		subName: 'اللغة والأدب',
		secondaryName: 'كتب اللغة والأدب',
		keywords: [
			'لغة', 'اللغة', 'عربية', 'نحو', 'صرف', 'بلاغة', 'ادب', 'أدب',
			'شعر', 'ديوان', 'قصة', 'رواية', 'لسان العرب', 'معجم', 'معاجم'
		],
		aliases: ['اللغة العربية', 'الأدب العربي', 'النحو', 'الصرف', 'البلاغة']
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'كتب الدعوة والإرشاد',
		keywords: ['دعوة', 'الدعوة', 'دعاة', 'ارشاد', 'خطب', 'محاضرات', 'ثقافة اسلامية'],
		aliases: ['الدعوة', 'الإرشاد', 'الثقافة الإسلامية']
	}
]);

function tokensOf(s, minLen = 3) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= minLen));
}

function scoreTextAgainstNeedle(text, needle) {
	const haystack = normalizeArabic(text);
	const n = normalizeArabic(needle);
	if (!haystack || !n) return 0;
	let score = 0;
	if (haystack.includes(n) && n.length >= 4) score += 6;
	const hayTokens = tokensOf(haystack);
	for (const w of n.split(' ')) {
		if (w.length >= 3 && hayTokens.has(w)) score += 2;
	}
	return score;
}

function scoreOf(sectionName, haystack) {
	const n = normalizeArabic(sectionName);
	if (!n || !haystack) return 0;
	const tokens = tokensOf(haystack);
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (haystack.includes(n) && n.length >= 4) score += 3;
	return score;
}

function scoreNodeForNames(nodeName, names) {
	const candidates = Array.isArray(names) ? names : [names];
	let best = 0;
	for (const name of candidates) {
		best = Math.max(best, scoreTextAgainstNeedle(nodeName, name));
	}
	return best;
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

function pickDomainRule(bookMeta) {
	const haystack = bookHaystack(bookMeta);
	if (!haystack) return null;
	const hayTokens = tokensOf(haystack);

	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		let score = 0;
		for (const kw of rule.keywords) {
			const n = normalizeArabic(kw);
			if (!n) continue;
			if (haystack.includes(n)) score += n.includes(' ') ? 5 : 3;
			if (!n.includes(' ') && hayTokens.has(n)) score += 2;
		}
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best && bestScore >= 3 ? { ...best, score: bestScore } : null;
}

function sanitizeSectionName(raw) {
	let s = String(raw || '').trim();
	if (!s) return '';
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	s = s.replace(/^كتب\s+(?:في|عن)\s+/u, '').trim();
	if (s.length > 48) s = s.slice(0, 48).trim();
	return s;
}

function pickBestCategoryHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint);
		if (clean && clean.length >= 3) return clean;
	}
	return '';
}

function readableStemFromTitle(title) {
	let stem = seriesStemFromTitle(title);
	stem = stem
		.replace(/^(?:كتاب|رسالة|مختصر|شرح)\s+/u, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (stem.length > 52) stem = stem.slice(0, 52).trim();
	return stem || GENERIC_SECONDARY_NAME;
}

function fallbackRoute(bookMeta) {
	const hint = pickBestCategoryHint(bookMeta);
	const secondaryName = readableStemFromTitle(bookMeta?.title || '');
	return {
		mainName: 'مكتبة نور',
		subName: hint || 'كتب متنوعة',
		secondaryName: secondaryName === GENERIC_SECONDARY_NAME ? (hint || GENERIC_SECONDARY_NAME) : secondaryName,
		aliases: hint ? [hint, 'مكتبة نور'] : ['مكتبة نور', 'كتب متنوعة'],
		score: 1
	};
}

function desiredRoute(bookMeta) {
	const domain = pickDomainRule(bookMeta);
	if (domain) {
		return {
			mainName: domain.mainName,
			subName: domain.subName,
			secondaryName: domain.secondaryName,
			aliases: [domain.mainName, domain.subName, domain.secondaryName, ...(domain.aliases || [])],
			score: domain.score,
			domainId: domain.id
		};
	}
	return fallbackRoute(bookMeta);
}

function pickBestMain(tree, route, haystack) {
	let best = null;
	let bestScore = 0;
	for (const main of tree || []) {
		let childScore = 0;
		for (const sub of main.children || []) {
			childScore = Math.max(
				childScore,
				scoreNodeForNames(sub.name, [route.subName, route.secondaryName, ...(route.aliases || [])])
			);
			for (const sec of sub.children || []) {
				childScore = Math.max(
					childScore,
					scoreNodeForNames(sec.name, [route.secondaryName, ...(route.aliases || [])])
				);
			}
		}
		const score = Math.max(
			scoreNodeForNames(main.name, [route.mainName, ...(route.aliases || [])]),
			scoreOf(main.name, haystack) * 2,
			childScore
		);
		if (score > bestScore) {
			best = main;
			bestScore = score;
		}
	}
	return best && bestScore >= MAIN_REUSE_MIN_SCORE ? { node: best, score: bestScore } : null;
}

function pickBestSub(mainNode, route, haystack) {
	let best = null;
	let bestScore = 0;
	for (const sub of mainNode?.children || []) {
		const score = Math.max(
			scoreNodeForNames(sub.name, [route.subName, ...(route.aliases || [])]),
			scoreOf(sub.name, haystack) * 2
		);
		if (score > bestScore) {
			best = sub;
			bestScore = score;
		}
	}
	return best && bestScore >= SUB_REUSE_MIN_SCORE ? { node: best, score: bestScore } : null;
}

function pickBestSecondary(subNode, route, bookMeta, haystack) {
	let best = null;
	let bestScore = 0;
	const titleStem = readableStemFromTitle(bookMeta?.title || '');
	for (const sec of subNode?.children || []) {
		const score = Math.max(
			scoreNodeForNames(sec.name, [route.secondaryName, titleStem, ...(route.aliases || [])]),
			scoreSecondaryForReuse(sec, bookMeta, route.secondaryName),
			scoreOf(sec.name, haystack) * 2
		);
		if (score > bestScore) {
			best = sec;
			bestScore = score;
		}
	}
	return best && bestScore >= SECONDARY_REUSE_MIN_SCORE ? { node: best, score: bestScore } : null;
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


/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = await classifyAutonomous(sections, bookMeta);
	const hasExistingFullPath = decision.mainId && decision.subId && decision.secondaryId;
	const validation = hasExistingFullPath
		? validateHierarchyPath(
				{ mainId: decision.mainId, subId: decision.subId, secondaryId: decision.secondaryId },
				sections.index
			)
		: {
				valid: false,
				reason: 'requires_section_creation',
				proposed: {
					mainName: decision.newMainName || null,
					subName: decision.newSubName || null,
					secondaryName: decision.newSecondaryName || null
				}
			};
	return {
		suggested: {
			kind: decision.kind,
			mainId: decision.mainId || null,
			subId: decision.subId || null,
			secondaryId: decision.secondaryId || null,
			newMainName: decision.newMainName || null,
			newSubName: decision.newSubName || null,
			newSecondaryName: decision.newSecondaryName || null,
			confidence: decision.confidence,
			reasoning: decision.reasoning,
			method: decision.method
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
		const route = desiredRoute(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: route.mainName,
			newSubName: route.subName,
			newSecondaryName: route.secondaryName,
			confidence: 0.35,
			reasoning: 'لا توجد أقسام بعد — إنشاء مسار ثلاثي كامل للكتاب.',
			method: 'heuristic'
		};
	}

	const route = desiredRoute(bookMeta);
	const haystack = bookHaystack(bookMeta);
	const bestMain = pickBestMain(sections.tree, route, haystack);

	if (!bestMain) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: route.mainName,
			newSubName: route.subName,
			newSecondaryName: route.secondaryName,
			confidence: 0.4,
			reasoning: `لم يوجد قسم رئيسي مناسب دون خلط المجالات — إنشاء "${route.mainName}" ثم "${route.subName}".`,
			method: 'heuristic'
		};
	}

	const bestSub = pickBestSub(bestMain.node, route, haystack);
	if (!bestSub) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.node.id),
			subId: null,
			secondaryId: null,
			newSubName: route.subName,
			newSecondaryName: route.secondaryName,
			confidence: Math.min(0.5 + bestMain.score * 0.03, 0.82),
			reasoning: `وُجد القسم الرئيسي "${bestMain.node.name}" ولا يوجد فرع مناسب — إنشاء "${route.subName}".`,
			method: 'heuristic'
		};
	}

	const bestSecondary = pickBestSecondary(bestSub.node, route, bookMeta, haystack);
	if (!bestSecondary) {
		return {
			kind: 'create_secondary',
			mainId: String(bestMain.node.id),
			subId: String(bestSub.node.id),
			secondaryId: null,
			newSecondaryName: route.secondaryName,
			confidence: Math.min(0.55 + bestMain.score * 0.02 + bestSub.score * 0.02, 0.88),
			reasoning: `وُجد المسار "${bestMain.node.name} ← ${bestSub.node.name}" ولا يوجد قسم ثانوي مناسب — إنشاء "${route.secondaryName}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(bestMain.node.id),
		subId: String(bestSub.node.id),
		secondaryId: String(bestSecondary.node.id),
		confidence: Math.min(
			0.6 + bestMain.score * 0.02 + bestSub.score * 0.02 + bestSecondary.score * 0.02,
			0.94
		),
		reasoning: `مطابقة مجال بلا خلط: ${bestMain.node.name} ← ${bestSub.node.name} ← ${bestSecondary.node.name}.`,
		method: 'heuristic'
	};
}
