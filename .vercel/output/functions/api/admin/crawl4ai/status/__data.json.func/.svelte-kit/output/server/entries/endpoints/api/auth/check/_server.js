import { json } from "@sveltejs/kit";
import { v as verifyIdToken, a as getAdminDatabase } from "../../../../../chunks/firebaseAdmin.js";
import { s as syncNebrasDashboardClaimsForUid } from "../../../../../chunks/dashboardClaimsSync.js";
import { i as isOwnerEmail } from "../../../../../chunks/mailer.js";
import { n as normalizeDashboardRole } from "../../../../../chunks/dashboardRoles.js";
async function POST({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }
  let decoded;
  try {
    decoded = await verifyIdToken(body?.idToken);
  } catch (err) {
    return json(
      { error: "invalid_token", message: err?.message || "token verification failed" },
      { status: 401 }
    );
  }
  const uid = decoded.uid;
  const email = decoded.email || "";
  const userInfo = {
    uid,
    email,
    displayName: decoded.name || "",
    photoURL: decoded.picture || ""
  };
  try {
    const db = getAdminDatabase();
    const userRef = db.ref(`dashboard_users/${uid}`);
    const snap = await userRef.get();
    if (isOwnerEmail(email)) {
      const now = Date.now();
      if (snap.exists()) {
        const val = snap.val() || {};
        const patch = { lastSignedInAt: now };
        if (val.role !== "owner") patch.role = "owner";
        if (val.isBlocked !== false) patch.isBlocked = false;
        await userRef.update(patch).catch(() => {
        });
      } else {
        await userRef.set({
          ...userInfo,
          role: "owner",
          isBlocked: false,
          createdAt: now,
          lastSignedInAt: now,
          createdVia: "owner_bypass"
        });
      }
      await syncNebrasDashboardClaimsForUid(uid);
      return json({
        authorized: true,
        user: { ...userInfo, role: "owner", isBlocked: false }
      });
    }
    if (snap.exists()) {
      const val = snap.val() || {};
      const migration = {};
      if (val.role === "admin") migration.role = "supervisor";
      if (typeof val.isBlocked !== "boolean") migration.isBlocked = false;
      const effectiveRole = normalizeDashboardRole(email, {
        role: migration.role || val.role
      });
      const effectiveBlocked = typeof val.isBlocked === "boolean" ? val.isBlocked : false;
      if (effectiveBlocked === true) {
        if (Object.keys(migration).length > 0) {
          await userRef.update(migration).catch(() => {
          });
        }
        await syncNebrasDashboardClaimsForUid(uid);
        return json({
          authorized: false,
          blocked: true,
          user: { ...userInfo, role: effectiveRole, isBlocked: true }
        });
      }
      const patch = { lastSignedInAt: Date.now(), ...migration };
      await userRef.update(patch).catch(() => {
      });
      await syncNebrasDashboardClaimsForUid(uid);
      return json({
        authorized: true,
        user: { ...userInfo, role: effectiveRole, isBlocked: false }
      });
    }
    return json({ authorized: false, needsOwnerCode: true, user: userInfo });
  } catch (err) {
    console.error("[api/auth/check] server_error:", err);
    return json({ error: "server_error", message: err?.message || "unknown" }, { status: 500 });
  }
}
export {
  POST
};
