/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary].
 *
 * التصنيف محلي بالكامل. نبدأ بتحديد المجال العلمي (فقه/عقيدة/تاريخ/تزكية...)
 * ثم نبحث داخل الشجرة الحالية عن أفضل مسار ثلاثي. إذا غاب أي مستوى مناسب
 * نرجع قرار إنشاء مستوى جديد؛ الكتابة الفعلية تبقى في engine.js.
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

const DOMAIN_PROFILES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير وعلوم القرآن',
		aliases: ['قران', 'القران', 'تفسير', 'علوم القران', 'تلاوه', 'قراءه', 'مصحف'],
		negativeAliases: ['فقه', 'عقيده', 'تاريخ', 'ادب عربي']
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'علوم الحديث',
		secondaryName: 'كتب الحديث وعلومه',
		aliases: ['حديث', 'السنه', 'سنن', 'صحيح', 'مسند', 'مصطلح الحديث', 'رجال الحديث'],
		negativeAliases: ['تاريخ', 'ادب عربي', 'نحو']
	},
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية',
		aliases: [
			'فقه',
			'اصول الفقه',
			'احكام',
			'فتاوي',
			'عبادات',
			'معاملات',
			'طهاره',
			'صلاه',
			'زكاه',
			'صيام',
			'حج',
			'نكاح',
			'طلاق',
			'بيوع',
			'مواريث'
		],
		negativeAliases: ['تاريخ', 'سيره', 'عقيده', 'ادب عربي', 'شعر']
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة',
		aliases: ['عقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'فرق', 'ملل', 'نحل'],
		negativeAliases: ['تاريخ', 'ادب عربي', 'فقه']
	},
	{
		key: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'كتب السيرة النبوية',
		aliases: ['سيره', 'شمائل', 'مغازي', 'النبي', 'رسول الله'],
		negativeAliases: ['فقه', 'عقيده', 'ادب عربي']
	},
	{
		key: 'history',
		mainName: 'التاريخ الإسلامي',
		subName: 'التاريخ والتراجم',
		secondaryName: 'كتب التاريخ والتراجم',
		aliases: ['تاريخ', 'تراجم', 'طبقات', 'انساب', 'بلدان', 'فتوح', 'وفيات', 'اعلام'],
		negativeAliases: ['عقيده', 'فقه', 'فتاوي', 'ادب عربي']
	},
	{
		key: 'tazkiyah',
		mainName: 'التربية والتزكية',
		subName: 'آداب طلب العلم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		aliases: [
			'تزكيه',
			'اخلاق',
			'اداب طلب العلم',
			'طلب العلم',
			'نصائح',
			'وصايا',
			'توجيهات',
			'تعليمات',
			'موعظه',
			'رقائق',
			'سلوك',
			'تربيه',
			'تعليم',
			'علميه',
			'اداب العلم',
			'اداب العالم',
			'اداب المتعلم'
		],
		negativeAliases: ['ادب عربي', 'شعر', 'روايه', 'تاريخ', 'فقه']
	},
	{
		key: 'arabic_literature',
		mainName: 'اللغة العربية وآدابها',
		subName: 'الأدب واللغة',
		secondaryName: 'كتب الأدب واللغة',
		aliases: [
			'لغه عربيه',
			'نحو',
			'صرف',
			'بلاغه',
			'ادب عربي',
			'شعر',
			'روايه',
			'قصه',
			'معاجم',
			'ديوان'
		],
		negativeAliases: ['فقه', 'عقيده', 'حديث', 'تفسير']
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'كتب الدعوة والإرشاد',
		aliases: ['دعوه', 'ارشاد', 'خطب', 'محاضرات', 'اسلاميه عامه', 'ثقافه اسلاميه'],
		negativeAliases: ['فقه', 'عقيده', 'تاريخ', 'ادب عربي']
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

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function scoreTextAgainstAliases(text, aliases = []) {
	const n = normalizeArabic(text);
	if (!n) return 0;
	let score = 0;
	for (const alias of aliases) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) score += 12;
		else if (n.includes(a) || a.includes(n)) score += 8;
		else {
			const aliasTokens = a.split(' ').filter((w) => w.length >= 3);
			for (const t of aliasTokens) {
				if (n.split(' ').includes(t)) score += 2;
			}
		}
	}
	return score;
}

function scoreSectionName(sectionName, haystack, tokens, profile = null) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	if (profile) {
		score += scoreTextAgainstAliases(sectionName, profile.aliases || []);
		score -= scoreTextAgainstAliases(sectionName, profile.negativeAliases || []) * 2;
	}
	return score;
}

function detectDomain(bookMeta) {
	const haystack = normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		]
			.filter(Boolean)
			.join(' ')
	);
	let best = null;
	let bestScore = 0;
	for (const profile of DOMAIN_PROFILES) {
		const positive = scoreTextAgainstAliases(haystack, profile.aliases);
		const negative = scoreTextAgainstAliases(haystack, profile.negativeAliases);
		const score = positive - negative;
		if (score > bestScore) {
			bestScore = score;
			best = profile;
		}
	}
	return best && bestScore >= 3 ? { profile: best, score: bestScore, haystack } : null;
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

function cleanSectionName(name, fallback) {
	return String(name || fallback || '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 90);
}

function proposedSecondaryName(bookMeta, profile = null) {
	if (profile?.secondaryName) return profile.secondaryName;
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4) return cleanSectionName(stem, 'كتب متنوّعة');
	const hint = (bookMeta?.categoryHints || []).find(Boolean);
	return cleanSectionName(hint, 'كتب متنوّعة');
}

function findBestMain(sections, bookMeta, profile = null) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = -Infinity;
	for (const m of sections.tree || []) {
		let score = scoreSectionName(m.name, haystack, tokens, profile);
		for (const sub of m.children || []) {
			score = Math.max(score, scoreSectionName(sub.name, haystack, tokens, profile) + 2);
			for (const sec of sub.children || []) {
				score = Math.max(score, scoreSectionName(sec.name, haystack, tokens, profile) + 1);
			}
		}
		if (score > bestScore) {
			bestScore = score;
			best = m;
		}
	}
	return best ? { node: best, score: bestScore } : null;
}

function findBestSub(mainNode, bookMeta, profile = null) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = -Infinity;
	for (const sub of mainNode?.children || []) {
		let score = scoreSectionName(sub.name, haystack, tokens, profile);
		for (const sec of sub.children || []) {
			score = Math.max(score, scoreSectionName(sec.name, haystack, tokens, profile) + 1);
		}
		if (score > bestScore) {
			bestScore = score;
			best = sub;
		}
	}
	return best ? { node: best, score: bestScore } : null;
}

function findBestSecondary(subNode, bookMeta, profile = null) {
	const haystack = haystackForReuse(bookMeta);
	const tokens = tokensOf(haystack);
	const proposed = proposedSecondaryName(bookMeta, profile);
	let best = null;
	let bestScore = -Infinity;
	for (const sec of subNode?.children || []) {
		const score =
			scoreSectionName(sec.name, haystack, tokens, profile) +
			scoreSecondaryForReuse(sec, bookMeta, proposed);
		if (score > bestScore) {
			bestScore = score;
			best = sec;
		}
	}
	return best ? { node: best, score: bestScore } : null;
}

function fallbackCreateMain(bookMeta, profile = null, confidence = 0.35) {
	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: cleanSectionName(profile?.mainName, 'المكتبة'),
		newSubName: cleanSectionName(profile?.subName, 'كتب متنوّعة'),
		newSecondaryName: proposedSecondaryName(bookMeta, profile),
		confidence,
		reasoning: 'لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار ثلاثي جديد.',
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
		return fallbackCreateMain(bookMeta, detectDomain(bookMeta)?.profile || null, 0.25);
	}

	const domain = detectDomain(bookMeta);
	const profile = domain?.profile || null;
	const main = findBestMain(sections, bookMeta, profile);
	const mainMinScore = profile ? 4 : 2;
	if (!main || main.score < mainMinScore) {
		return fallbackCreateMain(bookMeta, profile, profile ? 0.55 : 0.3);
	}

	const sub = findBestSub(main.node, bookMeta, profile);
	const subMinScore = profile ? 3 : 1;
	if (!sub || sub.score < subMinScore) {
		return {
			kind: 'create_sub',
			mainId: String(main.node.id),
			subId: null,
			secondaryId: null,
			newSubName: cleanSectionName(profile?.subName, 'كتب متنوّعة'),
			newSecondaryName: proposedSecondaryName(bookMeta, profile),
			confidence: profile ? 0.62 : 0.4,
			reasoning: `وُجد قسم رئيسي مناسب "${main.node.name}"، ولا يوجد فرع دقيق — إنشاء فرع وثانوي مناسبين.`,
			method: 'heuristic'
		};
	}

	const sec = findBestSecondary(sub.node, bookMeta, profile);
	const secMinScore = profile ? 7 : 4;
	if (!sec || sec.score < secMinScore) {
		const autoSec = pickReuseSecondary(sections, String(sub.node.id), bookMeta, {
			proposedNewName: proposedSecondaryName(bookMeta, profile),
			minScore: secMinScore
		});
		if (autoSec) {
			return {
				kind: 'existing',
				mainId: String(main.node.id),
				subId: String(sub.node.id),
				secondaryId: autoSec.id,
				confidence: profile ? 0.72 : 0.52,
				reasoning: `مطابقة ثلاثية موجودة: ${main.node.name} ← ${sub.node.name} ← ${autoSec.name}.`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(main.node.id),
			subId: String(sub.node.id),
			secondaryId: null,
			newSecondaryName: proposedSecondaryName(bookMeta, profile),
			confidence: profile ? 0.68 : 0.45,
			reasoning: `وُجد المسار الأعلى "${main.node.name} ← ${sub.node.name}"، ولا يوجد قسم ثانوي مناسب — إنشاء ثانوي.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.node.id),
		subId: String(sub.node.id),
		secondaryId: String(sec.node.id),
		confidence: Math.min(0.55 + Math.max(0, main.score) * 0.03 + Math.max(0, sub.score) * 0.03, 0.92),
		reasoning: `مطابقة ثلاثية: ${main.node.name} ← ${sub.node.name} ← ${sec.node.name}.`,
		method: 'heuristic'
	};
}
