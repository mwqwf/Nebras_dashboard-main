import { b as adminFsReadSectionsLevel } from "./nebrasUnifiedFirestoreAdmin.js";
async function buildSectionsTree() {
  const [mains, subs, secondaries] = await Promise.all([
    adminFsReadSectionsLevel("main"),
    adminFsReadSectionsLevel("sub"),
    adminFsReadSectionsLevel("secondary")
  ]);
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
    index: { mainsById, subsById, secondariesById }
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
  validateHierarchyPath as v
};
