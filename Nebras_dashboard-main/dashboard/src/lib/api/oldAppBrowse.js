/**
 * oldAppBrowse.js — Strict Flat Mapping لقاعدة OldApp Firestore.
 *
 * استراتيجيّة Read/Write Split (Smart Router):
 *   • القراءات (list / lookup / host-section) تبقى عبر Web SDK وRTDB —
 *     قواعد OldApp تسمح بالقراءة العامّة، ولا جدوى من إضافة hop سيرفري.
 *   • الكتابات (create/update/delete لأي مستوى) تمرّ حصراً عبر
 *     `/api/oldapp/*` حيث Admin SDK + Bearer + جدار `hooks.server.js`.
 *
 * الخريطة الصارمة:
 * - categories
 * - subcategories (where categoryId == mainId)
 * - lessons / books (where subcategoryId == subId)
 */

import {
	collection,
	getDocs,
	query,
	where,
	doc,
	getDoc
} from 'firebase/firestore';
import { getOldAppFirestore, getNebrasFirestore } from '$lib/firebase/client.js';
import { authedJson } from './_authedFetch.js';

const MAIN_COLLECTION = 'categories';
const SUB_COLLECTION = 'subcategories';
const LESSONS_COLLECTION = 'lessons';
const BOOKS_COLLECTION = 'books';

const TITLE_KEYS = ['title', 'name', 'title_ar', 'titleAr', 'label'];
const IMAGE_KEYS = ['image', 'image_url', 'imageUrl', 'thumbnail', 'thumbnailUrl', 'cover'];

const cache = {
	hostMainId: null,
	mainSections: null,
	subSectionsByMain: new Map()
};

function readFirstString(data, keys) {
	for (const k of keys) {
		const v = data?.[k];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return '';
}

function normalizeArabic(s) {
	return String(s || '')
		.trim()
		.toLowerCase()
		.replace(/[\u064B-\u0652\u0670]/g, '')
		.replace(/[إأآا]/g, 'ا')
		.replace(/ى/g, 'ي')
		.replace(/ة/g, 'ه')
		.replace(/\s+/g, ' ');
}

function mapSectionDoc(d) {
	const data = d.data() || {};
	return {
		id: d.id,
		title: readFirstString(data, TITLE_KEYS) || d.id,
		imageUrl: readFirstString(data, IMAGE_KEYS) || null,
		raw: data
	};
}

function mapLessonDoc(d, sourceCollection) {
	const data = d.data() || {};
	return {
		id: d.id,
		sourceCollection,
		title: readFirstString(data, TITLE_KEYS) || d.id,
		thumbnail: readFirstString(data, IMAGE_KEYS) || null,
		categoryId: String(data.categoryId ?? ''),
		subcategoryId: String(data.subcategoryId ?? ''),
		url:
			String(
				data.url ??
					data.sourceUrl ??
					data.video_url ??
					data.audio_url ??
					data.file_url ??
					''
			).trim() || null,
		contentType: String(data.content_type ?? data.type ?? '').trim().toLowerCase(),
		raw: data
	};
}

function inferContentType(item) {
	const t = String(item.contentType || '').toLowerCase();
	if (t) return t;
	const u = String(item.url || '').toLowerCase();
	if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
	if (u.endsWith('.mp3') || u.endsWith('.m4a') || u.endsWith('.wav') || u.endsWith('.ogg')) return 'audio';
	if (u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm') || u.endsWith('.m3u8')) return 'video';
	if (u.endsWith('.pdf') || u.endsWith('.epub')) return 'document';
	return 'document';
}

export function isOldAppConfigured() {
	return !!getOldAppFirestore();
}

export function resetOldAppBrowseCache() {
	cache.hostMainId = null;
	cache.mainSections = null;
	cache.subSectionsByMain.clear();
}

export async function getHostMainSectionId({ force = false } = {}) {
	if (!force && cache.hostMainId !== null) return cache.hostMainId;
	const hostName = String(import.meta.env.VITE_OLDAPP_HOST_SECTION_NAME || '').trim();
	if (!hostName) {
		cache.hostMainId = null;
		return null;
	}
	try {
		const fs = getNebrasFirestore();
		if (!fs) return null;
		const snap = await getDoc(doc(fs, 'sections_unified', 'main'));
		if (!snap.exists()) return null;
		const map = snap.data() || {};
		const wanted = normalizeArabic(hostName);
		for (const m of Object.values(map)) {
			const name = normalizeArabic(m?.name || '');
			if (name && name === wanted) {
				cache.hostMainId = m.id;
				return cache.hostMainId;
			}
		}
	} catch (err) {
		if (import.meta.env.DEV) console.warn('[oldAppBrowse] host lookup failed:', err?.message || err);
	}
	cache.hostMainId = null;
	return null;
}

export function isOldAppId(id) {
	return String(id || '').startsWith('oldapp:');
}

export function parseOldAppId(id) {
	const s = String(id || '');
	if (!s.startsWith('oldapp:')) return null;
	const parts = s.split(':');
	const level = parts[1];
	if (level === 'main') return { level: 'main', mainDocId: parts[2] || '' };
	if (level === 'sub') return { level: 'sub', mainDocId: parts[2] || '', subDocId: parts[3] || '' };
	if (level === 'lesson') return { level: 'lesson', lessonDocId: parts[2] || '' };
	return null;
}

function buildOldAppMainId(docId) {
	return `oldapp:main:${docId}`;
}

function buildOldAppSubId(mainDocId, subDocId) {
	return `oldapp:sub:${mainDocId}:${subDocId}`;
}

function buildOldAppLessonId(lessonDocId) {
	return `oldapp:lesson:${lessonDocId}`;
}

// ═════════════════════════════════════════════════════════════
// 📖 READ PATH — Web SDK مباشرةً (يبقى كما هو)
// ═════════════════════════════════════════════════════════════

export async function listOldAppMainSections({ force = false } = {}) {
	const db = getOldAppFirestore();
	if (!db) return [];
	if (!force && cache.mainSections) return cache.mainSections;
	const snap = await getDocs(collection(db, MAIN_COLLECTION));
	const items = snap.docs.map(mapSectionDoc);
	cache.mainSections = items;
	return items;
}

export async function listOldAppSubSections(mainId, { force = false } = {}) {
	if (!mainId) return [];
	const db = getOldAppFirestore();
	if (!db) return [];
	if (!force && cache.subSectionsByMain.has(mainId)) return cache.subSectionsByMain.get(mainId);
	const snap = await getDocs(
		query(collection(db, SUB_COLLECTION), where('categoryId', '==', String(mainId)))
	);
	const items = snap.docs.map(mapSectionDoc);
	cache.subSectionsByMain.set(mainId, items);
	return items;
}

export async function listOldAppLessonsBySub(mainDocId, subDocId) {
	const db = getOldAppFirestore();
	if (!db || !subDocId) return [];
	const bySub = async (collName) => {
		const snap = await getDocs(
			query(collection(db, collName), where('subcategoryId', '==', String(subDocId)))
		);
		return snap.docs.map((d) => mapLessonDoc(d, collName));
	};
	const [lessons, books] = await Promise.all([
		bySub(LESSONS_COLLECTION),
		bySub(BOOKS_COLLECTION)
	]);
	const seen = new Set();
	return [...lessons, ...books].filter((x) => {
		if (seen.has(x.id)) return false;
		seen.add(x.id);
		return true;
	}).map((x) => ({ ...x, categoryId: String(mainDocId || x.categoryId || '') }));
}

// ═════════════════════════════════════════════════════════════
// ✍️  WRITE PATH — يمرّ حصرًا عبر /api/oldapp/* (Admin SDK)
// ═════════════════════════════════════════════════════════════
// ملاحظات مشتركة:
//   - لا نستعمل Firestore Web SDK للكتابة هنا إطلاقاً.
//   - الخادم يتولّى التحقّق (hooks.server.js)، حدود Firestore (batch 500)،
//     والحذف التسلسلي (cascade) عند الحاجة.
//   - بعد النجاح نُبطل الكاش المحلّي ذا الصلة لضمان قراءة طازجة لاحقاً.
//   - كلّ الأخطاء من authedJson تحمل `.status` + `.message` عربي جاهز للـ UI.

// ── Main categories ──────────────────────────────────────────

export async function createOldAppMainSection({ name, thumbnailUrl }) {
	const trimmed = String(name || '').trim();
	if (!trimmed) throw new Error('اسم القسم الرئيسي مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = { name: trimmed };
	if (thumbnailUrl !== undefined) body.thumbnailUrl = thumbnailUrl || null;

	const data = await authedJson('/api/oldapp/categories', {
		method: 'POST',
		body
	});
	cache.mainSections = null;

	const docId = String(data?.id || '');
	return {
		id: buildOldAppMainId(docId),
		name: trimmed,
		thumbnail: thumbnailUrl || null,
		is_listed: true,
		created_at: new Date().toISOString(),
		__oldappMainDocId: docId
	};
}

export async function updateOldAppMainSection(mainDocId, { name, thumbnailUrl }) {
	if (!mainDocId) throw new Error('mainDocId مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = {};
	if (name !== undefined) body.name = name;
	if (thumbnailUrl !== undefined) body.thumbnailUrl = thumbnailUrl || null;
	if (!Object.keys(body).length) return;

	await authedJson(`/api/oldapp/categories/${encodeURIComponent(String(mainDocId))}`, {
		method: 'PUT',
		body
	});
	cache.mainSections = null;
}

/**
 * يحذف قسماً رئيسيّاً. يمرّر `cascade=1` إن أراد الاستدعاء الحذف التسلسلي
 * (الأقسام الفرعيّة + الدروس/الكتب التابعة). الحفاظ على السلوك القديم
 * الافتراضيّ (حذف مستند واحد فقط) = لا تمرير `cascade`.
 *
 * @param {string} mainDocId
 * @param {{ cascade?: boolean }} [opts]
 */
export async function deleteOldAppMainSection(mainDocId, opts = {}) {
	if (!mainDocId) throw new Error('mainDocId مطلوب.');
	const searchParams = opts.cascade ? { cascade: '1' } : undefined;
	await authedJson(`/api/oldapp/categories/${encodeURIComponent(String(mainDocId))}`, {
		method: 'DELETE',
		searchParams
	});
	cache.mainSections = null;
	cache.subSectionsByMain.delete(mainDocId);
}

// ── Sub categories ───────────────────────────────────────────

export async function createOldAppSubSection(mainDocId, { name, thumbnailUrl }) {
	if (!mainDocId) throw new Error('mainDocId مطلوب لإنشاء قسم فرعي في OldApp.');
	const trimmed = String(name || '').trim();
	if (!trimmed) throw new Error('اسم القسم الفرعي مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = { name: trimmed, mainDocId: String(mainDocId) };
	if (thumbnailUrl !== undefined) body.thumbnailUrl = thumbnailUrl || null;

	const data = await authedJson('/api/oldapp/subcategories', {
		method: 'POST',
		body
	});
	cache.subSectionsByMain.delete(mainDocId);

	const subDocId = String(data?.id || '');
	return {
		id: buildOldAppSubId(mainDocId, subDocId),
		name: trimmed,
		thumbnail: thumbnailUrl || null,
		is_listed: true,
		sub_section: buildOldAppMainId(mainDocId),
		created_at: new Date().toISOString(),
		__oldappMainDocId: mainDocId,
		__oldappSubDocId: subDocId
	};
}

export async function updateOldAppSubSection(mainDocId, subDocId, { name, thumbnailUrl }) {
	if (!subDocId) throw new Error('subDocId مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = {};
	if (name !== undefined) body.name = name;
	if (thumbnailUrl !== undefined) body.thumbnailUrl = thumbnailUrl || null;
	if (!Object.keys(body).length) return;

	await authedJson(`/api/oldapp/subcategories/${encodeURIComponent(String(subDocId))}`, {
		method: 'PUT',
		body
	});
	if (mainDocId) cache.subSectionsByMain.delete(mainDocId);
}

/**
 * يحذف قسماً فرعيّاً. `cascade=true` لحذف كلّ دروسه وكتبه معه.
 *
 * @param {string} mainDocId
 * @param {string} subDocId
 * @param {{ cascade?: boolean }} [opts]
 */
export async function deleteOldAppSubSection(mainDocId, subDocId, opts = {}) {
	if (!subDocId) throw new Error('subDocId مطلوب.');
	const searchParams = opts.cascade ? { cascade: '1' } : undefined;
	await authedJson(`/api/oldapp/subcategories/${encodeURIComponent(String(subDocId))}`, {
		method: 'DELETE',
		searchParams
	});
	if (mainDocId) cache.subSectionsByMain.delete(mainDocId);
}

// ── Lessons / Books (content) ────────────────────────────────

export async function createOldAppLesson({
	subDocId,
	mainDocId,
	title,
	description,
	author,
	contentType,
	sourceUrl,
	thumbnail
}) {
	if (!subDocId) throw new Error('subDocId مطلوب لحفظ المحتوى.');

	const normalizedType = String(contentType || 'document').trim().toLowerCase();
	const url = String(sourceUrl || '').trim();

	/** @type {Record<string, unknown>} */
	const body = {
		subDocId: String(subDocId),
		mainDocId: String(mainDocId || ''),
		title: String(title || '').trim(),
		contentType: normalizedType,
		sourceUrl: url
	};
	if (description !== undefined) body.description = description;
	if (author !== undefined) body.author = author;
	if (thumbnail !== undefined) body.thumbnail = thumbnail || null;

	const data = await authedJson('/api/oldapp/lessons', {
		method: 'POST',
		body
	});

	// نُعيد الشكل التاريخيّ `{ id, ...payload }` الذي تتوقّعه moderator.js.
	// الخادم لا يعيد كامل الحمولة، فنُعيد بناءها من المدخلات (created_at
	// يُترك null لأنّ القيمة الحقيقيّة تُضاف على الخادم).
	const id = String(data?.id || '');
	return {
		id,
		title: body.title,
		description: body.description ?? null,
		author: body.author ?? null,
		content_type: normalizedType,
		url: url || null,
		image: thumbnail ?? null,
		categoryId: String(mainDocId || ''),
		subcategoryId: String(subDocId),
		created_at: null
	};
}

export async function updateOldAppLesson(lessonDocId, patchData = {}) {
	if (!lessonDocId) throw new Error('معرّف الدرس/الكتاب مطلوب.');

	/** @type {Record<string, unknown>} */
	const body = {};
	if (patchData.title !== undefined) body.title = patchData.title;
	if (patchData.description !== undefined) body.description = patchData.description;
	if (patchData.author !== undefined) body.author = patchData.author;
	if (patchData.thumbnail !== undefined) body.thumbnail = patchData.thumbnail;
	if (patchData.sourceUrl !== undefined) body.sourceUrl = patchData.sourceUrl;
	if (patchData.contentType !== undefined) body.contentType = patchData.contentType;
	if (patchData.categoryId !== undefined) body.categoryId = patchData.categoryId;
	if (patchData.subcategoryId !== undefined) body.subcategoryId = patchData.subcategoryId;
	if (!Object.keys(body).length) return;

	await authedJson(`/api/oldapp/lessons/${encodeURIComponent(String(lessonDocId))}`, {
		method: 'PUT',
		body
	});
}

export async function deleteOldAppLesson(lessonDocId) {
	if (!lessonDocId) throw new Error('معرّف الدرس/الكتاب مطلوب.');
	await authedJson(`/api/oldapp/lessons/${encodeURIComponent(String(lessonDocId))}`, {
		method: 'DELETE'
	});
}

// ═════════════════════════════════════════════════════════════
// 🎭 Adapters (تحويل عناصر OldApp إلى شكل Nebras-compatible)
// ═════════════════════════════════════════════════════════════

export function adaptOldAppMainAsSub(item, hostMainId) {
	return {
		id: buildOldAppMainId(item.id),
		name: item.title,
		main_section: hostMainId,
		is_listed: true,
		thumbnail: item.imageUrl || null,
		created_at: null,
		__oldappMainDocId: item.id
	};
}

export function adaptOldAppSubAsSecondary(item, parentMainDocId) {
	return {
		id: buildOldAppSubId(parentMainDocId, item.id),
		name: item.title,
		sub_section: buildOldAppMainId(parentMainDocId),
		is_listed: true,
		thumbnail: item.imageUrl || null,
		created_at: null,
		__oldappMainDocId: parentMainDocId,
		__oldappSubDocId: item.id
	};
}

export function adaptOldAppLessonAsFile(item, { mainDocId, subDocId }) {
	const contentType = inferContentType(item);
	return {
		id: buildOldAppLessonId(item.id),
		filename: item.title || item.id,
		file_type: contentType,
		file_size: Number(item.raw?.file_size || item.raw?.size || 0),
		file_url: item.url || '',
		upload_type: 'oldapp',
		upload_status: 'completed',
		storage_path: '',
		metadata: {
			title: item.title || item.id,
			description: item.raw?.description || '',
			author: item.raw?.author || '',
			content_type: contentType,
			is_listed: item.raw?.is_listed ?? true,
			thumbnail: item.thumbnail || null,
			subsection: buildOldAppMainId(String(mainDocId || item.categoryId || '')),
			secondary_subsection: buildOldAppSubId(
				String(mainDocId || item.categoryId || ''),
				String(subDocId || item.subcategoryId || '')
			),
			created_at: item.raw?.created_at || null
		},
		__oldappMainDocId: String(mainDocId || item.categoryId || ''),
		__oldappSubDocId: String(subDocId || item.subcategoryId || ''),
		__oldappContentDocId: item.id
	};
}

export function adaptOldAppLessonAsYoutube(item, { mainDocId, subDocId }) {
	const fileShape = adaptOldAppLessonAsFile(item, { mainDocId, subDocId });
	return {
		id: fileShape.id,
		video_url: item.url || '',
		metadata: {
			...fileShape.metadata,
			content_type: 'youtube'
		},
		__oldappMainDocId: fileShape.__oldappMainDocId,
		__oldappSubDocId: fileShape.__oldappSubDocId,
		__oldappContentDocId: fileShape.__oldappContentDocId
	};
}
