/**
 * Moderator API
 *
 * Sections CRUD + YouTube Video CRUD.
 * Uses multipart/form-data for create/update (thumbnail/file uploads).
 * The backend enforces created_by = current user automatically.
 */

import {
  apiGet,
  apiPost,
  apiPostForm,
  apiPatchForm,
  apiDelete,
} from "$lib/api/client.js";
import {
  getFirebaseDatabase,
  getFirebaseStorage,
} from "$lib/firebase/client.js";
import { ref as dbRef, get, set, remove } from "firebase/database";
// ⚠️ الرفع يمرّ عبر smartUpload إلى دلو Nebras (Web SDK).
// نُبقي `ref` و `deleteObject` فقط لحذف كائنات التخزين الفعليّة في Nebras
// (مسار `removeFile`) — وهي عمليّة حذف لا رفع.
import { ref as storageRef, deleteObject } from "firebase/storage";
import { smartUpload } from "$lib/api/smartUpload.js";
import {
  tokenize,
  filterAndRank,
} from "$lib/utils/search.js";

// ─── Helpers ────────────────────────────────────────────

/**
 * بوابة البحث الإلزاميّة — ترفض جلب آلاف المستندات على مجرّد فتح الصفحة.
 *
 * الاستعمال: تُمرَّر `{ requireSearch: true, search, hasActiveFilter }`
 * من الصفحات الإداريّة (sections/files/youtube).
 *   - إن كان `search` فارغًا/أقصر من الحدّ الأدنى **و** لا يوجد فلتر نشط،
 *     فإنّ الدالة تعيد `true` (يعني: أرجِع قائمة فارغة فورًا).
 *   - إن كان هناك فلتر نشط (قسم محدَّد، نوع محتوى، …) فالبحث يُسمَح به
 *     حتى بدون نصّ، لأنّ الفلتر نفسه يُقيّد حجم النتيجة.
 * الاستدعاءات الداخليّة (من النوافذ المنبثقة) تتركها على false
 * لأنّها محدودة العدد ومربوطة بفعل صريح من المستخدم.
 */
const MIN_SEARCH_LEN = 2;
function shouldSkipListing({ requireSearch, search, hasActiveFilter } = {}) {
  if (!requireSearch) return false;
  if (hasActiveFilter) return false;
  const q = String(search || "").trim();
  return q.length < MIN_SEARCH_LEN;
}

// تتبّع فشل جزئي أثناء الجلب (للعرض في الواجهة).
// مخصَّص للاستخدام عبر `getLastPartialFailures()` من الصفحات.
let _lastPartialFailures = [];
function recordPartialFailure(source, err) {
  _lastPartialFailures.push({ source, message: String(err?.message || err) });
  if (import.meta.env.DEV) console.warn(`[moderator] ${source} failed:`, err);
}
function resetPartialFailures() {
  _lastPartialFailures = [];
}
/**
 * يُرجع أيّ فشل جزئي حدث أثناء آخر عمليّة جلب.
 * الواجهة تستطيع عرضه كـ toast تحذيري بدل أن يظنّ المشرف أنّ القائمة كاملة.
 */
export function getLastPartialFailures() {
  return [..._lastPartialFailures];
}

function emptyPage() {
  return { results: [], count: 0, page: 1, page_size: 0, has_next: false };
}

/**
 * Build a FormData object from a plain/nested object.
 * Supports nested objects via dot notation: { metadata: { title: 'x' } } → 'metadata.title' = 'x'
 * Skips undefined/null values. Handles File objects natively.
 */
function buildFormData(data, fd = new FormData(), prefix = "") {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    const fieldKey = prefix ? `${prefix}.${key}` : key;

    if (value instanceof File) {
      fd.append(fieldKey, value);
    } else if (
      typeof value === "object" &&
      !(value instanceof Date) &&
      !Array.isArray(value)
    ) {
      // Recurse for nested objects
      buildFormData(value, fd, fieldKey);
    } else if (value !== "") {
      fd.append(fieldKey, String(value));
    }
  }
  return fd;
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function asTrimmedString(value) {
  return String(value ?? "").trim();
}

function mergeContentMetadataPreservingHierarchy(
  currentMeta = {},
  incomingMeta = {},
) {
  const next = { ...currentMeta };

  if (hasOwn(incomingMeta, "title")) next.title = asTrimmedString(incomingMeta.title);
  if (hasOwn(incomingMeta, "description")) {
    next.description = asTrimmedString(incomingMeta.description);
  }
  if (hasOwn(incomingMeta, "author")) next.author = asTrimmedString(incomingMeta.author);
  if (hasOwn(incomingMeta, "is_listed")) {
    next.is_listed = Boolean(incomingMeta.is_listed);
  }
  if (hasOwn(incomingMeta, "content_type")) {
    next.content_type = asTrimmedString(incomingMeta.content_type);
  }

  // لا نغيّر القسم/المسار إلا إذا أرسله المستخدم صراحةً.
  if (hasOwn(incomingMeta, "main_section")) next.main_section = incomingMeta.main_section || null;
  if (hasOwn(incomingMeta, "subsection")) next.subsection = incomingMeta.subsection || null;
  if (hasOwn(incomingMeta, "secondary_subsection")) {
    next.secondary_subsection = incomingMeta.secondary_subsection || null;
  }

  return next;
}

function uniqStrings(values) {
  return [...new Set(
    (values || [])
      .filter(Boolean)
      .map((x) => String(x).trim())
      .filter(Boolean),
  )];
}

function collectAssetUrls(row) {
  return uniqStrings([
    row?.thumbnail,
    row?.image,
    row?.imageUrl,
    row?.thumbnailUrl,
    row?.metadata?.thumbnail,
    row?.file_url,
    row?.audio_url,
    row?.video_url,
    row?.downloadUrl,
    row?.sourceUrl,
    row?.url,
  ]);
}

async function deleteStorageUrlsByValue(urls = []) {
  const storage = sectionsStorage();
  for (const url of uniqStrings(urls)) {
    try {
      await deleteObject(storageRef(storage, url));
    } catch {
      // لا نوقف الحذف الجذري بسبب ملف مفقود.
    }
  }
}

// ─── YouTube Videos ─────────────────────────────────────

const CONTENT_ROOT = "content_unified";
const UPLOADS_ROOT = "dashboard_uploads";
const UPLOADS_FALLBACK_ROOT = "content_unified/files";

function buildUploadMirrorFields(current, metadata) {
  const normalized = metadata && typeof metadata === "object" ? metadata : {};
  const contentType = String(
    normalized.content_type || current?.content_type || "",
  )
    .trim()
    .toLowerCase();
  const sourceUrl = String(
    current?.downloadUrl ||
      current?.sourceUrl ||
      current?.file_url ||
      current?.audio_url ||
      current?.video_url ||
      "",
  ).trim();
  return {
    id: current?.fileId || current?.id,
    title: normalized.title ?? current?.title,
    description: normalized.description ?? current?.description,
    author: normalized.author ?? current?.author,
    thumbnail: normalized.thumbnail ?? current?.thumbnail,
    content_type: normalized.content_type ?? current?.content_type,
    subsection: normalized.subsection ?? current?.subsection,
    subsection_name:
      normalized.subsection_name ??
      normalized.subsection_title ??
      current?.subsection_name,
    secondary_subsection:
      normalized.secondary_subsection ?? current?.secondary_subsection,
    secondary_subsection_name:
      normalized.secondary_subsection_name ??
      normalized.secondary_subsection_title ??
      current?.secondary_subsection_name,
    main_section: normalized.main_section ?? current?.main_section,
    main_section_id: normalized.main_section_id ?? current?.main_section_id,
    main_section_name:
      normalized.main_section_name ?? current?.main_section_name,
    sourceUrl: sourceUrl || current?.sourceUrl,
    file_url: sourceUrl || current?.file_url,
    audio_url: contentType === "audio" ? sourceUrl : current?.audio_url,
    video_url:
      contentType === "video" || contentType === "youtube"
        ? sourceUrl
        : current?.video_url,
  };
}

function buildYoutubeMirrorFields({
  id,
  videoUrl,
  metadata,
  thumbnail,
  current,
}) {
  const normalized = metadata && typeof metadata === "object" ? metadata : {};
  const resolvedUrl = String(videoUrl || current?.video_url || "").trim();
  return {
    id: id ?? current?.id,
    title: normalized.title ?? current?.title,
    description: normalized.description ?? current?.description,
    author: normalized.author ?? current?.author,
    thumbnail: thumbnail ?? normalized.thumbnail ?? current?.thumbnail ?? null,
    content_type: "youtube",
    subsection: normalized.subsection ?? current?.subsection,
    subsection_name:
      normalized.subsection_name ??
      normalized.subsection_title ??
      current?.subsection_name,
    secondary_subsection:
      normalized.secondary_subsection ?? current?.secondary_subsection,
    secondary_subsection_name:
      normalized.secondary_subsection_name ??
      normalized.secondary_subsection_title ??
      current?.secondary_subsection_name,
    main_section: normalized.main_section ?? current?.main_section,
    main_section_id: normalized.main_section_id ?? current?.main_section_id,
    main_section_name:
      normalized.main_section_name ?? current?.main_section_name,
    sourceUrl: resolvedUrl || current?.sourceUrl,
    source_url: resolvedUrl || current?.source_url,
    video_url: resolvedUrl || current?.video_url,
    youtube_url: resolvedUrl || current?.youtube_url,
    youtube: resolvedUrl || current?.youtube,
  };
}

/**
 * List the moderator's own YouTube videos with optional filters.
 * Filter keys match Django view: metadata__subsection, metadata__subsection__main_section,
 * metadata__secondary_subsection, search.
 * @param {Object} params
 */
export async function listMyYoutubeVideos({
  search = "",
  subsection,
  main_section,
  secondary_subsection,
  is_listed,
  metadata__is_listed,
  page = 1,
  requireSearch = false,
} = {}) {
  const hasActiveFilter =
    (main_section !== undefined && main_section !== "") ||
    (subsection !== undefined && subsection !== "") ||
    (secondary_subsection !== undefined && secondary_subsection !== "") ||
    metadata__is_listed !== undefined ||
    is_listed !== undefined;
  if (shouldSkipListing({ requireSearch, search, hasActiveFilter })) return emptyPage();
  resetPartialFailures();
  const db = sectionsDb();
  const ytSnap = await get(dbRef(db, `${CONTENT_ROOT}/youtube`));
  const subSnap = await get(dbRef(db, `${SECTIONS_ROOT}/sub`));
  const subMap = subSnap.exists() ? subSnap.val() || {} : {};
  const listedFilter = metadata__is_listed ?? is_listed;
  let list = ytSnap.exists() ? Object.values(ytSnap.val() || {}) : [];

  // AND search + relevance ranking (Arabic-normalized).
  const tokens = tokenize(search);
  if (tokens.length > 0) {
    list = filterAndRank(list, tokens, (item) => [
      item?.metadata?.title || "",
      item?.metadata?.description || "",
      item?.metadata?.author || "",
      item?.video_url || "",
    ]);
  }
  if (subsection !== undefined && subsection !== "") {
    list = list.filter(
      (item) => sameSectionId(item?.metadata?.subsection, subsection),
    );
  }
  if (secondary_subsection !== undefined && secondary_subsection !== "") {
    list = list.filter(
      (item) =>
        sameSectionId(item?.metadata?.secondary_subsection, secondary_subsection),
    );
  }
  if (main_section !== undefined && main_section !== "") {
    list = list.filter((item) => {
      const subId = item?.metadata?.subsection;
      const sub = subMap[String(subId)];
      return sameSectionId(sub?.main_section, main_section);
    });
  }
  if (listedFilter !== undefined && listedFilter !== "") {
    const boolVal = listedFilter === true || listedFilter === "true";
    list = list.filter(
      (item) => Boolean(item?.metadata?.is_listed ?? true) === boolVal,
    );
  }

  list.sort((a, b) => {
    const ta = new Date(
      a?.metadata?.created_at || a?.created_at || 0,
    ).getTime();
    const tb = new Date(
      b?.metadata?.created_at || b?.created_at || 0,
    ).getTime();
    return tb - ta;
  });
  return paginate(list, page);
}

/**
 * Create a YouTube video (multipart/form-data).
 * @param {Object} data - { video_url, thumbnail? (File), metadata: { title, description?, subsection, secondary_subsection?, content_type:'youtube' } }
 */
export async function createYoutubeVideo(data) {
  const db = sectionsDb();
  const id = makeSectionId();
  const createdAt = new Date().toISOString();
  let thumbnailUrl;
  if (data?.thumbnail instanceof File) {
    thumbnailUrl = await uploadSectionThumbnail("youtube", id, data.thumbnail);
  }
  const metadata = {
    title: String(data?.metadata?.title || "").trim(),
    description: data?.metadata?.description
      ? String(data.metadata.description)
      : "",
    author: data?.metadata?.author ? String(data.metadata.author) : "",
    subsection: String(data?.metadata?.subsection),
    secondary_subsection: data?.metadata?.secondary_subsection
      ? String(data.metadata.secondary_subsection)
      : null,
    content_type: "youtube",
    is_listed: data?.metadata?.is_listed ?? true,
    thumbnail: thumbnailUrl || null,
    created_at: createdAt,
  };
  const videoUrl = String(data?.video_url || "").trim();
  const payload = {
    id,
    video_url: videoUrl,
    metadata,
    created_at: createdAt,
    ...buildYoutubeMirrorFields({
      id,
      videoUrl,
      metadata,
      thumbnail: thumbnailUrl || null,
    }),
  };
  await set(dbRef(db, `${CONTENT_ROOT}/youtube/${id}`), payload);
  return payload;
}

/**
 * Update a YouTube video (PATCH, multipart/form-data).
 * @param {number} id
 * @param {Object} data
 */
export async function updateYoutubeVideo(id, data) {
  const db = sectionsDb();
  const itemRef = dbRef(db, `${CONTENT_ROOT}/youtube/${id}`);
  const snap = await get(itemRef);
  if (!snap.exists()) throw new Error("Video not found");
  const current = snap.val();
  const nextMetadata = mergeContentMetadataPreservingHierarchy(
    current.metadata || {},
    data?.metadata || {},
  );
  let nextThumbnail = nextMetadata.thumbnail ?? current?.thumbnail ?? null;
  if (data?.thumbnail instanceof File) {
    nextThumbnail = await uploadSectionThumbnail("youtube", id, data.thumbnail);
    nextMetadata.thumbnail = nextThumbnail;
  }
  const nextVideoUrl =
    data?.video_url !== undefined
      ? String(data.video_url || "").trim()
      : current.video_url;
  const next = {
    ...current,
    video_url: nextVideoUrl,
    metadata: nextMetadata,
    ...buildYoutubeMirrorFields({
      id,
      videoUrl: nextVideoUrl,
      metadata: nextMetadata,
      thumbnail: nextThumbnail,
      current,
    }),
  };
  await set(itemRef, next);
  return next;
}

/**
 * Delete a YouTube video.
 * @param {number} id
 */
export async function removeYoutubeVideo(id) {
  const db = sectionsDb();
  const itemRef = dbRef(db, `${CONTENT_ROOT}/youtube/${id}`);
  const snap = await get(itemRef);
  if (!snap.exists()) return true;
  await deleteStorageUrlsByValue(collectAssetUrls(snap.val() || {}));
  await remove(itemRef);
  return true;
}

// ─── Main Sections ──────────────────────────────────────

const SECTIONS_ROOT = "sections_unified";

function sectionsDb() {
  const db = getFirebaseDatabase();
  if (!db) throw new Error("Firebase Database غير مهيأ.");
  return db;
}

function sectionsStorage() {
  const storage = getFirebaseStorage();
  if (!storage) throw new Error("Firebase Storage غير مهيأ.");
  return storage;
}

function makeSectionId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * رفع صورة مصغّرة لقسم أو محتوى إلى دلو Nebras.
 *
 * @param {string} level
 * @param {string|number} sectionId
 * @param {File} file
 * @returns {Promise<string|undefined>}
 */
async function uploadSectionThumbnail(level, sectionId, file) {
  if (!(file instanceof File)) return undefined;
  const folder = `sections/${level}/${sectionId}`;
  const filename = `${Date.now()}_${String(file.name || "thumb").replace(
    /[^\w.\-]/g,
    "_",
  )}`;
  const result = await smartUpload({ file, target: "nebras", folder, filename });
  return result?.url || undefined;
}

async function readLevel(level) {
  const db = sectionsDb();
  const snap = await get(dbRef(db, `${SECTIONS_ROOT}/${level}`));
  if (!snap.exists()) return [];
  return Object.values(snap.val() || {});
}

function paginate(list, page = 1, pageSize = 10) {
  const current = Math.max(Number(page) || 1, 1);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;
  return {
    count: list.length,
    next: end < list.length ? current + 1 : null,
    previous: current > 1 ? current - 1 : null,
    results: list.slice(start, end),
  };
}

/** مقارنة معرّفات متسامحة مع String/Number. */
function sameSectionId(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

function buildSearchAction(kind, id, query = "") {
  const q = String(query || "").trim();
  const withQuery = (base) => ({ ...base, ...(q ? { q } : {}) });

  switch (kind) {
    case "main":
    case "sub":
    case "secondary":
      return {
        edit: {
          route: "/moderator/sections",
          query: withQuery({ level: kind, modal: "edit", id: String(id) }),
        },
        delete: {
          route: "/moderator/sections",
          query: withQuery({ level: kind, modal: "delete", id: String(id) }),
        },
      };
    case "file":
      return {
        edit: {
          route: "/moderator/content/files",
          query: withQuery({ modal: "edit", id: String(id) }),
        },
        delete: {
          route: "/moderator/content/files",
          query: withQuery({ modal: "delete", id: String(id) }),
        },
      };
    case "youtube":
      return {
        edit: {
          route: "/moderator/content/youtube",
          query: withQuery({ modal: "edit", id: String(id) }),
        },
        delete: {
          route: "/moderator/content/youtube",
          query: withQuery({ modal: "delete", id: String(id) }),
        },
      };
    default:
      return {};
  }
}

function toSearchHit(kind, item, query = "") {
  if (kind === "main" || kind === "sub" || kind === "secondary") {
    return {
      id: String(item.id),
      kind,
      title: item.name || "",
      description: item.description || "",
      thumbnail: item.thumbnail || null,
      is_listed: item.is_listed ?? true,
      raw: item,
      actions: buildSearchAction(kind, item.id, query),
    };
  }

  if (kind === "file") {
    return {
      id: String(item.id),
      kind,
      title: item?.metadata?.title || item?.filename || "",
      description: item?.metadata?.description || "",
      thumbnail: item?.metadata?.thumbnail || null,
      content_type: item?.metadata?.content_type || item?.file_type || "file",
      raw: item,
      actions: buildSearchAction("file", item.id, query),
    };
  }

  return {
    id: String(item.id),
    kind: "youtube",
    title: item?.metadata?.title || "",
    description: item?.metadata?.description || "",
    thumbnail: item?.metadata?.thumbnail || null,
    content_type: "youtube",
    raw: item,
    actions: buildSearchAction("youtube", item.id, query),
  };
}

export async function searchDashboardUnified({
  query,
  requireSearch = true,
} = {}) {
  const q = String(query || "").trim();

  if (!q || q.length < MIN_SEARCH_LEN) {
    return {
      query: q,
      groups: {
        mainSections: [],
        subSections: [],
        secondarySections: [],
        content: [],
      },
      all: [],
      partialFailures: [],
    };
  }

  resetPartialFailures();

  const [mains, subs, secondaries, files, videos] = await Promise.all([
    listMyMainSections({ search: q, page: 1, requireSearch }),
    listMySubSections({ search: q, page: 1, requireSearch }),
    listMySecondarySections({ search: q, page: 1, requireSearch }),
    listMyFiles({ search: q, page: 1, requireSearch }),
    listMyYoutubeVideos({ search: q, page: 1, requireSearch }),
  ]);

  const mainHits = (mains.results || []).map((item) => toSearchHit("main", item, q));
  const subHits = (subs.results || []).map((item) => toSearchHit("sub", item, q));
  const secondaryHits = (secondaries.results || []).map((item) =>
    toSearchHit("secondary", item, q),
  );
  const fileHits = (files.results || []).map((item) => toSearchHit("file", item, q));
  const videoHits = (videos.results || []).map((item) =>
    toSearchHit("youtube", item, q),
  );

  return {
    query: q,
    groups: {
      mainSections: mainHits,
      subSections: subHits,
      secondarySections: secondaryHits,
      content: [...fileHits, ...videoHits],
    },
    all: [...mainHits, ...subHits, ...secondaryHits, ...fileHits, ...videoHits],
    partialFailures: getLastPartialFailures(),
  };
}

function applySectionFilters(
  list,
  { search = "", is_listed, main_section, sub_section } = {},
) {
  let out = [...list];
  // Arabic-aware AND matching + relevance ranking.
  const tokens = tokenize(search);
  if (tokens.length > 0) {
    out = filterAndRank(out, tokens, (x) => [
      x.name || "",
      x.description || "",
      x.id != null ? String(x.id) : "",
    ]);
  }
  if (is_listed !== undefined) {
    out = out.filter((x) => Boolean(x.is_listed) === Boolean(is_listed));
  }
  if (
    main_section !== undefined &&
    main_section !== "" &&
    main_section !== null
  ) {
    out = out.filter((x) => sameSectionId(x.main_section, main_section));
  }
  if (sub_section !== undefined && sub_section !== "" && sub_section !== null) {
    out = out.filter((x) => sameSectionId(x.sub_section, sub_section));
  }
  // إن لم يكن هناك بحث نفرز بالترتيب الأصلي (order_index ثم id). مع
  // البحث، filterAndRank يُحافظ على ترتيب الصِلة (ما يجعل النتيجة الأهمّ
  // في الأعلى).
  if (tokens.length === 0) {
    out.sort((a, b) => {
      const ao = Number(a.order_index ?? 0);
      const bo = Number(b.order_index ?? 0);
      if (ao !== bo) return ao - bo;
      const an = Number(a.id);
      const bn = Number(b.id);
      if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  }
  return out;
}

/**
 * List the moderator's own main sections.
 * @param {Object} params - { search?, page? }
 */
export async function listMyMainSections({ search = "", page = 1, requireSearch = false } = {}) {
  if (shouldSkipListing({ requireSearch, search })) return emptyPage();
  const all = await readLevel("main");
  const filtered = applySectionFilters(all, { search });
  return paginate(filtered, page);
}

/**
 * Create a main section (multipart/form-data).
 * @param {Object} data - { name, order_index?, thumbnail? (File) }
 */
export async function createMainSection(data) {
  const db = sectionsDb();
  const id = makeSectionId();
  const thumbUrl = await uploadSectionThumbnail("main", id, data?.thumbnail);
  const payload = {
    id,
    name: String(data?.name || "").trim(),
    order_index: Number(data?.order_index || 0),
    is_listed: data?.is_listed ?? true,
    thumbnail: thumbUrl || null,
    created_at: new Date().toISOString(),
  };
  await set(dbRef(db, `${SECTIONS_ROOT}/main/${id}`), payload);
  return payload;
}

/**
 * Update a main section (PATCH, multipart/form-data).
 * @param {number} id
 * @param {Object} data - { name?, order_index?, thumbnail? (File) }
 */
export async function updateMainSection(id, data) {
  const db = sectionsDb();
  const currentRef = dbRef(db, `${SECTIONS_ROOT}/main/${id}`);
  const snap = await get(currentRef);
  if (!snap.exists()) throw new Error("Section not found");
  const current = snap.val();
  const patch = {
    ...(data?.name !== undefined ? { name: String(data.name).trim() } : {}),
    ...(data?.description !== undefined
      ? { description: String(data.description || "").trim() }
      : {}),
    ...(data?.order_index !== undefined
      ? { order_index: Number(data.order_index || 0) }
      : {}),
    ...(data?.is_listed !== undefined
      ? { is_listed: Boolean(data.is_listed) }
      : {}),
  };
  if (data?.thumbnail instanceof File) {
    patch.thumbnail = await uploadSectionThumbnail("main", id, data.thumbnail);
  }
  const next = { ...current, ...patch };
  await set(currentRef, next);
  return next;
}

/**
 * Delete a main section.
 * @param {number} id
 */
export async function removeMainSection(id) {
  const db = sectionsDb();
  const mainSnap = await get(dbRef(db, `${SECTIONS_ROOT}/main/${id}`));
  const mainRow = mainSnap.exists() ? mainSnap.val() || {} : null;
  const subItems = await readLevel("sub");
  const secItems = await readLevel("secondary");
  const filePrimary = await get(dbRef(db, `${UPLOADS_ROOT}`));
  const fileFallback = await get(dbRef(db, `${UPLOADS_FALLBACK_ROOT}`));
  const youtubeSnap = await get(dbRef(db, `${CONTENT_ROOT}/youtube`));
  const fileRows = [
    ...(filePrimary.exists() ? Object.values(filePrimary.val() || {}) : []),
    ...(fileFallback.exists() ? Object.values(fileFallback.val() || {}) : []),
  ];
  const videos = youtubeSnap.exists() ? Object.values(youtubeSnap.val() || {}) : [];
  const subRows = subItems.filter((s) => sameSectionId(s.main_section, id));
  const subIds = subRows.map((s) => s.id);
  const secondaryRows = secItems.filter((sec) =>
    subIds.some((subId) => sameSectionId(sec.sub_section, subId)),
  );
  const secondaryIds = secondaryRows.map((sec) => sec.id);
  const fileRowsToDelete = fileRows.filter((row) => {
    const subMatch = subIds.some((subId) => sameSectionId(row?.metadata?.subsection, subId));
    const secMatch = secondaryIds.some((secId) =>
      sameSectionId(row?.metadata?.secondary_subsection, secId),
    );
    return subMatch || secMatch;
  });
  const videosToDelete = videos.filter((row) => {
    const subMatch = subIds.some((subId) => sameSectionId(row?.metadata?.subsection, subId));
    const secMatch = secondaryIds.some((secId) =>
      sameSectionId(row?.metadata?.secondary_subsection, secId),
    );
    return subMatch || secMatch;
  });
  await deleteStorageUrlsByValue([
    ...collectAssetUrls(mainRow),
    ...subRows.flatMap(collectAssetUrls),
    ...secondaryRows.flatMap(collectAssetUrls),
    ...fileRowsToDelete.flatMap(collectAssetUrls),
    ...videosToDelete.flatMap(collectAssetUrls),
  ]);
  await Promise.all(
    fileRowsToDelete.flatMap((row) => [
      remove(dbRef(db, `${UPLOADS_ROOT}/${row.fileId || row.id}`)),
      remove(dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${row.fileId || row.id}`)),
    ]),
  );
  await Promise.all(
    videosToDelete.map((row) => remove(dbRef(db, `${CONTENT_ROOT}/youtube/${row.id}`))),
  );
  for (const sec of secondaryRows) {
    await remove(dbRef(db, `${SECTIONS_ROOT}/secondary/${sec.id}`));
  }
  for (const sub of subRows) {
    await remove(dbRef(db, `${SECTIONS_ROOT}/sub/${sub.id}`));
  }
  await remove(dbRef(db, `${SECTIONS_ROOT}/main/${id}`));
  return true;
}

// ─── Sub Sections ───────────────────────────────────────

/**
 * List the moderator's own sub sections, optionally filtered by main_section.
 * @param {Object} params - { main_section?, search?, page? }
 */
export async function listMySubSections({
  main_section,
  search = "",
  page = 1,
  requireSearch = false,
} = {}) {
  if (shouldSkipListing({ requireSearch, search })) return emptyPage();
  const all = await readLevel("sub");
  const filtered = applySectionFilters(all, { search, main_section });
  return paginate(filtered, page);
}

/**
 * Create a sub section.
 * @param {Object} data - { name, main_section, thumbnail? (File) }
 */
export async function createSubSection(data) {
  const db = sectionsDb();
  const id = makeSectionId();
  const thumbUrl = await uploadSectionThumbnail("sub", id, data?.thumbnail);
  const payload = {
    id,
    name: String(data?.name || "").trim(),
    main_section: Number(data?.main_section),
    is_listed: data?.is_listed ?? true,
    thumbnail: thumbUrl || null,
    created_at: new Date().toISOString(),
  };
  await set(dbRef(db, `${SECTIONS_ROOT}/sub/${id}`), payload);
  return payload;
}

/**
 * Update a sub section.
 * @param {number|string} id
 * @param {Object} data
 */
export async function updateSubSection(id, data) {
  const db = sectionsDb();
  const currentRef = dbRef(db, `${SECTIONS_ROOT}/sub/${id}`);
  const snap = await get(currentRef);
  if (!snap.exists()) throw new Error("Section not found");
  const current = snap.val();
  const patch = {
    ...(data?.name !== undefined ? { name: String(data.name).trim() } : {}),
    ...(data?.description !== undefined
      ? { description: String(data.description || "").trim() }
      : {}),
    ...(data?.is_listed !== undefined
      ? { is_listed: Boolean(data.is_listed) }
      : {}),
  };
  if (hasOwn(data, "main_section")) {
    patch.main_section = data.main_section || null;
  }
  if (data?.thumbnail instanceof File) {
    patch.thumbnail = await uploadSectionThumbnail("sub", id, data.thumbnail);
  }
  const next = { ...current, ...patch };
  await set(currentRef, next);
  return next;
}

/**
 * Delete a sub section.
 * @param {number|string} id
 */
export async function removeSubSection(id) {
  const db = sectionsDb();
  const subSnap = await get(dbRef(db, `${SECTIONS_ROOT}/sub/${id}`));
  const subRow = subSnap.exists() ? subSnap.val() || {} : null;
  const secItems = await readLevel("secondary");
  const secondaryRows = secItems.filter((sec) => sameSectionId(sec.sub_section, id));
  const secondaryIds = secondaryRows.map((sec) => sec.id);
  const filePrimary = await get(dbRef(db, `${UPLOADS_ROOT}`));
  const fileFallback = await get(dbRef(db, `${UPLOADS_FALLBACK_ROOT}`));
  const youtubeSnap = await get(dbRef(db, `${CONTENT_ROOT}/youtube`));
  const fileRows = [
    ...(filePrimary.exists() ? Object.values(filePrimary.val() || {}) : []),
    ...(fileFallback.exists() ? Object.values(fileFallback.val() || {}) : []),
  ];
  const videos = youtubeSnap.exists() ? Object.values(youtubeSnap.val() || {}) : [];
  const fileRowsToDelete = fileRows.filter((row) => {
    const subMatch = sameSectionId(row?.metadata?.subsection, id);
    const secMatch = secondaryIds.some((secId) =>
      sameSectionId(row?.metadata?.secondary_subsection, secId),
    );
    return subMatch || secMatch;
  });
  const videosToDelete = videos.filter((row) => {
    const subMatch = sameSectionId(row?.metadata?.subsection, id);
    const secMatch = secondaryIds.some((secId) =>
      sameSectionId(row?.metadata?.secondary_subsection, secId),
    );
    return subMatch || secMatch;
  });
  await deleteStorageUrlsByValue([
    ...collectAssetUrls(subRow),
    ...secondaryRows.flatMap(collectAssetUrls),
    ...fileRowsToDelete.flatMap(collectAssetUrls),
    ...videosToDelete.flatMap(collectAssetUrls),
  ]);
  await Promise.all(
    fileRowsToDelete.flatMap((row) => [
      remove(dbRef(db, `${UPLOADS_ROOT}/${row.fileId || row.id}`)),
      remove(dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${row.fileId || row.id}`)),
    ]),
  );
  await Promise.all(
    videosToDelete.map((row) => remove(dbRef(db, `${CONTENT_ROOT}/youtube/${row.id}`))),
  );
  for (const sec of secondaryRows) {
    await remove(dbRef(db, `${SECTIONS_ROOT}/secondary/${sec.id}`));
  }
  await remove(dbRef(db, `${SECTIONS_ROOT}/sub/${id}`));
  return true;
}

// ─── Secondary Sub Sections ────────────────────────────

/**
 * List secondary sub sections.
 * @param {Object} params - { sub_section?, search?, page? }
 */
export async function listMySecondarySections({
  sub_section,
  search = "",
  page = 1,
  requireSearch = false,
} = {}) {
  if (shouldSkipListing({ requireSearch, search })) return emptyPage();
  const all = await readLevel("secondary");
  const filtered = applySectionFilters(all, { search, sub_section });
  return paginate(filtered, page);
}

/**
 * Create a secondary sub section.
 */
export async function createSecondarySection(data) {
  const db = sectionsDb();
  const id = makeSectionId();
  const thumbUrl = await uploadSectionThumbnail(
    "secondary",
    id,
    data?.thumbnail,
  );
  const payload = {
    id,
    name: String(data?.name || "").trim(),
    sub_section: Number(data?.sub_section),
    is_listed: data?.is_listed ?? true,
    thumbnail: thumbUrl || null,
    created_at: new Date().toISOString(),
  };
  await set(dbRef(db, `${SECTIONS_ROOT}/secondary/${id}`), payload);
  return payload;
}

export async function updateSecondarySection(id, data) {
  const db = sectionsDb();
  const currentRef = dbRef(db, `${SECTIONS_ROOT}/secondary/${id}`);
  const snap = await get(currentRef);
  if (!snap.exists()) throw new Error("Section not found");
  const current = snap.val();
  const patch = {
    ...(data?.name !== undefined ? { name: String(data.name).trim() } : {}),
    ...(data?.description !== undefined
      ? { description: String(data.description || "").trim() }
      : {}),
    ...(data?.is_listed !== undefined
      ? { is_listed: Boolean(data.is_listed) }
      : {}),
  };
  if (hasOwn(data, "sub_section")) {
    patch.sub_section = data.sub_section || null;
  }
  if (data?.thumbnail instanceof File) {
    patch.thumbnail = await uploadSectionThumbnail(
      "secondary",
      id,
      data.thumbnail,
    );
  }
  const next = { ...current, ...patch };
  await set(currentRef, next);
  return next;
}

export async function removeSecondarySection(id) {
  const db = sectionsDb();
  const secSnap = await get(dbRef(db, `${SECTIONS_ROOT}/secondary/${id}`));
  const secRow = secSnap.exists() ? secSnap.val() || {} : null;
  const filePrimary = await get(dbRef(db, `${UPLOADS_ROOT}`));
  const fileFallback = await get(dbRef(db, `${UPLOADS_FALLBACK_ROOT}`));
  const youtubeSnap = await get(dbRef(db, `${CONTENT_ROOT}/youtube`));
  const fileRows = [
    ...(filePrimary.exists() ? Object.values(filePrimary.val() || {}) : []),
    ...(fileFallback.exists() ? Object.values(fileFallback.val() || {}) : []),
  ];
  const videos = youtubeSnap.exists() ? Object.values(youtubeSnap.val() || {}) : [];
  const fileRowsToDelete = fileRows.filter((row) =>
    sameSectionId(row?.metadata?.secondary_subsection, id),
  );
  const videosToDelete = videos.filter((row) =>
    sameSectionId(row?.metadata?.secondary_subsection, id),
  );
  await deleteStorageUrlsByValue([
    ...collectAssetUrls(secRow),
    ...fileRowsToDelete.flatMap(collectAssetUrls),
    ...videosToDelete.flatMap(collectAssetUrls),
  ]);
  await Promise.all(
    fileRowsToDelete.flatMap((row) => [
      remove(dbRef(db, `${UPLOADS_ROOT}/${row.fileId || row.id}`)),
      remove(dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${row.fileId || row.id}`)),
    ]),
  );
  await Promise.all(
    videosToDelete.map((row) => remove(dbRef(db, `${CONTENT_ROOT}/youtube/${row.id}`))),
  );
  await remove(dbRef(db, `${SECTIONS_ROOT}/secondary/${id}`));
  return true;
}

// ─── R2 File Content ────────────────────────────────────

/**
 * List moderator's own R2 files with optional filters.
 */
export async function listMyFiles({
  search = "",
  subsection,
  main_section,
  secondary_subsection,
  content_type,
  upload_type,
  is_listed,
  metadata__is_listed,
  page = 1,
  requireSearch = false,
} = {}) {
  const hasActiveFilter =
    (main_section !== undefined && main_section !== "") ||
    (subsection !== undefined && subsection !== "") ||
    (secondary_subsection !== undefined && secondary_subsection !== "") ||
    (content_type !== undefined && content_type !== "") ||
    (upload_type !== undefined && upload_type !== "") ||
    metadata__is_listed !== undefined ||
    is_listed !== undefined;
  if (shouldSkipListing({ requireSearch, search, hasActiveFilter })) return emptyPage();
  resetPartialFailures();
  const db = sectionsDb();
  const uploadsSnap = await get(dbRef(db, UPLOADS_ROOT));
  const uploadsFallbackSnap = await get(dbRef(db, UPLOADS_FALLBACK_ROOT));
  const subSnap = await get(dbRef(db, `${SECTIONS_ROOT}/sub`));
  const subMap = subSnap.exists() ? subSnap.val() || {} : {};
  const listedFilter = metadata__is_listed ?? is_listed;
  let list = [
    ...(uploadsSnap.exists() ? Object.values(uploadsSnap.val() || {}) : []),
    ...(uploadsFallbackSnap.exists()
      ? Object.values(uploadsFallbackSnap.val() || {})
      : []),
  ];

  list = list.map((item) => {
    const createdAt =
      item?.metadata?.created_at || item?.createdAt || new Date().toISOString();
    return {
      id: item.fileId || item.id,
      filename: item.filename || "untitled",
      file_type: item.fileType || item.file_type || "",
      file_size: Number(item.fileSize || item.file_size || 0),
      file_url: item.downloadUrl || item.file_url || "",
      upload_type: item.upload_type || "firebase",
      upload_status: item.upload_status || "completed",
      storage_path: item.storagePath || item.storage_path || "",
      metadata: {
        ...(item.metadata || {}),
        created_at: createdAt,
      },
    };
  });

  const fileTokens = tokenize(search);
  if (fileTokens.length > 0) {
    list = filterAndRank(list, fileTokens, (item) => [
      item?.metadata?.title || "",
      item?.metadata?.description || "",
      item?.metadata?.author || "",
      item?.filename || "",
      item?.file_url || "",
    ]);
  }
  if (subsection !== undefined && subsection !== "") {
    list = list.filter(
      (item) => sameSectionId(item?.metadata?.subsection, subsection),
    );
  }
  if (secondary_subsection !== undefined && secondary_subsection !== "") {
    list = list.filter(
      (item) =>
        sameSectionId(item?.metadata?.secondary_subsection, secondary_subsection),
    );
  }
  if (main_section !== undefined && main_section !== "") {
    list = list.filter((item) => {
      const subId = item?.metadata?.subsection;
      const sub = subMap[String(subId)];
      return sameSectionId(sub?.main_section, main_section);
    });
  }
  if (content_type) {
    list = list.filter(
      (item) =>
        String(item?.metadata?.content_type || "") === String(content_type),
    );
  }
  if (upload_type) {
    list = list.filter(
      (item) => String(item?.upload_type || "") === String(upload_type),
    );
  }
  if (listedFilter !== undefined && listedFilter !== "") {
    const boolVal = listedFilter === true || listedFilter === "true";
    list = list.filter(
      (item) => Boolean(item?.metadata?.is_listed ?? true) === boolVal,
    );
  }

  list.sort((a, b) => {
    const ta = new Date(a?.metadata?.created_at || 0).getTime();
    const tb = new Date(b?.metadata?.created_at || 0).getTime();
    return tb - ta;
  });
  return paginate(list, page);
}

/**
 * Initiate a file upload. Metadata is sent as a JSON string field.
 * @param {Object} opts - { file_size, file_type, filename, metadata: {...}, thumbnail? (File) }
 */
export async function initiateFileUpload({
  file_size,
  file_type,
  filename,
  metadata,
  thumbnail,
}) {
  // Backend expects dot-notation fields: metadata.title, metadata.subsection, etc.
  const fd = buildFormData({
    filename,
    file_size,
    file_type,
    metadata, // buildFormData recurses into nested objects → metadata.title, metadata.subsection …
    ...(thumbnail instanceof File ? { thumbnail } : {}),
  });
  const res = await apiPostForm("/api/content/files/", fd);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(JSON.stringify(err));
  }
  return res.json();
}

/** Get presigned upload URL for a file (or next part). */
export async function getFileUploadUrl(fileId) {
  const res = await apiPost(`/api/content/files/${fileId}/upload-url/`, {});
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to get upload URL");
  }
  return res.json();
}

/** Register a completed part (multipart only). */
export async function registerPart({ multipart_upload, part_number, etag }) {
  const res = await apiPost("/api/content/parts/", {
    multipart_upload,
    part_number,
    etag,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to register part");
  }
  return res.json();
}

/** Complete a file upload (both single and multipart). */
export async function completeFileUpload(fileId) {
  const res = await apiPost(`/api/content/files/${fileId}/complete/`, {});
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to complete upload");
  }
  return res.json();
}

/** Update file metadata (PATCH). */
export async function updateFile(fileId, data) {
  const db = sectionsDb();
  const primaryRef = dbRef(db, `${UPLOADS_ROOT}/${fileId}`);
  const fallbackRef = dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${fileId}`);
  const primarySnap = await get(primaryRef);
  const fallbackSnap = await get(fallbackRef);
  const itemRef = primarySnap.exists() ? primaryRef : fallbackRef;
  const snap = primarySnap.exists() ? primarySnap : fallbackSnap;
  if (!snap.exists()) throw new Error("File not found");
  const current = snap.val();
  const nextMetadata = mergeContentMetadataPreservingHierarchy(
    current.metadata || {},
    data?.metadata || {},
  );
  const next = {
    ...current,
    metadata: nextMetadata,
  };
  if (data?.thumbnail instanceof File) {
    next.metadata.thumbnail = await uploadSectionThumbnail("files", fileId, data.thumbnail);
  }
  if (data?.file instanceof File) {
    const uploaded = await smartUpload({
      file: data.file,
      target: "nebras",
      folder: `content/files/${fileId}`,
      filename: `${Date.now()}_${String(data.file.name || "file").replace(/[^\w.\-]/g, "_")}`,
    });
    next.filename = data.file.name;
    next.fileType = data.file.type || current.fileType || "";
    next.fileSize = Number(data.file.size || 0);
    next.downloadUrl = uploaded.url;
    next.file_url = uploaded.url;
    next.sourceUrl = uploaded.url;
    next.storagePath = uploaded.path;
    if (current?.storagePath && current.storagePath !== uploaded.path) {
      try {
        const storage = sectionsStorage();
        await deleteObject(storageRef(storage, current.storagePath));
      } catch {}
    }
  }
  Object.assign(next, buildUploadMirrorFields(next, next.metadata));
  await set(itemRef, next);
  return next;
}

/** Delete a file. */
export async function removeFile(fileId) {
  const db = sectionsDb();
  const primaryRef = dbRef(db, `${UPLOADS_ROOT}/${fileId}`);
  const fallbackRef = dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${fileId}`);
  const primarySnap = await get(primaryRef);
  const fallbackSnap = await get(fallbackRef);
  const itemRef = primarySnap.exists() ? primaryRef : fallbackRef;
  const snap = primarySnap.exists() ? primarySnap : fallbackSnap;
  if (!snap.exists()) return true;
  const item = snap.val();
  await deleteStorageUrlsByValue(collectAssetUrls(item));
  if (item?.storagePath) {
    try {
      const storage = sectionsStorage();
      await deleteObject(storageRef(storage, item.storagePath));
    } catch {
      // Continue deleting DB entry even if file already missing in storage.
    }
  }
  await remove(itemRef);
  return true;
}

// ─── Dashboard Statistics ──────────────────────────────

/**
 * Get aggregate total counts of content items, YouTube videos, and sections created by the moderator.
 * @returns {Promise<Object>}
 */
export async function getModeratorTotals() {
  const res = await apiGet("/api/dashboard-statistics/moderator/totals/");
  if (!res.ok) throw new Error("Failed to fetch moderator totals");
  return res.json();
}

/**
 * Get content distribution uploaded by the moderator.
 * @returns {Promise<Object>}
 */
export async function getModeratorContentDistribution() {
  const res = await apiGet(
    "/api/dashboard-statistics/moderator/content-distribution/",
  );
  if (!res.ok)
    throw new Error("Failed to fetch moderator content distribution");
  return res.json();
}

/**
 * Get daily upload counts by content type for the last 30 days specific to the moderator.
 * @returns {Promise<{data: Array}>}
 */
export async function getModeratorContentAddedChart() {
  const res = await apiGet(
    "/api/dashboard-statistics/moderator/content-added-chart/",
  );
  if (!res.ok) throw new Error("Failed to fetch moderator content added chart");
  return res.json();
}
