import { json } from "@sveltejs/kit";
import { b as private_env } from "../../../../../chunks/shared-server.js";
import { i as isAdminConfigured } from "../../../../../chunks/firebaseAdmin.js";
import { r as runAggregatePopularity } from "../../../../../chunks/aggregatePopularity.js";
function authorizeCron(event) {
  const secret = String(private_env.CRON_SECRET || "").trim();
  if (!secret) return { ok: false, reason: "cron_secret_not_configured" };
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
    const limit = Number(event.url.searchParams.get("limit")) || 50;
    const result = await runAggregatePopularity({ limit });
    return json({ ok: true, cron: true, ...result });
  } catch (err) {
    console.error("[cron/aggregates-popularity]", err);
    return json({ error: String(err?.message || err) }, { status: 500 });
  }
}
export {
  GET
};
