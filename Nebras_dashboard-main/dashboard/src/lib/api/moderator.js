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
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  isOldAppConfigured,
  isOldAppId,
  parseOldAppId,
  getHostMainSectionId,
  listOldAppMainSections,
  listOldAppSubSections,
  adaptOldAppMainAsSub,
  adaptOldAppSubAsSecondary,
  createOldAppMainSection,
  updateOldAppMainSection,
  deleteOldAppMainSection,
  createOldAppSubSection,
  updateOldAppSubSection,
  deleteOldAppSubSection,
  listOldAppLessonsBySub,
  createOldAppLesson,
  updateOldAppLesson,
  deleteOldAppLesson,
  adaptOldAppLessonAsFile,
  adaptOldAppLessonAsYoutube,
} from "$lib/api/oldAppBrowse.js";

// ─── Helpers ────────────────────────────────────────────

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
} = {}) {
  const db = sectionsDb();
  const ytSnap = await get(dbRef(db, `${CONTENT_ROOT}/youtube`));
  const subSnap = await get(dbRef(db, `${SECTIONS_ROOT}/sub`));
  const subMap = subSnap.exists() ? subSnap.val() || {} : {};
  const listedFilter = metadata__is_listed ?? is_listed;
  let list = ytSnap.exists() ? Object.values(ytSnap.val() || {}) : [];

  if (isOldAppConfigured()) {
    const hostId = await getHostMainSectionId();
    const shouldMergeOldApp =
      main_section === undefined || main_section === "" || sameSectionId(main_section, hostId);
    if (hostId != null && shouldMergeOldApp) {
      const oldMains = await listOldAppMainSections();
      for (const m of oldMains) {
        const oldSubs = await listOldAppSubSections(m.id);
        for (const s of oldSubs) {
          const lessons = await listOldAppLessonsBySub(m.id, s.id);
          for (const lesson of lessons) {
            const asYoutube = adaptOldAppLessonAsYoutube(lesson, {
              mainDocId: m.id,
              subDocId: s.id,
            });
            if (String(asYoutube?.metadata?.content_type) === "youtube") {
              list.push(asYoutube);
            }
          }
        }
      }
    }
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter((item) => {
      const title = String(item?.metadata?.title || "").toLowerCase();
      const desc = String(item?.metadata?.description || "").toLowerCase();
      const author = String(item?.metadata?.author || "").toLowerCase();
      const url = String(item?.video_url || "").toLowerCase();
      return (
        title.includes(q) ||
        desc.includes(q) ||
        author.includes(q) ||
        url.includes(q)
      );
    });
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
      return (
        sameSectionId(sub?.main_section, main_section) ||
        sameSectionId(item?.__oldappMainDocId, parseOldAppId(subId)?.mainDocId)
      );
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
  const subId = String(data?.metadata?.subsection ?? "");
  const secId = String(data?.metadata?.secondary_subsection ?? "");
  const parsedSub = isOldAppId(subId) ? parseOldAppId(subId) : null;
  const parsedSec = isOldAppId(secId) ? parseOldAppId(secId) : null;
  const target = parsedSec?.level === "sub" ? parsedSec : parsedSub?.level === "sub" ? parsedSub : null;
  if (target) {
    let thumbnailUrl = null;
    if (data?.thumbnail instanceof File) {
      thumbnailUrl = await uploadSectionThumbnail("youtube-oldapp", Date.now(), data.thumbnail);
    }
    const created = await createOldAppLesson({
      mainDocId: target.mainDocId,
      subDocId: target.subDocId,
      title: data?.metadata?.title,
      description: data?.metadata?.description,
      author: data?.metadata?.author,
      contentType: "youtube",
      sourceUrl: data?.video_url,
      thumbnail: thumbnailUrl,
    });
    return {
      id: `oldapp:lesson:${created.id}`,
      video_url: String(data?.video_url || "").trim(),
      metadata: {
        title: String(data?.metadata?.title || "").trim(),
        description: data?.metadata?.description ? String(data.metadata.description) : "",
        author: data?.metadata?.author ? String(data.metadata.author) : "",
        subsection: `oldapp:main:${target.mainDocId}`,
        secondary_subsection: `oldapp:sub:${target.mainDocId}:${target.subDocId}`,
        content_type: "youtube",
        is_listed: data?.metadata?.is_listed ?? true,
        thumbnail: thumbnailUrl || null,
        created_at: new Date().toISOString(),
      },
      __oldappMainDocId: target.mainDocId,
      __oldappSubDocId: target.subDocId,
      __oldappContentDocId: created.id,
    };
  }

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
  const oldContent = parseOldAppContentId(id);
  if (oldContent) {
    let thumbnailUrl;
    if (data?.thumbnail instanceof File) {
      thumbnailUrl = await uploadSectionThumbnail("youtube-oldapp", oldContent.lessonDocId, data.thumbnail);
    }
    await updateOldAppLesson(oldContent.lessonDocId, {
      title: data?.metadata?.title,
      description: data?.metadata?.description,
      author: data?.metadata?.author,
      sourceUrl: data?.video_url,
      contentType: "youtube",
      ...(thumbnailUrl !== undefined ? { thumbnail: thumbnailUrl } : {}),
    });
    return { id };
  }

  const db = sectionsDb();
  const itemRef = dbRef(db, `${CONTENT_ROOT}/youtube/${id}`);
  const snap = await get(itemRef);
  if (!snap.exists()) throw new Error("Video not found");
  const current = snap.val();
  const nextMetadata = {
    ...(current.metadata || {}),
    ...(data?.metadata || {}),
  };
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
  const oldContent = parseOldAppContentId(id);
  if (oldContent) {
    await deleteOldAppLesson(oldContent.lessonDocId);
    return true;
  }
  const db = sectionsDb();
  await remove(dbRef(db, `${CONTENT_ROOT}/youtube/${id}`));
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

async function uploadSectionThumbnail(level, sectionId, file) {
  if (!(file instanceof File)) return undefined;
  const storage = sectionsStorage();
  const path = `sections/${level}/${sectionId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file, {
    contentType: file.type || "application/octet-stream",
  });
  return getDownloadURL(fileRef);
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

/** مقارنة معرّفات متسامحة مع String/Number (OldApp يستعمل docId نصّي). */
function sameSectionId(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

function parseOldAppContentId(id) {
  const s = String(id || "");
  if (!s.startsWith("oldapp:lesson:")) return null;
  const parts = s.split(":");
  return parts[2] ? { lessonDocId: parts[2] } : null;
}

function applySectionFilters(
  list,
  { search = "", is_listed, main_section, sub_section } = {},
) {
  let out = [...list];
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter((x) =>
      String(x.name || "")
        .toLowerCase()
        .includes(q),
    );
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
  out.sort((a, b) => {
    const ao = Number(a.order_index ?? 0);
    const bo = Number(b.order_index ?? 0);
    if (ao !== bo) return ao - bo;
    const an = Number(a.id);
    const bn = Number(b.id);
    if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
  return out;
}

/**
 * List the moderator's own main sections.
 * @param {Object} params - { search?, page? }
 */
export async function listMyMainSections({ search = "", page = 1 } = {}) {
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
  const subItems = await readLevel("sub");
  const secItems = await readLevel("secondary");
  const subToDelete = subItems
    .filter((s) => Number(s.main_section) === Number(id))
    .map((s) => s.id);
  await remove(dbRef(db, `${SECTIONS_ROOT}/main/${id}`));
  for (const sid of subToDelete) {
    await remove(dbRef(db, `${SECTIONS_ROOT}/sub/${sid}`));
  }
  for (const sec of secItems) {
    if (subToDelete.includes(sec.sub_section)) {
      await remove(dbRef(db, `${SECTIONS_ROOT}/secondary/${sec.id}`));
    }
  }
  return true;
}

// ─── Sub Sections ───────────────────────────────────────

/**
 * List the moderator's own sub sections, optionally filtered by main_section.
 *
 * توجيه شفّاف: إن كانت `main_section` هي القسم المضيف لـ OldApp، تُضاف
 * قائمة أقسام OldApp الرئيسيّة الحقيقيّة كأقسام فرعيّة افتراضيّة مع
 * الحفاظ على شكل البيانات المتوقّع من الواجهة.
 * @param {Object} params - { main_section?, search?, page? }
 */
export async function listMySubSections({
  main_section,
  search = "",
  page = 1,
} = {}) {
  const all = await readLevel("sub");
  let merged = all;

  if (isOldAppConfigured()) {
    const hostId = await getHostMainSectionId();
    if (hostId != null) {
      const filteringByHost =
        main_section !== undefined &&
        main_section !== "" &&
        main_section !== null &&
        sameSectionId(main_section, hostId);
      const noParentFilter =
        main_section === undefined ||
        main_section === "" ||
        main_section === null;

      if (filteringByHost || noParentFilter) {
        try {
          const oldMains = await listOldAppMainSections();
          const adapted = oldMains.map((m) => adaptOldAppMainAsSub(m, hostId));
          // نمرّر الأقسام الحقيقيّة من OldApp أوّلًا، ثمّ الأقسام المحلّية.
          merged = [...adapted, ...all];
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("[moderator] OldApp main list merge failed:", err);
          }
        }
      }
    }
  }

  const filtered = applySectionFilters(merged, { search, main_section });
  return paginate(filtered, page);
}

/**
 * Create a sub section. يوجَّه تلقائيًّا إلى OldApp Firestore إن كان
 * الأب هو القسم المضيف — بدون أيّ مربّعات ربط في الواجهة.
 * @param {Object} data - { name, main_section, thumbnail? (File) }
 */
export async function createSubSection(data) {
  const parent = data?.main_section;
  if (isOldAppConfigured() && parent !== undefined && parent !== null && parent !== "") {
    const hostId = await getHostMainSectionId();
    if (hostId != null && sameSectionId(parent, hostId)) {
      const thumbUrl = data?.thumbnail instanceof File
        ? await uploadSectionThumbnail("sub-oldapp", Date.now(), data.thumbnail)
        : null;
      return createOldAppMainSection({
        name: data?.name,
        thumbnailUrl: thumbUrl,
      });
    }
  }

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
 * Update a sub section. يوجَّه تلقائيًّا إلى OldApp إن كان معرّفه افتراضيًّا.
 * @param {number|string} id
 * @param {Object} data
 */
export async function updateSubSection(id, data) {
  if (isOldAppId(id)) {
    const parsed = parseOldAppId(id);
    if (parsed?.level === "main") {
      let thumbUrl;
      if (data?.thumbnail instanceof File) {
        thumbUrl = await uploadSectionThumbnail(
          "sub-oldapp",
          parsed.mainDocId,
          data.thumbnail,
        );
      }
      await updateOldAppMainSection(parsed.mainDocId, {
        name: data?.name,
        ...(thumbUrl !== undefined ? { thumbnailUrl: thumbUrl } : {}),
      });
      return { id, name: data?.name, thumbnail: thumbUrl || null };
    }
  }

  const db = sectionsDb();
  const currentRef = dbRef(db, `${SECTIONS_ROOT}/sub/${id}`);
  const snap = await get(currentRef);
  if (!snap.exists()) throw new Error("Section not found");
  const current = snap.val();
  const patch = {
    ...(data?.name !== undefined ? { name: String(data.name).trim() } : {}),
    ...(data?.is_listed !== undefined
      ? { is_listed: Boolean(data.is_listed) }
      : {}),
  };
  if (data?.thumbnail instanceof File) {
    patch.thumbnail = await uploadSectionThumbnail("sub", id, data.thumbnail);
  }
  const next = { ...current, ...patch };
  await set(currentRef, next);
  return next;
}

/**
 * Delete a sub section (يوجَّه إلى OldApp إن كان المعرّف افتراضيًّا).
 * @param {number|string} id
 */
export async function removeSubSection(id) {
  if (isOldAppId(id)) {
    const parsed = parseOldAppId(id);
    if (parsed?.level === "main") {
      await deleteOldAppMainSection(parsed.mainDocId);
      return true;
    }
  }
  const db = sectionsDb();
  const secItems = await readLevel("secondary");
  await remove(dbRef(db, `${SECTIONS_ROOT}/sub/${id}`));
  for (const sec of secItems) {
    if (sameSectionId(sec.sub_section, id)) {
      await remove(dbRef(db, `${SECTIONS_ROOT}/secondary/${sec.id}`));
    }
  }
  return true;
}

// ─── Secondary Sub Sections ────────────────────────────

/**
 * List secondary sub sections. إن كان `sub_section` معرّفًا افتراضيًّا
 * (`oldapp:main:<docId>`) نُرجع الأقسام الفرعيّة الحقيقيّة من OldApp
 * بعد تكييف شكلها.
 * @param {Object} params - { sub_section?, search?, page? }
 */
export async function listMySecondarySections({
  sub_section,
  search = "",
  page = 1,
} = {}) {
  // حالة 1: استعراض ثانويات Main قديم محدد (oldapp:main:<id>)
  if (isOldAppId(sub_section)) {
    const parsed = parseOldAppId(sub_section);
    if (parsed?.level === "main") {
      try {
        const subs = await listOldAppSubSections(parsed.mainDocId);
        const adapted = subs.map((s) => adaptOldAppSubAsSecondary(s, parsed.mainDocId));
        const filtered = applySectionFilters(adapted, { search, sub_section });
        return paginate(filtered, page);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("[moderator] OldApp sub list failed:", err);
        }
        return paginate([], page);
      }
    }
  }

  // حالة 2: لا يوجد فلتر sub_section => ندمج ثانويات OldApp تلقائياً
  // لتظهر في نفس قائمة الإدارة (تعديل/حذف) مثل الأقسام الفرعية.
  const noSubFilter =
    sub_section === undefined || sub_section === "" || sub_section === null;
  if (noSubFilter && isOldAppConfigured()) {
    const all = await readLevel("secondary");
    let merged = all;
    try {
      const hostId = await getHostMainSectionId();
      if (hostId != null) {
        const oldMains = await listOldAppMainSections();
        const oldSecondaries = [];
        for (const m of oldMains) {
          const oldSubs = await listOldAppSubSections(m.id);
          oldSecondaries.push(
            ...oldSubs.map((s) => adaptOldAppSubAsSecondary(s, m.id)),
          );
        }
        merged = [...oldSecondaries, ...all];
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[moderator] OldApp secondary merge failed:", err);
      }
    }
    const filtered = applySectionFilters(merged, { search, sub_section });
    return paginate(filtered, page);
  }

  // حالة 3: مسار RTDB العادي
  const all = await readLevel("secondary");
  const filtered = applySectionFilters(all, { search, sub_section });
  return paginate(filtered, page);
}

/**
 * Create a secondary sub section. إن كان الأب افتراضيًّا (oldapp:main:*)
 * نُنشئ قسمًا فرعيًّا حقيقيًّا في OldApp Firestore مباشرةً.
 */
export async function createSecondarySection(data) {
  const parent = data?.sub_section;
  if (isOldAppId(parent)) {
    const parsed = parseOldAppId(parent);
    if (parsed?.level === "main") {
      let thumbUrl = null;
      if (data?.thumbnail instanceof File) {
        thumbUrl = await uploadSectionThumbnail(
          "secondary-oldapp",
          Date.now(),
          data.thumbnail,
        );
      }
      return createOldAppSubSection(parsed.mainDocId, {
        name: data?.name,
        thumbnailUrl: thumbUrl,
      });
    }
  }

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
  if (isOldAppId(id)) {
    const parsed = parseOldAppId(id);
    if (parsed?.level === "sub") {
      let thumbUrl;
      if (data?.thumbnail instanceof File) {
        thumbUrl = await uploadSectionThumbnail(
          "secondary-oldapp",
          parsed.subDocId,
          data.thumbnail,
        );
      }
      await updateOldAppSubSection(parsed.mainDocId, parsed.subDocId, {
        name: data?.name,
        ...(thumbUrl !== undefined ? { thumbnailUrl: thumbUrl } : {}),
      });
      return { id, name: data?.name, thumbnail: thumbUrl || null };
    }
  }

  const db = sectionsDb();
  const currentRef = dbRef(db, `${SECTIONS_ROOT}/secondary/${id}`);
  const snap = await get(currentRef);
  if (!snap.exists()) throw new Error("Section not found");
  const current = snap.val();
  const patch = {
    ...(data?.name !== undefined ? { name: String(data.name).trim() } : {}),
    ...(data?.is_listed !== undefined
      ? { is_listed: Boolean(data.is_listed) }
      : {}),
  };
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
  if (isOldAppId(id)) {
    const parsed = parseOldAppId(id);
    if (parsed?.level === "sub") {
      await deleteOldAppSubSection(parsed.mainDocId, parsed.subDocId);
      return true;
    }
  }
  const db = sectionsDb();
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
} = {}) {
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

  if (isOldAppConfigured()) {
    const hostId = await getHostMainSectionId();
    const shouldMergeOldApp =
      main_section === undefined || main_section === "" || sameSectionId(main_section, hostId);
    if (hostId != null && shouldMergeOldApp) {
      const oldMains = await listOldAppMainSections();
      for (const m of oldMains) {
        const oldSubs = await listOldAppSubSections(m.id);
        for (const s of oldSubs) {
          const lessons = await listOldAppLessonsBySub(m.id, s.id);
          for (const lesson of lessons) {
            const asFile = adaptOldAppLessonAsFile(lesson, { mainDocId: m.id, subDocId: s.id });
            if (String(asFile?.metadata?.content_type) !== "youtube") {
              list.push(asFile);
            }
          }
        }
      }
    }
  }

  list = list.map((item) => {
    const createdAt =
      item?.metadata?.created_at || item?.createdAt || new Date().toISOString();
    return {
      id: item.fileId || item.id,
      filename: item.filename || "untitled",
      file_type: item.fileType || item.file_type || "",
      file_size: Number(item.fileSize || item.file_size || 0),
      file_url: item.downloadUrl || item.file_url || "",
      upload_type: "firebase",
      upload_status: "completed",
      storage_path: item.storagePath || "",
      metadata: {
        ...(item.metadata || {}),
        created_at: createdAt,
      },
    };
  });

  // ملفات Shadow الناتجة عن رفع محتوى OldApp تُخفى من القائمة لأن العنصر
  // الحقيقي يُدار من Firestore عبر oldapp:lesson:*.
  list = list.filter((item) => {
    const sub = String(item?.metadata?.subsection || "");
    const sec = String(item?.metadata?.secondary_subsection || "");
    return !(sub.startsWith("oldapp:main:") && sec.startsWith("oldapp:sub:"));
  });

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter((item) => {
      const title = String(item?.metadata?.title || "").toLowerCase();
      const desc = String(item?.metadata?.description || "").toLowerCase();
      const author = String(item?.metadata?.author || "").toLowerCase();
      const filenameVal = String(item?.filename || "").toLowerCase();
      return (
        title.includes(q) ||
        desc.includes(q) ||
        author.includes(q) ||
        filenameVal.includes(q)
      );
    });
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
      return (
        sameSectionId(sub?.main_section, main_section) ||
        sameSectionId(item?.__oldappMainDocId, parseOldAppId(subId)?.mainDocId)
      );
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

/**
 * يحوّل سجل رفع Firebase (fileId) إلى درس حقيقي في OldApp lessons
 * عند اختيار شجرة OldApp في شاشة رفع الملفات.
 */
export async function mirrorUploadedFileToOldAppLesson({
  fileId,
  subsectionId,
  secondarySubsectionId,
  fallbackMetadata = {},
} = {}) {
  if (!fileId) throw new Error("fileId مطلوب.");
  const parsedSec = isOldAppId(secondarySubsectionId)
    ? parseOldAppId(secondarySubsectionId)
    : null;
  const parsedSub = isOldAppId(subsectionId) ? parseOldAppId(subsectionId) : null;
  const target =
    parsedSec?.level === "sub"
      ? parsedSec
      : parsedSub?.level === "sub"
        ? parsedSub
        : null;
  if (!target) return null;

  const db = sectionsDb();
  const primaryRef = dbRef(db, `${UPLOADS_ROOT}/${fileId}`);
  const fallbackRef = dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${fileId}`);
  const primarySnap = await get(primaryRef);
  const fallbackSnap = await get(fallbackRef);
  const snap = primarySnap.exists() ? primarySnap : fallbackSnap;
  if (!snap.exists()) throw new Error("Uploaded file record not found.");
  const row = snap.val() || {};
  const metadata = { ...(row.metadata || {}), ...(fallbackMetadata || {}) };
  const sourceUrl =
    row.downloadUrl || row.file_url || row.sourceUrl || metadata.file_url || "";

  const created = await createOldAppLesson({
    mainDocId: target.mainDocId,
    subDocId: target.subDocId,
    title: metadata.title || row.filename || fileId,
    description: metadata.description || "",
    author: metadata.author || "",
    contentType: metadata.content_type || "document",
    sourceUrl,
    thumbnail: metadata.thumbnail || null,
  });
  return { id: `oldapp:lesson:${created.id}` };
}

/** Update file metadata (PATCH). */
export async function updateFile(fileId, data) {
  const oldContent = parseOldAppContentId(fileId);
  if (oldContent) {
    await updateOldAppLesson(oldContent.lessonDocId, {
      title: data?.metadata?.title,
      description: data?.metadata?.description,
      author: data?.metadata?.author,
      contentType: data?.metadata?.content_type,
      thumbnail: data?.metadata?.thumbnail,
    });
    return { id: fileId };
  }

  const db = sectionsDb();
  const primaryRef = dbRef(db, `${UPLOADS_ROOT}/${fileId}`);
  const fallbackRef = dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${fileId}`);
  const primarySnap = await get(primaryRef);
  const fallbackSnap = await get(fallbackRef);
  const itemRef = primarySnap.exists() ? primaryRef : fallbackRef;
  const snap = primarySnap.exists() ? primarySnap : fallbackSnap;
  if (!snap.exists()) throw new Error("File not found");
  const current = snap.val();
  const nextMetadata = {
    ...(current.metadata || {}),
    ...(data?.metadata || {}),
  };
  const next = {
    ...current,
    metadata: nextMetadata,
    ...buildUploadMirrorFields(current, nextMetadata),
  };
  await set(itemRef, next);
  return next;
}

/** Delete a file. */
export async function removeFile(fileId) {
  const oldContent = parseOldAppContentId(fileId);
  if (oldContent) {
    await deleteOldAppLesson(oldContent.lessonDocId);
    return true;
  }

  const db = sectionsDb();
  const primaryRef = dbRef(db, `${UPLOADS_ROOT}/${fileId}`);
  const fallbackRef = dbRef(db, `${UPLOADS_FALLBACK_ROOT}/${fileId}`);
  const primarySnap = await get(primaryRef);
  const fallbackSnap = await get(fallbackRef);
  const itemRef = primarySnap.exists() ? primaryRef : fallbackRef;
  const snap = primarySnap.exists() ? primarySnap : fallbackSnap;
  if (!snap.exists()) return true;
  const item = snap.val();
  const storagePath = item?.storagePath;
  if (storagePath) {
    try {
      const storage = sectionsStorage();
      await deleteObject(storageRef(storage, storagePath));
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
