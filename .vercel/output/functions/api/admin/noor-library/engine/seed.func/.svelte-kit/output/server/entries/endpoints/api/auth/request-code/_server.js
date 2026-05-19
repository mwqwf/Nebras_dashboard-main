import { json } from "@sveltejs/kit";
import { v as verifyIdToken, a as getAdminDatabase } from "../../../../../chunks/firebaseAdmin.js";
import { i as isOwnerEmail, s as sendOwnerCode } from "../../../../../chunks/mailer.js";
import { i as issueNewCode } from "../../../../../chunks/ownerCode.js";
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
  if (isOwnerEmail(decoded.email)) {
    return json({ ok: false, reason: "already_authorized" }, { status: 400 });
  }
  try {
    const db = getAdminDatabase();
    const existing = await db.ref(`dashboard_users/${decoded.uid}`).get();
    if (existing.exists()) {
      return json({ ok: false, reason: "already_authorized" }, { status: 400 });
    }
  } catch (err) {
    console.error("[api/auth/request-code] db check failed:", err);
  }
  let issued;
  try {
    issued = await issueNewCode();
  } catch (err) {
    console.error("[api/auth/request-code] issueNewCode failed:", err);
    return json({ error: "server_error", message: err?.message || "unknown" }, { status: 500 });
  }
  if (!issued.ok) {
    return json(
      { ok: false, reason: issued.reason, retryAfterSec: Math.ceil(issued.retryAfterMs / 1e3) },
      { status: 200 }
    );
  }
  const { delivered } = await sendOwnerCode({
    code: issued.code,
    candidateEmail: decoded.email || "",
    candidateName: decoded.name || ""
  });
  return json({ ok: true, delivered, expiresInSec: 10 * 60 });
}
export {
  POST
};
