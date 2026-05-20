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

const DOMAIN_RULES = Object.freeze([
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		keywords: [
			'فقه',
			'اصول الفقه',
			'فتاوي',
			'فتوى',
			'احكام',
			'حلال',
			'حرام',
			'طهاره',
			'صلاه',
			'زكاه',
			'صيام',
			'حج',
			'عمره',
			'معاملات',
			'بيوع',
			'نكاح',
			'طلاق',
			'مواريث',
			'فرائض'
		],
		secondaryHints: [
			['الصلاة', ['صلاه', 'الصلاة']],
			['الطهارة', ['طهاره', 'وضوء', 'غسل', 'نجاسه']],
			['الزكاة', ['زكاه', 'صدقه']],
			['الصيام', ['صيام', 'رمضان']],
			['الحج والعمرة', ['حج', 'عمره', 'مناسك']],
			['المعاملات والبيوع', ['معاملات', 'بيوع', 'ربا', 'تجاره']],
			['النكاح والأسرة', ['نكاح', 'زواج', 'طلاق', 'اسره']],
			['المواريث والفرائض', ['مواريث', 'فرائض', 'ميراث']]
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		keywords: [
			'عقيده',
			'توحيد',
			'ايمان',
			'اسماء وصفات',
			'الاسماء والصفات',
			'قدر',
			'ايمان',
			'شرك',
			'بدعه',
			'فرق',
			'ملل',
			'نحل'
		],
		secondaryHints: [
			['التوحيد', ['توحيد', 'شرك']],
			['الإيمان', ['ايمان', 'اسلام', 'احسان']],
			['الأسماء والصفات', ['اسماء وصفات', 'الاسماء والصفات', 'صفات']],
			['الفرق والردود', ['فرق', 'ملل', 'نحل', 'ردود', 'بدع']]
		]
	},
	{
		id: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		keywords: [
			'قران',
			'القران',
			'تفسير',
			'تجويد',
			'قراءات',
			'مصاحف',
			'سوره',
			'علوم القران',
			'اسباب النزول',
			'ناسخ ومنسوخ'
		],
		secondaryHints: [
			['التفسير', ['تفسير', 'مفسر']],
			['علوم القرآن', ['علوم القران', 'اسباب النزول', 'ناسخ', 'منسوخ']],
			['التجويد والقراءات', ['تجويد', 'قراءات', 'روايه', 'حفص', 'ورش']]
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		keywords: [
			'حديث',
			'احاديث',
			'سنه',
			'سنن',
			'صحيح',
			'رواه',
			'روايه',
			'اسناد',
			'جرح وتعديل',
			'مصطلح الحديث',
			'علل الحديث'
		],
		secondaryHints: [
			['كتب الحديث', ['صحيح', 'سنن', 'مسند', 'موطا', 'احاديث']],
			['مصطلح الحديث', ['مصطلح الحديث', 'اسناد', 'رواه']],
			['الجرح والتعديل', ['جرح', 'تعديل', 'رجال الحديث']],
			['علل الحديث', ['علل الحديث', 'علل']]
		]
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		keywords: ['سيره', 'شمائل', 'نبي', 'رسول', 'مغازي', 'هجره', 'غزوه'],
		secondaryHints: [
			['السيرة النبوية', ['سيره', 'مغازي', 'هجره', 'غزوه']],
			['الشمائل المحمدية', ['شمائل', 'اخلاق النبي']]
		]
	},
	{
		id: 'history',
		mainName: 'التاريخ الإسلامي',
		subName: 'التاريخ والتراجم',
		keywords: [
			'تاريخ',
			'تراجم',
			'طبقات',
			'سير اعلام',
			'فتوح',
			'خلافه',
			'دوله',
			'اندلس',
			'عباسي',
			'اموي'
		],
		secondaryHints: [
			['التاريخ الإسلامي', ['تاريخ', 'فتوح', 'خلافه', 'دوله']],
			['التراجم والطبقات', ['تراجم', 'طبقات', 'سير اعلام']]
		]
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		keywords: ['نحو', 'صرف', 'بلاغه', 'لغه عربيه', 'معجم', 'قاموس', 'اعراب', 'عروض'],
		secondaryHints: [
			['النحو والصرف', ['نحو', 'صرف', 'اعراب']],
			['البلاغة', ['بلاغه', 'بيان', 'معاني', 'بديع']],
			['المعاجم واللغة', ['معجم', 'قاموس', 'لغه']]
		]
	},
	{
		id: 'literature',
		mainName: 'الأدب العربي',
		subName: 'الأدب والنصوص',
		keywords: ['ادب عربي', 'شعر', 'ديوان', 'قصائد', 'نثر', 'نقد ادبي', 'روايه', 'قصه'],
		secondaryHints: [
			['الشعر والدواوين', ['شعر', 'ديوان', 'قصائد']],
			['النثر والقصص', ['نثر', 'روايه', 'قصه']],
			['النقد الأدبي', ['نقد ادبي', 'نقد']]
		]
	},
	{
		id: 'adab_akhlaq',
		mainName: 'التزكية والأخلاق',
		subName: 'الآداب والأخلاق',
		keywords: ['تزكيه', 'اخلاق', 'اداب', 'رقائق', 'سلوك', 'موعظه', 'نصيحه', 'نصائح'],
		secondaryHints: [
			['الأخلاق والتزكية', ['اخلاق', 'تزكيه', 'سلوك']],
			['الآداب والنصائح', ['اداب', 'نصيحه', 'نصائح', 'موعظه']],
			['الرقائق', ['رقائق', 'زهد']]
		]
	},
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		subName: 'طلب العلم والتعليم',
		keywords: [
			'تربيه',
			'تعليم',
			'تعلم',
			'طلب العلم',
			'طالب العلم',
			'تعليمات علميه',
			'نصائح علميه',
			'مناهج',
			'مدرسه',
			'معلم',
			'طلاب'
		],
		secondaryHints: [
			['طلب العلم وآدابه', ['طلب العلم', 'طالب العلم', 'نصائح علميه', 'اداب العلم']],
			['التعليم والمناهج', ['تعليم', 'تعلم', 'مناهج', 'معلم', 'طلاب']]
		]
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والإرشاد',
		subName: 'الدعوة والخطب',
		keywords: ['دعوه', 'داعيه', 'خطب', 'محاضرات', 'ارشاد', 'امر بالمعروف', 'نهي عن المنكر'],
		secondaryHints: [
			['الدعوة والإرشاد', ['دعوه', 'ارشاد']],
			['الخطب والمحاضرات', ['خطب', 'محاضرات']]
		]
	}
]);

const GENERIC_MAIN_HINTS = Object.freeze([
	'اسلام',
	'اسلاميه',
	'المكتبه',
	'مكتبه',
	'علوم شرعيه',
	'الشريعه',
	'دين'
]);

function tokensOf(s, minLen = 3) {
	const out = [];
	for (const token of normalizeArabic(s).split(' ')) {
		if (token.length >= minLen) out.push(token);
		if (token.startsWith('ال') && token.length > minLen + 2) out.push(token.slice(2));
	}
	return new Set(out);
}

function cleanSectionName(name) {
	return String(name || '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

function scorePhrase(phrase, haystack, tokens) {
	const n = normalizeArabic(phrase);
	if (!n) return 0;
	let score = 0;
	const looseNeedle = n.replace(/(^|\s)ال(?=\S)/gu, '$1');
	const looseHaystack = haystack.replace(/(^|\s)ال(?=\S)/gu, '$1');
	if (
		n.length >= 4 &&
		(haystack.includes(n) || (looseNeedle.length >= 4 && looseHaystack.includes(looseNeedle)))
	) {
		score += n.includes(' ') ? 4 : 3;
	}
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	return score;
}

function scoreNameAgainst(name, haystack, tokens, hints = []) {
	let score = scorePhrase(name, haystack, tokens);
	const sectionN = normalizeArabic(name);
	for (const hint of hints) {
		const h = normalizeArabic(hint);
		if (!h) continue;
		const looseSection = sectionN.replace(/(^|\s)ال(?=\S)/gu, '$1');
		const looseHint = h.replace(/(^|\s)ال(?=\S)/gu, '$1');
		if (sectionN === h || looseSection === looseHint) score += 12;
		else if (
			sectionN.includes(h) ||
			h.includes(sectionN) ||
			looseSection.includes(looseHint) ||
			looseHint.includes(looseSection)
		) {
			score += 8;
		}
		else score += scorePhrase(h, sectionN, tokensOf(sectionN)) * 2;
	}
	return score;
}

function pickDomain(bookMeta) {
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
	const tokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		let score = 0;
		for (const kw of rule.keywords) {
			score += scorePhrase(kw, haystack, tokens);
		}
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best && bestScore >= 2 ? { rule: best, score: bestScore, haystack, tokens } : null;
}

function pickUsefulHint(bookMeta, domain) {
	const blocked = new Set(
		[
			domain?.mainName,
			domain?.subName,
			'كتب',
			'الرئيسية',
			'home',
			'مكتبة نور'
		]
			.filter(Boolean)
			.map(normalizeArabic)
	);
	for (const raw of bookMeta?.categoryHints || []) {
		const hint = cleanSectionName(raw);
		const n = normalizeArabic(hint);
		if (!hint || hint.length < 3 || hint.length > 60) continue;
		if (blocked.has(n)) continue;
		if (/^(كتب|تحميل|مكتبه|noor|book)$/i.test(hint)) continue;
		return hint;
	}
	return '';
}

function pickDomainSecondaryName(bookMeta, domain, haystack) {
	for (const [name, hints] of domain?.secondaryHints || []) {
		if (hints.some((hint) => haystack.includes(normalizeArabic(hint)))) return name;
	}
	const categoryHint = pickUsefulHint(bookMeta, domain);
	if (categoryHint) return categoryHint;
	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	if (stem && stem.length >= 4 && stem.length <= 70) return stem;
	return domain?.subName ? `كتب ${domain.subName.replace(/^كتب\s+/u, '')}` : 'كتب متنوّعة';
}

function bestScoredNode(nodes, haystack, tokens, hints = [], minScore = 1) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNameAgainst(node?.name || '', haystack, tokens, hints);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function findGenericMain(tree) {
	let best = null;
	let bestScore = 0;
	for (const node of tree || []) {
		const n = normalizeArabic(node?.name || '');
		let score = 0;
		for (const hint of GENERIC_MAIN_HINTS) {
			if (n.includes(normalizeArabic(hint))) score += 1;
		}
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return bestScore > 0 ? best : null;
}

function classifyToDecision(sections, bookMeta) {
	const tree = sections.tree || [];
	const domainInfo = pickDomain(bookMeta);
	const domain = domainInfo?.rule || null;
	const haystack =
		domainInfo?.haystack ||
		normalizeArabic(
			[
				bookMeta?.title,
				bookMeta?.author,
				bookMeta?.description,
				...(bookMeta?.categoryHints || [])
			]
				.filter(Boolean)
				.join(' ')
		);
	const tokens = domainInfo?.tokens || tokensOf(haystack);
	const fallbackMainName = domain?.mainName || 'المكتبة الإسلامية';
	const fallbackSubName = domain?.subName || pickUsefulHint(bookMeta, domain) || 'كتب متنوّعة';
	const fallbackSecondaryName = pickDomainSecondaryName(bookMeta, domain, haystack);

	if (tree.length === 0) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: fallbackMainName,
			newSubName: fallbackSubName,
			newSecondaryName: fallbackSecondaryName,
			confidence: 0.35,
			reasoning: 'لا توجد شجرة أقسام صالحة — إنشاء مسار ثلاثي جديد.',
			method: 'heuristic'
		};
	}

	const mainHints = domain ? [domain.mainName, domain.subName, ...domain.keywords] : [];
	let mainMatch = bestScoredNode(tree, haystack, tokens, mainHints, domain ? 2 : 1);
	if (!mainMatch && domain) {
		const genericMain = findGenericMain(tree);
		if (genericMain) mainMatch = { node: genericMain, score: 1 };
	}
	if (!mainMatch) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: fallbackMainName,
			newSubName: fallbackSubName,
			newSecondaryName: fallbackSecondaryName,
			confidence: 0.35,
			reasoning: 'لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار جديد في المستوى الصحيح.',
			method: 'heuristic'
		};
	}

	const main = mainMatch.node;
	const subHints = domain ? [domain.subName, domain.mainName, ...domain.keywords] : [];
	const subMatch = bestScoredNode(main.children || [], haystack, tokens, subHints, domain ? 2 : 1);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: fallbackSubName,
			newSecondaryName: fallbackSecondaryName,
			confidence: Math.min(0.45 + mainMatch.score * 0.04, 0.75),
			reasoning: `وُجد القسم الرئيسي "${main.name}" ولا يوجد فرع مناسب — إنشاء فرع وثانوي تحتَه.`,
			method: 'heuristic'
		};
	}

	const sub = subMatch.node;
	const secondaryHints = [
		fallbackSecondaryName,
		...(domain?.secondaryHints || []).flatMap(([name, hints]) => [name, ...hints])
	];
	const secMatch = bestScoredNode(sub.children || [], haystack, tokens, secondaryHints, 2);
	if (!secMatch) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: fallbackSecondaryName,
			confidence: Math.min(0.5 + mainMatch.score * 0.04 + subMatch.score * 0.04, 0.82),
			reasoning: `وُجد المسار "${main.name} ← ${sub.name}" ولا يوجد قسم ثانوي مناسب — إنشاء مستوى ثالث.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secMatch.node.id),
		confidence: Math.min(
			0.55 + mainMatch.score * 0.04 + subMatch.score * 0.04 + secMatch.score * 0.03,
			0.92
		),
		reasoning: `مطابقة محليّة صارمة: ${main.name} ← ${sub.name} ← ${secMatch.node.name}.`,
		method: 'heuristic'
	};
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
	if (!sections.tree || sections.tree.length === 0) {
		const decision = classifyToDecision(sections, bookMeta);
		return {
			suggested: {
				mainId: null,
				subId: null,
				secondaryId: null,
				confidence: decision.confidence,
				reasoning: decision.reasoning,
				method: decision.method,
				wouldCreate: {
					main: decision.newMainName,
					sub: decision.newSubName,
					secondary: decision.newSecondaryName
				}
			},
			alternatives: [],
			validation: { valid: false, reason: 'would_create_sections' }
		};
	}

	const decision = classifyToDecision(sections, bookMeta);
	const sug = {
		mainId: decision.mainId,
		subId: decision.subId,
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		wouldCreate: {
			...(decision.newMainName ? { main: decision.newMainName } : {}),
			...(decision.newSubName ? { sub: decision.newSubName } : {}),
			...(decision.newSecondaryName ? { secondary: decision.newSecondaryName } : {})
		}
	};
	const validation = sug.mainId && sug.subId
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
	const decision = classifyToDecision(sections, bookMeta);
	if (decision.kind === 'create_secondary') {
		const autoSec = pickReuseSecondary(sections, String(decision.subId), bookMeta, {
			proposedNewName: decision.newSecondaryName || '',
			minScore: 9
		});
		if (autoSec) {
			return {
				kind: 'existing',
				mainId: String(decision.mainId),
				subId: String(decision.subId),
				secondaryId: autoSec.id,
				confidence: Math.max(decision.confidence, 0.78),
				reasoning: `إعادة استخدام قسم ثانوي قائم "${autoSec.name}" بدل إنشاء قسم جديد.`,
				method: 'heuristic'
			};
		}
	}
	return decision;
}
