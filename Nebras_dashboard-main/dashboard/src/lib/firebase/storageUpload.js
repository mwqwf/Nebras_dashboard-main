/**
 * رفع الملف إلى Firebase Storage ثم تسجيل الرابط في Realtime Database.
 * يُستدعى من orchestrator الرفع بدل التوقيع المباشر لـ R2.
 */
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
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
    secondary_subsection: normalized.secondary_subsection,
    main_section: normalized.main_section,
    main_section_id: normalized.main_section_id,
    main_section_name: normalized.main_section_name,
    ...sourceFields,
  };
}

/**
 * @param {File} file
 * @param {string|number} fileId من الخادم بعد initiate
 * @param {Record<string, unknown>} metadata نفس metadata النموذج الحالي
 * @param {{ onProgress: (n: number) => void, isAborted: () => boolean, onTaskCreated?: (task: import('firebase/storage').UploadTask) => void }} opts
 */
export async function firebaseUploadContentFile(file, fileId, metadata, opts) {
  const { onProgress, isAborted, onTaskCreated } = opts;
  const storage = getFirebaseStorage();
  const db = getFirebaseDatabase();
  if (!storage || !db) {
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
