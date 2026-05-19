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

const STOP_WORDS = new Set([
	'كتاب',
	'كتب',
	'رساله',
	'رسائل',
	'شرح',
	'مختصر',
	'متن',
	'باب',
	'جزء',
	'مجلد',
	'الجزء',
	'المجلد',
	'في',
	'من',
	'الي',
	'الى',
	'عن',
	'على',
	'مع',
	'هذا',
	'هذه',
	'ذلك',
	'تحت',
	'بين',
	'عند',
	'لدي',
	'وقد',
	'كما'
]);

const RULED_TOPICS = Object.freeze([
	{
		key: 'talab_ilm',
		mainName: 'التزكية والأخلاق',
		subName: 'آداب طلب العلم',
		secondaryName: 'النصائح والتوجيهات العلمية',
		mainTerms: ['تزكيه', 'اخلاق', 'اداب', 'تربيه', 'رقائق', 'سلوك'],
		subTerms: ['طلب العلم', 'طالب العلم', 'اداب العلم', 'العالم والمتعلم', 'التعليم', 'التعلم'],
		secondaryTerms: ['نصائح', 'وصايا', 'توجيهات', 'تعليمات علميه', 'اداب طالب العلم', 'الطلب', 'العلماء'],
		hints: ['طلب العلم', 'طالب العلم', 'اداب طالب العلم', 'نصائح', 'وصايا', 'توجيهات علميه', 'تعليمات علميه']
	},
	{
		key: 'quran',
		mainName: 'القرآن وعلومه',
		subName: 'التفسير وعلوم القرآن',
		secondaryName: 'علوم القرآن والتفسير',
		mainTerms: ['قران', 'القران', 'تفسير', 'علوم القران', 'تجويد', 'قراءات'],
		subTerms: ['تفسير', 'علوم القران', 'اسباب النزول', 'ناسخ', 'منسوخ', 'محكم', 'متشابه'],
		secondaryTerms: ['تفسير', 'علوم القران', 'تجويد', 'قراءات', 'رسم المصحف'],
		hints: ['قران', 'القران', 'تفسير', 'سوره', 'ايات', 'مصحف', 'تجويد', 'قراءات', 'اسباب النزول']
	},
	{
		key: 'hadith',
		mainName: 'الحديث وعلومه',
		subName: 'الحديث الشريف',
		secondaryName: 'كتب الحديث وشروحه',
		mainTerms: ['حديث', 'احاديث', 'سنه', 'سنن', 'صحيح', 'مسند', 'مصطلح الحديث'],
		subTerms: ['حديث', 'صحيح', 'سنن', 'مسند', 'جامع', 'مصنف', 'موطا'],
		secondaryTerms: ['شرح الحديث', 'شروح الحديث', 'مصطلح الحديث', 'علل الحديث', 'رجال الحديث', 'تخريج'],
		hints: ['حديث', 'احاديث', 'صحيح البخاري', 'صحيح مسلم', 'سنن', 'مسند', 'مصطلح', 'علل', 'راوي', 'اسناد']
	},
	{
		key: 'fiqh',
		mainName: 'الفقه وأصوله',
		subName: 'فقه عام',
		secondaryName: 'مسائل فقهية عامة',
		mainTerms: ['فقه', 'اصول الفقه', 'فتاوي', 'فتاوى', 'احكام', 'قواعد فقهيه'],
		subTerms: ['فقه', 'عبادات', 'معاملات', 'اصول الفقه', 'مذاهب', 'فرائض', 'مواريث'],
		secondaryTerms: ['طهاره', 'صلاه', 'زكاه', 'صيام', 'حج', 'معاملات', 'نكاح', 'طلاق', 'بيوع', 'مواريث'],
		hints: ['فقه', 'اصول الفقه', 'احكام', 'حلال', 'حرام', 'فتوي', 'فتاوي', 'فتاوى', 'مذهب', 'شافعي', 'حنفي', 'مالكي', 'حنبلي'],
		subtopics: [
			{ subName: 'العبادات', secondaryName: 'فقه العبادات', hints: ['طهاره', 'صلاه', 'زكاه', 'صيام', 'حج', 'عمره', 'اذان'] },
			{ subName: 'المعاملات', secondaryName: 'فقه المعاملات', hints: ['بيع', 'بيوع', 'ربا', 'تجاره', 'شركه', 'وقف', 'اجاره', 'دين'] },
			{ subName: 'فقه الأسرة', secondaryName: 'النكاح والطلاق', hints: ['نكاح', 'زواج', 'طلاق', 'خلع', 'رضاع', 'حضانة', 'نفقه'] },
			{ subName: 'أصول الفقه والقواعد', secondaryName: 'أصول الفقه', hints: ['اصول الفقه', 'قواعد فقهيه', 'قياس', 'اجماع', 'استصحاب'] },
			{ subName: 'المواريث والفرائض', secondaryName: 'علم الفرائض', hints: ['مواريث', 'فرائض', 'ميراث', 'تركه'] }
		]
	},
	{
		key: 'aqidah',
		mainName: 'العقيدة',
		subName: 'التوحيد والعقيدة',
		secondaryName: 'كتب العقيدة',
		mainTerms: ['عقيده', 'توحيد', 'ايمان', 'اسماء الله', 'صفات', 'قدر', 'شرك'],
		subTerms: ['توحيد', 'ايمان', 'اسماء وصفات', 'الولاء والبراء', 'ايمان بالقدر'],
		secondaryTerms: ['عقيده', 'توحيد', 'اسماء الله وصفاته', 'الايمان', 'القدر', 'الفرق'],
		hints: ['عقيده', 'اعتقاد', 'توحيد', 'ايمان', 'شرك', 'كفر', 'اسماء الله', 'صفات', 'قدر', 'اشاعره', 'معتزله', 'فرق']
	},
	{
		key: 'seerah_history',
		mainName: 'السيرة والتاريخ الإسلامي',
		subName: 'السيرة النبوية',
		secondaryName: 'السيرة النبوية والشمائل',
		mainTerms: ['سيره', 'تاريخ', 'مغازي', 'شمائل', 'تراجم', 'طبقات'],
		subTerms: ['سيره', 'مغازي', 'شمائل', 'تاريخ', 'تراجم', 'طبقات'],
		secondaryTerms: ['سيره نبويه', 'غزوات', 'شمائل', 'خلفاء', 'تراجم', 'اعلام', 'طبقات'],
		hints: ['سيره', 'النبي', 'رسول الله', 'مغازي', 'غزوه', 'شمائل', 'تاريخ', 'خلافه', 'خلفاء', 'تراجم', 'طبقات', 'اعلام'],
		subtopics: [
			{ subName: 'السيرة النبوية', secondaryName: 'السيرة النبوية والشمائل', hints: ['سيره', 'نبوية', 'النبي', 'رسول الله', 'مغازي', 'غزوه', 'شمائل'] },
			{ subName: 'التاريخ الإسلامي', secondaryName: 'التاريخ الإسلامي', hints: ['تاريخ', 'خلافه', 'اموي', 'عباسي', 'اندلس', 'دوله'] },
			{ subName: 'التراجم والطبقات', secondaryName: 'تراجم الأعلام', hints: ['تراجم', 'طبقات', 'اعلام', 'وفيات', 'سير اعلام'] }
		]
	},
	{
		key: 'tazkiyah_adab',
		mainName: 'التزكية والأخلاق',
		subName: 'الأخلاق والآداب',
		secondaryName: 'الآداب والأخلاق',
		mainTerms: ['تزكيه', 'اخلاق', 'اداب', 'زهد', 'رقائق', 'سلوك', 'تربيه'],
		subTerms: ['اخلاق', 'اداب', 'زهد', 'رقائق', 'تربيه ايمانيه', 'مواعظ'],
		secondaryTerms: ['اخلاق', 'اداب', 'زهد', 'رقائق', 'مواعظ', 'وصايا'],
		hints: ['اخلاق', 'اداب', 'تزكيه', 'زهد', 'رقائق', 'سلوك', 'مواعظ', 'وصايا', 'تربيه']
	},
	{
		key: 'arabic',
		mainName: 'اللغة العربية',
		subName: 'علوم اللغة العربية',
		secondaryName: 'النحو والصرف والبلاغة',
		mainTerms: ['لغه عربيه', 'نحو', 'صرف', 'بلاغه', 'اعراب', 'ادب عربي'],
		subTerms: ['نحو', 'صرف', 'بلاغه', 'عروض', 'قواعد اللغه', 'ادب عربي'],
		secondaryTerms: ['نحو', 'صرف', 'بلاغه', 'اعراب', 'عروض', 'املاء'],
		hints: ['نحو', 'صرف', 'بلاغه', 'اعراب', 'عروض', 'قافيه', 'لغه عربيه', 'املاء']
	},
	{
		key: 'dawah',
		mainName: 'الدعوة والإرشاد',
		subName: 'الدعوة والخطب',
		secondaryName: 'خطب ومواعظ',
		mainTerms: ['دعوه', 'ارشاد', 'خطب', 'محاضرات'],
		subTerms: ['دعوه', 'خطب', 'ارشاد', 'وعظ'],
		secondaryTerms: ['خطب', 'مواعظ', 'محاضرات', 'دروس'],
		hints: ['دعوه', 'داعيه', 'خطب', 'خطيب', 'ارشاد', 'محاضرات']
	}
]);

function uniq(arr) {
	return [...new Set((arr || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function denormalizeArabicName(name) {
	return String(name || '')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenize(s) {
	return normalizeArabic(s)
		.split(' ')
		.map((t) => t.trim())
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function makeHaystack(bookMeta) {
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

function scoreTermsInText(text, terms = []) {
	const normalizedText = normalizeArabic(text);
	if (!normalizedText) return 0;
	let score = 0;
	for (const rawTerm of terms) {
		const term = normalizeArabic(rawTerm);
		if (!term) continue;
		if (normalizedText === term) score += 12;
		else if (normalizedText.includes(term) || term.includes(normalizedText)) score += 7;
		else {
			const termTokens = tokenize(term);
			for (const token of termTokens) {
				if (normalizedText.includes(token)) score += 1.5;
			}
		}
	}
	return score;
}

function scoreTopicAgainstBook(topic, haystack) {
	let score = scoreTermsInText(haystack, [
		...(topic.hints || []),
		...(topic.mainTerms || []),
		...(topic.subTerms || []),
		...(topic.secondaryTerms || [])
	]);
	for (const subtopic of topic.subtopics || []) {
		score += scoreTermsInText(haystack, subtopic.hints || []) * 0.8;
	}
	return score;
}

function inferTopic(bookMeta) {
	const haystack = makeHaystack(bookMeta);
	let best = null;
	let bestScore = 0;
	for (const topic of RULED_TOPICS) {
		const score = scoreTopicAgainstBook(topic, haystack);
		if (score > bestScore) {
			best = topic;
			bestScore = score;
		}
	}
	if (!best || bestScore < 4) return { topic: null, subtopic: null, score: bestScore, haystack };

	let bestSubtopic = null;
	let bestSubScore = 0;
	for (const subtopic of best.subtopics || []) {
		const score = scoreTermsInText(haystack, subtopic.hints || []);
		if (score > bestSubScore) {
			bestSubtopic = subtopic;
			bestSubScore = score;
		}
	}
	return {
		topic: best,
		subtopic: bestSubScore >= 3 ? bestSubtopic : null,
		score: bestScore,
		haystack
	};
}

function topicSubName(topic, subtopic) {
	return denormalizeArabicName(subtopic?.subName || topic?.subName || 'كتب إسلامية عامة');
}

function topicSecondaryName(topic, subtopic) {
	return denormalizeArabicName(subtopic?.secondaryName || topic?.secondaryName || topicSubName(topic, subtopic));
}

function nodeNameScore(node, terms, haystack) {
	const name = node?.name || '';
	const normalizedName = normalizeArabic(name);
	let score = scoreTermsInText(name, terms);
	if (normalizedName && haystack.includes(normalizedName) && normalizedName.length >= 4) score += 8;
	const nodeTokens = new Set(tokenize(name));
	const hayTokens = new Set(tokenize(haystack));
	score += tokenSetsOverlapRatio(nodeTokens, hayTokens) * 8;
	return score;
}

function scoreMainNode(main, topic, haystack) {
	if (!topic) return nodeNameScore(main, tokenize(haystack), haystack);
	let score = nodeNameScore(main, [topic.mainName, ...(topic.mainTerms || []), ...(topic.hints || [])], haystack);
	for (const sub of main.children || []) {
		score += nodeNameScore(sub, [topic.subName, ...(topic.subTerms || [])], haystack) * 0.65;
		for (const sec of sub.children || []) {
			score += nodeNameScore(sec, [topic.secondaryName, ...(topic.secondaryTerms || [])], haystack) * 0.35;
		}
	}
	return score;
}

function scoreSubNode(sub, topic, subtopic, haystack) {
	if (!topic) return nodeNameScore(sub, tokenize(haystack), haystack);
	let score = nodeNameScore(
		sub,
		[topicSubName(topic, subtopic), topic.subName, ...(topic.subTerms || []), ...(subtopic?.hints || [])],
		haystack
	);
	for (const sec of sub.children || []) {
		score += nodeNameScore(
			sec,
			[topicSecondaryName(topic, subtopic), ...(topic.secondaryTerms || []), ...(subtopic?.hints || [])],
			haystack
		) * 0.45;
	}
	return score;
}

function scoreSecondaryNode(sec, topic, subtopic, bookMeta, haystack) {
	const proposed = topicSecondaryName(topic, subtopic);
	let score = scoreSecondaryForReuse(sec, bookMeta, proposed);
	if (topic) {
		score += nodeNameScore(sec, [proposed, ...(topic.secondaryTerms || []), ...(subtopic?.hints || [])], haystack);
	}
	return score;
}

function pickBest(items, scorer) {
	let best = null;
	let bestScore = 0;
	for (const item of items || []) {
		const score = scorer(item);
		if (score > bestScore) {
			best = item;
			bestScore = score;
		}
	}
	return { item: best, score: bestScore };
}

/**
 * Heuristic مضبوط: لا يكتفي بتقاطع كلمات عام، بل يستعمل أبواباً شرعية
 * صريحة حتى لا تختلط كتب الآداب بالفقه أو التاريخ بالعقيدة.
 */
function classifyHeuristic(sections, bookMeta) {
	const { topic, subtopic, score: topicScore, haystack } = inferTopic(bookMeta);
	const mainPick = pickBest(sections.tree || [], (m) => scoreMainNode(m, topic, haystack));
	if (!mainPick.item) return null;

	const mainThreshold = topic ? 5 : 7;
	if (mainPick.score < mainThreshold) {
		if (!topic) return null;
		return {
			kind: 'create_main',
			newMainName: topic.mainName,
			newSubName: topicSubName(topic, subtopic),
			newSecondaryName: topicSecondaryName(topic, subtopic),
			confidence: Math.min(0.55 + topicScore * 0.02, 0.8),
			reasoning: `لا يوجد قسم رئيسي مناسب بوضوح؛ إنشاء مسار ${topic.mainName} > ${topicSubName(topic, subtopic)} > ${topicSecondaryName(topic, subtopic)}.`,
			method: 'ruled_heuristic'
		};
	}

	const main = mainPick.item;
	const subPick = pickBest(main.children || [], (sub) => scoreSubNode(sub, topic, subtopic, haystack));
	const desiredSubName = topic ? topicSubName(topic, subtopic) : suggestedNameFromBook(bookMeta, 'sub');
	const subThreshold = topic ? 5 : 7;

	if (!subPick.item || subPick.score < subThreshold) {
		return {
			kind: 'create_sub',
			mainId: String(main.id),
			newSubName: desiredSubName,
			newSecondaryName: topic ? topicSecondaryName(topic, subtopic) : suggestedNameFromBook(bookMeta, 'secondary'),
			confidence: Math.min(0.5 + mainPick.score * 0.025 + topicScore * 0.015, 0.82),
			reasoning: `القسم الرئيسي مناسب، ولا يوجد قسم فرعي كافٍ؛ إنشاء "${desiredSubName}" تحت "${main.name}".`,
			method: 'ruled_heuristic'
		};
	}

	const sub = subPick.item;
	const secPick = pickBest(sub.children || [], (sec) =>
		scoreSecondaryNode(sec, topic, subtopic, bookMeta, haystack)
	);
	const desiredSecondaryName = topic ? topicSecondaryName(topic, subtopic) : suggestedNameFromBook(bookMeta, 'secondary');
	const secThreshold = topic ? 6 : 8;

	if (!secPick.item || secPick.score < secThreshold) {
		return {
			kind: 'create_secondary',
			mainId: String(main.id),
			subId: String(sub.id),
			newSecondaryName: desiredSecondaryName,
			confidence: Math.min(0.52 + mainPick.score * 0.02 + subPick.score * 0.02, 0.86),
			reasoning: `المسار الرئيسي والفرعي مناسبان، ولا يوجد قسم ثانوي دقيق؛ إنشاء "${desiredSecondaryName}" تحت "${sub.name}".`,
			method: 'ruled_heuristic'
		};
	}

	return {
		kind: 'existing',
		mainId: String(main.id),
		subId: String(sub.id),
		secondaryId: String(secPick.item.id),
		confidence: Math.min(0.58 + mainPick.score * 0.02 + subPick.score * 0.02 + secPick.score * 0.015, 0.93),
		reasoning: `مطابقة موضوعية ضمن ${main.name} > ${sub.name} > ${secPick.item.name}.`,
		method: 'ruled_heuristic'
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

function suggestedNameFromBook(bookMeta, level) {
	const hints = uniq(bookMeta?.categoryHints || []);
	const preferred = hints.find((h) => normalizeArabic(h).length >= 4 && !/^الرئيسيه$|^home$|^كتب$/i.test(h));
	if (preferred) {
		return denormalizeArabicName(preferred.replace(/^كتب\s+(?:في|عن)\s+/u, ''));
	}
	const stem = seriesStemFromTitle(bookMeta?.title || '');
	const tokens = stem
		.split(' ')
		.filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
		.slice(0, level === 'secondary' ? 5 : 3);
	return denormalizeArabicName(tokens.join(' ') || 'كتب إسلامية عامة');
}

function haystackForReuse(bookMeta) {
	return makeHaystack(bookMeta);
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

	const decision = classifyHeuristic(sections, bookMeta);
	const sug =
		decision?.kind === 'existing'
			? decision
			: {
					mainId: decision?.mainId || '',
					subId: decision?.subId || '',
					secondaryId: '',
					confidence: decision?.confidence || 0.1,
					reasoning: decision?.reasoning || 'لا يوجد مسار قائم مناسب؛ يحتاج إنشاء قسم.',
					method: decision?.method || 'ruled_heuristic',
					create: decision
				};
	const validation =
		sug.mainId && sug.subId
			? validateHierarchyPath(
					{ mainId: sug.mainId, subId: sug.subId, secondaryId: sug.secondaryId || null },
					sections.index
				)
			: { valid: false, reason: decision?.kind || 'needs_section_creation' };
	return {
		suggested: sug,
		alternatives: [],
		validation
	};
}

/**
 * تصنيف ذاتي. يُرجع قراراً جاهزاً للتنفيذ مع ضمان مسار ثلاثي:
 * main > sub > secondary > content.
 */
export async function classifyAutonomous(sections, bookMeta) {
	const treeIsEmpty = !sections.tree || sections.tree.length === 0;

	if (treeIsEmpty) {
		throw Object.assign(
			new Error('لا توجد أقسام في قاعدة البيانات — لا يمكن إنشاء أقسام جديدة محلياً.'),
			{ reason: 'empty_sections_tree', status: 412 }
		);
	}

	const decision = classifyHeuristic(sections, bookMeta);
	if (!decision) {
		const firstMain = sections.tree[0];
		if (!firstMain) {
			throw Object.assign(new Error('لا توجد أقسام رئيسيّة صالحة بعد الفلترة.'), {
				reason: 'empty_sections_tree',
				status: 412
			});
		}
		return {
			kind: firstMain.children?.[0] ? 'create_secondary' : 'create_sub',
			mainId: String(firstMain.id),
			subId: firstMain.children?.[0] ? String(firstMain.children[0].id) : '',
			newSubName: firstMain.children?.[0] ? undefined : suggestedNameFromBook(bookMeta, 'sub'),
			newSecondaryName: suggestedNameFromBook(bookMeta, 'secondary'),
			confidence: 0.25,
			reasoning: 'لم تعطِ القواعد نتيجة كافية؛ إنشاء قسم ثانوي/فرعي بدلاً من إسقاط الكتاب في مسار عشوائي.',
			method: 'ruled_heuristic'
		};
	}
	return decision;
}
