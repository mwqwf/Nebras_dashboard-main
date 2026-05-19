import { f as fetchItemMetadata, a as buildDownloadUrl } from "./search.js";
const ALLOWED_LICENSE_PATTERNS = Object.freeze([
  /publicdomain/i,
  /public-domain/i,
  /^pd$/i,
  /creativecommons\.org\/publicdomain/i,
  /cc0/i,
  /cc-by(?!-nc)(?!-nd)/i,
  // CC-BY و CC-BY-SA — نمنع NC و ND
  /creativecommons\.org\/licenses\/by\/[0-9.]+/i,
  /creativecommons\.org\/licenses\/by-sa\/[0-9.]+/i
]);
const DEFAULT_TRUSTED_COLLECTIONS = Object.freeze([
  "opensource",
  "opensource_arabic",
  "community_texts",
  "arabicliterature",
  "arabicliteratureandlinguistics",
  "islamicbooks_archive",
  "islamic-books",
  "shamela"
]);
function evaluateLicense(item, opts = {}) {
  const trusted = new Set(
    (opts.trustedCollections && opts.trustedCollections.length ? opts.trustedCollections : DEFAULT_TRUSTED_COLLECTIONS).map((s) => String(s).toLowerCase())
  );
  const allowMissingInTrusted = Boolean(opts.allowMissingLicenseInTrustedCollections);
  const licenseRaw = pickString(item?.licenseurl, item?.license, item?.["rights"]);
  const licenseStr = String(licenseRaw || "").trim();
  if (licenseStr) {
    for (const pat of ALLOWED_LICENSE_PATTERNS) {
      if (pat.test(licenseStr)) {
        return { ok: true, reason: "license_allowed", licenseMatched: licenseStr };
      }
    }
    return { ok: false, reason: "license_not_allowed", licenseMatched: licenseStr };
  }
  if (!allowMissingInTrusted) {
    return { ok: false, reason: "license_missing" };
  }
  const collections = Array.isArray(item?.collection) ? item.collection : item?.collection ? [item.collection] : [];
  for (const c of collections) {
    const cn = String(c || "").toLowerCase();
    if (trusted.has(cn)) {
      return { ok: true, reason: "trusted_collection_fallback", collection: cn };
    }
  }
  return { ok: false, reason: "license_missing_and_not_trusted" };
}
function pickString(...values) {
  for (const v of values) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length > 0) return String(v[0] || "");
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}
const ALLOWED_EXTENSIONS = Object.freeze({
  document: Object.freeze([".pdf"]),
  audio: Object.freeze([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".flac"]),
  video: Object.freeze([".mp4"])
});
const ALLOWED_MIME = Object.freeze({
  document: Object.freeze(["application/pdf"]),
  audio: Object.freeze([
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/aac",
    "audio/x-aac",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/opus",
    "audio/flac",
    "audio/x-flac"
  ]),
  video: Object.freeze(["video/mp4"])
});
const MAX_SIZE_BYTES = Object.freeze({
  document: 50 * 1024 * 1024,
  // 50 م.ب — يكفي لمعظم الكتب الإسلاميّة
  audio: 30 * 1024 * 1024,
  //   30 م.ب — تلاوة/درس متوسّط
  video: 40 * 1024 * 1024
  //   40 م.ب — مقطع قصير
});
function extractExtension(nameOrUrl) {
  const raw = String(nameOrUrl || "").trim().toLowerCase();
  if (!raw) return "";
  const pathOnly = raw.split("?")[0].split("#")[0];
  const lastSlash = pathOnly.lastIndexOf("/");
  const tail = lastSlash >= 0 ? pathOnly.slice(lastSlash + 1) : pathOnly;
  const lastDot = tail.lastIndexOf(".");
  if (lastDot < 0) return "";
  return tail.slice(lastDot);
}
function inferNebrasContentType(iaFile) {
  const ext = extractExtension(iaFile?.name);
  for (
    const type of
    /** @type {NebrasContentType[]} */
    ["document", "audio", "video"]
  ) {
    if (ALLOWED_EXTENSIONS[type].includes(ext)) return type;
  }
  return null;
}
function evaluateIaFile(iaFile) {
  if (!iaFile?.name) return { ok: false, reason: "no_name" };
  const name = String(iaFile.name).toLowerCase();
  if (name.endsWith("_bw.pdf") || // مسح أبيض/أسود ضعيف الجودة
  name.endsWith("_text.pdf") || // OCR-only، عادةً مشوَّش
  name.endsWith("_abbyy.gz") || name.endsWith("_djvu.txt") || name.endsWith("_djvu.xml") || name.endsWith("_jp2.zip") || name.endsWith("_scandata.xml") || name.endsWith(".gif") || // ميتاداتا/شعارات IA لا محتوى
  name.endsWith(".sqlite") || name.endsWith("_meta.xml") || name.endsWith("_meta.sqlite") || name.endsWith("_files.xml") || name.endsWith(".torrent")) {
    return { ok: false, reason: "derivative_blocked" };
  }
  const type = inferNebrasContentType(iaFile);
  if (!type) {
    return { ok: false, reason: "unsupported_extension" };
  }
  const size = Number(iaFile.size || 0);
  if (size > 0 && size > MAX_SIZE_BYTES[type]) {
    return { ok: false, reason: "size_over_limit", type, size };
  }
  return { ok: true, type, size };
}
function chooseBestPlayableFile(files, item) {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, reason: "no_files" };
  }
  const mediatype = String(item?.mediatype || "").toLowerCase();
  let priority;
  if (mediatype === "texts") priority = ["document"];
  else if (mediatype === "audio") priority = ["audio"];
  else if (mediatype === "movies") priority = ["video"];
  else priority = ["document", "audio", "video"];
  for (const wantedType of priority) {
    const candidates = [];
    for (const f of files) {
      const eval_ = evaluateIaFile(f);
      if (!eval_.ok) continue;
      if (eval_.type !== wantedType) continue;
      candidates.push({ file: f, eval: eval_ });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => {
      const aOrig = (a.file.source || "").toLowerCase() === "original" ? 0 : 1;
      const bOrig = (b.file.source || "").toLowerCase() === "original" ? 0 : 1;
      if (aOrig !== bOrig) return aOrig - bOrig;
      return Number(b.eval.size || 0) - Number(a.eval.size || 0);
    });
    const winner = candidates[0];
    return {
      ok: true,
      file: {
        name: winner.file.name,
        format: winner.file.format,
        size: Number(winner.eval.size || 0),
        source: winner.file.source
      },
      type: (
        /** @type {NebrasContentType} */
        wantedType
      ),
      size: Number(winner.eval.size || 0)
    };
  }
  return { ok: false, reason: "no_playable_file" };
}
function verifyDownloadedBuffer(buffer, { contentType, declaredType }) {
  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, reason: "empty_buffer" };
  }
  if (buffer.byteLength > MAX_SIZE_BYTES[declaredType]) {
    return { ok: false, reason: "size_over_limit_runtime" };
  }
  const ct = String(contentType || "").toLowerCase();
  const allowedCt = ALLOWED_MIME[declaredType] || [];
  if (ct && !allowedCt.some((m) => ct.includes(m)) && !ct.includes("octet-stream")) {
    return { ok: false, reason: "mime_mismatch" };
  }
  const head = Buffer.isBuffer(buffer) ? buffer.subarray(0, 16) : Buffer.from(buffer.slice(0, 16));
  if (declaredType === "document") {
    if (!(head[0] === 37 && head[1] === 80 && head[2] === 68 && head[3] === 70)) {
      return { ok: false, reason: "magic_bytes_not_pdf" };
    }
  } else if (declaredType === "audio") {
    const isId3 = head[0] === 73 && head[1] === 68 && head[2] === 51;
    const isFlac = head[0] === 102 && head[1] === 76 && head[2] === 97 && head[3] === 67;
    const isOgg = head[0] === 79 && head[1] === 103 && head[2] === 103 && head[3] === 83;
    const isRiff = head[0] === 82 && head[1] === 73 && head[2] === 70 && head[3] === 70;
    const isMp4 = head[4] === 102 && head[5] === 116 && head[6] === 121 && head[7] === 112;
    const isMpegFrame = head[0] === 255 && (head[1] & 224) === 224;
    if (!isId3 && !isFlac && !isOgg && !isRiff && !isMp4 && !isMpegFrame) {
      return { ok: false, reason: "magic_bytes_not_audio" };
    }
  } else if (declaredType === "video") {
    const isMp4 = head[4] === 102 && head[5] === 116 && head[6] === 121 && head[7] === 112;
    if (!isMp4) {
      return { ok: false, reason: "magic_bytes_not_mp4" };
    }
  }
  return { ok: true };
}
function firstString(value) {
  if (Array.isArray(value)) return firstString(value[0]);
  if (value == null) return "";
  return String(value).trim();
}
function asStringArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (value == null) return [];
  const s = String(value || "").trim();
  return s ? [s] : [];
}
function buildItemThumbnail(identifier) {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}
function mimeForExtension(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".opus")) return "audio/opus";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}
async function previewItem(identifier, opts = {}) {
  const id = String(identifier || "").trim();
  if (!id) {
    throw Object.assign(new Error("identifier فارغ."), { reason: "empty_identifier", status: 400 });
  }
  const { metadata, files } = await fetchItemMetadata(id);
  const lic = evaluateLicense(metadata, opts);
  if (!lic.ok) {
    throw Object.assign(
      new Error(`الترخيص غير مسموح للنشر: ${lic.reason} (${lic.licenseMatched || ""}).`),
      { reason: `license_${lic.reason}`, status: 451 }
    );
  }
  const choice = chooseBestPlayableFile(files, metadata);
  if (!choice.ok) {
    throw Object.assign(
      new Error(`لا يوجد ملفّ قابل للتشغيل في "${id}": ${choice.reason}.`),
      { reason: `playability_${choice.reason}`, status: 422 }
    );
  }
  const pickedName = choice.file.name;
  const downloadUrl = buildDownloadUrl(id, pickedName);
  const contentType = mimeForExtension(pickedName);
  const preview = {
    identifier: id,
    title: firstString(metadata?.title) || id,
    author: firstString(metadata?.creator) || "",
    description: firstString(metadata?.description) || "",
    thumbnailUrl: buildItemThumbnail(id),
    nebrasContentType: choice.type,
    pickedFile: {
      name: pickedName,
      format: choice.file.format,
      size: choice.file.size,
      source: choice.file.source,
      downloadUrl,
      contentType
    },
    licenseInfo: {
      licenseMatched: lic.licenseMatched,
      collection: lic.collection
    },
    iaSourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
    subjects: asStringArray(metadata?.subject),
    collections: asStringArray(metadata?.collection),
    language: firstString(metadata?.language),
    date: firstString(metadata?.date)
  };
  return preview;
}
export {
  MAX_SIZE_BYTES as M,
  previewItem as p,
  verifyDownloadedBuffer as v
};
