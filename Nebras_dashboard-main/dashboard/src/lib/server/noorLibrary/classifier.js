/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 * 
 * بعد إزالة الاعتماد على خدمات خارجية، يعتمد التصنيف حصراً على
 * heuristic عربي محافظ: يحدّد مجال الكتاب أولاً، ثم يبحث داخل الشجرة
 * المناسبة فقط. إذا لم يجد مساراً موثوقاً، يعيد قرار إنشاء قسم في
 * المستوى الصحيح بدل خلط الآداب بالفقه أو التاريخ بالعقيدة.
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
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= minLen));
}

function tokenOverlapRatio(a, b) {
	if (!a.size || !b.size) return 0;
	let inter = 0;
	for (const t of a) if (b.has(t)) inter += 1;
	return inter / new Set([...a, ...b]).size;
}

const DOMAIN_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير وعلوم القرآن',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'علوم القرآن', 'قراءات', 'تجويد', 'مصاحف', 'سورة', 'آية']
	},
	{
		id: 'hadith',
		mainName: 'الحديث وعلومه',
		subName: 'الحديث الشريف',
		secondaryName: 'كتب الحديث وعلومه',
		keywords: ['حديث', 'أحاديث', 'سنة', 'سنن', 'صحيح', 'مسند', 'مصطلح الحديث', 'جرح وتعديل', 'رواة']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'كتب الفقه وأصوله',
		keywords: ['فقه', 'أصول الفقه', 'فتاوى', 'فتوى', 'أحكام', 'عبادات', 'معاملات', 'طهارة', 'صلاة', 'زكاة', 'صيام', 'حج']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'كتب العقيدة والتوحيد',
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'أسماء الله', 'صفات', 'فرق', 'ملل', 'نحل', 'رد على الشبهات']
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'كتب السيرة النبوية',
		keywords: ['سيرة', 'شمائل', 'مغازي', 'النبي', 'الرسول', 'محمد صلى الله عليه وسلم', 'غزوة', 'الهجرة']
	},
	{
		id: 'history',
		mainName: 'التاريخ الإسلامي',
		subName: 'التاريخ والتراجم',
		secondaryName: 'كتب التاريخ الإسلامي',
		keywords: ['تاريخ', 'تراجم', 'طبقات', 'وفيات', 'خلفاء', 'دول', 'فتوح', 'أعلام', 'سير العلماء']
	},
	{
		id: 'learning_adab',
		mainName: 'التربية والسلوك',
		subName: 'طلب العلم وآدابه',
		secondaryName: 'آداب طالب العلم',
		keywords: [
			'طلب العلم',
			'آداب طالب العلم',
			'آداب الطلب',
			'آداب العالم والمتعلم',
			'نصائح علمية',
			'توجيهات علمية',
			'تعليم',
			'تعلم',
			'العلماء',
			'العلم الشرعي'
		]
	},
	{
		id: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'كتب التزكية والآداب',
		keywords: ['تزكية', 'أخلاق', 'آداب', 'رقائق', 'زهد', 'سلوك', 'موعظة', 'قلوب', 'نفس']
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		secondaryName: 'كتب اللغة والأدب العربي',
		keywords: ['لغة عربية', 'نحو', 'صرف', 'بلاغة', 'إعراب', 'أدب عربي', 'شعر', 'عروض', 'معاجم']
	},
	{
		id: 'dawah',
		mainName: 'الدعوة والتعليم',
		subName: 'الدعوة والإرشاد',
		secondaryName: 'كتب الدعوة والإرشاد',
		keywords: ['دعوة', 'إرشاد', 'خطب', 'محاضرات', 'دروس', 'تعليم المسلمين', 'منهج الدعوة']
	}
]);

const NORMALIZED_DOMAIN_RULES = DOMAIN_RULES.map((rule) => ({
	...rule,
	keywordNorms: rule.keywords.map(normalizeArabic).filter(Boolean),
	mainTokens: tokensOf(rule.mainName),
	subTokens: tokensOf(rule.subName),
	secondaryTokens: tokensOf(rule.secondaryName)
}));

function weightedTextParts(bookMeta) {
	return [
		{ text: bookMeta?.title, weight: 4 },
		{ text: bookMeta?.author, weight: 1 },
		{ text: (bookMeta?.categoryHints || []).join(' '), weight: 3 },
		{ text: bookMeta?.description, weight: 1 }
	].filter((p) => p.text);
}

function inferDomain(bookMeta) {
	const scores = NORMALIZED_DOMAIN_RULES.map((rule) => {
		let score = 0;
		for (const part of weightedTextParts(bookMeta)) {
			const n = normalizeArabic(part.text);
			if (!n) continue;
			for (const kw of rule.keywordNorms) {
				if (!kw) continue;
				if (n.includes(kw)) score += part.weight * (kw.includes(' ') ? 3 : 1);
			}
		}
		return { rule, score };
	}).sort((a, b) => b.score - a.score);

	const best = scores[0];
	if (!best || best.score < 4) return null;
	const second = scores[1]?.score || 0;
	// عند التعادل نترك المطابقة النصيّة العامة تقرّر بدلاً من فرض مجال خاطئ.
	if (second > 0 && best.score - second < 2) return null;
	return best.rule;
}

function allHaystack(bookMeta) {
	return normalizeArabic(
		[
			bookMeta?.title,
			bookMeta?.author,
			bookMeta?.description,
			...(bookMeta?.categoryHints || [])
		].filter(Boolean).join(' ')
	);
}

function scoreSectionName(name, haystack, hayTokens, domain, level) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	const sectionTokens = tokensOf(n);
	let score = tokenOverlapRatio(sectionTokens, hayTokens) * 10;
	if (n.length >= 4 && haystack.includes(n)) score += 7;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && hayTokens.has(w)) score += 1;
	}

	if (domain) {
		const targetTokens =
			level === 'main'
				? domain.mainTokens
				: level === 'sub'
					? domain.subTokens
					: domain.secondaryTokens;
		score += tokenOverlapRatio(sectionTokens, targetTokens) * 14;
		for (const kw of domain.keywordNorms) {
			if (kw.length >= 4 && (n.includes(kw) || kw.includes(n))) score += 2;
		}
	}

	return score;
}

function pickBest(nodes, haystack, hayTokens, domain, level, minScore) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		const score = scoreSectionName(node?.name, haystack, hayTokens, domain, level);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

function pickBestMain(tree, haystack, hayTokens, domain, minScore) {
	let best = null;
	let bestScore = 0;
	for (const main of tree || []) {
		let score = scoreSectionName(main?.name, haystack, hayTokens, domain, 'main');
		for (const sub of main?.children || []) {
			score = Math.max(
				score,
				scoreSectionName(sub?.name, haystack, hayTokens, domain, 'sub') * 0.8
			);
			for (const sec of sub?.children || []) {
				score = Math.max(
					score,
					scoreSectionName(sec?.name, haystack, hayTokens, domain, 'secondary') * 0.6
				);
			}
		}
		if (score > bestScore) {
			bestScore = score;
			best = main;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

/**
 * Heuristic fallback محافظ — يختار مساراً موجوداً فقط إذا تجاوزت درجات
 * كل مستوى عتبة مناسبة. لا يختار أول قسم عند الفشل.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const haystack = allHaystack(bookMeta);
	const tokens = tokensOf(haystack);
	const domain = inferDomain(bookMeta);
	const mainPick = pickBestMain(tree, haystack, tokens, domain, domain ? 5 : 3);
	if (!mainPick) return null;

	const subPick = pickBest(mainPick.node.children || [], haystack, tokens, domain, 'sub', domain ? 5 : 3);
	if (!subPick) return null;

	const secPick = pickBest(subPick.node.children || [], haystack, tokens, domain, 'secondary', domain ? 6 : 4);
	if (!secPick) return null;

	return {
		mainId: mainPick.node.id,
		subId: subPick.node.id,
		secondaryId: secPick.node.id,
		confidence: Math.min(0.45 + mainPick.score * 0.02 + subPick.score * 0.02 + secPick.score * 0.01, 0.9),
		reasoning: `مطابقة محليّة محافظة${domain ? ` ضمن مجال "${domain.mainName}"` : ''}`,
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

function cleanSectionName(name, fallback) {
	const cleaned = String(name || '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
	return cleaned || fallback;
}

function titleBasedSecondaryName(bookMeta) {
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && stem.length >= 4 && stem.length <= 55) return stem;
	return '';
}

function fallbackNames(bookMeta, domain) {
	if (domain) {
		return {
			main: domain.mainName,
			sub: domain.subName,
			secondary: domain.secondaryName
		};
	}
	const hinted = cleanSectionName((bookMeta?.categoryHints || []).find(Boolean), 'كتب متنوعة');
	return {
		main: 'المكتبة الإسلامية',
		sub: hinted,
		secondary: cleanSectionName(titleBasedSecondaryName(bookMeta), hinted)
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

	const sug = classifyHeuristic(sections, bookMeta);
	const validation = sug
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'heuristic_failed' };
	const fallback = sug || (await classifyAutonomous(sections, bookMeta));
	return {
		suggested: fallback,
		alternatives: [],
		validation: sug ? validation : { valid: false, reason: fallback.kind || validation.reason }
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
	const haystack = allHaystack(bookMeta);
	const tokens = tokensOf(haystack);
	const domain = inferDomain(bookMeta);
	const names = fallbackNames(bookMeta, domain);
	const mainPick = pickBestMain(sections.tree, haystack, tokens, domain, domain ? 5 : 3);

	if (!mainPick) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: names.main,
			newSubName: names.sub,
			newSecondaryName: names.secondary,
			confidence: domain ? 0.42 : 0.25,
			reasoning: domain
				? `لم يُعثَر على قسم رئيسي مناسب لمجال "${domain.mainName}" — إنشاء مسار جديد.`
				: 'لم يُعثَر على قسم رئيسي مناسب — إنشاء مسار عام محافظ.',
			method: 'heuristic'
		};
	}

	const subPick = pickBest(mainPick.node.children || [], haystack, tokens, domain, 'sub', domain ? 5 : 3);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(mainPick.node.id),
			subId: null,
			secondaryId: null,
			newSubName: names.sub,
			newSecondaryName: names.secondary,
			confidence: domain ? 0.5 : 0.35,
			reasoning: `وُجد قسم رئيسي مناسب "${mainPick.node.name}" ولا يوجد قسم فرعي موثوق — إنشاء فرعي وثانوي.`,
			method: 'heuristic'
		};
	}

	const proposedSecondaryName = names.secondary || titleBasedSecondaryName(bookMeta);
	let secPick = pickBest(
		subPick.node.children || [],
		haystack,
		tokens,
		domain,
		'secondary',
		domain ? 6 : 4
	);
	if (!secPick) {
		const reusable = pickReuseSecondary(sections, String(subPick.node.id), bookMeta, {
			proposedNewName: proposedSecondaryName,
			minScore: 9
		});
		if (reusable) {
			secPick = { node: { id: reusable.id, name: reusable.name }, score: reusable.score };
		}
	}

	if (!secPick) {
		return {
			kind: 'create_secondary',
			mainId: String(mainPick.node.id),
			subId: String(subPick.node.id),
			secondaryId: null,
			newSecondaryName: cleanSectionName(proposedSecondaryName, 'كتب متنوعة'),
			confidence: domain ? 0.58 : 0.4,
			reasoning: `وُجد المسار "${mainPick.node.name} ← ${subPick.node.name}" دون قسم ثانوي مناسب — إنشاء ثانوي.`,
			method: 'heuristic'
		};
	}

	const decision = {
		kind: 'existing',
		mainId: String(mainPick.node.id),
		subId: String(subPick.node.id),
		secondaryId: String(secPick.node.id),
		confidence: Math.min(0.45 + mainPick.score * 0.02 + subPick.score * 0.02 + secPick.score * 0.01, 0.9),
		reasoning: `مطابقة محلّيّة: ${mainPick.node.name} ← ${subPick.node.name} ← ${secPick.node.name}.`,
		method: 'heuristic'
	};
	const validation = validateHierarchyPath(
		{ mainId: decision.mainId, subId: decision.subId, secondaryId: decision.secondaryId },
		sections.index
	);
	if (!validation.valid) {
		return {
			kind: 'create_secondary',
			mainId: String(mainPick.node.id),
			subId: String(subPick.node.id),
			secondaryId: null,
			newSecondaryName: cleanSectionName(proposedSecondaryName, 'كتب متنوعة'),
			confidence: 0.35,
			reasoning: `المسار الموجود فشل التحقق (${validation.reason}) — إنشاء ثانوي آمن تحت الفرعي الصحيح.`,
			method: 'heuristic'
		};
	}
	return decision;
}
