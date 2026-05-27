/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary].
 *
 * القاعدة التشغيلية هنا محافظة: لا نضع كتاباً في قسم قائم لمجرّد وجود
 * تشابه ضعيف. إن لم توجد مطابقة دلالية واضحة، نرجع قرار إنشاء المستوى
 * المناسب فوراً، ويكتب engine.js الأقسام بنفس schema لوحة التحكم.
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
		.replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function withoutArabicArticle(word) {
	const w = normalizeArabic(word);
	return w.startsWith('ال') && w.length > 4 ? w.slice(2) : w;
}

function tokensOf(s, minLen = 3) {
	const out = new Set();
	for (const raw of normalizeArabic(s).split(' ')) {
		if (raw.length < minLen) continue;
		out.add(raw);
		const stripped = withoutArabicArticle(raw);
		if (stripped.length >= minLen) out.add(stripped);
	}
	return out;
}

function textForBook(bookMeta) {
	return [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...(bookMeta?.categoryHints || [])
	]
		.filter(Boolean)
		.join(' ');
}

function haystackForBook(bookMeta) {
	return normalizeArabic(textForBook(bookMeta));
}

function tokenSetsOverlapRatio(setA, setB) {
	if (!setA.size || !setB.size) return 0;
	let inter = 0;
	for (const t of setA) if (setB.has(t)) inter += 1;
	return inter / new Set([...setA, ...setB]).size;
}

function cleanDisplayName(name, fallback = '') {
	let s = String(name || fallback || '').trim();
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 64) s = s.slice(0, 64).trim();
	return s;
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

function firstUsefulCategoryHint(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = cleanDisplayName(hint);
		if (clean && clean.length >= 2 && !/^(الرئيسية|home|كتب)$/i.test(clean)) return clean;
	}
	return '';
}

function proposedSecondaryName(bookMeta, fallback = 'كتب عامة') {
	const hint = firstUsefulCategoryHint(bookMeta);
	if (hint) return hint;
	const stem = cleanDisplayName(seriesStemFromTitle(bookMeta?.title || ''));
	if (stem && stem.length >= 3) return stem;
	return fallback;
}

const SECTION_ALIASES = Object.freeze({
	'الدعوة والتربية': ['الدعوة', 'التربية والدعوة', 'التربية'],
	'التربية والتعليم': ['التعليم', 'تربية وتعليم', 'التربية التعليمية'],
	'النصائح والتوجيهات العلمية': [
		'النصائح العلمية',
		'التوجيهات العلمية',
		'نصائح علمية',
		'تعليمات علمية'
	],
	'الفقه الإسلامي': ['الفقه', 'فقه', 'الشريعة', 'الشريعة الإسلامية'],
	'الفقه العام': ['أحكام فقهية', 'أحكام شرعية', 'فقه العبادات', 'فقه المعاملات'],
	'العقيدة': ['العقيدة الإسلامية', 'التوحيد', 'الإيمان'],
	'العقيدة الإسلامية': ['التوحيد', 'أصول الاعتقاد', 'الإيمان'],
	'التاريخ والسير': ['التاريخ', 'التاريخ الإسلامي', 'السير والتراجم'],
	'التاريخ الإسلامي': ['السيرة والتاريخ', 'التراجم', 'السير'],
	'الأدب واللغة': ['الأدب العربي', 'اللغة العربية', 'الأدب'],
	'الأدب العربي': ['الشعر', 'النثر', 'البلاغة'],
	'القرآن وعلومه': ['القرآن الكريم', 'التفسير وعلوم القرآن', 'علوم القرآن'],
	'التفسير': ['تفسير القرآن', 'كتب التفسير'],
	'الحديث الشريف': ['الحديث', 'السنة النبوية', 'علوم الحديث'],
	'السيرة النبوية': ['السيرة', 'شمائل النبي', 'المغازي'],
	'الأخلاق والتزكية': ['التزكية', 'الأخلاق', 'الرقائق']
});

const TOPIC_RULES = Object.freeze([
	{
		id: 'scientific_guidance',
		main: 'الدعوة والتربية',
		sub: 'التربية والتعليم',
		secondary: 'النصائح والتوجيهات العلمية',
		mustAll: ['نصائح', 'تعليم'],
		keywords: [
			'النصائح',
			'نصائح',
			'التعليمات العلمية',
			'تعليمات علمية',
			'التوجيهات العلمية',
			'السادة',
			'الطلبة',
			'آداب طالب العلم',
			'طالب العلم',
			'تعليم',
			'تربية'
		],
		minScore: 6
	},
	{
		id: 'fiqh',
		main: 'الفقه الإسلامي',
		sub: 'الفقه العام',
		secondary: 'أحكام فقهية',
		keywords: [
			'فقه',
			'الفقه',
			'أصول الفقه',
			'أحكام',
			'الأحكام',
			'حلال',
			'حرام',
			'عبادات',
			'معاملات',
			'طهارة',
			'صلاة',
			'زكاة',
			'صيام',
			'حج'
		],
		minScore: 3
	},
	{
		id: 'aqeedah',
		main: 'العقيدة',
		sub: 'العقيدة الإسلامية',
		secondary: 'التوحيد والإيمان',
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الإيمان', 'ايمان', 'الفرق', 'الأسماء والصفات'],
		minScore: 3
	},
	{
		id: 'history',
		main: 'التاريخ والسير',
		sub: 'التاريخ الإسلامي',
		secondary: 'تراجم وسير',
		keywords: ['تاريخ', 'التاريخ', 'تراجم', 'سير', 'السير', 'خلفاء', 'فتوح', 'دول', 'ملوك'],
		minScore: 3
	},
	{
		id: 'literature',
		main: 'الأدب واللغة',
		sub: 'الأدب العربي',
		secondary: 'دراسات أدبية',
		keywords: ['أدب', 'الأدب', 'شعر', 'الشعر', 'نثر', 'بلاغة', 'رواية', 'قصص'],
		minScore: 3
	},
	{
		id: 'quran',
		main: 'القرآن وعلومه',
		sub: 'التفسير',
		secondary: 'تفسير وعلوم القرآن',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'التفسير', 'علوم القرآن', 'تجويد', 'قراءات'],
		minScore: 3
	},
	{
		id: 'hadith',
		main: 'الحديث الشريف',
		sub: 'علوم الحديث',
		secondary: 'كتب الحديث',
		keywords: ['حديث', 'الحديث', 'السنة', 'أحاديث', 'مصطلح الحديث', 'الجرح والتعديل'],
		minScore: 3
	},
	{
		id: 'seerah',
		main: 'السيرة النبوية',
		sub: 'السيرة والشمائل',
		secondary: 'السيرة النبوية',
		keywords: ['سيرة', 'السيرة', 'النبوية', 'شمائل', 'المغازي', 'رسول الله'],
		minScore: 3
	},
	{
		id: 'tazkiyah',
		main: 'الأخلاق والتزكية',
		sub: 'التزكية والأخلاق',
		secondary: 'الرقائق والآداب',
		keywords: ['تزكية', 'الأخلاق', 'أخلاق', 'رقائق', 'آداب', 'زهد', 'مواعظ'],
		minScore: 3
	}
]);

function phraseMatches(haystack, phrase) {
	const p = normalizeArabic(phrase);
	if (!p) return false;
	if (haystack.includes(p)) return true;
	const stripped = p
		.split(' ')
		.map(withoutArabicArticle)
		.join(' ');
	return stripped.length >= 3 && haystack.includes(stripped);
}

function scoreTopicRule(rule, haystack) {
	for (const required of rule.mustAll || []) {
		if (!phraseMatches(haystack, required)) return 0;
	}
	let score = 0;
	for (const phrase of rule.keywords || []) {
		if (!phraseMatches(haystack, phrase)) continue;
		score += Math.max(2, normalizeArabic(phrase).split(' ').length + 1);
	}
	return score;
}

function pickTopicTarget(bookMeta) {
	const haystack = haystackForBook(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		const score = scoreTopicRule(rule, haystack);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	if (!best || bestScore < (best.minScore || 1)) return null;
	return {
		main: best.main,
		sub: best.sub,
		secondary: best.secondary,
		confidence: Math.min(0.62 + bestScore * 0.03, 0.93),
		reasoning: `قاعدة دلالية (${best.id}) منعت خلط الموضوعات واقترحت مساراً متخصصاً.`
	};
}

function candidateNames(name) {
	return [name, ...(SECTION_ALIASES[name] || [])].filter(Boolean);
}

function scoreNameAgainstCandidate(actualName, candidate) {
	const actual = normalizeArabic(actualName);
	const wanted = normalizeArabic(candidate);
	if (!actual || !wanted) return 0;
	if (actual === wanted) return 100;
	if (actual.length >= 4 && wanted.includes(actual)) return 82;
	if (wanted.length >= 4 && actual.includes(wanted)) return 82;
	const actualTokens = tokensOf(actual);
	const wantedTokens = tokensOf(wanted);
	const overlap = tokenSetsOverlapRatio(actualTokens, wantedTokens);
	if (overlap >= 0.5) return 70;
	if (overlap >= 0.34) return 55;
	return 0;
}

function findBestNodeByName(nodes, canonicalName, minScore = 55) {
	let best = null;
	let bestScore = 0;
	for (const node of nodes || []) {
		for (const candidate of candidateNames(canonicalName)) {
			const score = scoreNameAgainstCandidate(node?.name || '', candidate);
			if (score > bestScore) {
				best = node;
				bestScore = score;
			}
		}
	}
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function getSubNodesForMain(mainNode) {
	return Array.isArray(mainNode?.children) ? mainNode.children : [];
}

function getSecondariesUnderSubInTree(tree, subId) {
	for (const m of tree || []) {
		for (const s of m.children || []) {
			if (String(s.id) === String(subId)) return s.children || [];
		}
	}
	return [];
}

function scoreOfSection(sectionName, haystack, tokens) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length < 3) continue;
		const stripped = withoutArabicArticle(w);
		if (tokens.has(w) || tokens.has(stripped)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	const strippedName = n
		.split(' ')
		.map(withoutArabicArticle)
		.join(' ');
	if (strippedName.length >= 4 && haystack.includes(strippedName)) score += 2;
	return score;
}

function scoreSecondaryForReuse(secNode, bookMeta, proposedNewName) {
	const secN = normalizeArabic(secNode?.name || '');
	const propN = normalizeArabic(proposedNewName || '');
	const hay = haystackForBook(bookMeta);
	if (!secN) return 0;
	const secTok = tokensOf(secN);
	const hayTok = tokensOf(hay);

	let score = 0;
	if (propN) {
		if (secN === propN) score += 14;
		else if (secN.includes(propN) || propN.includes(secN)) score += 11;
		else {
			const pTok = tokensOf(propN);
			const r = tokenSetsOverlapRatio(pTok, secTok);
			if (r >= 0.45) score += 8;
			else if (r >= 0.25) score += 4;
		}
	}
	if (hay.includes(secN) && secN.length >= 4) score += 9;
	const stemTok = tokensOf(seriesStemFromTitle(bookMeta?.title || ''));
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

function resolveTargetPath(sections, target, bookMeta) {
	const mainHit = findBestNodeByName(sections.tree, target.main);
	if (!mainHit) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: target.main,
			newSubName: target.sub,
			newSecondaryName: target.secondary,
			confidence: target.confidence,
			reasoning: `${target.reasoning} لا يوجد قسم رئيسي مناسب؛ سيُنشأ المسار الكامل.`,
			method: 'heuristic'
		};
	}

	const main = mainHit.node;
	const subHit = findBestNodeByName(getSubNodesForMain(main), target.sub);
	if (!subHit) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: target.sub,
			newSecondaryName: target.secondary,
			confidence: target.confidence,
			reasoning: `${target.reasoning} وُجد الرئيسي "${main.name}" وسيُنشأ الفرعي الصحيح.`,
			method: 'heuristic'
		};
	}

	const sub = subHit.node;
	if (target.secondary) {
		const secHit = findBestNodeByName(sub.children || [], target.secondary, 50);
		if (secHit) {
			return {
				kind: 'existing',
				mainId: String(main.id),
				subId: String(sub.id),
				secondaryId: String(secHit.node.id),
				confidence: target.confidence,
				reasoning: `${target.reasoning} المسار المتخصص موجود.`,
				method: 'heuristic'
			};
		}
		const reusable = pickReuseSecondary(sections, String(sub.id), bookMeta, {
			proposedNewName: target.secondary,
			minScore: 9
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(main.id),
				subId: String(sub.id),
				secondaryId: reusable.id,
				confidence: target.confidence,
				reasoning: `${target.reasoning} أُعيد استعمال قسم ثانوي قريب: "${reusable.name}".`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: target.secondary,
			confidence: target.confidence,
			reasoning: `${target.reasoning} وُجد الرئيسي والفرعي، وسيُنشأ الثانوي المتخصص.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		confidence: target.confidence,
		reasoning: target.reasoning,
		method: 'heuristic'
	};
}

function fallbackTarget(bookMeta) {
	const sub = firstUsefulCategoryHint(bookMeta) || 'كتب عامة';
	return {
		main: 'مكتبة نور',
		sub,
		secondary: proposedSecondaryName(bookMeta, sub),
		confidence: 0.35,
		reasoning: 'لم تظهر دلالة موضوعية قوية؛ إنشاء مسار عام لمكتبة نور بدل خلطه مع قسم غير مناسب.'
	};
}

function bestExistingPath(sections, bookMeta) {
	const haystack = haystackForBook(bookMeta);
	const tokens = tokensOf(haystack);
	let bestMain = null;
	let bestMainScore = 0;
	for (const m of sections.tree || []) {
		const s = scoreOfSection(m.name, haystack, tokens);
		if (s > bestMainScore) {
			bestMainScore = s;
			bestMain = m;
		}
	}
	if (!bestMain || bestMainScore <= 0) return null;

	let bestSub = null;
	let bestSubScore = 0;
	for (const sub of bestMain.children || []) {
		const s = scoreOfSection(sub.name, haystack, tokens);
		if (s > bestSubScore) {
			bestSubScore = s;
			bestSub = sub;
		}
	}
	if (!bestSub || bestSubScore <= 0) {
		return {
			main: bestMain,
			sub: null,
			secondary: null,
			mainScore: bestMainScore,
			subScore: bestSubScore,
			secScore: 0
		};
	}

	let bestSec = null;
	let bestSecScore = 0;
	for (const sec of bestSub.children || []) {
		const s = scoreOfSection(sec.name, haystack, tokens);
		if (s > bestSecScore) {
			bestSecScore = s;
			bestSec = sec;
		}
	}

	return {
		main: bestMain,
		sub: bestSub,
		secondary: bestSecScore > 0 ? bestSec : null,
		mainScore: bestMainScore,
		subScore: bestSubScore,
		secScore: bestSecScore
	};
}

function decisionFromBestExisting(sections, bookMeta) {
	const best = bestExistingPath(sections, bookMeta);
	if (!best) return resolveTargetPath(sections, fallbackTarget(bookMeta), bookMeta);

	const confidence = Math.min(0.52 + best.mainScore * 0.05 + best.subScore * 0.05, 0.86);
	if (!best.sub) {
		const subName = firstUsefulCategoryHint(bookMeta) || 'كتب عامة';
		return {
			kind: 'create_sub',
			mainId: String(best.main.id),
			subId: null,
			secondaryId: null,
			newSubName: subName,
			newSecondaryName: proposedSecondaryName(bookMeta, subName),
			confidence: 0.45,
			reasoning: `وُجد قسم رئيسي مناسب "${best.main.name}" لكن لا يوجد فرعي واضح؛ سيُنشأ فرعي جديد.`,
			method: 'heuristic'
		};
	}

	if (!best.secondary) {
		const secName = proposedSecondaryName(bookMeta, best.sub.name || 'كتب عامة');
		const reusable = pickReuseSecondary(sections, String(best.sub.id), bookMeta, {
			proposedNewName: secName,
			minScore: 9
		});
		if (reusable) {
			return {
				kind: 'existing',
				mainId: String(best.main.id),
				subId: String(best.sub.id),
				secondaryId: reusable.id,
				confidence,
				reasoning: `مطابقة محلّيّة مع إعادة استعمال الثانوي "${reusable.name}".`,
				method: 'heuristic'
			};
		}
		return {
			kind: 'create_secondary',
			mainId: String(best.main.id),
			subId: String(best.sub.id),
			secondaryId: null,
			newSecondaryName: secName,
			confidence: Math.max(0.48, confidence - 0.08),
			reasoning: `وُجد الرئيسي "${best.main.name}" والفرعي "${best.sub.name}" لكن لا يوجد ثانوي مناسب؛ سيُنشأ ثانوي جديد.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(best.main.id),
		subId: String(best.sub.id),
		secondaryId: String(best.secondary.id),
		confidence,
		reasoning: `مطابقة محلّيّة: ${best.main.name} ← ${best.sub.name} ← ${best.secondary.name}.`,
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

	const decision = await classifyAutonomous(sections, bookMeta);
	const existing = bestExistingPath(sections, bookMeta);
	const suggested =
		decision.kind === 'existing'
			? {
					mainId: decision.mainId,
					subId: decision.subId,
					secondaryId: decision.secondaryId || null,
					confidence: decision.confidence,
					reasoning: decision.reasoning,
					method: decision.method
				}
			: existing?.sub
				? {
						mainId: String(existing.main.id),
						subId: String(existing.sub.id),
						secondaryId: existing.secondary ? String(existing.secondary.id) : null,
						confidence: Math.min(0.5 + existing.mainScore * 0.05 + existing.subScore * 0.05, 0.82),
						reasoning: 'أفضل مسار قائم للمعاينة فقط؛ الاستيراد الآلي سينشئ القسم الأنسب.',
						method: 'heuristic'
					}
				: {
						mainId: sections.tree[0].id,
						subId: sections.tree[0].children[0]?.id || '',
						secondaryId: sections.tree[0].children[0]?.children?.[0]?.id || null,
						confidence: 0.1,
						reasoning: 'مسار معاينة احتياطي فقط؛ الاستيراد الآلي سينشئ مساراً جديداً عند الحاجة.',
						method: 'heuristic'
					};

	const validation = validateHierarchyPath(
		{ mainId: suggested.mainId, subId: suggested.subId, secondaryId: suggested.secondaryId || null },
		sections.index
	);

	return {
		suggested,
		alternatives: [
			{
				kind: decision.kind,
				mainId: decision.mainId,
				subId: decision.subId,
				secondaryId: decision.secondaryId || null,
				newMainName: decision.newMainName || null,
				newSubName: decision.newSubName || null,
				newSecondaryName: decision.newSecondaryName || null,
				confidence: decision.confidence,
				reasoning: decision.reasoning
			}
		],
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

	const target = pickTopicTarget(bookMeta);
	if (target) return resolveTargetPath(sections, target, bookMeta);
	return decisionFromBestExisting(sections, bookMeta);
}
