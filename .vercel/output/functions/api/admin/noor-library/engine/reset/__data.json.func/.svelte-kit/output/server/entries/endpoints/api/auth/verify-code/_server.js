import { json } from "@sveltejs/kit";
import { v as verifyIdToken, a as getAdminDatabase } from "../../../../../chunks/firebaseAdmin.js";
import { s as syncNebrasDashboardClaimsForUid } from "../../../../../chunks/dashboardClaimsSync.js";
import { v as verifyCode } from "../../../../../chunks/ownerCode.js";
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
  const result = await verifyCode(body?.code);
  if (!result.ok) {
    return json({ ok: false, reason: result.reason });
  }
  const uid = decoded.uid;
  const userInfo = {
    uid,
    email: decoded.email || "",
    displayName: decoded.name || "",
    photoURL: decoded.picture || ""
  };
  try {
    const now = Date.now();
    await getAdminDatabase().ref(`dashboard_users/${uid}`).set({
      ...userInfo,
      role: "supervisor",
      isBlocked: false,
      createdAt: now,
      lastSignedInAt: now,
      createdVia: "otp_approval"
    });
    await syncNebrasDashboardClaimsForUid(uid);
  } catch (err) {
    console.error("[api/auth/verify-code] failed to write user:", err);
    return json({ error: "server_error", message: err?.message || "unknown" }, { status: 500 });
  }
  return json({ ok: true, user: { ...userInfo, role: "supervisor", isBlocked: false } });
}
export {
  POST
};
