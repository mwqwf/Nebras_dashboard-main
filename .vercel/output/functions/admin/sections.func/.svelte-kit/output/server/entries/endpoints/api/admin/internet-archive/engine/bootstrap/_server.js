import { json } from "@sveltejs/kit";
import { b as bootstrap } from "../../../../../../../chunks/engine.js";
import { r as requireAdminRole, a as requireAdminSdk } from "../../../../../../../chunks/adminApiAuth.js";
async function POST(event) {
  const gate = requireAdminRole(event);
  if (!gate.ok) return gate.response;
  const sdk = requireAdminSdk();
  if (!sdk.ok) return sdk.response;
  try {
    const r = await bootstrap();
    return json({ ok: true, ...r });
  } catch (err) {
    return json(
      {
        error: "bootstrap_failed",
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
