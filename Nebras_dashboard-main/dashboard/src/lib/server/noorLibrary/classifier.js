/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 *
 * يعتمد التصنيف على قواعد موضوعية محلية قبل fallback النصّي حتى لا تختلط
 * أبواب العلم المتقاربة ظاهرياً: الآداب الشرعية لا تذهب إلى الفقه، والتاريخ
 * لا يذهب إلى العقيدة، والأدب العربي لا يلتبس بآداب طالب العلم.
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

const GENERIC_SECONDARY_NAME = 'كتب متنوّعة';

const DOMAIN_RULES = Object.freeze([
	{
		id: 'talab_alilm',
		mainName: 'التزكية والأخلاق',
		mainAliases: ['التزكية', 'الأخلاق', 'الآداب الشرعية', 'الرقائق والسلوك'],
		subName: 'آداب طالب العلم',
		subAliases: ['طلب العلم', 'آداب طلب العلم', 'العلم والتعليم', 'التعليم الشرعي'],
		secondaryName: 'طلب العلم وآدابه',
		secondaryAliases: ['آداب المتعلم', 'آداب العالم والمتعلم', 'نصائح لطلاب العلم'],
		keywords: [
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'اداب طلب العلم',
			'اداب طالب العلم',
			'اداب المتعلم',
			'اداب العالم',
			'العلم والتعليم',
			'التعليم الشرعي',
			'التعليمات العلمية',
			'النصائح العلمية',
			'نصائح',
			'وصايا',
			'المعلم',
			'المتعلم'
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		mainAliases: ['الفقه', 'فقه وأصوله', 'الأحكام الشرعية'],
		subName: 'الفقه وأصوله',
		subAliases: ['أصول الفقه', 'فقه العبادات', 'فقه المعاملات', 'المذاهب الفقهية'],
		secondaryName: 'مسائل فقهية',
		secondaryAliases: ['العبادات والمعاملات', 'الفتاوى والأحكام'],
		keywords: [
			'فقه',
			'اصول الفقه',
			'احكام',
			'فتاوي',
			'فتاوى',
			'طهاره',
			'صلاه',
			'زكاه',
			'صيام',
			'حج',
			'معاملات',
			'مواريث'
		]
	},
	{
		id: 'aqida',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
		subName: 'العقيدة والتوحيد',
		subAliases: ['التوحيد', 'الإيمان', 'الفرق والمذاهب'],
		secondaryName: 'كتب العقيدة',
		secondaryAliases: ['مسائل التوحيد', 'الإيمان والاعتقاد'],
		keywords: [
			'عقيده',
			'توحيد',
			'ايمان',
			'اسماء الله',
			'صفات',
			'اشاعره',
			'ماتريديه',
			'سلف',
			'فرق',
			'مذاهب اعتقاديه'
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		mainAliases: ['الحديث', 'السنة النبوية', 'علوم الحديث'],
		subName: 'الحديث وعلومه',
		subAliases: ['مصطلح الحديث', 'شروح الحديث', 'السنة'],
		secondaryName: 'كتب الحديث',
		secondaryAliases: ['شروح الحديث', 'مصطلح الحديث'],
		keywords: [
			'حديث',
			'احاديث',
			'سنه',
			'سنن',
			'صحيح البخاري',
			'صحيح مسلم',
			'مصطلح الحديث',
			'اسناد',
			'رجال الحديث'
		]
	},
	{
		id: 'quran',
		mainName: 'القرآن الكريم',
		mainAliases: ['القرآن', 'علوم القرآن', 'التفسير'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن', 'التجويد والقراءات'],
		secondaryName: 'كتب التفسير وعلوم القرآن',
		secondaryAliases: ['التفسير', 'علوم القرآن', 'القراءات والتجويد'],
		keywords: [
			'قران',
			'القران',
			'تفسير',
			'تفاسير',
			'علوم القران',
			'تجويد',
			'قراءات',
			'سور',
			'ايات'
		]
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		mainAliases: ['السيرة', 'شمائل النبي', 'المغازي'],
		subName: 'السيرة والشمائل',
		subAliases: ['السيرة النبوية', 'الشمائل المحمدية', 'المغازي'],
		secondaryName: 'كتب السيرة النبوية',
		secondaryAliases: ['الشمائل', 'المغازي'],
		keywords: [
			'سيره نبويه',
			'السيره',
			'شمائل',
			'مغازي',
			'حياه النبي',
			'محمد رسول الله',
			'غزوه',
			'غزوات'
		]
	},
	{
		id: 'history',
		mainName: 'التاريخ الإسلامي',
		mainAliases: ['التاريخ', 'تاريخ الإسلام', 'الحضارة الإسلامية'],
		subName: 'التاريخ والحضارة',
		subAliases: ['التاريخ الإسلامي', 'التراجم والطبقات', 'البلدان والرحلات'],
		secondaryName: 'كتب التاريخ الإسلامي',
		secondaryAliases: ['التراجم', 'الطبقات', 'الحضارة الإسلامية'],
		keywords: [
			'تاريخ',
			'تاريخ الاسلام',
			'حضاره',
			'خلافه',
			'اموي',
			'عباسي',
			'اندلس',
			'تراجم',
			'طبقات',
			'وفيات',
			'سير اعلام'
		]
	},
	{
		id: 'akhlaq',
		mainName: 'التزكية والأخلاق',
		mainAliases: ['التزكية', 'الأخلاق', 'الرقائق والسلوك', 'الآداب الشرعية'],
		subName: 'الأخلاق والآداب الشرعية',
		subAliases: ['الأخلاق', 'الآداب الشرعية', 'الرقائق', 'السلوك'],
		secondaryName: 'كتب الأخلاق والآداب',
		secondaryAliases: ['الآداب الشرعية', 'الرقائق والسلوك'],
		keywords: [
			'اخلاق',
			'اداب شرعيه',
			'تزكيه',
			'رقائق',
			'سلوك',
			'زهد',
			'موعظه',
			'موعظة',
			'وصايا',
			'نصائح'
		]
	},
	{
		id: 'arabic_literature',
		mainName: 'اللغة العربية',
		mainAliases: ['العربية', 'الأدب العربي', 'اللغة والأدب'],
		subName: 'الأدب واللغة العربية',
		subAliases: ['الأدب العربي', 'النحو والصرف', 'البلاغة'],
		secondaryName: 'كتب الأدب واللغة',
		secondaryAliases: ['الأدب العربي', 'علوم اللغة العربية'],
		keywords: [
			'ادب عربي',
			'الشعر',
			'ديوان',
			'روايه',
			'قصه',
			'نحو',
			'صرف',
			'بلاغه',
			'لغه عربيه',
			'معجم'
		]
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		mainAliases: ['الدعوة', 'الثقافة الإسلامية', 'الفكر الإسلامي'],
		subName: 'الدعوة والإرشاد',
		subAliases: ['الدعوة', 'الإرشاد', 'الثقافة الإسلامية'],
		secondaryName: 'كتب الدعوة والإرشاد',
		secondaryAliases: ['الدعوة', 'الإرشاد'],
		keywords: [
			'دعوه',
			'دعاة',
			'ارشاد',
			'خطب',
			'محاضرات',
			'ثقافه اسلاميه',
			'فكر اسلامي',
			'اصلاح'
		]
	}
])

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	)
}

function normalizedLabels(labels) {
	return labels.map(normalizeArabic).filter(Boolean)
}

function keywordScore(haystack, tokens, keywords) {
	let score = 0
	for (const raw of keywords || []) {
		const k = normalizeArabic(raw)
		if (!k) continue
		if (haystack.includes(k)) {
			score += k.includes(' ') ? 4 : 2
			continue
		}
		const parts = k.split(' ').filter((p) => p.length >= 3)
		if (parts.length && parts.every((p) => tokens.has(p))) score += 2
	}
	return score
}

function scoreSectionName(name, labels, haystack, tokens, keywords = []) {
	const n = normalizeArabic(name)
	if (!n) return 0
	let score = 0
	for (const label of normalizedLabels(labels)) {
		if (n === label) score += 30
		else if (n.includes(label) || label.includes(n)) score += 18
		else {
			const labelTokens = tokensOf(label)
			for (const t of labelTokens) {
				if (n.includes(t)) score += 3
			}
		}
	}
	score += keywordScore(n, tokensOf(n), keywords) * 0.8
	if (haystack.includes(n) && n.length >= 4) score += 5
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1
	}
	return score
}

function pickDomainRule(bookMeta, haystack, tokens) {
	let best = null
	let bestScore = 0
	for (const rule of DOMAIN_RULES) {
		const score = keywordScore(haystack, tokens, [
			...(rule.keywords || []),
			rule.mainName,
			rule.subName,
			rule.secondaryName,
			...(rule.mainAliases || []),
			...(rule.subAliases || []),
			...(rule.secondaryAliases || [])
		])
		if (score > bestScore) {
			best = rule
			bestScore = score
		}
	}
	if (!best || bestScore < 3) return null
	return { rule: best, score: bestScore }
}

function findBestMainByRule(tree, rule, haystack, tokens) {
	let best = null
	let bestScore = 0
	for (const m of tree || []) {
		const score = scoreSectionName(
			m.name,
			[rule.mainName, ...(rule.mainAliases || [])],
			haystack,
			tokens,
			rule.keywords
		)
		if (score > bestScore) {
			best = m
			bestScore = score
		}
	}
	return best && bestScore >= 8 ? { node: best, score: bestScore } : null
}

function findBestSubByRule(main, rule, haystack, tokens) {
	let best = null
	let bestScore = 0
	for (const sub of main?.children || []) {
		const score = scoreSectionName(
			sub.name,
			[rule.subName, ...(rule.subAliases || [])],
			haystack,
			tokens,
			rule.keywords
		)
		if (score > bestScore) {
			best = sub
			bestScore = score
		}
	}
	return best && bestScore >= 7 ? { node: best, score: bestScore } : null
}

function findBestSecondaryByRule(sub, rule, bookMeta, haystack, tokens) {
	const proposed = proposeSecondaryName(bookMeta, rule)
	let best = null
	let bestScore = 0
	for (const sec of sub?.children || []) {
		const score = scoreSecondaryForReuse(sec, bookMeta, proposed) +
			scoreSectionName(
				sec.name,
				[rule.secondaryName, proposed, ...(rule.secondaryAliases || [])],
				haystack,
				tokens,
				rule.keywords
			)
		if (score > bestScore) {
			best = sec
			bestScore = score
		}
	}
	return best && bestScore >= 8 ? { node: best, score: bestScore } : null
}

function proposeSecondaryName(bookMeta, rule = null) {
	if (rule?.secondaryName) return rule.secondaryName
	const hints = (bookMeta?.categoryHints || [])
		.map((x) => String(x || '').trim())
		.filter((x) => x && x.length <= 60)
	if (hints[0]) return hints[0]
	const stem = seriesStemFromTitle(bookMeta?.title || '')
	return stem && stem.length <= 80 ? stem : GENERIC_SECONDARY_NAME
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
	const tokens = tokensOf(haystack);

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

	let bestMain = null, bestMainScore = 0;
	for (const m of tree) {
		const s = scoreOf(m.name);
		if (s > bestMainScore) { bestMainScore = s; bestMain = m; }
	}
	if (!bestMain) return null;

	let bestSub = null, bestSubScore = 0;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub) return null;

	let bestSec = null, bestSecScore = 0;
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
	const haystack = haystackForReuse(bookMeta);
	const tokens = tokensOf(haystack);
	const domain = pickDomainRule(bookMeta, haystack, tokens);

	if (domain) {
		const { rule, score: domainScore } = domain;
		const main = findBestMainByRule(sections.tree, rule, haystack, tokens);
		if (!main) {
			return {
				kind: 'create_main',
				mainId: null,
				subId: null,
				secondaryId: null,
				newMainName: rule.mainName,
				newSubName: rule.subName,
				newSecondaryName: proposeSecondaryName(bookMeta, rule),
				confidence: Math.min(0.52 + domainScore * 0.025, 0.82),
				reasoning: `تصنيف موضوعي: "${rule.subName}" — لا يوجد قسم رئيسي مناسب، سيُنشأ المسار الثلاثي.`,
				method: 'heuristic'
			};
		}

		const sub = findBestSubByRule(main.node, rule, haystack, tokens);
		if (!sub) {
			return {
				kind: 'create_sub',
				mainId: String(main.node.id),
				subId: null,
				secondaryId: null,
				newSubName: rule.subName,
				newSecondaryName: proposeSecondaryName(bookMeta, rule),
				confidence: Math.min(0.58 + domainScore * 0.025, 0.86),
				reasoning: `تصنيف موضوعي داخل "${main.node.name}" — سيُنشأ فرع "${rule.subName}" مع قسمه الثانوي.`,
				method: 'heuristic'
			};
		}

		const secondary = findBestSecondaryByRule(sub.node, rule, bookMeta, haystack, tokens);
		if (!secondary) {
			return {
				kind: 'create_secondary',
				mainId: String(main.node.id),
				subId: String(sub.node.id),
				secondaryId: null,
				newSecondaryName: proposeSecondaryName(bookMeta, rule),
				confidence: Math.min(0.62 + domainScore * 0.02, 0.88),
				reasoning: `تصنيف موضوعي: ${main.node.name} ← ${sub.node.name} — سيُنشأ قسم ثانوي مناسب.`,
				method: 'heuristic'
			};
		}

		return {
			kind: 'existing',
			mainId: String(main.node.id),
			subId: String(sub.node.id),
			secondaryId: String(secondary.node.id),
			confidence: Math.min(0.68 + domainScore * 0.02, 0.92),
			reasoning: `تصنيف موضوعي: ${main.node.name} ← ${sub.node.name} ← ${secondary.node.name}.`,
			method: 'heuristic'
		};
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		const fallbackSubName = proposeSecondaryName(bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'المكتبة',
			newSubName: fallbackSubName,
			newSecondaryName: fallbackSubName,
			confidence: 0.25,
			reasoning: 'لم تعطِ المطابقة نتيجة موثوقة — سيُنشأ مسار ثلاثي محافظ بدلاً من وضع الكتاب عشوائياً.',
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
			secondaryId: null,
			newSecondaryName: proposeSecondaryName(bookMeta),
			confidence: Math.min(sug.confidence, 0.72),
			reasoning: `${sug.reasoning} — لا يوجد قسم ثانوي مناسب، سيُنشأ قسم ثانوي قبل إضافة المحتوى.`,
			method: 'heuristic'
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
