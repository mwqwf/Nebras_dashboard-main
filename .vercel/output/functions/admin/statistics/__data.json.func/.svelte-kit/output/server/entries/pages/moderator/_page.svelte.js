import { a2 as head, a4 as escape_html } from "../../../chunks/index2.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
import { t } from "../../../chunks/store.svelte.js";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
import { Chart, Title, Tooltip, Legend, ArcElement, CategoryScale, LinearScale, BarElement, BarController, DoughnutController } from "chart.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    Chart.register(Title, Tooltip, Legend, ArcElement, CategoryScale, LinearScale, BarElement, BarController, DoughnutController);
    onDestroy(() => {
    });
    head("10zncn8", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("common.dashboard"))} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page-container svelte-10zncn8"><div class="page-header svelte-10zncn8"><div><h1 class="page-title svelte-10zncn8">${escape_html(t("common.dashboard"))}</h1> <p class="page-desc svelte-10zncn8">${escape_html(t("moderator.dashboard_desc"))}</p></div></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="loading-state"><span class="spinner-lg"></span> <p>${escape_html(t("common.loading"))}</p></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
