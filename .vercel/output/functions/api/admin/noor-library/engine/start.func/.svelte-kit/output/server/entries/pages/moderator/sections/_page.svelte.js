import { a2 as head, a4 as escape_html, a8 as attr_class, a7 as ensure_array_like, a6 as attr, aa as attr_style, a9 as stringify } from "../../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/root.js";
import "../../../../chunks/state.svelte.js";
import "../../../../chunks/client.js";
import { l as listMyMainSections, c as listMySubSections, d as listMySecondarySections, g as getLastPartialFailures } from "../../../../chunks/moderator.js";
import { t } from "../../../../chunks/store.svelte.js";
import { t as tokenize, h as html, a as highlightMatches } from "../../../../chunks/search2.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let activeLevel = "main";
    let filterMainSection = "";
    let filterSubSection = "";
    let mainSectionsList = [];
    let subSectionsList = [];
    let items = [];
    let totalCount = 0;
    let currentPage = 1;
    let filterIsListed = "";
    let isLoading = false;
    let hasSearched = false;
    let error = "";
    const PAGE_SIZE = 10;
    let totalPages = Math.ceil(totalCount / PAGE_SIZE);
    let pageTitle = t("sections.main_sections");
    let pageDesc = t("sections.desc");
    let searchTokens = [];
    let partialFailures = [];
    async function fetchItems() {
      const q = String("").trim();
      if (!q && true) {
        items = [];
        totalCount = 0;
        hasSearched = false;
        isLoading = false;
        searchTokens = [];
        return;
      }
      isLoading = true;
      error = "";
      hasSearched = true;
      searchTokens = tokenize(q);
      try {
        let data;
        const baseParams = {
          search: q,
          page: currentPage,
          requireSearch: true,
          is_listed: filterIsListed === "" ? void 0 : filterIsListed === "true"
        };
        if (activeLevel === "main") {
          data = await listMyMainSections(baseParams);
        }
        items = data.results;
        totalCount = data.count;
        partialFailures = getLastPartialFailures();
      } catch (err) {
        error = err.message;
      } finally {
        isLoading = false;
      }
    }
    function handleFilterChange() {
      currentPage = 1;
      fetchItems();
    }
    function formatDate(dateStr) {
      if (!dateStr) return "—";
      return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    function getMainSectionName(id) {
      const s = mainSectionsList.find((m) => m.id === id);
      return s ? s.name : `#${id}`;
    }
    function getSubSectionName(id) {
      const s = subSectionsList.find((m) => m.id === id);
      return s ? s.name : `#${id}`;
    }
    head("1yyp529", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>My ${escape_html(pageTitle)} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-1yyp529"><div class="page-header svelte-1yyp529"><div class="header-info svelte-1yyp529"><div class="svelte-1yyp529"><h1 class="page-title svelte-1yyp529">${escape_html(t("sections.title"))}</h1> <p class="page-desc svelte-1yyp529">${escape_html(pageDesc)}</p></div></div> <button class="btn btn-primary svelte-1yyp529" id="create-section-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-1yyp529"><path d="M12 5v14m-7-7h14" class="svelte-1yyp529"></path></svg> ${escape_html(t("sections.new_section"))}</button></div> <div class="level-tabs svelte-1yyp529"><button${attr_class("level-tab svelte-1yyp529", void 0, { "active": activeLevel === "main" })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon svelte-1yyp529"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" class="svelte-1yyp529"></path></svg> ${escape_html(t("sections.main_sections"))}</button> <button${attr_class("level-tab svelte-1yyp529", void 0, { "active": activeLevel === "sub" })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon svelte-1yyp529"><path d="M9 5l7 7-7 7" class="svelte-1yyp529"></path></svg> ${escape_html(t("sections.sub_sections"))}</button> <button${attr_class("level-tab svelte-1yyp529", void 0, { "active": activeLevel === "secondary" })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon svelte-1yyp529"><path d="M13 5l7 7-7 7M5 5l7 7-7 7" class="svelte-1yyp529"></path></svg> ${escape_html(t("sections.secondary_sections"))}</button></div> <div class="toolbar svelte-1yyp529">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterIsListed,
        onchange: handleFilterChange
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.all"))} (${escape_html(t("common.is_listed"))})`);
          },
          "svelte-1yyp529"
        );
        $$renderer3.option(
          { value: "true", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.listed"))}`);
          },
          "svelte-1yyp529"
        );
        $$renderer3.option(
          { value: "false", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.unlisted"))}`);
          },
          "svelte-1yyp529"
        );
      },
      "svelte-1yyp529"
    );
    $$renderer2.push(` <div class="count-badge svelte-1yyp529">${escape_html(t("common.total"))} ${escape_html(totalCount)}</div></div> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-error svelte-1yyp529">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (partialFailures.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-warning svelte-1yyp529" style="margin-bottom:0.75rem">${escape_html(t("common.search_partial_warning"))} <!--[-->`);
      const each_array_2 = ensure_array_like(partialFailures);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let f = each_array_2[$$index_2];
        $$renderer2.push(`<span style="display:inline-block;margin:0 0.35rem" class="svelte-1yyp529">· ${escape_html(f.source)}</span>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="sections-container svelte-1yyp529">`);
    if (isLoading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="sections-grid skeleton-grid svelte-1yyp529" aria-busy="true"><!--[-->`);
      const each_array_3 = ensure_array_like(Array(6));
      for (let i = 0, $$length = each_array_3.length; i < $$length; i++) {
        each_array_3[i];
        $$renderer2.push(`<div class="skeleton-card svelte-1yyp529"><div class="sk-thumb svelte-1yyp529"></div><div class="sk-line svelte-1yyp529"></div><div class="sk-line sk-short svelte-1yyp529"></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else if (!hasSearched) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="state-box empty-state svelte-1yyp529"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-1yyp529"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" class="svelte-1yyp529"></path></svg> <p class="empty-title svelte-1yyp529">${escape_html(t("common.search_empty_title"))}</p> <p class="empty-hint svelte-1yyp529">${escape_html(t("common.search_use_header"))}</p> <button type="button" class="btn btn-secondary svelte-1yyp529" style="margin-top:0.75rem">${escape_html(t("common.search_open_global"))}</button></div>`);
    } else if (items.length === 0) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="state-box empty-state svelte-1yyp529"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-1yyp529"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke-linecap="round" stroke-linejoin="round" class="svelte-1yyp529"></path></svg> <p class="svelte-1yyp529">${escape_html(t("common.search_no_results"))}</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="sections-grid svelte-1yyp529"><!--[-->`);
      const each_array_4 = ensure_array_like(items);
      for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
        let item = each_array_4[$$index_4];
        $$renderer2.push(`<div class="section-card svelte-1yyp529"><div class="card-thumbnail svelte-1yyp529">`);
        if (item.thumbnail) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<img${attr("src", item.thumbnail)}${attr("alt", item.name)} class="thumbnail-img svelte-1yyp529"/>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="thumbnail-placeholder svelte-1yyp529"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svelte-1yyp529"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" class="svelte-1yyp529"></path></svg></div>`);
        }
        $$renderer2.push(`<!--]--> <div class="level-badge svelte-1yyp529">${escape_html("Main")}</div></div> <div class="card-body svelte-1yyp529"><h3 class="card-title svelte-1yyp529">${html(highlightMatches(item.name, searchTokens))}</h3> <div class="card-meta svelte-1yyp529">`);
        if (item.order_index !== void 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="meta-item svelte-1yyp529"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon svelte-1yyp529"><path d="M4 6h16M4 12h16M4 18h7" class="svelte-1yyp529"></path></svg> Order: ${escape_html(item.order_index)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <span class="meta-item svelte-1yyp529"${attr_style(`color: ${stringify(item.is_listed ? "var(--color-primary-400)" : "var(--color-danger-400)")};`)}>${escape_html(item.is_listed ? t("common.listed") : t("common.unlisted"))}</span> `);
        if (item.main_section) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="meta-item meta-parent svelte-1yyp529"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon svelte-1yyp529"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" class="svelte-1yyp529"></path></svg> Main: ${escape_html(getMainSectionName(item.main_section))}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item.sub_section) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="meta-item meta-parent svelte-1yyp529"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon svelte-1yyp529"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" class="svelte-1yyp529"></path></svg> Sub: ${escape_html(getSubSectionName(item.sub_section))}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="card-footer svelte-1yyp529"><span class="card-date svelte-1yyp529">${escape_html(formatDate(item.created_at))}</span> <div class="card-actions svelte-1yyp529"><button class="action-btn edit svelte-1yyp529" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1yyp529"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" class="svelte-1yyp529"></path></svg></button> <button class="action-btn delete svelte-1yyp529" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1yyp529"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" class="svelte-1yyp529"></path></svg></button></div></div></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (totalPages > 1) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pagination svelte-1yyp529"><button class="page-btn svelte-1yyp529"${attr("disabled", currentPage === 1, true)}>← Previous</button> <div class="page-numbers svelte-1yyp529"><!--[-->`);
      const each_array_5 = ensure_array_like(Array.from({ length: totalPages }, (_, i) => i + 1));
      for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
        let p = each_array_5[$$index_5];
        if (p === 1 || p === totalPages || p >= currentPage - 1 && p <= currentPage + 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr_class("page-num svelte-1yyp529", void 0, { "active": p === currentPage })}>${escape_html(p)}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="page-ellipsis svelte-1yyp529">...</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> <button class="page-btn svelte-1yyp529"${attr("disabled", currentPage === totalPages, true)}>Next →</button></div>`);
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
    $$renderer2.push(`<!--]-->  `);
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
