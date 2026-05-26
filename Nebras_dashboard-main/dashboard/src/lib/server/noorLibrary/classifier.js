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

const STOP_WORDS = new Set(
	[
		'كتاب',
		'كتب',
		'حول',
		'الى',
		'علي',
		'عن',
		'من',
		'في',
		'مع',
		'هذا',
		'هذه',
		'ذلك',
		'التي',
		'الذي',
		'للساده',
		'الساده'
	].map(normalizeArabic)
);

const CURATED_PATH_RULES = Object.freeze([
	{
		id: 'scientific-advice-for-sada',
		groups: [
			['النصائح', 'نصائح', 'النصيحه'],
			['التعليمات العلمية', 'تعليمات علمية', 'العلمية'],
			['السادة', 'للسادة', 'الساده']
		],
		path: {
			main: 'الدعوة والتربية',
			sub: 'التربية والتعليم',
			secondary: 'النصائح والتوجيهات العلمية'
		},
		confidence: 0.96,
		reasoning:
			'قاعدة مخصّصة: كتاب النصائح حول التعليمات العلمية للسادة يندرج تحت التربية والتعليم، لا الفقه أو الأدب.'
	}
]);

const SUBJECT_PATH_RULES = Object.freeze([
	{
		keywords: ['فقه', 'الفقه', 'احكام', 'حلال', 'حرام', 'عبادات', 'معاملات'],
		path: { main: 'الفقه الإسلامي', sub: 'الفقه العام', secondary: 'مسائل فقهية' }
	},
	{
		keywords: ['عقيده', 'العقيده', 'توحيد', 'الايمان', 'اسماء الله', 'صفات'],
		path: { main: 'العقيدة الإسلامية', sub: 'العقيدة والتوحيد', secondary: 'موضوعات العقيدة' }
	},
	{
		keywords: ['حديث', 'الحديث', 'سنه', 'السنه', 'رواه', 'اسناد'],
		path: { main: 'الحديث الشريف', sub: 'علوم الحديث', secondary: 'كتب الحديث' }
	},
	{
		keywords: ['قران', 'القران', 'تفسير', 'التفسير', 'ايات', 'سوره'],
		path: { main: 'القرآن الكريم', sub: 'التفسير وعلوم القرآن', secondary: 'كتب التفسير' }
	},
	{
		keywords: ['تاريخ', 'التاريخ', 'سيره', 'السيره', 'تراجم', 'حضاره', 'غزوات'],
		path: { main: 'التاريخ والسير', sub: 'التاريخ الإسلامي', secondary: 'كتب التاريخ والسير' }
	},
	{
		keywords: ['ادب', 'الادب', 'شعر', 'قصه', 'روايه', 'لغه', 'نحو', 'بلاغه'],
		path: { main: 'الأدب واللغة العربية', sub: 'الأدب العربي', secondary: 'كتب الأدب واللغة' }
	},
	{
		keywords: ['تربيه', 'تعليم', 'التعليم', 'ارشاد', 'توجيه', 'نصائح', 'طالب العلم'],
		path: {
			main: 'الدعوة والتربية',
			sub: 'التربية والتعليم',
			secondary: 'النصائح والتوجيهات العلمية'
		}
	}
]);

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen && !STOP_WORDS.has(t))
	);
}

function metadataHaystack(bookMeta) {
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

function cleanSectionName(raw, fallback = 'كتب عامة') {
	let s = String(raw || '').trim();
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s || fallback;
}

function pathRuleMatches(rule, haystack) {
	for (const group of rule.groups || []) {
		const ok = group.some((term) => {
			const n = normalizeArabic(term);
			return n && haystack.includes(n);
		});
		if (!ok) return false;
	}
	return true;
}

function pickBestCategoryHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = cleanSectionName(hint, '');
		if (clean && clean.length >= 2) return clean;
	}
	return '';
}

function defaultSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && tokensOf(stem, 3).size >= 1) return stem;
	const hint = pickBestCategoryHint(bookMeta);
	return cleanSectionName(hint || fallback, fallback);
}

function inferTaxonomyPath(bookMeta) {
	const haystack = metadataHaystack(bookMeta);
	for (const rule of CURATED_PATH_RULES) {
		if (pathRuleMatches(rule, haystack)) {
			return { ...rule.path, confidence: rule.confidence, reasoning: rule.reasoning };
		}
	}

	for (const rule of SUBJECT_PATH_RULES) {
		if (rule.keywords.some((keyword) => haystack.includes(normalizeArabic(keyword)))) {
			return {
				...rule.path,
				confidence: 0.78,
				reasoning: `قاعدة موضوعية محافظة: ${rule.path.main} ← ${rule.path.sub}.`
			};
		}
	}

	const hint = pickBestCategoryHint(bookMeta);
	const sub = cleanSectionName(hint, 'كتب عامة');
	return {
		main: 'مكتبة نور',
		sub,
		secondary: defaultSecondaryName(bookMeta, sub),
		confidence: 0.42,
		reasoning: 'لم تظهر إشارات موضوعية كافية — إنشاء مسار مستقل تحت مكتبة نور لتجنّب خلط التخصصات.'
	};
}

function scoreNameAgainstTarget(name, target) {
	const n = normalizeArabic(name);
	const t = normalizeArabic(target);
	if (!n || !t) return 0;
	if (n === t) return 100;
	if (n.includes(t) || t.includes(n)) return 70;
	const nt = tokensOf(n);
	const tt = tokensOf(t);
	if (!nt.size || !tt.size) return 0;
	let inter = 0;
	for (const token of nt) if (tt.has(token)) inter += 1;
	return (inter / Math.max(nt.size, tt.size)) * 60;
}

function scoreNameAgainstBook(name, bookMeta) {
	const haystack = metadataHaystack(bookMeta);
	const hayTokens = tokensOf(haystack);
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && hayTokens.has(w)) score += 3;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 8;
	return score;
}

function findBestMain(tree, targetName, bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const m of tree || []) {
		const score = Math.max(
			scoreNameAgainstTarget(m.name, targetName),
			scoreNameAgainstBook(m.name, bookMeta)
		);
		if (score > bestScore) {
			best = m;
			bestScore = score;
		}
	}
	return best && bestScore >= 18 ? { node: best, score: bestScore } : null;
}

function findBestSubInMain(mainNode, targetName, bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const sub of mainNode?.children || []) {
		const score = Math.max(
			scoreNameAgainstTarget(sub.name, targetName),
			scoreNameAgainstBook(sub.name, bookMeta)
		);
		if (score > bestScore) {
			best = sub;
			bestScore = score;
		}
	}
	return best && bestScore >= 18 ? { node: best, score: bestScore } : null;
}

function findBestSubAnywhere(tree, targetName, bookMeta) {
	let best = null;
	let bestMain = null;
	let bestScore = 0;
	for (const main of tree || []) {
		for (const sub of main.children || []) {
			const score = Math.max(
				scoreNameAgainstTarget(sub.name, targetName),
				scoreNameAgainstBook(sub.name, bookMeta)
			);
			if (score > bestScore) {
				best = sub;
				bestMain = main;
				bestScore = score;
			}
		}
	}
	return best && bestScore >= 35 ? { main: bestMain, sub: best, score: bestScore } : null;
}

function findBestSecondaryInSub(subNode, targetName, bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const sec of subNode?.children || []) {
		const score = Math.max(
			scoreNameAgainstTarget(sec.name, targetName),
			scoreNameAgainstBook(sec.name, bookMeta)
		);
		if (score > bestScore) {
			best = sec;
			bestScore = score;
		}
	}
	return best && bestScore >= 18 ? { node: best, score: bestScore } : null;
}

function findBestSecondaryAnywhere(tree, targetName, bookMeta) {
	let best = null;
	let bestSub = null;
	let bestMain = null;
	let bestScore = 0;
	for (const main of tree || []) {
		for (const sub of main.children || []) {
			for (const sec of sub.children || []) {
				const score = Math.max(
					scoreNameAgainstTarget(sec.name, targetName),
					scoreNameAgainstBook(sec.name, bookMeta)
				);
				if (score > bestScore) {
					best = sec;
					bestSub = sub;
					bestMain = main;
					bestScore = score;
				}
			}
		}
	}
	return best && bestScore >= 35
		? { main: bestMain, sub: bestSub, secondary: best, score: bestScore }
		: null;
}

function resolvePathToDecision(sections, bookMeta, path) {
	const tree = sections?.tree || [];
	const secondaryName = cleanSectionName(path.secondary || defaultSecondaryName(bookMeta, path.sub));
	const subName = cleanSectionName(path.sub, 'كتب عامة');
	const mainName = cleanSectionName(path.main, 'مكتبة نور');

	const exactSecondary = findBestSecondaryAnywhere(tree, secondaryName, bookMeta);
	if (exactSecondary) {
		return {
			kind: 'existing',
			mainId: String(exactSecondary.main.id),
			subId: String(exactSecondary.sub.id),
			secondaryId: String(exactSecondary.secondary.id),
			confidence: Math.max(path.confidence || 0.5, 0.86),
			reasoning: `${path.reasoning} استُخدم قسم ثانوي مناسب موجود: ${exactSecondary.secondary.name}.`,
			method: 'heuristic'
		};
	}

	const existingSub = findBestSubAnywhere(tree, subName, bookMeta);
	if (existingSub) {
		const secondary = findBestSecondaryInSub(existingSub.sub, secondaryName, bookMeta);
		if (secondary) {
			return {
				kind: 'existing',
				mainId: String(existingSub.main.id),
				subId: String(existingSub.sub.id),
				secondaryId: String(secondary.node.id),
				confidence: Math.max(path.confidence || 0.5, 0.84),
				reasoning: `${path.reasoning} استُخدم مسار موجود تحت ${existingSub.sub.name}.`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(existingSub.main.id),
			subId: String(existingSub.sub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: path.confidence || 0.72,
			reasoning: `${path.reasoning} وُجد القسم الفرعي المناسب، وسيُنشأ مستوى ثانوي دقيق.`,
			method: 'heuristic'
		};
	}

	const main = findBestMain(tree, mainName, bookMeta);
	if (main) {
		const sub = findBestSubInMain(main.node, subName, bookMeta);
		if (sub) {
			const secondary = findBestSecondaryInSub(sub.node, secondaryName, bookMeta);
			if (secondary) {
				return {
					kind: 'existing',
					mainId: String(main.node.id),
					subId: String(sub.node.id),
					secondaryId: String(secondary.node.id),
					confidence: Math.max(path.confidence || 0.5, 0.82),
					reasoning: `${path.reasoning} استُخدم مسار ثلاثي موجود.`,
					method: 'heuristic'
				};
			}
			return {
				kind: 'create_secondary',
				mainId: String(main.node.id),
				subId: String(sub.node.id),
				secondaryId: null,
				newSecondaryName: secondaryName,
				confidence: path.confidence || 0.7,
				reasoning: `${path.reasoning} وُجد main/sub مناسبان، وسيُنشأ القسم الثانوي الصحيح.`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_sub',
			mainId: String(main.node.id),
			subId: null,
			secondaryId: null,
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: path.confidence || 0.62,
			reasoning: `${path.reasoning} وُجد القسم الرئيسي المناسب، وسيُنشأ فرع دقيق تحته.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: mainName,
		newSubName: subName,
		newSecondaryName: secondaryName,
		confidence: path.confidence || 0.5,
		reasoning: `${path.reasoning} لا يوجد مسار مناسب حالياً؛ سيُنشأ المسار الثلاثي كاملاً.`,
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
	const decision = await classifyAutonomous(sections, bookMeta);
	const sug = {
		mainId: decision.mainId,
		subId: decision.subId,
		secondaryId: decision.secondaryId || null,
		newMainName: decision.newMainName,
		newSubName: decision.newSubName,
		newSecondaryName: decision.newSecondaryName,
		kind: decision.kind,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method
	};
	const validation = decision.kind === 'existing'
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'section_creation_required' };
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
	const path = inferTaxonomyPath(bookMeta);
	return resolvePathToDecision(sections || { tree: [], index: {} }, bookMeta, path);
}
