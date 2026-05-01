/**
 * Smart Classifier — تصنيف ذكي باستخدام Gemini مع حرية إنشاء أقسام جديدة.
 *
 * القواعد:
 * - لا يحشر كتاب في قسم غير مناسب.
 * - يمكنه إنشاء أقسام رئيسية/فرعية/ثانوية جديدة.
 * - يحترم التصنيف العلمي الدقيق للمكتبات الإسلامية.
 * - يستخدم تصنيف مكتبة نور كمرجع أساسي.
 */

const GEMINI_ENDPOINT =
	'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const BLACKLISTED_SECTIONS = ['دروس بتدكصهك'];

/**
 * يُنقّي شجرة الأقسام من الأقسام المحظورة قبل إرسالها لـ Gemini.
 */
function filterBlacklisted(sections) {
	const blacklistedIds = new Set();

	for (const sec of sections) {
		if (sec.level === 'main' && BLACKLISTED_SECTIONS.includes(sec.name?.trim())) {
			blacklistedIds.add(sec.id);
		}
	}

	if (blacklistedIds.size === 0) return sections;

	const childrenOfBlacklisted = new Set();
	for (const sec of sections) {
		if (sec.level === 'sub' && blacklistedIds.has(sec.parentId)) {
			childrenOfBlacklisted.add(sec.id);
		}
	}
	for (const sec of sections) {
		if (sec.level === 'secondary' && childrenOfBlacklisted.has(sec.parentId)) {
			childrenOfBlacklisted.add(sec.id);
		}
	}

	const allBlocked = new Set([...blacklistedIds, ...childrenOfBlacklisted]);
	return sections.filter((s) => !allBlocked.has(s.id));
}

function buildSectionsTree(sections) {
	const filtered = filterBlacklisted(sections);
	const mains = filtered.filter((s) => s.level === 'main');
	const subs = filtered.filter((s) => s.level === 'sub');
	const secs = filtered.filter((s) => s.level === 'secondary');

	if (mains.length === 0) return 'لا توجد أقسام حالياً. أنشئ التصنيف من الصفر.';

	const lines = [];
	for (const main of mains) {
		lines.push(`[رئيسي id=${main.id}] ${main.name}`);
		const children = subs.filter((s) => String(s.parentId) === String(main.id));
		for (const sub of children) {
			lines.push(`  └─ [فرعي id=${sub.id}] ${sub.name}`);
			const grandchildren = secs.filter((s) => String(s.parentId) === String(sub.id));
			for (const sec of grandchildren) {
				lines.push(`      └─ [ثانوي id=${sec.id}] ${sec.name}`);
			}
		}
	}
	return lines.join('\n');
}

const SYSTEM_PROMPT = `أنت خبير متمرّس في فهرسة المكتبات العربية والإسلامية. مهمتك تصنيف الكتب بناءً على العنوان، المؤلف، الوصف، وتصنيف مكتبة نور الأصلي.

قواعد صارمة:
1. المنطق العلمي: لا تضع أبداً (أصول الفقه) تحت (القرآن)، ولا (التاريخ) تحت (العقيدة)، ولا (السيرة النبوية) تحت (الفقه). احترم التصنيف العلمي الدقيق.
2. الحرية المطلقة: إذا لم تجد قسماً (رئيسياً أو فرعياً أو ثانوياً) يطابق الكتاب بدقة، أنشئه فوراً بناءً على تصنيف مكتبة نور الأصلي. لا تحشر كتاباً في قسم غير مناسب أبداً.
3. الأقسام المترابطة: اجعل الشجرة منطقية ومترابطة. استخدم أسماء عربية واضحة.
4. القسم المحظور: لا تستخدم أو تُشر إلى أي قسم يحمل اسم "دروس بتدكصهك" — هذا قسم محظور تماماً.

أجب بصيغة JSON فقط (بدون markdown blocks):
{
  "decision": "use_existing" | "create_sub" | "create_secondary" | "create_main",
  "mainSectionId": "id" أو null (إن كنت ستستخدم قسم رئيسي موجود),
  "mainSectionName": "اسم القسم الرئيسي (موجود أو جديد)",
  "subSectionId": "id" أو null,
  "subSectionName": "اسم القسم الفرعي (موجود أو جديد)",
  "secondarySectionId": "id" أو null,
  "secondarySectionName": "اسم القسم الثانوي (موجود أو جديد)" أو null,
  "cleanTitle": "العنوان المنظّف بالعربية",
  "cleanAuthor": "اسم المؤلف المنظّف",
  "cleanDescription": "وصف مختصر بالعربية (سطر أو سطرين)",
  "contentType": "document",
  "confidence": 0-100,
  "reasoning": "تبرير مختصر"
}`;

/**
 * تصنيف ذكي عبر Gemini.
 * @param {string} apiKey
 * @param {object} book — { title, author, description, category, language, pages, fileSize }
 * @param {object[]} sections — [{ id, name, level, parentId }]
 * @returns {Promise<ClassificationResult>}
 */
export async function classifyBook(apiKey, book, sections) {
	if (!apiKey) throw new Error('GEMINI_API_KEY مطلوب');

	const tree = buildSectionsTree(sections);

	const userPrompt = `=== الكتاب ===
العنوان: ${book.title || 'غير معروف'}
المؤلف: ${book.author || 'غير معروف'}
الوصف: ${(book.description || '').slice(0, 600)}
تصنيف مكتبة نور: ${book.category || 'غير محدد'}
اللغة: ${book.language || 'عربي'}
عدد الصفحات: ${book.pages || '—'}
نوع الملف: ${book.extension || 'PDF'}

=== شجرة الأقسام الحالية في نبراس ===
${tree}

=== المطلوب ===
صنّف هذا الكتاب. إذا لم يوجد قسم مناسب، أنشئه. لا تحشر الكتاب في قسم غير دقيق.`;

	const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
			contents: [{ parts: [{ text: userPrompt }] }],
			generationConfig: {
				temperature: 0.1,
				maxOutputTokens: 800,
				responseMimeType: 'application/json'
			}
		})
	});

	if (!response.ok) {
		const err = await response.json().catch(() => ({}));
		throw new Error(`Gemini ${response.status}: ${err?.error?.message || 'unknown'}`);
	}

	const data = await response.json();
	const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

	try {
		return JSON.parse(text);
	} catch {
		throw new Error(`Gemini JSON invalid: ${text.slice(0, 200)}`);
	}
}

/**
 * تصنيف بديل بدون Gemini — أذكى من النسخة السابقة.
 * يستخدم تصنيف مكتبة نور مباشرة كاسم للقسم الرئيسي.
 */
export function classifyFallback(book, sections) {
	const filtered = filterBlacklisted(sections);
	const mains = filtered.filter((s) => s.level === 'main');
	const subs = filtered.filter((s) => s.level === 'sub');

	const noorCategory = (book.category || '').trim();
	const bookTitle = (book.title || '').trim();

	let matchedMain = null;
	for (const m of mains) {
		if (normalize(m.name) === normalize(noorCategory)) {
			matchedMain = m;
			break;
		}
	}

	let matchedSub = null;
	if (matchedMain) {
		const children = subs.filter((s) => String(s.parentId) === String(matchedMain.id));
		for (const s of children) {
			if (normalize(s.name) === normalize(bookTitle)) {
				matchedSub = s;
				break;
			}
		}
	}

	const decision = matchedMain ? (matchedSub ? 'use_existing' : 'create_sub') : 'create_main';

	return {
		decision,
		mainSectionId: matchedMain?.id || null,
		mainSectionName: matchedMain?.name || noorCategory || 'غير مصنّف',
		subSectionId: matchedSub?.id || null,
		subSectionName: matchedSub?.name || bookTitle,
		secondarySectionId: null,
		secondarySectionName: null,
		cleanTitle: bookTitle,
		cleanAuthor: (book.author || '').trim(),
		cleanDescription: (book.description || '').trim().slice(0, 300),
		contentType: 'document',
		confidence: matchedMain ? 60 : 30,
		reasoning: `Fallback: ${decision} — noor category="${noorCategory}"`
	};
}

function normalize(str) {
	return String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export { BLACKLISTED_SECTIONS, filterBlacklisted };
