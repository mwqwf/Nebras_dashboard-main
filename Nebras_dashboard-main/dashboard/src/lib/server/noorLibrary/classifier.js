/**
 * classifier.js — تصنيف كتاب من مكتبة نور إلى مساره الصحيح في الهيكلية
 * الذهبيّة [main → sub → secondary].
 *
 * التصنيف هنا محلي بالكامل، لكنّه لا يكتفي بتقاطع كلمات خام: نحدد المجال
 * أولاً (فقه، أدب، تاريخ، عقيدة...) ثم نبحث داخل أقسام ذلك المجال فقط.
 * هذا يمنع خلط كتب الآداب مع الفقه أو التاريخ مع العقيدة عند تشابه كلمة
 * مفردة في العنوان أو الوصف.
 */

import { validateHierarchyPath } from './sectionsTree.js';

// ── Arabic normalization ─────────────────────────────────────────────
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
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

const DOMAIN_RULES = Object.freeze([
	{
		key: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'كتب القرآن والتفسير',
		aliases: ['القرآن', 'القرآن الكريم', 'علوم القرآن', 'التفسير'],
		keywords: ['قرآن', 'القرآن', 'تفسير', 'المفسرون', 'القراءات', 'تجويد', 'مصحف', 'علوم القرآن'],
		secondaryTopics: [
			['تفسير', 'التفسير'],
			['تجويد', 'التجويد'],
			['قراءات', 'القراءات'],
			['علوم القرآن', 'علوم القرآن']
		]
	},
	{
		key: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'كتب الحديث وعلومه',
		secondaryName: 'كتب الحديث العامة',
		aliases: ['الحديث', 'الحديث الشريف', 'علوم الحديث'],
		keywords: ['حديث', 'الأحاديث', 'السنة', 'سنن', 'صحيح', 'مسند', 'رواة', 'إسناد', 'مصطلح الحديث'],
		secondaryTopics: [
			['مصطلح الحديث', 'مصطلح الحديث'],
			['صحيح', 'الصحاح'],
			['سنن', 'السنن'],
			['رواة', 'الرجال والرواة']
		]
	},
	{
		key: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'كتب الفقه العامة',
		aliases: ['الفقه', 'الفقه الإسلامي', 'أصول الفقه', 'فقه'],
		keywords: ['فقه', 'فقهي', 'أصول الفقه', 'فتاوى', 'أحكام', 'عبادات', 'معاملات', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'الطهارة'],
		secondaryTopics: [
			['أصول الفقه', 'أصول الفقه'],
			['الصلاة', 'الصلاة'],
			['الزكاة', 'الزكاة'],
			['الصيام', 'الصيام'],
			['الحج', 'الحج والعمرة'],
			['الطهارة', 'الطهارة'],
			['المعاملات', 'المعاملات'],
			['فتاوى', 'الفتاوى']
		]
	},
	{
		key: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'كتب العقيدة العامة',
		aliases: ['العقيدة', 'التوحيد', 'الإيمان'],
		keywords: ['عقيدة', 'توحيد', 'إيمان', 'الإيمان', 'أسماء الله', 'صفات', 'القدر', 'الفرق', 'المذاهب'],
		secondaryTopics: [
			['توحيد', 'التوحيد'],
			['إيمان', 'الإيمان'],
			['أسماء الله', 'الأسماء والصفات'],
			['صفات', 'الأسماء والصفات'],
			['فرق', 'الفرق والمذاهب']
		]
	},
	{
		key: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'كتب السيرة العامة',
		aliases: ['السيرة', 'السيرة النبوية', 'الشمائل'],
		keywords: ['سيرة', 'النبي', 'الرسول', 'محمد', 'شمائل', 'غزوات', 'الهجرة', 'صحابة', 'الخلفاء'],
		secondaryTopics: [
			['شمائل', 'الشمائل'],
			['غزوات', 'الغزوات'],
			['صحابة', 'الصحابة'],
			['الخلفاء', 'الخلفاء الراشدون']
		]
	},
	{
		key: 'history',
		mainName: 'التاريخ',
		subName: 'التاريخ والتراجم',
		secondaryName: 'كتب التاريخ العامة',
		aliases: ['التاريخ', 'التاريخ الإسلامي', 'التراجم'],
		keywords: ['تاريخ', 'تراجم', 'سير أعلام', 'طبقات', 'بلدان', 'فتوح', 'دول', 'حضارة', 'أحداث'],
		secondaryTopics: [
			['تراجم', 'التراجم'],
			['طبقات', 'الطبقات'],
			['فتوح', 'الفتوح'],
			['بلدان', 'البلدان'],
			['حضارة', 'الحضارة']
		]
	},
	{
		key: 'adab',
		mainName: 'الأدب',
		subName: 'الأدب العربي',
		secondaryName: 'كتب الأدب العامة',
		aliases: ['الأدب', 'الأدب العربي', 'الشعر والنثر'],
		keywords: ['أدب', 'الأدب', 'شعر', 'قصائد', 'ديوان', 'نثر', 'رواية', 'قصة', 'بلاغة', 'نقد أدبي'],
		secondaryTopics: [
			['شعر', 'الشعر'],
			['ديوان', 'الدواوين'],
			['نثر', 'النثر'],
			['رواية', 'الرواية'],
			['قصة', 'القصة'],
			['نقد', 'النقد الأدبي']
		]
	},
	{
		key: 'language',
		mainName: 'اللغة العربية',
		subName: 'النحو واللغة',
		secondaryName: 'كتب اللغة العامة',
		aliases: ['اللغة العربية', 'النحو', 'الصرف'],
		keywords: ['لغة', 'اللغة', 'نحو', 'صرف', 'إعراب', 'معجم', 'قاموس', 'لسان العرب', 'بلاغة'],
		secondaryTopics: [
			['نحو', 'النحو'],
			['صرف', 'الصرف'],
			['إعراب', 'الإعراب'],
			['معجم', 'المعاجم'],
			['بلاغة', 'البلاغة']
		]
	},
	{
		key: 'tazkiyah',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'كتب الأخلاق العامة',
		aliases: ['التزكية', 'الأخلاق', 'الآداب الشرعية'],
		keywords: ['تزكية', 'أخلاق', 'آداب', 'زهد', 'رقائق', 'تربية إيمانية', 'سلوك', 'تهذيب'],
		secondaryTopics: [
			['أخلاق', 'الأخلاق'],
			['زهد', 'الزهد والرقائق'],
			['آداب', 'الآداب الشرعية'],
			['تزكية', 'التزكية']
		]
	},
	{
		key: 'education',
		mainName: 'التربية والتعليم',
		subName: 'التعليم والتعلم',
		secondaryName: 'النصائح التعليمية',
		aliases: ['التربية والتعليم', 'التعليم', 'التعلم'],
		keywords: ['تعليم', 'التعليم', 'تعلم', 'التعلم', 'تربية', 'تدريس', 'معلم', 'طالب', 'نصائح', 'إرشادات', 'تعليمات', 'علمية'],
		secondaryTopics: [
			['نصائح', 'النصائح التعليمية'],
			['تعليمات', 'الإرشادات التعليمية'],
			['تدريس', 'طرائق التدريس'],
			['معلم', 'إعداد المعلم'],
			['طالب', 'إرشاد الطلاب']
		]
	},
	{
		key: 'science',
		mainName: 'العلوم والمعرفة',
		subName: 'العلوم العامة',
		secondaryName: 'كتب العلوم العامة',
		aliases: ['العلوم', 'العلوم والمعرفة', 'المعرفة العامة'],
		keywords: ['علم', 'علوم', 'معرفة', 'ثقافة', 'رياضيات', 'فيزياء', 'كيمياء', 'أحياء', 'طب', 'فلك'],
		secondaryTopics: [
			['رياضيات', 'الرياضيات'],
			['فيزياء', 'الفيزياء'],
			['كيمياء', 'الكيمياء'],
			['أحياء', 'الأحياء'],
			['طب', 'الطب'],
			['فلك', 'الفلك']
		]
	}
]);

function allBookText(bookMeta) {
	return [
		bookMeta?.title,
		bookMeta?.author,
		bookMeta?.description,
		...(bookMeta?.categoryHints || [])
	]
		.filter(Boolean)
		.join(' ');
}

function scoreOf(sectionName, haystack, tokens) {
	const n = normalizeArabic(sectionName);
	if (!n) return 0;
	let score = 0;
	for (const w of n.split(' ')) {
		if (w.length >= 3 && tokens.has(w)) score += 1;
	}
	if (n.length >= 4 && haystack.includes(n)) score += 3;
	return score;
}

function includesNormalized(hay, needle) {
	const n = normalizeArabic(needle);
	return Boolean(n && hay.includes(n));
}

function scoreRuleInText(rule, rawText, weight = 1) {
	const hay = normalizeArabic(rawText);
	if (!hay) return 0;
	let score = 0;
	for (const alias of rule.aliases || []) {
		if (includesNormalized(hay, alias)) score += 3 * weight;
	}
	for (const kw of rule.keywords || []) {
		if (includesNormalized(hay, kw)) score += 2 * weight;
	}
	return score;
}

function inferDomain(bookMeta) {
	const zones = [
		{ text: bookMeta?.title || '', weight: 3 },
		{ text: (bookMeta?.categoryHints || []).join(' '), weight: 4 },
		{ text: bookMeta?.description || '', weight: 1 },
		{ text: bookMeta?.author || '', weight: 0.5 }
	];
	const ranked = DOMAIN_RULES.map((rule) => ({
		rule,
		score: zones.reduce((sum, zone) => sum + scoreRuleInText(rule, zone.text, zone.weight), 0)
	})).sort((a, b) => b.score - a.score);

	const best = ranked[0];
	const second = ranked[1];
	if (!best || best.score < 4) return null;
	if (second && best.score - second.score < 1 && best.score < 10) return null;
	return best.rule;
}

function scoreSectionForRule(name, rule) {
	const text = normalizeArabic(name);
	if (!text || !rule) return 0;
	let score = 0;
	for (const alias of rule.aliases || []) {
		const a = normalizeArabic(alias);
		if (!a) continue;
		if (text === a) score += 8;
		else if (text.includes(a) || a.includes(text)) score += 5;
	}
	for (const kw of rule.keywords || []) {
		const k = normalizeArabic(kw);
		if (k && text.includes(k)) score += 2;
	}
	return score;
}

function dominantDomainForSection(name) {
	const ranked = DOMAIN_RULES.map((rule) => ({
		rule,
		score: scoreSectionForRule(name, rule)
	})).sort((a, b) => b.score - a.score);
	const best = ranked[0];
	return best && best.score >= 4 ? best : null;
}

function conflictsWithDomain(sectionName, targetRule) {
	if (!targetRule) return false;
	const ownScore = scoreSectionForRule(sectionName, targetRule);
	const dominant = dominantDomainForSection(sectionName);
	return Boolean(dominant && dominant.rule.key !== targetRule.key && dominant.score > ownScore + 2);
}

function scoreNode(name, bookMeta, rule) {
	const haystack = normalizeArabic(allBookText(bookMeta));
	const tokens = tokensOf(haystack);
	return scoreOf(name, haystack, tokens) + scoreSectionForRule(name, rule);
}

function pickBestMain(tree, bookMeta, rule) {
	let best = null;
	let bestScore = 0;
	for (const main of tree || []) {
		if (conflictsWithDomain(main.name, rule)) continue;
		const score = scoreNode(main.name, bookMeta, rule);
		if (score > bestScore) {
			bestScore = score;
			best = main;
		}
	}
	const minScore = rule ? 3 : 1;
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function pickBestSub(main, bookMeta, rule) {
	let best = null;
	let bestScore = 0;
	for (const sub of main?.children || []) {
		if (conflictsWithDomain(sub.name, rule)) continue;
		const score = scoreNode(sub.name, bookMeta, rule);
		if (score > bestScore) {
			bestScore = score;
			best = sub;
		}
	}
	const minScore = rule ? 3 : 1;
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

function pickBestSecondary(sub, bookMeta, rule, proposedName) {
	let best = null;
	let bestScore = 0;
	for (const sec of sub?.children || []) {
		if (conflictsWithDomain(sec.name, rule)) continue;
		const score =
			scoreNode(sec.name, bookMeta, rule) +
			(proposedName ? scoreOf(sec.name, normalizeArabic(proposedName), tokensOf(proposedName)) : 0);
		if (score > bestScore) {
			bestScore = score;
			best = sec;
		}
	}
	const minScore = rule ? 3 : 2;
	return best && bestScore >= minScore ? { node: best, score: bestScore } : null;
}

/** يستخرج جذع العنوان بإزالة ترقيم الأجزاء الشائع. */
function seriesStemFromTitle(title) {
	let t = String(title || '').trim();
	if (!t) return '';
	t = t.replace(
		/\s+[\(\[\-–—]?\s*(?:ال)?(?:جزء|جلد|المجلد|كتاب|الكتاب|مجلد|ج|جـ)\s*[٠-٩0-9\u0660-\u0669]+\s*[\)\]]?.*$/u,
		''
	);
	t = t.replace(/\s+[\/\\،,]\s*(?:ال)?(?:جزء|ج|جـ)?\s*[٠-٩0-9\u0660-\u0669]+.*$/u, '');
	t = t.replace(/\s+[\/\\]\s*[0-9٠-٩\u0660-\u0669]+.*$/u, '');
	return t.replace(/\s+/g, ' ').trim().slice(0, 70);
}

function sanitizeSectionName(raw) {
	let s = String(raw || '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.trim();
	if (!s) return '';
	s = s.replace(/^(?:كتب|كتاب)\s+(?:في|عن)\s+/u, '');
	s = s.replace(/^كتب\s+/u, '');
	s = s.split(/[*;|/\\\n\r\t]+/)[0].trim();
	s = s.replace(/^[\s,،.\-–—_]+/, '').replace(/[\s,،.\-–—_]+$/, '').trim();
	if (s.length > 60) s = s.slice(0, 60).trim();
	return s;
}

function firstUsefulHint(bookMeta, rule) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint);
		if (!clean || clean.length < 2) continue;
		if (!rule || scoreRuleInText(rule, clean, 1) > 0) return clean;
	}
	return '';
}

function secondaryNameFromBook(bookMeta, rule) {
	const text = normalizeArabic(allBookText(bookMeta));
	if (rule) {
		for (const [keyword, label] of rule.secondaryTopics || []) {
			if (includesNormalized(text, keyword)) return label;
		}
		const hint = firstUsefulHint(bookMeta, rule);
		if (hint && scoreSectionForRule(hint, rule) > 0) return hint;
		return rule.secondaryName;
	}
	const stem = sanitizeSectionName(seriesStemFromTitle(bookMeta?.title || ''));
	return stem || 'كتب عامة';
}

function subNameFromBook(bookMeta, rule) {
	if (rule) return rule.subName;
	return firstUsefulHint(bookMeta, null) || 'كتب عامة';
}

function mainNameFromBook(rule) {
	return rule?.mainName || 'مكتبة نور';
}

function confidenceFromScores(mainScore = 0, subScore = 0, secScore = 0, hasDomain = false) {
	const base = hasDomain ? 0.55 : 0.35;
	return Math.min(base + mainScore * 0.03 + subScore * 0.03 + secScore * 0.02, 0.92);
}

function createReason(rule, level, parentName = '') {
	const domain = rule?.subName || 'تصنيف عام';
	if (level === 'main') return `لم يُعثَر على قسم رئيسي مناسب لمجال "${domain}" — إنشاء مسار جديد.`;
	if (level === 'sub') return `وُجد القسم الرئيسي "${parentName}" دون فرع مناسب لمجال "${domain}" — إنشاء فرع جديد.`;
	return `وُجد المسار حتى "${parentName}" دون قسم ثانوي مناسب — إنشاء قسم ثانوي صحيح.`;
}

function decideHierarchy(sections, bookMeta) {
	const tree = sections.tree || [];
	const rule = inferDomain(bookMeta);
	const bestMain = pickBestMain(tree, bookMeta, rule);
	const newSecondaryName = secondaryNameFromBook(bookMeta, rule);

	if (!bestMain) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: mainNameFromBook(rule),
			newSubName: subNameFromBook(bookMeta, rule),
			newSecondaryName,
			confidence: rule ? 0.52 : 0.25,
			reasoning: createReason(rule, 'main'),
			method: 'heuristic'
		};
	}

	const bestSub = pickBestSub(bestMain.node, bookMeta, rule);
	if (!bestSub) {
		return {
			kind: 'create_sub',
			mainId: String(bestMain.node.id),
			subId: null,
			secondaryId: null,
			newSubName: subNameFromBook(bookMeta, rule),
			newSecondaryName,
			confidence: confidenceFromScores(bestMain.score, 0, 0, Boolean(rule)),
			reasoning: createReason(rule, 'sub', bestMain.node.name),
			method: 'heuristic'
		};
	}

	const bestSec = pickBestSecondary(bestSub.node, bookMeta, rule, newSecondaryName);
	if (!bestSec) {
		return {
			kind: 'create_secondary',
			mainId: String(bestMain.node.id),
			subId: String(bestSub.node.id),
			secondaryId: null,
			newSecondaryName,
			confidence: confidenceFromScores(bestMain.score, bestSub.score, 0, Boolean(rule)),
			reasoning: createReason(rule, 'secondary', bestSub.node.name),
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(bestMain.node.id),
		subId: String(bestSub.node.id),
		secondaryId: String(bestSec.node.id),
		confidence: confidenceFromScores(bestMain.score, bestSub.score, bestSec.score, Boolean(rule)),
		reasoning: `مطابقة محلّيّة: ${bestMain.node.name} ← ${bestSub.node.name} ← ${bestSec.node.name}.`,
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

	const decision = decideHierarchy(sections, bookMeta);
	const suggested = {
		mainId: decision.mainId || sections.tree[0]?.id || '',
		subId: decision.subId || sections.tree[0]?.children?.[0]?.id || '',
		secondaryId: decision.secondaryId || null,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		method: decision.method
	};
	const validation =
		decision.kind === 'existing'
			? validateHierarchyPath(
					{
						mainId: decision.mainId,
						subId: decision.subId,
						secondaryId: decision.secondaryId || null
					},
					sections.index
				)
			: { valid: false, reason: 'new_section_required' };

	return {
		suggested,
		createSuggestion: decision.kind === 'existing' ? null : decision,
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ.
 */
export async function classifyAutonomous(sections, bookMeta) {
	if (!sections.tree || sections.tree.length === 0) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}
	return decideHierarchy(sections, bookMeta);
}
