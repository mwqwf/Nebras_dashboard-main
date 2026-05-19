import { json } from "@sveltejs/kit";
import { i as isAdminPanelRole } from "../../../../../../chunks/dashboardRoles.js";
import { p as previewItem } from "../../../../../../chunks/fetcher.js";
async function POST(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdminPanelRole(auth.role)) {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  let body;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: "bad_request", reason: "invalid_json" }, { status: 400 });
  }
  const identifier = String(body?.identifier || "").trim();
  if (!identifier) {
    return json({ error: "bad_request", reason: "identifier_required" }, { status: 400 });
  }
  try {
    const preview = await previewItem(identifier, {
      trustedCollections: Array.isArray(body?.trustedCollections) ? body.trustedCollections : void 0,
      allowMissingLicenseInTrustedCollections: Boolean(
        body?.allowMissingLicenseInTrustedCollections
      )
    });
    return json({ ok: true, preview });
  } catch (err) {
    return json(
      {
        error: "preview_failed",
        reason: err?.reason || "unknown",
        message: err?.message || String(err)
      },
      { status: err?.status || 422 }
    );
  }
}
export {
  POST
};
