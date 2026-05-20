/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary].
 *
 * التصنيف محلي بالكامل: قواعد موضوعيّة محافظة + fallback نصّي. عند غياب
 * قسم مناسب لا نضع الكتاب في أوّل قسم عشوائي؛ نُرجع قرار إنشاء قسم في
 * المستوى الصحيح حتى يبقى المحتوى داخل مسار ثلاثي واضح.
 */

import { validateHierarchyPath } from './sectionsTree.js'

const STOP_WORDS = new Set([
	'كتاب',
	'كتب',
	'في',
	'من',
	'الى',
	'علي',
	'عن',
	'مع',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'شرح',
	'متن',
	'مختصر',
	'رساله',
	'رسائل',
	'المجلد',
	'الجزء',
	'جزء',
	'جلد',
	'طبعه',
	'pdf'
])

const GENERIC_ISLAMIC_MAIN_ALIASES = [
	'كتب اسلاميه',
	'اسلاميات',
	'العلوم الاسلاميه',
	'الشريعه الاسلاميه',
	'علوم شرعيه'
]

const TOPIC_RULES = Object.freeze([
	{
		id: 'adab_ilm',
		mainName: 'التزكية والأخلاق',
		mainAliases: ['التزكية', 'الأخلاق', 'الآداب', 'الرقائق', 'السلوك', 'التربية'],
		subName: 'آداب طلب العلم',
		subAliases: [
			'آداب طلب العلم',
			'طلب العلم',
			'العلم والتعليم',
			'التعليم',
			'التربية العلمية',
			'آداب العلم',
			'العلم'
		],
		secondaryName: 'النصائح والتوجيهات العلمية',
		secondaryAliases: [
			'النصائح العلمية',
			'التوجيهات العلمية',
			'آداب العالم والمتعلم',
			'آداب طالب العلم',
			'طالب العلم',
			'طلب العلم'
		],
		keywords: [
			'نصائح',
			'نصيحة',
			'تعليمات',
			'توجيهات',
			'علمية',
			'طلب العلم',
			'طالب العلم',
			'المتعلم',
			'العالم والمتعلم',
			'اداب العلم',
			'آداب العلم',
			'التعليم'
		],
		priority: 8
	},
	{
		id: 'quran',
		mainName: 'القرآن وعلومه',
		mainAliases: ['القرآن', 'علوم القرآن', 'التفسير', 'تفسير وعلوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن', 'تفسير القرآن', 'التجويد والقراءات'],
		secondaryName: 'التفسير وعلوم القرآن',
		secondaryAliases: ['التفسير', 'علوم القرآن', 'تفسير القرآن', 'القراءات', 'التجويد'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'تفاسير', 'آية', 'سورة', 'تجويد', 'قراءات', 'مصحف']
	},
	{
		id: 'hadith',
		mainName: 'الحديث وعلومه',
		mainAliases: ['الحديث', 'علوم الحديث', 'السنة', 'الحديث الشريف'],
		subName: 'متون وشروح الحديث',
		subAliases: ['متون الحديث', 'شروح الحديث', 'كتب الحديث', 'علوم الحديث', 'مصطلح الحديث'],
		secondaryName: 'متون وشروح الحديث',
		secondaryAliases: ['شرح الحديث', 'متون الحديث', 'صحيح', 'سنن', 'مسند', 'مصطلح الحديث'],
		keywords: ['حديث', 'احاديث', 'صحيح', 'سنن', 'مسند', 'مصطلح الحديث', 'الجرح والتعديل', 'علل الحديث']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		mainAliases: ['الفقه', 'أصول الفقه', 'فقه واصوله', 'الفقه الإسلامي'],
		subName: 'الفقه الإسلامي',
		subAliases: ['الفقه', 'فقه العبادات', 'فقه المعاملات', 'أصول الفقه', 'العبادات'],
		secondaryName: 'الفقه الإسلامي',
		secondaryAliases: ['فقه', 'عبادات', 'معاملات', 'أصول الفقه', 'فتاوى'],
		keywords: [
			'فقه',
			'اصول الفقه',
			'أصول الفقه',
			'طهارة',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'عمرة',
			'بيع',
			'نكاح',
			'طلاق',
			'فرائض',
			'مواريث',
			'فتاوى'
		]
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة', 'التوحيد', 'الايمان', 'الإيمان'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان', 'أسماء الله وصفاته'],
		secondaryName: 'التوحيد والعقيدة',
		secondaryAliases: ['التوحيد', 'العقيدة', 'الإيمان', 'أسماء الله وصفاته'],
		keywords: ['عقيدة', 'العقيده', 'توحيد', 'ايمان', 'إيمان', 'اسماء الله', 'صفات', 'شرك']
	},
	{
		id: 'sirah_history',
		mainName: 'السيرة والتاريخ',
		mainAliases: ['السيرة', 'التاريخ', 'السيرة النبوية', 'التاريخ الإسلامي'],
		subName: 'السيرة والتاريخ الإسلامي',
		subAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'الفتوحات', 'الخلفاء', 'تراجم'],
		secondaryName: 'السيرة والتاريخ الإسلامي',
		secondaryAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'الخلفاء', 'الصحابة', 'التراجم'],
		keywords: ['سيرة', 'النبوية', 'تاريخ', 'غزوات', 'خلفاء', 'صحابة', 'تراجم', 'فتوحات']
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		mainAliases: ['التزكية', 'الأخلاق', 'الآداب', 'الرقائق', 'السلوك'],
		subName: 'الآداب والأخلاق',
		subAliases: ['الآداب', 'الأخلاق', 'التزكية', 'الرقائق', 'السلوك'],
		secondaryName: 'الآداب والأخلاق',
		secondaryAliases: ['أخلاق', 'آداب', 'تزكية', 'رقائق', 'سلوك'],
		keywords: ['اخلاق', 'أخلاق', 'اداب', 'آداب', 'تزكية', 'زهد', 'رقائق', 'سلوك', 'موعظة']
	},
	{
		id: 'dua',
		mainName: 'العبادات والأذكار',
		mainAliases: ['الأذكار', 'الدعاء', 'العبادات', 'الرقية'],
		subName: 'الأذكار والدعاء',
		subAliases: ['الأذكار', 'الدعاء', 'الأوراد', 'الرقية الشرعية'],
		secondaryName: 'الأذكار والدعاء',
		secondaryAliases: ['أذكار', 'دعاء', 'أدعية', 'ورد', 'رقية'],
		keywords: ['اذكار', 'أذكار', 'دعاء', 'ادعية', 'أدعية', 'اوراد', 'أوراد', 'رقية']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية',
		mainAliases: ['اللغة العربية', 'النحو', 'الصرف', 'البلاغة', 'الأدب العربي'],
		subName: 'علوم اللغة العربية',
		subAliases: ['النحو والصرف', 'النحو', 'الصرف', 'البلاغة', 'الأدب'],
		secondaryName: 'علوم اللغة العربية',
		secondaryAliases: ['النحو', 'الصرف', 'البلاغة', 'الأدب', 'العروض'],
		keywords: ['نحو', 'صرف', 'بلاغة', 'لغة عربية', 'اعراب', 'إعراب', 'عروض', 'ادب عربي']
	}
])

// ── Arabic normalization ─────────────────────────────────────────────
function normalizeArabic(s) {
	return String(s || '')
		.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '')
		.replace(/\u0640/g, '')
		.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
		.replace(/\u0649/g, '\u064A')
		.replace(/\u0629/g, '\u0647')
		.replace(/[^\p{Script=Arabic}0-9a-zA-Z\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase()
}

function wordsOf(s) {
	return normalizeArabic(s)
		.split(' ')
		.map((w) => w.trim())
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
}

function tokenSetOf(s) {
	return new Set(wordsOf(s))
}

function tokenSetsOverlapRatio(setA, setB) {
	if (!setA.size || !setB.size) return 0
	let inter = 0
	for (const t of setA) if (setB.has(t)) inter += 1
	return inter / new Set([...setA, ...setB]).size
}

/** يستخرج جذع العنوان بإزالة ترقيم الأجزاء الشائع. */
function seriesStemFromTitle(title) {
	let t = normalizeArabic(title)
	if (!t) return ''
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	)
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '')
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '')
	return t.replace(/\s+/g, ' ').trim()
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
	)
}

function hasAny(haystack, phrases) {
	const tokens = tokenSetOf(haystack)
	for (const phrase of phrases) {
		const p = normalizeArabic(phrase)
		if (!p) continue
		if (haystack.includes(p)) return true
		const pTokens = wordsOf(p)
		if (pTokens.length && pTokens.every((t) => tokens.has(t))) return true
	}
	return false
}

function ruleScore(rule, bookMeta) {
	const haystack = haystackForReuse(bookMeta)
	const tokens = tokenSetOf(haystack)
	let score = 0
	for (const keyword of rule.keywords || []) {
		const k = normalizeArabic(keyword)
		if (!k) continue
		if (haystack.includes(k)) {
			score += wordsOf(k).length > 1 ? 5 : 3
			continue
		}
		for (const t of wordsOf(k)) {
			if (tokens.has(t)) score += 1
		}
	}
	return score > 0 ? score + Number(rule.priority || 0) : 0
}

function pickTopicRule(bookMeta) {
	let best = null
	let bestScore = 0
	for (const rule of TOPIC_RULES) {
		const score = ruleScore(rule, bookMeta)
		if (score > bestScore) {
			bestScore = score
			best = rule
		}
	}
	if (!best || bestScore < 3) return null
	return { rule: best, score: bestScore }
}

function scoreNameAgainst(name, aliases = [], keywords = []) {
	const normalized = normalizeArabic(name)
	if (!normalized) return 0
	const nameTokens = tokenSetOf(normalized)
	let score = 0
	for (const alias of aliases) {
		const a = normalizeArabic(alias)
		if (!a) continue
		if (normalized === a) score = Math.max(score, 100)
		else if (normalized.includes(a) || a.includes(normalized)) score = Math.max(score, 72)
		else {
			const ratio = tokenSetsOverlapRatio(nameTokens, tokenSetOf(a))
			if (ratio >= 0.5) score = Math.max(score, 44)
			else if (ratio >= 0.25) score = Math.max(score, 24)
		}
	}
	for (const keyword of keywords) {
		const k = normalizeArabic(keyword)
		if (!k) continue
		if (normalized.includes(k) || k.includes(normalized)) score += 5
		else score += tokenSetsOverlapRatio(nameTokens, tokenSetOf(k)) * 8
	}
	return score
}

function findBestNode(nodes, aliases, keywords, minScore = 20) {
	let best = null
	let bestScore = 0
	for (const node of nodes || []) {
		const score = scoreNameAgainst(node?.name, aliases, keywords)
		if (score > bestScore) {
			best = node
			bestScore = score
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null
}

function resolveRuleNames(rule, bookMeta) {
	const haystack = haystackForReuse(bookMeta)
	const names = {
		mainName: rule.mainName,
		subName: rule.subName,
		secondaryName: rule.secondaryName,
		mainAliases: [...(rule.mainAliases || []), rule.mainName, ...GENERIC_ISLAMIC_MAIN_ALIASES],
		subAliases: [...(rule.subAliases || []), rule.subName],
		secondaryAliases: [...(rule.secondaryAliases || []), rule.secondaryName]
	}

	if (rule.id === 'fiqh') {
		if (hasAny(haystack, ['اصول الفقه', 'أصول الفقه', 'القواعد الفقهية'])) {
			names.subName = 'أصول الفقه والقواعد الفقهية'
			names.secondaryName = 'أصول الفقه'
		} else if (hasAny(haystack, ['صلاة', 'طهارة', 'زكاة', 'صيام', 'حج', 'عمرة'])) {
			names.subName = 'فقه العبادات'
			if (hasAny(haystack, ['صلاة', 'طهارة'])) names.secondaryName = 'الصلاة والطهارة'
			else if (hasAny(haystack, ['زكاة'])) names.secondaryName = 'الزكاة'
			else if (hasAny(haystack, ['صيام'])) names.secondaryName = 'الصيام'
			else if (hasAny(haystack, ['حج', 'عمرة'])) names.secondaryName = 'الحج والعمرة'
		} else if (hasAny(haystack, ['بيع', 'معاملات', 'نكاح', 'طلاق', 'مواريث', 'فرائض'])) {
			names.subName = 'فقه المعاملات والأحوال الشخصية'
			names.secondaryName = hasAny(haystack, ['مواريث', 'فرائض']) ? 'المواريث والفرائض' : 'المعاملات والأحوال الشخصية'
		}
	} else if (rule.id === 'quran' && hasAny(haystack, ['تجويد', 'قراءات'])) {
		names.subName = 'التجويد والقراءات'
		names.secondaryName = 'التجويد والقراءات'
	} else if (rule.id === 'hadith' && hasAny(haystack, ['مصطلح الحديث', 'علل الحديث', 'الجرح والتعديل'])) {
		names.subName = 'علوم الحديث'
		names.secondaryName = 'مصطلح الحديث وعلومه'
	} else if (rule.id === 'sirah_history' && hasAny(haystack, ['سيرة', 'النبوية', 'غزوات'])) {
		names.subName = 'السيرة النبوية'
		names.secondaryName = 'السيرة النبوية'
	} else if (rule.id === 'arabic') {
		if (hasAny(haystack, ['نحو', 'اعراب', 'إعراب'])) {
			names.subName = 'النحو والصرف'
			names.secondaryName = 'النحو'
		} else if (hasAny(haystack, ['بلاغة', 'بيان', 'معاني'])) {
			names.subName = 'البلاغة'
			names.secondaryName = 'البلاغة'
		}
	}

	names.subAliases = [...new Set([...names.subAliases, names.subName])]
	names.secondaryAliases = [...new Set([...names.secondaryAliases, names.secondaryName])]
	return names
}

function classifyByRule(sections, bookMeta, ruleHit) {
	const { rule } = ruleHit
	const names = resolveRuleNames(rule, bookMeta)
	const mainHit = findBestNode(
		sections.tree,
		names.mainAliases,
		rule.keywords,
		18
	)

	if (!mainHit) {
		return {
			kind: 'create_main',
			mainId: '',
			subId: '',
			secondaryId: null,
			newMainName: names.mainName,
			newSubName: names.subName,
			newSecondaryName: names.secondaryName,
			confidence: Math.min(0.72 + ruleHit.score * 0.01, 0.94),
			reasoning: `قاعدة موضوعية: لا يوجد قسم رئيسي مناسب لـ "${names.mainName}"`,
			method: `topic:${rule.id}`
		}
	}

	const main = mainHit.node
	const subHit = findBestNode(
		main.children || [],
		names.subAliases,
		rule.keywords,
		18
	)
	if (!subHit) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: '',
			secondaryId: null,
			newSubName: names.subName,
			newSecondaryName: names.secondaryName,
			confidence: Math.min(0.72 + ruleHit.score * 0.01, 0.94),
			reasoning: `قاعدة موضوعية: القسم الرئيسي موجود ولا يوجد فرع مناسب لـ "${names.subName}"`,
			method: `topic:${rule.id}`
		}
	}

	const sub = subHit.node
	const secondaryHit = findBestNode(
		sub.children || [],
		names.secondaryAliases,
		rule.keywords,
		18
	)
	if (secondaryHit) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondaryHit.node.id),
			confidence: Math.min(0.76 + ruleHit.score * 0.01, 0.96),
			reasoning: `قاعدة موضوعية: ${main.name} > ${sub.name} > ${secondaryHit.node.name}`,
			method: `topic:${rule.id}`
		}
	}

	const reuse = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: names.secondaryName,
		minScore: 9
	})
	if (reuse) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(reuse.id),
			confidence: Math.min(0.7 + ruleHit.score * 0.01, 0.9),
			reasoning: `إعادة استخدام قسم ثانوي قريب: ${reuse.name}`,
			method: `topic:${rule.id}:reuse`
		}
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: names.secondaryName,
		confidence: Math.min(0.72 + ruleHit.score * 0.01, 0.94),
		reasoning: `قاعدة موضوعية: الفرع موجود ولا يوجد قسم ثانوي مناسب لـ "${names.secondaryName}"`,
		method: `topic:${rule.id}`
	}
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار تقاطع كلماتها مع
 * (title + categoryHints + description). لا يقبل نتيجة صفرية حتى لا يخلط
 * كتب الآداب بالفقه أو التاريخ بالعقيدة.
 */
function classifyHeuristic({ tree }, bookMeta) {
	const haystack = haystackForReuse(bookMeta)
	const tokens = tokenSetOf(haystack)

	function scoreOf(name) {
		const n = normalizeArabic(name)
		if (!n) return 0
		const sectionTokens = tokenSetOf(n)
		let score = tokenSetsOverlapRatio(sectionTokens, tokens) * 20
		if (haystack.includes(n) && n.length >= 4) score += 8
		for (const w of sectionTokens) {
			if (tokens.has(w)) score += 2
		}
		return score
	}

	let bestMain = null
	let bestMainScore = 0
	for (const m of tree) {
		const s = scoreOf(m.name)
		if (s > bestMainScore) {
			bestMainScore = s
			bestMain = m
		}
	}
	if (!bestMain || bestMainScore < 5) return null

	let bestSub = null
	let bestSubScore = 0
	for (const sub of bestMain.children || []) {
		const s = scoreOf(sub.name)
		if (s > bestSubScore) {
			bestSubScore = s
			bestSub = sub
		}
	}
	if (!bestSub || bestSubScore < 4) return null

	let bestSec = null
	let bestSecScore = 0
	for (const sec of bestSub.children || []) {
		const s = scoreOf(sec.name)
		if (s > bestSecScore) {
			bestSecScore = s
			bestSec = sec
		}
	}

	return {
		mainId: String(bestMain.id),
		subId: String(bestSub.id),
		secondaryId: bestSec && bestSecScore >= 4 ? String(bestSec.id) : null,
		bestMain,
		bestSub,
		bestSec,
		bestMainScore,
		bestSubScore,
		bestSecScore,
		confidence: Math.min(0.45 + bestMainScore * 0.015 + bestSubScore * 0.015, 0.78),
		reasoning: 'heuristic مطابقة محليّة محافظة',
		method: 'heuristic'
	}
}

function getSecondariesUnderSubInTree(tree, subId) {
	for (const m of tree || []) {
		for (const s of m.children || []) {
			if (String(s.id) === String(subId)) return s.children || []
		}
	}
	return []
}

function scoreSecondaryForReuse(secNode, bookMeta, proposedNewName) {
	const secN = normalizeArabic(secNode?.name || '')
	const propN = normalizeArabic(proposedNewName || '')
	const hay = haystackForReuse(bookMeta)
	if (!secN) return 0
	const secTok = tokenSetOf(secN)
	const hayTok = tokenSetOf(hay)

	let score = 0
	if (propN) {
		if (secN === propN) score += 14
		else if (secN.includes(propN) || propN.includes(secN)) score += 11
		else {
			const r = tokenSetsOverlapRatio(tokenSetOf(propN), secTok)
			if (r >= 0.45) score += 8
			else if (r >= 0.25) score += 4
		}
	}
	if (hay.includes(secN) && secN.length >= 4) score += 9
	const stemTok = tokenSetOf(seriesStemFromTitle(bookMeta?.title || ''))
	score += tokenSetsOverlapRatio(secTok, stemTok) * 10
	score += tokenSetsOverlapRatio(secTok, hayTok) * 8
	return score
}

function pickReuseSecondary(sections, subId, bookMeta, options = {}) {
	const minScore = options.minScore ?? 6
	const proposed = options.proposedNewName || ''
	const secs = getSecondariesUnderSubInTree(sections.tree, subId)
	if (!secs.length) return null
	let best = null
	let bestScore = 0
	for (const sec of secs) {
		const sc = scoreSecondaryForReuse(sec, bookMeta, proposed)
		if (sc > bestScore) {
			bestScore = sc
			best = sec
		}
	}
	if (best && bestScore >= minScore) {
		return { id: String(best.id), name: best.name, score: bestScore }
	}
	return null
}

function cleanDisplayName(input, fallback) {
	const raw = String(input || '').trim()
	const cleaned = raw
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/\s+/g, ' ')
		.trim()
	if (!cleaned) return fallback
	return cleaned.slice(0, 80)
}

function fallbackCreateDecision(bookMeta) {
	const hint = cleanDisplayName((bookMeta?.categoryHints || [])[0], 'موضوعات إسلامية عامة')
	const titleStem = cleanDisplayName(seriesStemFromTitle(bookMeta?.title || ''), 'كتب عامة')
	const secondaryName = titleStem.length >= 8 ? titleStem : 'كتب عامة'
	return {
		kind: 'create_main',
		mainId: '',
		subId: '',
		secondaryId: null,
		newMainName: 'موضوعات إسلامية عامة',
		newSubName: hint,
		newSecondaryName: secondaryName,
		confidence: 0.32,
		reasoning: 'لم توجد مطابقة موضوعية آمنة — إنشاء مسار ثلاثي عام بدلاً من الخلط العشوائي.',
		method: 'fallback:create'
	}
}

function ensureTreeAvailable(sections) {
	if (!sections.tree || sections.tree.length === 0) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		)
	}
}

/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	ensureTreeAvailable(sections)
	const decision = await classifyAutonomous(sections, bookMeta)
	const suggested = {
		mainId: decision.mainId || '',
		subId: decision.subId || '',
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		kind: decision.kind,
		newMainName: decision.newMainName || null,
		newSubName: decision.newSubName || null,
		newSecondaryName: decision.newSecondaryName || null
	}
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{
						mainId: decision.mainId,
						subId: decision.subId,
						secondaryId: decision.secondaryId || null
					},
					sections.index
				)
			: { valid: true, reason: 'will_create_missing_sections' }

	return {
		suggested,
		alternatives: [],
		validation
	}
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	ensureTreeAvailable(sections)

	const ruleHit = pickTopicRule(bookMeta)
	if (ruleHit) {
		return classifyByRule(sections, bookMeta, ruleHit)
	}

	const sug = classifyHeuristic(sections, bookMeta)
	if (sug) {
		if (sug.secondaryId) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: String(sug.secondaryId),
				confidence: sug.confidence,
				reasoning: sug.reasoning,
				method: sug.method
			}
		}

		const newSecondaryName = cleanDisplayName(
			seriesStemFromTitle(bookMeta?.title || '') || bookMeta?.title,
			'كتب عامة'
		)
		const reuse = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: newSecondaryName,
			minScore: 9
		})
		if (reuse) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: String(reuse.id),
				confidence: Math.max(0.5, sug.confidence),
				reasoning: `إعادة استخدام قسم ثانوي قريب: ${reuse.name}`,
				method: 'heuristic:reuse'
			}
		}

		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: null,
			newSecondaryName,
			confidence: Math.max(0.48, sug.confidence),
			reasoning: 'وُجد main/sub مناسب لكن لا يوجد قسم ثانوي دقيق — إنشاء secondary جديد.',
			method: 'heuristic:create_secondary'
		}
	}

	return fallbackCreateDecision(bookMeta)
}
