import { json } from "@sveltejs/kit";
import { b as buildSectionsTree } from "../../../../../../chunks/sectionsTree2.js";
import { a as fetchBookMetadata } from "../../../../../../chunks/fetcher2.js";
import { a as classifyBookIntoHierarchy } from "../../../../../../chunks/classifier.js";
async function POST(event) {
  const auth = event.locals?.auth;
  if (!auth) return json({ error: "unauthenticated" }, { status: 401 });
  if (auth.role !== "owner" && auth.role !== "supervisor") {
    return json({ error: "forbidden", reason: "role_not_allowed" }, { status: 403 });
  }
  let body;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: "bad_request", reason: "invalid_json" }, { status: 400 });
  }
  const url = String(body?.url || "").trim();
  if (!url) {
    return json({ error: "bad_request", reason: "url_required" }, { status: 400 });
  }
  let metadata;
  try {
    metadata = await fetchBookMetadata(url);
  } catch (err) {
    return json(
      {
        error: "fetch_failed",
        reason: err?.reason || "fetch_failed",
        message: err?.message || String(err)
      },
      { status: err?.status || 502 }
    );
  }
  let sections;
  try {
    sections = await buildSectionsTree();
  } catch (err) {
    return json(
      { error: "sections_read_failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
  let classification;
  try {
    classification = await classifyBookIntoHierarchy(sections, metadata);
  } catch (err) {
    return json({
      ok: true,
      metadata,
      classification: null,
      classificationError: {
        reason: err?.reason || "classifier_failed",
        message: err?.message || String(err),
        status: err?.status || 502
      },
      tree: sections.tree
    });
  }
  return json({
    ok: true,
    metadata,
    classification,
    tree: sections.tree
  });
}
export {
  POST
};
