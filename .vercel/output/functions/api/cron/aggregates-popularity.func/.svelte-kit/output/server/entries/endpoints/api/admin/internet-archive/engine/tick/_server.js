import { json } from "@sveltejs/kit";
import { r as runEngineTick } from "../../../../../../../chunks/engine.js";
import { i as isAdminPanelRole } from "../../../../../../../chunks/dashboardRoles.js";
async function POST(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (!isAdminPanelRole(auth.role)) {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  try {
    const r = await runEngineTick();
    return json({ ok: true, ...r });
  } catch (err) {
    return json(
      {
        error: "tick_failed",
        reason: err?.reason || "unknown",
        message: err?.message || String(err)
      },
      { status: err?.status || 500 }
    );
  }
}
export {
  POST
};
