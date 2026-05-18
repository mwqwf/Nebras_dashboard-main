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

const STOP_WORDS = new Set([
	'كتاب',
	'كتب',
	'شرح',
	'مختصر',
	'الجزء',
	'جزء',
	'مجلد',
	'جلد',
	'باب',
	'في',
	'من',
	'الى',
	'علي',
	'عن',
	'هذا',
	'هذه',
	'ذلك',
	'تلك',
	'مع',
	'دار',
	'ابن',
	'ابي',
	'ابو'
]);

const DOMAIN_RULES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير وعلوم القرآن',
		mainAliases: ['القرآن', 'علوم القرآن', 'التفسير'],
		subAliases: ['التفسير', 'علوم القرآن', 'القراءات'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'المفسر', 'آية', 'سورة', 'قراءات', 'تجويد', 'مصحف']
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث وعلومه',
		mainAliases: ['الحديث', 'السنة', 'علوم الحديث'],
		subAliases: ['الحديث', 'مصطلح الحديث', 'شروح الحديث', 'السنة'],
		keywords: ['حديث', 'الأحاديث', 'سنة', 'سنن', 'صحيح', 'مسند', 'مصنف', 'مصطلح', 'رواة', 'إسناد']
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه وأصوله',
		secondaryName: 'كتب الفقه وأصوله',
		mainAliases: ['الفقه', 'أصول الفقه', 'الفتاوى'],
		subAliases: ['الفقه', 'أصول الفقه', 'العبادات', 'المعاملات', 'الفتاوى'],
		keywords: [
			'فقه',
			'أصول الفقه',
			'فتوى',
			'فتاوى',
			'عبادات',
			'معاملات',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'طهارة',
			'نكاح',
			'طلاق',
			'مواريث'
		]
	},
	{
		key: 'aqida',
		mainName: 'العقيدة والتوحيد',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة والتوحيد',
		mainAliases: ['العقيدة', 'التوحيد', 'الإيمان'],
		subAliases: ['العقيدة', 'التوحيد', 'الإيمان', 'الفرق'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'أسماء', 'صفات', 'قدر', 'شرك', 'إرجاء', 'جهمية', 'معتزلة']
	},
	{
		key: 'seerah_history',
		mainName: 'السيرة والتاريخ والتراجم',
		subName: 'السيرة والتاريخ والتراجم',
		secondaryName: 'كتب السيرة والتاريخ والتراجم',
		mainAliases: ['السيرة', 'التاريخ', 'التراجم', 'الصحابة'],
		subAliases: ['السيرة', 'التاريخ', 'التراجم', 'الصحابة', 'الخلفاء'],
		keywords: [
			'سيرة',
			'مغازي',
			'تاريخ',
			'تراجم',
			'طبقات',
			'صحابة',
			'خلفاء',
			'أعلام',
			'وفيات',
			'بلدان'
		]
	},
	{
		key: 'adab_akhlaq',
		mainName: 'التزكية والآداب والأخلاق',
		subName: 'الآداب والأخلاق',
		secondaryName: 'كتب الآداب والأخلاق',
		mainAliases: ['الآداب', 'الأخلاق', 'التزكية', 'الرقائق'],
		subAliases: ['الآداب', 'الأخلاق', 'التزكية', 'الرقائق', 'الزهد'],
		keywords: ['أدب', 'آداب', 'أخلاق', 'تزكية', 'رقائق', 'زهد', 'ورع', 'مواعظ', 'نصائح', 'سلوك']
	},
	{
		key: 'arabic',
		mainName: 'اللغة العربية وعلومها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'كتب اللغة العربية وعلومها',
		mainAliases: ['اللغة العربية', 'العربية', 'النحو', 'الصرف', 'البلاغة'],
		subAliases: ['النحو', 'الصرف', 'البلاغة', 'الأدب العربي', 'المعاجم'],
		keywords: ['نحو', 'صرف', 'بلاغة', 'لغة', 'عربية', 'إعراب', 'معجم', 'قواعد', 'شعر']
	},
	{
		key: 'education_dawa',
		mainName: 'الدعوة والتربية والتعليم',
		subName: 'طلب العلم والتربية',
		secondaryName: 'كتب طلب العلم والتربية',
		mainAliases: ['الدعوة', 'التربية', 'التعليم', 'طلب العلم'],
		subAliases: ['طلب العلم', 'التربية', 'التعليم', 'الدعوة', 'العلماء'],
		keywords: ['دعوة', 'تربية', 'تعليم', 'تعلم', 'طلب العلم', 'طالب العلم', 'نصيحة', 'نصائح', 'العلماء']
	},
	{
		key: 'general',
		mainName: 'المعارف الإسلامية العامة',
		subName: 'متفرقات علمية',
		secondaryName: 'كتب إسلامية عامة',
		mainAliases: ['المعارف الإسلامية', 'كتب إسلامية', 'متفرقات'],
		subAliases: ['متفرقات', 'عام', 'عامة'],
		keywords: []
	}
]);

function tokenSet(text) {
	return new Set(
		normalizeArabic(text)
			.split(' ')
			.map((t) => t.trim())
			.filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
	);
}

function scoreNameAgainstText(name, text) {
	const n = normalizeArabic(name);
	const h = normalizeArabic(text);
	if (!n || !h) return 0;
	let score = 0;
	if (h.includes(n) && n.length >= 4) score += 9;
	const nameTokens = tokenSet(n);
	const textTokens = tokenSet(h);
	for (const t of nameTokens) {
		if (textTokens.has(t)) score += 2;
	}
	return score;
}

function keywordScore(haystack, keywords) {
	let score = 0;
	for (const keyword of keywords || []) {
		const k = normalizeArabic(keyword);
		if (!k) continue;
		if (haystack.includes(k)) score += k.includes(' ') ? 4 : 2;
	}
	return score;
}

function bookHaystack(bookMeta) {
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

function pickDomain(bookMeta) {
	const hay = bookHaystack(bookMeta);
	const scored = DOMAIN_RULES.filter((d) => d.key !== 'general')
		.map((domain) => ({ domain, score: keywordScore(hay, domain.keywords) }))
		.sort((a, b) => b.score - a.score);

	if (!scored.length || scored[0].score < 2) {
		return DOMAIN_RULES.find((d) => d.key === 'general');
	}

	const byKey = Object.fromEntries(scored.map((x) => [x.domain.key, x.score]));
	const top = scored[0];

	// قواعد فصل مقصودة: لا نخلط الآداب بالفقه، ولا التاريخ بالعقيدة.
	if (top.domain.key === 'fiqh' && (byKey.adab_akhlaq || 0) >= top.score - 1) {
		return DOMAIN_RULES.find((d) => d.key === 'adab_akhlaq');
	}
	if (top.domain.key === 'aqida' && (byKey.seerah_history || 0) >= top.score - 1) {
		return DOMAIN_RULES.find((d) => d.key === 'seerah_history');
	}
	return top.domain;
}

function scoreNodeForDomain(node, domain, aliases, bookMeta) {
	const name = normalizeArabic(node?.name || '');
	if (!name) return 0;
	let score = scoreNameAgainstText(name, bookHaystack(bookMeta));
	for (const alias of aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (name === a) score += 16;
		else if (name.includes(a) || a.includes(name)) score += 10;
	}
	score += keywordScore(name, domain?.keywords || []);
	return score;
}

function pickBestNode(nodes, scorer, minScore) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scorer(node);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function pickMainForDomain(sections, domain, bookMeta) {
	return pickBestNode(
		sections.tree || [],
		(node) => scoreNodeForDomain(node, domain, domain.mainAliases, bookMeta),
		domain.key === 'general' ? 6 : 8
	);
}

function pickSubForDomain(mainNode, domain, bookMeta) {
	return pickBestNode(
		mainNode?.children || [],
		(node) => scoreNodeForDomain(node, domain, domain.subAliases, bookMeta),
		domain.key === 'general' ? 5 : 7
	);
}

function cleanSectionName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function deriveSecondaryName(bookMeta, domain) {
	const stem = seriesDisplayNameFromTitle(bookMeta?.title || '');
	const stemTokens = tokenSet(stem);
	if (stem.length >= 4 && stem.length <= 80 && stemTokens.size >= 1) {
		const generic = ['كتاب', 'كتب', 'الاسلام', 'اسلاميه', 'اسلامي', 'عامه'];
		if (!generic.includes(normalizeArabic(stem))) return cleanSectionName(stem, domain.secondaryName);
	}
	return domain.secondaryName;
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
	if (!bestMain || bestMainScore <= 0) return null;

	let bestSub = null, bestSubScore = -1;
	for (const sub of bestMain.children) {
		const s = scoreOf(sub.name);
		if (s > bestSubScore) { bestSubScore = s; bestSub = sub; }
	}
	if (!bestSub || bestSubScore <= 0) return null;

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

/** نسخة للعرض تحفظ رسم العنوان الأصلي وتزيل فقط علامات الأجزاء الشائعة. */
function seriesDisplayNameFromTitle(title) {
	let t = String(title || '')
		.replace(/\s+/g, ' ')
		.trim();
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
		const domain = pickDomain(bookMeta);
		return {
			suggested: {
				mainId: '',
				subId: '',
				secondaryId: '',
				confidence: 0.4,
				reasoning: `الشجرة فارغة — سيُنشئ المحرّك "${domain.mainName} > ${domain.subName}".`,
				method: 'taxonomy',
				create: {
					kind: 'create_main',
					mainName: domain.mainName,
					subName: domain.subName,
					secondaryName: deriveSecondaryName(bookMeta, domain)
				}
			},
			alternatives: [],
			validation: { valid: false, reason: 'empty_sections_tree' }
		};
	}

	const auto = await classifyAutonomous(sections, bookMeta);
	if (auto.kind !== 'existing') {
		return {
			suggested: {
				mainId: auto.mainId || '',
				subId: auto.subId || '',
				secondaryId: '',
				confidence: auto.confidence,
				reasoning: auto.reasoning,
				method: auto.method,
				create: {
					kind: auto.kind,
					mainName: auto.newMainName || '',
					subName: auto.newSubName || '',
					secondaryName: auto.newSecondaryName || ''
				}
			},
			alternatives: [],
			validation: { valid: false, reason: 'requires_section_creation' }
		};
	}
	const sug = {
		mainId: auto.mainId,
		subId: auto.subId,
		secondaryId: auto.secondaryId || null,
		confidence: auto.confidence,
		reasoning: auto.reasoning,
		method: auto.method
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
	const domain = pickDomain(bookMeta);
	const secondaryName = deriveSecondaryName(bookMeta, domain);

	if (treeIsEmpty) {
		return {
			kind: 'create_main',
			newMainName: domain.mainName,
			newSubName: domain.subName,
			newSecondaryName: secondaryName,
			confidence: 0.55,
			reasoning: `الشجرة فارغة — إنشاء مسار ${domain.mainName} > ${domain.subName} > ${secondaryName}.`,
			method: 'taxonomy'
		};
	}

	const matchedMain = pickMainForDomain(sections, domain, bookMeta);
	if (!matchedMain) {
		return {
			kind: 'create_main',
			newMainName: domain.mainName,
			newSubName: domain.subName,
			newSecondaryName: secondaryName,
			confidence: 0.62,
			reasoning: `لا يوجد قسم رئيسي مناسب لمجال "${domain.mainName}" — إنشاء مسار جديد.`,
			method: 'taxonomy'
		};
	}

	const matchedSub = pickSubForDomain(matchedMain.node, domain, bookMeta);
	if (!matchedSub) {
		return {
			kind: 'create_sub',
			mainId: String(matchedMain.node.id),
			newSubName: domain.subName,
			newSecondaryName: secondaryName,
			confidence: 0.68,
			reasoning: `القسم الرئيسي "${matchedMain.node.name}" مناسب، لكن لا يوجد قسم فرعي مناسب — إنشاء "${domain.subName}".`,
			method: 'taxonomy'
		};
	}

	const reusedSecondary = pickReuseSecondary(sections, String(matchedSub.node.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 8
	});
	if (!reusedSecondary) {
		return {
			kind: 'create_secondary',
			mainId: String(matchedMain.node.id),
			subId: String(matchedSub.node.id),
			newSecondaryName: secondaryName,
			confidence: 0.74,
			reasoning: `المسار "${matchedMain.node.name} > ${matchedSub.node.name}" مناسب، ولا يوجد قسم ثانوي مطابق — إنشاء "${secondaryName}".`,
			method: 'taxonomy'
		};
	}

	return {
		kind: 'existing',
		mainId: String(matchedMain.node.id),
		subId: String(matchedSub.node.id),
		secondaryId: reusedSecondary.id,
		confidence: Math.min(0.82 + reusedSecondary.score * 0.01, 0.95),
		reasoning: `مطابقة علمية محلية: ${matchedMain.node.name} > ${matchedSub.node.name} > ${reusedSecondary.name}.`,
		method: 'taxonomy'
	};
}
