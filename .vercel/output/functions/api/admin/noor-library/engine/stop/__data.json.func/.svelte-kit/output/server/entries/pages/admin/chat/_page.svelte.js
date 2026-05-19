import { a2 as head, a4 as escape_html, a6 as attr, a7 as ensure_array_like, a8 as attr_class } from "../../../../chunks/index2.js";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
import "../../../../chunks/auth.svelte.js";
import { t } from "../../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let totalCount = 0;
    let currentPage = 1;
    const PAGE_SIZE = 20;
    let totalPages = Math.ceil(totalCount / PAGE_SIZE);
    head("1pgdqej", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("chat.moderation"))} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-1pgdqej"><div class="page-header svelte-1pgdqej"><div><h1 class="page-title svelte-1pgdqej">${escape_html(t("chat.moderation"))}</h1><p class="page-desc svelte-1pgdqej">${escape_html(t("chat.moderation_desc"))}</p></div> <div class="count-badge svelte-1pgdqej">${escape_html(totalCount)} ${escape_html(t("chat.messages_count"))}</div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="content-container svelte-1pgdqej">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="state-box svelte-1pgdqej"><div class="spinner svelte-1pgdqej"></div><span>${escape_html(t("common.loading"))}</span></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (totalPages > 1) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pagination svelte-1pgdqej"><button class="page-btn svelte-1pgdqej"${attr("disabled", currentPage === 1, true)}>← ${escape_html(t("common.previous"))}</button> <div class="page-numbers svelte-1pgdqej"><!--[-->`);
      const each_array_2 = ensure_array_like(Array.from({ length: totalPages }, (_, i) => i + 1));
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let p = each_array_2[$$index_2];
        if (p === 1 || p === totalPages || p >= currentPage - 1 && p <= currentPage + 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr_class("page-num svelte-1pgdqej", void 0, { "active": p === currentPage })}>${escape_html(p)}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="page-ellipsis svelte-1pgdqej">...</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> <button class="page-btn svelte-1pgdqej"${attr("disabled", currentPage === totalPages, true)}>${escape_html(t("common.next"))} →</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
