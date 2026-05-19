import { json } from "@sveltejs/kit";
import { f as factoryReset } from "../../../../../../../chunks/engine2.js";
import { i as isAdminConfigured } from "../../../../../../../chunks/firebaseAdmin.js";
async function DELETE(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (auth.role !== "owner" && auth.role !== "supervisor") {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return json(
      {
        error: "not_configured",
        reason: "admin_service_account_missing",
        message: "تأكّد من أنّ NEBRAS_SERVICE_ACCOUNT_PATH معرَّف في .env و الملفّ موجود."
      },
      { status: 501 }
    );
  }
  const startedAt = Date.now();
  try {
    const result = await factoryReset();
    return json({ ok: true, elapsedMs: Date.now() - startedAt, ...result });
  } catch (err) {
    return json(
      {
        error: "reset_failed",
        reason: err?.reason || "reset_failed",
        message: err?.message || String(err),
        elapsedMs: Date.now() - startedAt
      },
      { status: err?.status || 500 }
    );
  }
}
export {
  DELETE
};
