import { a2 as head } from "../../chunks/index2.js";
import { o as onDestroy } from "../../chunks/index-server.js";
import "../../chunks/auth.svelte.js";
import "firebase/auth";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "clsx";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
import "../../chunks/client.js";
import { L as LoadingScreen } from "../../chunks/LoadingScreen.js";
import "../../chunks/store.svelte.js";
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    onDestroy(() => {
    });
    head("12qhfyh", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Nebras Dashboard</title>`);
      });
    });
    {
      $$renderer2.push("<!--[-->");
      LoadingScreen($$renderer2, { message: "Authenticating" });
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _layout as default
};
