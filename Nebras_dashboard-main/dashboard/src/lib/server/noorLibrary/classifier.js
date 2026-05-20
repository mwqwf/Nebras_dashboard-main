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
		confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05 + bestSecScore * 0.03, 0.85),
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

const TOPIC_RULES = Object.freeze([
	{
		id: 'learning_adab',
		mainName: 'التزكية والآداب والأخلاق',
		subName: 'آداب طلب العلم',
		secondaryName: 'نصائح وتوجيهات علمية',
		mainAliases: ['التزكية', 'الأخلاق', 'الآداب', 'الرقائق', 'التربية'],
		subAliases: ['آداب طلب العلم', 'طلب العلم', 'العلم والتعليم', 'التربية العلمية'],
		secondaryAliases: [
			'نصائح وتوجيهات علمية',
			'وصايا علمية',
			'آداب طالب العلم',
			'تعليمات علمية'
		],
		keywords: [
			['طلب العلم', 7],
			['طالب العلم', 7],
			['اداب العالم', 7],
			['اداب المتعلم', 7],
			['العالم والمتعلم', 7],
			['وصايا', 4],
			['نصائح', 4],
			['توجيهات', 4],
			['تعليمات', 4],
			['التعليم', 3],
			['تعلم', 3],
			['العلميه', 3],
			['الساده', 2]
		]
	},
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		mainAliases: ['القرآن', 'القرآن الكريم', 'علوم القرآن', 'التفسير'],
		subAliases: ['التفسير', 'علوم القرآن', 'تفسير القرآن', 'القراءات والتجويد'],
		secondaryAliases: ['التفسير', 'علوم القرآن', 'القراءات', 'التجويد'],
		keywords: [
			['القران', 5],
			['تفسير', 6],
			['علوم القران', 7],
			['قراءات', 5],
			['تجويد', 5],
			['المصحف', 4],
			['ناسخ', 3],
			['منسوخ', 3]
		],
		secondaryByKeyword: [
			{ name: 'القراءات والتجويد', aliases: ['القراءات', 'التجويد'], keywords: ['قراءات', 'تجويد'] },
			{ name: 'علوم القرآن', aliases: ['علوم القرآن'], keywords: ['علوم القران', 'ناسخ', 'منسوخ', 'اسباب النزول'] }
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'متون وشروح الحديث',
		mainAliases: ['الحديث', 'الحديث الشريف', 'السنة', 'علوم الحديث'],
		subAliases: ['الحديث وعلومه', 'علوم الحديث', 'كتب السنة', 'مصطلح الحديث'],
		secondaryAliases: ['متون وشروح الحديث', 'مصطلح الحديث', 'الجرح والتعديل', 'رجال الحديث'],
		keywords: [
			['حديث', 6],
			['احاديث', 6],
			['السنه', 5],
			['صحيح البخاري', 7],
			['صحيح مسلم', 7],
			['سنن', 4],
			['مصطلح الحديث', 7],
			['اسناد', 4],
			['رجال الحديث', 6],
			['جرح', 4],
			['تعديل', 4]
		],
		secondaryByKeyword: [
			{ name: 'مصطلح الحديث', aliases: ['مصطلح الحديث'], keywords: ['مصطلح الحديث', 'اسناد'] },
			{ name: 'الجرح والتعديل ورجال الحديث', aliases: ['رجال الحديث', 'الجرح والتعديل'], keywords: ['رجال الحديث', 'جرح', 'تعديل'] }
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل فقهية عامة',
		mainAliases: ['الفقه', 'الفقه الإسلامي', 'أصول الفقه', 'الشريعة'],
		subAliases: ['الفقه الإسلامي', 'أصول الفقه', 'القواعد الفقهية', 'العبادات', 'المعاملات'],
		secondaryAliases: ['مسائل فقهية عامة', 'العبادات', 'المعاملات', 'أصول الفقه', 'القواعد الفقهية'],
		keywords: [
			['فقه', 7],
			['اصول الفقه', 8],
			['الشريعه', 5],
			['احكام', 4],
			['فتاوي', 5],
			['الحلال', 3],
			['الحرام', 3],
			['طهاره', 4],
			['صلاه', 4],
			['زكاه', 4],
			['صوم', 4],
			['حج', 4],
			['بيوع', 5],
			['معاملات', 5],
			['نكاح', 5],
			['طلاق', 5],
			['مواريث', 5],
			['قضاء', 4],
			['اداب المفتي', 7],
			['اداب الفتوي', 7],
			['اداب القضاء', 7]
		],
		secondaryByKeyword: [
			{ name: 'أصول الفقه', aliases: ['أصول الفقه'], keywords: ['اصول الفقه'] },
			{ name: 'القواعد الفقهية', aliases: ['القواعد الفقهية'], keywords: ['قواعد فقهيه', 'القواعد الفقهيه'] },
			{ name: 'العبادات', aliases: ['العبادات'], keywords: ['طهاره', 'صلاه', 'زكاه', 'صوم', 'حج'] },
			{ name: 'المعاملات', aliases: ['المعاملات', 'البيوع'], keywords: ['بيوع', 'معاملات', 'ربا'] },
			{ name: 'الأحوال الشخصية والمواريث', aliases: ['الأحوال الشخصية', 'المواريث'], keywords: ['نكاح', 'طلاق', 'مواريث'] }
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'التوحيد والإيمان',
		mainAliases: ['العقيدة', 'التوحيد', 'الإيمان'],
		subAliases: ['العقيدة الإسلامية', 'التوحيد', 'الإيمان', 'الفرق والمذاهب'],
		secondaryAliases: ['التوحيد والإيمان', 'الأسماء والصفات', 'الفرق والمذاهب'],
		keywords: [
			['عقيده', 7],
			['توحيد', 7],
			['ايمان', 5],
			['اسماء الله', 5],
			['صفات', 4],
			['الفرق', 4],
			['مذاهب', 3],
			['كلاميه', 4]
		],
		secondaryByKeyword: [
			{ name: 'الأسماء والصفات', aliases: ['الأسماء والصفات'], keywords: ['اسماء الله', 'صفات'] },
			{ name: 'الفرق والمذاهب', aliases: ['الفرق والمذاهب'], keywords: ['الفرق', 'مذاهب', 'كلاميه'] }
		]
	},
	{
		id: 'seerah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة والتاريخ',
		secondaryName: 'التاريخ الإسلامي',
		mainAliases: ['السيرة', 'التاريخ الإسلامي', 'التاريخ', 'التراجم'],
		subAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التراجم والطبقات'],
		secondaryAliases: ['السيرة النبوية', 'التاريخ الإسلامي', 'التراجم والطبقات'],
		keywords: [
			['سيره', 6],
			['مغازي', 5],
			['تاريخ', 5],
			['تراجم', 5],
			['طبقات', 5],
			['خلافه', 4],
			['فتوح', 4],
			['اندلس', 4]
		],
		secondaryByKeyword: [
			{ name: 'السيرة النبوية', aliases: ['السيرة النبوية', 'المغازي'], keywords: ['سيره', 'مغازي'] },
			{ name: 'التراجم والطبقات', aliases: ['التراجم', 'الطبقات'], keywords: ['تراجم', 'طبقات'] }
		]
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية وآدابها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'الأدب العربي',
		mainAliases: ['اللغة العربية', 'الأدب العربي', 'النحو', 'البلاغة'],
		subAliases: ['علوم اللغة العربية', 'الأدب العربي', 'النحو والصرف', 'البلاغة'],
		secondaryAliases: ['الأدب العربي', 'النحو والصرف', 'البلاغة', 'الشعر'],
		keywords: [
			['لغه عربيه', 6],
			['نحو', 5],
			['صرف', 5],
			['بلاغه', 5],
			['ادب عربي', 6],
			['شعر', 5],
			['عروض', 4],
			['قوافي', 4],
			['نثر', 4]
		],
		secondaryByKeyword: [
			{ name: 'النحو والصرف', aliases: ['النحو والصرف', 'النحو', 'الصرف'], keywords: ['نحو', 'صرف'] },
			{ name: 'البلاغة', aliases: ['البلاغة'], keywords: ['بلاغه'] },
			{ name: 'الشعر والعروض', aliases: ['الشعر', 'العروض'], keywords: ['شعر', 'عروض', 'قوافي'] }
		]
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والآداب والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'تزكية وآداب عامة',
		mainAliases: ['التزكية', 'الأخلاق', 'الآداب', 'الرقائق'],
		subAliases: ['الأخلاق والآداب', 'التزكية', 'الرقائق والزهد'],
		secondaryAliases: ['تزكية وآداب عامة', 'الرقائق والزهد', 'الأخلاق'],
		keywords: [
			['اخلاق', 6],
			['اداب', 4],
			['تزكيه', 6],
			['رقائق', 5],
			['زهد', 5],
			['سلوك', 4],
			['موعظه', 4],
			['وصايا', 3],
			['نصائح', 3]
		],
		secondaryByKeyword: [
			{ name: 'الرقائق والزهد', aliases: ['الرقائق', 'الزهد'], keywords: ['رقائق', 'زهد'] }
		]
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والثقافة الإسلامية',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'دروس ودعوة عامة',
		mainAliases: ['الدعوة', 'الثقافة الإسلامية', 'الإرشاد'],
		subAliases: ['الدعوة والإرشاد', 'الثقافة الإسلامية'],
		secondaryAliases: ['دروس ودعوة عامة', 'محاضرات ودروس'],
		keywords: [
			['دعوه', 6],
			['ارشاد', 5],
			['محاضرات', 4],
			['دروس', 3],
			['ثقافه اسلاميه', 5]
		]
	}
]);

function containsNormalized(haystack, needle) {
	const n = normalizeArabic(needle);
	return Boolean(n && haystack.includes(n));
}

function pickTopicRule(bookMeta) {
	const haystack = haystackForReuse(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		let score = 0;
		for (const [kw, weight] of rule.keywords || []) {
			if (containsNormalized(haystack, kw)) score += weight;
		}
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 4) return null;
	return { rule: best, score: bestScore, haystack };
}

function scoreNameAgainstAliases(name, aliases = []) {
	const nameN = normalizeArabic(name);
	if (!nameN) return 0;
	const nameTok = new Set(nameN.split(' ').filter((w) => w.length >= 3));
	let best = 0;
	for (const alias of aliases) {
		const aliasN = normalizeArabic(alias);
		if (!aliasN) continue;
		let score = 0;
		if (nameN === aliasN) score += 24;
		else if (nameN.includes(aliasN) || aliasN.includes(nameN)) score += 14;
		const aliasTok = new Set(aliasN.split(' ').filter((w) => w.length >= 3));
		score += tokenSetsOverlapRatio(nameTok, aliasTok) * 12;
		if (score > best) best = score;
	}
	return best;
}

function pickBestNode(nodes, aliases, minScore) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreNameAgainstAliases(node?.name, aliases);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function resolveSecondarySpec(rule, haystack) {
	for (const spec of rule.secondaryByKeyword || []) {
		if ((spec.keywords || []).some((kw) => containsNormalized(haystack, kw))) {
			return {
				name: spec.name,
				aliases: [spec.name, ...(spec.aliases || [])]
			};
		}
	}
	return {
		name: rule.secondaryName,
		aliases: [rule.secondaryName, ...(rule.secondaryAliases || [])]
	};
}

function suggestedSecondaryName(bookMeta, fallback = 'كتب متنوّعة') {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4 && stem.length <= 80) return stem;
	const hints = (bookMeta?.categoryHints || [])
		.map((h) => String(h || '').trim())
		.filter(Boolean);
	return hints[0]?.slice(0, 80) || fallback;
}

function pickBestCategoryHint(bookMeta) {
	const hints = (bookMeta?.categoryHints || [])
		.map((h) => String(h || '').trim())
		.filter(Boolean);
	for (const hint of hints) {
		if (/[\u0600-\u06FF]/.test(hint)) return hint.slice(0, 80);
	}
	return 'كتب متنوّعة';
}

function classifyByTopicRule(sections, bookMeta) {
	const picked = pickTopicRule(bookMeta);
	if (!picked) return null;
	const { rule, score, haystack } = picked;
	const secondarySpec = resolveSecondarySpec(rule, haystack);
	const mainAliases = [rule.mainName, ...(rule.mainAliases || [])];
	const subAliases = [rule.subName, ...(rule.subAliases || [])];

	const mainMatch = pickBestNode(sections.tree || [], mainAliases, 8);
	if (!mainMatch) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName: secondarySpec.name,
			confidence: Math.min(0.58 + score * 0.03, 0.94),
			reasoning: `تصنيف موضوعي: لا يوجد قسم رئيسي مناسب لـ "${rule.mainName}" — إنشاء مسار ثلاثي كامل.`,
			method: 'heuristic'
		};
	}

	const subMatch = pickBestNode(mainMatch.node.children || [], subAliases, 7);
	if (!subMatch) {
		return {
			kind: 'create_sub',
			mainId: String(mainMatch.node.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: secondarySpec.name,
			confidence: Math.min(0.62 + score * 0.03, 0.95),
			reasoning: `تصنيف موضوعي: وُجد "${mainMatch.node.name}"، ولا يوجد فرع مناسب لـ "${rule.subName}" — إنشاء فرع وثانوي.`,
			method: 'heuristic'
		};
	}

	const secondaryMatch = pickBestNode(subMatch.node.children || [], secondarySpec.aliases, 7);
	if (secondaryMatch) {
		return {
			kind: 'existing',
			mainId: String(mainMatch.node.id),
			subId: String(subMatch.node.id),
			secondaryId: String(secondaryMatch.node.id),
			confidence: Math.min(0.7 + score * 0.025, 0.97),
			reasoning: `تصنيف موضوعي: ${mainMatch.node.name} ← ${subMatch.node.name} ← ${secondaryMatch.node.name}.`,
			method: 'heuristic'
		};
	}

	const reuse = pickReuseSecondary(sections, String(subMatch.node.id), bookMeta, {
		proposedNewName: secondarySpec.name,
		minScore: 8
	});
	if (reuse) {
		return {
			kind: 'existing',
			mainId: String(mainMatch.node.id),
			subId: String(subMatch.node.id),
			secondaryId: reuse.id,
			confidence: Math.min(0.66 + score * 0.025, 0.93),
			reasoning: `تصنيف موضوعي: استُخدم قسم ثانوي قريب "${reuse.name}" داخل المسار المناسب.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(mainMatch.node.id),
		subId: String(subMatch.node.id),
		secondaryId: null,
		newSecondaryName: secondarySpec.name,
		confidence: Math.min(0.64 + score * 0.03, 0.95),
		reasoning: `تصنيف موضوعي: المسار الرئيسي/الفرعي مناسب، ولا يوجد قسم ثانوي مناسب — إنشاء "${secondarySpec.name}".`,
		method: 'heuristic'
	};
}

function classifyFallbackAutonomous(sections, bookMeta) {
	const sug = classifyHeuristic(sections, bookMeta);
	const subHint = pickBestCategoryHint(bookMeta);
	const secHint = suggestedSecondaryName(bookMeta, subHint);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'المكتبة الإسلامية',
			newSubName: subHint,
			newSecondaryName: secHint,
			confidence: 0.34,
			reasoning: 'لم تُعثَر مطابقة موثوقة — إنشاء مسار ثلاثي جديد محافظ.',
			method: 'heuristic'
		};
	}
	if (!sug.secondaryId) {
		const reuse = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: secHint,
			minScore: 8
		});
		if (reuse) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: reuse.id,
				confidence: Math.max(sug.confidence, 0.58),
				reasoning: `مطابقة محلية مع قسم ثانوي قريب "${reuse.name}".`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			secondaryId: null,
			newSecondaryName: secHint,
			confidence: Math.max(sug.confidence, 0.52),
			reasoning: 'وُجد main/sub مناسبان، ولا يوجد secondary مناسب — إنشاء قسم ثانوي.',
			method: 'heuristic'
		};
	}
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

	const decision = classifyByTopicRule(sections, bookMeta) || classifyFallbackAutonomous(sections, bookMeta);
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
					creation: {
						kind: decision.kind,
						newMainName: decision.newMainName || null,
						newSubName: decision.newSubName || null,
						newSecondaryName: decision.newSecondaryName || null
					}
				};
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
		const picked = pickTopicRule(bookMeta);
		const rule = picked?.rule;
		const subHint = rule?.subName || pickBestCategoryHint(bookMeta);
		const secHint = rule
			? resolveSecondarySpec(rule, picked.haystack).name
			: suggestedSecondaryName(bookMeta, subHint);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule?.mainName || 'المكتبة الإسلامية',
			newSubName: subHint,
			newSecondaryName: secHint,
			confidence: rule ? 0.66 : 0.34,
			reasoning: 'لا توجد شجرة أقسام متاحة — إنشاء مسار ثلاثي جديد للكتاب.',
			method: 'heuristic'
		};
	}

	return classifyByTopicRule(sections, bookMeta) || classifyFallbackAutonomous(sections, bookMeta);
}
