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

function tokenizeNormalized(value) {
	return normalizeArabic(value).split(' ').filter((t) => t.length >= 3);
}

function textForBook(bookMeta) {
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

function hasAll(text, words) {
	return words.every((w) => text.includes(normalizeArabic(w)));
}

function hasAny(text, words) {
	return words.some((w) => text.includes(normalizeArabic(w)));
}

function cleanSectionName(name, fallback = 'كتب عامة') {
	return String(name || fallback)
		.replace(/^كتب\s+(?:في|عن)\s+/u, '')
		.replace(/\s*[-–—|].*$/u, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80) || fallback;
}

const TOPIC_RULES = Object.freeze([
	{
		id: 'scientific_advice_for_education',
		mainNames: ['الدعوة والتربية', 'التربية والتعليم'],
		subNames: ['التربية والتعليم', 'التعليم والتربية', 'التربية'],
		secondaryNames: ['النصائح والتوجيهات العلمية', 'النصائح العلمية', 'التوجيهات العلمية'],
		matches(text) {
			return (
				hasAny(text, ['نصائح', 'النصائح', 'توجيهات', 'التوجيهات']) &&
				hasAny(text, ['تعليم', 'التعليم', 'تعليمات', 'التعليمات', 'تربية', 'التربية']) &&
				hasAny(text, ['علمية', 'العلمية', 'السادة', 'للسادة'])
			);
		}
	},
	{
		id: 'fiqh',
		mainNames: ['الفقه وأصوله', 'الفقه الإسلامي', 'الفقه'],
		subNames: ['الفقه العام', 'كتب الفقه', 'الفقه'],
		secondaryNames: ['مسائل فقهية', 'الفقه العام'],
		keywords: ['فقه', 'فقهي', 'فقهية', 'عبادات', 'معاملات', 'فتاوى', 'أصول الفقه']
	},
	{
		id: 'aqeedah',
		mainNames: ['العقيدة', 'العقيدة الإسلامية'],
		subNames: ['العقيدة الإسلامية', 'التوحيد'],
		secondaryNames: ['كتب العقيدة', 'التوحيد والعقيدة'],
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الايمان', 'الإيمان', 'اسماء الله', 'أسماء الله']
	},
	{
		id: 'history',
		mainNames: ['التاريخ والسير', 'التاريخ الإسلامي', 'السيرة والتاريخ'],
		subNames: ['التاريخ الإسلامي', 'السير والتراجم', 'التاريخ'],
		secondaryNames: ['كتب التاريخ', 'أحداث وتراجم'],
		keywords: ['تاريخ', 'التاريخ', 'تراجم', 'سير', 'دولة', 'الخلافة', 'الحضارة']
	},
	{
		id: 'adab',
		mainNames: ['اللغة والأدب', 'الأدب والبلاغة', 'اللغة العربية'],
		subNames: ['الأدب العربي', 'البلاغة والأدب', 'الأدب'],
		secondaryNames: ['كتب الأدب', 'النصوص الأدبية'],
		keywords: ['أدب', 'الادب', 'الأدب', 'شعر', 'رواية', 'قصص', 'بلاغة']
	},
	{
		id: 'quran',
		mainNames: ['القرآن وعلومه', 'التفسير وعلوم القرآن'],
		subNames: ['التفسير', 'علوم القرآن'],
		secondaryNames: ['كتب التفسير', 'علوم القرآن'],
		keywords: ['قرآن', 'القران', 'القرآن', 'تفسير', 'المصحف', 'علوم القرآن']
	},
	{
		id: 'hadith',
		mainNames: ['الحديث وعلومه', 'الحديث الشريف'],
		subNames: ['كتب الحديث', 'علوم الحديث'],
		secondaryNames: ['متون وشروح الحديث', 'مصطلح الحديث'],
		keywords: ['حديث', 'الحديث', 'السنة', 'صحيح', 'سنن', 'رواة', 'مصطلح الحديث']
	},
	{
		id: 'sirah',
		mainNames: ['السيرة النبوية', 'التاريخ والسير'],
		subNames: ['السيرة النبوية', 'شمائل النبي'],
		secondaryNames: ['كتب السيرة', 'الشمائل والدلائل'],
		keywords: ['سيرة', 'السيرة', 'النبوية', 'النبي', 'الرسول', 'شمائل', 'مغازي']
	}
]);

function ruleMatches(rule, bookMeta) {
	const text = textForBook(bookMeta);
	if (typeof rule.matches === 'function') return rule.matches(text, bookMeta);
	return hasAny(text, rule.keywords || []);
}

function byNormalizedName(rows, names, parentKey = null, parentId = null) {
	const candidates = new Set((names || []).map(normalizeArabic).filter(Boolean));
	if (!candidates.size) return null;
	for (const row of rows || []) {
		if (parentKey && String(row?.[parentKey] ?? '') !== String(parentId ?? '')) continue;
		const rowName = normalizeArabic(row?.name || '');
		if (candidates.has(rowName)) return row;
	}
	for (const row of rows || []) {
		if (parentKey && String(row?.[parentKey] ?? '') !== String(parentId ?? '')) continue;
		const rowName = normalizeArabic(row?.name || '');
		for (const c of candidates) {
			if (rowName && c && (rowName.includes(c) || c.includes(rowName))) return row;
		}
	}
	return null;
}

function findRuleDecision(sections, rule, bookMeta) {
	const main = byNormalizedName(sections.flat?.mains || [], rule.mainNames);
	if (!main) {
		return {
			kind: 'create_main',
			newMainName: rule.mainNames[0],
			newSubName: rule.subNames[0],
			newSecondaryName: rule.secondaryNames[0],
			confidence: 0.94,
			reasoning: `قاعدة موضوعية: ${rule.id} — إنشاء المسار الثلاثي كاملاً.`,
			method: 'topic-rule'
		};
	}

	const mainId = String(main.id);
	const sub = byNormalizedName(sections.flat?.subs || [], rule.subNames, 'main_section', mainId);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId,
			newSubName: rule.subNames[0],
			newSecondaryName: rule.secondaryNames[0],
			confidence: 0.92,
			reasoning: `قاعدة موضوعية: ${rule.id} — إنشاء فرع وثانوي تحت قسم قائم.`,
			method: 'topic-rule'
		};
	}

	const subId = String(sub.id);
	const secondary =
		byNormalizedName(sections.flat?.secondaries || [], rule.secondaryNames, 'sub_section', subId) ||
		pickReuseSecondary(sections, subId, bookMeta, {
			proposedNewName: rule.secondaryNames[0],
			minScore: 7
		});
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId,
			subId,
			newSecondaryName: rule.secondaryNames[0],
			confidence: 0.9,
			reasoning: `قاعدة موضوعية: ${rule.id} — إنشاء قسم ثانوي دقيق.`,
			method: 'topic-rule'
		};
	}

	return {
		kind: 'existing',
		mainId,
		subId,
		secondaryId: String(secondary.id),
		confidence: 0.95,
		reasoning: `قاعدة موضوعية: ${rule.id} — مسار قائم مناسب.`,
		method: 'topic-rule'
	};
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

	if (!bestSec || bestSecScore <= 0) {
		bestSec = null;
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

function firstMatchingRule(bookMeta) {
	return TOPIC_RULES.find((rule) => ruleMatches(rule, bookMeta)) || null;
}

function deriveSecondaryName(bookMeta) {
	const hints = Array.isArray(bookMeta?.categoryHints) ? bookMeta.categoryHints : [];
	for (const hint of hints) {
		const cleaned = cleanSectionName(hint, '');
		if (cleaned && tokenizeNormalized(cleaned).length >= 1) return cleaned;
	}
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	if (stem && tokenizeNormalized(stem).length >= 2) return cleanSectionName(stem, 'كتب عامة');
	return 'كتب عامة';
}

function deriveFallbackDecision(sections, bookMeta) {
	const sug = classifyHeuristic(sections, bookMeta);
	if (sug) {
		if (sug.secondaryId) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: String(sug.secondaryId),
				confidence: sug.confidence,
				reasoning: sug.reasoning,
				method: sug.method
			};
		}
		const newSecondaryName = deriveSecondaryName(bookMeta);
		const reusable = pickReuseSecondary(sections, String(sug.subId), bookMeta, {
			proposedNewName: newSecondaryName,
			minScore: 6
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(sug.mainId),
				subId: String(sug.subId),
				secondaryId: reusable.id,
				confidence: Math.max(sug.confidence, 0.72),
				reasoning: `إعادة استعمال قسم ثانوي قريب: ${reusable.name}`,
				method: 'heuristic-reuse'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(sug.mainId),
			subId: String(sug.subId),
			newSecondaryName,
			confidence: Math.max(sug.confidence, 0.68),
			reasoning: 'مطابقة main/sub موجودة، ولا يوجد secondary مناسب؛ إنشاء قسم ثانوي.',
			method: 'heuristic-create-secondary'
		};
	}

	const hint = deriveSecondaryName(bookMeta);
	return {
		kind: 'create_main',
		newMainName: 'مكتبة نور',
		newSubName: cleanSectionName((bookMeta?.categoryHints || [])[0], 'كتب عامة'),
		newSecondaryName: hint,
		confidence: 0.45,
		reasoning: 'لم توجد مطابقة آمنة داخل الشجرة؛ إنشاء فرع Noor مستقل لمنع خلط الموضوعات.',
		method: 'fallback-isolated'
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

	const decision = await classifyAutonomous(sections, bookMeta);
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
					mainId: decision.mainId || '',
					subId: decision.subId || '',
					secondaryId: null,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method,
					create: {
						kind: decision.kind,
						mainName: decision.newMainName || null,
						subName: decision.newSubName || null,
						secondaryName: decision.newSecondaryName || null
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
		const rule = firstMatchingRule(bookMeta);
		if (rule) {
			return {
				kind: 'create_main',
				newMainName: rule.mainNames[0],
				newSubName: rule.subNames[0],
				newSecondaryName: rule.secondaryNames[0],
				confidence: 0.9,
				reasoning: `الشجرة فارغة؛ إنشاء مسار ثلاثي من قاعدة ${rule.id}.`,
				method: 'topic-rule-empty-tree'
			};
		}
		return {
			kind: 'create_main',
			newMainName: 'مكتبة نور',
			newSubName: cleanSectionName((bookMeta?.categoryHints || [])[0], 'كتب عامة'),
			newSecondaryName: deriveSecondaryName(bookMeta),
			confidence: 0.4,
			reasoning: 'الشجرة فارغة؛ إنشاء مسار Noor مستقل ثلاثي المستويات.',
			method: 'fallback-empty-tree'
		};
	}

	const rule = firstMatchingRule(bookMeta);
	if (rule) return findRuleDecision(sections, rule, bookMeta);

	return deriveFallbackDecision(sections, bookMeta);
}
