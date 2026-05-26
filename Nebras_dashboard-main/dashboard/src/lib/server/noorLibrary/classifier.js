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

const SEMANTIC_PROFILES = Object.freeze([
	{
		id: 'scientific_guidance',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		keywords: [
			'نصائح',
			'النصائح',
			'توجيهات',
			'التوجيهات',
			'تعليمات',
			'التعليمات',
			'علمية',
			'العلمية',
			'تعليم',
			'التعليم',
			'تربية',
			'التربية',
			'طلب العلم',
			'اداب طالب العلم'
		],
		negativeKeywords: ['فقه', 'العقيده', 'التاريخ', 'السيره', 'الحديث', 'التفسير']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية',
		keywords: ['فقه', 'الفقه', 'اصول الفقه', 'فتاوي', 'فتاوى', 'احكام', 'الحلال', 'الحرام']
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'كتب العقيدة',
		keywords: ['عقيده', 'العقيده', 'توحيد', 'الايمان', 'الايمان', 'اسماء الله', 'الفرق']
	},
	{
		id: 'history',
		mainName: 'التاريخ والسير',
		subName: 'التاريخ الإسلامي',
		secondaryName: 'كتب التاريخ',
		keywords: ['تاريخ', 'التاريخ', 'سيره', 'السيره', 'تراجم', 'الطبقات', 'الخلفاء']
	},
	{
		id: 'adab',
		mainName: 'الأدب واللغة',
		subName: 'الأدب العربي',
		secondaryName: 'كتب الأدب',
		keywords: ['ادب', 'الادب', 'شعر', 'الشعر', 'بلاغه', 'نقد', 'ديوان']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'علوم الحديث',
		secondaryName: 'كتب الحديث',
		keywords: ['حديث', 'الحديث', 'السنه', 'السنن', 'رواه', 'صحيح', 'الجرح والتعديل']
	},
	{
		id: 'tafsir',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب التفسير',
		keywords: ['تفسير', 'التفسير', 'القران', 'القرآن', 'علوم القران', 'تجويد']
	}
]);

function normalizedTextForBook(bookMeta) {
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

function normalizedTokens(text) {
	return new Set(normalizeArabic(text).split(' ').filter((t) => t.length >= 3));
}

function scoreNameAgainstTarget(name, target) {
	const n = normalizeArabic(name);
	const t = normalizeArabic(target);
	if (!n || !t) return 0;
	if (n === t) return 100;
	if (n.includes(t) || t.includes(n)) return 80;
	return tokenSetsOverlapRatio(normalizedTokens(n), normalizedTokens(t)) * 60;
}

function pickBestByName(list, targetName) {
	let best = null;
	let bestScore = 0;
	for (const item of list || []) {
		const score = scoreNameAgainstTarget(item?.name, targetName);
		if (score > bestScore) {
			best = item;
			bestScore = score;
		}
	}
	return bestScore >= 30 ? best : null;
}

function scoreSemanticProfile(profile, bookMeta) {
	const hay = normalizedTextForBook(bookMeta);
	if (!hay) return 0;
	let score = 0;
	for (const kw of profile.keywords || []) {
		const n = normalizeArabic(kw);
		if (n && hay.includes(n)) score += n.includes(' ') ? 4 : 2;
	}
	for (const kw of profile.negativeKeywords || []) {
		const n = normalizeArabic(kw);
		if (n && hay.includes(n)) score -= 3;
	}
	return score;
}

function pickSemanticProfile(bookMeta) {
	let best = null;
	let bestScore = 0;
	for (const profile of SEMANTIC_PROFILES) {
		const score = scoreSemanticProfile(profile, bookMeta);
		if (score > bestScore) {
			best = profile;
			bestScore = score;
		}
	}
	if (!best || bestScore < 3) return null;
	return { profile: best, score: bestScore };
}

function buildProfileDecision(sections, bookMeta, picked) {
	const { profile, score } = picked;
	const main = pickBestByName(sections.tree, profile.mainName);
	const confidence = Math.min(0.72 + score * 0.03, 0.96);
	const reasoning = `تصنيف دلالي محافظ: ${profile.mainName} > ${profile.subName} > ${profile.secondaryName}`;
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: profile.mainName,
			newSubName: profile.subName,
			newSecondaryName: profile.secondaryName,
			confidence,
			reasoning,
			method: 'semantic'
		};
	}

	const sub = pickBestByName(main.children || [], profile.subName);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: profile.subName,
			newSecondaryName: profile.secondaryName,
			confidence,
			reasoning,
			method: 'semantic'
		};
	}

	const secondary =
		pickBestByName(sub.children || [], profile.secondaryName) ||
		pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: profile.secondaryName,
			minScore: 6
		});
	if (secondary) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secondary.id),
			confidence,
			reasoning,
			method: 'semantic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName: profile.secondaryName,
		confidence,
		reasoning,
		method: 'semantic'
	};
}

function proposeSecondaryName(bookMeta) {
	const hint = Array.isArray(bookMeta?.categoryHints)
		? String(bookMeta.categoryHints[0] || '').trim()
		: '';
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	return String(hint || stem || 'كتب عامة').trim().slice(0, 80) || 'كتب عامة';
}

function requireSecondaryDecision(sections, decision, bookMeta) {
	if (decision.secondaryId || decision.kind === 'create_secondary') return decision;
	if (decision.kind === 'create_main' || decision.kind === 'create_sub') {
		return {
			...decision,
			newSecondaryName: decision.newSecondaryName || proposeSecondaryName(bookMeta)
		};
	}
	if (decision.subId) {
		const autoSec = pickReuseSecondary(sections, String(decision.subId), bookMeta, {
			proposedNewName: proposeSecondaryName(bookMeta),
			minScore: 6
		});
		if (autoSec) return { ...decision, secondaryId: autoSec.id };
		return {
			kind: 'create_secondary',
			mainId: String(decision.mainId),
			subId: String(decision.subId),
			secondaryId: null,
			newSecondaryName: proposeSecondaryName(bookMeta),
			confidence: Math.min(Number(decision.confidence || 0.3), 0.7),
			reasoning: `${decision.reasoning || 'تصنيف محلي'} — إنشاء قسم ثانوي لإكمال الهيكل الثلاثي.`,
			method: decision.method || 'heuristic'
		};
	}
	return decision;
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

	const semantic = pickSemanticProfile(bookMeta);
	const decision = semantic ? buildProfileDecision(sections, bookMeta, semantic) : null;
	const sug =
		decision?.kind === 'existing'
			? {
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method
				}
			: classifyHeuristic(sections, bookMeta);
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
	const semantic = pickSemanticProfile(bookMeta);
	if (semantic) {
		return requireSecondaryDecision(
			sections,
			buildProfileDecision(sections, bookMeta, semantic),
			bookMeta
		);
	}

	const sug = classifyHeuristic(sections, bookMeta);
	if (!sug) {
		return requireSecondaryDecision(sections, {
			kind: 'existing',
			mainId: sections.tree[0].id,
			subId: sections.tree[0].children[0]?.id || '',
			secondaryId: null,
			confidence: 0.1,
			reasoning: 'لم تعطِ خوارزميّة المطابقة نتيجة — أوّل قسم رئيسي/فرعي.',
			method: 'heuristic'
		}, bookMeta);
	}
	let secId = sug.secondaryId ? String(sug.secondaryId) : null;
	if (!secId) {
		const autoSec = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: '',
			minScore: 9
		});
		if (autoSec) secId = autoSec.id;
	}
	return requireSecondaryDecision(sections, {
		kind: 'existing',
		mainId: String(sug.mainId),
		subId: String(sug.subId),
		secondaryId: secId,
		confidence: sug.confidence,
		reasoning: sug.reasoning,
		method: 'heuristic'
	}, bookMeta);
}
