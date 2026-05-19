import { json } from "@sveltejs/kit";
import { r as requireOwner } from "../../../../../../chunks/authGuard.js";
import { c as crawl4aiConfigured, a as crawl4aiFetch } from "../../../../../../chunks/crawl4aiClient.js";
async function GET(event) {
  const denied = requireOwner(event);
  if (denied) return denied;
  if (!crawl4aiConfigured()) {
    return json(
      {
        error: "not_configured",
        message: "Set CRAWL4AI_SERVICE_URL in dashboard .env (server-side)."
      },
      { status: 501 }
    );
  }
  const lim = Number(event.url.searchParams.get("limit") || "50") || 50;
  try {
    const res = await crawl4aiFetch(`/jobs?limit=${encodeURIComponent(String(lim))}`, {
      method: "GET"
    });
    if (!res) {
      return json({ error: "not_configured" }, { status: 501 });
    }
    const body = await res.json().catch(() => ({}));
    return json(body, { status: res.status });
  } catch (err) {
    const msg = err?.name === "AbortError" ? "crawl4ai_timeout" : err?.message || "upstream_error";
    return json({ error: "upstream_unreachable", message: msg }, { status: 502 });
  }
}
export {
  GET
};
