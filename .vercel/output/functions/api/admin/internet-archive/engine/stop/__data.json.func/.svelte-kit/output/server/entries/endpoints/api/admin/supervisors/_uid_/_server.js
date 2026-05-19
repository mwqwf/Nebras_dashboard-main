import { json } from "@sveltejs/kit";
import { a as getAdminDatabase } from "../../../../../../chunks/firebaseAdmin.js";
import { s as syncNebrasDashboardClaimsForUid } from "../../../../../../chunks/dashboardClaimsSync.js";
import { r as requireOwner } from "../../../../../../chunks/authGuard.js";
function badRequest(reason) {
  return json({ error: "bad_request", reason }, { status: 400 });
}
async function readSupervisor(uid) {
  const ref = getAdminDatabase().ref(`dashboard_users/${uid}`);
  const snap = await ref.get();
  return { ref, snap, value: snap.exists() ? snap.val() : null };
}
function sanitizeOutput(uid, v) {
  return {
    uid,
    email: v.email || "",
    displayName: v.displayName || "",
    photoURL: v.photoURL || "",
    role: v.role === "admin" ? "supervisor" : v.role || "supervisor",
    isBlocked: v.isBlocked === true,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : null,
    lastSignedInAt: typeof v.lastSignedInAt === "number" ? v.lastSignedInAt : null,
    blockedAt: typeof v.blockedAt === "number" ? v.blockedAt : null,
    blockedBy: v.blockedBy || null,
    blockMode: v.blockMode || null
  };
}
async function PATCH(event) {
  const denied = requireOwner(event);
  if (denied) return denied;
  const { params, request, locals } = event;
  const uid = (params.uid || "").trim();
  if (!uid) return badRequest("missing_uid");
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid_json");
  }
  if (typeof body?.isBlocked !== "boolean") {
    return badRequest("isBlocked_required_boolean");
  }
  const modeRaw = body?.mode;
  const mode = modeRaw === "permanent" ? "permanent" : "temporary";
  if (locals?.auth?.uid === uid) {
    return json({ error: "forbidden", reason: "cannot_modify_self" }, { status: 403 });
  }
  try {
    const { ref, snap, value } = await readSupervisor(uid);
    if (!snap.exists() || !value) {
      return json({ error: "not_found" }, { status: 404 });
    }
    if (value.role === "owner") {
      return json({ error: "forbidden", reason: "cannot_modify_owner" }, { status: 403 });
    }
    const now = Date.now();
    const patch = {
      isBlocked: body.isBlocked
    };
    if (body.isBlocked) {
      patch.blockedAt = now;
      patch.blockedBy = locals?.auth?.uid || null;
      patch.blockMode = mode;
    } else {
      patch.blockedAt = null;
      patch.blockedBy = null;
      patch.blockMode = null;
    }
    await ref.update(patch);
    await syncNebrasDashboardClaimsForUid(uid);
    const after = { ...value, ...patch };
    return json({ ok: true, supervisor: sanitizeOutput(uid, after) });
  } catch (err) {
    console.error("[api/admin/supervisors/:uid] patch failed:", err);
    return json({ error: "server_error", message: err?.message || "unknown" }, { status: 500 });
  }
}
async function DELETE(event) {
  const denied = requireOwner(event);
  if (denied) return denied;
  const { params, locals } = event;
  const uid = (params.uid || "").trim();
  if (!uid) return badRequest("missing_uid");
  if (locals?.auth?.uid === uid) {
    return json({ error: "forbidden", reason: "cannot_remove_self" }, { status: 403 });
  }
  try {
    const { ref, snap, value } = await readSupervisor(uid);
    if (!snap.exists() || !value) {
      return json({ error: "not_found" }, { status: 404 });
    }
    if (value.role === "owner") {
      return json({ error: "forbidden", reason: "cannot_remove_owner" }, { status: 403 });
    }
    await ref.remove();
    await syncNebrasDashboardClaimsForUid(uid);
    return json({ ok: true, removed: true });
  } catch (err) {
    console.error("[api/admin/supervisors/:uid] delete failed:", err);
    return json({ error: "server_error", message: err?.message || "unknown" }, { status: 500 });
  }
}
export {
  DELETE,
  PATCH
};
