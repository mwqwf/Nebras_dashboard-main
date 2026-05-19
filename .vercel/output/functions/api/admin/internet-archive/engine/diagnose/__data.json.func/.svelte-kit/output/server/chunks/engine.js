import { g as getNebrasAdminApp, a as getAdminDatabase, b as getNebrasFirestoreAdmin, i as isAdminConfigured, s as sendTopicMessage } from "./firebaseAdmin.js";
import { a as adminFsSetSectionRecord, b as adminFsReadSectionsLevel, s as stripUndefinedDeep, e as adminFsWriteFileMirrorBoth, d as adminFsBulkDeleteFileMirrorIds } from "./nebrasUnifiedFirestoreAdmin.js";
import { a as NEBRAS_FS_UPLOADS, b as NEBRAS_FS_CONTENT_FILES } from "./nebrasUnifiedPaths.js";
import { b as buildSectionsTree, v as validateHierarchyPath } from "./sectionsTree.js";
import { b as buildLuceneQuery, s as scrapeOnePage } from "./search.js";
import { M as MAX_SIZE_BYTES, v as verifyDownloadedBuffer, p as previewItem } from "./fetcher.js";
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
const ENGINE_TAG = "ia_library_engine";
function makeSectionId() {
  return Date.now() + Math.floor(Math.random() * 1e3);
}
function cleanName(name) {
  return String(name || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 120);
}
async function findMainSectionByName(name) {
  const target = cleanName(name).toLowerCase();
  if (!target) return null;
  const mains = await adminFsReadSectionsLevel("main");
  for (const main of mains) {
    if (String(main.name || "").trim().toLowerCase() === target) {
      return { id: Number(main.id), name: String(main.name) };
    }
  }
  return null;
}
async function findSubSectionByName(mainSectionId, name) {
  const target = cleanName(name).toLowerCase();
  if (!target) return null;
  const subs = await adminFsReadSectionsLevel("sub");
  for (const sub of subs) {
    if (String(sub.main_section ?? "") === String(mainSectionId) && String(sub.name || "").trim().toLowerCase() === target) {
      return { id: Number(sub.id), name: String(sub.name) };
    }
  }
  return null;
}
async function createMainSectionAdmin(name) {
  const cleanedName = cleanName(name);
  if (!cleanedName) {
    throw Object.assign(new Error("اسم القسم الرئيسي مطلوب."), {
      reason: "main_name_required",
      status: 400
    });
  }
  const existing = await findMainSectionByName(cleanedName);
  if (existing) {
    return { id: existing.id, name: existing.name, alreadyExisted: true };
  }
  const id = makeSectionId();
  const payload = {
    id,
    name: cleanedName,
    order_index: 0,
    is_listed: true,
    thumbnail: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    __createdBy: ENGINE_TAG
  };
  await adminFsSetSectionRecord("main", id, payload);
  return { id, name: cleanedName, alreadyExisted: false };
}
async function createSubSectionAdmin(mainSectionId, name) {
  const cleanedName = cleanName(name);
  if (!cleanedName) {
    throw Object.assign(new Error("اسم القسم الفرعي مطلوب."), {
      reason: "sub_name_required",
      status: 400
    });
  }
  const mainNum = Number(mainSectionId);
  if (!Number.isFinite(mainNum) || mainNum <= 0) {
    throw Object.assign(new Error("main_section غير صالح."), {
      reason: "invalid_main_section",
      status: 400
    });
  }
  const existing = await findSubSectionByName(mainNum, cleanedName);
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      main_section: mainNum,
      alreadyExisted: true
    };
  }
  const id = makeSectionId();
  const payload = {
    id,
    name: cleanedName,
    main_section: mainNum,
    is_listed: true,
    thumbnail: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    __createdBy: ENGINE_TAG
  };
  await adminFsSetSectionRecord("sub", id, payload);
  return { id, name: cleanedName, main_section: mainNum, alreadyExisted: false };
}
function normalizeArabic(s) {
  return String(s || "").replace(/[ً-ٟؐ-ؚۖ-ۭ]/g, "").replace(/ـ/g, "").replace(/[آأإٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
}
const COLLECTION_LABELS = Object.freeze({
  opensource: "محتوى مفتوح",
  opensource_arabic: "محتوى عربي مفتوح",
  community_texts: "نصوص مجتمعيّة",
  arabicliterature: "الأدب العربي",
  arabicliteratureandlinguistics: "الأدب واللغة العربيّة",
  islamicbooks_archive: "كتب إسلاميّة",
  "islamic-books": "كتب إسلاميّة",
  shamela: "المكتبة الشاملة"
});
const SUBJECT_HINTS = Object.freeze({
  quran: "القرآن الكريم",
  "quranic-recitation": "تلاوة القرآن الكريم",
  tafsir: "التفسير",
  hadith: "الحديث الشريف",
  fiqh: "الفقه الإسلامي",
  "islamic-law": "الفقه الإسلامي",
  aqeedah: "العقيدة",
  creed: "العقيدة",
  seerah: "السيرة النبويّة",
  history: "التاريخ الإسلامي",
  arabic: "اللغة العربيّة",
  literature: "الأدب",
  dawah: "الدعوة",
  "islamic-lectures": "دروس إسلاميّة"
});
function labelizeSubject(raw) {
  const n = normalizeArabic(raw);
  if (!n) return "";
  const en = String(raw || "").trim().toLowerCase().replace(/_/g, "-");
  if (SUBJECT_HINTS[en]) return SUBJECT_HINTS[en];
  return String(raw || "").trim().slice(0, 60);
}
function labelizeCollection(raw) {
  const en = String(raw || "").trim().toLowerCase();
  if (COLLECTION_LABELS[en]) return COLLECTION_LABELS[en];
  return String(raw || "").trim().slice(0, 60);
}
function defaultMainNameByType(nebrasContentType) {
  if (nebrasContentType === "audio") return "الصوتيّات";
  if (nebrasContentType === "video") return "الفيديو";
  return "المكتبة";
}
function defaultSubNameByType(nebrasContentType) {
  if (nebrasContentType === "audio") return "تسجيلات صوتيّة";
  if (nebrasContentType === "video") return "مقاطع مرئيّة";
  return "كتب متنوّعة";
}
function tokensOf(s, minLen = 3) {
  return new Set(
    normalizeArabic(s).split(" ").filter((t) => t.length >= minLen)
  );
}
function scoreOf(sectionName, haystack, tokens) {
  const n = normalizeArabic(sectionName);
  if (!n) return 0;
  let score = 0;
  for (const w of n.split(" ")) {
    if (w.length >= 3 && tokens.has(w)) score += 1;
  }
  if (n.length >= 4 && haystack.includes(n)) score += 3;
  return score;
}
function pickBestHint(subjects, collections, nebrasContentType) {
  for (const s of subjects || []) {
    const labeled = labelizeSubject(s);
    if (labeled && labeled !== String(s).trim()) {
      return labeled;
    }
  }
  for (const s of subjects || []) {
    const n = String(s || "").trim();
    if (n && /[؀-ۿ]/.test(n) && n.length <= 40) return n.slice(0, 60);
  }
  for (const c of collections || []) {
    const labeled = labelizeCollection(c);
    if (labeled && labeled !== String(c).trim()) return labeled;
  }
  return defaultSubNameByType(nebrasContentType);
}
function classifyItem(sections, item) {
  const haystack = normalizeArabic(
    [
      item.title,
      item.author,
      item.description,
      ...item.subjects || [],
      ...item.collections || []
    ].filter(Boolean).join(" ")
  );
  const tokens = tokensOf(haystack);
  const tree = sections.tree || [];
  let bestMain = null;
  let bestMainScore = 0;
  for (const m of tree) {
    const s = scoreOf(m.name, haystack, tokens);
    if (s > bestMainScore) {
      bestMainScore = s;
      bestMain = m;
    }
  }
  const bestHint = pickBestHint(item.subjects, item.collections, item.nebrasContentType);
  if (!bestMain || bestMainScore === 0) {
    return {
      kind: "create_main",
      mainId: null,
      subId: null,
      secondaryId: null,
      newMainName: defaultMainNameByType(item.nebrasContentType),
      newSubName: bestHint,
      confidence: 0.35,
      reasoning: "لم يُعثَر على قسم رئيسي مناسب — اقتراح إنشاء قسم جديد.",
      method: "heuristic"
    };
  }
  let bestSub = null;
  let bestSubScore = 0;
  for (const sub of bestMain.children || []) {
    const s = scoreOf(sub.name, haystack, tokens);
    if (s > bestSubScore) {
      bestSubScore = s;
      bestSub = sub;
    }
  }
  if (!bestSub) {
    return {
      kind: "create_sub",
      mainId: String(bestMain.id),
      subId: null,
      secondaryId: null,
      newSubName: bestHint,
      confidence: 0.45,
      reasoning: `وُجد قسم رئيسي مناسب "${bestMain.name}" — اقتراح إنشاء قسم فرعي جديد.`,
      method: "heuristic"
    };
  }
  let bestSec = null;
  let bestSecScore = 0;
  for (const sec of bestSub.children || []) {
    const s = scoreOf(sec.name, haystack, tokens);
    if (s > bestSecScore) {
      bestSecScore = s;
      bestSec = sec;
    }
  }
  return {
    kind: "existing",
    mainId: String(bestMain.id),
    subId: String(bestSub.id),
    secondaryId: bestSec ? String(bestSec.id) : null,
    confidence: Math.min(0.5 + bestMainScore * 0.05 + bestSubScore * 0.05, 0.9),
    reasoning: `مطابقة محلّيّة: ${bestMain.name} ← ${bestSub.name}${bestSec ? " ← " + bestSec.name : ""}.`,
    method: "heuristic"
  };
}
const USER_AGENT = "NebrasDashboard/1.0 (+self-hosted; contact: admin@nebras.local)";
async function downloadIaFile(url, opts) {
  const declaredType = opts?.declaredType;
  if (!declaredType) {
    throw Object.assign(new Error("declaredType مطلوب لـ downloadIaFile."), {
      reason: "declared_type_required",
      status: 400
    });
  }
  const maxBytes = Number(opts?.maxBytes || MAX_SIZE_BYTES[declaredType] || 0);
  if (!maxBytes) {
    throw Object.assign(new Error("maxBytes غير صالح."), {
      reason: "invalid_max_bytes",
      status: 400
    });
  }
  const timeoutMs = Math.max(5e3, Math.min(18e4, Number(opts?.timeoutMs || 9e4)));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("download_timeout")), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*"
      }
    });
  } catch (err) {
    clearTimeout(timer);
    throw Object.assign(new Error(`فشل بدء التنزيل: ${err?.message || err}`), {
      reason: "fetch_failed",
      status: 502
    });
  }
  if (!res.ok) {
    clearTimeout(timer);
    throw Object.assign(new Error(`IA download HTTP ${res.status}`), {
      reason: "download_http_error",
      status: res.status
    });
  }
  const declaredLen = Number(res.headers.get("content-length") || 0);
  if (declaredLen > 0 && declaredLen > maxBytes) {
    clearTimeout(timer);
    throw Object.assign(new Error("الملفّ أكبر من الحدّ المسموح به (Content-Length)."), {
      reason: "size_over_limit_header",
      status: 413
    });
  }
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  const chunks = [];
  let received = 0;
  const reader = res.body?.getReader();
  if (!reader) {
    clearTimeout(timer);
    throw Object.assign(new Error("لا يوجد body للقراءة."), {
      reason: "no_body",
      status: 502
    });
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        try {
          await reader.cancel();
        } catch {
        }
        throw Object.assign(new Error("تجاوز التنزيل الحدّ المسموح به أثناء البثّ."), {
          reason: "size_over_limit_streaming",
          status: 413
        });
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
  }
  const buffer = Buffer.concat(chunks.map((u) => Buffer.from(u)));
  const verify = verifyDownloadedBuffer(buffer, { contentType, declaredType });
  if (!verify.ok) {
    throw Object.assign(
      new Error(`الملفّ المنزَّل غير صالح (${verify.reason}).`),
      { reason: `verify_${verify.reason}`, status: 422 }
    );
  }
  return { buffer, contentType, size: buffer.byteLength };
}
function generateNebrasFileId() {
  return `fb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
const NEBRAS_PROJECT_ID = "nebras-9118c";
function assertNebrasApp(app) {
  const projectId = app?.options?.projectId || "";
  if (projectId !== NEBRAS_PROJECT_ID) {
    throw Object.assign(
      new Error(
        `عُزل صارم انتُهك: محرّك Internet Archive يجب أن يستخدم Nebras (${NEBRAS_PROJECT_ID}) فقط، لكنّه تلقّى تطبيقاً لمشروع "${projectId}".`
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
function toNebrasContentType(nebrasType) {
  if (nebrasType === "audio") return "audio";
  if (nebrasType === "video") return "video";
  return "document";
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
  if (buf.byteLength === 0 || buf.byteLength > 10 * 1024 * 1024) return null;
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
        source: "nebras_dashboard"
      }
    }
  });
  return buildDownloadUrl(ctx.bucketName, objectPath, token);
}
async function adminUploadAndRegister(args) {
  const {
    buffer,
    contentType,
    filename,
    nebrasContentType,
    thumbnailUrl,
    metadata,
    uploader,
    iaInfo
  } = args;
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
      new Error("NEBRAS_STORAGE_BUCKET غير مضبوط — لا يمكن رفع الملفّات."),
      { reason: "storage_bucket_missing", status: 501 }
    );
  }
  const fileId = generateNebrasFileId();
  const safeName = sanitizeSegment(filename || "item.bin");
  const objectPath = `dashboard/internet-archive/${fileId}/${Date.now()}_${safeName}`;
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
        source: "nebras_dashboard",
        sourceUrl: iaInfo?.iaSourceUrl || "",
        sourceIdentifier: iaInfo?.identifier || ""
      }
    }
  });
  const downloadUrl = buildDownloadUrl(bucketName, objectPath, token);
  const createdAtIso = (/* @__PURE__ */ new Date()).toISOString();
  const finalMetadata = {
    ...metadata,
    id: fileId,
    thumbnail: resolvedThumbnail || metadata.thumbnail || null,
    content_type: toNebrasContentType(nebrasContentType),
    is_listed: metadata.is_listed ?? true,
    created_at: createdAtIso
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
    // علامات داخليّة — لا يقرأها التطبيق (ولا تكسر schema).
    __provider: "internet_archive",
    __iaIdentifier: String(iaInfo?.identifier || ""),
    __iaSourceUrl: String(iaInfo?.iaSourceUrl || ""),
    __iaLicense: String(iaInfo?.license || ""),
    __iaCollection: String(iaInfo?.collection || ""),
    __iaImportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    __iaOriginalFilename: String(filename || ""),
    created_at: createdAtIso,
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
const REGISTRY_ROOT = "ia_library_registry";
const FAILURES_ROOT = "ia_library_failures";
const FAILURE_BLACKLIST_THRESHOLD = 3;
function safeKey(identifier) {
  return String(identifier || "").replace(/[.$#\[\]/]/g, "_").slice(0, 700);
}
async function isItemImported(identifier) {
  const key = safeKey(identifier);
  if (!key) return false;
  const snap = await getAdminDatabase().ref(`${REGISTRY_ROOT}/${key}`).get();
  return snap.exists();
}
async function partitionKnownItems(identifiers) {
  const ids = (identifiers || []).map(safeKey).filter(Boolean);
  const db = getAdminDatabase();
  const [regSnap, failSnap] = await Promise.all([
    db.ref(REGISTRY_ROOT).get(),
    db.ref(FAILURES_ROOT).get()
  ]);
  const known = new Set(regSnap.exists() ? Object.keys(regSnap.val() || {}) : []);
  if (failSnap.exists()) {
    const failures = failSnap.val() || {};
    for (const [id, rec] of Object.entries(failures)) {
      const count = Number(rec?.count || 0);
      if (count >= FAILURE_BLACKLIST_THRESHOLD) known.add(id);
    }
  }
  if (ids.length === 0) return { knownIds: known, newIds: [] };
  const newIds = [];
  for (const id of ids) {
    if (!known.has(id)) newIds.push(id);
  }
  return { knownIds: known, newIds };
}
async function recordImported(identifier, record) {
  const key = safeKey(identifier);
  if (!key) throw new Error("identifier غير صالح للتسجيل.");
  const payload = {
    fileId: String(record?.fileId || ""),
    title: String(record?.title || "").slice(0, 400),
    iaSourceUrl: String(record?.iaSourceUrl || "").slice(0, 1e3),
    licenseMatched: String(record?.licenseMatched || "").slice(0, 200),
    collection: String(record?.collection || "").slice(0, 200),
    hierarchy: record?.hierarchy || null,
    createdSectionsIds: Array.isArray(record?.createdSectionsIds) ? record.createdSectionsIds.slice(0, 10) : [],
    pickedFileName: String(record?.pickedFileName || "").slice(0, 240),
    pickedFileSize: Number(record?.pickedFileSize || 0),
    nebrasContentType: String(record?.nebrasContentType || "").slice(0, 16),
    importedAt: { ".sv": "timestamp" }
  };
  await getAdminDatabase().ref(`${REGISTRY_ROOT}/${key}`).set(payload);
}
async function recordFailure(identifier, info = {}) {
  const key = safeKey(identifier);
  if (!key) return;
  const ref = getAdminDatabase().ref(`${FAILURES_ROOT}/${key}`);
  await ref.transaction((current) => {
    const c = current || { count: 0, firstFailedAt: Date.now() };
    return {
      count: Number(c.count || 0) + 1,
      firstFailedAt: c.firstFailedAt || Date.now(),
      lastFailedAt: Date.now(),
      lastReason: String(info?.reason || "unknown").slice(0, 80),
      lastMessage: String(info?.message || "").slice(0, 300),
      iaSourceUrl: String(info?.iaSourceUrl || c.iaSourceUrl || "").slice(0, 1e3)
    };
  });
}
const ENGINE_ROOT = "ia_library_engine";
const CONFIG_PATH = `${ENGINE_ROOT}/config`;
const CURSOR_PATH = `${ENGINE_ROOT}/cursor`;
const STATS_PATH = `${ENGINE_ROOT}/stats`;
const LOG_PATH = `${ENGINE_ROOT}/log`;
const LOG_MAX_ENTRIES = 60;
const DEFAULT_SEEDS = Object.freeze([
  {
    id: "arabic_texts_opensource",
    label: "كتب عربية — مصدر مفتوح",
    q: "language:Arabic",
    nebrasTypes: ["document"],
    collections: ["opensource_arabic", "community_texts", "opensource"]
  },
  {
    id: "arabic_audio_opensource",
    label: "صوتيّات عربيّة — مصدر مفتوح",
    q: "language:Arabic",
    nebrasTypes: ["audio"],
    collections: ["opensource_audio", "opensource"]
  },
  {
    id: "islamic_video_opensource",
    label: "فيديو إسلامي — مصدر مفتوح",
    q: "(islamic OR إسلامي OR محاضرة)",
    nebrasTypes: ["video"],
    collections: ["opensource_movies", "opensource"]
  }
]);
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  seeds: [...DEFAULT_SEEDS],
  tickIntervalMs: 12e3,
  batchSize: 1,
  scrapeCount: 20,
  trustedCollections: ["opensource", "opensource_arabic", "community_texts"],
  allowMissingLicenseInTrustedCollections: true
});
const GLOBAL_KEY = "__NEBRAS_IA_ENGINE__";
function getGlobalState() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      running: false,
      currentTickInFlight: false,
      timer: null,
      lastTickStartedAt: null,
      lastTickEndedAt: null,
      autoBootAttempted: false
    };
  }
  return globalThis[GLOBAL_KEY];
}
function isValidSeed(seed) {
  if (!seed || typeof seed !== "object") return false;
  if (!String(seed.id || "").trim()) return false;
  const types = Array.isArray(seed.nebrasTypes) ? seed.nebrasTypes : [];
  for (const t of types) {
    if (t !== "document" && t !== "audio" && t !== "video") return false;
  }
  if (!String(seed.q || "").trim() && types.length === 0 && (!seed.collections || seed.collections.length === 0)) {
    return false;
  }
  return true;
}
async function readConfig() {
  const snap = await getAdminDatabase().ref(CONFIG_PATH).get();
  if (!snap.exists()) return { ...DEFAULT_CONFIG, seeds: [...DEFAULT_SEEDS] };
  const v = snap.val() || {};
  const validSeeds = Array.isArray(v.seeds) ? v.seeds.filter(isValidSeed) : [];
  const seeds = validSeeds.length > 0 ? validSeeds : [...DEFAULT_SEEDS];
  return {
    enabled: v.enabled === void 0 ? true : Boolean(v.enabled),
    seeds,
    tickIntervalMs: Math.max(3e3, Number(v.tickIntervalMs) || DEFAULT_CONFIG.tickIntervalMs),
    batchSize: Math.max(1, Math.min(10, Number(v.batchSize) || DEFAULT_CONFIG.batchSize)),
    scrapeCount: Math.max(10, Math.min(1e3, Number(v.scrapeCount) || DEFAULT_CONFIG.scrapeCount)),
    trustedCollections: Array.isArray(v.trustedCollections) ? v.trustedCollections : DEFAULT_CONFIG.trustedCollections,
    allowMissingLicenseInTrustedCollections: v.allowMissingLicenseInTrustedCollections === void 0 ? DEFAULT_CONFIG.allowMissingLicenseInTrustedCollections : Boolean(v.allowMissingLicenseInTrustedCollections)
  };
}
async function writeConfig(patch) {
  const current = await readConfig();
  const next = { ...current, ...patch };
  if (Array.isArray(patch.seeds)) {
    next.seeds = patch.seeds.filter(isValidSeed);
  }
  await getAdminDatabase().ref(CONFIG_PATH).set(next);
  return next;
}
async function readCursor() {
  const snap = await getAdminDatabase().ref(CURSOR_PATH).get();
  if (!snap.exists()) return { seedIndex: 0, scrapeCursor: null };
  const v = snap.val() || {};
  return {
    seedIndex: Math.max(0, Number(v.seedIndex) || 0),
    scrapeCursor: typeof v.scrapeCursor === "string" && v.scrapeCursor ? v.scrapeCursor : null
  };
}
async function writeCursor(cursor) {
  await getAdminDatabase().ref(CURSOR_PATH).set({
    seedIndex: cursor.seedIndex,
    scrapeCursor: cursor.scrapeCursor || null,
    updatedAt: { ".sv": "timestamp" }
  });
}
async function readStats() {
  const snap = await getAdminDatabase().ref(STATS_PATH).get();
  if (!snap.exists()) {
    return {
      totalImported: 0,
      totalSkipped: 0,
      totalFailed: 0,
      sectionsCreated: 0,
      lastRunAt: null,
      lastError: null,
      runsCount: 0,
      consecutiveEmptyRuns: 0
    };
  }
  const v = snap.val() || {};
  return {
    totalImported: Number(v.totalImported) || 0,
    totalSkipped: Number(v.totalSkipped) || 0,
    totalFailed: Number(v.totalFailed) || 0,
    sectionsCreated: Number(v.sectionsCreated) || 0,
    lastRunAt: v.lastRunAt || null,
    lastError: v.lastError || null,
    runsCount: Number(v.runsCount) || 0,
    consecutiveEmptyRuns: Number(v.consecutiveEmptyRuns) || 0
  };
}
async function bumpStats(patch) {
  const ref = getAdminDatabase().ref(STATS_PATH);
  await ref.transaction((current) => {
    const c = current || {};
    return {
      totalImported: Number(c.totalImported ?? 0) + Number(patch.importedDelta ?? 0),
      totalSkipped: Number(c.totalSkipped ?? 0) + Number(patch.skippedDelta ?? 0),
      totalFailed: Number(c.totalFailed ?? 0) + Number(patch.failedDelta ?? 0),
      sectionsCreated: Number(c.sectionsCreated ?? 0) + Number(patch.sectionsCreatedDelta ?? 0),
      runsCount: Number(c.runsCount ?? 0) + Number(patch.runsDelta ?? 0),
      lastRunAt: patch.touchLastRun ? Date.now() : c.lastRunAt ?? null,
      lastError: patch.lastError !== void 0 ? patch.lastError ?? null : c.lastError ?? null,
      consecutiveEmptyRuns: Number(c.consecutiveEmptyRuns ?? 0)
    };
  });
}
async function appendLog(entry) {
  const db = getAdminDatabase();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.ref(`${LOG_PATH}/${id}`).set({ ...entry, ts: Date.now() });
  const all = await db.ref(LOG_PATH).orderByChild("ts").get().catch(() => null);
  if (!all || !all.exists()) return;
  const entries = Object.entries(all.val() || {}).sort(
    (a, b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0)
  );
  if (entries.length > LOG_MAX_ENTRIES) {
    const updates = {};
    for (const [k] of entries.slice(LOG_MAX_ENTRIES)) updates[`${LOG_PATH}/${k}`] = null;
    await db.ref().update(updates);
  }
}
async function readLog(limit = 30) {
  const snap = await getAdminDatabase().ref(LOG_PATH).orderByChild("ts").limitToLast(Math.max(1, Math.min(LOG_MAX_ENTRIES, Number(limit) || 30))).get();
  if (!snap.exists()) return [];
  return Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v || {} })).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}
const FCM_DEFAULT_TOPIC = "nebras_all_users";
function fcmTopic() {
  return String(process?.env?.FCM_BROADCAST_TOPIC || "").trim() || FCM_DEFAULT_TOPIC;
}
function idToString(value) {
  return value === null || value === void 0 ? "" : String(value).trim();
}
async function notifyFcmContentAdded(info) {
  if (!isAdminConfigured()) return;
  const title = "محتوى جديد في نبراس";
  const chain = [info?.mainSectionName, info?.subSectionName, info?.secondarySectionName].map((s) => (s || "").trim()).filter(Boolean);
  const body = `تمت إضافة "${(info?.title || "").trim()}"${chain.length ? ` في ${chain.join(" › ")}` : ""}`;
  try {
    await sendTopicMessage({
      topic: fcmTopic(),
      title,
      body,
      data: {
        type: "content_added",
        source: "nebras_dashboard",
        contentType: info?.contentType || "document",
        contentId: idToString(info?.contentId),
        mainSectionId: idToString(info?.mainSectionId),
        subSectionId: idToString(info?.subSectionId),
        secondarySectionId: idToString(info?.secondarySectionId),
        mainSectionName: info?.mainSectionName || "",
        subSectionName: info?.subSectionName || "",
        secondarySectionName: info?.secondarySectionName || "",
        sourceUrl: ""
      }
    });
  } catch (err) {
    await appendLog({
      level: "warn",
      message: `إشعار FCM فشل: ${err?.message || String(err)}`,
      reason: "fcm_send_failed"
    }).catch(() => {
    });
  }
}
async function importItem(identifier, opts = {}) {
  const preview = await previewItem(identifier, {
    trustedCollections: opts.trustedCollections,
    allowMissingLicenseInTrustedCollections: opts.allowMissingLicenseInTrustedCollections
  });
  let sections = await buildSectionsTree();
  let main = null;
  let sub = null;
  let secondary = null;
  const createdSectionsIds = [];
  let sectionsCreatedDelta = 0;
  let decisionReasoning = "forced_hierarchy";
  let decisionConfidence = 1;
  if (opts.forcedHierarchy?.mainId && opts.forcedHierarchy?.subId) {
    const v = validateHierarchyPath(
      {
        mainId: opts.forcedHierarchy.mainId,
        subId: opts.forcedHierarchy.subId,
        secondaryId: opts.forcedHierarchy.secondaryId || null
      },
      sections.index
    );
    if (!v.valid) {
      throw Object.assign(new Error(`hierarchy غير صالحة: ${v.reason}`), {
        reason: v.reason,
        status: 400
      });
    }
    main = v.resolved.main;
    sub = v.resolved.sub;
    secondary = v.resolved.secondary;
  } else {
    const decision = classifyItem(sections, {
      title: preview.title,
      author: preview.author,
      description: preview.description,
      subjects: preview.subjects,
      collections: preview.collections,
      nebrasContentType: preview.nebrasContentType
    });
    decisionReasoning = decision.reasoning;
    decisionConfidence = decision.confidence;
    let mainId = decision.mainId;
    if (decision.kind === "create_main") {
      const created = await createMainSectionAdmin(decision.newMainName);
      mainId = String(created.id);
      if (!created.alreadyExisted) {
        createdSectionsIds.push(mainId);
        sectionsCreatedDelta += 1;
        await appendLog({
          level: "success",
          message: `قسم رئيسي جديد: "${created.name}"`,
          sectionId: mainId,
          kind: "main_section_created"
        }).catch(() => {
        });
      }
      const subCreated = await createSubSectionAdmin(mainId, decision.newSubName);
      const subId = String(subCreated.id);
      if (!subCreated.alreadyExisted) {
        createdSectionsIds.push(subId);
        sectionsCreatedDelta += 1;
        await appendLog({
          level: "success",
          message: `قسم فرعي جديد: "${subCreated.name}" تحت "${created.name}"`,
          sectionId: subId,
          kind: "sub_section_created"
        }).catch(() => {
        });
      }
      sections = await buildSectionsTree();
      main = sections.index.mainsById[mainId];
      sub = sections.index.subsById[subId];
    } else if (decision.kind === "create_sub") {
      const subCreated = await createSubSectionAdmin(mainId, decision.newSubName);
      const subId = String(subCreated.id);
      if (!subCreated.alreadyExisted) {
        createdSectionsIds.push(subId);
        sectionsCreatedDelta += 1;
        await appendLog({
          level: "success",
          message: `قسم فرعي جديد: "${subCreated.name}"`,
          sectionId: subId,
          kind: "sub_section_created"
        }).catch(() => {
        });
      }
      sections = await buildSectionsTree();
      main = sections.index.mainsById[String(mainId)];
      sub = sections.index.subsById[subId];
    } else {
      main = sections.index.mainsById[String(decision.mainId)];
      sub = sections.index.subsById[String(decision.subId)];
      secondary = decision.secondaryId ? sections.index.secondariesById[String(decision.secondaryId)] : null;
    }
  }
  if (!main || !sub) {
    throw Object.assign(new Error("فشل تحديد main/sub بعد التصنيف."), {
      reason: "classification_failed",
      status: 500
    });
  }
  const downloaded = await downloadIaFile(preview.pickedFile.downloadUrl, {
    declaredType: preview.nebrasContentType
  });
  const result = await adminUploadAndRegister({
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    filename: preview.pickedFile.name,
    nebrasContentType: preview.nebrasContentType,
    thumbnailUrl: preview.thumbnailUrl,
    metadata: {
      title: preview.title,
      description: preview.description,
      author: preview.author,
      is_listed: true,
      main_section: String(main.id),
      main_section_id: String(main.id),
      main_section_name: String(main.name || ""),
      subsection: String(sub.id),
      subsection_name: String(sub.name || ""),
      ...secondary ? {
        secondary_subsection: String(secondary.id),
        secondary_subsection_name: String(secondary.name || "")
      } : { secondary_subsection: null }
    },
    uploader: { uid: "ia_library_engine", email: "engine@nebras.local" },
    iaInfo: {
      identifier: preview.identifier,
      iaSourceUrl: preview.iaSourceUrl,
      license: preview.licenseInfo.licenseMatched || "",
      collection: preview.licenseInfo.collection || ""
    }
  });
  await recordImported(identifier, {
    fileId: result.fileId,
    title: preview.title,
    iaSourceUrl: preview.iaSourceUrl,
    licenseMatched: preview.licenseInfo.licenseMatched || "",
    collection: preview.licenseInfo.collection || "",
    hierarchy: {
      mainId: String(main.id),
      subId: String(sub.id),
      secondaryId: secondary ? String(secondary.id) : null
    },
    createdSectionsIds,
    pickedFileName: preview.pickedFile.name,
    pickedFileSize: preview.pickedFile.size,
    nebrasContentType: preview.nebrasContentType
  });
  if (sectionsCreatedDelta > 0) {
    await bumpStats({ sectionsCreatedDelta }).catch(() => {
    });
  }
  await notifyFcmContentAdded({
    title: preview.title,
    contentType: preview.nebrasContentType,
    contentId: result.fileId,
    mainSectionId: main.id,
    subSectionId: sub.id,
    secondarySectionId: secondary?.id || "",
    mainSectionName: main.name,
    subSectionName: sub.name,
    secondarySectionName: secondary?.name || ""
  });
  return {
    fileId: result.fileId,
    title: preview.title,
    nebrasContentType: preview.nebrasContentType,
    hierarchy: {
      main: { id: String(main.id), name: String(main.name) },
      sub: { id: String(sub.id), name: String(sub.name) },
      secondary: secondary ? { id: String(secondary.id), name: String(secondary.name) } : null
    },
    createdSectionsIds,
    decisionReasoning,
    decisionConfidence
  };
}
async function runEngineTick() {
  const cfg = await readConfig();
  if (!cfg.seeds.length) {
    throw Object.assign(new Error("لا توجد بذور (seeds) مهيَّأة."), {
      reason: "no_seeds",
      status: 400
    });
  }
  let cursor = await readCursor();
  if (cursor.seedIndex >= cfg.seeds.length) {
    cursor = { seedIndex: 0, scrapeCursor: null };
  }
  const seed = cfg.seeds[cursor.seedIndex];
  const query = buildLuceneQuery({
    q: seed.q,
    nebrasTypes: seed.nebrasTypes,
    languages: seed.languages,
    collections: seed.collections,
    creators: seed.creators
  });
  const page = await scrapeOnePage({
    query,
    count: cfg.scrapeCount,
    cursor: cursor.scrapeCursor
  });
  if (page.items.length === 0) {
    const nextIndex = (cursor.seedIndex + 1) % cfg.seeds.length;
    const nextCursor2 = { seedIndex: nextIndex, scrapeCursor: null };
    await writeCursor(nextCursor2);
    await appendLog({
      level: "info",
      message: `استُنفدت "${seed.label || seed.id}" — التحوّل للبذرة التاليّة.`,
      seedId: seed.id
    });
    return {
      processed: 0,
      skipped: 0,
      failed: 0,
      advancedToNextSeed: true,
      cursor: nextCursor2,
      currentSeedId: seed.id
    };
  }
  const identifiers = page.items.map((it) => String(it?.identifier || "")).filter(Boolean);
  const { newIds } = await partitionKnownItems(identifiers);
  const newSet = new Set(newIds);
  const toProcess = page.items.filter((it) => newSet.has(String(it?.identifier || "")));
  const batch = toProcess.slice(0, cfg.batchSize);
  let processed = 0;
  let skipped = identifiers.length - toProcess.length;
  let failed = 0;
  let totalSectionsCreated = 0;
  for (const item of batch) {
    const id = String(item?.identifier || "");
    if (!id) continue;
    if (await isItemImported(id).catch(() => false)) {
      skipped += 1;
      continue;
    }
    try {
      const r = await importItem(id, {
        trustedCollections: cfg.trustedCollections,
        allowMissingLicenseInTrustedCollections: cfg.allowMissingLicenseInTrustedCollections
        // لا forcedHierarchy → تصنيف آلي كامل
      });
      processed += 1;
      totalSectionsCreated += r.createdSectionsIds?.length || 0;
      await appendLog({
        level: "success",
        message: `استورد "${r.title}" → ${r.hierarchy.main.name} › ${r.hierarchy.sub.name}${r.hierarchy.secondary ? " › " + r.hierarchy.secondary.name : ""}`,
        identifier: id,
        fileId: r.fileId,
        seedId: seed.id
      });
    } catch (err) {
      failed += 1;
      const reason = err?.reason || "unknown";
      await recordFailure(id, {
        reason,
        message: err?.message || String(err),
        iaSourceUrl: `https://archive.org/details/${id}`
      }).catch(() => {
      });
      await appendLog({
        level: "error",
        message: `فشل "${id}": ${err?.message || err}`,
        identifier: id,
        seedId: seed.id,
        reason
      });
    }
  }
  let advancedToNextSeed = false;
  let nextCursor;
  if (batch.length < toProcess.length) {
    nextCursor = { seedIndex: cursor.seedIndex, scrapeCursor: cursor.scrapeCursor };
  } else if (page.nextCursor) {
    nextCursor = { seedIndex: cursor.seedIndex, scrapeCursor: page.nextCursor };
  } else {
    const ni = (cursor.seedIndex + 1) % cfg.seeds.length;
    nextCursor = { seedIndex: ni, scrapeCursor: null };
    advancedToNextSeed = true;
  }
  await writeCursor(nextCursor);
  await bumpStats({
    importedDelta: processed,
    skippedDelta: skipped,
    failedDelta: failed,
    runsDelta: 1,
    touchLastRun: true,
    lastError: failed > 0 ? `${failed} فشلت في الدورة الأخيرة` : null
  });
  if (processed === 0) {
    const cur = await readStats().catch(() => null);
    const next = Number(cur?.consecutiveEmptyRuns || 0) + 1;
    await getAdminDatabase().ref(`${STATS_PATH}/consecutiveEmptyRuns`).set(next).catch(() => {
    });
  } else {
    await getAdminDatabase().ref(`${STATS_PATH}/consecutiveEmptyRuns`).set(0).catch(() => {
    });
  }
  return {
    processed,
    skipped,
    failed,
    sectionsCreated: totalSectionsCreated,
    advancedToNextSeed,
    cursor: nextCursor,
    currentSeedId: seed.id
  };
}
async function startEngine() {
  const cfg = await writeConfig({ enabled: true });
  const state = getGlobalState();
  if (state.running) {
    await appendLog({ level: "info", message: "المحرّك يعمل بالفعل." });
    return { running: true, alreadyRunning: true, config: cfg };
  }
  state.running = true;
  await appendLog({ level: "info", message: "بدء المحرّك الآليّ." });
  state.timer = setTimeout(() => tickLoop().catch(() => {
  }), 100);
  return { running: true, alreadyRunning: false, config: cfg };
}
async function stopEngine() {
  const state = getGlobalState();
  state.running = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const cfg = await writeConfig({ enabled: false });
  await appendLog({ level: "info", message: "إيقاف المحرّك بطلب صريح." });
  return { running: false, config: cfg };
}
async function bootstrap() {
  const current = await readConfig();
  const seeds = current.seeds.length > 0 ? current.seeds : [...DEFAULT_SEEDS];
  const cfg = await writeConfig({ seeds, enabled: true });
  await writeCursor({ seedIndex: 0, scrapeCursor: null });
  await appendLog({
    level: "info",
    message: `Bootstrap: ${cfg.seeds.length} بذور مُفعَّلة — بدء الجلب الآليّ الكامل.`
  });
  let firstTickResult = null;
  try {
    firstTickResult = await runEngineTick();
  } catch (err) {
    await appendLog({
      level: "warn",
      message: `أوّل tick فشل بعد bootstrap: ${err?.message || err}`,
      reason: err?.reason || "bootstrap_first_tick_failed"
    });
  }
  const state = getGlobalState();
  if (!state.running) {
    state.running = true;
    state.timer = setTimeout(() => tickLoop().catch(() => {
    }), 100);
  }
  return { ok: true, config: cfg, firstTickResult };
}
async function tickLoop() {
  const state = getGlobalState();
  if (!state.running || state.currentTickInFlight) return;
  state.currentTickInFlight = true;
  state.lastTickStartedAt = Date.now();
  try {
    const cfg = await readConfig();
    if (!cfg.enabled) {
      state.running = false;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      await appendLog({ level: "info", message: "إيقاف المحرّك (enabled=false)." });
      return;
    }
    await runEngineTick();
  } catch (err) {
    await appendLog({
      level: "error",
      message: `tick فشل: ${err?.message || err}`,
      reason: err?.reason || "tick_failed"
    }).catch(() => {
    });
    await bumpStats({ lastError: err?.message || String(err), touchLastRun: true }).catch(() => {
    });
  } finally {
    state.currentTickInFlight = false;
    state.lastTickEndedAt = Date.now();
    if (state.running) {
      const cfg = await readConfig().catch(() => DEFAULT_CONFIG);
      state.timer = setTimeout(() => tickLoop().catch(() => {
      }), cfg.tickIntervalMs);
    }
  }
}
async function autoBootIfNeeded(opts = {}) {
  const state = getGlobalState();
  const runInline = opts.runInlineTick !== false;
  const firstTime = !state.autoBootAttempted;
  state.autoBootAttempted = true;
  const db = getAdminDatabase();
  const cfgSnap = await db.ref(CONFIG_PATH).get();
  if (!cfgSnap.exists()) {
    await db.ref(CONFIG_PATH).set({
      ...DEFAULT_CONFIG,
      seeds: [...DEFAULT_SEEDS]
    });
    await appendLog({
      level: "info",
      message: "إقلاع أوّليّ: تمّ كتابة DEFAULT_CONFIG (enabled=true + بذور)."
    }).catch(() => {
    });
  }
  const cfg = await readConfig();
  if (!cfg.enabled) return { booted: false, reason: "engine_disabled_by_user" };
  if (firstTime && !state.running) {
    state.running = true;
    await appendLog({
      level: "info",
      message: "بدء المحرّك تلقائياً عند إقلاع الخادم."
    }).catch(() => {
    });
    state.timer = setTimeout(() => tickLoop().catch(() => {
    }), 50);
  }
  let inlineTickResult = null;
  if (runInline && !state.currentTickInFlight) {
    const stats = await readStats().catch(() => null);
    const lastRun = Number(stats?.lastRunAt) || 0;
    const sinceLastMs = lastRun ? Date.now() - lastRun : Infinity;
    if (sinceLastMs < 12e4) {
      return { booted: true, inlineTickResult: null, skippedInlineTick: true, sinceLastMs };
    }
    state.currentTickInFlight = true;
    state.lastTickStartedAt = Date.now();
    try {
      inlineTickResult = await runEngineTick();
    } catch (err) {
      await appendLog({
        level: "error",
        message: `inline tick فشل: ${err?.message || err}`,
        reason: err?.reason || "inline_tick_failed"
      }).catch(() => {
      });
    } finally {
      state.currentTickInFlight = false;
      state.lastTickEndedAt = Date.now();
    }
  }
  return { booted: true, inlineTickResult };
}
async function getEngineStatus({ logLimit = 30 } = {}) {
  await autoBootIfNeeded({ runInlineTick: false });
  const state = getGlobalState();
  const [cfg, cursor, stats, log] = await Promise.all([
    readConfig(),
    readCursor(),
    readStats(),
    readLog(logLimit)
  ]);
  return {
    processRunning: state.running,
    currentTickInFlight: state.currentTickInFlight,
    lastTickStartedAt: state.lastTickStartedAt,
    lastTickEndedAt: state.lastTickEndedAt,
    config: cfg,
    cursor,
    stats,
    currentSeed: cfg.seeds[cursor.seedIndex] || null,
    log
  };
}
async function updateSeeds(seeds) {
  const filtered = (seeds || []).filter(isValidSeed);
  const cfg = await writeConfig({ seeds: filtered });
  await writeCursor({ seedIndex: 0, scrapeCursor: null });
  await appendLog({
    level: "info",
    message: `تمّ تحديث البذور (${cfg.seeds.length} بذرة).`
  });
  return cfg;
}
async function resetCursor() {
  await writeCursor({ seedIndex: 0, scrapeCursor: null });
  await appendLog({ level: "info", message: "إعادة تعيين المؤشّر." });
  return { seedIndex: 0, scrapeCursor: null };
}
async function factoryReset() {
  const db = getAdminDatabase();
  const fs = getNebrasFirestoreAdmin();
  try {
    await stopEngine();
  } catch {
  }
  const [registrySnap, failuresSnap, uploadsSnap, contentFilesSnap, mainSnap, subSnap, secSnap] = await Promise.all([
    db.ref("ia_library_registry").get(),
    db.ref("ia_library_failures").get(),
    fs.collection(NEBRAS_FS_UPLOADS).get(),
    fs.collection(NEBRAS_FS_CONTENT_FILES).get(),
    fs.collection("sections_unified").doc("main").get(),
    fs.collection("sections_unified").doc("sub").get(),
    fs.collection("sections_unified").doc("secondary").get()
  ]);
  const cleared = {
    uploads: 0,
    content_files: 0,
    registry: 0,
    failures: 0,
    mains: 0,
    subs: 0,
    secondaries: 0
  };
  const updates = {};
  if (registrySnap.exists()) {
    cleared.registry = Object.keys(registrySnap.val() || {}).length;
    updates["ia_library_registry"] = null;
  }
  if (failuresSnap.exists()) {
    cleared.failures = Object.keys(failuresSnap.val() || {}).length;
    updates["ia_library_failures"] = null;
  }
  updates["ia_library_engine/cursor"] = null;
  updates["ia_library_engine/stats"] = {
    totalImported: 0,
    totalSkipped: 0,
    totalFailed: 0,
    sectionsCreated: 0,
    runsCount: 0,
    lastRunAt: null,
    lastError: "factory_reset",
    consecutiveEmptyRuns: 0
  };
  const fileIdsToDelete = /* @__PURE__ */ new Set();
  if (!uploadsSnap.empty) {
    for (const d of uploadsSnap.docs) {
      if (d.data()?.__provider === "internet_archive") {
        fileIdsToDelete.add(d.id);
        cleared.uploads += 1;
      }
    }
  }
  if (!contentFilesSnap.empty) {
    for (const d of contentFilesSnap.docs) {
      if (d.data()?.__provider === "internet_archive") {
        fileIdsToDelete.add(d.id);
        cleared.content_files += 1;
      }
    }
  }
  const iaMainIds = /* @__PURE__ */ new Set();
  const iaSubIds = /* @__PURE__ */ new Set();
  const iaSecIds = /* @__PURE__ */ new Set();
  if (mainSnap.exists) {
    for (const [id, val] of Object.entries(mainSnap.data() || {})) {
      if (val?.__createdBy === "ia_library_engine") {
        iaMainIds.add(String(id));
        cleared.mains += 1;
      }
    }
  }
  if (subSnap.exists) {
    for (const [id, val] of Object.entries(subSnap.data() || {})) {
      const parent = String(val?.main_section ?? "");
      if (val?.__createdBy === "ia_library_engine" || iaMainIds.has(parent)) {
        iaSubIds.add(String(id));
        cleared.subs += 1;
      }
    }
  }
  if (secSnap.exists) {
    for (const [id, val] of Object.entries(secSnap.data() || {})) {
      const parent = String(val?.sub_section ?? "");
      if (val?.__createdBy === "ia_library_engine" || iaSubIds.has(parent)) {
        iaSecIds.add(String(id));
        cleared.secondaries += 1;
      }
    }
  }
  if (Object.keys(updates).length > 0) await db.ref().update(updates);
  await adminFsBulkDeleteFileMirrorIds([...fileIdsToDelete]);
  if (iaMainIds.size + iaSubIds.size + iaSecIds.size > 0) {
    const { FieldValue: FieldValue2 } = await import("firebase-admin/firestore");
    const buildDelete = (ids) => {
      const obj = {};
      for (const id of ids) obj[String(id)] = FieldValue2.delete();
      return obj;
    };
    const batch = fs.batch();
    if (iaMainIds.size > 0) batch.update(fs.collection("sections_unified").doc("main"), buildDelete(iaMainIds));
    if (iaSubIds.size > 0) batch.update(fs.collection("sections_unified").doc("sub"), buildDelete(iaSubIds));
    if (iaSecIds.size > 0) batch.update(fs.collection("sections_unified").doc("secondary"), buildDelete(iaSecIds));
    await batch.commit().catch(() => {
    });
  }
  await appendLog({
    level: "warn",
    message: `Factory reset — حُذف ${cleared.uploads + cleared.content_files} عنصر، ${cleared.mains + cleared.subs + cleared.secondaries} قسم، ${cleared.registry} سجلّ.`,
    reason: "factory_reset"
  }).catch(() => {
  });
  return { ok: true, cleared };
}
export {
  autoBootIfNeeded as a,
  bootstrap as b,
  resetCursor as c,
  stopEngine as d,
  factoryReset as f,
  getEngineStatus as g,
  importItem as i,
  runEngineTick as r,
  startEngine as s,
  updateSeeds as u
};
