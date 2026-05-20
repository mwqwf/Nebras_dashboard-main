/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary]
 *
 * يعتمد التصنيف على قاموس مجالات شرعيّة/علمية محافظ، ثم مطابقة نصية داخل
 * المجال نفسه. الهدف ألا تختلط كتب الآداب بالفقه، ولا التاريخ بالعقيدة.
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
		secondaryName: 'دراسات قرآنية عامة',
		keywords: [
			'قرآن',
			'القرآن',
			'تفسير',
			'علوم القرآن',
			'تجويد',
			'قراءات',
			'سورة',
			'آيات',
			'أسباب النزول',
			'مصحف'
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف وعلومه',
		subName: 'مصطلح الحديث وشروحه',
		secondaryName: 'دراسات حديثية عامة',
		keywords: [
			'حديث',
			'الأحاديث',
			'السنة',
			'مصطلح الحديث',
			'صحيح البخاري',
			'صحيح مسلم',
			'سنن',
			'رواة',
			'إسناد',
			'شرح الحديث'
		]
	},
	{
		id: 'aqidah',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'مسائل عقدية عامة',
		keywords: [
			'عقيدة',
			'العقيدة',
			'توحيد',
			'الإيمان',
			'أسماء الله',
			'الصفات',
			'القدر',
			'الشرك',
			'البدع',
			'الفرق',
			'الرد على'
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل فقهية عامة',
		keywords: [
			'فقه',
			'الفقه',
			'أصول الفقه',
			'فتاوى',
			'أحكام',
			'الصلاة',
			'الزكاة',
			'الصيام',
			'الحج',
			'الطهارة',
			'المعاملات',
			'النكاح',
			'البيوع',
			'المواريث'
		]
	},
	{
		id: 'seerah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة النبوية والتاريخ',
		secondaryName: 'دراسات تاريخية عامة',
		keywords: [
			'سيرة',
			'السيرة',
			'النبوية',
			'تاريخ',
			'التاريخ',
			'تراجم',
			'طبقات',
			'أعلام',
			'الخلفاء',
			'الغزوات',
			'الفتوح',
			'حضارة'
		]
	},
	{
		id: 'adab_tazkiyah',
		mainName: 'الآداب والتزكية والأخلاق',
		subName: 'الآداب الشرعية والأخلاق',
		secondaryName: 'آداب وأخلاق عامة',
		keywords: [
			'أدب',
			'آداب',
			'الآداب',
			'أخلاق',
			'الأخلاق',
			'تزكية',
			'رقائق',
			'زهد',
			'مواعظ',
			'سلوك',
			'فضائل'
		]
	},
	{
		id: 'education_dawah',
		mainName: 'التعليم والدعوة',
		subName: 'آداب طلب العلم والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		keywords: [
			'تعليم',
			'التعليم',
			'تعليمات',
			'تعلم',
			'تعلّم',
			'طلب العلم',
			'طالب العلم',
			'المعلم',
			'المتعلم',
			'علمية',
			'نصائح',
			'وصايا',
			'إرشاد',
			'دعوة',
			'الدعوة'
		]
	},
	{
		id: 'arabic_language',
		mainName: 'اللغة العربية وعلومها',
		subName: 'النحو والصرف والبلاغة',
		secondaryName: 'دراسات لغوية عامة',
		keywords: [
			'لغة عربية',
			'اللغة العربية',
			'نحو',
			'صرف',
			'بلاغة',
			'إعراب',
			'معجم',
			'أدب عربي',
			'شعر',
			'قواعد اللغة'
		]
	},
	{
		id: 'general_islamic',
		mainName: 'كتب إسلامية عامة',
		subName: 'موضوعات إسلامية عامة',
		secondaryName: 'كتب عامة',
		keywords: ['إسلامية', 'اسلامية', 'دين', 'الدين', 'شرعي', 'شرعية']
	}
]);

const DOMAIN_BY_ID = new Map(DOMAIN_RULES.map((rule) => [rule.id, rule]));

const TOPIC_RULES = Object.freeze([
	{
		domains: ['education_dawah'],
		name: 'النصائح والتوجيهات العلمية',
		keywords: ['نصائح', 'وصايا', 'تعليمات', 'علمية']
	},
	{
		domains: ['education_dawah'],
		name: 'آداب طلب العلم',
		keywords: ['طلب العلم', 'طالب العلم', 'المتعلم', 'المعلم']
	},
	{ domains: ['fiqh'], name: 'فقه الطهارة', keywords: ['طهارة', 'وضوء', 'غسل', 'تيمم'] },
	{ domains: ['fiqh'], name: 'فقه الصلاة', keywords: ['صلاة', 'الصلاة', 'مساجد', 'أذان'] },
	{ domains: ['fiqh'], name: 'فقه الزكاة', keywords: ['زكاة', 'الزكاة', 'صدقات'] },
	{ domains: ['fiqh'], name: 'فقه الصيام', keywords: ['صيام', 'الصيام', 'رمضان'] },
	{ domains: ['fiqh'], name: 'فقه الحج والعمرة', keywords: ['حج', 'الحج', 'عمرة', 'العمرة'] },
	{ domains: ['fiqh'], name: 'فقه المعاملات', keywords: ['معاملات', 'بيوع', 'ربا', 'شركة', 'إجارة'] },
	{ domains: ['fiqh'], name: 'فقه الأسرة', keywords: ['نكاح', 'زواج', 'طلاق', 'أسرة', 'المواريث', 'ميراث'] },
	{ domains: ['aqidah'], name: 'التوحيد', keywords: ['توحيد', 'الشرك', 'لا إله إلا الله'] },
	{ domains: ['aqidah'], name: 'الأسماء والصفات', keywords: ['أسماء الله', 'الصفات', 'الأسماء والصفات'] },
	{ domains: ['aqidah'], name: 'الإيمان والقدر', keywords: ['إيمان', 'الإيمان', 'قدر', 'القدر'] },
	{ domains: ['quran'], name: 'التفسير', keywords: ['تفسير', 'المفسر', 'معاني القرآن'] },
	{ domains: ['quran'], name: 'علوم القرآن', keywords: ['علوم القرآن', 'أسباب النزول', 'مكي ومدني'] },
	{ domains: ['quran'], name: 'التجويد والقراءات', keywords: ['تجويد', 'قراءات', 'رواية حفص'] },
	{ domains: ['hadith'], name: 'مصطلح الحديث', keywords: ['مصطلح الحديث', 'إسناد', 'رواة', 'جرح وتعديل'] },
	{ domains: ['hadith'], name: 'شروح الحديث', keywords: ['شرح الحديث', 'شرح صحيح', 'فتح الباري', 'شرح مسلم'] },
	{ domains: ['seerah_history'], name: 'السيرة النبوية', keywords: ['سيرة', 'السيرة', 'النبوية', 'غزوات'] },
	{ domains: ['seerah_history'], name: 'التاريخ الإسلامي', keywords: ['تاريخ', 'الخلفاء', 'الفتوح', 'الدولة'] },
	{ domains: ['seerah_history'], name: 'التراجم والطبقات', keywords: ['تراجم', 'طبقات', 'أعلام', 'سير أعلام'] },
	{ domains: ['adab_tazkiyah'], name: 'الأخلاق والآداب', keywords: ['أخلاق', 'الأخلاق', 'آداب', 'أدب'] },
	{ domains: ['adab_tazkiyah'], name: 'الزهد والرقائق', keywords: ['زهد', 'رقائق', 'مواعظ', 'قلوب'] },
	{ domains: ['arabic_language'], name: 'النحو والصرف', keywords: ['نحو', 'صرف', 'إعراب'] },
	{ domains: ['arabic_language'], name: 'البلاغة والأدب', keywords: ['بلاغة', 'أدب عربي', 'شعر'] }
]);

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

function scoreKeywordList(haystack, keywords) {
	const tokens = new Set(haystack.split(' ').filter((t) => t.length >= 3));
	let score = 0;
	for (const raw of keywords || []) {
		const kw = normalizeArabic(raw);
		if (!kw) continue;
		if (haystack.includes(kw)) score += kw.includes(' ') ? 4 : 2;
		if (tokens.has(kw)) score += 1;
	}
	return score;
}

function scoreDomain(rule, haystack) {
	return scoreKeywordList(haystack, rule?.keywords || []);
}

function detectBookDomain(bookMeta) {
	const haystack = bookHaystack(bookMeta);
	const ranked = DOMAIN_RULES.map((rule) => ({
		rule,
		score: scoreDomain(rule, haystack)
	})).sort((a, b) => b.score - a.score);
	const top = ranked[0];
	if (!top || top.score < 2) {
		return { rule: DOMAIN_BY_ID.get('general_islamic'), score: 0, haystack };
	}
	return { rule: top.rule, score: top.score, haystack };
}

function detectSectionDomain(name) {
	const haystack = normalizeArabic(name);
	const ranked = DOMAIN_RULES.map((rule) => ({
		rule,
		score: scoreDomain(rule, haystack)
	})).sort((a, b) => b.score - a.score);
	const top = ranked[0];
	if (!top || top.score < 2 || top.rule.id === 'general_islamic') return null;
	return top;
}

function isCompatibleWithDomain(sectionName, targetRule) {
	if (!targetRule || targetRule.id === 'general_islamic') return true;
	const sectionDomain = detectSectionDomain(sectionName);
	return !sectionDomain || sectionDomain.rule.id === targetRule.id;
}

function lexicalScore(name, haystack) {
	const tokens = new Set(haystack.split(' ').filter((t) => t.length >= 3));
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (haystack.includes(n) && n.length >= 4) score += 3;
	return score;
}

function scoreNodeForDomain(node, domainRule, haystack) {
	if (!node?.name || !isCompatibleWithDomain(node.name, domainRule)) return -1;
	return scoreDomain(domainRule, normalizeArabic(node.name)) * 4 + lexicalScore(node.name, haystack);
}

function bestByScore(items, scorer, minScore) {
	let best = null;
	let bestScore = -1;
	for (const item of items || []) {
		const score = scorer(item);
		if (score > bestScore) {
			best = item;
			bestScore = score;
		}
	}
	if (!best || bestScore < minScore) return null;
	return { item: best, score: bestScore };
}

function findMainCandidate(tree, domainRule, haystack) {
	return bestByScore(
		tree,
		(main) => {
			const own = scoreNodeForDomain(main, domainRule, haystack);
			const childScore = Math.max(
				0,
				...(main.children || []).map((sub) => scoreNodeForDomain(sub, domainRule, haystack))
			);
			return Math.max(own, childScore);
		},
		domainRule.id === 'general_islamic' ? 1 : 2
	);
}

function findSubCandidate(main, domainRule, haystack, proposedSubName) {
	const proposedHaystack = `${haystack} ${normalizeArabic(proposedSubName)}`;
	return bestByScore(
		main?.children || [],
		(sub) => scoreNodeForDomain(sub, domainRule, proposedHaystack),
		domainRule.id === 'general_islamic' ? 1 : 2
	);
}

function findSecondaryCandidate(sub, domainRule, bookMeta, proposedSecondaryName) {
	const haystack = `${haystackForReuse(bookMeta)} ${normalizeArabic(proposedSecondaryName)}`;
	return bestByScore(
		sub?.children || [],
		(sec) => {
			if (!isCompatibleWithDomain(sec.name, domainRule)) return -1;
			return (
				scoreSecondaryForReuse(sec, bookMeta, proposedSecondaryName) +
				scoreDomain(domainRule, normalizeArabic(sec.name)) * 2 +
				lexicalScore(sec.name, haystack)
			);
		},
		6
	);
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

function deriveSubName(rule, bookMeta) {
	const haystack = bookHaystack(bookMeta);
	if (rule.id === 'fiqh') {
		if (scoreKeywordList(haystack, ['أصول الفقه', 'القواعد الفقهية']) >= 2) return 'أصول الفقه وقواعده';
		return 'الفقه الإسلامي';
	}
	if (rule.id === 'seerah_history') {
		if (scoreKeywordList(haystack, ['سيرة', 'السيرة', 'النبوية', 'غزوات']) >= 2) return 'السيرة النبوية';
		if (scoreKeywordList(haystack, ['تراجم', 'طبقات', 'أعلام']) >= 2) return 'التراجم والطبقات';
		return 'التاريخ الإسلامي';
	}
	return rule.subName;
}

function cleanSectionName(name) {
	return String(name || '')
		.replace(/\s*\|\s*مكتبة نور.*$/u, '')
		.replace(/\b(?:pdf|PDF)\b/g, '')
		.replace(/^(?:تحميل|تنزيل)\s+(?:كتاب\s+)?/u, '')
		.replace(/^كتاب\s+/u, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

function deriveSecondaryName(rule, bookMeta) {
	const haystack = bookHaystack(bookMeta);
	for (const topic of TOPIC_RULES) {
		if (topic.domains && !topic.domains.includes(rule.id)) continue;
		if (scoreKeywordList(haystack, topic.keywords) >= 2) return topic.name;
	}

	const stem = cleanSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	if (stem.length >= 4 && normalizeArabic(stem) !== normalizeArabic(rule.subName)) {
		return stem;
	}
	return rule.secondaryName;
}

/**
 * Heuristic fallback — يختار مساراً موجوداً فقط عندما تكون المطابقة معقولة.
 */
function classifyHeuristic({ tree }, bookMeta) {
	const { rule, score, haystack } = detectBookDomain(bookMeta);
	const proposedSubName = deriveSubName(rule, bookMeta);
	const proposedSecondaryName = deriveSecondaryName(rule, bookMeta);
	const main = findMainCandidate(tree, rule, haystack);
	if (!main) return null;
	const sub = findSubCandidate(main.item, rule, haystack, proposedSubName);
	if (!sub) return null;
	const secondary = findSecondaryCandidate(sub.item, rule, bookMeta, proposedSecondaryName);
	if (!secondary) return null;

	return {
		mainId: main.item.id,
		subId: sub.item.id,
		secondaryId: secondary.item.id,
		confidence: Math.min(0.55 + score * 0.04 + main.score * 0.03 + sub.score * 0.03, 0.92),
		reasoning: `مطابقة محلية ضمن مجال: ${rule.mainName}`,
		method: 'domain-heuristic',
		domainId: rule.id
	};
}

function buildAutonomousDecision(sections, bookMeta) {
	const { rule, score, haystack } = detectBookDomain(bookMeta);
	const proposedSubName = deriveSubName(rule, bookMeta);
	const proposedSecondaryName = deriveSecondaryName(rule, bookMeta);
	const confidence = Math.min(0.5 + score * 0.05, 0.9);
	const reasoning = `تصنيف محافظ حسب المجال العلمي: ${rule.mainName}`;

	if (!sections.tree || sections.tree.length === 0) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: proposedSubName,
			newSecondaryName: proposedSecondaryName,
			confidence,
			reasoning: `${reasoning} — لا توجد شجرة أقسام حالية.`,
			method: 'domain-heuristic',
			domainId: rule.id
		};
	}

	const main = findMainCandidate(sections.tree, rule, haystack);
	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: proposedSubName,
			newSecondaryName: proposedSecondaryName,
			confidence,
			reasoning: `${reasoning} — لا يوجد قسم رئيسي مناسب.`,
			method: 'domain-heuristic',
			domainId: rule.id
		};
	}

	const sub = findSubCandidate(main.item, rule, haystack, proposedSubName);
	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.item.id),
			subId: null,
			secondaryId: null,
			newSubName: proposedSubName,
			newSecondaryName: proposedSecondaryName,
			confidence,
			reasoning: `${reasoning} — لا يوجد قسم فرعي مناسب تحت "${main.item.name}".`,
			method: 'domain-heuristic',
			domainId: rule.id
		};
	}

	const secondary = findSecondaryCandidate(sub.item, rule, bookMeta, proposedSecondaryName);
	if (!secondary) {
		return {
			kind: 'create_secondary',
			mainId: String(main.item.id),
			subId: String(sub.item.id),
			secondaryId: null,
			newSecondaryName: proposedSecondaryName,
			confidence,
			reasoning: `${reasoning} — لا يوجد قسم ثانوي مناسب تحت "${sub.item.name}".`,
			method: 'domain-heuristic',
			domainId: rule.id
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.item.id),
		subId: String(sub.item.id),
		secondaryId: String(secondary.item.id),
		confidence: Math.min(confidence + 0.08, 0.95),
		reasoning,
		method: 'domain-heuristic',
		domainId: rule.id
	};
}

/**
 * الواجهة الرئيسيّة — تُصنِّف كتاباً وتعيد المسار الذهبي + بدائل.
 */
export async function classifyBookIntoHierarchy(sections, bookMeta) {
	if (!sections.tree || sections.tree.length === 0) {
		const proposal = buildAutonomousDecision(sections, bookMeta);
		return {
			suggested: {
				mainId: '',
				subId: '',
				secondaryId: '',
				confidence: proposal.confidence,
				reasoning: proposal.reasoning,
				method: proposal.method
			},
			alternatives: [],
			validation: { valid: false, reason: 'empty_sections_tree' },
			proposal
		};
	}

	const sug = classifyHeuristic(sections, bookMeta);
	const validation = sug
		? validateHierarchyPath(
				{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
				sections.index
			)
		: { valid: false, reason: 'heuristic_failed' };
	const proposal = validation.valid ? { kind: 'existing', ...sug } : buildAutonomousDecision(sections, bookMeta);
	return {
		suggested: sug || {
			mainId: sections.tree[0].id,
			subId: sections.tree[0].children[0]?.id || '',
			secondaryId: sections.tree[0].children[0]?.children[0]?.id || '',
			confidence: 0.1,
			reasoning: 'لم تُعثَر مطابقة كافية. راجع proposal لإنشاء قسم مناسب.',
			method: 'domain-heuristic'
		},
		alternatives: [],
		validation,
		proposal
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	return buildAutonomousDecision(sections, bookMeta);
}
