import { json } from "@sveltejs/kit";
import { i as isAdminPanelRole } from "../../../../../../../chunks/dashboardRoles.js";
import { g as getEngineStatus } from "../../../../../../../chunks/engine.js";
async function GET(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdminPanelRole(auth.role)) {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  try {
    const status = await getEngineStatus({ logLimit: 40 });
    return json({ ok: true, status });
  } catch (err) {
    return json({ error: "status_failed", message: err?.message || String(err) }, { status: 500 });
  }
}
export {
  GET
};
