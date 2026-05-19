import { json } from "@sveltejs/kit";
import { g as getEngineStatus } from "../../../../../../../chunks/engine2.js";
import { i as isAdminConfigured } from "../../../../../../../chunks/firebaseAdmin.js";
async function GET(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (auth.role !== "owner" && auth.role !== "supervisor") {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return json(
      { error: "not_configured", reason: "admin_service_account_missing" },
      { status: 501 }
    );
  }
  const limit = Math.max(1, Math.min(60, Number(event.url.searchParams.get("limit")) || 30));
  try {
    const status = await getEngineStatus({ logLimit: limit });
    return json({
      ok: true,
      ...status
    });
  } catch (err) {
    return json(
      {
        error: "internal_error",
        reason: err?.reason || "status_failed",
        message: err?.message || String(err)
      },
      { status: err?.status || 500 }
    );
  }
}
export {
  GET
};
