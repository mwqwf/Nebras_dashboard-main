import { json } from "@sveltejs/kit";
import { b as buildSectionsTree, v as validateHierarchyPath } from "../../../../../../chunks/sectionsTree2.js";
import { p as parseNoorUrl, a as fetchBookMetadata, d as downloadBookFile } from "../../../../../../chunks/fetcher2.js";
import { w as writeJobPatch, a as adminUploadAndRegister } from "../../../../../../chunks/adminUploader.js";
import { i as isAdminConfigured } from "../../../../../../chunks/firebaseAdmin.js";
const config = {
  bodySizeLimit: 5 * 1024 * 1024
};
function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
async function POST(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (auth.role !== "owner" && auth.role !== "supervisor") {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return json(
      {
        error: "not_configured",
        reason: "admin_service_account_missing",
        message: "سكريبت الجلب يحتاج NEBRAS_SERVICE_ACCOUNT_PATH/JSON في .env و ملف خدمة صالح في secrets/."
      },
      { status: 501 }
    );
  }
  let body;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: "bad_request", reason: "invalid_json" }, { status: 400 });
  }
  const url = String(body?.url || "").trim();
  if (!parseNoorUrl(url)) {
    return json({ error: "bad_request", reason: "invalid_noor_url" }, { status: 400 });
  }
  const hierarchy = body?.hierarchy || {};
  const userMetadata = body?.metadata || {};
  const overrideFileUrl = String(body?.overrideFileUrl || "").trim();
  const listed = body?.listed !== false;
  const jobId = makeJobId();
  const startedAt = Date.now();
  await writeJobPatch(jobId, {
    jobId,
    status: "started",
    startedAt,
    url,
    uploaderUid: auth.uid,
    uploaderEmail: auth.email
  }).catch(() => {
  });
  try {
    await writeJobPatch(jobId, { status: "reading_sections" }).catch(() => {
    });
    const sections = await buildSectionsTree();
    const validation = validateHierarchyPath(
      {
        mainId: hierarchy.mainId,
        subId: hierarchy.subId,
        secondaryId: hierarchy.secondaryId || null
      },
      sections.index
    );
    if (!validation.valid) {
      await writeJobPatch(jobId, { status: "failed", failedReason: validation.reason }).catch(() => {
      });
      return json(
        {
          error: "invalid_hierarchy",
          reason: validation.reason,
          message: "المسار المُختار لا يحترم القاعدة الذهبيّة [main → sub → secondary].",
          jobId
        },
        { status: 422 }
      );
    }
    const { main, sub, secondary } = validation.resolved;
    await writeJobPatch(jobId, { status: "fetching_metadata" }).catch(() => {
    });
    const fetched = await fetchBookMetadata(url);
    const fileUrl = overrideFileUrl || fetched.fileUrl;
    if (!fileUrl) {
      await writeJobPatch(jobId, {
        status: "failed",
        failedReason: "no_file_url",
        bookTitle: fetched.title
      }).catch(() => {
      });
      return json(
        {
          error: "no_file_url",
          reason: "no_file_url",
          message: "لم نستطع استخراج رابط الملفّ من صفحة مكتبة نور. مرّر overrideFileUrl يدوياً إن كان لديك الرابط المباشر.",
          jobId,
          metadata: fetched
        },
        { status: 422 }
      );
    }
    await writeJobPatch(jobId, {
      status: "downloading_file",
      bookTitle: fetched.title,
      fileUrl
    }).catch(() => {
    });
    const downloaded = await downloadBookFile(fileUrl);
    await writeJobPatch(jobId, {
      status: "uploading",
      fileSize: downloaded.size,
      contentType: downloaded.contentType
    }).catch(() => {
    });
    const finalMetadata = {
      title: String(userMetadata.title || fetched.title || "").trim(),
      description: String(userMetadata.description || fetched.description || "").trim(),
      author: String(userMetadata.author || fetched.author || "").trim(),
      thumbnail: userMetadata.thumbnail || fetched.thumbnail || null,
      is_listed: listed,
      // الهيكلية الذهبيّة — نمرّر IDs والأسماء لتطبيق الموبايل.
      main_section: String(main.id),
      main_section_id: String(main.id),
      main_section_name: String(main.name || ""),
      subsection: String(sub.id),
      subsection_name: String(sub.name || ""),
      ...secondary ? {
        secondary_subsection: String(secondary.id),
        secondary_subsection_name: String(secondary.name || "")
      } : { secondary_subsection: null }
    };
    const result = await adminUploadAndRegister({
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
      filename: downloaded.filename,
      thumbnailUrl: finalMetadata.thumbnail,
      metadata: finalMetadata,
      uploader: { uid: auth.uid, email: auth.email },
      source: {
        provider: "noor-library",
        url: fetched.source.url,
        bookId: fetched.source.bookId
      }
    });
    await writeJobPatch(jobId, {
      status: "completed",
      completedAt: Date.now(),
      fileId: result.fileId,
      downloadUrl: result.downloadUrl,
      storagePath: result.storagePath,
      thumbnailUrl: result.thumbnailUrl || null,
      elapsedMs: Date.now() - startedAt
    }).catch(() => {
    });
    return json({
      ok: true,
      jobId,
      fileId: result.fileId,
      downloadUrl: result.downloadUrl,
      storagePath: result.storagePath,
      thumbnailUrl: result.thumbnailUrl,
      recordPaths: {
        primary: `dashboard_uploads/${result.fileId}`,
        mirror: `content_unified/files/${result.fileId}`
      },
      hierarchy: {
        main: { id: main.id, name: main.name },
        sub: { id: sub.id, name: sub.name },
        secondary: secondary ? { id: secondary.id, name: secondary.name } : null
      },
      elapsedMs: Date.now() - startedAt
    });
  } catch (err) {
    const reason = err?.reason || "import_failed";
    const status = err?.status || 500;
    await writeJobPatch(jobId, {
      status: "failed",
      failedReason: reason,
      failedMessage: err?.message || String(err)
    }).catch(() => {
    });
    return json(
      {
        error: "import_failed",
        reason,
        message: err?.message || "فشل غير متوقع أثناء الجلب.",
        jobId
      },
      { status }
    );
  }
}
export {
  POST,
  config
};
