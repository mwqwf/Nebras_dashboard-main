import { b as getNebrasFirestoreAdmin } from "./firebaseAdmin.js";
import { N as NEBRAS_FS_SECTIONS } from "./nebrasUnifiedPaths.js";
const BLACKLISTED_SECTION_NAMES = Object.freeze([
  "دروس بتدكصهك",
  // نسخ بديلة محتملة (Typos شائعة) لنفس القسم — احتراز تشغيلي
  "دروس بترخيصها",
  "دروس بترخيصه"
]);
function normalizeArabic(s) {
  return String(s || "").replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, "").replace(/\u0640/g, "").replace(/[\u0622\u0623\u0625\u0671]/g, "ا").replace(/\u0649/g, "ي").replace(/\u0629/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
}
const NORMALIZED_BLACKLIST = new Set(
  BLACKLISTED_SECTION_NAMES.map(normalizeArabic).filter(Boolean)
);
function isBlacklistedSectionName(name) {
  const n = normalizeArabic(name);
  if (!n) return false;
  return NORMALIZED_BLACKLIST.has(n);
}
async function readLevel(level) {
  const snap = await getNebrasFirestoreAdmin().collection(NEBRAS_FS_SECTIONS).doc(level).get();
  if (!snap.exists) return [];
  const val = snap.data() || {};
  return Object.values(val);
}
function computeBlacklistedIds({ mains, subs, secondaries }) {
  const mainIds = /* @__PURE__ */ new Set();
  for (const m of mains) {
    if (isBlacklistedSectionName(m?.name)) mainIds.add(String(m.id));
  }
  const subIds = /* @__PURE__ */ new Set();
  for (const s of subs) {
    const isNameBlocked = isBlacklistedSectionName(s?.name);
    const parentBlocked = mainIds.has(String(s?.main_section ?? ""));
    if (isNameBlocked || parentBlocked) subIds.add(String(s.id));
  }
  const secondaryIds = /* @__PURE__ */ new Set();
  for (const sec of secondaries) {
    const isNameBlocked = isBlacklistedSectionName(sec?.name);
    const parentBlocked = subIds.has(String(sec?.sub_section ?? ""));
    if (isNameBlocked || parentBlocked) secondaryIds.add(String(sec.id));
  }
  return { mainIds, subIds, secondaryIds };
}
async function buildSectionsTree() {
  const [mainsAll, subsAll, secondariesAll] = await Promise.all([
    readLevel("main"),
    readLevel("sub"),
    readLevel("secondary")
  ]);
  const blacklist = computeBlacklistedIds({
    mains: mainsAll,
    subs: subsAll,
    secondaries: secondariesAll
  });
  const mains = mainsAll.filter((m) => !blacklist.mainIds.has(String(m.id)));
  const subs = subsAll.filter((s) => !blacklist.subIds.has(String(s.id)));
  const secondaries = secondariesAll.filter(
    (s) => !blacklist.secondaryIds.has(String(s.id))
  );
  const mainsById = Object.fromEntries(mains.map((m) => [String(m.id), m]));
  const subsById = Object.fromEntries(subs.map((s) => [String(s.id), s]));
  const secondariesById = Object.fromEntries(secondaries.map((s) => [String(s.id), s]));
  const subsByMain = /* @__PURE__ */ new Map();
  for (const s of subs) {
    const k = String(s.main_section ?? "");
    if (!k) continue;
    if (!subsByMain.has(k)) subsByMain.set(k, []);
    subsByMain.get(k).push(s);
  }
  const secondariesBySub = /* @__PURE__ */ new Map();
  for (const s of secondaries) {
    const k = String(s.sub_section ?? "");
    if (!k) continue;
    if (!secondariesBySub.has(k)) secondariesBySub.set(k, []);
    secondariesBySub.get(k).push(s);
  }
  const tree = mains.map((m) => {
    const mainId = String(m.id);
    const subChildren = (subsByMain.get(mainId) || []).map((sub) => {
      const subId = String(sub.id);
      const secChildren = (secondariesBySub.get(subId) || []).map((sec) => ({
        id: String(sec.id),
        name: String(sec.name || ""),
        parentId: subId
      }));
      return {
        id: subId,
        name: String(sub.name || ""),
        parentId: mainId,
        children: secChildren
      };
    });
    return {
      id: mainId,
      name: String(m.name || ""),
      children: subChildren
    };
  });
  return {
    tree,
    flat: { mains, subs, secondaries },
    index: { mainsById, subsById, secondariesById },
    blacklist
  };
}
function validateHierarchyPath({ mainId, subId, secondaryId }, index) {
  if (!mainId) return { valid: false, reason: "main_section_required" };
  const main = index.mainsById[String(mainId)];
  if (!main) return { valid: false, reason: "main_section_not_found" };
  if (!subId) return { valid: false, reason: "sub_section_required" };
  const sub = index.subsById[String(subId)];
  if (!sub) return { valid: false, reason: "sub_section_not_found" };
  if (String(sub.main_section ?? "") !== String(mainId)) {
    return { valid: false, reason: "sub_does_not_belong_to_main" };
  }
  let secondary = null;
  if (secondaryId) {
    secondary = index.secondariesById[String(secondaryId)];
    if (!secondary) return { valid: false, reason: "secondary_section_not_found" };
    if (String(secondary.sub_section ?? "") !== String(subId)) {
      return { valid: false, reason: "secondary_does_not_belong_to_sub" };
    }
  }
  return { valid: true, resolved: { main, sub, secondary } };
}
export {
  buildSectionsTree as b,
  computeBlacklistedIds as c,
  isBlacklistedSectionName as i,
  validateHierarchyPath as v
};
