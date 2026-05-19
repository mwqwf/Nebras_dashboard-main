import { a2 as head, a4 as escape_html, a6 as attr, a7 as ensure_array_like, a8 as attr_class } from "../../../../../chunks/index2.js";
import { a as listModerators } from "../../../../../chunks/admin.js";
import { t } from "../../../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let moderators = [];
    let totalCount = 0;
    let currentPage = 1;
    let searchQuery = "";
    let filterActive = "";
    let filterStaff = "";
    let isLoading = true;
    let error = "";
    const PAGE_SIZE = 10;
    let totalPages = Math.ceil(totalCount / PAGE_SIZE);
    async function fetchModerators() {
      isLoading = true;
      error = "";
      try {
        const data = await listModerators({
          search: searchQuery,
          page: currentPage,
          is_active: filterActive,
          is_staff: filterStaff
        });
        moderators = data.results;
        totalCount = data.count;
      } catch (err) {
        error = err.message;
      } finally {
        isLoading = false;
      }
    }
    function handleFilterChange() {
      currentPage = 1;
      fetchModerators();
    }
    head("1h4ovi2", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Moderators — Nebras Admin</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-1h4ovi2"><div class="page-header svelte-1h4ovi2"><div class="header-info"><h1 class="page-title svelte-1h4ovi2">${escape_html(t("moderators.title"))}</h1> <p class="page-desc svelte-1h4ovi2">${escape_html(t("moderators.desc"))}</p></div> <button class="btn btn-primary svelte-1h4ovi2" id="create-moderator-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-1h4ovi2"><path d="M12 4v16m8-8H4"></path></svg> ${escape_html(t("moderators.new_mod"))}</button></div> <div class="toolbar svelte-1h4ovi2"><div class="search-box svelte-1h4ovi2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon svelte-1h4ovi2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> <input type="text"${attr("placeholder", t("moderators.search"))}${attr("value", searchQuery)} class="search-input svelte-1h4ovi2" id="search-moderators"/></div> `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterActive,
        onchange: handleFilterChange
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.status"))} / ${escape_html(t("common.total"))}`);
          },
          "svelte-1h4ovi2"
        );
        $$renderer3.option(
          { value: "true", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`Active`);
          },
          "svelte-1h4ovi2"
        );
        $$renderer3.option(
          { value: "false", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`Inactive`);
          },
          "svelte-1h4ovi2"
        );
      },
      "svelte-1h4ovi2"
    );
    $$renderer2.push(` `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterStaff,
        onchange: handleFilterChange
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`All Roles`);
          },
          "svelte-1h4ovi2"
        );
        $$renderer3.option(
          { value: "true", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`Staff`);
          },
          "svelte-1h4ovi2"
        );
        $$renderer3.option(
          { value: "false", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`Non-Staff`);
          },
          "svelte-1h4ovi2"
        );
      },
      "svelte-1h4ovi2"
    );
    $$renderer2.push(` <div class="count-badge svelte-1h4ovi2">${escape_html(t("common.total"))} ${escape_html(totalCount)}</div></div> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-error svelte-1h4ovi2">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="table-card svelte-1h4ovi2">`);
    if (isLoading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="table-loading svelte-1h4ovi2"><div class="spinner svelte-1h4ovi2"></div> <span>Loading moderators...</span></div>`);
    } else if (moderators.length === 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="table-empty svelte-1h4ovi2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-1h4ovi2"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" stroke-linecap="round" stroke-linejoin="round"></path></svg> <p>No moderators found</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="table-responsive svelte-1h4ovi2"><table class="data-table svelte-1h4ovi2" id="moderators-table"><thead><tr><th class="svelte-1h4ovi2">${escape_html(t("common.users"))}</th><th class="svelte-1h4ovi2">${escape_html(t("profile.email"))}</th><th class="svelte-1h4ovi2">${escape_html(t("common.status"))}</th><th class="th-actions svelte-1h4ovi2">${escape_html(t("common.actions"))}</th></tr></thead><tbody class="svelte-1h4ovi2"><!--[-->`);
      const each_array = ensure_array_like(moderators);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let mod = each_array[$$index];
        $$renderer2.push(`<tr class="svelte-1h4ovi2"><td class="svelte-1h4ovi2"><div class="user-cell svelte-1h4ovi2"><div class="user-avatar svelte-1h4ovi2">${escape_html((mod.first_name || mod.username).charAt(0).toUpperCase())}</div> <div class="user-info svelte-1h4ovi2"><span class="user-name svelte-1h4ovi2">${escape_html(mod.first_name)} ${escape_html(mod.last_name)}</span> <span class="user-username svelte-1h4ovi2">@${escape_html(mod.username)}</span></div></div></td><td class="svelte-1h4ovi2"><span class="text-secondary svelte-1h4ovi2">${escape_html(mod.email)}</span></td><td class="svelte-1h4ovi2"><span${attr_class("status-badge svelte-1h4ovi2", void 0, { "active": mod.is_active, "inactive": !mod.is_active })}><span class="status-dot svelte-1h4ovi2"></span> ${escape_html(mod.is_active ? "Active" : "Inactive")}</span></td><td class="svelte-1h4ovi2"><div class="action-btns svelte-1h4ovi2"><button class="action-btn edit svelte-1h4ovi2" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1h4ovi2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button> <button class="action-btn delete svelte-1h4ovi2" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1h4ovi2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div></td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (totalPages > 1) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pagination svelte-1h4ovi2"><button class="page-btn svelte-1h4ovi2"${attr("disabled", currentPage === 1, true)}>← Previous</button> <div class="page-numbers svelte-1h4ovi2"><!--[-->`);
      const each_array_1 = ensure_array_like(Array.from({ length: totalPages }, (_, i) => i + 1));
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let p = each_array_1[$$index_1];
        if (p === 1 || p === totalPages || p >= currentPage - 1 && p <= currentPage + 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr_class("page-num svelte-1h4ovi2", void 0, { "active": p === currentPage })}>${escape_html(p)}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="page-ellipsis svelte-1h4ovi2">...</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> <button class="page-btn svelte-1h4ovi2"${attr("disabled", currentPage === totalPages, true)}>Next →</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>  `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->  `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
