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

const GENERIC_MAIN_NAME = 'المكتبة';
const GENERIC_SUB_NAME = 'كتب متنوّعة';
const GENERIC_SECONDARY_NAME = 'كتب عامة';

const DOMAIN_RULES = Object.freeze([
	{
		id: 'education',
		mainName: 'التربية والتعليم',
		subName: 'التعليم وطرق التدريس',
		secondaryName: 'توجيهات تعليمية',
		cues: [
			'تربية',
			'تعليم',
			'تعليمات',
			'تعليمي',
			'تدريس',
			'مدرسة',
			'مدارس',
			'معلم',
			'معلمين',
			'طلاب',
			'طلبة',
			'مناهج',
			'منهج',
			'نصائح تعليمية'
		]
	},
	{
		id: 'fiqh',
		mainName: 'الفقه الإسلامي',
		subName: 'الفقه وأصوله',
		secondaryName: 'مسائل فقهية عامة',
		cues: [
			'فقه',
			'فقهي',
			'اصول الفقه',
			'فتاوى',
			'احكام',
			'حلال',
			'حرام',
			'عبادات',
			'معاملات',
			'صلاة',
			'زكاة',
			'صيام',
			'حج'
		],
		secondaries: [
			{ name: 'العبادات', cues: ['طهارة', 'وضوء', 'صلاة', 'زكاة', 'صيام', 'حج', 'عمرة'] },
			{ name: 'المعاملات', cues: ['بيع', 'بيوع', 'ربا', 'قرض', 'معاملات', 'تجارة', 'وقف'] },
			{ name: 'أصول الفقه', cues: ['اصول الفقه', 'قواعد فقهية', 'اجتهاد', 'قياس'] }
		]
	},
	{
		id: 'aqeedah',
		mainName: 'العقيدة',
		subName: 'العقيدة الإسلامية',
		secondaryName: 'التوحيد والإيمان',
		cues: ['عقيدة', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'شرك', 'القدر', 'الملائكة']
	},
	{
		id: 'quran',
		mainName: 'القرآن الكريم',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'التفسير',
		cues: ['قرآن', 'القران', 'تفسير', 'مصحف', 'تلاوة', 'تجويد', 'علوم القران', 'اسباب النزول'],
		secondaries: [
			{ name: 'التفسير', cues: ['تفسير', 'اسباب النزول', 'معاني القران'] },
			{ name: 'التجويد والقراءات', cues: ['تجويد', 'قراءات', 'رواية حفص', 'رواية ورش'] }
		]
	},
	{
		id: 'hadith',
		mainName: 'الحديث الشريف',
		subName: 'الحديث وعلومه',
		secondaryName: 'متون وشروح الحديث',
		cues: ['حديث', 'احاديث', 'سنة', 'سنن', 'صحيح', 'رواة', 'اسناد', 'جرح وتعديل', 'مصطلح الحديث'],
		secondaries: [
			{ name: 'متون الحديث', cues: ['صحيح', 'سنن', 'مسند', 'موطأ', 'اربعين'] },
			{ name: 'مصطلح الحديث', cues: ['مصطلح الحديث', 'اسناد', 'رواة', 'جرح وتعديل'] }
		]
	},
	{
		id: 'seerah',
		mainName: 'السيرة النبوية',
		subName: 'السيرة والشمائل',
		secondaryName: 'السيرة النبوية',
		cues: ['سيرة', 'شمائل', 'النبي', 'رسول الله', 'غزوات', 'هجرة']
	},
	{
		id: 'history',
		mainName: 'التاريخ',
		subName: 'التاريخ والتراجم',
		secondaryName: 'تاريخ وتراجم',
		cues: ['تاريخ', 'تراجم', 'اعلام', 'وفيات', 'طبقات', 'سير اعلام', 'دول', 'خلافة']
	},
	{
		id: 'language',
		mainName: 'اللغة العربية',
		subName: 'النحو والصرف والبلاغة',
		secondaryName: 'علوم اللغة',
		cues: ['لغة عربية', 'نحو', 'صرف', 'بلاغة', 'اعراب', 'معجم', 'قاموس', 'لسان العرب']
	},
	{
		id: 'literature',
		mainName: 'الأدب',
		subName: 'الأدب العربي',
		secondaryName: 'نصوص أدبية',
		cues: ['ادب', 'اداب', 'شعر', 'قصائد', 'رواية', 'قصص', 'مقامات', 'نثر']
	},
	{
		id: 'ethics',
		mainName: 'التزكية والأخلاق',
		subName: 'الآداب والأخلاق',
		secondaryName: 'آداب عامة',
		cues: ['اخلاق', 'اداب', 'تزكية', 'رقائق', 'زهد', 'نصائح', 'موعظة', 'وصايا']
	},
	{
		id: 'science',
		mainName: 'العلوم والمعارف',
		subName: 'علوم عامة',
		secondaryName: 'معارف علمية',
		cues: ['علوم', 'علمية', 'فيزياء', 'كيمياء', 'رياضيات', 'طب', 'فلك', 'جغرافيا']
	}
]);

function makeHaystack(bookMeta) {
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

function tokensOf(s, minLen = 3) {
	return new Set(
		normalizeArabic(s)
			.split(' ')
			.filter((t) => t.length >= minLen)
	);
}

function cueScore(haystack, cues = []) {
	let score = 0;
	const hayTokens = tokensOf(haystack);
	for (const cue of cues) {
		const n = normalizeArabic(cue);
		if (!n) continue;
		if (haystack.includes(n)) {
			score += 3 + Math.min(n.split(' ').length, 3);
			continue;
		}
		const cueTokens = tokensOf(n);
		for (const token of cueTokens) {
			if (hayTokens.has(token)) score += 1;
		}
	}
	return score;
}

function scoreNameAgainstLabels(name, labels, haystack = '') {
	const n = normalizeArabic(name);
	if (!n) return 0;
	let score = 0;
	const nodeTokens = tokensOf(n);
	for (const label of labels.filter(Boolean)) {
		const l = normalizeArabic(label);
		if (!l) continue;
		if (n === l) score += 24;
		else if (n.includes(l) || l.includes(n)) score += 14;
		else {
			const labelTokens = tokensOf(l);
			score += tokenSetsOverlapRatio(nodeTokens, labelTokens) * 12;
		}
	}
	if (haystack.includes(n) && n.length >= 4) score += 5;
	return score;
}

function pickDomainRule(bookMeta) {
	const haystack = makeHaystack(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const rule of DOMAIN_RULES) {
		const score = cueScore(haystack, rule.cues);
		if (score > bestScore) {
			bestScore = score;
			best = rule;
		}
	}
	return best && bestScore >= 3 ? { rule: best, score: bestScore, haystack } : null;
}

function pickSecondaryName(rule, haystack) {
	for (const candidate of rule?.secondaries || []) {
		if (cueScore(haystack, candidate.cues) >= 3) return candidate.name;
	}
	return rule?.secondaryName || GENERIC_SECONDARY_NAME;
}

function sanitizeSectionName(raw) {
	let s = String(raw || '').trim();
	if (!s) return '';
	s = s.split(/[*;|/\\\n\r\t،,]+/)[0].trim();
	s = s.replace(/^[\s.\-–—_]+|[\s.\-–—_]+$/g, '').trim();
	if (/^(الرئيسية|home|كتب|مكتبة نور)$/i.test(s)) return '';
	return s.slice(0, 60).trim();
}

function pickHintName(bookMeta) {
	for (const hint of bookMeta?.categoryHints || []) {
		const clean = sanitizeSectionName(hint);
		if (clean && clean.length >= 2) return clean;
	}
	return '';
}

function getMainBySubId(tree, subId) {
	for (const main of tree || []) {
		for (const sub of main.children || []) {
			if (String(sub.id) === String(subId)) return main;
		}
	}
	return null;
}

function findBestMain(tree, rule, haystack) {
	const labels = rule
		? [rule.mainName, rule.subName, ...(rule.cues || [])]
		: [pickHintName({ categoryHints: [] }), GENERIC_MAIN_NAME];
	let best = null;
	let bestScore = 0;
	for (const main of tree || []) {
		const score = scoreNameAgainstLabels(main.name, labels, haystack);
		if (score > bestScore) {
			bestScore = score;
			best = main;
		}
	}
	return best && bestScore >= (rule ? 8 : 5) ? { node: best, score: bestScore } : null;
}

function findBestSubUnderMain(main, rule, haystack) {
	const labels = rule
		? [rule.subName, rule.mainName, ...(rule.cues || [])]
		: [GENERIC_SUB_NAME];
	let best = null;
	let bestScore = 0;
	for (const sub of main?.children || []) {
		const score = scoreNameAgainstLabels(sub.name, labels, haystack);
		if (score > bestScore) {
			bestScore = score;
			best = sub;
		}
	}
	return best && bestScore >= (rule ? 7 : 5) ? { node: best, score: bestScore } : null;
}

function findBestSubAnywhere(tree, rule, haystack) {
	if (!rule) return null;
	let best = null;
	let bestMain = null;
	let bestScore = 0;
	for (const main of tree || []) {
		for (const sub of main.children || []) {
			const score = scoreNameAgainstLabels(
				sub.name,
				[rule.subName, rule.mainName, ...(rule.cues || [])],
				haystack
			);
			if (score > bestScore) {
				bestScore = score;
				best = sub;
				bestMain = main;
			}
		}
	}
	return best && bestScore >= 10 ? { node: best, main: bestMain, score: bestScore } : null;
}

function chooseClassificationTarget(sections, bookMeta) {
	const domain = pickDomainRule(bookMeta);
	const rule = domain?.rule || null;
	const haystack = domain?.haystack || makeHaystack(bookMeta);
	const hint = pickHintName(bookMeta);
	const target = {
		mainName: rule?.mainName || GENERIC_MAIN_NAME,
		subName: rule?.subName || hint || GENERIC_SUB_NAME,
		secondaryName: rule ? pickSecondaryName(rule, haystack) : hint || GENERIC_SECONDARY_NAME,
		rule,
		haystack
	};

	let main = findBestMain(sections.tree, rule, haystack)?.node || null;
	let sub = main ? findBestSubUnderMain(main, rule, haystack)?.node || null : null;

	if (!sub) {
		const subAnywhere = findBestSubAnywhere(sections.tree, rule, haystack);
		if (subAnywhere) {
			main = subAnywhere.main || getMainBySubId(sections.tree, subAnywhere.node.id);
			sub = subAnywhere.node;
		}
	}

	return { ...target, main, sub };
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
	const isExisting = decision.kind === 'existing';
	const validation = isExisting
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
		suggested: {
			mainId: decision.mainId,
			subId: decision.subId,
			secondaryId: decision.secondaryId,
			confidence: decision.confidence,
			reasoning: decision.reasoning,
			method: decision.method,
			kind: decision.kind,
			newMainName: decision.newMainName,
			newSubName: decision.newSubName,
			newSecondaryName: decision.newSecondaryName
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
		const target = chooseClassificationTarget({ tree: [] }, bookMeta);
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: target.mainName,
			newSubName: target.subName,
			newSecondaryName: target.secondaryName,
			confidence: 0.3,
			reasoning: 'الشجرة فارغة — إنشاء مسار ثلاثي جديد مناسب للكتاب.',
			method: 'heuristic'
		};
	}

	const target = chooseClassificationTarget(sections, bookMeta);
	const { main, sub, mainName, subName, secondaryName, rule } = target;
	const ruleLabel = rule ? ` (${rule.mainName} ← ${rule.subName})` : '';

	if (!main) {
		return {
			kind: 'create_main',
			mainId: null,
			subId: null,
			secondaryId: null,
			newMainName: mainName,
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: rule ? 0.52 : 0.34,
			reasoning: `لم يُعثَر على قسم رئيسي مناسب${ruleLabel} — إنشاء المسار الثلاثي في المستوى الصحيح.`,
			method: 'heuristic'
		};
	}

	if (!sub) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			subId: null,
			secondaryId: null,
			newSubName: subName,
			newSecondaryName: secondaryName,
			confidence: rule ? 0.6 : 0.42,
			reasoning: `القسم الرئيسي "${main.name}" مناسب، ولا يوجد تحته قسم فرعي مطابق — إنشاء فرعي وثانوي.`,
			method: 'heuristic'
		};
	}

	let secId = null;
	const autoSec = pickReuseSecondary(sections, String(sub.id), bookMeta, {
		proposedNewName: secondaryName,
		minScore: 7
	});
	if (autoSec) secId = autoSec.id;

	if (!secId) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: null,
			newSecondaryName: secondaryName,
			confidence: rule ? 0.68 : 0.48,
			reasoning: `المسار مناسب حتى القسم الفرعي "${main.name} ← ${sub.name}" — إنشاء قسم ثانوي قبل إضافة المحتوى.`,
			method: 'heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: secId,
		confidence: rule ? 0.78 : 0.58,
		reasoning: `مطابقة ثلاثية: ${main.name} ← ${sub.name} ← ${autoSec?.name || secondaryName}.`,
		method: 'heuristic'
	};
}
