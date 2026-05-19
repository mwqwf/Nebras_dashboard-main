import { json } from "@sveltejs/kit";
import { a as getAdminDatabase } from "../../../../../chunks/firebaseAdmin.js";
import { r as requireOwner } from "../../../../../chunks/authGuard.js";
async function GET(event) {
  const denied = requireOwner(event);
  if (denied) return denied;
  try {
    const snap = await getAdminDatabase().ref("dashboard_users").get();
    if (!snap.exists()) {
      return json({ total: 0, supervisors: [] });
    }
    const raw = snap.val() || {};
    const list = [];
    for (const [uid, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      list.push({
        uid,
        email: v.email || "",
        displayName: v.displayName || "",
        photoURL: v.photoURL || "",
        role: v.role === "admin" ? "supervisor" : v.role || "supervisor",
        isBlocked: v.isBlocked === true,
        createdAt: typeof v.createdAt === "number" ? v.createdAt : null,
        lastSignedInAt: typeof v.lastSignedInAt === "number" ? v.lastSignedInAt : null,
        createdVia: v.createdVia || null
      });
    }
    list.sort((a, b) => {
      const ax = a.lastSignedInAt || a.createdAt || 0;
      const bx = b.lastSignedInAt || b.createdAt || 0;
      return bx - ax;
    });
    return json({ total: list.length, supervisors: list });
  } catch (err) {
    console.error("[api/admin/supervisors] list failed:", err);
    return json({ error: "server_error", message: err?.message || "unknown" }, { status: 500 });
  }
}
export {
  GET
};
