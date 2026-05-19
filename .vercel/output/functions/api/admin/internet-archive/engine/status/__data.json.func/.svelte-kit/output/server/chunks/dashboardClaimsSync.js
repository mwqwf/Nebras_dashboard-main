import { c as getAdminAuthService, a as getAdminDatabase } from "./firebaseAdmin.js";
async function syncNebrasDashboardClaimsForUid(uid) {
  const id = String(uid || "").trim();
  if (!id) return;
  const auth = getAdminAuthService();
  let snap;
  try {
    snap = await getAdminDatabase().ref(`dashboard_users/${id}`).get();
  } catch (err) {
    console.warn("[dashboardClaimsSync] RTDB read failed:", err?.message || err);
    return;
  }
  if (!snap.exists()) {
    try {
      await auth.setCustomUserClaims(id, {});
    } catch (err) {
      console.warn("[dashboardClaimsSync] clear claims failed:", err?.message || err);
    }
    return;
  }
  const v = snap.val() || {};
  if (v.isBlocked === true) {
    try {
      await auth.setCustomUserClaims(id, {});
    } catch (err) {
      console.warn("[dashboardClaimsSync] blocked clear failed:", err?.message || err);
    }
    return;
  }
  const rawRole = v.role === "admin" || v.role === "moderator" ? "supervisor" : v.role || "supervisor";
  if (rawRole === "owner") {
    try {
      await auth.setCustomUserClaims(id, { role: "owner" });
    } catch (err) {
      console.warn("[dashboardClaimsSync] set owner failed:", err?.message || err);
    }
    return;
  }
  if (rawRole === "supervisor") {
    try {
      await auth.setCustomUserClaims(id, { role: "supervisor" });
    } catch (err) {
      console.warn("[dashboardClaimsSync] set supervisor failed:", err?.message || err);
    }
    return;
  }
  try {
    await auth.setCustomUserClaims(id, {});
  } catch (err) {
    console.warn("[dashboardClaimsSync] reset claims failed:", err?.message || err);
  }
}
export {
  syncNebrasDashboardClaimsForUid as s
};
