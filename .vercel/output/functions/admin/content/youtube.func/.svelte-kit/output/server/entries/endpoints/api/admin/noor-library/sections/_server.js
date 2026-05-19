import { json } from "@sveltejs/kit";
import { b as buildSectionsTree } from "../../../../../../chunks/sectionsTree2.js";
async function GET(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (auth.role !== "owner" && auth.role !== "supervisor") {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  try {
    const sections = await buildSectionsTree();
    return json({
      ok: true,
      tree: sections.tree,
      counts: {
        mains: sections.flat.mains.length,
        subs: sections.flat.subs.length,
        secondaries: sections.flat.secondaries.length
      }
    });
  } catch (err) {
    return json(
      { error: "internal_error", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
export {
  GET
};
