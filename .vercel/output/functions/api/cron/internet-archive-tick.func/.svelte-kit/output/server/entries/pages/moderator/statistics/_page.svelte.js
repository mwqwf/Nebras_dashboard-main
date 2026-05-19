import { a2 as head, a4 as escape_html } from "../../../../chunks/index2.js";
import { P as PagePlaceholder } from "../../../../chunks/PagePlaceholder.js";
import { t } from "../../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    head("hlun58", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("statistics.my_title"))} — Nebras</title>`);
      });
    });
    PagePlaceholder($$renderer2, {
      title: t("statistics.my_title"),
      description: t("statistics.my_desc"),
      icon: "stats"
    });
  });
}
export {
  _page as default
};
