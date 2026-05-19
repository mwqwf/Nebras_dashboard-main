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

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function tokenOverlapScore(a, b) {
	const aa = tokensOf(a);
	const bb = tokensOf(b);
	if (!aa.size || !bb.size) return 0;
	let hits = 0;
	for (const t of aa) {
		if (bb.has(t)) hits += 1;
	}
	return hits / Math.max(aa.size, bb.size);
}

function makeHaystack(bookMeta) {
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

function includesPhrase(haystack, phrase) {
	const n = normalizeArabic(phrase);
	return Boolean(n && haystack.includes(n));
}

function scoreKeyword(keyword, haystack, hayTokens) {
	const n = normalizeArabic(keyword);
	if (!n) return 0;
	if (haystack.includes(n)) return Math.max(4, n.split(' ').length * 3);
	let score = 0;
	for (const t of n.split(' ')) {
		if (t.length >= 3 && hayTokens.has(t)) score += 1;
	}
	return score;
}

const DOMAIN_RULES = Object.freeze([
	{
		id: 'talab-ilm',
		mainName: 'التربية والتعليم',
		mainAliases: ['التربية', 'التعليم', 'الدعوة والتربية', 'التربية الإسلامية'],
		subName: 'آداب طلب العلم',
		subAliases: ['طلب العلم', 'آداب طالب العلم', 'العلم والتعليم', 'التعليم الشرعي'],
		keywords: [
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'آداب طالب العلم',
			'آداب طلب العلم',
			'التعليم الشرعي',
			'التعلم',
			'التعليم',
			'وصايا',
			'نصائح',
			'توجيهات علمية'
		],
		secondaryName: 'نصائح لطالب العلم'
	},
	{
		id: 'quran',
		mainName: 'القرآن وعلومه',
		mainAliases: ['القرآن الكريم', 'علوم القرآن', 'التفسير وعلوم القرآن'],
		subName: 'التفسير وعلوم القرآن',
		subAliases: ['التفسير', 'علوم القرآن', 'القراءات والتجويد'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'المفسر', 'علوم القرآن', 'تجويد', 'قراءات', 'المصحف'],
		secondaryName: 'علوم القرآن'
	},
	{
		id: 'hadith',
		mainName: 'الحديث وعلومه',
		mainAliases: ['الحديث الشريف', 'السنة النبوية', 'علوم الحديث'],
		subName: 'الحديث الشريف',
		subAliases: ['الحديث', 'السنة', 'مصطلح الحديث', 'شروح الحديث'],
		keywords: ['حديث', 'الأحاديث', 'السنة', 'سنن', 'صحيح', 'رواية', 'إسناد', 'مصطلح الحديث'],
		secondaryName: 'كتب الحديث'
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		mainAliases: ['الفقه الإسلامي', 'الفقه', 'أصول الفقه'],
		subName: 'الفقه الإسلامي',
		subAliases: ['فقه', 'الأحكام الفقهية', 'العبادات', 'المعاملات', 'أصول الفقه'],
		keywords: [
			'فقه',
			'أصول الفقه',
			'الأحكام',
			'فتاوى',
			'العبادات',
			'المعاملات',
			'الصلاة',
			'الزكاة',
			'الصيام',
			'الحج',
			'الطهارة',
			'النكاح',
			'البيوع'
		],
		secondaryName: 'مسائل فقهية'
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		mainAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
		subName: 'العقيدة الإسلامية',
		subAliases: ['التوحيد', 'الإيمان', 'الفرق والمذاهب'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الإيمان', 'أسماء الله', 'صفات الله', 'الفرق', 'القدر'],
		secondaryName: 'التوحيد والعقيدة'
	},
	{
		id: 'seerah',
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التراجم والسير'],
		subName: 'السيرة النبوية',
		subAliases: ['السيرة', 'شمائل النبي', 'المغازي'],
		keywords: ['سيرة', 'السيرة', 'النبوية', 'شمائل', 'مغازي', 'النبي', 'الرسول'],
		secondaryName: 'السيرة النبوية'
	},
	{
		id: 'history',
		mainName: 'السيرة والتاريخ الإسلامي',
		mainAliases: ['التاريخ الإسلامي', 'السيرة والتاريخ', 'التاريخ والتراجم'],
		subName: 'التاريخ الإسلامي',
		subAliases: ['التاريخ', 'التراجم', 'الطبقات', 'البلدان'],
		keywords: ['تاريخ', 'التاريخ', 'تراجم', 'طبقات', 'أعلام', 'الخلافة', 'فتوح', 'البلدان'],
		secondaryName: 'التاريخ الإسلامي'
	},
	{
		id: 'tazkiyah-adab',
		mainName: 'التزكية والأخلاق',
		mainAliases: ['الأخلاق والآداب', 'الآداب الإسلامية', 'التزكية'],
		subName: 'الأخلاق والآداب',
		subAliases: ['الأدب الإسلامي', 'الآداب', 'الأخلاق', 'الرقائق'],
		keywords: ['أدب', 'آداب', 'الأخلاق', 'التزكية', 'الرقائق', 'المواعظ', 'الزهد', 'السلوك'],
		secondaryName: 'آداب إسلامية'
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وآدابها',
		mainAliases: ['اللغة العربية', 'العربية', 'الأدب العربي'],
		subName: 'اللغة العربية',
		subAliases: ['النحو والصرف', 'البلاغة', 'الأدب العربي', 'المعاجم'],
		keywords: ['لغة عربية', 'العربية', 'نحو', 'صرف', 'بلاغة', 'معجم', 'إعراب', 'الأدب العربي', 'شعر'],
		secondaryName: 'دراسات لغوية'
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والإرشاد',
		mainAliases: ['الدعوة', 'الإرشاد', 'الخطب والمحاضرات'],
		subName: 'الدعوة إلى الله',
		subAliases: ['الدعوة', 'الخطب', 'الإرشاد'],
		keywords: ['دعوة', 'الدعوة', 'خطب', 'محاضرات', 'إرشاد', 'المصلحون', 'الوعظ'],
		secondaryName: 'مواد دعوية'
	},
	{
		id: 'general-islamic',
		mainName: 'العلوم الإسلامية',
		mainAliases: ['كتب إسلامية', 'إسلاميات', 'مكتبة إسلامية'],
		subName: 'كتب إسلامية عامة',
		subAliases: ['متون ورسائل', 'كتب عامة', 'رسائل إسلامية'],
		keywords: ['إسلام', 'إسلامية', 'شرعي', 'شرعية', 'الدين'],
		secondaryName: 'متون ورسائل عامة'
	}
]);

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = makeHaystack(bookMeta);
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

function pickDomainRule(bookMeta) {
	const haystack = makeHaystack(bookMeta);
	const hayTokens = tokensOf(haystack);
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		let score = 0;
		for (const kw of rule.keywords) score += scoreKeyword(kw, haystack, hayTokens);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	if (!best || bestScore < 4) {
		return { rule: DOMAIN_RULES.find((r) => r.id === 'general-islamic'), score: 1 };
	}
	return { rule: best, score: bestScore };
}

function nodeScore(nodeName, desiredNames, haystack) {
	const node = normalizeArabic(nodeName);
	if (!node) return 0;
	let score = 0;
	for (const desired of desiredNames) {
		const d = normalizeArabic(desired);
		if (!d) continue;
		if (node === d) score = Math.max(score, 30);
		else if (node.includes(d) || d.includes(node)) score = Math.max(score, 20);
		score = Math.max(score, Math.round(tokenOverlapScore(node, d) * 16));
	}
	if (node.length >= 4 && haystack.includes(node)) score += 4;
	return score;
}

function findBestNode(nodes, desiredNames, haystack, minScore = 6) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = nodeScore(node?.name, desiredNames, haystack);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function inferSecondaryName(rule, bookMeta, haystack) {
	if (rule.id === 'quran') {
		if (includesPhrase(haystack, 'تجويد') || includesPhrase(haystack, 'قراءات')) return 'التجويد والقراءات';
		if (includesPhrase(haystack, 'تفسير')) return 'التفسير';
		return rule.secondaryName;
	}
	if (rule.id === 'hadith') {
		if (includesPhrase(haystack, 'مصطلح')) return 'مصطلح الحديث';
		if (includesPhrase(haystack, 'شرح') || includesPhrase(haystack, 'شروح')) return 'شروح الحديث';
		return rule.secondaryName;
	}
	if (rule.id === 'fiqh') {
		const topics = [
			['أصول الفقه', ['أصول الفقه', 'اصول الفقه']],
			['الصلاة', ['صلاة', 'الصلاة']],
			['الطهارة', ['طهارة']],
			['الزكاة', ['زكاة', 'الزكاة']],
			['الصيام', ['صيام', 'الصوم', 'رمضان']],
			['الحج والعمرة', ['حج', 'عمرة']],
			['المعاملات', ['معاملات', 'بيوع', 'ربا']],
			['فقه الأسرة', ['نكاح', 'طلاق', 'أسرة']]
		];
		for (const [name, kws] of topics) {
			if (kws.some((kw) => includesPhrase(haystack, kw))) return name;
		}
		return rule.secondaryName;
	}
	if (rule.id === 'talab-ilm') {
		if (includesPhrase(haystack, 'نصائح') || includesPhrase(haystack, 'وصايا')) return 'نصائح لطالب العلم';
		return 'آداب طلب العلم';
	}
	if (rule.id === 'arabic') {
		if (includesPhrase(haystack, 'نحو') || includesPhrase(haystack, 'صرف')) return 'النحو والصرف';
		if (includesPhrase(haystack, 'بلاغة')) return 'البلاغة';
		if (includesPhrase(haystack, 'الأدب العربي') || includesPhrase(haystack, 'شعر')) return 'الأدب العربي';
		return rule.secondaryName;
	}
	return rule.secondaryName || seriesStemFromTitle(bookMeta?.title || '') || 'كتب عامة';
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

	const decision = await classifyAutonomous(sections, bookMeta);
	const suggested = {
		mainId: decision.mainId || '',
		subId: decision.subId || '',
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
					{ mainId: suggested.mainId, subId: suggested.subId, secondaryId: suggested.secondaryId || null },
					sections.index
				)
			: { valid: false, reason: 'requires_section_creation' };
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

	const haystack = makeHaystack(bookMeta);
	const { rule, score: ruleScore } = pickDomainRule(bookMeta);
	const secondaryName = inferSecondaryName(rule, bookMeta, haystack);
	const mainNames = [rule.mainName, ...(rule.mainAliases || [])];
	const subNames = [rule.subName, ...(rule.subAliases || [])];
	const secNames = [secondaryName, rule.secondaryName, seriesStemFromTitle(bookMeta?.title || '')].filter(Boolean);

	const mainMatch = findBestNode(sections.tree, mainNames, haystack, 6);
	if (!mainMatch) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.35 + ruleScore * 0.02, 0.7),
			reasoning: `لم يُعثَر على قسم رئيسي مناسب لمجال "${rule.mainName}" — إنشاء المسار الكامل المناسب.`,
			method: 'heuristic'
		};
	}

	const mainNode = mainMatch.node;
	const subMatch = findBestNode(mainNode.children || [], subNames, haystack, 6);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(mainNode.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.45 + mainMatch.score * 0.01 + ruleScore * 0.02, 0.8),
			reasoning: `وُجد القسم الرئيسي "${mainNode.name}" لكن لا يوجد قسم فرعي مناسب لـ "${rule.subName}" — إنشاء المستوى الناقص.`,
			method: 'heuristic'
		};
	}

	const subNode = subMatch.node;
	const secMatch = findBestNode(subNode.children || [], secNames, haystack, 5);
	let secId = secMatch ? String(secMatch.node.id) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(subNode.id), bookMeta, {
			proposedNewName: secondaryName,
			minScore: 8
		});
		if (autoSec) secId = autoSec.id;
	}

	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(mainNode.id),
			subId: String(subNode.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: Math.min(
				0.5 + mainMatch.score * 0.01 + subMatch.score * 0.01 + ruleScore * 0.015,
				0.86
			),
			reasoning: `وُجد المسار "${mainNode.name} ← ${subNode.name}" لكن لا يوجد قسم ثانوي مناسب — إنشاء "${secondaryName}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(mainNode.id),
		subId: String(subNode.id),
		secondaryId: secId,
		confidence: Math.min(
			0.55 + mainMatch.score * 0.01 + subMatch.score * 0.01 + (secMatch?.score || 0) * 0.01,
			0.92
		),
		reasoning: `مطابقة مجال "${rule.mainName}" داخل المسار الثلاثي: ${mainNode.name} ← ${subNode.name} ← ${secMatch?.node?.name || secId}.`,
		method: 'heuristic'
	};
}
