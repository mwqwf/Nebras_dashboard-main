import { json } from "@sveltejs/kit";
import { i as importItem } from "../../../../../../chunks/engine.js";
import { r as requireAdminRole, a as requireAdminSdk } from "../../../../../../chunks/adminApiAuth.js";
async function POST(event) {
  const gate = requireAdminRole(event);
  if (!gate.ok) return gate.response;
  const sdk = requireAdminSdk();
  if (!sdk.ok) return sdk.response;
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
  const mainId = String(body?.hierarchy?.mainId || "").trim();
  const subId = String(body?.hierarchy?.subId || "").trim();
  const forcedHierarchy = mainId && subId ? {
    mainId,
    subId,
    secondaryId: body?.hierarchy?.secondaryId ? String(body.hierarchy.secondaryId).trim() : null
  } : void 0;
  try {
    const result = await importItem(identifier, { forcedHierarchy });
    return json({ ok: true, result });
  } catch (err) {
    return json(
      {
        error: "import_failed",
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
