/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const STOPWORDS = new Set([
	'كتاب',
	'كتب',
	'الكتاب',
	'باب',
	'شرح',
	'مختصر',
	'على',
	'في',
	'من',
	'الى',
	'عن',
	'مع',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'التي',
	'الذي',
	'والذي',
	'والتي'
]);

/**
 * خريطة مجالات محافظة تمنع الخلط بين الفنون المتقاربة ظاهرياً:
 * الآداب/طلب العلم لا تذهب للفقه، والتاريخ لا يذهب للعقيدة.
 */
const DOMAIN_RULES = Object.freeze([
	{
		main: 'القرآن وعلومه',
		mainAliases: ['القرآن الكريم', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		sub: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن', 'تفسير القرآن'],
		secondary: 'التفسير',
		keywords: [
			'قرآن',
			'القرآن',
			'تفسير',
			'مفسر',
			'علوم القرآن',
			'تجويد',
			'قراءات',
			'أسباب النزول',
			'الناسخ والمنسوخ'
		]
	},
	{
		main: 'الحديث وعلومه',
		mainAliases: ['الحديث الشريف', 'السنة النبوية', 'علوم الحديث'],
		sub: 'علوم الحديث',
		subAliases: ['الحديث', 'مصطلح الحديث', 'شروح الحديث'],
		secondary: 'الحديث الشريف',
		keywords: [
			'حديث',
			'أحاديث',
			'صحيح',
			'سنن',
			'مسند',
			'مصطلح الحديث',
			'جرح وتعديل',
			'علل الحديث',
			'رواة'
		]
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه وأصوله', 'الفقه'],
		sub: 'الفقه',
		subAliases: ['العبادات', 'المعاملات', 'فقه العبادات', 'فقه المعاملات'],
		secondary: 'أحكام الفقه',
		keywords: [
			'فقه',
			'أحكام',
			'عبادات',
			'معاملات',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'طهارة',
			'وضوء',
			'نكاح',
			'بيوع',
			'فرائض'
		]
	},
	{
		main: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'فقه وأصوله', 'الفقه'],
		sub: 'أصول الفقه',
		subAliases: ['الأصول', 'القواعد الفقهية', 'مقاصد الشريعة'],
		secondary: 'أصول الفقه والقواعد',
		keywords: [
			'أصول الفقه',
			'قواعد فقهية',
			'مقاصد',
			'استنباط',
			'قياس',
			'إجماع',
			'دلالة',
			'أصولي'
		]
	},
	{
		main: 'العقيدة',
		mainAliases: ['التوحيد والعقيدة', 'أصول الدين', 'العقيدة الإسلامية'],
		sub: 'التوحيد والعقيدة',
		subAliases: ['التوحيد', 'الإيمان', 'أسماء الله وصفاته'],
		secondary: 'التوحيد',
		keywords: [
			'عقيدة',
			'توحيد',
			'إيمان',
			'شرك',
			'كفر',
			'قدر',
			'صفات',
			'أسماء الله',
			'أصول الدين',
			'الفرق',
			'الجهمية',
			'الأشاعرة',
			'السلفية'
		]
	},
	{
		main: 'السيرة النبوية',
		mainAliases: ['السيرة', 'سيرة الرسول', 'الشمائل النبوية'],
		sub: 'السيرة النبوية',
		subAliases: ['المغازي', 'الشمائل', 'دلائل النبوة'],
		secondary: 'السيرة النبوية',
		keywords: [
			'سيرة',
			'مغازي',
			'شمائل',
			'رسول',
			'النبي',
			'نبوية',
			'دلائل النبوة',
			'غزوة'
		]
	},
	{
		main: 'التاريخ الإسلامي',
		mainAliases: ['التاريخ', 'تاريخ إسلامي', 'التراجم والطبقات'],
		sub: 'التاريخ والتراجم',
		subAliases: ['التراجم', 'الطبقات', 'السير والتراجم', 'التاريخ الإسلامي'],
		secondary: 'التاريخ الإسلامي',
		keywords: [
			'تاريخ',
			'تواريخ',
			'تراجم',
			'طبقات',
			'سير أعلام',
			'دولة',
			'دول',
			'خلافة',
			'فتوح',
			'الأندلس',
			'بغداد',
			'دمشق'
		]
	},
	{
		main: 'الآداب والتزكية',
		mainAliases: ['التزكية والأخلاق', 'الأخلاق والآداب', 'الآداب الإسلامية'],
		sub: 'آداب طلب العلم',
		subAliases: ['طلب العلم', 'التربية والتعليم', 'آداب العالم والمتعلم', 'آداب الطالب'],
		secondary: 'النصائح والتوجيهات العلمية',
		keywords: [
			'طلب العلم',
			'طالب العلم',
			'آداب طالب',
			'تعليم',
			'تعلم',
			'تربية',
			'معلم',
			'متعلم',
			'نصيحة',
			'نصائح',
			'وصايا',
			'توجيهات',
			'تعليمات',
			'العلمية',
			'العلماء',
			'آداب العلم'
		]
	},
	{
		main: 'الآداب والتزكية',
		mainAliases: ['التزكية والأخلاق', 'الأخلاق والآداب', 'الآداب الإسلامية'],
		sub: 'الأخلاق والآداب',
		subAliases: ['التزكية', 'الأخلاق', 'الرقائق', 'الزهد'],
		secondary: 'الأخلاق والرقائق',
		keywords: [
			'تزكية',
			'أخلاق',
			'أدب',
			'آداب',
			'رقائق',
			'زهد',
			'موعظة',
			'مواعظ',
			'قلوب',
			'سلوك'
		]
	},
	{
		main: 'اللغة العربية',
		mainAliases: ['علوم اللغة العربية', 'العربية', 'الأدب العربي'],
		sub: 'علوم اللغة العربية',
		subAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي'],
		secondary: 'النحو والصرف',
		keywords: [
			'نحو',
			'صرف',
			'بلاغة',
			'لغة',
			'العربية',
			'إعراب',
			'عروض',
			'قافية',
			'أدب عربي'
		]
	},
	{
		main: 'الدعوة والإرشاد',
		mainAliases: ['الدعوة', 'الإرشاد', 'الخطب والدروس'],
		sub: 'الدعوة',
		subAliases: ['الخطب', 'الدروس', 'الإرشاد'],
		secondary: 'الدعوة والإرشاد',
		keywords: ['دعوة', 'داعية', 'إرشاد', 'خطب', 'خطبة', 'محاضرات', 'فتاوى', 'وعظ']
	}
]);

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
			.filter((t) => t.length >= minLen && !STOPWORDS.has(t))
	);
}

function haystackFromBook(bookMeta) {
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

function phraseScore(phrase, haystack, tokens) {
	const n = normalizeArabic(phrase);
	if (!n) return 0;
	const words = n.split(' ').filter((w) => w.length >= 3 && !STOPWORDS.has(w));
	let score = 0;
	if (haystack.includes(n)) score += words.length > 1 ? 9 : 5;
	for (const w of words) {
		if (tokens.has(w)) score += 2;
	}
	return score;
}

function scoreRule(rule, bookMeta) {
	const haystack = haystackFromBook(bookMeta);
	const tokens = tokensOf(haystack);
	let score = 0;
	for (const keyword of rule.keywords || []) {
		score += phraseScore(keyword, haystack, tokens);
	}
	// إشارات Noor التصنيفية أكثر موثوقية من الوصف الطويل.
	for (const hint of bookMeta?.categoryHints || []) {
		const h = normalizeArabic(hint);
		for (const keyword of rule.keywords || []) {
			const k = normalizeArabic(keyword);
			if (h && k && (h.includes(k) || k.includes(h))) score += 5;
		}
	}
	return score;
}

function pickDomainRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		const score = scoreRule(rule, bookMeta);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	if (!best || bestScore < 5) return null;
	return { ...best, score: bestScore };
}

function aliasesFor(rule, level) {
	if (!rule) return [];
	if (level === 'main') return [rule.main, ...(rule.mainAliases || [])];
	if (level === 'sub') return [rule.sub, ...(rule.subAliases || [])];
	return [rule.secondary, ...(rule.secondaryAliases || [])];
}

function overlapScore(a, b) {
	const aTokens = tokensOf(a);
	const bTokens = tokensOf(b);
	if (!aTokens.size || !bTokens.size) return 0;
	let inter = 0;
	for (const token of aTokens) if (bTokens.has(token)) inter += 1;
	return (inter / Math.max(aTokens.size, bTokens.size)) * 8;
}

function scoreNodeAgainstAliases(node, aliases, bookMeta) {
	const name = String(node?.name || '');
	const normalizedName = normalizeArabic(name);
	const haystack = haystackFromBook(bookMeta);
	const tokens = tokensOf(haystack);
	let score = 0;
	for (const alias of aliases || []) {
		const normalizedAlias = normalizeArabic(alias);
		if (!normalizedAlias) continue;
		if (normalizedName === normalizedAlias) score += 50;
		else if (normalizedName.includes(normalizedAlias) || normalizedAlias.includes(normalizedName)) {
			score += 32;
		}
		score += overlapScore(name, alias);
		score += phraseScore(name, haystack, tokens) * 0.5;
	}
	return score;
}

function pickNodeByAliases(nodes, aliases, bookMeta, minScore = 12) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNodeAgainstAliases(node, aliases, bookMeta);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	if (best && bestScore >= minScore) return { node: best, score: bestScore };
	return null;
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree }, bookMeta) {
	tree = tree || [];
	const haystack = haystackFromBook(bookMeta);
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
		scores: { main: bestMainScore, sub: bestSubScore, secondary: bestSecScore },
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

function deriveSecondaryName(bookMeta, rule = null) {
	if (rule?.secondary) return rule.secondary;
	const hints = (bookMeta?.categoryHints || [])
		.map((h) => String(h || '').trim())
		.filter((h) => /[\u0600-\u06FF]/.test(h) && h.length >= 3 && h.length <= 60);
	if (hints[0]) return hints[0];
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 3 && stem.length <= 60) return stem;
	return 'كتب متفرقة';
}

function resolveAutonomousDecision(sections, bookMeta) {
	const rule = pickDomainRule(bookMeta);
	if (rule) {
		const mainPick = pickNodeByAliases(sections.tree, aliasesFor(rule, 'main'), bookMeta, 12);
		if (!mainPick) {
			return {
				kind: 'create_main',
				mainId: null,
				subId: null,
				secondaryId: null,
				newMainName: rule.main,
				newSubName: rule.sub,
				newSecondaryName: deriveSecondaryName(bookMeta, rule),
				confidence: Math.min(0.45 + rule.score * 0.03, 0.92),
				reasoning: `تحديد مجال "${rule.main}" من كلمات الكتاب؛ لا يوجد قسم رئيسي مناسب.`,
				method: 'heuristic'
			};
		}

		const main = mainPick.node;
		const subPick = pickNodeByAliases(main.children || [], aliasesFor(rule, 'sub'), bookMeta, 10);
		if (!subPick) {
			return {
				kind: 'create_sub',
				mainId: String(main.id),
				subId: null,
				secondaryId: null,
				newSubName: rule.sub,
				newSecondaryName: deriveSecondaryName(bookMeta, rule),
				confidence: Math.min(0.5 + rule.score * 0.025, 0.9),
				reasoning: `وُجد المجال الرئيسي "${main.name}" ولا يوجد فرع مناسب لـ "${rule.sub}".`,
				method: 'heuristic'
			};
		}

		const sub = subPick.node;
		const secPick = pickNodeByAliases(sub.children || [], aliasesFor(rule, 'secondary'), bookMeta, 9);
		if (secPick) {
			return {
				kind: 'existing',
				mainId: String(main.id),
				subId: String(sub.id),
				secondaryId: String(secPick.node.id),
				confidence: Math.min(0.58 + rule.score * 0.02, 0.93),
				reasoning: `مطابقة مجال محافظة: ${main.name} ← ${sub.name} ← ${secPick.node.name}.`,
				method: 'heuristic'
			};
		}

		const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: deriveSecondaryName(bookMeta, rule),
			minScore: 10
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(main.id),
				subId: String(sub.id),
				secondaryId: reusable.id,
				confidence: Math.min(0.55 + rule.score * 0.02, 0.9),
				reasoning: `إعادة استعمال قسم ثانوي مناسب: ${main.name} ← ${sub.name} ← ${reusable.name}.`,
				method: 'heuristic'
			};
		}

		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: deriveSecondaryName(bookMeta, rule),
			confidence: Math.min(0.52 + rule.score * 0.02, 0.88),
			reasoning: `وُجد المسار الرئيسي/الفرعي ولا يوجد قسم ثانوي مناسب؛ إنشاء ثانوي جديد.`,
			method: 'heuristic'
		};
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (sug && sug.scores?.main > 0 && sug.scores?.sub > 0) {
		if (sug.secondaryId && sug.scores?.secondary > 0) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: String(sug.secondaryId),
				confidence: sug.confidence,
				reasoning: sug.reasoning,
				method: 'heuristic'
			};
		}
		const secondaryName = deriveSecondaryName(bookMeta);
		const reusable = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: secondaryName,
			minScore: 10
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: reusable.id,
				confidence: Math.max(sug.confidence, 0.55),
				reasoning: `مطابقة محلية مع إعادة استعمال ثانوي: ${reusable.name}.`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: Math.max(sug.confidence, 0.5),
			reasoning: 'وُجد main/sub مناسبان، ولا يوجد secondary مناسب؛ إنشاء ثانوي جديد.',
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: 'المكتبة الإسلامية',
		newSubName: 'كتب متفرقة',
		newSecondaryName: deriveSecondaryName(bookMeta),
		confidence: 0.3,
		reasoning: 'لم تُعثَر مطابقة موثوقة في الشجرة؛ إنشاء مسار ثلاثي محافظ.',
		method: 'heuristic'
	};
}


/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	const decision = resolveAutonomousDecision(sections, bookMeta);
	const sug =
		decision.kind === 'existing'
			? {
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method
				}
			: {
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId,
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
	const validation = sug?.mainId && sug?.subId
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: decision.kind };
	return {
		suggested: sug,
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	return resolveAutonomousDecision(sections, bookMeta);
}
