import { FieldValue } from "firebase-admin/firestore";
import { b as getNebrasFirestoreAdmin } from "./firebaseAdmin.js";
import { a as NEBRAS_FS_UPLOADS, b as NEBRAS_FS_CONTENT_FILES, N as NEBRAS_FS_SECTIONS } from "./nebrasUnifiedPaths.js";
function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== void 0);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== void 0) out[k] = cleaned;
    }
    return out;
  }
  return value === void 0 ? void 0 : value;
}
function adb() {
  return getNebrasFirestoreAdmin();
}
async function adminFsReadSectionsLevel(level) {
  const snap = await adb().collection(NEBRAS_FS_SECTIONS).doc(level).get();
  if (!snap.exists) return [];
  return Object.values(snap.data() || {});
}
async function adminFsSetSectionRecord(level, id, value) {
  const key = String(id);
  await adb().collection(NEBRAS_FS_SECTIONS).doc(level).set({ [key]: stripUndefinedDeep(value) }, { merge: true });
}
async function adminFsWriteFileMirrorBoth(fileId, payload) {
  const db = adb();
  const id = String(fileId);
  const data = stripUndefinedDeep(payload);
  const batch = db.batch();
  batch.set(db.collection(NEBRAS_FS_UPLOADS).doc(id), data);
  batch.set(db.collection(NEBRAS_FS_CONTENT_FILES).doc(id), data);
  await batch.commit();
}
async function adminFsBulkDeleteSectionKeys(level, ids) {
  const uniq = [...new Set(ids.map(String))].filter(Boolean);
  if (!uniq.length) return;
  const ref = adb().collection(NEBRAS_FS_SECTIONS).doc(level);
  const snap = await ref.get();
  if (!snap.exists) return;
  for (let i = 0; i < uniq.length; i += 400) {
    const chunk = uniq.slice(i, i + 400);
    const upd = Object.fromEntries(chunk.map((id) => [id, FieldValue.delete()]));
    await ref.update(upd);
  }
}
async function adminFsBulkDeleteFileMirrorIds(ids) {
  const uniq = [...new Set(ids.map(String))].filter(Boolean);
  if (!uniq.length) return;
  const db = adb();
  for (let i = 0; i < uniq.length; i += 200) {
    const batch = db.batch();
    for (const id of uniq.slice(i, i + 200)) {
      batch.delete(db.collection(NEBRAS_FS_UPLOADS).doc(id));
      batch.delete(db.collection(NEBRAS_FS_CONTENT_FILES).doc(id));
    }
    await batch.commit();
  }
}
export {
  adminFsSetSectionRecord as a,
  adminFsReadSectionsLevel as b,
  adminFsBulkDeleteSectionKeys as c,
  adminFsBulkDeleteFileMirrorIds as d,
  adminFsWriteFileMirrorBoth as e,
  stripUndefinedDeep as s
};
