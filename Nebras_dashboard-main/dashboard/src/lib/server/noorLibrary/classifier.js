/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة الإلزامية [main → sub → secondary → content].
 *
 * يعتمد التصنيف على قواعد محلية واعية بالمجالات حتى لا تختلط كتب الآداب
 * بالفقه، أو التاريخ بالعقيدة، ثم ينشئ المستوى الناقص فقط عند الحاجة.
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

function bookText(bookMeta) {
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

function tokensOf(text) {
	return new Set(normalizeArabic(text).split(' ').filter((t) => t.length >= 3));
}

function keywordScore(text, keywords, { phrase = 4, token = 1 } = {}) {
	const hay = normalizeArabic(text);
	if (!hay) return 0;
	const hayTokens = tokensOf(hay);
	let score = 0;
	for (const raw of keywords || []) {
		const kw = normalizeArabic(raw);
		if (!kw) continue;
		if (hay.includes(kw)) {
			score += phrase;
			continue;
		}
		const kwTokens = kw.split(' ').filter((t) => t.length >= 3);
		if (kwTokens.length && kwTokens.every((t) => hayTokens.has(t))) {
			score += token * kwTokens.length;
		}
	}
	return score;
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

function cleanSectionName(name, fallback = 'موضوعات عامة') {
	const n = String(name || '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^(?:كتاب|الكتاب|تحميل كتاب)\s+/u, '')
		.slice(0, 80);
	return n || fallback;
}

function deriveSecondaryName(bookMeta) {
	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''), '');
	if (stem && stem.length <= 70) return stem;
	const hint = (bookMeta?.categoryHints || []).find((h) => String(h || '').trim().length >= 3);
	return cleanSectionName(hint, 'موضوعات عامة');
}

const DOMAIN_PROFILES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'علوم القرآن',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'تفاسير', 'المصحف', 'تجويد', 'قراءات', 'علوم القرآن', 'أسباب النزول'],
		mainHints: ['قرآن', 'القرآن', 'علوم القرآن', 'التفسير'],
		subHints: ['تفسير', 'علوم القرآن', 'تجويد', 'قراءات'],
		conflictHints: ['فقه', 'عقيدة', 'تاريخ', 'سيرة', 'لغة عربية', 'نحو', 'صرف'],
		topics: [
			{ name: 'التفسير', subName: 'التفسير', keywords: ['تفسير', 'تفاسير'] },
			{ name: 'التجويد والقراءات', subName: 'علوم القرآن', keywords: ['تجويد', 'قراءات', 'رواية حفص', 'القراءات'] },
			{ name: 'علوم القرآن', subName: 'علوم القرآن', keywords: ['علوم القرآن', 'أسباب النزول', 'ناسخ ومنسوخ', 'إعجاز'] }
		]
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'كتب الحديث',
		secondaryName: 'علوم الحديث',
		keywords: ['حديث', 'الأحاديث', 'السنة', 'سنن', 'صحيح', 'مسند', 'مصطلح الحديث', 'جرح وتعديل', 'رجال الحديث'],
		mainHints: ['حديث', 'السنة', 'علوم الحديث'],
		subHints: ['كتب الحديث', 'مصطلح الحديث', 'رجال الحديث', 'الأسانيد'],
		conflictHints: ['فقه', 'عقيدة', 'تاريخ', 'أدب عربي', 'نحو'],
		topics: [
			{ name: 'مصطلح الحديث', subName: 'علوم الحديث', keywords: ['مصطلح الحديث', 'علوم الحديث', 'علل الحديث'] },
			{ name: 'كتب السنة', subName: 'كتب الحديث', keywords: ['صحيح', 'سنن', 'مسند', 'موطأ', 'الأحاديث'] },
			{ name: 'رجال الحديث', subName: 'علوم الحديث', keywords: ['رجال الحديث', 'جرح وتعديل', 'تراجم الرواة'] }
		]
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل فقهية',
		keywords: ['فقه', 'أصول الفقه', 'الطهارة', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'البيوع', 'المعاملات', 'النكاح', 'الطلاق', 'الميراث', 'الفرائض', 'فتاوى'],
		mainHints: ['فقه', 'أصول الفقه', 'الشريعة'],
		subHints: ['عبادات', 'معاملات', 'أصول الفقه', 'فتاوى', 'فقه الأسرة', 'المواريث'],
		conflictHints: ['تاريخ', 'سيرة', 'عقيدة', 'توحيد', 'أدب عربي', 'شعر', 'نحو'],
		topics: [
			{ name: 'الطهارة', subName: 'العبادات', keywords: ['طهارة', 'وضوء', 'غسل', 'نجاسة'] },
			{ name: 'الصلاة', subName: 'العبادات', keywords: ['صلاة', 'الصلوات', 'أذان', 'إمامة'] },
			{ name: 'الزكاة', subName: 'العبادات', keywords: ['زكاة', 'صدقة'] },
			{ name: 'الصيام', subName: 'العبادات', keywords: ['صيام', 'رمضان', 'فطر'] },
			{ name: 'الحج والعمرة', subName: 'العبادات', keywords: ['حج', 'عمرة', 'مناسك'] },
			{ name: 'المعاملات والبيوع', subName: 'المعاملات', keywords: ['بيع', 'بيوع', 'معاملات', 'ربا', 'إجارة'] },
			{ name: 'فقه الأسرة', subName: 'فقه الأسرة', keywords: ['نكاح', 'زواج', 'طلاق', 'خلع', 'عدة', 'رضاع'] },
			{ name: 'الفرائض والمواريث', subName: 'الفرائض والمواريث', keywords: ['ميراث', 'مواريث', 'فرائض', 'تركات'] },
			{ name: 'أصول الفقه', subName: 'أصول الفقه', keywords: ['أصول الفقه', 'قياس', 'إجماع', 'استصحاب'] }
		]
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة والتوحيد',
		subName: 'أصول العقيدة',
		secondaryName: 'التوحيد',
		keywords: ['عقيدة', 'توحيد', 'الإيمان', 'أسماء الله وصفاته', 'صفات الله', 'القدر', 'الفرق', 'الملل والنحل', 'الرد على'],
		mainHints: ['عقيدة', 'توحيد', 'أصول الدين'],
		subHints: ['أصول العقيدة', 'التوحيد', 'الإيمان', 'الفرق', 'الردود'],
		conflictHints: ['تاريخ', 'سيرة', 'فقه', 'أدب عربي', 'نحو', 'بلاغة'],
		topics: [
			{ name: 'التوحيد', subName: 'أصول العقيدة', keywords: ['توحيد', 'الشرك', 'الإخلاص'] },
			{ name: 'الإيمان', subName: 'أصول العقيدة', keywords: ['الإيمان', 'أركان الإيمان', 'القدر'] },
			{ name: 'الأسماء والصفات', subName: 'أصول العقيدة', keywords: ['أسماء الله', 'صفات الله', 'الأسماء والصفات'] },
			{ name: 'الفرق والردود', subName: 'الفرق والردود', keywords: ['الفرق', 'الرد على', 'الملل والنحل', 'بدع'] }
		]
	},
	{
		key: 'sira_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة النبوية',
		secondaryName: 'السيرة النبوية',
		keywords: ['سيرة', 'السيرة', 'مغازي', 'شمائل', 'تاريخ', 'تراجم', 'طبقات', 'الخلفاء', 'الدولة الأموية', 'الدولة العباسية'],
		mainHints: ['سيرة', 'تاريخ', 'تراجم', 'طبقات'],
		subHints: ['السيرة النبوية', 'التاريخ الإسلامي', 'تراجم', 'طبقات'],
		conflictHints: ['عقيدة', 'توحيد', 'فقه', 'أصول الفقه', 'نحو', 'بلاغة'],
		topics: [
			{ name: 'السيرة النبوية', subName: 'السيرة النبوية', keywords: ['سيرة', 'السيرة النبوية', 'مغازي', 'شمائل'] },
			{ name: 'التاريخ الإسلامي', subName: 'التاريخ الإسلامي', keywords: ['تاريخ', 'الخلفاء', 'الدولة الأموية', 'الدولة العباسية'] },
			{ name: 'التراجم والطبقات', subName: 'التراجم والطبقات', keywords: ['تراجم', 'طبقات', 'أعلام'] }
		]
	},
	{
		key: 'adab_tarbiyah',
		mainName: 'التزكية والأخلاق والآداب',
		subName: 'آداب طلب العلم',
		secondaryName: 'طلب العلم',
		keywords: ['أدب', 'آداب', 'أخلاق', 'تزكية', 'زهد', 'رقائق', 'تربية', 'طلب العلم', 'طالب العلم', 'العلماء', 'نصائح', 'وصايا', 'تعليم', 'تعلم'],
		mainHints: ['تزكية', 'أخلاق', 'آداب', 'تربية', 'رقائق', 'زهد'],
		subHints: ['آداب طلب العلم', 'طلب العلم', 'الأخلاق', 'التربية', 'الرقائق'],
		conflictHints: ['فقه', 'أصول الفقه', 'تاريخ', 'عقيدة', 'حديث', 'تفسير', 'نحو'],
		topics: [
			{ name: 'طلب العلم', subName: 'آداب طلب العلم', keywords: ['طلب العلم', 'طالب العلم', 'العلماء', 'نصائح', 'وصايا', 'تعليم', 'تعلم', 'التعليمات العلمية'] },
			{ name: 'الأخلاق والآداب', subName: 'الأخلاق والآداب', keywords: ['أخلاق', 'آداب', 'أدب'] },
			{ name: 'التزكية والرقائق', subName: 'التزكية والرقائق', keywords: ['تزكية', 'زهد', 'رقائق', 'محاسبة النفس'] }
		]
	},
	{
		key: 'arabic',
		mainName: 'اللغة العربية وعلومها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'اللغة العربية',
		keywords: ['لغة عربية', 'نحو', 'صرف', 'بلاغة', 'إعراب', 'أدب عربي', 'شعر', 'عروض', 'معاجم'],
		mainHints: ['لغة عربية', 'اللغة العربية', 'النحو', 'الأدب العربي'],
		subHints: ['نحو', 'صرف', 'بلاغة', 'أدب عربي', 'معاجم'],
		conflictHints: ['فقه', 'عقيدة', 'تاريخ', 'حديث', 'تفسير'],
		topics: [
			{ name: 'النحو والصرف', subName: 'النحو والصرف', keywords: ['نحو', 'صرف', 'إعراب'] },
			{ name: 'البلاغة', subName: 'البلاغة', keywords: ['بلاغة', 'بيان', 'معاني', 'بديع'] },
			{ name: 'الأدب العربي', subName: 'الأدب العربي', keywords: ['أدب عربي', 'شعر', 'عروض'] }
		]
	}
]);

function pickDomainProfile(bookMeta) {
	const hay = bookText(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const profile of DOMAIN_PROFILES) {
		const score = keywordScore(hay, profile.keywords, { phrase: 5, token: 1.5 });
		if (score > bestScore) {
			bestScore = score;
			best = profile;
		}
	}
	if (!best || bestScore < 3) return null;
	return { profile: best, score: bestScore };
}

function pickTopic(profile, bookMeta) {
	const hay = bookText(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const topic of profile.topics || []) {
		const score = keywordScore(hay, topic.keywords || [topic.name], { phrase: 6, token: 2 });
		if (score > bestScore) {
			bestScore = score;
			best = topic;
		}
	}
	if (best && bestScore >= 3) {
		return {
			name: best.name,
			subName: best.subName || profile.subName,
			keywords: best.keywords || [best.name],
			score: bestScore
		};
	}
	return {
		name: profile.secondaryName,
		subName: profile.subName,
		keywords: [profile.secondaryName, profile.subName],
		score: 0
	};
}

function sectionBookScore(name, bookMeta) {
	const n = normalizeArabic(name);
	const hay = bookText(bookMeta);
	if (!n || !hay) return 0;
	const sectionTokens = n.split(' ').filter((w) => w.length >= 3);
	const hayTokens = tokensOf(hay);
	let score = 0;
	if (hay.includes(n) && n.length >= 4) score += 6;
	for (const w of sectionTokens) {
		if (hayTokens.has(w)) score += 1.5;
	}
	return score;
}

function conflictPenalty(pathText, profile) {
	const text = normalizeArabic(pathText);
	if (!text) return 0;
	let penalty = 0;
	for (const other of DOMAIN_PROFILES) {
		if (other.key === profile.key) continue;
		const score = keywordScore(text, other.mainHints || other.keywords, { phrase: 6, token: 1 });
		if (score >= 6) penalty += 18;
	}
	const explicit = keywordScore(text, profile.conflictHints || [], { phrase: 6, token: 1 });
	if (explicit >= 6) penalty += 18;
	return penalty;
}

function scoreMain(main, profile, bookMeta) {
	const text = main?.name || '';
	return (
		keywordScore(text, profile.mainHints, { phrase: 8, token: 2 }) +
		keywordScore(text, profile.keywords, { phrase: 2, token: 0.5 }) +
		sectionBookScore(text, bookMeta) -
		conflictPenalty(text, profile)
	);
}

function scoreSub(sub, profile, topic, bookMeta) {
	const text = sub?.name || '';
	return (
		keywordScore(text, profile.subHints, { phrase: 9, token: 2 }) +
		keywordScore(text, topic.keywords, { phrase: 7, token: 2 }) +
		keywordScore(text, [topic.subName, topic.name], { phrase: 7, token: 1.5 }) +
		sectionBookScore(text, bookMeta) * 1.2 -
		conflictPenalty(text, profile)
	);
}

function scoreSecondary(sec, profile, topic, bookMeta) {
	const text = sec?.name || '';
	return (
		keywordScore(text, [topic.name, ...(topic.keywords || [])], { phrase: 10, token: 2 }) +
		keywordScore(text, profile.keywords, { phrase: 2, token: 0.5 }) +
		sectionBookScore(text, bookMeta) * 1.5 -
		conflictPenalty(text, profile)
	);
}

function bestExistingForProfile(sections, profile, topic, bookMeta) {
	let bestMain = null;
	let bestMainScore = Number.NEGATIVE_INFINITY;
	let bestSub = null;
	let bestSubScore = Number.NEGATIVE_INFINITY;
	let bestSecondary = null;
	let bestSecondaryScore = Number.NEGATIVE_INFINITY;

	for (const main of sections.tree || []) {
		const mainScore = scoreMain(main, profile, bookMeta);
		if (mainScore > bestMainScore) {
			bestMainScore = mainScore;
			bestMain = main;
		}
		for (const sub of main.children || []) {
			const subScore = mainScore * 0.35 + scoreSub(sub, profile, topic, bookMeta);
			if (subScore > bestSubScore) {
				bestSubScore = subScore;
				bestSub = { ...sub, main };
			}
			for (const sec of sub.children || []) {
				const secScore = subScore * 0.35 + scoreSecondary(sec, profile, topic, bookMeta);
				if (secScore > bestSecondaryScore) {
					bestSecondaryScore = secScore;
					bestSecondary = { ...sec, sub, main };
				}
			}
		}
	}

	return {
		main: bestMain,
		mainScore: bestMainScore,
		sub: bestSub,
		subScore: bestSubScore,
		secondary: bestSecondary,
		secondaryScore: bestSecondaryScore
	};
}

function confidenceFromScore(score, base = 0.45) {
	if (!Number.isFinite(score)) return base;
	return Math.max(base, Math.min(0.94, base + score / 55));
}

function classifyWithProfile(sections, bookMeta, picked) {
	const { profile, score: domainScore } = picked;
	const topic = pickTopic(profile, bookMeta);
	const best = bestExistingForProfile(sections, profile, topic, bookMeta);
	const newSubName = cleanSectionName(topic.subName || profile.subName, profile.subName);
	const newSecondaryName = cleanSectionName(topic.name || deriveSecondaryName(bookMeta), profile.secondaryName);

	if (best.secondary && best.secondaryScore >= 8) {
		return {
			kind: 'existing',
			mainId: String(best.secondary.main.id),
			subId: String(best.secondary.sub.id),
			secondaryId: String(best.secondary.id),
			confidence: confidenceFromScore(best.secondaryScore + domainScore),
			reasoning: `مطابقة مجال "${profile.mainName}" مع قسم ثانوي قائم "${best.secondary.name}".`,
			method: 'domain_heuristic'
		};
	}

	if (best.sub && best.subScore >= 7) {
		return {
			kind: 'create_secondary',
			mainId: String(best.sub.main.id),
			subId: String(best.sub.id),
			secondaryId: null,
			newSecondaryName,
			confidence: confidenceFromScore(best.subScore + domainScore, 0.5),
			reasoning: `وُجد القسم الفرعي المناسب "${best.sub.name}" وسينشأ تحته قسم ثانوي "${newSecondaryName}".`,
			method: 'domain_heuristic'
		};
	}

	if (best.main && best.mainScore >= 5) {
		return {
			kind: 'create_sub',
			mainId: String(best.main.id),
			subId: null,
			secondaryId: null,
			newSubName,
			newSecondaryName,
			confidence: confidenceFromScore(best.mainScore + domainScore, 0.48),
			reasoning: `وُجد القسم الرئيسي المناسب "${best.main.name}" وسينشأ مسار فرعي/ثانوي خاص بالموضوع.`,
			method: 'domain_heuristic'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: profile.mainName,
		newSubName,
		newSecondaryName,
		confidence: confidenceFromScore(domainScore, 0.42),
		reasoning: `لم يوجد مسار آمن لمجال "${profile.mainName}"، لذلك سينشأ المسار الثلاثي كاملاً.`,
		method: 'domain_heuristic'
	};
}

function classifyGeneric(sections, bookMeta) {
	let bestMain = null;
	let bestMainScore = Number.NEGATIVE_INFINITY;
	let bestSub = null;
	let bestSubScore = Number.NEGATIVE_INFINITY;
	let bestSecondary = null;
	let bestSecondaryScore = Number.NEGATIVE_INFINITY;

	for (const main of sections.tree || []) {
		const mainScore = sectionBookScore(main.name, bookMeta);
		if (mainScore > bestMainScore) {
			bestMainScore = mainScore;
			bestMain = main;
		}
		for (const sub of main.children || []) {
			const subScore = mainScore * 0.3 + sectionBookScore(sub.name, bookMeta) * 1.3;
			if (subScore > bestSubScore) {
				bestSubScore = subScore;
				bestSub = { ...sub, main };
			}
			for (const sec of sub.children || []) {
				const secScore = subScore * 0.3 + sectionBookScore(sec.name, bookMeta) * 1.6;
				if (secScore > bestSecondaryScore) {
					bestSecondaryScore = secScore;
					bestSecondary = { ...sec, sub, main };
				}
			}
		}
	}

	if (bestSecondary && bestSecondaryScore >= 6) {
		return {
			kind: 'existing',
			mainId: String(bestSecondary.main.id),
			subId: String(bestSecondary.sub.id),
			secondaryId: String(bestSecondary.id),
			confidence: confidenceFromScore(bestSecondaryScore, 0.35),
			reasoning: `مطابقة نصية مع قسم ثانوي قائم "${bestSecondary.name}".`,
			method: 'generic_heuristic'
		};
	}

	const newSecondaryName = deriveSecondaryName(bookMeta);
	if (bestSub && bestSubScore >= 4) {
		return {
			kind: 'create_secondary',
			mainId: String(bestSub.main.id),
			subId: String(bestSub.id),
			secondaryId: null,
			newSecondaryName,
			confidence: confidenceFromScore(bestSubScore, 0.32),
			reasoning: `مطابقة عامة مع القسم الفرعي "${bestSub.name}"، وسيُنشأ قسم ثانوي للكتاب.`,
			method: 'generic_heuristic'
		};
	}

	if (bestMain && bestMainScore >= 2) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.id),
			subId: null,
			secondaryId: null,
			newSubName: 'موضوعات عامة',
			newSecondaryName,
			confidence: confidenceFromScore(bestMainScore, 0.3),
			reasoning: `مطابقة عامة مع القسم الرئيسي "${bestMain.name}"، وسيُنشأ مسار فرعي/ثانوي.`,
			method: 'generic_heuristic'
		};
	}

	return {
		kind: 'create_main',
		mainId: null,
		subId: null,
		secondaryId: null,
		newMainName: 'كتب إسلامية',
		newSubName: 'موضوعات عامة',
		newSecondaryName,
		confidence: 0.25,
		reasoning: 'لم تُعثَر مطابقة آمنة؛ سينشأ مسار ثلاثي عام بدلاً من خلط الكتاب في قسم غير مناسب.',
		method: 'generic_heuristic'
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
	const suggested = {
		mainId: decision.mainId || '',
		subId: decision.subId || '',
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method,
		kind: decision.kind,
		newMainName: decision.newMainName || '',
		newSubName: decision.newSubName || '',
		newSecondaryName: decision.newSecondaryName || ''
	};
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{
						mainId: decision.mainId,
						subId: decision.subId,
						secondaryId: decision.secondaryId
					},
					sections.index
				)
			: { valid: false, reason: 'requires_section_creation' };
	return {
		suggested,
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ مع ضمان وجود قسم ثانوي دائماً.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const picked = pickDomainProfile(bookMeta);
	if (picked) {
		return classifyWithProfile(sections, bookMeta, picked);
	}
	return classifyGeneric(sections, bookMeta);
}
