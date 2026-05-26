/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary].
 *
 * لا نعتمد على أوّل تطابق نصّي فقط؛ نحدّد مجال الكتاب أولاً ثم نبحث داخل
 * المجال نفسه. هذا يمنع خلط كتب الأدب مع الفقه أو التاريخ مع العقيدة.
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
		.replace(/[^\p{L}\p{N}\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

const STOP_WORDS = new Set([
	'كتاب',
	'كتب',
	'في',
	'عن',
	'على',
	'من',
	'الى',
	'إلى',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'تحميل',
	'pdf',
	'مكتبه',
	'نور'
].map(normalizeArabic));

const DOMAIN_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		keywords: ['قران', 'القران', 'تفسير', 'تفاسير', 'تجويد', 'قراءه', 'قراءات', 'مصحف', 'سور', 'سوره', 'ايات']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'كتب الحديث وشروحه',
		keywords: ['حديث', 'احاديث', 'سنه', 'سنن', 'صحيح', 'مسند', 'موطا', 'رواه', 'رواه', 'تخريج', 'اسناد', 'جرح', 'تعديل']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		keywords: ['فقه', 'فقهي', 'اصول الفقه', 'اصول', 'فتاوي', 'فتوى', 'احكام', 'عبادات', 'معاملات', 'صلاه', 'زكاه', 'صيام', 'حج', 'طهاره', 'نكاح', 'طلاق', 'مواريث']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		keywords: ['عقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'قدر', 'بدع', 'شرك', 'ايمان', 'اعتقاد']
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		keywords: ['سيره', 'النبي', 'نبويه', 'رسول', 'شمائل', 'مغازي', 'غزوات', 'صحابه', 'صحابي', 'خلفاء']
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب الشرعية',
		keywords: ['اخلاق', 'اداب شرعيه', 'تزكيه', 'رقائق', 'زهد', 'قلوب', 'موعظه', 'نصيحه', 'نصائح', 'تربيه ايمانيه']
	},
	{
		id: 'history',
		mainName: 'التاريخ والحضارة',
		subName: 'التاريخ الإسلامي',
		keywords: ['تاريخ', 'حضاره', 'دول', 'الدوله', 'اموي', 'عباسي', 'عثماني', 'اندلس', 'تراجم', 'اعلام', 'سير اعلام', 'طبقات']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وآدابها',
		subName: 'علوم اللغة العربية',
		keywords: ['لغه عربيه', 'نحو', 'صرف', 'بلاغه', 'عروض', 'ادب', 'شعر', 'نثر', 'معجم', 'قاموس', 'اعراب', 'بيان']
	},
	{
		id: 'education',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		keywords: ['تعليم', 'تعليمي', 'تعلم', 'تدريس', 'منهج', 'مناهج', 'علمي', 'علميه', 'تعليمات', 'طالب', 'طلاب', 'دراسه', 'دروس', 'نصائح علميه', 'ارشادات', 'توجيهات', 'الساده']
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		keywords: ['دعوه', 'داعيه', 'ارشاد', 'خطب', 'خطبه', 'محاضرات', 'ثقافه اسلاميه', 'اسلاميه عامه']
	}
]);

const DOMAIN_BY_ID = Object.fromEntries(DOMAIN_RULES.map((rule) => [rule.id, rule]));

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen && !STOP_WORDS.has(t))
	);
}

function textForBook(bookMeta) {
	return [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...(bookMeta?.categoryHints || [])
	]
		.filter(Boolean)
		.join(' ');
}

function keywordScore(rule, normalizedText, tokenSet) {
	let score = 0;
	for (const kw of rule.keywords) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (normalizedText.includes(n)) score += n.includes(' ') ? 4 : 3;
		const parts = n.split(' ').filter(Boolean);
		if (parts.length > 1 && parts.every((p) => tokenSet.has(p))) score += 2;
		else if (parts.length === 1 && tokenSet.has(parts[0])) score += 2;
	}
	return score;
}

function detectDomainFromText(rawText) {
	const normalized = normalizeArabic(rawText);
	const tokenSet = tokensOf(normalized);
	let best = null;
	let bestScore = 0;
	let secondScore = 0;

	for (const rule of DOMAIN_RULES) {
		const score = keywordScore(rule, normalized, tokenSet);
		if (score > bestScore) {
			secondScore = bestScore;
			bestScore = score;
			best = rule;
		} else if (score > secondScore) {
			secondScore = score;
		}
	}

	if (!best || bestScore < 3) return null;
	return {
		...best,
		score: bestScore,
		margin: bestScore - secondScore
	};
}

function detectSectionDomain(sectionName) {
	const normalized = normalizeArabic(sectionName);
	if (!normalized) return null;
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		const score = keywordScore(rule, normalized, tokensOf(normalized));
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return bestScore >= 3 ? best.id : null;
}

function sanitizeSectionName(raw, fallback = '') {
	let s = String(raw || '').trim();
	if (!s) s = fallback;
	s = s
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/^تحميل\s+/u, '')
		.replace(/^كتاب\s+/u, '')
		.replace(/^كتب\s+(?:في\s+)?/u, '')
		.split(/[*;|/\\\n\r\t]+/)[0]
		.replace(/^[\s,،.\-–—_]+/, '')
		.replace(/[\s,،.\-–—_]+$/, '')
		.trim();
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s || fallback;
}

function bestCategoryHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint);
		if (clean && clean.length >= 3 && !/^الرئيسيه$/u.test(normalizeArabic(clean))) return clean;
	}
	return '';
}

/** يستخرج جذع العنوان بإزالة ترقيم الأجزاء الشائع. */
function seriesStemFromTitle(title) {
	let t = String(title || '').trim();
	if (!t) return '';
	t = t.replace(/\s*\|\s*مكتبة نور.*$/u, '');
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '');
	return sanitizeSectionName(t, '').replace(/\s+/g, ' ').trim();
}

function proposedNames(bookMeta, domain) {
	const hint = bestCategoryHint(bookMeta);
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	const domainRule = domain ? DOMAIN_BY_ID[domain.id] : null;
	const bookN = normalizeArabic(textForBook(bookMeta));
	const subName = sanitizeSectionName(hint || domainRule?.subName || 'كتب عامة', domainRule?.subName || 'كتب عامة');

	let secondaryName = '';
	if (
		domainRule?.id === 'education' &&
		/(?:نصيحه|نصائح|توجيه|توجيهات|ارشاد|ارشادات)/u.test(bookN) &&
		/(?:علمي|علميه|تعليم|تعليمات)/u.test(bookN)
	) {
		secondaryName = 'النصائح والتوجيهات العلمية';
	}
	if (!secondaryName && hint && normalizeArabic(hint) !== normalizeArabic(subName)) secondaryName = hint;
	if (!secondaryName && stem && tokensOf(stem).size >= 2) secondaryName = stem;
	if (!secondaryName) secondaryName = subName;

	return {
		mainName: domainRule?.mainName || 'مكتبة نور',
		subName,
		secondaryName: sanitizeSectionName(secondaryName, subName)
	};
}

function lexicalScore(sectionName, bookMeta) {
	const sectionN = normalizeArabic(sectionName);
	const haystack = normalizeArabic(textForBook(bookMeta));
	if (!sectionN || !haystack) return 0;

	const sectionTokens = tokensOf(sectionN);
	const hayTokens = tokensOf(haystack);
	let score = 0;
	for (const token of sectionTokens) {
		if (hayTokens.has(token)) score += 2;
	}
	if (sectionN.length >= 4 && haystack.includes(sectionN)) score += 5;

	const stemTokens = tokensOf(seriesStemFromTitle(bookMeta?.title || ''));
	for (const token of sectionTokens) {
		if (stemTokens.has(token)) score += 2;
	}
	return score;
}

function scoreNode(node, bookMeta, domain, level) {
	let score = lexicalScore(node?.name || '', bookMeta);
	const sectionDomain = detectSectionDomain(node?.name || '');
	if (domain) {
		if (sectionDomain === domain.id) score += level === 'main' ? 8 : 5;
		else if (sectionDomain && sectionDomain !== domain.id) return { score: -100, sectionDomain };
	}
	return { score, sectionDomain };
}

function pickBestNode(nodes, bookMeta, domain, level) {
	let best = null;
	let bestScore = -100;
	for (const node of nodes || []) {
		const { score } = scoreNode(node, bookMeta, domain, level);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return { node: best, score: bestScore };
}

function isGenericContainerName(name) {
	const n = normalizeArabic(name);
	return (
		n.includes('كتب اسلاميه') ||
		n.includes('المكتبه') ||
		n.includes('مكتبه نور') ||
		n.includes('علوم اسلاميه') ||
		n.includes('ثقافه اسلاميه') ||
		n === 'كتب' ||
		n === 'المكتبه'
	);
}

function pickGenericMain(tree, bookMeta, domain) {
	let best = null;
	let bestScore = -1;
	for (const main of tree || []) {
		const { score, sectionDomain } = scoreNode(main, bookMeta, domain, 'main');
		if (sectionDomain && domain && sectionDomain !== domain.id) continue;
		const genericBoost = isGenericContainerName(main?.name || '') ? 3 : 0;
		const total = Math.max(score, 0) + genericBoost;
		if (total > bestScore) {
			bestScore = total;
			best = main;
		}
	}
	return bestScore >= 3 ? best : null;
}

function pickBestSubPath(tree, bookMeta, domain) {
	let best = null;
	let bestScore = -100;
	for (const main of tree || []) {
		const mainScore = scoreNode(main, bookMeta, domain, 'main');
		if (mainScore.score <= -100) continue;
		for (const sub of main.children || []) {
			const subScore = scoreNode(sub, bookMeta, domain, 'sub');
			if (subScore.score <= -100) continue;
			const genericMainBoost = isGenericContainerName(main?.name || '') ? 2 : 0;
			const total = Math.max(mainScore.score, 0) + subScore.score + genericMainBoost;
			if (total > bestScore) {
				bestScore = total;
				best = {
					main,
					sub,
					mainScore: mainScore.score,
					subScore: subScore.score,
					total
				};
			}
		}
	}
	return best;
}

function getSecondariesUnderSubInTree(tree, subId) {
	for (const m of tree || []) {
		for (const s of m.children || []) {
			if (String(s.id) === String(subId)) return s.children || [];
		}
	}
	return [];
}

function buildDecision(sections, bookMeta) {
	const domain = detectDomainFromText(textForBook(bookMeta));
	const names = proposedNames(bookMeta, domain);
	const tree = sections.tree || [];

	const bestMain = pickBestNode(tree, bookMeta, domain, 'main');
	const bestSubPath = pickBestSubPath(tree, bookMeta, domain);
	const mainThreshold = domain ? 5 : 2;
	const subThreshold = domain ? 4 : 2;

	if (bestSubPath && bestSubPath.total >= subThreshold) {
		const secondaries = getSecondariesUnderSubInTree(tree, bestSubPath.sub.id);
		const bestSec = pickBestNode(secondaries, bookMeta, domain, 'secondary');
		const secondaryThreshold = 4;
		if (!bestSec.node || bestSec.score < secondaryThreshold) {
			return {
				kind: 'create_secondary',
				mainId: String(bestSubPath.main.id),
				subId: String(bestSubPath.sub.id),
				secondaryId: null,
				newSecondaryName: names.secondaryName,
				confidence: Math.min(0.55 + Math.max(bestSubPath.total, 0) * 0.02, 0.82),
				reasoning: `وُجد المسار "${bestSubPath.main.name} ← ${bestSubPath.sub.name}" دون قسم ثانوي مناسب — إنشاء قسم ثانوي.`,
				method: 'heuristic'
			};
		}

		return {
			kind: 'existing',
			mainId: String(bestSubPath.main.id),
			subId: String(bestSubPath.sub.id),
			secondaryId: String(bestSec.node.id),
			confidence: Math.min(0.55 + (bestSubPath.total + bestSec.score) * 0.025, 0.93),
			reasoning: `مطابقة محلّيّة: ${bestSubPath.main.name} ← ${bestSubPath.sub.name} ← ${bestSec.node.name}.`,
			method: 'heuristic'
		};
	}

	if (!bestMain.node || bestMain.score < mainThreshold) {
		const genericMain = pickGenericMain(tree, bookMeta, domain);
		if (genericMain) {
			return {
				kind: 'create_sub',
				mainId: String(genericMain.id),
				subId: null,
				secondaryId: null,
				newSubName: names.subName,
				newSecondaryName: names.secondaryName,
				confidence: domain ? 0.46 : 0.3,
				reasoning: `وُجد قسم رئيسي عام "${genericMain.name}" دون فرع مطابق — إنشاء قسم فرعي مناسب.`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: names.mainName,
			newSubName: names.subName,
			newSecondaryName: names.secondaryName,
			confidence: domain ? 0.42 : 0.25,
			reasoning: domain
				? `لم يُعثَر على قسم رئيسي مناسب لمجال "${domain.mainName}" — إنشاء مسار جديد.`
				: 'لم يُعثَر على مجال واضح أو قسم رئيسي مناسب — إنشاء مسار عام لمكتبة نور.',
			method: 'heuristic'
		};
	}

	const bestSub = pickBestNode(bestMain.node.children || [], bookMeta, domain, 'sub');
	if (!bestSub.node || bestSub.score < subThreshold) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.node.id),
			subId: null,
			secondaryId: null,
			newSubName: names.subName,
			newSecondaryName: names.secondaryName,
			confidence: Math.min(0.5 + Math.max(bestMain.score, 0) * 0.03, 0.76),
			reasoning: `وُجد قسم رئيسي مناسب "${bestMain.node.name}" دون فرع مطابق — إنشاء قسم فرعي مناسب.`,
			method: 'heuristic'
		};
	}

	const secondaries = getSecondariesUnderSubInTree(tree, bestSub.node.id);
	const bestSec = pickBestNode(secondaries, bookMeta, domain, 'secondary');
	const secondaryThreshold = 4;
	if (!bestSec.node || bestSec.score < secondaryThreshold) {
		return {
			kind: 'create_secondary',
			mainId: String(bestMain.node.id),
			subId: String(bestSub.node.id),
			secondaryId: null,
			newSecondaryName: names.secondaryName,
			confidence: Math.min(0.55 + Math.max(bestMain.score + bestSub.score, 0) * 0.02, 0.82),
			reasoning: `وُجد المسار "${bestMain.node.name} ← ${bestSub.node.name}" دون قسم ثانوي مناسب — إنشاء قسم ثانوي.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(bestMain.node.id),
		subId: String(bestSub.node.id),
		secondaryId: String(bestSec.node.id),
		confidence: Math.min(0.55 + (bestMain.score + bestSub.score + bestSec.score) * 0.025, 0.93),
		reasoning: `مطابقة محلّيّة: ${bestMain.node.name} ← ${bestSub.node.name} ← ${bestSec.node.name}.`,
		method: 'heuristic'
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

	const decision = buildDecision(sections, bookMeta);
	const suggested = {
		mainId: decision.mainId,
		subId: decision.subId,
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		kind: decision.kind,
		newMainName: decision.newMainName,
		newSubName: decision.newSubName,
		newSecondaryName: decision.newSecondaryName
	};
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: suggested.mainId, subId: suggested.subId, secondaryId: suggested.secondaryId },
					sections.index
				)
			: { valid: true, reason: 'requires_section_creation' };

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
	return buildDecision(sections, bookMeta);
}
