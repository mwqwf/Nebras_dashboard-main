import { json } from "@sveltejs/kit";
import { b as buildSectionsTree } from "../../../../../../chunks/sectionsTree.js";
import { r as requireAdminRole, a as requireAdminSdk } from "../../../../../../chunks/adminApiAuth.js";
async function GET(event) {
  const gate = requireAdminRole(event);
  if (!gate.ok) return gate.response;
  const sdk = requireAdminSdk();
  if (!sdk.ok) return sdk.response;
  try {
    const sections = await buildSectionsTree();
    return json({ ok: true, tree: sections.tree });
  } catch (err) {
    return json(
      { error: "sections_read_failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
export {
  GET
};
