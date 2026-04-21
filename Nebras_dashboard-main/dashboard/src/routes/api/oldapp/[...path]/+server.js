/**
 * /api/oldapp/[...path] — جسر الخادم الكامل لمشروع OldApp (`mxqp-8d1e8`).
 *
 * يغطّي CRUD الكامل للأقسام الرئيسيّة والفرعيّة والدروس/الكتب في
 * Firestore الخاصّ بالتطبيق القديم عبر Admin SDK، ملتزماً بالمخطّط المسطّح
 * الصارم الذي اعتمدناه في `oldAppBrowse.js` و `old_app_datasource.dart`:
 *
 *   - categories          → الأقسام الرئيسيّة.
 *   - subcategories       → الأقسام الفرعيّة (مع `categoryId == mainId`).
 *   - lessons             → المحتوى (مع `subcategoryId == subId`).
 *   - books               → بديل إضافيّ لنفس النوع — نُحدِّث/نحذف في أيّهما
 *                           يحوي الوثيقة (مطابقة للعميل).
 *
 * الحماية:
 *   • `hooks.server.js` يفرض Bearer + dashboard_users + !isBlocked.
 *   • preflight محلّي: role ∈ {owner, supervisor}.
 *   • إن لم تُضبط تهيئة Admin لمشروع OldApp → 501.
 *
 * المسارات:
 *   POST   /api/oldapp/categories              (قسم رئيسي)
 *   PUT    /api/oldapp/categories/:id
 *   DELETE /api/oldapp/categories/:id          (قابل للتعاقب عبر ?cascade=1)
 *
 *   POST   /api/oldapp/subcategories           (body: mainDocId, name, thumbnailUrl?)
 *   PUT    /api/oldapp/subcategories/:id
 *   DELETE /api/oldapp/subcategories/:id       (قابل للتعاقب عبر ?cascade=1)
 *
 *   POST   /api/oldapp/lessons                 (body: mainDocId, subDocId, title, ...)
 *   PUT    /api/oldapp/lessons/:id
 *   DELETE /api/oldapp/lessons/:id
 *
 * نقطة الرفع في `/api/oldapp/uploads/+server.js` لعزل FormData.
 */

import { json } from '@sveltejs/kit';
import { FieldValue } from 'firebase-admin/firestore';
import {
	getOldAppFirestoreAdmin,
	isOldAppAdminConfigured
} from '$lib/server/firebaseAdmin.js';

// ── ثوابت المخطّط (مطابقة للعميل تماماً) ─────────────────────
const MAIN_COLLECTION = 'categories';
const SUB_COLLECTION = 'subcategories';
const LESSONS_COLLECTION = 'lessons';
const BOOKS_COLLECTION = 'books';

// ── استجابات قياسيّة ─────────────────────────────────────────
function badRequest(reason, extra = {}) {
	return json({ error: 'bad_request', reason, ...extra }, { status: 400 });
}
function notFound(reason = 'not_found') {
	return json({ error: 'not_found', reason }, { status: 404 });
}
function serverError(err, code = 'admin_write_failed') {
	return json(
		{ error: code, message: err?.message || String(err || 'unknown error') },
		{ status: 500 }
	);
}

function preflight(event) {
	const auth = event.locals?.auth;
	if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });
	if (auth.role !== 'owner' && auth.role !== 'supervisor') {
		return json({ error: 'forbidden', reason: 'role_not_allowed' }, { status: 403 });
	}
	if (!isOldAppAdminConfigured()) {
		return json(
			{
				error: 'not_configured',
				reason: 'oldapp_admin_service_account_missing',
				message:
					'أضف OLDAPP_SERVICE_ACCOUNT_JSON أو OLDAPP_SERVICE_ACCOUNT_PATH في ملف .env لتفعيل الكتابة عبر السيرفر.'
			},
			{ status: 501 }
		);
	}
	return null;
}

async function parseJsonBody(event) {
	try {
		return await event.request.json();
	} catch {
		return null;
	}
}

async function commitInChunks(db, operations) {
	const CHUNK = 450;
	for (let i = 0; i < operations.length; i += CHUNK) {
		const batch = db.batch();
		const slice = operations.slice(i, i + CHUNK);
		for (const op of slice) op(batch);
		await batch.commit();
	}
}

function extractCascadeFlag(event) {
	const v = event.url?.searchParams?.get('cascade');
	return v === '1' || v === 'true' || v === 'yes';
}

// ─────────────────────────────────────────────────────────────────
// الأقسام الرئيسيّة (categories)
// ─────────────────────────────────────────────────────────────────

async function createMainSection(event) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const name = String(body.name || '').trim();
	const thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl) : '';
	if (!name) return badRequest('name_required');

	const payload = {
		title: name,
		image: thumbnailUrl || null,
		created_at: FieldValue.serverTimestamp(),
		createdByUid: String(event.locals?.auth?.uid || ''),
		createdByEmail: String(event.locals?.auth?.email || '')
	};

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = await db.collection(MAIN_COLLECTION).add(payload);
		return json(
			{
				ok: true,
				id: ref.id,
				oldappId: `oldapp:main:${ref.id}`,
				category: { id: ref.id, title: name, image: thumbnailUrl || null }
			},
			{ status: 201 }
		);
	} catch (err) {
		return serverError(err);
	}
}

async function updateMainSection(event, mainDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;
	if (!mainDocId) return badRequest('id_required');

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const patch = {};
	if (body.name !== undefined) patch.title = String(body.name || '').trim();
	if (body.thumbnailUrl !== undefined) patch.image = body.thumbnailUrl || null;
	if (Object.keys(patch).length === 0) return badRequest('empty_patch');

	patch.updatedByUid = String(event.locals?.auth?.uid || '');
	patch.updatedByEmail = String(event.locals?.auth?.email || '');

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = db.collection(MAIN_COLLECTION).doc(mainDocId);
		const snap = await ref.get();
		if (!snap.exists) return notFound('main_not_found');
		await ref.update(patch);
		return json({ ok: true, id: mainDocId });
	} catch (err) {
		return serverError(err);
	}
}

async function deleteMainSection(event, mainDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;
	if (!mainDocId) return badRequest('id_required');

	const cascade = extractCascadeFlag(event);

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = db.collection(MAIN_COLLECTION).doc(mainDocId);
		const snap = await ref.get();
		if (!snap.exists) return notFound('main_not_found');

		if (!cascade) {
			await ref.delete();
			return json({
				ok: true,
				id: mainDocId,
				removed: { categories: 1, subcategories: 0, lessons: 0, books: 0 }
			});
		}

		// تعاقب: اجلب كل الأبناء (subcategories) ثمّ الأحفاد (lessons/books).
		const subsSnap = await db
			.collection(SUB_COLLECTION)
			.where('categoryId', '==', String(mainDocId))
			.get();
		const subIds = subsSnap.docs.map((d) => d.id);

		const [lessonsSnap, booksSnap] =
			subIds.length === 0
				? [{ docs: [] }, { docs: [] }]
				: await fetchChildrenInBatches(db, subIds);

		const ops = [];
		for (const d of subsSnap.docs) ops.push((batch) => batch.delete(d.ref));
		for (const d of lessonsSnap.docs) ops.push((batch) => batch.delete(d.ref));
		for (const d of booksSnap.docs) ops.push((batch) => batch.delete(d.ref));
		ops.push((batch) => batch.delete(ref));

		await commitInChunks(db, ops);

		return json({
			ok: true,
			id: mainDocId,
			cascade: true,
			removed: {
				categories: 1,
				subcategories: subsSnap.docs.length,
				lessons: lessonsSnap.docs.length,
				books: booksSnap.docs.length
			}
		});
	} catch (err) {
		return serverError(err);
	}
}

/**
 * Firestore `where in` محدود بـ 30 قيمة. نقسّم قائمة معرّفات الأقسام الفرعيّة
 * إلى شرائح صغيرة ونستعلم عن كلّ المحتوى تحتها من `lessons` و `books`.
 */
async function fetchChildrenInBatches(db, subIds) {
	const CHUNK = 30;
	const lessonsDocs = [];
	const booksDocs = [];

	for (let i = 0; i < subIds.length; i += CHUNK) {
		const slice = subIds.slice(i, i + CHUNK);
		const [l, b] = await Promise.all([
			db.collection(LESSONS_COLLECTION).where('subcategoryId', 'in', slice).get(),
			db.collection(BOOKS_COLLECTION).where('subcategoryId', 'in', slice).get()
		]);
		lessonsDocs.push(...l.docs);
		booksDocs.push(...b.docs);
	}

	return [{ docs: lessonsDocs }, { docs: booksDocs }];
}

// ─────────────────────────────────────────────────────────────────
// الأقسام الفرعيّة (subcategories)
// ─────────────────────────────────────────────────────────────────

async function createSubSection(event) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const mainDocId = String(body.mainDocId || '').trim();
	const name = String(body.name || '').trim();
	const thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl) : '';
	if (!mainDocId) return badRequest('mainDocId_required');
	if (!name) return badRequest('name_required');

	const payload = {
		title: name,
		image: thumbnailUrl || null,
		categoryId: mainDocId,
		created_at: FieldValue.serverTimestamp(),
		createdByUid: String(event.locals?.auth?.uid || ''),
		createdByEmail: String(event.locals?.auth?.email || '')
	};

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = await db.collection(SUB_COLLECTION).add(payload);
		return json(
			{
				ok: true,
				id: ref.id,
				oldappId: `oldapp:sub:${mainDocId}:${ref.id}`,
				subcategory: {
					id: ref.id,
					title: name,
					image: thumbnailUrl || null,
					categoryId: mainDocId
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		return serverError(err);
	}
}

async function updateSubSection(event, subDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;
	if (!subDocId) return badRequest('id_required');

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const patch = {};
	if (body.name !== undefined) patch.title = String(body.name || '').trim();
	if (body.thumbnailUrl !== undefined) patch.image = body.thumbnailUrl || null;
	if (body.categoryId !== undefined) patch.categoryId = String(body.categoryId || '').trim();
	if (Object.keys(patch).length === 0) return badRequest('empty_patch');

	patch.updatedByUid = String(event.locals?.auth?.uid || '');
	patch.updatedByEmail = String(event.locals?.auth?.email || '');

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = db.collection(SUB_COLLECTION).doc(subDocId);
		const snap = await ref.get();
		if (!snap.exists) return notFound('sub_not_found');
		await ref.update(patch);
		return json({ ok: true, id: subDocId });
	} catch (err) {
		return serverError(err);
	}
}

async function deleteSubSection(event, subDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;
	if (!subDocId) return badRequest('id_required');

	const cascade = extractCascadeFlag(event);

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = db.collection(SUB_COLLECTION).doc(subDocId);
		const snap = await ref.get();
		if (!snap.exists) return notFound('sub_not_found');

		if (!cascade) {
			await ref.delete();
			return json({
				ok: true,
				id: subDocId,
				removed: { subcategories: 1, lessons: 0, books: 0 }
			});
		}

		const [lessonsSnap, booksSnap] = await Promise.all([
			db.collection(LESSONS_COLLECTION).where('subcategoryId', '==', subDocId).get(),
			db.collection(BOOKS_COLLECTION).where('subcategoryId', '==', subDocId).get()
		]);

		const ops = [];
		for (const d of lessonsSnap.docs) ops.push((batch) => batch.delete(d.ref));
		for (const d of booksSnap.docs) ops.push((batch) => batch.delete(d.ref));
		ops.push((batch) => batch.delete(ref));

		await commitInChunks(db, ops);

		return json({
			ok: true,
			id: subDocId,
			cascade: true,
			removed: {
				subcategories: 1,
				lessons: lessonsSnap.docs.length,
				books: booksSnap.docs.length
			}
		});
	} catch (err) {
		return serverError(err);
	}
}

// ─────────────────────────────────────────────────────────────────
// الدروس / الكتب (lessons — مع fallback إلى books عند التحديث/الحذف)
// ─────────────────────────────────────────────────────────────────

async function createLesson(event) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const subDocId = String(body.subDocId || '').trim();
	const mainDocId = String(body.mainDocId || '').trim();
	const title = String(body.title || '').trim();
	const description = body.description ? String(body.description).trim() : '';
	const author = body.author ? String(body.author).trim() : '';
	const contentType = String(body.contentType || 'document').trim().toLowerCase();
	const sourceUrl = String(body.sourceUrl || '').trim();
	const thumbnail = body.thumbnail ? String(body.thumbnail) : '';

	if (!subDocId) return badRequest('subDocId_required');
	if (!title) return badRequest('title_required');

	const payload = {
		title,
		description: description || null,
		author: author || null,
		content_type: contentType,
		url: sourceUrl || null,
		image: thumbnail || null,
		categoryId: mainDocId,
		subcategoryId: subDocId,
		created_at: FieldValue.serverTimestamp(),
		createdByUid: String(event.locals?.auth?.uid || ''),
		createdByEmail: String(event.locals?.auth?.email || '')
	};

	try {
		const db = getOldAppFirestoreAdmin();
		const ref = await db.collection(LESSONS_COLLECTION).add(payload);
		return json(
			{
				ok: true,
				id: ref.id,
				oldappId: `oldapp:lesson:${ref.id}`,
				lesson: {
					id: ref.id,
					title,
					content_type: contentType,
					url: sourceUrl || null,
					subcategoryId: subDocId,
					categoryId: mainDocId
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		return serverError(err);
	}
}

async function updateLesson(event, lessonDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;
	if (!lessonDocId) return badRequest('id_required');

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const patch = {};
	if (body.title !== undefined) patch.title = String(body.title || '').trim();
	if (body.description !== undefined)
		patch.description = String(body.description || '').trim();
	if (body.author !== undefined) patch.author = String(body.author || '').trim();
	if (body.thumbnail !== undefined) patch.image = body.thumbnail || null;
	if (body.sourceUrl !== undefined) patch.url = String(body.sourceUrl || '').trim();
	if (body.contentType !== undefined)
		patch.content_type = String(body.contentType || '').trim().toLowerCase();
	if (body.categoryId !== undefined) patch.categoryId = String(body.categoryId || '').trim();
	if (body.subcategoryId !== undefined)
		patch.subcategoryId = String(body.subcategoryId || '').trim();

	if (Object.keys(patch).length === 0) return badRequest('empty_patch');

	patch.updatedByUid = String(event.locals?.auth?.uid || '');
	patch.updatedByEmail = String(event.locals?.auth?.email || '');

	try {
		const db = getOldAppFirestoreAdmin();
		const lessonRef = db.collection(LESSONS_COLLECTION).doc(lessonDocId);
		const lessonSnap = await lessonRef.get();
		if (lessonSnap.exists) {
			await lessonRef.update(patch);
			return json({ ok: true, id: lessonDocId, collection: LESSONS_COLLECTION });
		}

		const bookRef = db.collection(BOOKS_COLLECTION).doc(lessonDocId);
		const bookSnap = await bookRef.get();
		if (bookSnap.exists) {
			await bookRef.update(patch);
			return json({ ok: true, id: lessonDocId, collection: BOOKS_COLLECTION });
		}

		return notFound('lesson_not_found');
	} catch (err) {
		return serverError(err);
	}
}

async function deleteLesson(event, lessonDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;
	if (!lessonDocId) return badRequest('id_required');

	try {
		const db = getOldAppFirestoreAdmin();
		const lessonRef = db.collection(LESSONS_COLLECTION).doc(lessonDocId);
		const lessonSnap = await lessonRef.get();
		if (lessonSnap.exists) {
			await lessonRef.delete();
			return json({ ok: true, id: lessonDocId, collection: LESSONS_COLLECTION });
		}

		const bookRef = db.collection(BOOKS_COLLECTION).doc(lessonDocId);
		const bookSnap = await bookRef.get();
		if (bookSnap.exists) {
			await bookRef.delete();
			return json({ ok: true, id: lessonDocId, collection: BOOKS_COLLECTION });
		}

		return notFound('lesson_not_found');
	} catch (err) {
		return serverError(err);
	}
}

// ─────────────────────────────────────────────────────────────────
// الموجّه الداخلي
// ─────────────────────────────────────────────────────────────────

function splitPath(event) {
	const raw = String(event.params?.path || '');
	return raw.split('/').filter(Boolean);
}

function unknown(method, segments) {
	return json(
		{
			error: 'not_implemented',
			reason: `no handler for ${method} /api/oldapp/${segments.join('/')}`
		},
		{ status: 501 }
	);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	const segments = splitPath(event);
	const resource = segments[0] || '';

	if (resource === 'categories' && segments.length === 1) return createMainSection(event);
	if (resource === 'subcategories' && segments.length === 1) return createSubSection(event);
	if (resource === 'lessons' && segments.length === 1) return createLesson(event);

	return unknown('POST', segments);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function PUT(event) {
	const segments = splitPath(event);
	const resource = segments[0] || '';
	const id = segments[1] ? decodeURIComponent(segments[1]) : '';

	if (resource === 'categories' && id && segments.length === 2) {
		return updateMainSection(event, id);
	}
	if (resource === 'subcategories' && id && segments.length === 2) {
		return updateSubSection(event, id);
	}
	if (resource === 'lessons' && id && segments.length === 2) {
		return updateLesson(event, id);
	}
	return unknown('PUT', segments);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function DELETE(event) {
	const segments = splitPath(event);
	const resource = segments[0] || '';
	const id = segments[1] ? decodeURIComponent(segments[1]) : '';

	if (resource === 'categories' && id && segments.length === 2) {
		return deleteMainSection(event, id);
	}
	if (resource === 'subcategories' && id && segments.length === 2) {
		return deleteSubSection(event, id);
	}
	if (resource === 'lessons' && id && segments.length === 2) {
		return deleteLesson(event, id);
	}
	return unknown('DELETE', segments);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET() {
	return json(
		{ error: 'not_implemented', reason: 'reads_remain_client_side' },
		{ status: 501 }
	);
}
