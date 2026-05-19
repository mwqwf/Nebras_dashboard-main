import { a2 as head, a4 as escape_html } from "../../../../chunks/index2.js";
import { P as PagePlaceholder } from "../../../../chunks/PagePlaceholder.js";
import { t } from "../../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    head("18dhojk", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("statistics.title"))} — Nebras Admin</title>`);
      });
    });
    PagePlaceholder($$renderer2, {
      title: t("statistics.title"),
      description: t("statistics.desc"),
      icon: "stats"
    });
  });
}
export {
  _page as default
};
