import { redirect } from "@sveltejs/kit";
function load() {
  redirect(307, "/admin/internet-archive");
}
export {
  load
};
