/**
 * /api/mshcat/[...path] — جسر الخادم الكامل لمشروع Mshcat (`mshcat-fkdl`).
 *
 * يغطّي CRUD الكامل للأقسام والكتب في Firestore الثانويّ عبر Admin SDK،
 * مع الحفاظ **الصارم** على مخطّط المسار المسطَّح (Path-based Denormalized
 * Flat Schema) الذي اعتمدناه في `mshcatBrowse.js` و `mshcat_datasource.dart`.
 *
 * المخطّط الفعلي (لا تغيير):
 *   categories: { mainCategory, subCategory?, subSubCategory?, createdAt, image? }
 *   books:      { mainCategory, subCategory?, subSubCategory?,
 *                 bookName, bookUrl, contentType, isYouTube, isUrlContent,
 *                 source, createdAt, updatedAt,
 *                 description?, author?, thumbnail? }
 *
 * الوصول وآمانه:
 *   • `hooks.server.js` يفرض Bearer + dashboard_users + !isBlocked.
 *   • المعالجات هنا تضيف: role ∈ {owner, supervisor}.
 *   • إن لم تُضبط تهيئة Admin لمشروع Mshcat → 501 لتمييزها عن 500.
 *
 * المسارات المدعومة:
 *   POST   /api/mshcat/books                    (إنشاء كتاب)
 *   PUT    /api/mshcat/books/:id                (تحديث حقول كتاب)
 *   DELETE /api/mshcat/books/:id                (حذف كتاب)
 *
 *   POST   /api/mshcat/categories               (إنشاء قسم: body {name, parentDocId?, thumbnailUrl?})
 *   PUT    /api/mshcat/categories/:payload      (إعادة تسمية قسم — تحافظ على شجرة المسار)
 *   DELETE /api/mshcat/categories/:payload      (حذف قسم + كلّ الأحفاد + الكتب التابعة)
 *
 * ملاحظة: نقطة الرفع مستقلّة في `/api/mshcat/uploads/+server.js` لتجنّب
 * تداخل الـ FormData مع مسارات الـ JSON هنا.
 */

import { json } from '@sveltejs/kit';
import { FieldValue } from 'firebase-admin/firestore';
import {
	getMshcatFirestoreAdmin,
	isMshcatAdminConfigured
} from '$lib/server/firebaseAdmin.js';

// ── ثوابت المخطّط (مطابقة لجميع طبقات المشروع) ────────────────────
const CATEGORIES_COLLECTION = 'categories';
const BOOKS_COLLECTION = 'books';

const MAIN_FIELD = 'mainCategory';
const SUB_FIELD = 'subCategory';
const SUB_SUB_FIELD = 'subSubCategory';

const BOOK_NAME_FIELD = 'bookName';
const BOOK_URL_FIELD = 'bookUrl';
const BOOK_CONTENT_TYPE_FIELD = 'contentType';
const BOOK_IS_YOUTUBE_FIELD = 'isYouTube';
const BOOK_IS_URL_CONTENT_FIELD = 'isUrlContent';
const BOOK_SOURCE_FIELD = 'source';

// ── قواعد تطبيع عربيّ للمقارنات (مطابقة للعميل 1:1) ─────────────────
// ضروريّة لاكتشاف الوثائق المتطابقة مع مسار ما في عمليّات rename/delete.
function normalize(input) {
	if (input === null || input === undefined) return '';
	let s = String(input);
	if (!s) return '';
	s = s.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '');
	s = s.replace(/\u0640/g, '');
	s = s.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');
	s = s.replace(/\u0649/g, '\u064A');
	s = s.replace(/\u0629/g, '\u0647');
	s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
	s = s.replace(/\s+/g, ' ').trim();
	return s.toLowerCase();
}

// ── base64url encode/decode (Node-side) لأسماء المسار ──────────────
function decodeName(token) {
	let t = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
	const mod = t.length % 4;
	if (mod) t += '='.repeat(4 - mod);
	try {
		return Buffer.from(t, 'base64').toString('utf8');
	} catch {
		return '';
	}
}

function encodeName(name) {
	return Buffer.from(String(name || '').trim(), 'utf8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function buildPathPayload(names) {
	return names.filter(Boolean).map(encodeName).join('~');
}

function decodePath(payload) {
	const parts = String(payload || '')
		.split('~')
		.map(decodeName);
	return {
		mainName: parts[0] || '',
		subName: parts[1] || '',
		subSubName: parts[2] || ''
	};
}

function levelFromPath({ mainName, subName, subSubName }) {
	if (subSubName) return 'sec';
	if (subName) return 'sub';
	if (mainName) return 'main';
	return null;
}

/**
 * يستخرج الحمولة من `mshcat:{level}:{payload}` أو يُمرّر الحمولة الخامّ.
 */
function extractPayload(categoryId) {
	const s = String(categoryId || '').trim();
	if (!s) return '';
	if (!s.startsWith('mshcat:')) return s;
	const rest = s.slice('mshcat:'.length);
	const idx = rest.indexOf(':');
	if (idx < 0) return '';
	return rest.slice(idx + 1);
}

// ── قارئات حقول ─────────────────────────────────────────────
function readStr(data, key) {
	const v = data?.[key];
	if (typeof v === 'string' && v.trim()) return v.trim();
	return '';
}
const readMainName = (d) => readStr(d, MAIN_FIELD);
const readSubName = (d) => readStr(d, SUB_FIELD);
const readSubSubName = (d) => readStr(d, SUB_SUB_FIELD);

// ── استجابات قياسيّة ────────────────────────────────────────
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

/**
 * التحقّق المشترك قبل أيّ معالج: هوية + صلاحيّة + تهيئة Admin لمشروع Mshcat.
 */
function preflight(event) {
	const auth = event.locals?.auth;
	if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });
	if (auth.role !== 'owner' && auth.role !== 'supervisor') {
		return json({ error: 'forbidden', reason: 'role_not_allowed' }, { status: 403 });
	}
	if (!isMshcatAdminConfigured()) {
		return json(
			{
				error: 'not_configured',
				reason: 'mshcat_admin_service_account_missing',
				message:
					'أضف MSHCAT_SERVICE_ACCOUNT_JSON أو MSHCAT_SERVICE_ACCOUNT_PATH في ملف .env لتفعيل الكتابة عبر السيرفر.'
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

// ── أداة تقسيم عمليات الدفعات الكبيرة (حدّ Firestore = 500/دفعة) ───
async function commitInChunks(db, operations) {
	const CHUNK = 450;
	for (let i = 0; i < operations.length; i += CHUNK) {
		const batch = db.batch();
		const slice = operations.slice(i, i + CHUNK);
		for (const op of slice) op(batch);
		await batch.commit();
	}
}

/**
 * يبني استعلامات Firestore مستهدفة على مستوى المسار فقط — لا نسحب أبداً
 * الكولكشن كاملاً. نُرجع لكلٍّ من categories و books مرجع استعلام مُقيَّد
 * بحقول (mainCategory / subCategory / subSubCategory) حسب المستوى.
 */
function buildPathScopedQueries(db, path, level) {
	let cats = db
		.collection(CATEGORIES_COLLECTION)
		.where(MAIN_FIELD, '==', path.mainName);
	let books = db
		.collection(BOOKS_COLLECTION)
		.where(MAIN_FIELD, '==', path.mainName);

	if (level === 'sub' || level === 'sec') {
		cats = cats.where(SUB_FIELD, '==', path.subName);
		books = books.where(SUB_FIELD, '==', path.subName);
	}
	if (level === 'sec') {
		cats = cats.where(SUB_SUB_FIELD, '==', path.subSubName);
		books = books.where(SUB_SUB_FIELD, '==', path.subSubName);
	}
	return { cats, books };
}

// ─────────────────────────────────────────────────────────────────
// معالجات الكتب (Books)
// ─────────────────────────────────────────────────────────────────

async function handleCreateBook(event) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const categoryId = String(body.categoryId ?? body.categoryDocId ?? '').trim();
	const title = String(body.title || '').trim();
	const sourceUrl = String(body.sourceUrl || '').trim();
	const description = body.description ? String(body.description).trim() : '';
	const author = body.author ? String(body.author).trim() : '';
	const contentType = String(body.contentType || 'book').trim().toLowerCase();
	const thumbnail = body.thumbnail ? String(body.thumbnail) : '';

	if (!title) return badRequest('title_required');
	if (!categoryId) return badRequest('categoryId_required');

	const path = decodePath(extractPayload(categoryId));
	const level = levelFromPath(path);
	if (!level) return badRequest('invalid_category_path');

	const doc = {
		[BOOK_NAME_FIELD]: title,
		[BOOK_URL_FIELD]: sourceUrl,
		[BOOK_CONTENT_TYPE_FIELD]: contentType,
		[BOOK_IS_YOUTUBE_FIELD]: contentType === 'youtube',
		[BOOK_IS_URL_CONTENT_FIELD]: Boolean(sourceUrl),
		[BOOK_SOURCE_FIELD]: 'url',
		[MAIN_FIELD]: path.mainName,
		createdAt: FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	};
	if (path.subName) doc[SUB_FIELD] = path.subName;
	if (path.subSubName) doc[SUB_SUB_FIELD] = path.subSubName;
	if (description) doc.description = description;
	if (author) doc.author = author;
	if (thumbnail) doc.thumbnail = thumbnail;

	doc.createdByUid = String(event.locals?.auth?.uid || '');
	doc.createdByEmail = String(event.locals?.auth?.email || '');

	try {
		const db = getMshcatFirestoreAdmin();
		const ref = await db.collection(BOOKS_COLLECTION).add(doc);
		return json(
			{
				ok: true,
				id: ref.id,
				mshcatId: `mshcat:book:${ref.id}`,
				book: {
					id: ref.id,
					[BOOK_NAME_FIELD]: title,
					[BOOK_URL_FIELD]: sourceUrl,
					[BOOK_CONTENT_TYPE_FIELD]: contentType,
					[BOOK_IS_YOUTUBE_FIELD]: doc[BOOK_IS_YOUTUBE_FIELD],
					[BOOK_IS_URL_CONTENT_FIELD]: doc[BOOK_IS_URL_CONTENT_FIELD],
					[MAIN_FIELD]: path.mainName,
					[SUB_FIELD]: path.subName || '',
					[SUB_SUB_FIELD]: path.subSubName || ''
				}
			},
			{ status: 201 }
		);
	} catch (err) {
		return serverError(err);
	}
}

async function handleUpdateBook(event, bookDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	if (!bookDocId) return badRequest('bookId_required');

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const patch = { updatedAt: FieldValue.serverTimestamp() };

	if (body.title !== undefined) {
		patch[BOOK_NAME_FIELD] = String(body.title || '').trim();
	}
	if (body.description !== undefined) {
		patch.description = String(body.description || '').trim();
	}
	if (body.author !== undefined) {
		patch.author = String(body.author || '').trim();
	}
	if (body.thumbnail !== undefined) {
		patch.thumbnail = body.thumbnail || null;
	}
	if (body.sourceUrl !== undefined) {
		const u = String(body.sourceUrl || '').trim();
		patch[BOOK_URL_FIELD] = u;
		patch[BOOK_IS_URL_CONTENT_FIELD] = Boolean(u);
	}
	if (body.contentType !== undefined) {
		const t = String(body.contentType || '').trim().toLowerCase();
		patch[BOOK_CONTENT_TYPE_FIELD] = t;
		patch[BOOK_IS_YOUTUBE_FIELD] = t === 'youtube';
	}
	if (body.categoryDocId !== undefined || body.categoryId !== undefined) {
		const cat = extractPayload(body.categoryDocId ?? body.categoryId);
		const p = decodePath(cat);
		patch[MAIN_FIELD] = p.mainName || '';
		patch[SUB_FIELD] = p.subName || '';
		patch[SUB_SUB_FIELD] = p.subSubName || '';
	}

	patch.updatedByUid = String(event.locals?.auth?.uid || '');
	patch.updatedByEmail = String(event.locals?.auth?.email || '');

	try {
		const db = getMshcatFirestoreAdmin();
		const ref = db.collection(BOOKS_COLLECTION).doc(bookDocId);
		const snap = await ref.get();
		if (!snap.exists) return notFound('book_not_found');
		await ref.update(patch);
		return json({ ok: true, id: bookDocId });
	} catch (err) {
		return serverError(err);
	}
}

async function handleDeleteBook(event, bookDocId) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	if (!bookDocId) return badRequest('bookId_required');

	try {
		const db = getMshcatFirestoreAdmin();
		const ref = db.collection(BOOKS_COLLECTION).doc(bookDocId);
		const snap = await ref.get();
		if (!snap.exists) return notFound('book_not_found');
		await ref.delete();
		return json({ ok: true, id: bookDocId, removed: true });
	} catch (err) {
		return serverError(err);
	}
}

// ─────────────────────────────────────────────────────────────────
// معالجات الأقسام (Categories) — Path-based
// ─────────────────────────────────────────────────────────────────

async function handleCreateCategory(event) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const name = String(body.name || '').trim();
	const parentDocId = body.parentDocId ? extractPayload(body.parentDocId) : '';
	const thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl) : '';

	if (!name) return badRequest('name_required');

	const parent = parentDocId ? decodePath(parentDocId) : null;
	const parentLevel = parent ? levelFromPath(parent) : null;

	const doc = { createdAt: FieldValue.serverTimestamp() };
	let newPayloadId = '';
	let newLevel = '';

	if (!parentDocId) {
		doc[MAIN_FIELD] = name;
		newPayloadId = buildPathPayload([name]);
		newLevel = 'main';
	} else if (parentLevel === 'main') {
		doc[MAIN_FIELD] = parent.mainName;
		doc[SUB_FIELD] = name;
		newPayloadId = buildPathPayload([parent.mainName, name]);
		newLevel = 'sub';
	} else if (parentLevel === 'sub') {
		doc[MAIN_FIELD] = parent.mainName;
		doc[SUB_FIELD] = parent.subName;
		doc[SUB_SUB_FIELD] = name;
		newPayloadId = buildPathPayload([parent.mainName, parent.subName, name]);
		newLevel = 'sec';
	} else {
		return badRequest('max_depth_exceeded', {
			message: 'لا يمكن إنشاء قسم تحت مستوى ثانوي (العمق الأقصى: 3).'
		});
	}

	if (thumbnailUrl) doc.image = thumbnailUrl;
	doc.createdByUid = String(event.locals?.auth?.uid || '');
	doc.createdByEmail = String(event.locals?.auth?.email || '');

	try {
		const db = getMshcatFirestoreAdmin();
		await db.collection(CATEGORIES_COLLECTION).add(doc);
		return json(
			{
				ok: true,
				payloadId: newPayloadId,
				level: newLevel,
				mshcatId: `mshcat:${newLevel}:${newPayloadId}`
			},
			{ status: 201 }
		);
	} catch (err) {
		return serverError(err);
	}
}

/**
 * إعادة تسمية قسم عند مستوى معيّن، مع تحديث كلّ الوثائق المتطابقة
 * (الفئات + الكتب) وتغيير الحقل المناسب فقط — دعماً صارماً للـ Path-based.
 */
async function handleRenameCategory(event, payload) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	if (!payload) return badRequest('payload_required');

	const body = await parseJsonBody(event);
	if (!body) return badRequest('invalid_json');

	const newName = String(body.name || '').trim();
	if (!newName) return badRequest('name_required');

	const path = decodePath(extractPayload(payload));
	const level = levelFromPath(path);
	if (!level) return badRequest('invalid_category_path');

	const fieldToUpdate =
		level === 'main' ? MAIN_FIELD : level === 'sub' ? SUB_FIELD : SUB_SUB_FIELD;

	const matches = (d) => {
		const m = readMainName(d);
		const s = readSubName(d);
		const ss = readSubSubName(d);
		if (normalize(m) !== normalize(path.mainName)) return false;
		if (level === 'main') return true;
		if (normalize(s) !== normalize(path.subName)) return false;
		if (level === 'sub') return true;
		return normalize(ss) === normalize(path.subSubName);
	};

	try {
		const db = getMshcatFirestoreAdmin();

		// Direct Path Reference: نطلب فقط الوثائق المنتمية للمسار المستهدَف
		// عبر where(...) — لا get() شامل على المجموعات بعد اليوم.
		const { cats, books } = buildPathScopedQueries(db, path, level);
		const [catsSnap, booksSnap] = await Promise.all([cats.get(), books.get()]);

		/** @type {Array<(b: FirebaseFirestore.WriteBatch) => void>} */
		const ops = [];
		let catHits = 0;
		let bookHits = 0;

		for (const d of catsSnap.docs) {
			// matches() يبقى كفحصٍ تطبيعيٍّ ثانوي يتعامل مع تبايُنات
			// قديمة في الكتابة (تشكيل، همزات، تطويل) لم تُعالَج بـ where.
			if (!matches(d.data())) continue;
			const ref = d.ref;
			ops.push((batch) => batch.update(ref, { [fieldToUpdate]: newName }));
			catHits++;
		}
		for (const d of booksSnap.docs) {
			if (!matches(d.data())) continue;
			const ref = d.ref;
			ops.push((batch) =>
				batch.update(ref, {
					[fieldToUpdate]: newName,
					updatedAt: FieldValue.serverTimestamp()
				})
			);
			bookHits++;
		}

		if (ops.length === 0) return notFound('category_not_found');

		await commitInChunks(db, ops);

		// حمولة جديدة مطابقة للـ rename (تبقى العلاقات سليمة بالكامل).
		const newPayload =
			level === 'main'
				? buildPathPayload([newName])
				: level === 'sub'
					? buildPathPayload([path.mainName, newName])
					: buildPathPayload([path.mainName, path.subName, newName]);

		return json({
			ok: true,
			level,
			oldPayload: payload,
			newPayload,
			mshcatId: `mshcat:${level}:${newPayload}`,
			updated: { categories: catHits, books: bookHits }
		});
	} catch (err) {
		return serverError(err);
	}
}

/**
 * حذف قسم ومعه كلّ ما يقع تحته في الشجرة (Cats + Books) — مطابق لمنطق
 * `deleteMshcatCategory` في العميل.
 */
async function handleDeleteCategory(event, payload) {
	const stopped = preflight(event);
	if (stopped) return stopped;

	if (!payload) return badRequest('payload_required');

	const path = decodePath(extractPayload(payload));
	const level = levelFromPath(path);
	if (!level) return badRequest('invalid_category_path');

	const underPath = (d) => {
		const m = readMainName(d);
		const s = readSubName(d);
		if (normalize(m) !== normalize(path.mainName)) return false;
		if (level === 'main') return true;
		if (normalize(s) !== normalize(path.subName)) return false;
		if (level === 'sub') return true;
		const ss = readSubSubName(d);
		return normalize(ss) === normalize(path.subSubName);
	};

	try {
		const db = getMshcatFirestoreAdmin();

		// نفس فكرة Rename: استهدف وثائق المسار فقط عبر where(...)، ثم
		// underPath() كفحص تطبيعيٍّ نهائي قبل الحذف في دُفعات 450.
		const { cats, books } = buildPathScopedQueries(db, path, level);
		const [catsSnap, booksSnap] = await Promise.all([cats.get(), books.get()]);

		/** @type {Array<(b: FirebaseFirestore.WriteBatch) => void>} */
		const ops = [];
		let catHits = 0;
		let bookHits = 0;

		for (const d of catsSnap.docs) {
			if (!underPath(d.data())) continue;
			const ref = d.ref;
			ops.push((batch) => batch.delete(ref));
			catHits++;
		}
		for (const d of booksSnap.docs) {
			if (!underPath(d.data())) continue;
			const ref = d.ref;
			ops.push((batch) => batch.delete(ref));
			bookHits++;
		}

		if (ops.length === 0) return notFound('category_not_found');

		await commitInChunks(db, ops);

		return json({
			ok: true,
			level,
			payload,
			removed: { categories: catHits, books: bookHits }
		});
	} catch (err) {
		return serverError(err);
	}
}

// ─────────────────────────────────────────────────────────────────
// الموجّه الداخلي — ربط [...path] بالمعالجات
// ─────────────────────────────────────────────────────────────────

function splitPath(event) {
	const raw = String(event.params?.path || '');
	return raw.split('/').filter(Boolean);
}

function unknown(method, segments) {
	return json(
		{
			error: 'not_implemented',
			reason: `no handler for ${method} /api/mshcat/${segments.join('/')}`
		},
		{ status: 501 }
	);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	const segments = splitPath(event);
	const resource = segments[0] || '';

	if (resource === 'books' && segments.length === 1) {
		return handleCreateBook(event);
	}
	if (resource === 'categories' && segments.length === 1) {
		return handleCreateCategory(event);
	}
	return unknown('POST', segments);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function PUT(event) {
	const segments = splitPath(event);
	const resource = segments[0] || '';
	const id = segments[1] || '';

	if (resource === 'books' && id && segments.length === 2) {
		return handleUpdateBook(event, decodeURIComponent(id));
	}
	if (resource === 'categories' && id && segments.length === 2) {
		return handleRenameCategory(event, decodeURIComponent(id));
	}
	return unknown('PUT', segments);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function DELETE(event) {
	const segments = splitPath(event);
	const resource = segments[0] || '';
	const id = segments[1] || '';

	if (resource === 'books' && id && segments.length === 2) {
		return handleDeleteBook(event, decodeURIComponent(id));
	}
	if (resource === 'categories' && id && segments.length === 2) {
		return handleDeleteCategory(event, decodeURIComponent(id));
	}
	return unknown('DELETE', segments);
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET() {
	// القراءة تبقى على العميل (Web SDK مباشرةً) — هذا جسر كتابة فقط.
	return json(
		{ error: 'not_implemented', reason: 'reads_remain_client_side' },
		{ status: 501 }
	);
}
