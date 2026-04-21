/**
 * mshcatBrowse.js — CRUD لمشروع Mshcat Firestore (`mshcat-fkdl`).
 *
 * استراتيجيّة Read/Write Split (Smart Router):
 *   • القراءات (classify / list / fetch…) تبقى عبر Web SDK مباشرةً إلى
 *     مشروع Mshcat — قواعد المشروع تسمح بالقراءة العامّة، والقراءة
 *     المباشرة تُخفّف الحمل عن الخادم.
 *   • الكتابات (create/update/delete) تمرّ حصرًا عبر `/api/mshcat/*`
 *     (Admin SDK) لأنّ قواعد Mshcat لا تعترف بمديرين من Nebras، فنحتاج
 *     Bearer Token يُحقَّق في `hooks.server.js` ثمّ يكتب بسلطة المسؤول.
 *
 * **البنية الفعليّة** (تمّ التحقّق منها ببيانات حيّة 2026-04-20):
 *   Path-based Denormalized Flat Schema — لا Self-Referencing.
 *
 *   categories: { mainCategory, subCategory?, subSubCategory?, createdAt }
 *   books:      { mainCategory, subCategory?, subSubCategory?,
 *                  bookName, bookUrl, contentType, isYouTube, isUrlContent,
 *                  source, createdAt, updatedAt }
 *
 * المستوى يُستنتج من أعمق حقل مسار غير فارغ. العلاقات بالأسماء لا بمعرّفات
 * المستندات؛ لذلك نعتمد معرّفات **مسار مُشفَّرة base64url**:
 *
 *   mshcat:main:<b64u(main)>
 *   mshcat:sub:<b64u(main)>~<b64u(sub)>
 *   mshcat:sec:<b64u(main)>~<b64u(sub)>~<b64u(subSub)>
 *   mshcat:book:<firestoreDocId>
 *
 * هذا يحفظ استقرار الـ ID ويسمح بتوجيه CRUD الشفّاف من moderator.js دون
 * أن يعرف أنّ الـ docId الداخلي هو في الحقيقة Token مسار مُشفَّر.
 */

import { collection, getDocs } from 'firebase/firestore';
import { getMshcatFirestore } from '$lib/firebase/client.js';
import { authedJson } from './_authedFetch.js';

// ── Collections + Schema fields (real) ───────────────────────
const CATEGORIES_COLLECTION = 'categories';
const BOOKS_COLLECTION = 'books';

const MAIN_FIELD = 'mainCategory';
const SUB_FIELD = 'subCategory';
const SUB_SUB_FIELD = 'subSubCategory';

const BOOK_NAME_FIELD = 'bookName';
const BOOK_URL_FIELD = 'bookUrl';
const BOOK_CONTENT_TYPE_FIELD = 'contentType';
const BOOK_IS_YOUTUBE_FIELD = 'isYouTube';
// NOTE: `isUrlContent` و `source` كانا يُستعملان في مسار الكتابة القديم؛
// الآن الخادم (Admin SDK) يملؤهما، فلا حاجة لذكرهما هنا.

// ── Arabic normalization (للمقارنات فقط؛ العرض يبقى بالاسم الأصليّ) ──
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

// ── base64url encode/decode لأسماء المسار ────────────────────
function encodeName(name) {
	const trimmed = String(name || '').trim();
	const bytes = new TextEncoder().encode(trimmed);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeName(token) {
	let t = String(token || '').replace(/-/g, '+').replace(/_/g, '/');
	const mod = t.length % 4;
	if (mod) t += '='.repeat(4 - mod);
	try {
		const bin = atob(t);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return new TextDecoder().decode(bytes);
	} catch {
		return '';
	}
}

/** يبني Token المسار (payload) من قائمة أسماء. */
function buildPathPayload(names) {
	return names.filter(Boolean).map(encodeName).join('~');
}

/** يفكّك Token المسار إلى `{ mainName, subName, subSubName }`. */
function decodePath(payload) {
	const parts = String(payload || '').split('~').map(decodeName);
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

// ── Field readers (schema-direct) ────────────────────────────
function readStr(data, key) {
	const v = data?.[key];
	if (typeof v === 'string' && v.trim()) return v.trim();
	return '';
}

const readMainName = (d) => readStr(d, MAIN_FIELD);
const readSubName = (d) => readStr(d, SUB_FIELD);
const readSubSubName = (d) => readStr(d, SUB_SUB_FIELD);

// ── Synthetic ID helpers ─────────────────────────────────────
export function buildMshcatMainId(payload) {
	return `mshcat:main:${payload}`;
}
export function buildMshcatSubId(payload) {
	return `mshcat:sub:${payload}`;
}
export function buildMshcatSecondaryId(payload) {
	return `mshcat:sec:${payload}`;
}
export function buildMshcatBookId(firestoreDocId) {
	return `mshcat:book:${firestoreDocId}`;
}

export function isMshcatId(id) {
	return String(id || '').startsWith('mshcat:');
}

/**
 * يفكّك معرّف Mshcat. يعيد `{ level, docId, path }` حيث:
 *   - level: 'main' | 'sub' | 'sec' | 'book'
 *   - docId: الحمولة (payload) — Token مسار لـ main/sub/sec، أو docId حقيقي لـ book
 *   - path:  قائمة أسماء المسار المفكوكة (للأقسام فقط)
 */
export function parseMshcatId(id) {
	const s = String(id || '');
	if (!s.startsWith('mshcat:')) return null;
	const rest = s.slice('mshcat:'.length);
	const i = rest.indexOf(':');
	if (i < 0) return null;
	const level = rest.slice(0, i);
	const payload = rest.slice(i + 1);
	if (!level || !payload) return null;
	let path = [];
	if (level === 'main' || level === 'sub' || level === 'sec') {
		path = payload.split('~').map(decodeName);
	}
	return { level, docId: payload, payload, path };
}

export function isMshcatConfigured() {
	return !!getMshcatFirestore();
}

// ── Cache خفيف للجلسة ────────────────────────────────────────
const cache = { allCategories: null, allBooks: null };
function invalidate() {
	cache.allCategories = null;
	cache.allBooks = null;
}
export function resetMshcatBrowseCache() {
	invalidate();
}

async function fetchAllCategoriesRaw({ force = false } = {}) {
	const db = getMshcatFirestore();
	if (!db) return [];
	if (!force && cache.allCategories) return cache.allCategories;
	const snap = await getDocs(collection(db, CATEGORIES_COLLECTION));
	const items = snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
	cache.allCategories = items;
	return items;
}

async function fetchAllBooksRaw({ force = false } = {}) {
	const db = getMshcatFirestore();
	if (!db) return [];
	if (!force && cache.allBooks) return cache.allBooks;
	const snap = await getDocs(collection(db, BOOKS_COLLECTION));
	const items = snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
	cache.allBooks = items;
	return items;
}

// ── Path-based classification (Unique values across cats+books) ──
export async function classifyMshcatCategories({ force = false } = {}) {
	const cats = await fetchAllCategoriesRaw({ force });
	const books = await fetchAllBooksRaw({ force });

	/** @type {Map<string,{mainName:string}>} */
	const mains = new Map();
	/** @type {Map<string,{mainName:string,subName:string}>} */
	const subs = new Map();
	/** @type {Map<string,{mainName:string,subName:string,subSubName:string}>} */
	const secs = new Map();

	const collect = (mName, sName, ssName) => {
		if (!mName) return;
		const mNorm = normalize(mName);
		if (!mNorm) return;
		if (!mains.has(mNorm)) mains.set(mNorm, { mainName: mName });
		if (!sName) return;
		const sNorm = normalize(sName);
		if (!sNorm) return;
		const subKey = `${mNorm}||${sNorm}`;
		if (!subs.has(subKey)) subs.set(subKey, { mainName: mName, subName: sName });
		if (!ssName) return;
		const ssNorm = normalize(ssName);
		if (!ssNorm) return;
		const secKey = `${subKey}||${ssNorm}`;
		if (!secs.has(secKey)) {
			secs.set(secKey, { mainName: mName, subName: sName, subSubName: ssName });
		}
	};

	for (const c of cats) {
		collect(readMainName(c.data), readSubName(c.data), readSubSubName(c.data));
	}
	for (const b of books) {
		collect(readMainName(b.data), readSubName(b.data), readSubSubName(b.data));
	}

	const allMains = Array.from(mains.values()).map(({ mainName }) => ({
		id: buildPathPayload([mainName]),
		title: mainName,
		parentId: null,
		imageUrl: null,
		mainName
	}));
	const allSubs = Array.from(subs.values()).map(({ mainName, subName }) => ({
		id: buildPathPayload([mainName, subName]),
		title: subName,
		parentId: buildPathPayload([mainName]),
		imageUrl: null,
		mainName,
		subName
	}));
	const allSecondaries = Array.from(secs.values()).map(
		({ mainName, subName, subSubName }) => ({
			id: buildPathPayload([mainName, subName, subSubName]),
			title: subSubName,
			parentId: buildPathPayload([mainName, subName]),
			imageUrl: null,
			mainName,
			subName,
			subSubName
		})
	);

	return { allMains, allSubs, allSecondaries };
}

// ── List APIs ────────────────────────────────────────────────
export async function listMshcatMainSections({ force = false } = {}) {
	const { allMains } = await classifyMshcatCategories({ force });
	return allMains;
}

export async function listMshcatSubSections(mainPayload, { force = false } = {}) {
	if (!mainPayload) return [];
	const { allSubs } = await classifyMshcatCategories({ force });
	const p = String(mainPayload);
	return allSubs.filter((s) => s.parentId === p);
}

export async function listMshcatSecondarySections(subPayload, { force = false } = {}) {
	if (!subPayload) return [];
	const { allSecondaries } = await classifyMshcatCategories({ force });
	const p = String(subPayload);
	return allSecondaries.filter((s) => s.parentId === p);
}

function mapBookItem(b) {
	const d = b.data || {};
	const mainName = readMainName(d);
	const subName = readSubName(d);
	const subSubName = readSubSubName(d);

	let categoryId = '';
	let categoryLevel = null;
	if (subSubName && subName && mainName) {
		categoryId = buildPathPayload([mainName, subName, subSubName]);
		categoryLevel = 'sec';
	} else if (subName && mainName) {
		categoryId = buildPathPayload([mainName, subName]);
		categoryLevel = 'sub';
	} else if (mainName) {
		categoryId = buildPathPayload([mainName]);
		categoryLevel = 'main';
	}

	const url = readStr(d, BOOK_URL_FIELD);
	const rawType = readStr(d, BOOK_CONTENT_TYPE_FIELD).toLowerCase();
	const isYouTube = d[BOOK_IS_YOUTUBE_FIELD] === true || rawType === 'youtube';

	return {
		id: b.id,
		title: readStr(d, BOOK_NAME_FIELD) || b.id,
		thumbnail: readStr(d, 'thumbnail') || readStr(d, 'image') || null,
		categoryId,
		categoryLevel,
		mainName,
		subName,
		subSubName,
		url: url || null,
		contentType: rawType,
		isYouTube,
		raw: d
	};
}

export async function listAllMshcatBooks({ force = false } = {}) {
	const books = await fetchAllBooksRaw({ force });
	return books.map(mapBookItem);
}

/** يُرجع كتب Mshcat المرتبطة مباشرةً بمسار الـ categoryPayload المحدَّد. */
export async function listMshcatBooksForCategory(categoryPayload) {
	if (!categoryPayload) return [];
	const books = await fetchAllBooksRaw();
	const target = decodePath(categoryPayload);
	const level = levelFromPath(target);
	if (!level) return [];

	return books
		.filter((b) => {
			const m = readMainName(b.data);
			const s = readSubName(b.data);
			const ss = readSubSubName(b.data);
			if (normalize(m) !== normalize(target.mainName)) return false;
			if (level === 'main') return true;
			if (normalize(s) !== normalize(target.subName)) return false;
			if (level === 'sub') return true;
			return normalize(ss) !== '' && normalize(ss) === normalize(target.subSubName);
		})
		.map(mapBookItem);
}

// ═════════════════════════════════════════════════════════════
// ✍️  WRITE PATH — يمرّ حصرًا عبر /api/mshcat/* (Admin SDK)
// ═════════════════════════════════════════════════════════════
// ملاحظات مشتركة:
//   - كلّ الدوال التالية لا تستعمل Firestore Web SDK للكتابة.
//   - الخادم يطبّق التحقّق (hooks.server.js) + حدود Firestore (batch 500).
//   - بعد النجاح نُبطل الكاش المحلّي لكي تُعيد القراءة القادمة الجلب طازجاً.
//   - أيّ خطأ من authedJson يحمل `.status` + `.message` عربي جاهز لعرض Toast.

// ── Category CRUD (Path-based) ───────────────────────────────

/**
 * ينشئ فئة جديدة في `categories` بتعبئة الحقول الثلاثة حسب عمق الأب.
 * - parentDocId فارغ           → إنشاء رئيسي.
 * - parentDocId مسار بعمق 1    → إنشاء فرعي.
 * - parentDocId مسار بعمق 2    → إنشاء ثانوي.
 *
 * يُرجع `{ id: <encodedPathPayload> }` ليكمل moderator.js بناء المعرّف
 * بالصيغة `mshcat:sub:${created.id}` مثلًا.
 */
export async function createMshcatCategory({ name, thumbnailUrl, parentDocId = '' } = {}) {
	const trimmed = String(name || '').trim();
	if (!trimmed) throw new Error('اسم القسم مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = { name: trimmed };
	if (parentDocId) body.parentDocId = String(parentDocId);
	if (thumbnailUrl) body.thumbnailUrl = thumbnailUrl;

	const data = await authedJson('/api/mshcat/categories', {
		method: 'POST',
		body
	});
	invalidate();
	return { id: String(data?.payloadId || data?.id || '') };
}

/**
 * يُعيد تسمية قسم (rename). الخادم يُحدِّث جميع مستندات `categories` + `books`
 * التي تتطابق مع المسار الحالي، بتغيير الحقل المناسب فقط، في دفعات Firestore.
 *
 * ملاحظة: نقل القسم (move) غير مدعوم في هذا المخطّط — يُتجاهل parentDocId.
 */
export async function updateMshcatCategory(
	docId,
	{ name, thumbnailUrl: _thumbnailUrl, parentDocId } = {}
) {
	if (parentDocId !== undefined && import.meta.env.DEV) {
		console.warn('[mshcat] تغيير الأب (move) غير مدعوم في هذا المخطّط.');
	}
	if (name === undefined) return;
	const newName = String(name).trim();
	if (!newName) throw new Error('اسم القسم مطلوب.');
	if (!docId) return;

	await authedJson(`/api/mshcat/categories/${encodeURIComponent(String(docId))}`, {
		method: 'PUT',
		body: { name: newName }
	});
	invalidate();
}

/** يحذف قسمًا مع كلّ أحفاده ضمن نفس المسار + كلّ الكتب المنتمية إليه. */
export async function deleteMshcatCategory(docId) {
	if (!docId) return;
	await authedJson(`/api/mshcat/categories/${encodeURIComponent(String(docId))}`, {
		method: 'DELETE'
	});
	invalidate();
}

// ── Book CRUD ────────────────────────────────────────────────
export async function createMshcatBook({
	categoryDocId,
	title,
	description,
	author,
	contentType,
	sourceUrl,
	thumbnail
} = {}) {
	if (!categoryDocId) throw new Error('categoryDocId مطلوب لحفظ المحتوى في Mshcat.');

	/** @type {Record<string, unknown>} */
	const body = {
		categoryDocId: String(categoryDocId),
		title: String(title || '').trim(),
		contentType: String(contentType || 'book').trim().toLowerCase(),
		sourceUrl: String(sourceUrl || '').trim()
	};
	if (description !== undefined) body.description = String(description || '').trim();
	if (author !== undefined) body.author = String(author || '').trim();
	if (thumbnail !== undefined) body.thumbnail = thumbnail || null;

	const data = await authedJson('/api/mshcat/books', {
		method: 'POST',
		body
	});
	invalidate();

	// نُعيد نفس الشكل التاريخيّ `{ id, ...payload }` الذي تتوقّعه moderator.js.
	// الخادم يرجع `.book` جاهزةً بالحقول الحقيقيّة (mainCategory, bookName, ...).
	const book = (data?.book && typeof data.book === 'object') ? data.book : {};
	return { id: String(data?.id || book.id || ''), ...book };
}

export async function updateMshcatBook(bookDocId, patchData = {}) {
	if (!bookDocId) throw new Error('معرّف الكتاب مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = {};
	if (patchData.title !== undefined) body.title = patchData.title;
	if (patchData.description !== undefined) body.description = patchData.description;
	if (patchData.author !== undefined) body.author = patchData.author;
	if (patchData.thumbnail !== undefined) body.thumbnail = patchData.thumbnail;
	if (patchData.sourceUrl !== undefined) body.sourceUrl = patchData.sourceUrl;
	if (patchData.contentType !== undefined) body.contentType = patchData.contentType;
	if (patchData.categoryDocId !== undefined) body.categoryDocId = patchData.categoryDocId;

	await authedJson(`/api/mshcat/books/${encodeURIComponent(String(bookDocId))}`, {
		method: 'PUT',
		body
	});
	invalidate();
}

export async function deleteMshcatBook(bookDocId) {
	if (!bookDocId) throw new Error('معرّف الكتاب مطلوب.');
	await authedJson(`/api/mshcat/books/${encodeURIComponent(String(bookDocId))}`, {
		method: 'DELETE'
	});
	invalidate();
}

// ── Adapters ─────────────────────────────────────────────────
export function adaptMshcatMain(item) {
	return {
		id: buildMshcatMainId(item.id),
		name: item.title,
		is_listed: true,
		thumbnail: item.imageUrl || null,
		order_index: 0,
		created_at: null,
		__mshcatLevel: 'main',
		__mshcatMainName: item.mainName
	};
}

export function adaptMshcatSub(item) {
	return {
		id: buildMshcatSubId(item.id),
		name: item.title,
		main_section: buildMshcatMainId(item.parentId),
		is_listed: true,
		thumbnail: item.imageUrl || null,
		created_at: null,
		__mshcatLevel: 'sub',
		__mshcatMainName: item.mainName,
		__mshcatSubName: item.subName
	};
}

export function adaptMshcatSecondary(item) {
	return {
		id: buildMshcatSecondaryId(item.id),
		name: item.title,
		sub_section: buildMshcatSubId(item.parentId),
		is_listed: true,
		thumbnail: item.imageUrl || null,
		created_at: null,
		__mshcatLevel: 'sec',
		__mshcatMainName: item.mainName,
		__mshcatSubName: item.subName,
		__mshcatSubSubName: item.subSubName
	};
}

function inferContentType(item) {
	const t = String(item.contentType || '').toLowerCase();
	if (t) return t;
	if (item.isYouTube) return 'youtube';
	const u = String(item.url || '').toLowerCase();
	if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
	if (u.endsWith('.mp3') || u.endsWith('.m4a') || u.endsWith('.wav')) return 'audio';
	if (u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.m3u8')) return 'video';
	if (u.endsWith('.pdf') || u.endsWith('.epub')) return 'document';
	return 'document';
}

export function adaptMshcatBookAsFile(item) {
	const contentType = inferContentType(item);
	const mainPayload = item.mainName ? buildPathPayload([item.mainName]) : '';
	const subPayload =
		item.mainName && item.subName ? buildPathPayload([item.mainName, item.subName]) : '';
	const secPayload =
		item.mainName && item.subName && item.subSubName
			? buildPathPayload([item.mainName, item.subName, item.subSubName])
			: '';

	const meta = {
		title: item.title || item.id,
		description: item.raw?.description || '',
		author: item.raw?.author || '',
		content_type: contentType,
		is_listed: item.raw?.is_listed ?? true,
		thumbnail: item.thumbnail || null,
		main_section: mainPayload ? buildMshcatMainId(mainPayload) : '',
		subsection: subPayload ? buildMshcatSubId(subPayload) : '',
		secondary_subsection: secPayload ? buildMshcatSecondaryId(secPayload) : '',
		created_at: item.raw?.createdAt || item.raw?.created_at || null
	};
	return {
		id: buildMshcatBookId(item.id),
		filename: item.title || item.id,
		file_type: contentType,
		file_size: Number(item.raw?.file_size || 0),
		file_url: item.url || '',
		upload_type: 'mshcat',
		upload_status: 'completed',
		storage_path: '',
		metadata: meta,
		__mshcatBookDocId: item.id,
		__mshcatCategoryDocId: item.categoryId
	};
}

export function adaptMshcatBookAsYoutube(item) {
	// ⚠️ لا نفرض content_type='youtube' هنا — نبقيه على النوع الفعليّ
	// حتّى يرفض moderator.js الكتب غير اليوتيوبيّة عند دمجها في قائمة
	// الفيديوهات (الفلتر هناك يتحقّق من content_type === 'youtube').
	const fileShape = adaptMshcatBookAsFile(item);
	return {
		id: fileShape.id,
		video_url: item.url || '',
		metadata: { ...fileShape.metadata },
		__mshcatBookDocId: fileShape.__mshcatBookDocId,
		__mshcatCategoryDocId: fileShape.__mshcatCategoryDocId
	};
}
