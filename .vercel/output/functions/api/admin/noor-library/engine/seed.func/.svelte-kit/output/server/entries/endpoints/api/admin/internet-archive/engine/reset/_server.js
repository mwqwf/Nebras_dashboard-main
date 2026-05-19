import { json } from "@sveltejs/kit";
import { f as factoryReset, c as resetCursor } from "../../../../../../../chunks/engine.js";
import { r as requireAdminRole, a as requireAdminSdk } from "../../../../../../../chunks/adminApiAuth.js";
async function POST(event) {
  const gate = requireAdminRole(event);
  if (!gate.ok) return gate.response;
  const sdk = requireAdminSdk();
  if (!sdk.ok) return sdk.response;
  let body;
  try {
    body = await event.request.json();
  } catch {
    body = {};
  }
  const type = String(body?.type || "cursor").toLowerCase();
  try {
    if (type === "factory") {
      const r = await factoryReset();
      return json({ ok: true, type, ...r });
    }
    const c = await resetCursor();
    return json({ ok: true, type, cursor: c });
  } catch (err) {
    return json({ error: "reset_failed", message: err?.message || String(err) }, { status: 500 });
  }
}
export {
  POST
};
