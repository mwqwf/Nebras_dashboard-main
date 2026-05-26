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
		id: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'علوم القرآن والتفسير',
		keywords: ['قرآن', 'القرآن', 'تفسير', 'تفاسير', 'مصحف', 'سورة', 'آية', 'قراءات', 'تجويد', 'علوم القرآن'],
		aliases: ['القرآن', 'التفسير', 'علوم القرآن']
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		secondaryName: 'كتب الحديث وعلومه',
		keywords: ['حديث', 'الأحاديث', 'السنة', 'سنن', 'مسند', 'صحيح البخاري', 'صحيح مسلم', 'مصطلح الحديث', 'الجرح والتعديل'],
		aliases: ['الحديث', 'السنة', 'علوم الحديث']
	},
	{
		id: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'الفقه الإسلامي',
		secondaryName: 'مسائل الفقه العامة',
		keywords: ['فقه', 'أصول الفقه', 'فتاوى', 'فتوى', 'الطهارة', 'الصلاة', 'الزكاة', 'الصيام', 'الحج', 'العمرة', 'المعاملات', 'المواريث', 'الفرائض', 'النكاح', 'الطلاق'],
		aliases: ['الفقه', 'أصول الفقه', 'فتاوى']
	},
	{
		id: 'aqida',
		mainName: 'العقيدة الإسلامية',
		subName: 'العقيدة والتوحيد',
		secondaryName: 'التوحيد والعقيدة',
		keywords: ['عقيدة', 'العقيدة', 'توحيد', 'الإيمان', 'الايمان', 'الأسماء والصفات', 'اسماء وصفات', 'القدر', 'الشرك', 'السلفية', 'الفرق'],
		aliases: ['العقيدة', 'التوحيد']
	},
	{
		id: 'history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة والتاريخ',
		secondaryName: 'السيرة والتراجم والتاريخ',
		keywords: ['سيرة', 'السيرة', 'مغازي', 'شمائل', 'تاريخ', 'التاريخ', 'تراجم', 'صحابة', 'الخلفاء', 'الفتوحات', 'حضارة', 'بلدان'],
		aliases: ['السيرة', 'التاريخ', 'التراجم']
	},
	{
		id: 'education',
		mainName: 'الدعوة والتربية',
		subName: 'التربية والتعليم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		keywords: ['تربية', 'تعليم', 'التعليم', 'تعلم', 'العلم', 'العلمية', 'طلب العلم', 'طالب العلم', 'نصائح', 'النصائح', 'توجيهات', 'وصايا', 'إرشادات', 'ارشادات', 'آداب طلب العلم', 'الأخلاق', 'اخلاق', 'تزكية', 'رقائق', 'زهد', 'مواعظ'],
		aliases: ['التربية', 'التعليم', 'طلب العلم', 'النصائح']
	},
	{
		id: 'arabic',
		mainName: 'اللغة العربية وعلومها',
		subName: 'النحو والصرف والبلاغة',
		secondaryName: 'علوم اللغة العربية',
		keywords: ['لغة عربية', 'العربية', 'نحو', 'صرف', 'بلاغة', 'إعراب', 'اعراب', 'أدب عربي', 'الأدب العربي', 'شعر', 'عروض', 'معاجم'],
		aliases: ['اللغة العربية', 'النحو', 'الصرف', 'البلاغة', 'الأدب العربي']
	},
	{
		id: 'general',
		mainName: 'مكتبة نور',
		subName: 'كتب عامة',
		secondaryName: 'منوعات معرفية',
		keywords: ['عام', 'عامة', 'منوعات', 'ثقافة'],
		aliases: ['مكتبة نور', 'كتب عامة']
	}
]);

function bookText(bookMeta) {
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

function tokensOf(text) {
	return new Set(
		normalizeArabic(text)
			.split(' ')
			.map((t) => t.trim())
			.filter((t) => t.length >= 3)
	);
}

function keywordScore(text, keywords) {
	const n = normalizeArabic(text);
	if (!n) return 0;
	let score = 0;
	for (const keyword of keywords || []) {
		const k = normalizeArabic(keyword);
		if (!k) continue;
		if (n.includes(k)) score += k.includes(' ') ? 3 : 1;
	}
	return score;
}

function detectRuleFromText(text, minScore = 2) {
	let best = null;
	let bestScore = 0;
	for (const rule of TOPIC_RULES) {
		if (rule.id === 'general') continue;
		const score = keywordScore(text, rule.keywords);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return best && bestScore >= minScore ? { rule: best, score: bestScore } : null;
}

function detectTopicRule(bookMeta) {
	const detected = detectRuleFromText(bookText(bookMeta), 2);
	return detected?.rule || TOPIC_RULES.find((rule) => rule.id === 'general');
}

function containsAny(text, phrases) {
	const n = normalizeArabic(text);
	return phrases.some((phrase) => n.includes(normalizeArabic(phrase)));
}

function scoreNodeName(name, bookMeta, rule) {
	const normalizedName = normalizeArabic(name);
	if (!normalizedName) return 0;

	const haystack = bookText(bookMeta);
	const hayTokens = tokensOf(haystack);
	const nameTokens = tokensOf(normalizedName);
	let score = 0;

	if (normalizedName.length >= 4 && haystack.includes(normalizedName)) score += 8;
	for (const token of nameTokens) {
		if (hayTokens.has(token)) score += 2;
	}

	score += keywordScore(normalizedName, rule?.keywords || []) * 3;
	for (const alias of rule?.aliases || []) {
		const a = normalizeArabic(alias);
		if (a && (normalizedName.includes(a) || a.includes(normalizedName))) score += 6;
	}

	const detected = detectRuleFromText(normalizedName, 2);
	if (rule?.id && rule.id !== 'general') {
		if (detected?.rule?.id === rule.id) score += 5;
		else if (detected?.rule?.id && detected.rule.id !== rule.id) score -= 20;
	}
	return score;
}

function pickBestNode(nodes, bookMeta, rule, threshold) {
	let best = null;
	let bestScore = -Infinity;
	for (const node of nodes || []) {
		const score = scoreNodeName(node?.name, bookMeta, rule);
		if (score > bestScore) {
			best = node;
			bestScore = score;
		}
	}
	return best && bestScore >= threshold ? { node: best, score: bestScore } : null;
}

function confidenceFromScore(score) {
	return Math.max(0.55, Math.min(0.95, 0.55 + Math.max(0, score) * 0.03));
}

/**
 * Heuristic fallback — يعطي درجة لكلّ section بمقدار
 * تقاطع كلماتها مع (title + categoryHints + description). يختار أعلى main
 * ثمّ أعلى sub داخله ثمّ أعلى secondary داخله.
 */
function classifyHeuristic({ tree, index }, bookMeta) {
	const rule = detectTopicRule(bookMeta);
	const bestMain = pickBestNode(tree, bookMeta, rule, rule.id === 'general' ? 2 : 4);
	if (!bestMain?.node) return null;

	const bestSub = pickBestNode(bestMain.node.children || [], bookMeta, rule, 3);
	if (!bestSub?.node) return null;

	const bestSec = pickBestNode(bestSub.node.children || [], bookMeta, rule, 4);

	return {
		mainId: bestMain.node.id,
		subId: bestSub.node.id,
		secondaryId: bestSec?.node?.id || null,
		confidence: confidenceFromScore(bestMain.score + bestSub.score + (bestSec?.score || 0)),
		reasoning: `تصنيف موضوعي محلي (${rule.id})`,
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


function deriveSecondaryName(bookMeta, rule) {
	const text = bookText(bookMeta);
	if (rule.id === 'fiqh') {
		if (containsAny(text, ['طهارة', 'وضوء', 'غسل'])) return 'الطهارة';
		if (containsAny(text, ['صلاة', 'الصلاة'])) return 'الصلاة';
		if (containsAny(text, ['زكاة', 'الزكاة'])) return 'الزكاة';
		if (containsAny(text, ['صيام', 'الصوم', 'رمضان'])) return 'الصيام';
		if (containsAny(text, ['حج', 'عمرة', 'مناسك'])) return 'الحج والعمرة';
		if (containsAny(text, ['معاملات', 'بيع', 'ربا', 'تجارة'])) return 'فقه المعاملات';
		if (containsAny(text, ['مواريث', 'فرائض', 'ميراث'])) return 'المواريث والفرائض';
	}
	if (rule.id === 'quran') {
		if (containsAny(text, ['تجويد', 'قراءات'])) return 'التجويد والقراءات';
		return 'علوم القرآن والتفسير';
	}
	if (rule.id === 'hadith') {
		if (containsAny(text, ['مصطلح', 'جرح', 'تعديل', 'رواة'])) return 'مصطلح الحديث والرجال';
		return 'كتب الحديث وعلومه';
	}
	if (rule.id === 'aqida') return 'التوحيد والعقيدة';
	if (rule.id === 'history') {
		if (containsAny(text, ['سيرة', 'مغازي', 'شمائل'])) return 'السيرة النبوية';
		if (containsAny(text, ['تراجم', 'أعلام', 'اعلام', 'صحابة'])) return 'التراجم والأعلام';
		return 'التاريخ الإسلامي';
	}
	if (rule.id === 'education') {
		if (containsAny(text, ['طلب العلم', 'طالب العلم', 'نصائح', 'توجيهات', 'تعليمات', 'علمية'])) {
			return 'النصائح والتوجيهات العلمية';
		}
		if (containsAny(text, ['أخلاق', 'اخلاق', 'تزكية', 'رقائق', 'زهد'])) return 'التزكية والأخلاق';
		return 'التربية والتعليم';
	}
	if (rule.id === 'arabic') {
		if (containsAny(text, ['نحو', 'إعراب', 'اعراب'])) return 'النحو والإعراب';
		if (containsAny(text, ['صرف'])) return 'الصرف';
		if (containsAny(text, ['بلاغة', 'بيان', 'بديع'])) return 'البلاغة';
		if (containsAny(text, ['شعر', 'أدب عربي', 'الأدب العربي'])) return 'الأدب العربي';
	}

	const hint = (bookMeta?.categoryHints || [])
		.map((h) => String(h || '').trim())
		.find((h) => h.length >= 3 && h.length <= 70);
	return hint || rule.secondaryName || seriesStemFromTitle(bookMeta?.title || '') || 'منوعات معرفية';
}

function autonomousDecision(sections, bookMeta) {
	const rule = detectTopicRule(bookMeta);
	const mainPick = pickBestNode(sections.tree, bookMeta, rule, rule.id === 'general' ? 2 : 4);
	const newSecondaryName = deriveSecondaryName(bookMeta, rule);

	if (!mainPick?.node) {
		return {
			kind: 'create_main',
			mainId: '',
			subId: '',
			secondaryId: null,
			newMainName: rule.mainName,
			newSubName: rule.subName,
			newSecondaryName,
			confidence: 0.72,
			reasoning: `لا يوجد قسم رئيسي مناسب لمجال "${rule.mainName}" — إنشاء المسار كاملاً.`,
			method: 'heuristic'
		};
	}

	const main = mainPick.node;
	const subPick = pickBestNode(main.children || [], bookMeta, rule, 3);
	if (!subPick?.node) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: '',
			secondaryId: null,
			newSubName: rule.subName,
			newSecondaryName,
			confidence: confidenceFromScore(mainPick.score),
			reasoning: `القسم الرئيسي مناسب، ولا يوجد فرعي مناسب تحت "${main.name}".`,
			method: 'heuristic'
		};
	}

	const sub = subPick.node;
	const secPick = pickBestNode(sub.children || [], bookMeta, rule, 4);
	if (secPick?.node) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: String(secPick.node.id),
			confidence: confidenceFromScore(mainPick.score + subPick.score + secPick.score),
			reasoning: `مسار ثلاثي موجود ومناسب لمجال "${rule.mainName}".`,
			method: 'heuristic'
		};
	}

	const reused = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: newSecondaryName,
		minScore: 9
	});
	if (reused) {
		return {
			kind: 'existing',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: reused.id,
			confidence: confidenceFromScore(mainPick.score + subPick.score + reused.score),
			reasoning: `أُعيد استعمال قسم ثانوي قريب: "${reused.name}".`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'create_secondary',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: null,
		newSecondaryName,
		confidence: confidenceFromScore(mainPick.score + subPick.score),
		reasoning: `القسمان الرئيسي والفرعي مناسبان، ولا يوجد قسم ثانوي دقيق تحت "${sub.name}".`,
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

	const sug = classifyHeuristic(sections, bookMeta);
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
	return autonomousDecision(sections, bookMeta);
}
