/**
 * Gemini Classifier — يستخدم Gemini API لتنظيف بيانات الكتب وتصنيفها
 * ضمن الهيكلة الشجرية (قسم رئيسي ← فرعي ← ثانوي).
 *
 * يعمل على جانب الخادم فقط (SvelteKit server routes).
 */

const GEMINI_ENDPOINT =
	'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * @param {string} apiKey
 * @param {object} book — بيانات الكتاب الخام
 * @param {object[]} sections — الأقسام الحالية [{id, name, level, parentId}]
 * @returns {Promise<ClassificationResult>}
 *
 * @typedef {object} ClassificationResult
 * @property {string} cleanTitle
 * @property {string} cleanAuthor
 * @property {string} cleanDescription
 * @property {string|null} mainSectionId
 * @property {string|null} mainSectionName
 * @property {string|null} subSectionId
 * @property {string|null} subSectionName
 * @property {string|null} secondarySectionId
 * @property {string|null} secondarySectionName
 * @property {string} contentType
 * @property {number} confidence — 0-100
 * @property {string} reasoning
 */
export async function classifyWithGemini(apiKey, book, sections) {
	if (!apiKey) {
		throw new Error('GEMINI_API_KEY غير مُعرَّف');
	}

	const mainSections = sections.filter((s) => s.level === 'main');
	const subSections = sections.filter((s) => s.level === 'sub');
	const secondarySections = sections.filter((s) => s.level === 'secondary');

	const sectionsContext = buildSectionsContext(mainSections, subSections, secondarySections);

	const prompt = `أنت مُصنِّف محتوى ذكي لمنصة "نبراس" التعليمية الإسلامية.

مهمّتك:
1. تنظيف بيانات الكتاب (عنوان، مؤلف، وصف) — إزالة الرموز الزائدة والتنسيق.
2. تحديد التصنيف الأنسب من الأقسام المتاحة أدناه.
3. تحديد نوع المحتوى (document, audio, video).

=== بيانات الكتاب الخام ===
العنوان: ${book.title || 'غير معروف'}
المؤلف: ${book.author || 'غير معروف'}
الوصف: ${(book.description || '').slice(0, 500)}
التصنيف الأصلي من المصدر: ${book.category || 'غير محدد'}
اللغة: ${book.language || 'عربي'}
نوع الملف: ${book.fileType || 'PDF'}

=== الأقسام المتاحة في نبراس ===
${sectionsContext || 'لا توجد أقسام حالياً — اقترح أقساماً مناسبة.'}

=== التعليمات ===
- إن وجدت قسماً مطابقاً أو قريباً، أعِد معرّفه (id).
- إن لم تجد أيّ تطابق، اترك الحقول null واقترح اسماً للقسم الجديد.
- الثقة (confidence): 0-100 تعبّر عن مدى يقينك بالتصنيف.

أجب بصيغة JSON فقط (بدون markdown):
{
  "cleanTitle": "...",
  "cleanAuthor": "...",
  "cleanDescription": "...",
  "mainSectionId": "..." أو null,
  "mainSectionName": "...",
  "subSectionId": "..." أو null,
  "subSectionName": "...",
  "secondarySectionId": "..." أو null,
  "secondarySectionName": "...",
  "contentType": "document",
  "confidence": 85,
  "reasoning": "..."
}`;

	const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			contents: [{ parts: [{ text: prompt }] }],
			generationConfig: {
				temperature: 0.2,
				maxOutputTokens: 1024,
				responseMimeType: 'application/json'
			}
		})
	});

	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		const msg = err?.error?.message || `Gemini HTTP ${response.status}`;
		throw new Error(`Gemini API error: ${msg}`);
	}

	const data = await response.json();
	const text =
		data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
	}
}

/**
 * تصنيف بديل بدون Gemini — يعتمد على مطابقة نصّية بسيطة.
 * يُستخدم كـ fallback عند عدم توفر مفتاح Gemini أو استنفاد الحصة.
 */
export function classifyWithFallback(book, sections) {
	const mainSections = sections.filter((s) => s.level === 'main');
	const subSections = sections.filter((s) => s.level === 'sub');

	const textToMatch = [
		book.title || '',
		book.author || '',
		book.category || '',
		book.description || ''
	]
		.join(' ')
		.toLowerCase();

	let bestMain = null;
	let bestMainScore = 0;
	for (const sec of mainSections) {
		const score = fuzzyScore(sec.name, textToMatch);
		if (score > bestMainScore) {
			bestMainScore = score;
			bestMain = sec;
		}
	}

	let bestSub = null;
	let bestSubScore = 0;
	if (bestMain) {
		const children = subSections.filter(
			(s) => String(s.parentId) === String(bestMain.id)
		);
		for (const sec of children) {
			const score = fuzzyScore(sec.name, textToMatch);
			if (score > bestSubScore) {
				bestSubScore = score;
				bestSub = sec;
			}
		}
	}

	return {
		cleanTitle: (book.title || '').trim(),
		cleanAuthor: (book.author || '').trim(),
		cleanDescription: (book.description || '').trim(),
		mainSectionId: bestMain?.id || null,
		mainSectionName: bestMain?.name || book.category || 'غير مصنّف',
		subSectionId: bestSub?.id || null,
		subSectionName: bestSub?.name || null,
		secondarySectionId: null,
		secondarySectionName: null,
		contentType: 'document',
		confidence: bestMainScore > 0 ? Math.min(bestMainScore * 20, 70) : 10,
		reasoning: bestMain
			? `Fallback: matched main="${bestMain.name}" (score=${bestMainScore})`
			: 'Fallback: no matching section found'
	};
}

function fuzzyScore(sectionName, text) {
	const words = sectionName
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w.length > 2);
	let hits = 0;
	for (const w of words) {
		if (text.includes(w)) hits++;
	}
	return words.length > 0 ? hits / words.length : 0;
}

function buildSectionsContext(mains, subs, secondaries) {
	if (mains.length === 0) return '';

	const lines = [];
	for (const main of mains) {
		lines.push(`[رئيسي] id=${main.id} | ${main.name}`);
		const children = subs.filter(
			(s) => String(s.parentId) === String(main.id)
		);
		for (const sub of children) {
			lines.push(`  [فرعي] id=${sub.id} | ${sub.name}`);
			const grandchildren = secondaries.filter(
				(s) => String(s.parentId) === String(sub.id)
			);
			for (const sec of grandchildren) {
				lines.push(`    [ثانوي] id=${sec.id} | ${sec.name}`);
			}
		}
	}
	return lines.join('\n');
}
