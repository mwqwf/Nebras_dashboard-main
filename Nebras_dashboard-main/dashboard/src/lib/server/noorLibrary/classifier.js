/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 *
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * قواعد موضوعية محليّة + heuristic عربي خفيف يعملان دون أيّ تكلفة شبكيّة.
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

const STOP_WORDS = new Set(
	[
		'كتاب',
		'كتب',
		'شرح',
		'حول',
		'في',
		'من',
		'الي',
		'على',
		'عن',
		'مع',
		'هذا',
		'هذه',
		'ذلك',
		'تلك',
		'التي',
		'الذي'
	].map(normalizeArabic)
);

function wordsOf(text) {
	return normalizeArabic(text)
		.split(' ')
		.map((w) => w.trim())
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function uniqueWords(text) {
	return new Set(wordsOf(text));
}

function makeHaystack(bookMeta) {
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

function tokenSetsOverlapRatio(setA, setB) {
	if (!setA.size || !setB.size) return 0;
	let inter = 0;
	for (const t of setA) if (setB.has(t)) inter += 1;
	return inter / new Set([...setA, ...setB]).size;
}

function aliasScore(text, aliases) {
	const n = normalizeArabic(text);
	if (!n) return 0;
	const nodeTokens = uniqueWords(n);
	let best = 0;
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (n === a) best = Math.max(best, 20);
		else if (n.includes(a) || a.includes(n)) best = Math.max(best, 14);
		const aliasTokens = uniqueWords(a);
		const overlap = tokenSetsOverlapRatio(nodeTokens, aliasTokens);
		if (overlap >= 0.5) best = Math.max(best, 10 + overlap * 6);
		else if (overlap >= 0.25) best = Math.max(best, 5 + overlap * 6);
	}
	return best;
}

function keywordScore(haystack, keywords) {
	let score = 0;
	const hayTokens = uniqueWords(haystack);
	for (const keyword of keywords || []) {
		const k = normalizeArabic(keyword);
		if (!k) continue;
		if (haystack.includes(k)) {
			score += k.includes(' ') ? 3 : 1;
			continue;
		}
		const keyTokens = uniqueWords(k);
		if (tokenSetsOverlapRatio(hayTokens, keyTokens) >= 0.5) score += 1;
	}
	return score;
}

const TAXONOMY_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير وعلوم القرآن',
		mainAliases: ['القرآن الكريم وعلومه', 'القرآن وعلومه', 'علوم القرآن'],
		subAliases: ['التفسير وعلوم القرآن', 'التفسير', 'علوم القرآن'],
		secondaryAliases: ['التفسير وعلوم القرآن', 'التفسير', 'علوم القرآن'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'تفاسير', 'علوم القرآن', 'تجويد', 'قراءات', 'مصاحف']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'كتب الحديث',
		secondaryName: 'الحديث وعلومه',
		mainAliases: ['الحديث الشريف وعلومه', 'الحديث وعلومه', 'السنة النبوية'],
		subAliases: ['كتب الحديث', 'متون الحديث', 'علوم الحديث', 'السنة'],
		secondaryAliases: ['الحديث وعلومه', 'علوم الحديث', 'مصطلح الحديث', 'كتب السنة'],
		keywords: ['حديث', 'احاديث', 'السنة', 'سنن', 'صحيح', 'مسند', 'مصطلح الحديث', 'جرح وتعديل']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي وأصوله',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية',
		mainAliases: ['الفقه الإسلامي وأصوله', 'الفقه وأصوله', 'الفقه الاسلامي'],
		subAliases: ['الفقه وأصوله', 'الفقه', 'أصول الفقه', 'اصول الفقه'],
		secondaryAliases: ['مسائل فقهية', 'العبادات', 'المعاملات', 'أصول الفقه', 'اصول الفقه'],
		keywords: [
			'فقه',
			'فقهي',
			'فتاوى',
			'احكام',
			'حلال',
			'حرام',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'طهارة',
			'معاملات',
			'أصول الفقه',
			'اصول الفقه'
		]
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'التوحيد والعقيدة',
		mainAliases: ['العقيدة الإسلامية', 'العقيدة الاسلامية', 'العقيدة'],
		subAliases: ['العقيدة والتوحيد', 'التوحيد', 'الإيمان', 'الايمان'],
		secondaryAliases: ['التوحيد والعقيدة', 'العقيدة', 'التوحيد', 'الإيمان', 'الايمان'],
		keywords: ['عقيدة', 'توحيد', 'ايمان', 'الإيمان', 'اسماء الله', 'صفات الله', 'القدر', 'الشرك']
	},
	{
		id: 'seerah',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة النبوية',
		secondaryName: 'السيرة النبوية',
		mainAliases: ['السيرة والتاريخ الإسلامي', 'السيرة والتاريخ الاسلامي', 'التاريخ الإسلامي'],
		subAliases: ['السيرة النبوية', 'السيرة', 'شمائل النبي', 'المغازي'],
		secondaryAliases: ['السيرة النبوية', 'شمائل النبي', 'المغازي'],
		keywords: ['سيرة', 'نبوية', 'النبي', 'رسول الله', 'شمائل', 'مغازي', 'غزوات']
	},
	{
		id: 'history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'تراجم وتاريخ',
		mainAliases: ['السيرة والتاريخ الإسلامي', 'التاريخ الإسلامي', 'تاريخ إسلامي', 'تاريخ اسلامي'],
		subAliases: ['التاريخ الإسلامي', 'تاريخ إسلامي', 'تاريخ اسلامي', 'تراجم'],
		secondaryAliases: ['تراجم وتاريخ', 'التراجم', 'الطبقات', 'تاريخ الخلفاء'],
		keywords: ['تاريخ', 'تراجم', 'طبقات', 'خلفاء', 'دولة', 'اندلس', 'سلاطين', 'فتوحات']
	},
	{
		id: 'education',
		mainName: 'الدعوة والتعليم الشرعي',
		subName: 'التعليم الشرعي',
		secondaryName: 'آداب طلب العلم',
		mainAliases: ['الدعوة والتعليم الشرعي', 'التعليم الشرعي', 'الدعوة'],
		subAliases: ['التعليم الشرعي', 'طلب العلم', 'التربية العلمية', 'الدروس العلمية'],
		secondaryAliases: [
			'آداب طلب العلم',
			'اداب طلب العلم',
			'نصائح طلب العلم',
			'التعليمات العلمية',
			'وصايا علمية'
		],
		keywords: [
			'تعليم',
			'تعليمي',
			'تعليمات',
			'العلمية',
			'طلب العلم',
			'طالب العلم',
			'طلاب العلم',
			'نصائح',
			'وصايا',
			'ارشادات',
			'إرشادات',
			'توجيهات',
			'منهجية',
			'دروس علمية',
			'السادة'
		]
	},
	{
		id: 'adab',
		mainName: 'التزكية والأخلاق والآداب',
		subName: 'الأخلاق والآداب',
		secondaryName: 'الأخلاق والآداب الإسلامية',
		mainAliases: ['التزكية والأخلاق والآداب', 'التزكية والاخلاق والاداب', 'الأخلاق والآداب'],
		subAliases: ['الأخلاق والآداب', 'الآداب', 'الأخلاق', 'الرقائق'],
		secondaryAliases: ['الأخلاق والآداب الإسلامية', 'الآداب الشرعية', 'الأخلاق الإسلامية', 'الرقائق'],
		keywords: ['اخلاق', 'أخلاق', 'اداب', 'آداب', 'تزكية', 'زهد', 'رقائق', 'سلوك', 'موعظة', 'مواعظ']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وعلومها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو واللغة',
		mainAliases: ['اللغة العربية وعلومها', 'اللغة العربية', 'العربية وعلومها'],
		subAliases: ['علوم اللغة العربية', 'النحو', 'الصرف', 'البلاغة'],
		secondaryAliases: ['النحو واللغة', 'النحو', 'الصرف', 'البلاغة', 'المعاجم'],
		keywords: ['لغة عربية', 'النحو', 'نحو', 'صرف', 'بلاغة', 'اعراب', 'إعراب', 'معجم', 'معاجم']
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
	const tokens = uniqueWords(haystack);

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

	let bestMain = null,
		bestMainScore = -1;
	for (const m of tree) {
		const s = scoreOf(m.name);
		if (s > bestMainScore) {
			bestMainScore = s;
			bestMain = m;
		}
	}
	if (!bestMain || bestMainScore <= 0) return null;

	let bestSub = null,
		bestSubScore = -1;
	for (const sub of bestMain.children || []) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) {
			bestSubScore = s;
			bestSub = sub;
		}
	}
	if (!bestSub || bestSubScore <= 0) return null;

	let bestSec = null,
		bestSecScore = -1;
	for (const sec of bestSub.children || []) {
		const s = scoreOf(sec.name);
		if (s > bestSecScore) {
			bestSecScore = s;
			bestSec = sec;
		}
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
	return makeHaystack(bookMeta);
}

function getSecondariesUnderSubInTree(tree, subId) {
	for (const m of tree || []) {
		for (const s of m.children || []) {
			if (String(s.id) === String(subId)) return s.children || [];
		}
	}
	return [];
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

function scoreTaxonomyRule(rule, bookMeta) {
	const hay = makeHaystack(bookMeta);
	let score = keywordScore(hay, rule.keywords);
	score += keywordScore(hay, rule.mainAliases) * 0.5;
	score += keywordScore(hay, rule.subAliases) * 0.75;
	score += keywordScore(hay, rule.secondaryAliases);
	return score;
}

function pickTaxonomyRule(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const rule of TAXONOMY_RULES) {
		const score = scoreTaxonomyRule(rule, bookMeta);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	if (!best || bestScore < 2) return null;
	return { rule: best, score: bestScore };
}

function bestPathForRule(sections, rule) {
	let best = null;
	for (const main of sections.tree || []) {
		const mainScore = aliasScore(main.name, rule.mainAliases);
		for (const sub of main.children || []) {
			const subScore = aliasScore(sub.name, rule.subAliases);
			const secondaries = sub.children || [];
			if (secondaries.length === 0) {
				const score = mainScore * 0.6 + subScore;
				if (!best || score > best.score) {
					best = { main, sub, secondary: null, mainScore, subScore, secondaryScore: 0, score };
				}
				continue;
			}
			for (const secondary of secondaries) {
				const secondaryScore = aliasScore(secondary.name, rule.secondaryAliases);
				const score = mainScore * 0.6 + subScore + secondaryScore * 1.2;
				if (!best || score > best.score) {
					best = { main, sub, secondary, mainScore, subScore, secondaryScore, score };
				}
			}
		}
		if (!main.children?.length) {
			const score = mainScore * 0.6;
			if (!best || score > best.score) {
				best = { main, sub: null, secondary: null, mainScore, subScore: 0, secondaryScore: 0, score };
			}
		}
	}
	return best;
}

function decisionFromTaxonomy(sections, bookMeta) {
	const picked = pickTaxonomyRule(bookMeta);
	if (!picked) return null;

	const { rule, score } = picked;
	const path = bestPathForRule(sections, rule);
	const confidence = Math.min(0.62 + score * 0.04, 0.94);
	const reasoning = `تصنيف موضوعي محلي: ${rule.subName} > ${rule.secondaryName}`;

	if (path?.secondary && path.secondaryScore >= 7) {
		return {
			kind: 'existing',
			mainId: String(path.main.id),
			subId: String(path.sub.id),
			secondaryId: String(path.secondary.id),
			confidence,
			reasoning,
			method: `taxonomy:${rule.id}`
		};
	}

	if (path?.sub && path.subScore >= 7) {
		const reused = pickReuseSecondary(sections, String(path.sub.id), bookMeta, {
			proposedNewName: rule.secondaryName,
			minScore: 9
		});
		if (reused) {
			return {
				kind: 'existing',
				mainId: String(path.main.id),
				subId: String(path.sub.id),
				secondaryId: reused.id,
				confidence,
				reasoning: `${reasoning} (إعادة استخدام قسم ثانوي قريب)`,
				method: `taxonomy:${rule.id}`
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(path.main.id),
			subId: String(path.sub.id),
			secondaryId: null,
			newSecondaryName: rule.secondaryName,
			confidence,
			reasoning,
			method: `taxonomy:${rule.id}`
		};
	}

	if (path?.main && path.mainScore >= 7) {
		return {
			kind: 'create_sub',
			mainId: String(path.main.id),
			subId: null,
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName: rule.secondaryName,
			confidence,
			reasoning,
			method: `taxonomy:${rule.id}`
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: rule.mainName,
		newSubName: rule.subName,
		newSecondaryName: rule.secondaryName,
		confidence,
		reasoning,
		method: `taxonomy:${rule.id}`
	};
}

function fallbackSecondaryName(bookMeta) {
	const fromHints = (bookMeta?.categoryHints || [])
		.map((x) => String(x || '').trim())
		.find((x) => wordsOf(x).length >= 1 && !/^(كتب|الرئيسية|home)$/i.test(x));
	if (fromHints) return fromHints.slice(0, 80);
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && wordsOf(stem).length >= 2) return stem.slice(0, 80);
	return 'كتب إسلامية عامة';
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
	const suggested =
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
					mainId: decision.mainId || null,
					subId: decision.subId || null,
					secondaryId: null,
					newMainName: decision.newMainName,
					newSubName: decision.newSubName,
					newSecondaryName: decision.newSecondaryName,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method,
					kind: decision.kind
				};
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: suggested.mainId, subId: suggested.subId, secondaryId: suggested.secondaryId },
					sections.index
				)
			: { valid: false, reason: 'requires_section_creation' };
	return {
		suggested,
		alternatives: [],
		validation,
		decision
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

	const taxonomyDecision = decisionFromTaxonomy(sections, bookMeta);
	if (taxonomyDecision) return taxonomyDecision;

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'الموضوعات الإسلامية العامة',
			newSubName: 'كتب إسلامية عامة',
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: 0.35,
			reasoning: 'لم تُعثَر مطابقة موضوعية دقيقة — إنشاء مسار عام مستقل لتجنّب خلط التصنيفات.',
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
			newSecondaryName: fallbackSecondaryName(bookMeta),
			confidence: Math.min(sug.confidence, 0.7),
			reasoning: `${sug.reasoning} — إنشاء قسم ثانوي لإكمال الهيكل الثلاثي.`,
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
