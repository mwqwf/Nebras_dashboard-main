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

const DOMAIN_RULES = Object.freeze([
	{
		id: 'quran',
		mainName: 'القرآن الكريم وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب القرآن الكريم',
		keywords: [
			'قرآن',
			'القرآن',
			'تفسير',
			'مفسر',
			'علوم القرآن',
			'أسباب النزول',
			'الناسخ والمنسوخ',
			'تجويد',
			'قراءات',
			'مصحف'
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'كتب الحديث',
		secondaryName: 'مصطلح الحديث وشروحه',
		keywords: [
			'حديث',
			'أحاديث',
			'السنة',
			'سنن',
			'مسند',
			'صحيح البخاري',
			'صحيح مسلم',
			'موطأ',
			'مصطلح الحديث',
			'جرح وتعديل',
			'إسناد',
			'رواة'
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي وأصوله',
		subName: 'كتب الفقه',
		secondaryName: 'المسائل الفقهية',
		keywords: [
			'فقه',
			'أصول الفقه',
			'فتوى',
			'فتاوى',
			'أحكام',
			'عبادات',
			'معاملات',
			'صلاة',
			'زكاة',
			'صيام',
			'حج',
			'نكاح',
			'طلاق',
			'مواريث',
			'فرائض',
			'مذهب',
			'حلال',
			'حرام'
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'كتب العقيدة والتوحيد',
		secondaryName: 'مسائل العقيدة',
		keywords: [
			'عقيدة',
			'توحيد',
			'إيمان',
			'أسماء وصفات',
			'القدر',
			'أهل السنة',
			'السلف',
			'الشرك',
			'الكفر',
			'الفرق',
			'الملل والنحل'
		]
	},
	{
		id: 'seerah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة والتراجم',
		secondaryName: 'التراجم والسير',
		keywords: [
			'سيرة',
			'السيرة النبوية',
			'مغازي',
			'شمائل',
			'تاريخ',
			'خلافة',
			'صحابة',
			'تابعين',
			'تراجم',
			'طبقات',
			'أعلام',
			'سير أعلام',
			'أنساب'
		]
	},
	{
		id: 'tazkiyah_adab',
		mainName: 'التزكية والأخلاق',
		subName: 'الآداب والأخلاق',
		secondaryName: 'المواعظ والوصايا',
		keywords: [
			'تزكية',
			'أخلاق',
			'آداب',
			'زهد',
			'رقائق',
			'مواعظ',
			'وصايا',
			'حكم',
			'نصائح',
			'سلوك',
			'تهذيب'
		]
	},
	{
		id: 'dawah_education',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'آداب التعليم والتعلم',
		keywords: [
			'دعوة',
			'تربية',
			'تعليم',
			'تعلم',
			'تعليمات',
			'منهجية',
			'إرشاد',
			'توجيه',
			'طالب العلم',
			'طلب العلم',
			'آداب طالب العلم',
			'النصائح العلمية',
			'التعليمات العلمية'
		]
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية وآدابها',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو والبلاغة والأدب',
		keywords: [
			'لغة عربية',
			'العربية',
			'نحو',
			'صرف',
			'بلاغة',
			'عروض',
			'شعر',
			'أدب عربي',
			'معجم',
			'قاموس'
		]
	}
]);

const GENERIC_SECTION_NAMES = Object.freeze([
	'المكتبة',
	'مكتبة',
	'كتب',
	'كتب إسلامية',
	'الكتب الإسلامية',
	'علوم إسلامية',
	'دروس إسلامية',
	'كتب متنوعة',
	'متنوعات'
]);

const GENERIC_NORMALIZED = new Set(GENERIC_SECTION_NAMES.map(normalizeArabic));

function tokensOf(s, minLen = 3) {
	return new Set(normalizeArabic(s).split(' ').filter((t) => t.length >= minLen));
}

function haystackFromBook(bookMeta) {
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

function scorePlainName(name, haystack, tokens) {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	return score;
}

function scoreDomain(rule, haystack) {
	let score = 0;
	for (const kw of rule.keywords) {
		const n = normalizeArabic(kw);
		if (!n) continue;
		if (haystack.includes(n)) {
			score += n.includes(' ') ? 5 : 3;
		}
	}
	return score;
}

function detectDomain(haystack, minScore = 3) {
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		const score = scoreDomain(rule, haystack);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { rule: best, score: bestScore };
}

function domainForSectionName(name) {
	const n = normalizeArabic(name);
	if (!n || GENERIC_NORMALIZED.has(n)) return null;
	return detectDomain(n, 3)?.rule || null;
}

function isGenericSectionName(name) {
	const n = normalizeArabic(name);
	if (!n) return false;
	if (GENERIC_NORMALIZED.has(n)) return true;
	return n.includes('كتب اسلاميه') || n.includes('علوم اسلاميه');
}

function scoreNodeForDomain(node, domainRule, haystack, tokens, level) {
	const base = scorePlainName(node?.name, haystack, tokens);
	if (!domainRule) return base;

	const nodeDomain = domainForSectionName(node?.name || '');
	if (nodeDomain?.id === domainRule.id) return base + (level === 'main' ? 10 : 8);

	// لا نخلط المجالات الواضحة: فقه لا يدخل العقيدة، والتاريخ لا يدخل الحديث...
	if (nodeDomain && nodeDomain.id !== domainRule.id) return -100;

	if (isGenericSectionName(node?.name || '')) return base + (level === 'main' ? 3 : 1);
	return base;
}

function pickBestNode(nodes, domainRule, haystack, tokens, level, minScore) {
	let best = null;
	let bestScore = -100;
	for (const node of nodes || []) {
		const score = scoreNodeForDomain(node, domainRule, haystack, tokens, level);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	if (!best || bestScore < minScore) return { node: null, score: bestScore };
	return { node: best, score: bestScore };
}

function sanitizeSectionName(raw, fallback) {
	let s = String(raw || '').trim();
	if (!s) return fallback;
	s = s.replace(/\s*\|\s*مكتبة نور.*$/u, '');
	s = s.replace(/^(?:تحميل|قراءة|كتاب)\s+/u, '');
	s = s.split(/[*;|/\\\n\r\t]+/u)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/u, '').replace(/[\s,،.\-–—_]+$/u, '').trim();
	if (!s || /^pdf$/iu.test(s) || normalizeArabic(s) === 'مكتبه نور') return fallback;
	if (s.length > 48) s = s.slice(0, 48).trim();
	return s || fallback;
}

function pickSecondaryName(domainRule, bookMeta, haystack) {
	const hints = normalizeArabic((bookMeta?.categoryHints || []).join(' '));
	const source = `${haystack} ${hints}`;

	if (domainRule?.id === 'quran') {
		if (source.includes('تجويد') || source.includes('قراءات')) return 'التجويد والقراءات';
		if (source.includes('علوم القران')) return 'علوم القرآن';
		if (source.includes('تفسير')) return 'التفسير';
	}
	if (domainRule?.id === 'hadith') {
		if (source.includes('مصطلح') || source.includes('رواه') || source.includes('اسناد')) return 'مصطلح الحديث وعلومه';
		if (source.includes('شرح')) return 'شروح الحديث';
		return 'كتب الحديث';
	}
	if (domainRule?.id === 'fiqh') {
		if (source.includes('اصول الفقه')) return 'أصول الفقه';
		if (/(صلاه|زكاه|صيام|حج|عبادات)/u.test(source)) return 'العبادات';
		if (/(بيع|معاملات|نكاح|طلاق|مواريث|فرائض)/u.test(source)) return 'المعاملات والأحوال الشخصية';
		return 'المسائل الفقهية';
	}
	if (domainRule?.id === 'aqeedah') {
		if (source.includes('توحيد')) return 'التوحيد';
		if (source.includes('اسماء') || source.includes('صفات')) return 'الأسماء والصفات';
		return 'مسائل العقيدة';
	}
	if (domainRule?.id === 'seerah_history') {
		if (source.includes('سيره') || source.includes('مغازي') || source.includes('شمائل')) return 'السيرة النبوية';
		if (source.includes('تراجم') || source.includes('اعلام') || source.includes('طبقات')) return 'التراجم والسير';
		return 'التاريخ الإسلامي';
	}
	if (domainRule?.id === 'tazkiyah_adab') {
		if (source.includes('نصائح') || source.includes('وصايا')) return 'النصائح والوصايا';
		if (source.includes('زهد') || source.includes('رقائق')) return 'الزهد والرقائق';
		return 'الآداب والأخلاق';
	}
	if (domainRule?.id === 'dawah_education') {
		if (
			source.includes('طلب العلم') ||
			source.includes('طالب العلم') ||
			source.includes('تعليمات علميه') ||
			source.includes('النصائح العلميه')
		) {
			return 'آداب التعليم والتعلم';
		}
		if (source.includes('نصائح') || source.includes('توجيه')) return 'النصائح والتوجيهات العلمية';
		return 'التربية والتعليم';
	}
	if (domainRule?.id === 'arabic_language') {
		if (source.includes('نحو') || source.includes('صرف')) return 'النحو والصرف';
		if (source.includes('بلاغه')) return 'البلاغة';
		if (source.includes('شعر') || source.includes('ادب عربي')) return 'الأدب العربي';
		return 'علوم اللغة العربية';
	}

	return sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''), 'كتب متنوّعة');
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

function makeAutonomousDecision(sections, bookMeta) {
	const haystack = haystackFromBook(bookMeta);
	const tokens = tokensOf(haystack);
	const detected = detectDomain(haystack, 3);
	const domainRule = detected?.rule || null;
	const domainLabel = domainRule?.subName || 'تصنيف عام';

	const mainPick = pickBestNode(
		sections.tree || [],
		domainRule,
		haystack,
		tokens,
		'main',
		domainRule ? 3 : 1
	);
	const secondaryName = pickSecondaryName(domainRule, bookMeta, haystack);

	if (!mainPick.node) {
		const fallback = domainRule || {
			mainName: 'المكتبة الإسلامية',
			subName: 'كتب متنوّعة'
		};
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: fallback.mainName,
			newSubName: fallback.subName,
			newSecondaryName: secondaryName,
			confidence: Math.min(0.35 + (detected?.score || 0) * 0.02, 0.65),
			reasoning: `لم يوجد قسم رئيسي مناسب لمجال "${domainLabel}" — إنشاء مسار ثلاثي جديد.`,
			method: 'heuristic'
		};
	}

	const subPick = pickBestNode(
		mainPick.node.children || [],
		domainRule,
		haystack,
		tokens,
		'sub',
		domainRule ? 4 : 1
	);

	if (!subPick.node) {
		return {
			kind: 'create_sub',
			mainId: String(mainPick.node.id),
			subId: null,
			secondaryId: null,
			newSubName: domainRule?.subName || sanitizeSectionName((bookMeta?.categoryHints || [])[0], 'كتب متنوّعة'),
			newSecondaryName: secondaryName,
			confidence: Math.min(0.45 + Math.max(mainPick.score, 0) * 0.03, 0.75),
			reasoning: `وُجد قسم رئيسي مناسب "${mainPick.node.name}" دون فرع مطابق لمجال "${domainLabel}" — إنشاء فرع وقسم ثانوي.`,
			method: 'heuristic'
		};
	}

	const reused = pickReuseSecondary(sections, String(subPick.node.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 7
	});
	if (reused) {
		return {
			kind: 'existing',
			mainId: String(mainPick.node.id),
			subId: String(subPick.node.id),
			secondaryId: reused.id,
			confidence: Math.min(0.55 + Math.max(mainPick.score, 0) * 0.03 + reused.score * 0.02, 0.92),
			reasoning: `مطابقة ثلاثية قائمة: ${mainPick.node.name} ← ${subPick.node.name} ← ${reused.name}.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(mainPick.node.id),
		subId: String(subPick.node.id),
		secondaryId: null,
		newSecondaryName: secondaryName,
		confidence: Math.min(0.5 + Math.max(mainPick.score, 0) * 0.03 + Math.max(subPick.score, 0) * 0.03, 0.85),
		reasoning: `وُجد main/sub مناسبان (${mainPick.node.name} ← ${subPick.node.name}) لكن لا يوجد قسم ثانوي مناسب — إنشاء "${secondaryName}".`,
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

	const sug = makeAutonomousDecision(sections, bookMeta);
	const validation =
		sug.kind === 'existing'
			? validateHierarchyPath(
					{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
					sections.index
				)
			: { valid: false, reason: 'requires_section_creation' };
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
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}
	return makeAutonomousDecision(sections, bookMeta);
}
