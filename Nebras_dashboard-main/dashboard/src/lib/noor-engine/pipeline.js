/**
 * Noor Engine Pipeline — تنسيق العمليّة الكاملة.
 *
 * جلب (Puppeteer) → تفاصيل → تصنيف (Gemini) → إنشاء أقسام → تخزين.
 * يعمل على جانب الخادم فقط.
 */

import { scrapeCategory, scrapeBookDetail } from './scraper.js';
import { classifyBook, classifyFallback } from './classifier.js';
import { resolveSections, ENGINE_TAG } from './sectionsCreator.js';

const CONTENT_ROOT = 'content_unified/files';
const UPLOADS_ROOT = 'dashboard_uploads';
const PROVIDER_TAG = 'noor-library';

function makeId() {
	return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * تحميل شجرة الأقسام الحالية من RTDB.
 */
async function loadSectionsFromDb(db) {
	const sections = [];

	const mainSnap = await db.ref('sections_unified/main').get();
	if (mainSnap.exists()) {
		for (const [id, val] of Object.entries(mainSnap.val() || {})) {
			sections.push({ id: String(id), name: val.name || '', level: 'main', parentId: null });
		}
	}

	const subSnap = await db.ref('sections_unified/sub').get();
	if (subSnap.exists()) {
		for (const [id, val] of Object.entries(subSnap.val() || {})) {
			sections.push({
				id: String(id), name: val.name || '', level: 'sub',
				parentId: val.main_section != null ? String(val.main_section) : null
			});
		}
	}

	const secSnap = await db.ref('sections_unified/secondary').get();
	if (secSnap.exists()) {
		for (const [id, val] of Object.entries(secSnap.val() || {})) {
			sections.push({
				id: String(id), name: val.name || '', level: 'secondary',
				parentId: val.sub_section != null ? String(val.sub_section) : null
			});
		}
	}

	return sections;
}

/**
 * تخزين كتاب في RTDB.
 */
async function storeBook(db, book, classification, resolvedSections) {
	const id = makeId();
	const createdAt = new Date().toISOString();

	const payload = {
		id,
		fileId: id,
		filename: `${classification.cleanTitle || book.title}.pdf`,
		fileType: book.extension || 'PDF',
		fileSize: book.fileSize || '',
		file_url: book.sourceUrl || '',
		downloadUrl: book.sourceUrl || '',
		sourceUrl: book.sourceUrl || '',
		upload_type: 'fetcher',
		upload_status: 'completed',
		storagePath: '',
		title: classification.cleanTitle || book.title,
		author: classification.cleanAuthor || book.author || '',
		description: classification.cleanDescription || book.description || '',
		content_type: 'document',
		subsection: resolvedSections.subId || null,
		subsection_name: resolvedSections.subName || null,
		secondary_subsection: resolvedSections.secondaryId || null,
		secondary_subsection_name: resolvedSections.secondaryName || null,
		main_section: resolvedSections.mainId || null,
		main_section_id: resolvedSections.mainId || null,
		main_section_name: resolvedSections.mainName || null,
		metadata: {
			title: classification.cleanTitle || book.title,
			description: classification.cleanDescription || book.description || '',
			author: classification.cleanAuthor || book.author || '',
			content_type: 'document',
			is_listed: true,
			subsection: resolvedSections.subId || null,
			secondary_subsection: resolvedSections.secondaryId || null,
			main_section: resolvedSections.mainId || null,
			main_section_name: resolvedSections.mainName || null,
			subsection_name: resolvedSections.subName || null,
			secondary_subsection_name: resolvedSections.secondaryName || null,
			thumbnail: book.thumbnail || null,
			created_at: createdAt,
			source_provider: PROVIDER_TAG,
			source_url: book.sourceUrl || null,
			source_category: book.category || null,
			noor_pages: book.pages || null,
			noor_file_size: book.fileSize || null,
			ai_confidence: classification.confidence || 0,
			ai_decision: classification.decision || 'unknown',
			ai_reasoning: classification.reasoning || ''
		},
		__provider: PROVIDER_TAG,
		__createdBy: ENGINE_TAG,
		createdAt
	};

	await db.ref(`${CONTENT_ROOT}/${id}`).set(payload);
	await db.ref(`${UPLOADS_ROOT}/${id}`).set(payload);

	return { id, title: payload.title };
}

/**
 * تشغيل خط الأنابيب الكامل لتصنيف واحد.
 *
 * @param {object} opts
 * @param {import('firebase-admin/database').Database} opts.db
 * @param {string} opts.geminiKey
 * @param {string} opts.categorySlug
 * @param {number} opts.limit
 * @param {boolean} opts.fetchDetails — هل نجلب التفاصيل لكلّ كتاب
 * @param {function} opts.onProgress — callback(event)
 */
export async function runPipeline({
	db,
	geminiKey,
	categorySlug,
	limit = 5,
	fetchDetails = true,
	onProgress = () => {}
}) {
	const results = { stored: [], errors: [], sectionsCreated: [] };

	onProgress({ type: 'start', message: `بدء جلب "${categorySlug}"...` });

	const rawBooks = await scrapeCategory(categorySlug, 1);
	const books = rawBooks.slice(0, limit);

	onProgress({ type: 'fetched', message: `تمّ جلب ${books.length} كتاب من مكتبة نور`, count: books.length });

	for (let i = 0; i < books.length; i++) {
		const book = books[i];
		onProgress({ type: 'processing', message: `(${i + 1}/${books.length}) ${book.title}`, index: i });

		try {
			let detail = { ...book, category: categorySlug.replace(/-/g, ' ') };
			if (fetchDetails && book.sourceUrl) {
				onProgress({ type: 'detail', message: `جلب تفاصيل: ${book.title}` });
				const scraped = await scrapeBookDetail(book.sourceUrl);
				detail = { ...detail, ...scraped, sourceUrl: book.sourceUrl, thumbnail: scraped.thumbnail || book.thumbnail };
			}

			const sections = await loadSectionsFromDb(db);

			let classification;
			if (geminiKey) {
				try {
					classification = await classifyBook(geminiKey, detail, sections);
					onProgress({ type: 'classified', message: `Gemini: ${classification.decision} — ${classification.mainSectionName}` });
				} catch (gemErr) {
					classification = classifyFallback(detail, sections);
					classification.reasoning = `Gemini error: ${gemErr.message}. ${classification.reasoning}`;
					onProgress({ type: 'warn', message: `Gemini فشل، fallback: ${gemErr.message}` });
				}
			} else {
				classification = classifyFallback(detail, sections);
			}

			onProgress({ type: 'sections', message: `إنشاء/ربط أقسام: ${classification.mainSectionName}` });
			const resolved = await resolveSections(db, classification);

			if (resolved.created.length > 0) {
				results.sectionsCreated.push(...resolved.created);
				onProgress({ type: 'created', message: `أقسام جديدة: ${resolved.created.join(', ')}` });
			}

			onProgress({ type: 'storing', message: `تخزين: ${classification.cleanTitle || book.title}` });
			const stored = await storeBook(db, detail, classification, resolved);

			results.stored.push({
				id: stored.id,
				title: stored.title,
				mainSection: resolved.mainName,
				subSection: resolved.subName,
				confidence: classification.confidence,
				decision: classification.decision
			});

			onProgress({ type: 'stored', message: `✅ ${stored.title} → ${resolved.mainName} / ${resolved.subName || '—'}` });
		} catch (err) {
			results.errors.push({ title: book.title, error: err.message });
			onProgress({ type: 'error', message: `❌ ${book.title}: ${err.message}` });
		}
	}

	onProgress({
		type: 'complete',
		message: `اكتمل: ${results.stored.length} مُخزّن، ${results.errors.length} خطأ، ${results.sectionsCreated.length} قسم جديد`
	});

	return results;
}

export { PROVIDER_TAG, ENGINE_TAG };
