import { json } from "@sveltejs/kit";
import { i as isAdminConfigured } from "./firebaseAdmin.js";
import { i as isAdminPanelRole } from "./dashboardRoles.js";
function requireAdminRole(event) {
  const auth = event.locals?.auth;
  if (!auth) {
    return { ok: false, response: json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (!isAdminPanelRole(auth.role)) {
    return { ok: false, response: json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 }) };
  }
  return { ok: true, auth };
}
function requireAdminSdk() {
  if (!isAdminConfigured()) {
    return {
      ok: false,
      response: json(
        {
          error: "not_configured",
          reason: "admin_service_account_missing",
          message: "تأكّد من ضبط NEBRAS_SERVICE_ACCOUNT_PATH أو NEBRAS_SERVICE_ACCOUNT_JSON في .env."
        },
        { status: 501 }
      )
    };
  }
  return { ok: true };
}
export {
  requireAdminSdk as a,
  requireAdminRole as r
};
