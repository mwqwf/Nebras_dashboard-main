import { a as getAdminDatabase, b as getNebrasFirestoreAdmin, i as isAdminConfigured, s as sendTopicMessage } from "./firebaseAdmin.js";
import { a as adminFsSetSectionRecord, b as adminFsReadSectionsLevel, c as adminFsBulkDeleteSectionKeys, d as adminFsBulkDeleteFileMirrorIds } from "./nebrasUnifiedFirestoreAdmin.js";
import { N as NEBRAS_FS_SECTIONS, a as NEBRAS_FS_UPLOADS, b as NEBRAS_FS_CONTENT_FILES } from "./nebrasUnifiedPaths.js";
import { i as isBlacklistedSectionName, c as computeBlacklistedIds, b as buildSectionsTree } from "./sectionsTree2.js";
import { i as isPuppeteerEnabled, f as fetchHtmlViaBrowser, a as fetchBookMetadata, d as downloadBookFile } from "./fetcher2.js";
import { c as classifyAutonomous } from "./classifier.js";
import { a as adminUploadAndRegister } from "./adminUploader.js";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 NebrasDashboard/1.0";
function looksLikeCloudflareChallenge(html) {
  if (!html || html.length < 200) return true;
  const lower = html.toLowerCase();
  return lower.includes("just a moment") || lower.includes("checking your browser") || lower.includes("cf-browser-verification") || lower.includes("challenge-platform") || lower.includes("cf-mitigated") || lower.includes("attention required! | cloudflare");
}
const DEFAULT_SEED_URLS = [
  "https://www.noor-book.com/category/كتب-اسلامية",
  "https://www.noor-book.com/category/كتب-في-التفسير-وعلوم-القرآن",
  "https://www.noor-book.com/category/كتب-في-الحديث-وعلومه",
  "https://www.noor-book.com/category/كتب-في-السيرة-النبوية",
  "https://www.noor-book.com/category/كتب-في-الفقه-وأصوله",
  "https://www.noor-book.com/category/كتب-في-العقيدة",
  "https://www.noor-book.com/category/كتب-في-التزكية-والأخلاق",
  "https://www.noor-book.com/category/كتب-في-اللغة-العربية"
];
function makeError(message, reason, status = 0, cause = null) {
  const err = (
    /** @type {any} */
    new Error(message)
  );
  err.reason = reason;
  err.status = status;
  if (cause) err.cause = cause;
  return err;
}
async function fetchHtml(url) {
  const usePuppeteer = await isPuppeteerEnabled().catch(() => false);
  if (usePuppeteer) {
    try {
      const r = await fetchHtmlViaBrowser(url, { waitForCloudflare: true });
      if (!looksLikeCloudflareChallenge(r.html)) {
        return { html: r.html, finalUrl: r.finalUrl };
      }
      throw makeError(
        "Cloudflare لم يُجتَز حتى مع Puppeteer (تحدّي مستمرّ).",
        "cloudflare_challenge_persistent",
        403
      );
    } catch (err) {
      if (err?.reason === "cloudflare_challenge_persistent") throw err;
    }
  }
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.7"
      },
      redirect: "follow"
    });
  } catch (err) {
    throw makeError("تعذّر الاتصال بـ Noor Library.", "crawler_network_error", 0, err);
  }
  if (!res.ok) {
    if ((res.status === 403 || res.status === 503) && !usePuppeteer) {
      throw makeError(
        `Noor Library أرجعت ${res.status} لـ ${url} (يبدو Cloudflare). فعّل Puppeteer (NOOR_USE_PUPPETEER=true).`,
        "crawler_upstream_error",
        res.status
      );
    }
    throw makeError(
      `Noor Library أرجعت ${res.status} لـ ${url}`,
      "crawler_upstream_error",
      res.status
    );
  }
  const html = await res.text();
  if (looksLikeCloudflareChallenge(html)) {
    throw makeError(
      "استجابة Cloudflare تحدّي — يلزم Puppeteer لاجتيازها.",
      "cloudflare_challenge_detected",
      403
    );
  }
  return { html, finalUrl: res.url || url };
}
function extractBookLinks(html, baseUrl) {
  const out = /* @__PURE__ */ new Map();
  const re1 = /href=["']([^"']*\/book\/review\/[^"'?#]+)["']/gi;
  let m;
  while (m = re1.exec(html)) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      const slug = decodeURIComponent(abs.split("/").filter(Boolean).pop() || "");
      if (slug && !out.has(slug)) out.set(slug, abs);
    } catch {
    }
  }
  const re2 = /href=["']([^"']*\/book\/(?!review\/)[^"'?#]+)["']/gi;
  while (m = re2.exec(html)) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      const slug = decodeURIComponent(abs.split("/").filter(Boolean).pop() || "");
      if (slug && !out.has(slug)) out.set(slug, abs);
    } catch {
    }
  }
  const re3 = /href=["']([^"']*\/(?:كتاب|%D9%83%D8%AA%D8%A7%D8%A8)-[^"'?#]+)["']/gi;
  while (m = re3.exec(html)) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      const slug = decodeURIComponent(abs.split("/").filter(Boolean).pop() || "");
      if (slug && !out.has(slug)) out.set(slug, abs);
    } catch {
    }
  }
  return Array.from(out.entries()).map(([bookId, url]) => ({ bookId, url }));
}
function buildPaginationUrl(seedUrl, pageNumber) {
  const n = Math.max(1, Math.floor(Number(pageNumber) || 1));
  if (n === 1) return seedUrl;
  let u;
  try {
    u = new URL(seedUrl);
  } catch {
    return seedUrl;
  }
  u.searchParams.set("page", String(n));
  return u.toString();
}
async function discoverBooksOnSeedPage(seedUrl, page = 1) {
  const url = buildPaginationUrl(seedUrl, page);
  const { html, finalUrl } = await fetchHtml(url);
  const bookLinks = extractBookLinks(html, finalUrl);
  const nextPage = bookLinks.length > 0 ? page + 1 : null;
  return {
    sourceUrl: finalUrl,
    page,
    bookLinks,
    nextPage
  };
}
async function discoverNewBooks({
  seedUrl,
  startPage = 1,
  batchSize = 5,
  maxPagesPerCall = 4,
  knownIds = /* @__PURE__ */ new Set()
}) {
  const collected = /* @__PURE__ */ new Map();
  let page = Math.max(1, startPage);
  let pagesScanned = 0;
  let nextPage = null;
  let exhausted = false;
  while (pagesScanned < maxPagesPerCall && collected.size < batchSize) {
    let result;
    try {
      result = await discoverBooksOnSeedPage(seedUrl, page);
    } catch (err) {
      pagesScanned++;
      page++;
      if (pagesScanned >= maxPagesPerCall) break;
      continue;
    }
    pagesScanned++;
    for (const link of result.bookLinks) {
      if (knownIds.has(link.bookId)) continue;
      if (collected.has(link.bookId)) continue;
      collected.set(link.bookId, link);
      if (collected.size >= batchSize) break;
    }
    if (result.nextPage === null) {
      exhausted = true;
      break;
    }
    nextPage = result.nextPage;
    page = result.nextPage;
  }
  return {
    newBooks: Array.from(collected.values()),
    pagesScanned,
    nextPage: exhausted ? null : nextPage || page,
    exhausted
  };
}
function isValidSeedUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    return /(^|\.)noor-book\.com$/i.test(u.hostname) && u.protocol.startsWith("http");
  } catch {
    return false;
  }
}
const ENGINE_TAG = "noor_library_engine";
function makeSectionId() {
  return Date.now() + Math.floor(Math.random() * 1e3);
}
function cleanName(name) {
  return String(name || "").trim().slice(0, 120);
}
function blacklistError(message, reason = "blacklisted_section") {
  return Object.assign(new Error(message), { reason, status: 403 });
}
async function readBlacklistGuard() {
  const [mains, subs, secondaries] = await Promise.all([
    adminFsReadSectionsLevel("main"),
    adminFsReadSectionsLevel("sub"),
    adminFsReadSectionsLevel("secondary")
  ]);
  return computeBlacklistedIds({ mains, subs, secondaries });
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
async function findSecondarySectionByName(subSectionId, name) {
  const target = cleanName(name).toLowerCase();
  if (!target) return null;
  const secondaries = await adminFsReadSectionsLevel("secondary");
  for (const sec of secondaries) {
    if (String(sec.sub_section ?? "") === String(subSectionId) && String(sec.name || "").trim().toLowerCase() === target) {
      return { id: Number(sec.id), name: String(sec.name) };
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
  if (isBlacklistedSectionName(cleanedName)) {
    throw blacklistError(
      `اسم القسم "${cleanedName}" محظور — لا يمكن للمحرّك إنشاؤه.`
    );
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
    // علامة تعريفيّة: تسمح بمسح الأقسام التي أنشأها المحرّك دون لمس
    // الأقسام التي أنشأها مديرٌ بشري.
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
    throw Object.assign(new Error("main_section غير صالح لإنشاء قسم فرعي."), {
      reason: "invalid_main_section",
      status: 400
    });
  }
  if (isBlacklistedSectionName(cleanedName)) {
    throw blacklistError(
      `اسم القسم الفرعي "${cleanedName}" محظور — لا يمكن للمحرّك إنشاؤه.`
    );
  }
  const guard = await readBlacklistGuard();
  if (guard.mainIds.has(String(mainNum))) {
    throw blacklistError(
      "القسم الرئيسي المُختار مدرَج في القائمة السوداء — لا يقبل أيّ كتابة آلية."
    );
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
async function createSecondarySectionAdmin(subSectionId, name) {
  const cleanedName = cleanName(name);
  if (!cleanedName) {
    throw Object.assign(new Error("اسم القسم الثانوي مطلوب."), {
      reason: "sec_name_required",
      status: 400
    });
  }
  const subNum = Number(subSectionId);
  if (!Number.isFinite(subNum) || subNum <= 0) {
    throw Object.assign(new Error("sub_section غير صالح لإنشاء قسم ثانوي."), {
      reason: "invalid_sub_section",
      status: 400
    });
  }
  if (isBlacklistedSectionName(cleanedName)) {
    throw blacklistError(
      `اسم القسم الثانوي "${cleanedName}" محظور — لا يمكن للمحرّك إنشاؤه.`
    );
  }
  const guard = await readBlacklistGuard();
  if (guard.subIds.has(String(subNum))) {
    throw blacklistError(
      "القسم الفرعي المُختار مدرَج في القائمة السوداء (أو ينحدر من قسم محظور) — لا يقبل أيّ كتابة آلية."
    );
  }
  const existing = await findSecondarySectionByName(subNum, cleanedName);
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      sub_section: subNum,
      alreadyExisted: true
    };
  }
  const id = makeSectionId();
  const payload = {
    id,
    name: cleanedName,
    sub_section: subNum,
    is_listed: true,
    thumbnail: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    __createdBy: ENGINE_TAG
  };
  await adminFsSetSectionRecord("secondary", id, payload);
  return { id, name: cleanedName, sub_section: subNum, alreadyExisted: false };
}
const REGISTRY_ROOT = "noor_library_registry";
const FAILURES_ROOT = "noor_library_failures";
const FAILURE_BLACKLIST_THRESHOLD = 3;
function safeKey(bookId) {
  return String(bookId || "").replace(/[.$#\[\]/]/g, "_").slice(0, 700);
}
async function isBookImported(bookId) {
  const key = safeKey(bookId);
  if (!key) return false;
  const snap = await getAdminDatabase().ref(`${REGISTRY_ROOT}/${key}`).get();
  return snap.exists();
}
async function partitionKnownBooks(bookIds) {
  const ids = (bookIds || []).map(safeKey).filter(Boolean);
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
async function recordImported(bookId, record) {
  const key = safeKey(bookId);
  if (!key) throw new Error("bookId غير صالح للتسجيل في السجلّ.");
  const payload = {
    fileId: String(record?.fileId || ""),
    title: String(record?.title || "").slice(0, 400),
    url: String(record?.url || "").slice(0, 1e3),
    hierarchy: record?.hierarchy || null,
    createdSectionsIds: Array.isArray(record?.createdSectionsIds) ? record.createdSectionsIds.slice(0, 10) : [],
    importedAt: { ".sv": "timestamp" }
  };
  await getAdminDatabase().ref(`${REGISTRY_ROOT}/${key}`).set(payload);
}
async function recordFailure(bookId, info = {}) {
  const key = safeKey(bookId);
  if (!key) return;
  const ref = getAdminDatabase().ref(`${FAILURES_ROOT}/${key}`);
  await ref.transaction((current) => {
    const c = current || { count: 0, firstFailedAt: Date.now() };
    return {
      count: Number(c.count || 0) + 1,
      firstFailedAt: c.firstFailedAt || Date.now(),
      lastFailedAt: Date.now(),
      lastReason: String(info?.reason || "unknown").slice(0, 60),
      lastMessage: String(info?.message || "").slice(0, 300),
      url: String(info?.url || c.url || "").slice(0, 1e3)
    };
  });
}
const FAILURES_BEFORE_BACKOFF = 5;
const BACKOFF_MULTIPLIER = 3;
const MAX_BACKOFF_MS = 5 * 60 * 1e3;
const ENGINE_ROOT = "noor_library_engine";
const CONFIG_PATH = `${ENGINE_ROOT}/config`;
const CURSOR_PATH = `${ENGINE_ROOT}/cursor`;
const STATS_PATH = `${ENGINE_ROOT}/stats`;
const LOG_PATH = `${ENGINE_ROOT}/log`;
const LOG_MAX_ENTRIES = 60;
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  seedUrls: DEFAULT_SEED_URLS,
  tickIntervalMs: 8e3,
  batchSize: 3,
  maxPagesPerCall: 4
});
const GLOBAL_KEY = "__NEBRAS_NOOR_ENGINE__";
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
async function readConfig() {
  const snap = await getAdminDatabase().ref(CONFIG_PATH).get();
  if (!snap.exists()) return { ...DEFAULT_CONFIG };
  const v = snap.val() || {};
  return {
    enabled: Boolean(v.enabled),
    seedUrls: Array.isArray(v.seedUrls) && v.seedUrls.length > 0 ? v.seedUrls.filter(isValidSeedUrl) : DEFAULT_CONFIG.seedUrls,
    tickIntervalMs: Math.max(2e3, Number(v.tickIntervalMs) || DEFAULT_CONFIG.tickIntervalMs),
    batchSize: Math.max(1, Math.min(20, Number(v.batchSize) || DEFAULT_CONFIG.batchSize)),
    maxPagesPerCall: Math.max(
      1,
      Math.min(15, Number(v.maxPagesPerCall) || DEFAULT_CONFIG.maxPagesPerCall)
    )
  };
}
async function writeConfig(patch) {
  const current = await readConfig();
  const next = { ...current, ...patch };
  if (Array.isArray(patch.seedUrls)) {
    next.seedUrls = patch.seedUrls.filter(isValidSeedUrl);
    if (next.seedUrls.length === 0) next.seedUrls = DEFAULT_CONFIG.seedUrls;
  }
  await getAdminDatabase().ref(CONFIG_PATH).set(next);
  return next;
}
async function readCursor() {
  const snap = await getAdminDatabase().ref(CURSOR_PATH).get();
  if (!snap.exists()) return { seedIndex: 0, page: 1 };
  const v = snap.val() || {};
  return {
    seedIndex: Math.max(0, Number(v.seedIndex) || 0),
    page: Math.max(1, Number(v.page) || 1)
  };
}
async function writeCursor(cursor) {
  await getAdminDatabase().ref(CURSOR_PATH).set({
    seedIndex: cursor.seedIndex,
    page: cursor.page,
    updatedAt: { ".sv": "timestamp" }
  });
}
async function readStats() {
  const snap = await getAdminDatabase().ref(STATS_PATH).get();
  if (!snap.exists()) {
    return {
      totalFetched: 0,
      sectionsCreated: 0,
      lastRunAt: null,
      lastError: null,
      runsCount: 0
    };
  }
  const v = snap.val() || {};
  return {
    totalFetched: Number(v.totalFetched) || 0,
    sectionsCreated: Number(v.sectionsCreated) || 0,
    lastRunAt: v.lastRunAt || null,
    lastError: v.lastError || null,
    runsCount: Number(v.runsCount) || 0
  };
}
async function bumpStats(patch) {
  const ref = getAdminDatabase().ref(STATS_PATH);
  await ref.transaction((current) => {
    const c = current || {};
    const next = {
      totalFetched: Number(c.totalFetched ?? 0) + Number(patch.totalFetchedDelta ?? 0),
      sectionsCreated: Number(c.sectionsCreated ?? 0) + Number(patch.sectionsCreatedDelta ?? 0),
      runsCount: Number(c.runsCount ?? 0) + Number(patch.runsDelta ?? 0),
      lastRunAt: patch.touchLastRun ? Date.now() : c.lastRunAt ?? null,
      lastError: patch.lastError !== void 0 ? patch.lastError ?? null : c.lastError ?? null,
      // نُبقي العدّاد المساعد لـ AUTO_STOP_AFTER_FAILED_RUNS بين العمليّات.
      consecutiveEmptyRuns: Number(c.consecutiveEmptyRuns ?? 0)
    };
    return next;
  });
}
async function appendLog(entry) {
  const db = getAdminDatabase();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.ref(`${LOG_PATH}/${id}`).set({
    ...entry,
    ts: Date.now()
  });
  const all = await db.ref(LOG_PATH).orderByChild("ts").get().catch(() => null);
  if (!all || !all.exists()) return;
  const entries = Object.entries(all.val() || {}).sort(
    (a, b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0)
  );
  if (entries.length > LOG_MAX_ENTRIES) {
    const updates = {};
    for (const [k] of entries.slice(LOG_MAX_ENTRIES)) {
      updates[`${LOG_PATH}/${k}`] = null;
    }
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
  if (value === null || value === void 0) return "";
  return String(value).trim();
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
        source: "noor_library_engine",
        contentType: info?.contentType || "document",
        contentId: idToString(info?.contentId),
        mainSectionId: idToString(info?.mainSectionId),
        subSectionId: idToString(info?.subSectionId),
        secondarySectionId: idToString(info?.secondarySectionId),
        mainSectionName: info?.mainSectionName || "",
        subSectionName: info?.subSectionName || "",
        secondarySectionName: info?.secondarySectionName || "",
        sourceUrl: info?.sourceUrl || ""
      }
    });
  } catch (err) {
    await appendLog({
      level: "warn",
      message: `إشعار FCM (محتوى) فشل: ${err?.message || String(err)}`,
      reason: "fcm_send_failed"
    }).catch(() => {
    });
  }
}
async function notifyFcmSectionCreated(info) {
  if (!isAdminConfigured()) return;
  const levelLabel = info?.level === "main" ? "قسم رئيسي" : info?.level === "sub" ? "قسم فرعي" : info?.level === "secondary" ? "قسم ثانوي" : "قسم";
  const name = (info?.name || "").trim();
  const parent = (info?.parentName || "").trim();
  const title = `${levelLabel} جديد في نبراس`;
  const body = parent ? `تمّت إضافة ${levelLabel} "${name}" ضمن ${parent}` : `تمّت إضافة ${levelLabel} "${name}"`;
  const sectionId = idToString(info?.sectionId);
  const parentId = idToString(info?.parentId);
  const data = {
    type: "section_created",
    source: "noor_library_engine",
    level: info?.level || "",
    sectionName: name,
    parentName: parent,
    sectionId,
    parentId,
    mainSectionId: "",
    subSectionId: "",
    secondarySectionId: ""
  };
  if (info?.level === "main") {
    data.mainSectionId = sectionId;
  } else if (info?.level === "sub") {
    data.mainSectionId = parentId;
    data.subSectionId = sectionId;
  } else if (info?.level === "secondary") {
    data.subSectionId = parentId;
    data.secondarySectionId = sectionId;
  }
  try {
    await sendTopicMessage({ topic: fcmTopic(), title, body, data });
  } catch (err) {
    await appendLog({
      level: "warn",
      message: `إشعار FCM (قسم جديد) فشل: ${err?.message || String(err)}`,
      reason: "fcm_send_failed"
    }).catch(() => {
    });
  }
}
async function processBook({ url, bookId, sections }) {
  const meta = await fetchBookMetadata(url);
  if (!meta.fileUrl) {
    throw Object.assign(
      new Error(`لا يوجد رابط تنزيل قابل للاستخراج لـ "${meta.title || bookId}" — تخطّيناه قبل أيّ تعديل في DB.`),
      { reason: "no_file_url", status: 422 }
    );
  }
  const downloaded = await downloadBookFile(meta.fileUrl, {
    refererUrl: meta.source?.url || meta.source?.finalUrl || url
  });
  if (!downloaded?.buffer || downloaded.buffer.byteLength === 0) {
    throw Object.assign(
      new Error("الملفّ المنزَّل فارغ — تخطّينا الكتاب قبل أيّ تعديل في DB."),
      { reason: "empty_download", status: 422 }
    );
  }
  const decision = await classifyAutonomous(sections, meta);
  let mainId = decision.mainId;
  let subId = decision.subId || null;
  let secondaryId = decision.secondaryId || null;
  const createdSectionsIds = [];
  let sectionsCreatedDelta = 0;
  if (decision.kind === "create_main") {
    const createdMain = await createMainSectionAdmin(decision.newMainName);
    mainId = String(createdMain.id);
    if (!createdMain.alreadyExisted) {
      createdSectionsIds.push(mainId);
      sectionsCreatedDelta += 1;
      await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {
      });
      await notifyFcmSectionCreated({
        level: "main",
        name: createdMain.name,
        parentName: "",
        sectionId: createdMain.id,
        parentId: ""
      });
      await appendLog({
        level: "success",
        message: `قسم رئيسي جديد أُنشئ آلياً: "${createdMain.name}"`,
        sectionId: createdMain.id,
        kind: "main_section_created"
      }).catch(() => {
      });
    }
    const createdSub = await createSubSectionAdmin(mainId, decision.newSubName);
    subId = String(createdSub.id);
    if (!createdSub.alreadyExisted) {
      createdSectionsIds.push(subId);
      sectionsCreatedDelta += 1;
      await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {
      });
      await notifyFcmSectionCreated({
        level: "sub",
        name: createdSub.name,
        parentName: createdMain.name,
        sectionId: createdSub.id,
        parentId: mainId
      });
      await appendLog({
        level: "success",
        message: `قسم فرعي جديد أُنشئ آلياً: "${createdSub.name}" تحت "${createdMain.name}"`,
        sectionId: createdSub.id,
        parentId: mainId,
        kind: "sub_section_created"
      }).catch(() => {
      });
    }
  } else if (decision.kind === "create_sub") {
    const created = await createSubSectionAdmin(mainId, decision.newSubName);
    subId = String(created.id);
    if (!created.alreadyExisted) {
      createdSectionsIds.push(subId);
      sectionsCreatedDelta += 1;
      await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {
      });
      const parentMain = sections.index.mainsById[mainId];
      await notifyFcmSectionCreated({
        level: "sub",
        name: created.name,
        parentName: parentMain?.name || "",
        sectionId: created.id,
        parentId: mainId
      });
      await appendLog({
        level: "success",
        message: `قسم فرعي جديد أُنشئ آلياً: "${created.name}" تحت "${parentMain?.name || ""}"`,
        sectionId: created.id,
        parentId: mainId,
        kind: "sub_section_created"
      }).catch(() => {
      });
    }
  } else if (decision.kind === "create_secondary") {
    subId = decision.subId;
    const created = await createSecondarySectionAdmin(subId, decision.newSecondaryName);
    secondaryId = String(created.id);
    if (!created.alreadyExisted) {
      createdSectionsIds.push(secondaryId);
      sectionsCreatedDelta += 1;
      await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {
      });
      const parentSub = sections.index.subsById[subId];
      await notifyFcmSectionCreated({
        level: "secondary",
        name: created.name,
        parentName: parentSub?.name || "",
        sectionId: created.id,
        parentId: subId
      });
      await appendLog({
        level: "success",
        message: `قسم ثانوي جديد أُنشئ آلياً: "${created.name}" تحت "${parentSub?.name || ""}"`,
        sectionId: created.id,
        parentId: subId,
        kind: "secondary_section_created"
      }).catch(() => {
      });
    }
  }
  if (!subId) {
    throw Object.assign(new Error("فشل تحديد subId بعد التصنيف."), {
      reason: "no_sub_after_classify",
      status: 500
    });
  }
  const refreshed = await buildSectionsTree();
  const main = refreshed.index.mainsById[mainId];
  const sub = refreshed.index.subsById[subId];
  const secondary = secondaryId ? refreshed.index.secondariesById[secondaryId] : null;
  if (!main || !sub) {
    throw Object.assign(new Error("main أو sub لم يُعثر عليه بعد التصنيف."), {
      reason: "hierarchy_resolution_failed",
      status: 500
    });
  }
  const finalMetadata = {
    title: String(meta.title || "").trim(),
    description: String(meta.description || "").trim(),
    author: String(meta.author || "").trim(),
    thumbnail: meta.thumbnail || null,
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
  };
  const result = await adminUploadAndRegister({
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    filename: downloaded.filename,
    thumbnailUrl: meta.thumbnail || null,
    metadata: finalMetadata,
    uploader: { uid: "noor_library_engine", email: "engine@nebras.local" },
    source: {
      provider: "noor-library",
      url: meta.source?.url || url,
      bookId: meta.source?.bookId || bookId
    }
  });
  await recordImported(bookId, {
    fileId: result.fileId,
    title: meta.title,
    url: meta.source?.url || url,
    hierarchy: { mainId: String(main.id), subId: String(sub.id), secondaryId: secondary ? String(secondary.id) : null },
    createdSectionsIds
  });
  await notifyFcmContentAdded({
    title: meta.title,
    contentType: finalMetadata.content_type || "document",
    contentId: result.fileId,
    mainSectionId: main.id,
    subSectionId: sub.id,
    secondarySectionId: secondary?.id || "",
    mainSectionName: main.name,
    subSectionName: sub.name,
    secondarySectionName: secondary?.name || "",
    sourceUrl: meta.source?.url || url
  });
  return {
    fileId: result.fileId,
    title: meta.title,
    downloadUrl: result.downloadUrl,
    hierarchy: {
      main: { id: String(main.id), name: main.name },
      sub: { id: String(sub.id), name: sub.name },
      secondary: secondary ? { id: String(secondary.id), name: secondary.name } : null
    },
    createdSectionsIds,
    sectionsCreatedDelta,
    decisionKind: decision.kind,
    decisionConfidence: decision.confidence,
    decisionReasoning: decision.reasoning,
    method: decision.method
  };
}
async function runEngineTick() {
  const cfg = await readConfig();
  if (cfg.seedUrls.length === 0) {
    throw Object.assign(new Error("لا توجد بذور (seedUrls) — أضف على الأقل واحدة."), {
      reason: "no_seeds",
      status: 400
    });
  }
  let cursor = await readCursor();
  if (cursor.seedIndex >= cfg.seedUrls.length) {
    cursor = { seedIndex: 0, page: 1 };
  }
  const seedUrl = cfg.seedUrls[cursor.seedIndex];
  let knownIds;
  try {
    knownIds = (await partitionKnownBooks([])).knownIds;
  } catch {
    knownIds = /* @__PURE__ */ new Set();
  }
  const discovery = await discoverNewBooks({
    seedUrl,
    startPage: cursor.page,
    batchSize: cfg.batchSize,
    maxPagesPerCall: cfg.maxPagesPerCall,
    knownIds
  });
  let advancedToNextSeed = false;
  if (discovery.newBooks.length === 0 || discovery.exhausted) {
    const nextSeed = (cursor.seedIndex + 1) % cfg.seedUrls.length;
    cursor = { seedIndex: nextSeed, page: 1 };
    advancedToNextSeed = true;
    await writeCursor(cursor);
    await appendLog({
      level: "info",
      message: `استُنفدت بذرة "${seedUrl}" — التحوّل للبذرة التاليّة.`,
      seedIndex: cursor.seedIndex
    });
    return {
      processed: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      advancedToNextSeed,
      cursor,
      sample: []
    };
  }
  let sections;
  try {
    sections = await buildSectionsTree();
  } catch (err) {
    await bumpStats({ touchLastRun: true, lastError: `sections_read_failed: ${err?.message}` });
    throw err;
  }
  const sample = [];
  let processed = 0;
  let createdSectionsTotal = 0;
  let skipped = 0;
  let failed = 0;
  for (const link of discovery.newBooks) {
    if (await isBookImported(link.bookId).catch(() => false)) {
      skipped += 1;
      sample.push({ title: link.bookId, url: link.url, status: "skip" });
      continue;
    }
    try {
      const r = await processBook({ url: link.url, bookId: link.bookId, sections });
      processed += 1;
      createdSectionsTotal += r.sectionsCreatedDelta;
      sample.push({
        fileId: r.fileId,
        title: r.title,
        url: link.url,
        status: "ok",
        hierarchy: r.hierarchy,
        createdSectionsIds: r.createdSectionsIds,
        decision: r.decisionKind,
        confidence: r.decisionConfidence
      });
      await appendLog({
        level: "success",
        message: `جُلِب: ${r.title}`,
        url: link.url,
        bookId: link.bookId,
        fileId: r.fileId,
        hierarchy: r.hierarchy,
        createdSectionsIds: r.createdSectionsIds,
        decision: r.decisionKind
      });
    } catch (err) {
      failed += 1;
      const reason = err?.reason || "unknown";
      sample.push({
        title: link.bookId,
        url: link.url,
        status: "fail",
        error: err?.message || String(err)
      });
      await recordFailure(link.bookId, {
        reason,
        message: err?.message || String(err),
        url: link.url
      }).catch(() => {
      });
      await appendLog({
        level: "error",
        message: err?.message || String(err),
        url: link.url,
        bookId: link.bookId,
        reason
      });
    }
  }
  if (discovery.nextPage) {
    cursor = { seedIndex: cursor.seedIndex, page: discovery.nextPage };
  } else {
    const nextSeed = (cursor.seedIndex + 1) % cfg.seedUrls.length;
    cursor = { seedIndex: nextSeed, page: 1 };
    advancedToNextSeed = true;
  }
  await writeCursor(cursor);
  await bumpStats({
    totalFetchedDelta: processed,
    runsDelta: 1,
    touchLastRun: true,
    lastError: failed > 0 ? `${failed} كتاب فشل في هذه الدورة (يُسجَّل في blacklist بعد ${/* عتبة من registry.js */
    3} محاولات).` : null
  });
  const stats = await readStats().catch(() => null);
  if (stats && processed === 0) {
    const consecutive = Number(stats?.consecutiveEmptyRuns || 0) + 1;
    await getAdminDatabase().ref(`${STATS_PATH}/consecutiveEmptyRuns`).set(consecutive).catch(() => {
    });
    if (consecutive === FAILURES_BEFORE_BACKOFF) {
      await appendLog({
        level: "warn",
        message: `${consecutive} دورة متتالية بدون أيّ نجاح — تفعيل back-off (تباطؤ الفترة بين الدورات). المحرّك يستمرّ بالعمل.`,
        reason: "engine_backoff_engaged"
      }).catch(() => {
      });
    }
  } else if (processed > 0) {
    await getAdminDatabase().ref(`${STATS_PATH}/consecutiveEmptyRuns`).set(0).catch(() => {
    });
  }
  return {
    processed,
    created: createdSectionsTotal,
    skipped,
    failed,
    advancedToNextSeed,
    cursor,
    sample
  };
}
async function tickLoop() {
  const state = getGlobalState();
  if (!state.running) return;
  if (state.currentTickInFlight) return;
  state.currentTickInFlight = true;
  state.lastTickStartedAt = Date.now();
  try {
    const cfg = await readConfig();
    if (!cfg.enabled) {
      state.running = false;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      await appendLog({
        level: "info",
        message: "إيقاف المحرّك (enabled=false في الإعدادات)."
      });
      return;
    }
    await runEngineTick();
  } catch (err) {
    await appendLog({
      level: "error",
      message: `tick فشل: ${err?.message || String(err)}`,
      reason: err?.reason || "tick_failed"
    }).catch(() => {
    });
    await bumpStats({ lastError: err?.message || String(err), touchLastRun: true }).catch(
      () => {
      }
    );
  } finally {
    state.currentTickInFlight = false;
    state.lastTickEndedAt = Date.now();
    if (state.running) {
      const cfg = await readConfig().catch(() => DEFAULT_CONFIG);
      const stats = await readStats().catch(() => null);
      const consecutiveEmpty = Number(stats?.consecutiveEmptyRuns || 0);
      let nextDelay = cfg.tickIntervalMs;
      if (consecutiveEmpty >= FAILURES_BEFORE_BACKOFF) {
        nextDelay = Math.min(
          cfg.tickIntervalMs * BACKOFF_MULTIPLIER,
          MAX_BACKOFF_MS
        );
      }
      state.timer = setTimeout(() => {
        tickLoop().catch(() => {
        });
      }, nextDelay);
    }
  }
}
async function startEngine() {
  const state = getGlobalState();
  const cfg = await writeConfig({ enabled: true });
  if (state.running) {
    await appendLog({ level: "info", message: "المحرّك يعمل بالفعل — تمّ تأكيد التشغيل." });
    return { running: true, alreadyRunning: true, config: cfg };
  }
  state.running = true;
  await appendLog({ level: "info", message: "بدء المحرّك الآلي." });
  state.timer = setTimeout(() => {
    tickLoop().catch(() => {
    });
  }, 100);
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
async function autoBootIfNeeded() {
  const state = getGlobalState();
  if (state.autoBootAttempted) return;
  state.autoBootAttempted = true;
  const cfg = await readConfig();
  if (cfg.enabled && !state.running) {
    state.running = true;
    await appendLog({
      level: "info",
      message: "إعادة تشغيل تلقائي للمحرّك بعد إقلاع الخادم (enabled=true في DB)."
    });
    state.timer = setTimeout(() => {
      tickLoop().catch(() => {
      });
    }, 500);
  }
}
async function updateSeedUrls(seedUrls) {
  const filtered = (seedUrls || []).filter(isValidSeedUrl);
  const cfg = await writeConfig({ seedUrls: filtered });
  await writeCursor({ seedIndex: 0, page: 1 });
  await appendLog({
    level: "info",
    message: `تمّ تحديث البذور (${cfg.seedUrls.length} رابط) — إعادة المؤشّر إلى البذرة الأولى.`
  });
  return cfg;
}
async function resetCursor() {
  await writeCursor({ seedIndex: 0, page: 1 });
  await appendLog({ level: "info", message: "إعادة تعيين المؤشّر إلى البذرة الأولى/صفحة 1." });
  return { seedIndex: 0, page: 1 };
}
async function factoryReset() {
  const db = getAdminDatabase();
  const fs = getNebrasFirestoreAdmin();
  try {
    await stopEngine();
  } catch {
  }
  const [
    registrySnap,
    failuresSnap,
    mainSnap,
    subSnap,
    secSnap,
    uploadsSnap,
    contentFilesSnap
  ] = await Promise.all([
    db.ref("noor_library_registry").get(),
    db.ref("noor_library_failures").get(),
    fs.collection(NEBRAS_FS_SECTIONS).doc("main").get(),
    fs.collection(NEBRAS_FS_SECTIONS).doc("sub").get(),
    fs.collection(NEBRAS_FS_SECTIONS).doc("secondary").get(),
    fs.collection(NEBRAS_FS_UPLOADS).get(),
    fs.collection(NEBRAS_FS_CONTENT_FILES).get()
  ]);
  const updates = {};
  const cleared = {
    registry: 0,
    failures: 0,
    uploads: 0,
    content_files: 0,
    mains: 0,
    subs: 0,
    secondaries: 0
  };
  if (registrySnap.exists()) {
    const regs = registrySnap.val() || {};
    cleared.registry = Object.keys(regs).length;
    updates["noor_library_registry"] = null;
  }
  if (failuresSnap.exists()) {
    const fails = failuresSnap.val() || {};
    cleared.failures = Object.keys(fails).length;
    updates["noor_library_failures"] = null;
  }
  updates["noor_library_engine/cursor"] = null;
  updates["noor_library_engine/stats"] = {
    totalFetched: 0,
    sectionsCreated: 0,
    runsCount: 0,
    lastRunAt: null,
    lastError: "factory_reset",
    consecutiveEmptyRuns: 0
  };
  const enginesMains = /* @__PURE__ */ new Set();
  const enginesSubs = /* @__PURE__ */ new Set();
  const enginesSecs = /* @__PURE__ */ new Set();
  if (mainSnap.exists) {
    for (const [id, val] of Object.entries(mainSnap.data() || {})) {
      if (val?.__createdBy === "noor_library_engine") {
        enginesMains.add(String(id));
        cleared.mains += 1;
      }
    }
  }
  if (subSnap.exists) {
    for (const [id, val] of Object.entries(subSnap.data() || {})) {
      const parentMainId = String(val?.main_section ?? "");
      if (val?.__createdBy === "noor_library_engine" || enginesMains.has(parentMainId)) {
        enginesSubs.add(String(id));
        cleared.subs += 1;
      }
    }
  }
  if (secSnap.exists) {
    for (const [id, val] of Object.entries(secSnap.data() || {})) {
      const parentSubId = String(val?.sub_section ?? "");
      if (val?.__createdBy === "noor_library_engine" || enginesSubs.has(parentSubId)) {
        enginesSecs.add(String(id));
        cleared.secondaries += 1;
      }
    }
  }
  const fileIdsToMirrorDelete = /* @__PURE__ */ new Set();
  if (!uploadsSnap.empty) {
    for (const d of uploadsSnap.docs) {
      if (d.data()?.__provider === "noor-library") {
        fileIdsToMirrorDelete.add(d.id);
        cleared.uploads += 1;
      }
    }
  }
  if (!contentFilesSnap.empty) {
    for (const d of contentFilesSnap.docs) {
      if (d.data()?.__provider === "noor-library") {
        fileIdsToMirrorDelete.add(d.id);
        cleared.content_files += 1;
      }
    }
  }
  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
  await adminFsBulkDeleteSectionKeys("main", [...enginesMains]);
  await adminFsBulkDeleteSectionKeys("sub", [...enginesSubs]);
  await adminFsBulkDeleteSectionKeys("secondary", [...enginesSecs]);
  await adminFsBulkDeleteFileMirrorIds([...fileIdsToMirrorDelete]);
  await appendLog({
    level: "warn",
    message: `تنفيذ "إعادة ضبط المصنع" — حُذف ${cleared.uploads + cleared.content_files} كتاب، ${cleared.mains + cleared.subs + cleared.secondaries} قسم، ${cleared.registry} سجلّ من السجلّ المركزي.`,
    reason: "factory_reset"
  }).catch(() => {
  });
  return { ok: true, cleared };
}
async function getEngineStatus({ logLimit = 30 } = {}) {
  await autoBootIfNeeded();
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
    currentSeedUrl: cfg.seedUrls[cursor.seedIndex] || null,
    log
  };
}
export {
  stopEngine as a,
  runEngineTick as b,
  factoryReset as f,
  getEngineStatus as g,
  resetCursor as r,
  startEngine as s,
  updateSeedUrls as u
};
