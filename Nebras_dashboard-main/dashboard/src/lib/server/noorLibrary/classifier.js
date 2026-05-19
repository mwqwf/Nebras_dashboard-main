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

const TOPIC_RULES = Object.freeze(
	[
		{
			id: 'fiqh',
			mainName: 'الفقه الإسلامي',
			subName: 'الفقه وأصوله',
			secondaryName: 'مسائل فقهية',
			terms: ['فقه', 'فقهي', 'فقهية', 'الفقه', 'اصول الفقه', 'احكام', 'عبادات', 'معاملات'],
			mainAliases: ['الفقه الإسلامي', 'الفقه', 'الفقه وأصوله', 'أحكام شرعية'],
			subAliases: ['الفقه وأصوله', 'العبادات', 'المعاملات', 'أصول الفقه'],
			secondaryAliases: ['مسائل فقهية', 'أحكام فقهية', 'كتب الفقه']
		},
		{
			id: 'aqeedah',
			mainName: 'العقيدة',
			subName: 'العقيدة الإسلامية',
			secondaryName: 'كتب العقيدة',
			terms: ['عقيده', 'العقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات الله'],
			mainAliases: ['العقيدة', 'العقيدة الإسلامية', 'التوحيد'],
			subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
			secondaryAliases: ['كتب العقيدة', 'كتب التوحيد', 'مسائل الاعتقاد']
		},
		{
			id: 'hadith',
			mainName: 'الحديث الشريف',
			subName: 'علوم الحديث',
			secondaryName: 'كتب الحديث',
			terms: ['حديث', 'الحديث', 'احاديث', 'السنه', 'سنن', 'صحيح', 'مسند', 'رواه'],
			mainAliases: ['الحديث الشريف', 'الحديث', 'السنة النبوية'],
			subAliases: ['علوم الحديث', 'كتب الحديث', 'مصطلح الحديث', 'السنة'],
			secondaryAliases: ['كتب الحديث', 'شروح الحديث', 'مصطلح الحديث']
		},
		{
			id: 'quran',
			mainName: 'القرآن الكريم',
			subName: 'علوم القرآن',
			secondaryName: 'كتب القرآن وعلومه',
			terms: ['قران', 'القران', 'تفسير', 'التفسير', 'تجويد', 'قراءات', 'سوره', 'ايات'],
			mainAliases: ['القرآن الكريم', 'القرآن', 'التفسير وعلوم القرآن'],
			subAliases: ['علوم القرآن', 'التفسير', 'التجويد والقراءات'],
			secondaryAliases: ['كتب القرآن وعلومه', 'كتب التفسير', 'علوم القرآن']
		},
		{
			id: 'seerah',
			mainName: 'السيرة النبوية',
			subName: 'السيرة والشمائل',
			secondaryName: 'كتب السيرة النبوية',
			terms: ['سيره', 'السيره', 'شمائل', 'المغازي', 'النبي', 'الرسول', 'محمد صلى الله عليه وسلم'],
			mainAliases: ['السيرة النبوية', 'السيرة', 'التاريخ والسيرة'],
			subAliases: ['السيرة والشمائل', 'الشمائل', 'المغازي'],
			secondaryAliases: ['كتب السيرة النبوية', 'الشمائل المحمدية', 'المغازي']
		},
		{
			id: 'history',
			mainName: 'التاريخ الإسلامي',
			subName: 'التاريخ والسير',
			secondaryName: 'كتب التاريخ الإسلامي',
			terms: ['تاريخ', 'التاريخ', 'تراجم', 'اعلام', 'طبقات', 'فتوح', 'دول', 'الخلافه'],
			mainAliases: ['التاريخ الإسلامي', 'التاريخ', 'السير والتراجم'],
			subAliases: ['التاريخ والسير', 'التراجم والطبقات', 'السير'],
			secondaryAliases: ['كتب التاريخ الإسلامي', 'التراجم والطبقات', 'السير']
		},
		{
			id: 'talab_al_ilm',
			mainName: 'التزكية والأخلاق',
			subName: 'طلب العلم',
			secondaryName: 'آداب طالب العلم',
			terms: [
				'طلب العلم',
				'طالب العلم',
				'طلاب العلم',
				'اداب طالب العلم',
				'العالم والمتعلم',
				'التعليمات العلميه',
				'التوجيهات العلميه',
				'النصائح العلميه',
				'نصائح',
				'وصايا طالب العلم'
			],
			mainAliases: ['التزكية والأخلاق', 'الأخلاق', 'الآداب الشرعية', 'السلوك والآداب', 'الدعوة والتربية'],
			subAliases: ['طلب العلم', 'آداب طلب العلم', 'العلم والتعليم', 'التربية والتعليم', 'التعليم'],
			secondaryAliases: ['آداب طالب العلم', 'نصائح طلب العلم', 'وصايا طالب العلم', 'التعليمات العلمية']
		},
		{
			id: 'tazkiyah',
			mainName: 'التزكية والأخلاق',
			subName: 'الأخلاق والآداب',
			secondaryName: 'كتب الأخلاق والآداب',
			terms: ['تزكيه', 'اخلاق', 'اداب', 'زهد', 'رقائق', 'سلوك', 'مواعظ', 'نصائح'],
			mainAliases: ['التزكية والأخلاق', 'الأخلاق', 'الآداب الشرعية', 'السلوك والآداب'],
			subAliases: ['الأخلاق والآداب', 'التزكية', 'الرقائق والمواعظ', 'الزهد'],
			secondaryAliases: ['كتب الأخلاق والآداب', 'المواعظ والرقائق', 'الآداب']
		},
		{
			id: 'arabic',
			mainName: 'اللغة العربية',
			subName: 'علوم اللغة',
			secondaryName: 'كتب اللغة العربية',
			terms: ['لغه عربيه', 'العربيه', 'نحو', 'صرف', 'بلاغه', 'ادب عربي', 'شعر'],
			mainAliases: ['اللغة العربية', 'العربية', 'الأدب واللغة'],
			subAliases: ['علوم اللغة', 'النحو والصرف', 'البلاغة', 'الأدب العربي'],
			secondaryAliases: ['كتب اللغة العربية', 'النحو والصرف', 'البلاغة']
		},
		{
			id: 'dawah',
			mainName: 'الدعوة الإسلامية',
			subName: 'الدعوة والإرشاد',
			secondaryName: 'كتب الدعوة والإرشاد',
			terms: ['دعوه', 'الدعوه', 'ارشاد', 'خطب', 'محاضرات', 'تبليغ'],
			mainAliases: ['الدعوة الإسلامية', 'الدعوة', 'الدعوة والتربية'],
			subAliases: ['الدعوة والإرشاد', 'الخطب والمحاضرات', 'الإرشاد'],
			secondaryAliases: ['كتب الدعوة والإرشاد', 'الخطب والمحاضرات']
		}
	].map((rule) => ({
		...rule,
		normalizedTerms: rule.terms.map(normalizeArabic).filter(Boolean),
		normalizedMainAliases: [rule.mainName, ...(rule.mainAliases || [])].map(normalizeArabic).filter(Boolean),
		normalizedSubAliases: [rule.subName, ...(rule.subAliases || [])].map(normalizeArabic).filter(Boolean),
		normalizedSecondaryAliases: [rule.secondaryName, ...(rule.secondaryAliases || [])]
			.map(normalizeArabic)
			.filter(Boolean)
	}))
);

function tokensOfText(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function titleStem(title) {
	let stem = seriesStemFromTitle(title || '');
	stem = stem
		.replace(/^(?:كتاب|رساله|مختصر|شرح)\s+/u, '')
		.replace(/\s+/g, ' ')
		.trim();
	return stem && stem.length >= 4 && stem.length <= 70 ? stem : '';
}

function scoreAliasMatch(normalizedName, aliases) {
	if (!normalizedName) return 0;
	let score = 0;
	const nameTokens = tokensOfText(normalizedName);
	for (const alias of aliases || []) {
		if (!alias) continue;
		if (normalizedName === alias) score = Math.max(score, 16);
		else if (normalizedName.includes(alias) || alias.includes(normalizedName)) {
			score = Math.max(score, 11);
		} else {
			const aliasTokens = tokensOfText(alias);
			const ratio = tokenSetsOverlapRatio(nameTokens, aliasTokens);
			if (ratio >= 0.5) score = Math.max(score, 8);
			else if (ratio >= 0.25) score = Math.max(score, 4);
		}
	}
	return score;
}

function inferTopic(bookMeta) {
	const title = normalizeArabic(bookMeta?.title || '');
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
	for (const rule of TOPIC_RULES) {
		let score = 0;
		for (const term of rule.normalizedTerms) {
			if (!term) continue;
			if (title.includes(term)) score += term.length >= 8 ? 8 : 5;
			else if (haystack.includes(term)) score += term.length >= 8 ? 5 : 3;
		}
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (best) return best;

	const hint = (bookMeta?.categoryHints || [])
		.map((h) =>
			String(h || '')
				.replace(/^كتب\s+(?:في|عن)\s+/u, '')
				.trim()
		)
		.find((h) => h && /[\u0600-\u06FF]/.test(h) && h.length <= 50);
	const stem = titleStem(bookMeta?.title || '');
	return {
		id: 'general',
		mainName: 'المكتبة',
		subName: hint || 'كتب متنوعة',
		secondaryName: stem || hint || 'كتب متنوعة',
		normalizedMainAliases: [normalizeArabic('المكتبة'), normalizeArabic('كتب إسلامية')],
		normalizedSubAliases: [normalizeArabic(hint || 'كتب متنوعة')],
		normalizedSecondaryAliases: [normalizeArabic(stem || hint || 'كتب متنوعة')]
	};
}

function scoreNode(nodeName, haystack, tokens, aliases = []) {
	const n = normalizeArabic(nodeName);
	if (!n) return 0;
	let score = scoreAliasMatch(n, aliases);
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 4;
	return score;
}

function pickBestNode(nodes, haystack, tokens, aliases = []) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNode(node?.name, haystack, tokens, aliases);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return { node: best, score: bestScore };
}

function proposedSecondaryName(bookMeta, topic) {
	if (topic?.id === 'talab_al_ilm') return topic.secondaryName;
	const stem = titleStem(bookMeta?.title || '');
	if (stem && topic?.id === 'general') return stem;
	return topic?.secondaryName || stem || 'كتب متنوعة';
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
		throw Object.assign(
			new Error('لا توجد أقسام رئيسيّة في قاعدة البيانات — أنشئ قسماً واحداً على الأقل قبل استخدام الجلب الآلي.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const sug = await classifyAutonomous(sections, bookMeta);
	const validation =
		sug.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
					sections.index
				)
			: { valid: false, reason: `${sug.kind}_required` };
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
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

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
	const tokens = tokensOfText(haystack);
	const topic = inferTopic(bookMeta);
	const secondaryName = proposedSecondaryName(bookMeta, topic);

	const mainPick = pickBestNode(
		sections.tree,
		haystack,
		tokens,
		topic.normalizedMainAliases
	);
	if (!mainPick.node || mainPick.score < 4) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: topic.mainName,
			newSubName: topic.subName,
			newSecondaryName: secondaryName,
			confidence: 0.35,
			reasoning: `لم يُعثَر على قسم رئيسي مناسب لموضوع "${topic.subName}" — إنشاء مسار ثلاثي جديد.`,
			method: 'heuristic'
		};
	}

	const subPick = pickBestNode(
		mainPick.node.children || [],
		haystack,
		tokens,
		topic.normalizedSubAliases
	);
	if (!subPick.node || subPick.score < 4) {
		return {
			kind: 'create_sub',
			mainId: String(mainPick.node.id),
			subId: null,
			secondaryId: null,
			newSubName: topic.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.45 + mainPick.score * 0.03, 0.75),
			reasoning: `وُجد قسم رئيسي مناسب "${mainPick.node.name}" دون فرع دقيق لموضوع "${topic.subName}" — إنشاء فرع وقسم ثانوي.`,
			method: 'heuristic'
		};
	}

	const autoSec = pickReuseSecondary(sections, String(subPick.node.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 7
	});
	if (!autoSec) {
		return {
			kind: 'create_secondary',
			mainId: String(mainPick.node.id),
			subId: String(subPick.node.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.5 + mainPick.score * 0.03 + subPick.score * 0.03, 0.82),
			reasoning: `وُجد المسار "${mainPick.node.name} ← ${subPick.node.name}" دون قسم ثانوي مناسب — إنشاء "${secondaryName}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(mainPick.node.id),
		subId: String(subPick.node.id),
		secondaryId: autoSec.id,
		confidence: Math.min(0.55 + mainPick.score * 0.03 + subPick.score * 0.03 + autoSec.score * 0.02, 0.95),
		reasoning: `مطابقة محلّيّة ثلاثية: ${mainPick.node.name} ← ${subPick.node.name} ← ${autoSec.name}.`,
		method: 'heuristic'
	};
}
