import { a2 as head } from "../../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils.js";
import "clsx";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/root.js";
import "../../../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    head("32dm92", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Content Management â€” Nebras</title>`);
      });
    });
    $$renderer2.push(`<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--color-surface-500);"><div class="spinner svelte-32dm92"></div><span style="margin-left:0.75rem;">Loading...</span></div>`);
  });
}
export {
  _page as default
};
