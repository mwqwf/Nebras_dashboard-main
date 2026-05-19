import { json } from "@sveltejs/kit";
import { b as private_env } from "../../../../../chunks/shared-server.js";
import { i as isAdminConfigured } from "../../../../../chunks/firebaseAdmin.js";
import { a as autoBootIfNeeded } from "../../../../../chunks/engine.js";
function authorizeCron(event) {
  const secret = String(private_env.CRON_SECRET || "").trim();
  if (!secret) return { ok: true, reason: "cron_secret_not_configured_but_allowed" };
  const header = event.request.headers.get("authorization") || event.request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = m ? m[1].trim() : "";
  if (!token || token !== secret) return { ok: false, reason: "invalid_cron_secret" };
  return { ok: true };
}
async function GET(event) {
  const auth = authorizeCron(event);
  if (!auth.ok) {
    return json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }
  if (!isAdminConfigured()) {
    return json({ error: "not_configured" }, { status: 501 });
  }
  try {
    const r = await autoBootIfNeeded({ runInlineTick: true });
    if (!r.booted) {
      return json({ ok: true, skipped: true, reason: r.reason });
    }
    return json({ ok: true, cron: true, ...r.inlineTickResult || {} });
  } catch (err) {
    console.error("[cron/internet-archive-tick]", err);
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
  GET
};
