import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import { getDoc, doc, getDocs, collection } from "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
import { a as getNebrasFirestore } from "./client2.js";
import { N as NEBRAS_FS_SECTIONS, a as NEBRAS_FS_UPLOADS, b as NEBRAS_FS_CONTENT_FILES, c as NEBRAS_FS_CONTENT_YOUTUBE } from "./nebrasUnifiedPaths.js";
import { t as tokenize, f as filterAndRank } from "./search2.js";
function fs() {
  const db = getNebrasFirestore();
  if (!db) throw new Error("Firestore غير مهيأ — أضف VITE_FIREBASE_* في .env");
  return db;
}
async function clientFsReadSectionsLevel(level) {
  const snap = await getDoc(doc(fs(), NEBRAS_FS_SECTIONS, level));
  if (!snap.exists()) return [];
  return Object.values(snap.data() || {});
}
async function clientFsReadSectionsSubMap() {
  const snap = await getDoc(doc(fs(), NEBRAS_FS_SECTIONS, "sub"));
  return snap.exists() ? snap.data() || {} : {};
}
async function clientFsListYoutubeRecords() {
  const snap = await getDocs(collection(fs(), NEBRAS_FS_CONTENT_YOUTUBE));
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return { ...data, id: data.id ?? d.id };
  });
}
async function clientFsListFileRowsMerged() {
  const db = fs();
  const [u1, u2] = await Promise.all([
    getDocs(collection(db, NEBRAS_FS_UPLOADS)),
    getDocs(collection(db, NEBRAS_FS_CONTENT_FILES))
  ]);
  const rows = [];
  for (const d of u1.docs) {
    const data = d.data() || {};
    rows.push({
      ...data,
      id: data.id ?? d.id,
      fileId: data.fileId ?? d.id
    });
  }
  for (const d of u2.docs) {
    const data = d.data() || {};
    rows.push({
      ...data,
      id: data.id ?? d.id,
      fileId: data.fileId ?? d.id
    });
  }
  return rows;
}
function pickEngagementStats(row) {
  if (!row || typeof row !== "object") {
    return { view_count: 0, play_count: 0, complete_count: 0 };
  }
  const meta = (
    /** @type {Record<string, unknown>} */
    row.metadata || {}
  );
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  return {
    view_count: num(row.view_count ?? row.viewCount ?? meta.view_count ?? meta.viewCount),
    play_count: num(row.play_count ?? row.playCount ?? meta.play_count ?? meta.playCount),
    complete_count: num(
      row.complete_count ?? row.completeCount ?? meta.complete_count ?? meta.completeCount
    )
  };
}
const RETURN_NULL = () => null;
const parseOldAppId = RETURN_NULL;
const MIN_SEARCH_LEN = 2;
function shouldSkipListing({ requireSearch, search, hasActiveFilter } = {}) {
  if (!requireSearch) return false;
  if (hasActiveFilter) return false;
  const q = String(search || "").trim();
  return q.length < MIN_SEARCH_LEN;
}
let _lastPartialFailures = [];
function resetPartialFailures() {
  _lastPartialFailures = [];
}
function getLastPartialFailures() {
  return [..._lastPartialFailures];
}
function emptyPage() {
  return { results: [], count: 0, page: 1, page_size: 0, has_next: false };
}
async function listMyYoutubeVideos({
  search = "",
  subsection,
  main_section,
  secondary_subsection,
  is_listed,
  metadata__is_listed,
  page = 1,
  requireSearch = false
} = {}) {
  const hasActiveFilter = main_section !== void 0 && main_section !== "" || subsection !== void 0 && subsection !== "" || secondary_subsection !== void 0 && secondary_subsection !== "" || metadata__is_listed !== void 0 || is_listed !== void 0;
  if (shouldSkipListing({ requireSearch, search, hasActiveFilter })) return emptyPage();
  resetPartialFailures();
  const ytSnap = await clientFsListYoutubeRecords();
  const subMap = await clientFsReadSectionsSubMap();
  const listedFilter = metadata__is_listed ?? is_listed;
  let list = ytSnap;
  const tokens = tokenize(search);
  if (tokens.length > 0) {
    list = filterAndRank(list, tokens, (item) => [
      item?.metadata?.title || "",
      item?.metadata?.description || "",
      item?.metadata?.author || "",
      item?.video_url || ""
    ]);
  }
  if (subsection !== void 0 && subsection !== "") {
    list = list.filter(
      (item) => sameSectionId(item?.metadata?.subsection, subsection)
    );
  }
  if (secondary_subsection !== void 0 && secondary_subsection !== "") {
    list = list.filter(
      (item) => sameSectionId(item?.metadata?.secondary_subsection, secondary_subsection)
    );
  }
  if (main_section !== void 0 && main_section !== "") {
    list = list.filter((item) => {
      const subId = item?.metadata?.subsection;
      const sub = subMap[String(subId)];
      return sameSectionId(sub?.main_section, main_section) || sameSectionId(item?.__oldappMainDocId, parseOldAppId()?.mainDocId);
    });
  }
  if (listedFilter !== void 0 && listedFilter !== "") {
    const boolVal = listedFilter === true || listedFilter === "true";
    list = list.filter(
      (item) => Boolean(item?.metadata?.is_listed ?? true) === boolVal
    );
  }
  list.sort((a, b) => {
    const ta = new Date(
      a?.metadata?.created_at || a?.created_at || 0
    ).getTime();
    const tb = new Date(
      b?.metadata?.created_at || b?.created_at || 0
    ).getTime();
    return tb - ta;
  });
  return paginate(list, page);
}
async function readLevel(level) {
  return clientFsReadSectionsLevel(
    /** @type {'main'|'sub'|'secondary'} */
    level
  );
}
function paginate(list, page = 1, pageSize = 10) {
  const current = Math.max(Number(page) || 1, 1);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;
  return {
    count: list.length,
    next: end < list.length ? current + 1 : null,
    previous: current > 1 ? current - 1 : null,
    results: list.slice(start, end)
  };
}
function sameSectionId(a, b) {
  if (a === void 0 || a === null || b === void 0 || b === null) return false;
  return String(a) === String(b);
}
function applySectionFilters(list, { search = "", is_listed, main_section, sub_section } = {}) {
  let out = [...list];
  const tokens = tokenize(search);
  if (tokens.length > 0) {
    out = filterAndRank(out, tokens, (x) => [
      x.name || "",
      x.description || "",
      x.id != null ? String(x.id) : ""
    ]);
  }
  if (is_listed !== void 0) {
    out = out.filter((x) => Boolean(x.is_listed) === Boolean(is_listed));
  }
  if (main_section !== void 0 && main_section !== "" && main_section !== null) {
    out = out.filter((x) => sameSectionId(x.main_section, main_section));
  }
  if (sub_section !== void 0 && sub_section !== "" && sub_section !== null) {
    out = out.filter((x) => sameSectionId(x.sub_section, sub_section));
  }
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
async function listMyMainSections({ search = "", page = 1, requireSearch = false } = {}) {
  if (shouldSkipListing({ requireSearch, search })) return emptyPage();
  const all = await readLevel("main");
  let merged = all;
  const filtered = applySectionFilters(merged, { search });
  return paginate(filtered, page);
}
async function listMySubSections({
  main_section,
  search = "",
  page = 1,
  requireSearch = false
} = {}) {
  if (shouldSkipListing({ requireSearch, search })) return emptyPage();
  const all = await readLevel("sub");
  let merged = all;
  const filtered = applySectionFilters(merged, { search, main_section });
  return paginate(filtered, page);
}
async function listMySecondarySections({
  sub_section,
  search = "",
  page = 1,
  requireSearch = false
} = {}) {
  if (shouldSkipListing({ requireSearch, search })) return emptyPage();
  const all = await readLevel("secondary");
  const filtered = applySectionFilters(all, { search, sub_section });
  return paginate(filtered, page);
}
async function listMyFiles({
  search = "",
  subsection,
  main_section,
  secondary_subsection,
  content_type,
  upload_type,
  is_listed,
  metadata__is_listed,
  page = 1,
  requireSearch = false
} = {}) {
  const hasActiveFilter = main_section !== void 0 && main_section !== "" || subsection !== void 0 && subsection !== "" || secondary_subsection !== void 0 && secondary_subsection !== "" || content_type !== void 0 && content_type !== "" || upload_type !== void 0 && upload_type !== "" || metadata__is_listed !== void 0 || is_listed !== void 0;
  if (shouldSkipListing({ requireSearch, search, hasActiveFilter })) return emptyPage();
  resetPartialFailures();
  let list = await clientFsListFileRowsMerged();
  const subMap = await clientFsReadSectionsSubMap();
  const listedFilter = metadata__is_listed ?? is_listed;
  list = list.map((item) => {
    const createdAt = item?.metadata?.created_at || item?.createdAt || (/* @__PURE__ */ new Date()).toISOString();
    const engagement = pickEngagementStats(item);
    return {
      id: item.fileId || item.id,
      filename: item.filename || "untitled",
      file_type: item.fileType || item.file_type || "",
      file_size: Number(item.fileSize || item.file_size || 0),
      file_url: item.downloadUrl || item.file_url || "",
      upload_type: item.upload_type || "firebase",
      upload_status: item.upload_status || "completed",
      storage_path: item.storagePath || item.storage_path || "",
      engagement,
      metadata: {
        ...item.metadata || {},
        created_at: createdAt
      },
      ...item.__mshcatBookDocId ? { __mshcatBookDocId: item.__mshcatBookDocId } : {},
      ...item.__mshcatCategoryDocId ? { __mshcatCategoryDocId: item.__mshcatCategoryDocId } : {},
      ...item.__oldappContentDocId ? { __oldappContentDocId: item.__oldappContentDocId } : {},
      ...item.__oldappMainDocId ? { __oldappMainDocId: item.__oldappMainDocId } : {},
      ...item.__oldappSubDocId ? { __oldappSubDocId: item.__oldappSubDocId } : {}
    };
  });
  list = list.filter((item) => {
    const sub = String(item?.metadata?.subsection || "");
    const sec = String(item?.metadata?.secondary_subsection || "");
    return !(sub.startsWith("oldapp:main:") && sec.startsWith("oldapp:sub:"));
  });
  const fileTokens = tokenize(search);
  if (fileTokens.length > 0) {
    list = filterAndRank(list, fileTokens, (item) => [
      item?.metadata?.title || "",
      item?.metadata?.description || "",
      item?.metadata?.author || "",
      item?.filename || "",
      item?.file_url || ""
    ]);
  }
  if (subsection !== void 0 && subsection !== "") {
    list = list.filter(
      (item) => sameSectionId(item?.metadata?.subsection, subsection)
    );
  }
  if (secondary_subsection !== void 0 && secondary_subsection !== "") {
    list = list.filter(
      (item) => sameSectionId(item?.metadata?.secondary_subsection, secondary_subsection)
    );
  }
  if (main_section !== void 0 && main_section !== "") {
    list = list.filter((item) => {
      const subId = item?.metadata?.subsection;
      const sub = subMap[String(subId)];
      return sameSectionId(sub?.main_section, main_section) || sameSectionId(item?.__oldappMainDocId, parseOldAppId()?.mainDocId);
    });
  }
  if (content_type) {
    list = list.filter(
      (item) => String(item?.metadata?.content_type || "") === String(content_type)
    );
  }
  if (upload_type) {
    list = list.filter(
      (item) => String(item?.upload_type || "") === String(upload_type)
    );
  }
  if (listedFilter !== void 0 && listedFilter !== "") {
    const boolVal = listedFilter === true || listedFilter === "true";
    list = list.filter(
      (item) => Boolean(item?.metadata?.is_listed ?? true) === boolVal
    );
  }
  list.sort((a, b) => {
    const ta = new Date(a?.metadata?.created_at || 0).getTime();
    const tb = new Date(b?.metadata?.created_at || 0).getTime();
    return tb - ta;
  });
  return paginate(list, page);
}
export {
  listMyFiles as a,
  listMyYoutubeVideos as b,
  listMySubSections as c,
  listMySecondarySections as d,
  getLastPartialFailures as g,
  listMyMainSections as l,
  pickEngagementStats as p
};
