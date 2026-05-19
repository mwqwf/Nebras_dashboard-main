import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import { g as getNebrasAdminApp } from "./firebaseAdmin.js";
import { s as stripUndefinedDeep, e as adminFsWriteFileMirrorBoth } from "./nebrasUnifiedFirestoreAdmin.js";
const NEBRAS_PROJECT_ID = "nebras-9118c";
function assertNebrasApp(app) {
  const projectId = app?.options?.projectId || "";
  if (projectId !== NEBRAS_PROJECT_ID) {
    throw Object.assign(
      new Error(
        `عُزل صارم انتُهك: سكريبت Noor Library يجب أن يستخدم Nebras (${NEBRAS_PROJECT_ID}) فقط، لكنّه تلقّى تطبيقاً لمشروع "${projectId}".`
      ),
      { reason: "target_isolation_violated", status: 500 }
    );
  }
}
function sanitizeSegment(name) {
  return String(name || "file").trim().replace(/[\u0000-\u001F\u007F]/g, "").replace(/[#$\[\]./\\:*?"<>|]+/g, "_").slice(0, 180) || "file";
}
function buildDownloadUrl(bucketName, objectPath, token) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}
function inferContentTypeFromMime(mime, fallback = "document") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || m.startsWith("application/epub")) return "document";
  return fallback;
}
function buildMobileCompatibleFields(metadata, downloadUrl) {
  const normalized = metadata && typeof metadata === "object" ? metadata : {};
  const contentType = String(normalized.content_type || "document").trim().toLowerCase() || "document";
  const sourceFields = {
    sourceUrl: downloadUrl,
    source_url: downloadUrl,
    file_url: downloadUrl
  };
  if (contentType === "audio") sourceFields.audio_url = downloadUrl;
  if (contentType === "video" || contentType === "youtube") sourceFields.video_url = downloadUrl;
  return {
    id: normalized.id || void 0,
    title: normalized.title || void 0,
    description: normalized.description || void 0,
    author: normalized.author || void 0,
    thumbnail: normalized.thumbnail || void 0,
    content_type: normalized.content_type || void 0,
    subsection: normalized.subsection,
    subsection_name: normalized.subsection_name || normalized.subsection_title || void 0,
    secondary_subsection: normalized.secondary_subsection,
    secondary_subsection_name: normalized.secondary_subsection_name || normalized.secondary_subsection_title || void 0,
    main_section: normalized.main_section,
    main_section_id: normalized.main_section_id,
    main_section_name: normalized.main_section_name,
    ...sourceFields
  };
}
async function uploadExternalThumbnail(thumbnailUrl, fileId, ctx) {
  if (!thumbnailUrl) return null;
  let res;
  try {
    res = await fetch(thumbnailUrl, {
      headers: { "User-Agent": "NebrasDashboard/1.0" },
      redirect: "follow"
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 10 * 1024 * 1024) return null;
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const objectPath = `dashboard/content/${fileId}/thumbnail_${Date.now()}.${ext}`;
  const token = randomUUID();
  const bucket = getStorage(ctx.adminApp).bucket(ctx.bucketName);
  await bucket.file(objectPath).save(buf, {
    contentType: ct,
    resumable: false,
    metadata: {
      contentType: ct,
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedByUid: ctx.uploaderUid || "",
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
        source: "noor-library"
      }
    }
  });
  return buildDownloadUrl(ctx.bucketName, objectPath, token);
}
async function adminUploadAndRegister(args) {
  const { buffer, contentType, filename, thumbnailUrl, metadata, uploader, source } = args;
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    throw Object.assign(new Error("buffer فارغ."), { reason: "empty_buffer", status: 400 });
  }
  if (!metadata?.title) {
    throw Object.assign(new Error("metadata.title مطلوب."), {
      reason: "metadata_title_required",
      status: 400
    });
  }
  if (!metadata?.subsection) {
    throw Object.assign(new Error("metadata.subsection مطلوب (الهيكلية الذهبيّة)."), {
      reason: "metadata_subsection_required",
      status: 400
    });
  }
  const adminApp = getNebrasAdminApp();
  assertNebrasApp(adminApp);
  const bucketName = adminApp.options?.storageBucket;
  if (!bucketName) {
    throw Object.assign(
      new Error(
        "NEBRAS_STORAGE_BUCKET (أو FIREBASE_STORAGE_BUCKET) غير مضبوط في .env — مطلوب لرفع الملفّات."
      ),
      { reason: "storage_bucket_missing", status: 501 }
    );
  }
  const fileId = `noor_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const safeName = sanitizeSegment(filename || "book.pdf");
  const objectPath = `dashboard/noor-library/${fileId}/${Date.now()}_${safeName}`;
  const token = randomUUID();
  const ctx = { adminApp, bucketName, uploaderUid: uploader?.uid || "" };
  let resolvedThumbnail = null;
  if (thumbnailUrl) {
    resolvedThumbnail = await uploadExternalThumbnail(thumbnailUrl, fileId, ctx);
  }
  const finalContentType = contentType || "application/octet-stream";
  const bucket = getStorage(adminApp).bucket(bucketName);
  await bucket.file(objectPath).save(buffer, {
    contentType: finalContentType,
    resumable: false,
    metadata: {
      contentType: finalContentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
        uploadedByUid: uploader?.uid || "",
        uploadedByEmail: uploader?.email || "",
        uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
        source: source?.provider || "noor-library",
        sourceUrl: source?.url || "",
        sourceBookId: source?.bookId || ""
      }
    }
  });
  const downloadUrl = buildDownloadUrl(bucketName, objectPath, token);
  const finalMetadata = {
    ...metadata,
    thumbnail: resolvedThumbnail || metadata.thumbnail || null,
    content_type: metadata.content_type || inferContentTypeFromMime(finalContentType, "document"),
    is_listed: metadata.is_listed ?? true,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const compatible = buildMobileCompatibleFields(finalMetadata, downloadUrl);
  const payload = stripUndefinedDeep({
    fileId,
    id: fileId,
    downloadUrl,
    filename,
    fileType: finalContentType,
    fileSize: buffer.byteLength,
    metadata: finalMetadata,
    storagePath: objectPath,
    createdAt: FieldValue.serverTimestamp(),
    // حقول إضافيّة لتمييز المصدر — تُكتَب ضمن السجل لكن لا تكسر الـ schema.
    __provider: source?.provider || "noor-library",
    __sourceUrl: source?.url || "",
    __sourceBookId: source?.bookId || "",
    ...compatible
  });
  await adminFsWriteFileMirrorBoth(fileId, payload);
  return {
    fileId,
    downloadUrl,
    storagePath: objectPath,
    contentType: finalContentType,
    size: buffer.byteLength,
    thumbnailUrl: resolvedThumbnail,
    payload
  };
}
async function writeJobPatch(jobId, patch) {
  const ref = getAdminDatabase().ref(`noor_library_jobs/${jobId}`);
  const sanitized = stripUndefinedDeep({
    ...patch,
    updatedAt: { ".sv": "timestamp" }
  });
  await ref.update(sanitized);
}
async function listRecentJobs(limit = 30) {
  const snap = await getAdminDatabase().ref("noor_library_jobs").orderByChild("startedAt").limitToLast(limit).get();
  if (!snap.exists()) return [];
  return Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v || {} })).sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0));
}
export {
  adminUploadAndRegister as a,
  listRecentJobs as l,
  writeJobPatch as w
};
