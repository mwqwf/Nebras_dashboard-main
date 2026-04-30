/**
 * Fetcher Engine — محرّك الجلب الكامل (client-side).
 *
 * يُنسّق العمليّة كاملة: جلب → تصنيف → إنشاء أقسام → تخزين.
 *
 * إذا كان Firebase مُهيّأً: يستخدم RTDB مباشرة (نفس آلية لوحة التحكم).
 * إذا لم يكن: يستخدم مخزن محلّي (localDb) يعمل في الذاكرة.
 */

import { getFirebaseDatabase } from '$lib/firebase/client.js';
import { ref as dbRef, set } from 'firebase/database';
import {
	findLocalMainByName,
	findLocalSubByName,
	createLocalMainSection,
	createLocalSubSection,
	storeLocalFile,
	listLocalMainSections,
	listLocalSubSections,
	listLocalFiles,
	getLocalStats
} from '$lib/fetcher/localDb.js';

const CONTENT_ROOT = 'content_unified';
const UPLOADS_ROOT = 'dashboard_uploads';

function makeId() {
	return Date.now() + Math.floor(Math.random() * 1000);
}

function isFirebaseReady() {
	try {
		return !!getFirebaseDatabase();
	} catch {
		return false;
	}
}

function normalize(str) {
	return String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * يبحث عن قسم رئيسي بالاسم — أو يُنشئه إن لم يوجد.
 * يعمل مع Firebase RTDB أو المخزن المحلّي.
 */
async function findOrCreateMainSection(name) {
	if (!name) return null;

	if (isFirebaseReady()) {
		const db = getFirebaseDatabase();
		const { get } = await import('firebase/database');
		const snap = await get(dbRef(db, 'sections_unified/main'));
		const all = snap.exists() ? Object.values(snap.val() || {}) : [];
		const match = all.find((m) => normalize(m.name) === normalize(name));
		if (match) return { id: String(match.id), name: match.name, created: false };

		const id = makeId();
		const section = {
			id, name: name.trim(), order_index: 0, is_listed: true,
			thumbnail: null, created_at: new Date().toISOString()
		};
		await set(dbRef(db, `sections_unified/main/${id}`), section);
		return { id: String(id), name: section.name, created: true };
	}

	const existing = findLocalMainByName(name);
	if (existing) return { id: String(existing.id), name: existing.name, created: false };
	const created = createLocalMainSection({ name });
	return { id: String(created.id), name: created.name, created: true };
}

/**
 * يبحث عن قسم فرعي — أو يُنشئه.
 */
async function findOrCreateSubSection(name, mainSectionId) {
	if (!name || !mainSectionId) return null;

	if (isFirebaseReady()) {
		const db = getFirebaseDatabase();
		const { get } = await import('firebase/database');
		const snap = await get(dbRef(db, 'sections_unified/sub'));
		const all = snap.exists() ? Object.values(snap.val() || {}) : [];
		const match = all.find(
			(s) => normalize(s.name) === normalize(name) && String(s.main_section) === String(mainSectionId)
		);
		if (match) return { id: String(match.id), name: match.name, created: false };

		const id = makeId();
		const section = {
			id, name: name.trim(), main_section: Number(mainSectionId) || mainSectionId,
			is_listed: true, thumbnail: null, created_at: new Date().toISOString()
		};
		await set(dbRef(db, `sections_unified/sub/${id}`), section);
		return { id: String(id), name: section.name, created: true };
	}

	const existing = findLocalSubByName(name, mainSectionId);
	if (existing) return { id: String(existing.id), name: existing.name, created: false };
	const created = createLocalSubSection({ name, main_section: mainSectionId });
	return { id: String(created.id), name: created.name, created: true };
}

/**
 * يُخزّن كتاب — في RTDB أو المخزن المحلّي.
 */
async function storeContent(book, classification, sectionIds) {
	const id = makeId();
	const createdAt = new Date().toISOString();

	const payload = {
		id, fileId: id,
		filename: `${classification.cleanTitle || book.title}.pdf`,
		fileType: book.fileType || 'PDF', fileSize: 0,
		file_url: book.sourceUrl || '',
		downloadUrl: book.downloadUrl || book.sourceUrl || '',
		sourceUrl: book.sourceUrl || '',
		upload_type: 'fetcher', upload_status: 'completed', storagePath: '',
		title: classification.cleanTitle || book.title,
		description: classification.cleanDescription || book.description || '',
		author: classification.cleanAuthor || book.author || '',
		content_type: classification.contentType || 'document',
		subsection: sectionIds.subId || null,
		subsection_name: sectionIds.subName || null,
		secondary_subsection: sectionIds.secondaryId || null,
		secondary_subsection_name: sectionIds.secondaryName || null,
		main_section: sectionIds.mainId || null,
		main_section_id: sectionIds.mainId || null,
		main_section_name: sectionIds.mainName || null,
		metadata: {
			title: classification.cleanTitle || book.title,
			description: classification.cleanDescription || book.description || '',
			author: classification.cleanAuthor || book.author || '',
			content_type: classification.contentType || 'document',
			is_listed: true,
			subsection: sectionIds.subId || null,
			secondary_subsection: sectionIds.secondaryId || null,
			main_section: sectionIds.mainId || null,
			main_section_name: sectionIds.mainName || null,
			subsection_name: sectionIds.subName || null,
			secondary_subsection_name: sectionIds.secondaryName || null,
			thumbnail: book.thumbnailUrl || null,
			created_at: createdAt,
			source_provider: book._providerId || 'noor-library',
			source_external_id: book.externalId || null,
			source_category: book.category || null,
			ai_confidence: classification.confidence || 0,
			ai_reasoning: classification.reasoning || ''
		},
		createdAt
	};

	if (isFirebaseReady()) {
		const db = getFirebaseDatabase();
		await set(dbRef(db, `${CONTENT_ROOT}/files/${id}`), payload);
		await set(dbRef(db, `${UPLOADS_ROOT}/${id}`), payload);
		return { stored: true, id, payload, storageMode: 'firebase' };
	}

	const result = storeLocalFile(payload);
	return { stored: true, id: result.id, payload, storageMode: 'local' };
}

/**
 * العمليّة الكاملة: جلب → تصنيف → إنشاء أقسام → تخزين.
 */
export async function runFullPipeline({
	providerId,
	category,
	limit = 3,
	onProgress = () => {}
}) {
	const results = [];
	const createdSections = { main: [], sub: [], secondary: [] };
	const storageMode = isFirebaseReady() ? 'firebase' : 'local';

	onProgress('fetching', { message: 'جاري جلب الكتب من المصدر...' });

	const fetchRes = await fetch('/api/fetcher/fetch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ provider: providerId, category, limit, useGemini: false })
	});

	if (!fetchRes.ok) {
		const err = await fetchRes.json().catch(() => ({}));
		throw new Error(err.error || 'فشل جلب الكتب');
	}

	const fetchData = await fetchRes.json();
	const books = fetchData.results || [];

	onProgress('fetched', {
		message: `تمّ جلب ${books.length} كتاب (التخزين: ${storageMode === 'firebase' ? 'Firebase RTDB' : 'مخزن محلّي'})`,
		count: books.length
	});

	for (let i = 0; i < books.length; i++) {
		const bookResult = books[i];
		const classification = bookResult.classification || {};
		const book = {
			title: bookResult.title,
			externalId: bookResult.externalId,
			sourceUrl: `https://www.noor-book.com/en/ebook-${encodeURIComponent((bookResult.title || '').replace(/\s+/g, '-'))}-pdf`,
			author: classification.cleanAuthor || '',
			description: classification.cleanDescription || '',
			category, fileType: 'PDF', thumbnailUrl: null,
			_providerId: providerId
		};

		onProgress('processing', { message: `معالجة (${i + 1}/${books.length}): ${book.title}`, index: i + 1, total: books.length });

		try {
			const mainName = classification.mainSectionName || category || 'غير مصنّف';
			const subName = classification.subSectionName || null;

			onProgress('creating_sections', { message: `إنشاء/بحث القسم الرئيسي: ${mainName}`, bookTitle: book.title });

			const mainResult = await findOrCreateMainSection(mainName);
			if (mainResult?.created) createdSections.main.push(mainResult);

			let subResult = null;
			if (mainResult) {
				const sn = subName || book.title;
				onProgress('creating_sections', { message: `إنشاء/بحث القسم الفرعي: ${sn}`, bookTitle: book.title });
				subResult = await findOrCreateSubSection(sn, mainResult.id);
				if (subResult?.created) createdSections.sub.push(subResult);
			}

			const sectionIds = {
				mainId: mainResult?.id || null,
				mainName: mainResult?.name || mainName,
				subId: subResult?.id || null,
				subName: subResult?.name || null,
				secondaryId: null,
				secondaryName: null
			};

			onProgress('storing', { message: `تخزين الكتاب: ${book.title}`, bookTitle: book.title });

			const storeResult = await storeContent(book, classification, sectionIds);

			results.push({
				book: book.title,
				author: book.author,
				status: 'stored',
				storedId: storeResult.id,
				storageMode: storeResult.storageMode,
				sections: sectionIds,
				sectionsCreated: { main: mainResult?.created || false, sub: subResult?.created || false }
			});

			onProgress('stored', {
				message: `✅ تمّ تخزين: ${book.title} (${storeResult.storageMode === 'firebase' ? 'RTDB' : 'محلّي'})`,
				bookTitle: book.title, storedId: storeResult.id
			});
		} catch (err) {
			results.push({ book: book.title, status: 'error', error: err?.message || String(err) });
			onProgress('error', { message: `❌ خطأ: ${book.title} — ${err?.message}`, bookTitle: book.title, error: err?.message });
		}
	}

	const summary = {
		total: results.length,
		stored: results.filter((r) => r.status === 'stored').length,
		errors: results.filter((r) => r.status === 'error').length,
		sectionsCreated: createdSections.main.length + createdSections.sub.length + createdSections.secondary.length,
		storageMode
	};

	onProgress('complete', { message: `اكتملت العمليّة: ${summary.stored} مُخزّن، ${summary.sectionsCreated} قسم جديد`, ...summary });

	return { results, createdSections, summary };
}

export { listLocalMainSections, listLocalSubSections, listLocalFiles, getLocalStats };
