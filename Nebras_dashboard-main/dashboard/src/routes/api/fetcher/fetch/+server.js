/**
 * POST /api/fetcher/fetch — يبدأ عملية جلب + تصنيف + تخزين.
 *
 * Body: { provider, category, limit?, useGemini? }
 *
 * يجلب الكتب من المزوّد، يصنّفها عبر Gemini (أو fallback)،
 * ويحفظ النتائج في RTDB بنفس هيكلة الأقسام الحالية.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getProvider } from '$lib/fetcher/registry.js';
import {
	classifyWithGemini,
	classifyWithFallback
} from '$lib/fetcher/geminiClassifier.js';
import {
	createJob,
	updateJob,
	addSuccessLog,
	addErrorLog
} from '$lib/fetcher/store.js';

function readSections(db) {
	return [];
}

let _sectionsCache = null;
let _sectionsCacheTime = 0;
const SECTIONS_CACHE_TTL = 60000;

async function loadSections() {
	const now = Date.now();
	if (_sectionsCache && now - _sectionsCacheTime < SECTIONS_CACHE_TTL) {
		return _sectionsCache;
	}

	try {
		const { getAdminDatabase, isAdminConfigured } = await import(
			'$lib/server/firebaseAdmin.js'
		);
		if (!isAdminConfigured()) return [];

		const db = getAdminDatabase();
		const mainSnap = await db.ref('sections_unified/main').get();
		const subSnap = await db.ref('sections_unified/sub').get();
		const secSnap = await db.ref('sections_unified/secondary').get();

		const sections = [];

		if (mainSnap.exists()) {
			for (const [id, val] of Object.entries(mainSnap.val() || {})) {
				sections.push({
					id: String(id),
					name: val.name || '',
					level: 'main',
					parentId: null
				});
			}
		}
		if (subSnap.exists()) {
			for (const [id, val] of Object.entries(subSnap.val() || {})) {
				sections.push({
					id: String(id),
					name: val.name || '',
					level: 'sub',
					parentId: val.main_section != null ? String(val.main_section) : null
				});
			}
		}
		if (secSnap.exists()) {
			for (const [id, val] of Object.entries(secSnap.val() || {})) {
				sections.push({
					id: String(id),
					name: val.name || '',
					level: 'secondary',
					parentId: val.sub_section != null ? String(val.sub_section) : null
				});
			}
		}

		_sectionsCache = sections;
		_sectionsCacheTime = now;
		return sections;
	} catch (err) {
		console.warn('[fetcher] Failed to load sections from RTDB:', err?.message);
		return _sectionsCache || [];
	}
}

async function storeBookInRtdb(book, classification) {
	try {
		const { getAdminDatabase, isAdminConfigured } = await import(
			'$lib/server/firebaseAdmin.js'
		);
		if (!isAdminConfigured()) {
			return { stored: false, reason: 'Firebase Admin not configured' };
		}

		const db = getAdminDatabase();
		const id = Date.now() + Math.floor(Math.random() * 1000);
		const createdAt = new Date().toISOString();

		const payload = {
			id,
			fileId: id,
			filename: `${classification.cleanTitle || book.title}.pdf`,
			fileType: book.fileType || 'PDF',
			fileSize: 0,
			file_url: book.sourceUrl || '',
			downloadUrl: book.downloadUrl || book.sourceUrl || '',
			sourceUrl: book.sourceUrl || '',
			upload_type: 'fetcher',
			upload_status: 'completed',
			storagePath: '',
			metadata: {
				title: classification.cleanTitle || book.title,
				description: classification.cleanDescription || book.description || '',
				author: classification.cleanAuthor || book.author || '',
				content_type: classification.contentType || 'document',
				is_listed: true,
				subsection: classification.subSectionId || null,
				secondary_subsection: classification.secondarySectionId || null,
				main_section: classification.mainSectionId || null,
				main_section_name: classification.mainSectionName || null,
				subsection_name: classification.subSectionName || null,
				secondary_subsection_name: classification.secondarySectionName || null,
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

		await db.ref(`content_unified/files/${id}`).set(payload);
		await db.ref(`dashboard_uploads/${id}`).set(payload);

		return { stored: true, id };
	} catch (err) {
		return { stored: false, reason: err?.message || String(err) };
	}
}

export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { provider: providerId, category, limit = 5, useGemini = true } = body;

	if (!providerId) {
		return json({ error: 'provider is required' }, { status: 400 });
	}

	const provider = getProvider(providerId);
	if (!provider) {
		return json({ error: `Unknown provider: ${providerId}` }, { status: 404 });
	}

	const job = createJob(providerId, category || 'default');
	updateJob(job.id, { status: 'running' });

	const geminiKey =
		env.GEMINI_API_KEY ||
		process.env.GEMINI_API_KEY ||
		'';

	try {
		const result = await provider.fetchBooks({
			category: category || undefined,
			page: 1,
			limit: Number(limit) || 5
		});

		updateJob(job.id, { totalFetched: result.books.length });

		const sections = await loadSections();

		const results = [];

		for (const book of result.books) {
			try {
				let classification;
				if (useGemini && geminiKey) {
					try {
						classification = await classifyWithGemini(
							geminiKey,
							book,
							sections
						);
					} catch (geminiErr) {
						classification = classifyWithFallback(book, sections);
						classification.reasoning =
							`Gemini fallback: ${geminiErr?.message}. ` +
							classification.reasoning;
					}
				} else {
					classification = classifyWithFallback(book, sections);
				}

				updateJob(job.id, {
					totalClassified: (job.totalClassified || 0) + 1
				});

				const storeResult = await storeBookInRtdb(
					{ ...book, _providerId: providerId },
					classification
				);

				if (storeResult.stored) {
					updateJob(job.id, {
						totalStored: (job.totalStored || 0) + 1
					});
					addSuccessLog({
						jobId: job.id,
						providerId,
						externalId: book.externalId,
						title: classification.cleanTitle || book.title,
						category: book.category,
						mainSection: classification.mainSectionName,
						subSection: classification.subSectionName,
						secondarySection: classification.secondarySectionName,
						confidence: classification.confidence,
						reasoning: classification.reasoning
					});
					results.push({
						externalId: book.externalId,
						title: classification.cleanTitle || book.title,
						status: 'stored',
						storedId: storeResult.id,
						classification
					});
				} else {
					updateJob(job.id, {
						totalErrors: (job.totalErrors || 0) + 1
					});
					addErrorLog({
						jobId: job.id,
						providerId,
						externalId: book.externalId,
						title: book.title,
						error: `Storage failed: ${storeResult.reason}`
					});
					results.push({
						externalId: book.externalId,
						title: book.title,
						status: 'classified_not_stored',
						classification,
						storeError: storeResult.reason
					});
				}
			} catch (bookErr) {
				updateJob(job.id, {
					totalErrors: (job.totalErrors || 0) + 1
				});
				addErrorLog({
					jobId: job.id,
					providerId,
					externalId: book.externalId,
					title: book.title,
					error: bookErr?.message || String(bookErr)
				});
				results.push({
					externalId: book.externalId,
					title: book.title,
					status: 'error',
					error: bookErr?.message
				});
			}
		}

		updateJob(job.id, {
			status: 'completed',
			completedAt: new Date().toISOString()
		});

		return json({
			job: { id: job.id, status: 'completed' },
			fetched: result.books.length,
			results,
			hasMore: result.hasMore
		});
	} catch (err) {
		updateJob(job.id, {
			status: 'failed',
			error: err?.message || String(err),
			completedAt: new Date().toISOString()
		});
		return json(
			{
				error: 'Fetch operation failed',
				detail: err?.message,
				jobId: job.id
			},
			{ status: 500 }
		);
	}
}
