import "clsx";
import "../../../chunks/auth.svelte.js";
import "firebase/auth";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
import "../../../chunks/client.js";
import "../../../chunks/store.svelte.js";
/* empty css                                                            */
import "browser-image-compression";
import { L as LoadingScreen } from "../../../chunks/LoadingScreen.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    {
      $$renderer2.push("<!--[!-->");
      LoadingScreen($$renderer2, { message: "Loading" });
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _layout as default
};
