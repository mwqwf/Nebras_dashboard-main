import { json } from "@sveltejs/kit";
import { i as isAdminConfigured, v as verifyIdToken, a as getAdminDatabase } from "../chunks/firebaseAdmin.js";
import { i as isOwnerEmail } from "../chunks/mailer.js";
import { n as normalizeDashboardRole } from "../chunks/dashboardRoles.js";
import { a as autoBootIfNeeded } from "../chunks/engine.js";
let iaAutoBootKicked = false;
function kickIaEngine() {
  if (iaAutoBootKicked) return;
  iaAutoBootKicked = true;
  if (isAdminConfigured()) {
    autoBootIfNeeded({ runInlineTick: true }).catch(() => {
    });
  }
}
const PROTECTED_PREFIXES = ["/api/admin/", "/api/notify/"];
function isProtectedPath(pathname) {
  for (const p of PROTECTED_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}
function extractBearer(request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : "";
}
async function loadAuthorization(idToken) {
  const decoded = await verifyIdToken(idToken);
  const uid = decoded.uid;
  const email = decoded.email || "";
  const snap = await getAdminDatabase().ref(`dashboard_users/${uid}`).get();
  if (!snap.exists()) {
    if (isOwnerEmail(email)) {
      return {
        uid,
        email,
        role: "owner",
        isBlocked: false,
        found: false,
        isOwnerByEmail: true
      };
    }
    return { uid, email, role: null, isBlocked: false, found: false, isOwnerByEmail: false };
  }
  const v = snap.val() || {};
  const effectiveRole = normalizeDashboardRole(email, v);
  const isBlocked = isOwnerEmail(email) ? false : v.isBlocked === true;
  return {
    uid,
    email,
    role: effectiveRole,
    isBlocked,
    found: true,
    isOwnerByEmail: isOwnerEmail(email)
  };
}
async function handle({ event, resolve }) {
  const path = event.url.pathname;
  kickIaEngine();
  if (!isProtectedPath(path)) {
    const response2 = await resolve(event);
    const accept = event.request.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      response2.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      response2.headers.set("Pragma", "no-cache");
    }
    return response2;
  }
  const idToken = extractBearer(event.request);
  if (!idToken) {
    return json({ error: "unauthenticated", reason: "missing_bearer_token" }, { status: 401 });
  }
  let auth;
  try {
    auth = await loadAuthorization(idToken);
  } catch (err) {
    return json(
      { error: "invalid_token", message: err?.message || "token verification failed" },
      { status: 401 }
    );
  }
  if (!auth.found && !auth.isOwnerByEmail) {
    return json({ error: "forbidden", reason: "not_in_admins" }, { status: 403 });
  }
  if (auth.isBlocked) {
    return json(
      {
        error: "blocked",
        reason: "access_suspended",
        message: "تم تعليق وصولك من قبل الإدارة",
        forceSignOut: true
      },
      { status: 403 }
    );
  }
  event.locals.auth = auth;
  const response = await resolve(event);
  return response;
}
export {
  handle
};
