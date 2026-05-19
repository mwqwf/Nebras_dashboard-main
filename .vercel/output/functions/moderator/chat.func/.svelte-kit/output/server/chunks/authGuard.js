import { json } from "@sveltejs/kit";
function requireOwner(event) {
  const auth = event.locals?.auth;
  if (!auth) {
    return json({ error: "unauthenticated" }, { status: 401 });
  }
  if (auth.role !== "owner") {
    return json({ error: "forbidden", reason: "owner_only" }, { status: 403 });
  }
  return null;
}
export {
  requireOwner as r
};
