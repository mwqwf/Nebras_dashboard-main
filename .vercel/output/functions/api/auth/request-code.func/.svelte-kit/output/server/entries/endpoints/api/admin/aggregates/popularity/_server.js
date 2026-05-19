import { json } from "@sveltejs/kit";
import { i as isAdminConfigured } from "../../../../../../chunks/firebaseAdmin.js";
import { r as runAggregatePopularity } from "../../../../../../chunks/aggregatePopularity.js";
async function POST(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (auth.role !== "owner" && auth.role !== "supervisor") {
    return json({ error: "forbidden" }, { status: 403 });
  }
  if (!isAdminConfigured()) {
    return json({ error: "not_configured" }, { status: 501 });
  }
  try {
    const body = await event.request.json().catch(() => ({}));
    const limit = Number(body?.limit) || 50;
    const result = await runAggregatePopularity({ limit });
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("[aggregates/popularity]", err);
    return json({ error: String(err?.message || err) }, { status: 500 });
  }
}
export {
  POST
};
