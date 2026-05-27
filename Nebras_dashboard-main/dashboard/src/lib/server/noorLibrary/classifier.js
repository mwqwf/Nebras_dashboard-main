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

const TOPIC_RULES = Object.freeze([
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		subName: 'طلب العلم والتعليم',
		secondaryName: 'آداب طلب العلم',
		keywords: ['طلب العلم', 'طالب العلم', 'اداب طالب العلم', 'التعليم', 'تعليم', 'التربية', 'تربية', 'المعلم', 'المتعلم', 'المناهج', 'نصيحة', 'نصائح', 'وصايا', 'ارشادات علمية'],
		sectionHints: ['التربية', 'التعليم', 'طلب العلم', 'اداب طلب العلم', 'المناهج']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل الفقه',
		keywords: ['فقه', 'الفقه', 'اصول الفقه', 'اصول', 'فتاوى', 'فتوي', 'احكام', 'الاحكام', 'عبادات', 'معاملات', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'طهارة', 'نكاح', 'بيوع'],
		sectionHints: ['الفقه', 'اصول الفقه', 'العبادات', 'المعاملات', 'الفتاوى']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'كتب العقيدة',
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الايمان', 'اسماء الله', 'الاسماء والصفات', 'الفرق', 'الملل', 'النحل'],
		sectionHints: ['العقيدة', 'التوحيد', 'الايمان', 'الفرق']
	},
	{
		id: 'tafsir',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير',
		keywords: ['تفسير', 'التفسير', 'علوم القران', 'القران', 'قراءات', 'تجويد', 'اسباب النزول', 'المصحف'],
		sectionHints: ['القران', 'التفسير', 'علوم القران', 'القراءات', 'التجويد']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث',
		keywords: ['حديث', 'الحديث', 'احاديث', 'السنة', 'سنن', 'صحيح', 'مسند', 'مصطلح الحديث', 'الجرح والتعديل', 'رواة'],
		sectionHints: ['الحديث', 'السنة', 'مصطلح الحديث', 'الرواة']
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'كتب السيرة',
		keywords: ['سيرة', 'السيرة', 'النبوية', 'شمائل', 'المغازي', 'غزوات', 'النبي', 'رسول الله'],
		sectionHints: ['السيرة', 'الشمائل', 'المغازي']
	},
	{
		id: 'history',
		mainName: 'التاريخ',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'كتب التاريخ',
		keywords: ['تاريخ', 'التاريخ', 'تراجم', 'سير اعلام', 'طبقات', 'بلدان', 'فتوح', 'خلافة', 'الدولة'],
		sectionHints: ['التاريخ', 'التراجم', 'الطبقات', 'البلدان']
	},
	{
		id: 'adab',
		mainName: 'الأدب واللغة العربية',
		subName: 'الأدب العربي',
		secondaryName: 'كتب الأدب',
		keywords: ['ادب', 'الادب', 'شعر', 'ديوان', 'بلاغة', 'نثر', 'قصص', 'رواية', 'مقامات'],
		sectionHints: ['الادب', 'الشعر', 'البلاغة', 'النثر']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية',
		subName: 'النحو والصرف',
		secondaryName: 'كتب اللغة العربية',
		keywords: ['لغة عربية', 'العربية', 'نحو', 'صرف', 'اعراب', 'معجم', 'قاموس', 'لسان العرب'],
		sectionHints: ['اللغة العربية', 'النحو', 'الصرف', 'المعاجم']
	},
	{
		id: 'akhlaq',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب الشرعية',
		secondaryName: 'كتب الأخلاق',
		keywords: ['اخلاق', 'الاخلاق', 'تزكية', 'رقائق', 'زهد', 'اداب شرعية', 'موعظة', 'القلوب'],
		sectionHints: ['التزكية', 'الاخلاق', 'الرقائق', 'الزهد']
	}
]);

const GENERIC_MAIN_HINTS = Object.freeze(['مكتبة', 'كتب اسلامية', 'علوم اسلامية', 'علوم شرعية', 'ثقافة عامة']);

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function sanitizeSectionName(raw) {
	let s = String(raw || '').trim();
	if (!s) return '';
	s = s.replace(/\s*\|\s*مكتبة نور.*$/u, '');
	s = s.replace(/\s*(?:pdf|epub|كتاب الكتروني)\s*$/iu, '');
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 70) s = s.slice(0, 70).trim();
	return s;
}

function textScore(sectionName, haystack, tokens) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	return score;
}

function includesAnyNormalized(text, phrases) {
	const n = normalizeArabic(text);
	return (phrases || []).some((p) => {
		const q = normalizeArabic(p);
		return q && n.includes(q);
	});
}

function detectTopic(bookMeta) {
	const title = normalizeArabic(bookMeta?.title || '');
	const description = normalizeArabic(bookMeta?.description || '');
	const author = normalizeArabic(bookMeta?.author || '');
	const category = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	const all = [title, description, author, category].filter(Boolean).join(' ');

	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		let score = 0;
		for (const raw of rule.keywords) {
			const k = normalizeArabic(raw);
			if (!k) continue;
			if (title.includes(k)) score += k.includes(' ') ? 7 : 4;
			if (category.includes(k)) score += k.includes(' ') ? 6 : 3;
			if (description.includes(k)) score += 1;
			if (author.includes(k)) score += 1;
			if (all === k) score += 4;
		}
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	if (!best || bestScore < 3) return null;
	return { rule: best, score: bestScore };
}

function sectionTopicScore(sectionName, topic) {
	if (!topic) return 0;
	const name = normalizeArabic(sectionName);
	if (!name) return 0;
	let score = 0;
	for (const hint of [...topic.sectionHints, topic.mainName, topic.subName, topic.secondaryName]) {
		const h = normalizeArabic(hint);
		if (h && name.includes(h)) score += h.includes(' ') ? 8 : 5;
	}
	return score;
}

function sectionConflictPenalty(sectionName, activeTopic) {
	if (!activeTopic) return 0;
	for (const rule of TOPIC_RULES) {
		if (rule.id === activeTopic.id) continue;
		if (includesAnyNormalized(sectionName, [...rule.sectionHints, rule.mainName, rule.subName])) {
			return -14;
		}
	}
	return 0;
}

function scoreSection(sectionName, haystack, tokens, topic, level) {
	let score = textScore(sectionName, haystack, tokens);
	score += sectionTopicScore(sectionName, topic);
	score += sectionConflictPenalty(sectionName, topic);
	if (level === 'main' && includesAnyNormalized(sectionName, GENERIC_MAIN_HINTS)) score += topic ? 2 : 1;
	return score;
}

function chooseBest(nodes, context, minScore) {
	let best = null;
	let bestScore = -100;
	for (const node of nodes || []) {
		const score = scoreSection(node.name, context.haystack, context.tokens, context.topic, context.level);
		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { node: best, score: bestScore };
}

function pickBestHint(bookMeta, topic) {
	for (const raw of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(raw);
		if (!clean) continue;
		if (/^(كتب|كتاب|اسلامية|اسلامي|مكتبة نور)$/u.test(normalizeArabic(clean))) continue;
		return clean;
	}
	return topic?.subName || 'كتب عامة';
}

function deriveSecondaryName(bookMeta, topic, mainName = '', subName = '') {
	const forbidden = new Set(
		[mainName, subName, topic?.mainName, topic?.subName]
			.map(normalizeArabic)
			.filter(Boolean)
	);
	for (const raw of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(raw);
		const n = normalizeArabic(clean);
		if (clean && n.length >= 4 && !forbidden.has(n)) return clean;
	}
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	const stemN = normalizeArabic(stem);
	if (stem && stemN.length >= 4 && !forbidden.has(stemN)) return stem;
	return topic?.secondaryName || 'كتب عامة';
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
	const topic = detectTopic(bookMeta)?.rule || null;

	const mainPick = chooseBest(tree, { haystack, tokens, topic, level: 'main' }, topic ? 2 : 3);
	const bestMain = mainPick?.node || null;
	if (!bestMain) return null;

	const subPick = chooseBest(bestMain.children, { haystack, tokens, topic, level: 'sub' }, topic ? 3 : 3);
	const bestSub = subPick?.node || null;
	if (!bestSub) return null;

	const secName = deriveSecondaryName(bookMeta, topic, bestMain.name, bestSub.name);
	const bestSec =
		pickReuseSecondary({ tree, index }, String(bestSub.id), bookMeta, {
			proposedNewName: secName,
			minScore: topic ? 5 : 6
		}) || null;

	return {
		mainId: bestMain.id,
		subId: bestSub.id,
		secondaryId: bestSec ? bestSec.id : null,
		confidence: Math.min(0.45 + (mainPick?.score || 0) * 0.03 + (subPick?.score || 0) * 0.03, 0.9),
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
	const sug = await classifyAutonomous(sections, bookMeta);
	const validation =
		sug?.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
					sections.index
				)
			: { valid: false, reason: 'requires_section_creation' };
	return {
		suggested: sug || {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: 'مكتبة نور',
			newSubName: 'كتب عامة',
			newSecondaryName: sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || '')) || 'كتب عامة',
			confidence: 0.1,
			reasoning: 'لم تُعثَر مطابقة. سيُنشئ المحرّك مساراً ثلاثياً جديداً.',
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
	const tree = sections.tree || [];
	const topic = detectTopic(bookMeta)?.rule || null;
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
	const subHint = pickBestHint(bookMeta, topic);

	const mainPick = chooseBest(tree, { haystack, tokens, topic, level: 'main' }, topic ? 2 : 3);
	if (!mainPick) {
		const mainName = topic?.mainName || 'مكتبة نور';
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: mainName,
			newSubName: subHint,
			newSecondaryName: deriveSecondaryName(bookMeta, topic, mainName, subHint),
			confidence: topic ? 0.55 : 0.3,
			reasoning: topic
				? `لم يوجد قسم رئيسي آمن لمجال "${topic.mainName}" — إنشاء مسار ثلاثي جديد.`
				: 'لم تعطِ خوارزميّة المطابقة نتيجة آمنة — إنشاء مسار ثلاثي عام لمكتبة نور.',
			method: 'heuristic'
		};
	}

	const bestMain = mainPick.node;
	const subPick = chooseBest(bestMain.children || [], { haystack, tokens, topic, level: 'sub' }, topic ? 3 : 3);
	if (!subPick) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.id),
			subId: null,
			secondaryId: null,
			newSubName: subHint,
			newSecondaryName: deriveSecondaryName(bookMeta, topic, bestMain.name, subHint),
			confidence: Math.min(0.45 + mainPick.score * 0.03, 0.75),
			reasoning: `وُجد قسم رئيسي مناسب "${bestMain.name}" لكن لا يوجد قسم فرعي آمن — إنشاء قسم فرعي وثانوي.`,
			method: 'heuristic'
		};
	}

	const bestSub = subPick.node;
	const proposedSecondary = deriveSecondaryName(bookMeta, topic, bestMain.name, bestSub.name);
	const reusableSecondary = pickReuseSecondary(sections, String(bestSub.id), bookMeta, {
		proposedNewName: proposedSecondary,
		minScore: topic ? 5 : 6
	});
	if (reusableSecondary) {
		return {
			kind: 'existing',
			mainId: String(bestMain.id),
			subId: String(bestSub.id),
			secondaryId: reusableSecondary.id,
			confidence: Math.min(0.55 + mainPick.score * 0.03 + subPick.score * 0.03, 0.92),
			reasoning: `مطابقة آمنة: ${bestMain.name} ← ${bestSub.name} ← ${reusableSecondary.name}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(bestMain.id),
		subId: String(bestSub.id),
		secondaryId: null,
		newSecondaryName: proposedSecondary,
		confidence: Math.min(0.5 + mainPick.score * 0.03 + subPick.score * 0.03, 0.86),
		reasoning: `وُجد مسار رئيسي/فرعي مناسب "${bestMain.name} ← ${bestSub.name}" لكن لا يوجد قسم ثانوي مطابق — إنشاء قسم ثانوي.`,
		method: 'heuristic'
	};
}
