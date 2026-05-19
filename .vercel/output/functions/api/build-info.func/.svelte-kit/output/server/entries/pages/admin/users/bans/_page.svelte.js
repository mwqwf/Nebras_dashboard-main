import { a2 as head, a4 as escape_html, a6 as attr, a7 as ensure_array_like, a8 as attr_class } from "../../../../../chunks/index2.js";
import { l as listBans } from "../../../../../chunks/admin.js";
import { t } from "../../../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let bans = [];
    let totalCount = 0;
    let currentPage = 1;
    let isLoading = true;
    let error = "";
    let filterUser = "";
    let filterBanned = "";
    let searchQuery = "";
    let liftLoading = null;
    let moderatorsList = [];
    const PAGE_SIZE = 10;
    let totalPages = Math.ceil(totalCount / PAGE_SIZE);
    async function fetchBans() {
      isLoading = true;
      error = "";
      try {
        const data = await listBans({
          user: filterUser,
          is_banned: filterBanned,
          search: searchQuery,
          page: currentPage
        });
        bans = data.results;
        totalCount = data.count;
      } catch (err) {
        error = err.message;
      } finally {
        isLoading = false;
      }
    }
    function handleFilterChange() {
      currentPage = 1;
      fetchBans();
    }
    function formatDate(dateStr) {
      if (!dateStr) return "—";
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    function getUserName(userId) {
      const mod = moderatorsList.find((m) => m.id === userId);
      return mod ? mod.username : null;
    }
    head("13oh8l0", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Bans — Nebras Admin</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-13oh8l0"><div class="page-header svelte-13oh8l0"><div class="header-info"><h1 class="page-title svelte-13oh8l0">${escape_html(t("bans.title"))}</h1> <p class="page-desc svelte-13oh8l0">${escape_html(t("bans.desc"))}</p></div> <button class="btn btn-danger-solid svelte-13oh8l0" id="apply-ban-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-13oh8l0"><path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg> ${escape_html(t("bans.apply_ban"))}</button></div> <div class="toolbar svelte-13oh8l0"><div class="search-box svelte-13oh8l0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon svelte-13oh8l0"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> <input type="text"${attr("placeholder", t("bans.search"))}${attr("value", searchQuery)} class="search-input svelte-13oh8l0" id="search-bans"/></div> `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterBanned,
        onchange: handleFilterChange
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("bans.all_status"))}`);
          },
          "svelte-13oh8l0"
        );
        $$renderer3.option(
          { value: "true", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("bans.currently_banned"))}`);
          },
          "svelte-13oh8l0"
        );
        $$renderer3.option(
          { value: "false", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("bans.lifted"))}`);
          },
          "svelte-13oh8l0"
        );
      },
      "svelte-13oh8l0"
    );
    $$renderer2.push(` <div class="count-badge svelte-13oh8l0">${escape_html(t("common.total"))} ${escape_html(totalCount)}</div></div> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-error svelte-13oh8l0">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="table-card svelte-13oh8l0">`);
    if (isLoading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="table-loading svelte-13oh8l0"><div class="spinner svelte-13oh8l0"></div> <span>Loading bans...</span></div>`);
    } else if (bans.length === 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="table-empty svelte-13oh8l0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-13oh8l0"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round"></path></svg> <p>${escape_html(t("bans.no_bans"))}</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="table-responsive svelte-13oh8l0"><table class="data-table svelte-13oh8l0" id="bans-table"><thead><tr><th class="svelte-13oh8l0">${escape_html(t("bans.user"))}</th><th class="svelte-13oh8l0">${escape_html(t("bans.reason"))}</th><th class="svelte-13oh8l0">${escape_html(t("bans.start"))}</th><th class="svelte-13oh8l0">${escape_html(t("bans.end"))}</th><th class="svelte-13oh8l0">${escape_html(t("common.status"))}</th><th class="th-actions svelte-13oh8l0">${escape_html(t("common.actions"))}</th></tr></thead><tbody class="svelte-13oh8l0"><!--[-->`);
      const each_array = ensure_array_like(bans);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let ban = each_array[$$index];
        $$renderer2.push(`<tr class="svelte-13oh8l0"><td class="svelte-13oh8l0"><div class="user-cell svelte-13oh8l0"><span class="user-id-badge svelte-13oh8l0">#${escape_html(ban.user)}</span> `);
        if (getUserName(ban.user)) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="user-name-label svelte-13oh8l0">@${escape_html(getUserName(ban.user))}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></td><td class="svelte-13oh8l0"><span class="reason-text svelte-13oh8l0">${escape_html(ban.reason || "—")}</span></td><td class="svelte-13oh8l0"><span class="text-secondary svelte-13oh8l0">${escape_html(formatDate(ban.banned_start))}</span></td><td class="svelte-13oh8l0"><span class="text-secondary svelte-13oh8l0">${escape_html(formatDate(ban.banned_end))}</span></td><td class="svelte-13oh8l0"><span${attr_class("ban-status svelte-13oh8l0", void 0, { "active": ban.is_banned, "lifted": !ban.is_banned })}><span class="status-dot svelte-13oh8l0"></span> ${escape_html(ban.is_banned ? "Banned" : "Lifted")}</span></td><td class="svelte-13oh8l0"><div class="action-btns svelte-13oh8l0">`);
        if (ban.is_banned) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button class="btn btn-lift svelte-13oh8l0"${attr("disabled", liftLoading === ban.id, true)}>`);
          if (liftLoading === ban.id) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="spinner-sm svelte-13oh8l0"></span>`);
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`${escape_html(t("bans.lift_ban"))}`);
          }
          $$renderer2.push(`<!--]--></button>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<span class="text-muted svelte-13oh8l0">—</span>`);
        }
        $$renderer2.push(`<!--]--></div></td></tr>`);
      }
      $$renderer2.push(`<!--]--></tbody></table></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (totalPages > 1) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pagination svelte-13oh8l0"><button class="page-btn svelte-13oh8l0"${attr("disabled", currentPage === 1, true)}>← Previous</button> <div class="page-numbers svelte-13oh8l0"><!--[-->`);
      const each_array_1 = ensure_array_like(Array.from({ length: totalPages }, (_, i) => i + 1));
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let p = each_array_1[$$index_1];
        if (p === 1 || p === totalPages || p >= currentPage - 1 && p <= currentPage + 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr_class("page-num svelte-13oh8l0", void 0, { "active": p === currentPage })}>${escape_html(p)}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="page-ellipsis svelte-13oh8l0">...</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> <button class="page-btn svelte-13oh8l0"${attr("disabled", currentPage === totalPages, true)}>Next →</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>  `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
