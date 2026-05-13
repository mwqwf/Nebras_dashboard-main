/**
 * رفع الملف إلى Firebase Storage ثم تسجيل الرابط في Realtime Database.
 * يُستدعى من orchestrator الرفع بدل التوقيع المباشر لـ R2.
 */
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { ref as dbRef, set, serverTimestamp } from "firebase/database";
import { getFirebaseStorage, getFirebaseDatabase } from "./client.js";

/** جذر سجلات الرفع في RTDB — يمكن تقييد القواعد على هذا المسار */
export const FIREBASE_UPLOADS_RTDB_PATH = "dashboard_uploads";
export const FIREBASE_UPLOADS_FALLBACK_RTDB_PATH = "content_unified/files";

function sanitizeFileSegment(name) {
  return String(name || "file")
    .replace(/[#$\[\]./]/g, "_")
    .slice(0, 180);
}

/**
 * Upload an optional thumbnail image for a content record. Returns the download URL
 * or `null` if no file was provided. The URL must be written into
 * `metadata.thumbnail` so the mobile app (which reads `metadata.thumbnail` /
 * root-level `thumbnail`) can render it.
 *
 * @param {string|number} fileId
 * @param {File|null|undefined} thumbnail
 * @returns {Promise<string|null>}
 */
export async function uploadContentThumbnail(fileId, thumbnail) {
  if (!thumbnail || typeof thumbnail !== "object" || !("size" in thumbnail)) {
    return null;
  }
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error(
      "Firebase غير مهيأ. تحقق من متغيرات VITE_FIREBASE_* في .env",
    );
  }
  const safe = sanitizeFileSegment(thumbnail.name || "thumbnail");
  const path = `dashboard/content/${fileId}/thumbnail_${Date.now()}_${safe}`;
  const thumbRef = ref(storage, path);
  await uploadBytes(thumbRef, thumbnail, {
    contentType: thumbnail.type || "image/jpeg",
  });
  return getDownloadURL(thumbRef);
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value === undefined ? undefined : value;
}

function buildMobileCompatibleFields(metadata, downloadUrl) {
  const normalized = metadata && typeof metadata === "object" ? metadata : {};
  const contentType =
    String(normalized.content_type || "document")
      .trim()
      .toLowerCase() || "document";
  const sourceFields = {
    sourceUrl: downloadUrl,
    source_url: downloadUrl,
    file_url: downloadUrl,
  };
  if (contentType === "audio") sourceFields.audio_url = downloadUrl;
  if (contentType === "video" || contentType === "youtube")
    sourceFields.video_url = downloadUrl;
  return {
    id: normalized.id || undefined,
    title: normalized.title || undefined,
    description: normalized.description || undefined,
    author: normalized.author || undefined,
    thumbnail: normalized.thumbnail || undefined,
    content_type: normalized.content_type || undefined,
    subsection: normalized.subsection,
    subsection_name:
      normalized.subsection_name || normalized.subsection_title || undefined,
    secondary_subsection: normalized.secondary_subsection,
    secondary_subsection_name:
      normalized.secondary_subsection_name ||
      normalized.secondary_subsection_title ||
      undefined,
    main_section: normalized.main_section,
    main_section_id: normalized.main_section_id,
    main_section_name: normalized.main_section_name,
    ...sourceFields,
  };
}

/**
 * المرحلة الأولى من الرفع: تحميل البايتات إلى Firebase Storage فقط (دون كتابة
 * أي سجل في RTDB). تُعاد رابط التنزيل ومسار التخزين ليُستخدما لاحقاً بعد
 * انتهاء رفع الـ thumbnail بالتوازي. يسمح هذا التقسيم بتشغيل رفعَي الـ
 * thumbnail والملف الرئيسي بالتوازي ثم كتابة سجلّ RTDB مرّة واحدة بعد
 * اكتمالهما.
 *
 * @param {File} file
 * @param {string|number} fileId
 * @param {{ onProgress: (n: number) => void, isAborted: () => boolean, onTaskCreated?: (task: import('firebase/storage').UploadTask) => void }} opts
 * @returns {Promise<{ downloadUrl: string, storagePath: string }>}
 */
export async function firebaseUploadFileToStorage(file, fileId, opts) {
  const { onProgress, isAborted, onTaskCreated } = opts;
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error(
      "Firebase غير مهيأ. تحقق من متغيرات VITE_FIREBASE_* في .env",
    );
  }

  const safe = sanitizeFileSegment(file.name);
  const storagePath = `dashboard/content/${fileId}/${Date.now()}_${safe}`;
  const storageRef = ref(storage, storagePath);
  const contentType = file.type || "application/octet-stream";
  const task = uploadBytesResumable(storageRef, file, { contentType });
  onTaskCreated?.(task);

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (isAborted()) {
          task.cancel();
          return;
        }
        const total = snap.totalBytes || file.size || 1;
        onProgress((snap.bytesTransferred / total) * 100);
      },
      (err) => {
        if (err?.code === "storage/canceled")
          reject(new Error("Upload aborted"));
        else reject(err);
      },
      () => resolve(),
    );
  });

  if (isAborted()) throw new Error("Upload aborted");

  const downloadUrl = await getDownloadURL(task.snapshot.ref);
  return { downloadUrl, storagePath };
}

/**
 * المرحلة الثانية من الرفع: كتابة سجل الملف في RTDB. تُستدعى بعد انتهاء
 * رفع الملف الرئيسي ورفع الـ thumbnail (إن وُجد) بالتوازي، لضمان أن
 * `metadata.thumbnail` يحتوي رابط الـ thumbnail النهائي قبل الكتابة.
 *
 * @param {{ fileId: string|number, file: File, downloadUrl: string, storagePath: string, metadata: Record<string, unknown> }} params
 * @returns {Promise<string>} يُعيد downloadUrl
 */
export async function firebaseWriteFileRecord({
  fileId,
  file,
  downloadUrl,
  storagePath,
  metadata,
}) {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error(
      "Firebase غير مهيأ. تحقق من متغيرات VITE_FIREBASE_* في .env",
    );
  }

  const compatibleFields = buildMobileCompatibleFields(metadata, downloadUrl);

  // Keep RTDB key = fileId so update/remove/list can target the same record reliably.
  const payload = stripUndefinedDeep({
    fileId,
    id: fileId,
    downloadUrl,
    filename: file.name,
    fileType: file.type || null,
    fileSize: file.size,
    metadata: metadata || {},
    storagePath,
    createdAt: serverTimestamp(),
    ...compatibleFields,
  });

  try {
    const recordRef = dbRef(db, `${FIREBASE_UPLOADS_RTDB_PATH}/${fileId}`);
    await set(recordRef, payload);
  } catch (err) {
    // Some Firebase rules only allow writes under unified content paths.
    if (err?.code === "PERMISSION_DENIED") {
      const fallbackRef = dbRef(
        db,
        `${FIREBASE_UPLOADS_FALLBACK_RTDB_PATH}/${fileId}`,
      );
      await set(fallbackRef, payload);
    } else {
      throw err;
    }
  }

  return downloadUrl;
}

/**
 * @param {File} file
 * @param {string|number} fileId من الخادم بعد initiate
 * @param {Record<string, unknown>} metadata نفس metadata النموذج الحالي
 * @param {{ onProgress: (n: number) => void, isAborted: () => boolean, onTaskCreated?: (task: import('firebase/storage').UploadTask) => void }} opts
 *
 * (محفوظة لأغراض التوافق مع الاستدعاءات الخارجية — تُعيد تركيب
 * المرحلتين بالتسلسل كما كانت سابقاً.)
 */
export async function firebaseUploadContentFile(file, fileId, metadata, opts) {
  const { downloadUrl, storagePath } = await firebaseUploadFileToStorage(
    file,
    fileId,
    opts,
  );
  await firebaseWriteFileRecord({
    fileId,
    file,
    downloadUrl,
    storagePath,
    metadata,
  });
  return downloadUrl;
}
