/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic بسيط (string-matching عربي مع normalization) يعمل
 * دون أيّ تكلفة شبكيّة.
 */

import { validateHierarchyPath } from './sectionsTree.js';

const STOP_WORDS = new Set([
	'كتاب',
	'كتب',
	'شرح',
	'مختصر',
	'رساله',
	'رسائل',
	'باب',
	'ابواب',
	'جزء',
	'مجلد',
	'حول',
	'في',
	'من',
	'الي',
	'على',
	'عن',
	'هذا',
	'هذه',
	'ذلك',
	'تلك'
]);

const CATEGORY_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'علوم القرآن',
		secondaryName: 'موضوعات قرآنية عامة',
		keywords: ['قران', 'تفسير', 'سوره', 'ايات', 'تجويد', 'قراءات', 'مصحف', 'رسم المصحف', 'اسباب النزول'],
		secondaries: [
			{ name: 'التفسير', keywords: ['تفسير', 'المفسرون', 'تاويل'] },
			{ name: 'التجويد والقراءات', keywords: ['تجويد', 'قراءات', 'روايه', 'حفص', 'ورش'] },
			{ name: 'علوم القرآن', keywords: ['علوم القران', 'اسباب النزول', 'ناسخ', 'منسوخ', 'اعجاز'] }
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'علوم الحديث',
		secondaryName: 'موضوعات حديثية عامة',
		keywords: ['حديث', 'احاديث', 'سنه', 'سنن', 'صحيح', 'مسند', 'رواه', 'اسناد', 'جرح', 'تعديل', 'مصطلح الحديث'],
		secondaries: [
			{ name: 'مصطلح الحديث', keywords: ['مصطلح', 'اسناد', 'علل الحديث', 'جرح', 'تعديل'] },
			{ name: 'شروح الحديث', keywords: ['شرح الحديث', 'شروح', 'صحيح البخاري', 'صحيح مسلم', 'سنن'] }
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل فقهية عامة',
		keywords: [
			'فقه',
			'اصول الفقه',
			'فتاوي',
			'احكام',
			'طهاره',
			'صلاه',
			'زكاه',
			'صيام',
			'حج',
			'معاملات',
			'نكاح',
			'طلاق',
			'مواريث',
			'جنايات',
			'المذهب'
		],
		secondaries: [
			{ name: 'العبادات', keywords: ['طهاره', 'صلاه', 'زكاه', 'صيام', 'حج', 'عبادات'] },
			{ name: 'المعاملات', keywords: ['معاملات', 'بيع', 'ربا', 'اجاره', 'شركة', 'وقف'] },
			{ name: 'أصول الفقه', keywords: ['اصول الفقه', 'قواعد فقهيه', 'قياس', 'اجماع'] }
		]
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'موضوعات عقدية عامة',
		keywords: ['عقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'القدر', 'ملائكه', 'اشراط الساعه', 'بدع', 'فرق', 'مذاهب عقديه'],
		secondaries: [
			{ name: 'التوحيد', keywords: ['توحيد', 'شرك', 'عباده'] },
			{ name: 'الإيمان والغيبيات', keywords: ['ايمان', 'قدر', 'ملائكه', 'اليوم الاخر', 'اشراط الساعه'] },
			{ name: 'الفرق والمذاهب', keywords: ['فرق', 'جهميه', 'معتزله', 'اشاعره', 'بدع'] }
		]
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'السيرة النبوية العامة',
		keywords: ['سيره', 'النبي', 'رسول الله', 'غزوه', 'مغازي', 'شمائل', 'هجره', 'صحابه', 'الخلفاء'],
		secondaries: [
			{ name: 'السيرة النبوية', keywords: ['سيره', 'مغازي', 'هجره', 'غزوه'] },
			{ name: 'الشمائل', keywords: ['شمائل', 'اخلاق النبي', 'صفات النبي'] },
			{ name: 'الصحابة والخلفاء', keywords: ['صحابه', 'خلفاء', 'ابو بكر', 'عمر', 'عثمان', 'علي'] }
		]
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق والآداب',
		subName: 'الأخلاق والآداب الشرعية',
		secondaryName: 'آداب عامة',
		keywords: ['تزكيه', 'رقائق', 'اخلاق', 'اداب', 'ادب', 'زهد', 'موعظه', 'وصايا', 'نصائح', 'سلوك', 'تربيه النفس'],
		negative: ['اصول الفقه', 'فقه', 'تاريخ', 'عقيده'],
		secondaries: [
			{ name: 'الآداب الشرعية', keywords: ['اداب', 'ادب', 'استئذان', 'مجالس', 'معاشره'] },
			{ name: 'الرقائق والزهد', keywords: ['رقائق', 'زهد', 'موعظه', 'قلب'] },
			{ name: 'النصائح والوصايا', keywords: ['نصائح', 'وصايا', 'ارشادات', 'توجيهات'] }
		]
	},
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		subName: 'التعليم الشرعي وطلب العلم',
		secondaryName: 'آداب طالب العلم',
		keywords: [
			'تعليم',
			'تعليمات',
			'تربيه',
			'تربوي',
			'طلب العلم',
			'طالب العلم',
			'العلميه',
			'العلمي',
			'معلم',
			'متعلمين',
			'مناهج',
			'نصائح علميه',
			'وصايا علميه'
		],
		negative: ['فتاوي', 'احكام', 'تاريخ', 'عقيده'],
		secondaries: [
			{ name: 'آداب طالب العلم', keywords: ['طلب العلم', 'طالب العلم', 'اداب طالب', 'نصائح علميه', 'وصايا علميه'] },
			{ name: 'المناهج والتعليم', keywords: ['مناهج', 'تعليم', 'تعليمات', 'مدرسه', 'تدريس'] },
			{ name: 'التربية الإسلامية', keywords: ['تربيه', 'تربوي', 'تربية اسلامية'] }
		]
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وعلومها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'موضوعات لغوية عامة',
		keywords: ['لغه عربيه', 'نحو', 'صرف', 'بلاغه', 'اعراب', 'معاجم', 'قاموس', 'لسان العرب', 'ادب عربي', 'شعر'],
		secondaries: [
			{ name: 'النحو والصرف', keywords: ['نحو', 'صرف', 'اعراب'] },
			{ name: 'البلاغة', keywords: ['بلاغه', 'بيان', 'بديع', 'معاني'] },
			{ name: 'الأدب العربي', keywords: ['ادب عربي', 'شعر', 'نثر'] }
		]
	},
	{
		id: 'history',
		mainName: 'التاريخ والتراجم',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'موضوعات تاريخية عامة',
		keywords: ['تاريخ', 'تراجم', 'طبقات', 'اعلام', 'دوله', 'اموي', 'عباسي', 'اندلس', 'فتوحات', 'حضاره', 'وفيات'],
		negative: ['عقيده', 'توحيد'],
		secondaries: [
			{ name: 'التاريخ الإسلامي', keywords: ['تاريخ اسلامي', 'فتوحات', 'دوله', 'اموي', 'عباسي', 'اندلس'] },
			{ name: 'التراجم والطبقات', keywords: ['تراجم', 'طبقات', 'اعلام', 'وفيات'] }
		]
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

function tokenize(text) {
	return normalizeArabic(text)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function haystackForBook(bookMeta) {
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

function phraseScore(haystack, tokens, phrase) {
	const p = normalizeArabic(phrase);
	if (!p) return 0;
	if (haystack.includes(p)) return p.includes(' ') ? 5 : 3;
	const pTokens = tokenize(p);
	if (!pTokens.length) return 0;
	let hits = 0;
	for (const t of pTokens) if (tokens.has(t)) hits += 1;
	return hits / pTokens.length >= 0.6 ? 2 + hits : 0;
}

function inferRule(bookMeta) {
	const haystack = haystackForBook(bookMeta);
	const tokens = new Set(tokenize(haystack));
	let best = null;
	let bestScore = 0;
	for (const rule of CATEGORY_RULES) {
		let score = 0;
		for (const kw of rule.keywords || []) score += phraseScore(haystack, tokens, kw);
		for (const neg of rule.negative || []) score -= phraseScore(haystack, tokens, neg) * 1.5;
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= 4 ? { rule: best, score: bestScore, haystack, tokens } : null;
}

function nameSimilarityScore(a, b) {
	const an = normalizeArabic(a);
	const bn = normalizeArabic(b);
	if (!an || !bn) return 0;
	if (an === bn) return 14;
	if (an.includes(bn) || bn.includes(an)) return 10;
	const at = new Set(tokenize(an));
	const bt = new Set(tokenize(bn));
	return tokenSetsOverlapRatio(at, bt) * 9;
}

function scoreNodeForRule(node, rule, haystack, tokens, level) {
	const name = node?.name || '';
	const targets =
		level === 'main'
			? [rule.mainName, rule.subName]
			: level === 'sub'
				? [rule.subName, rule.mainName, rule.secondaryName]
				: [rule.secondaryName, ...(rule.secondaries || []).map((s) => s.name)];
	let score = 0;
	for (const target of targets) score = Math.max(score, nameSimilarityScore(name, target));
	score += phraseScore(haystack, tokens, name);
	for (const kw of rule.keywords || []) {
		const ns = nameSimilarityScore(name, kw);
		if (ns >= 7) score += 2;
	}
	return score;
}

function pickBest(nodes, scoreFn, minScore) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreFn(node);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function pickSecondaryName(rule, haystack, tokens) {
	if (
		rule.id === 'education' &&
		(tokens.has('نصائح') || tokens.has('وصايا') || tokens.has('ارشادات')) &&
		(tokens.has('العلميه') || tokens.has('العلمي') || haystack.includes('طلب العلم'))
	) {
		return 'آداب طالب العلم';
	}
	let best = null;
	let bestScore = 0;
	for (const sec of rule.secondaries || []) {
		let score = nameSimilarityScore(sec.name, haystack);
		for (const kw of sec.keywords || []) score += phraseScore(haystack, tokens, kw);
		if (score > bestScore) {
			best = sec;
			bestScore = score;
		}
	}
	return best && bestScore >= 3 ? best.name : rule.secondaryName;
}

function genericSecondaryName(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 6 && stem.length <= 80) return stem;
	const hint = (bookMeta?.categoryHints || []).find((h) => normalizeArabic(h).length >= 4);
	return hint ? String(hint).trim().slice(0, 80) : 'مصنفات عامة';
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = haystackForBook(bookMeta);
	const tokens = new Set(tokenize(haystack));

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
	if (!bestMain || bestMainScore < 2) return null;

	let bestSub = null, bestSubScore = 0;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub || bestSubScore < 2) return null;

	let bestSec = null, bestSecScore = 0;
	for (const sec of bestSub.children) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) { bestSecScore = s; bestSec = sec; }
	}

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec && bestSecScore >= 2 ? bestSec.id : null,
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
	const inferred = inferRule(bookMeta);
	if (!inferred) {
		const sug = classifyHeuristic(sections, bookMeta);
		if (sug?.mainId && sug?.subId && sug?.secondaryId) {
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
		if (sug?.mainId && sug?.subId) {
			return {
				kind: 'create_secondary',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				newSecondaryName: genericSecondaryName(bookMeta),
				confidence: sug.confidence,
				reasoning: 'وُجد main/sub مناسب، ولم يوجد قسم ثانوي مناسب؛ إنشاء ثانوي جديد لحفظ الهيكل الثلاثي.',
				method: 'heuristic_create_secondary'
			};
		}
		return {
			kind: 'create_main',
			newMainName: 'المعارف الإسلامية العامة',
			newSubName: 'موضوعات عامة',
			newSecondaryName: genericSecondaryName(bookMeta),
			confidence: 0.25,
			reasoning: 'لم توجد مطابقة موثوقة؛ إنشاء مسار مستقل بدلاً من خلط الكتاب بقسم غير مناسب.',
			method: 'heuristic_create_main'
		};
	}

	const { rule, score, haystack, tokens } = inferred;
	const mainPick = pickBest(
		sections.tree,
		(node) => scoreNodeForRule(node, rule, haystack, tokens, 'main'),
		6
	);
	const secondaryName = pickSecondaryName(rule, haystack, tokens);
	if (!mainPick) {
		return {
			kind: 'create_main',
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.45 + score * 0.03, 0.88),
			reasoning: `لم يوجد قسم رئيسي مناسب لـ "${rule.mainName}"؛ إنشاء مسار جديد مستقل.`,
			method: `rules:${rule.id}`
		};
	}

	const mainId = String(mainPick.node.id);
	const subPick = pickBest(
		mainPick.node.children || [],
		(node) => scoreNodeForRule(node, rule, haystack, tokens, 'sub'),
		5
	);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.5 + score * 0.03, 0.9),
			reasoning: `وُجد القسم الرئيسي "${mainPick.node.name}" لكن لا يوجد فرعي مناسب؛ إنشاء "${rule.subName}".`,
			method: `rules:${rule.id}`
		};
	}

	const subId = String(subPick.node.id);
	const secPick = pickBest(
		subPick.node.children || [],
		(node) => Math.max(
			scoreNodeForRule(node, rule, haystack, tokens, 'secondary'),
			scoreSecondaryForReuse(node, bookMeta, secondaryName)
		),
		5
	);
	const reusedSecondary = secPick
		? { id: String(secPick.node.id), name: secPick.node.name, score: secPick.score }
		: pickReuseSecondary(sections, subId, bookMeta, {
				proposedNewName: secondaryName,
				minScore: 7
			});
	if (reusedSecondary) {
		return {
			kind: 'existing',
			mainId,
			subId,
			secondaryId: String(reusedSecondary.id),
			confidence: Math.min(0.55 + score * 0.03, 0.93),
			reasoning: `مطابقة قواعدية ضمن "${mainPick.node.name} > ${subPick.node.name} > ${reusedSecondary.name}".`,
			method: `rules:${rule.id}`
		};
	}

	return {
		kind: 'create_secondary',
		mainId,
		subId,
		newSecondaryName: secondaryName,
		confidence: Math.min(0.5 + score * 0.03, 0.9),
		reasoning: `وُجد main/sub مناسبان، ولا يوجد ثانوي مناسب؛ إنشاء "${secondaryName}".`,
		method: `rules:${rule.id}`
	};
}
