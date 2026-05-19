import { a2 as head, a4 as escape_html, a7 as ensure_array_like, a6 as attr, a8 as attr_class, aa as attr_style, a9 as stringify } from "../../../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/root.js";
import "../../../../../chunks/state.svelte.js";
import "../../../../../chunks/client.js";
import { l as listMyMainSections, a as listMyFiles, g as getLastPartialFailures } from "../../../../../chunks/moderator.js";
import { f as formatFileSize } from "../../../../../chunks/fileUpload.js";
import { t } from "../../../../../chunks/store.svelte.js";
import { t as tokenize, h as html, a as highlightMatches } from "../../../../../chunks/search2.js";
import { E as EngagementBadge } from "../../../../../chunks/EngagementBadge.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let items = [];
    let totalCount = 0;
    let currentPage = 1;
    let filterMainSection = "";
    let filterContentType = "";
    let filterIsListed = "";
    let isLoading = false;
    let hasSearched = false;
    let error = "";
    let mainSectionsList = [];
    let searchTokens = [];
    let partialFailures = [];
    const PAGE_SIZE = 10;
    let totalPages = Math.ceil(totalCount / PAGE_SIZE);
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
        const data = await listMyFiles({
          search: q,
          main_section: filterMainSection || void 0,
          content_type: filterContentType || void 0,
          metadata__is_listed: filterIsListed === "" ? void 0 : filterIsListed === "true",
          page: currentPage,
          requireSearch: true
        });
        items = data.results;
        totalCount = data.count;
        partialFailures = getLastPartialFailures();
      } catch (err) {
        error = err.message;
      } finally {
        isLoading = false;
      }
    }
    async function fetchMainOptions() {
      try {
        const d = await listMyMainSections({ page: 1 });
        mainSectionsList = d.results;
      } catch {
      }
    }
    function handleFilterChange() {
      currentPage = 1;
      fetchItems();
    }
    function formatDate(d) {
      if (!d) return "—";
      return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    function statusColor(s) {
      if (s === "completed") return "status-completed";
      if (s === "failed") return "status-failed";
      return "status-pending";
    }
    function contentTypeIcon(ct) {
      if (ct === "video") return "🎬";
      if (ct === "audio") return "🎵";
      return "📄";
    }
    head("1f19htq", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("content.title"))} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-1f19htq"><div class="page-header svelte-1f19htq"><div class="svelte-1f19htq"><h1 class="page-title svelte-1f19htq">${escape_html(t("content.my_content"))}</h1><p class="page-desc svelte-1f19htq">${escape_html(t("content.my_content_desc"))}</p></div> <button class="btn btn-primary svelte-1f19htq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-1f19htq"><path d="M12 5v14m-7-7h14" class="svelte-1f19htq"></path></svg> ${escape_html(t("content.upload_file"))}</button></div> <div class="tabs svelte-1f19htq"><a href="/moderator/content/youtube" class="tab svelte-1f19htq">${escape_html(t("content.youtube_videos"))}</a> <a href="/moderator/content/files" class="tab active svelte-1f19htq">${escape_html(t("content.file_uploads"))}</a></div> <div class="toolbar svelte-1f19htq">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterContentType,
        onchange: handleFilterChange
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("content.all_types"))}`);
          },
          "svelte-1f19htq"
        );
        $$renderer3.option(
          { value: "video", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("content.video"))}`);
          },
          "svelte-1f19htq"
        );
        $$renderer3.option(
          { value: "audio", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("content.audio"))}`);
          },
          "svelte-1f19htq"
        );
        $$renderer3.option(
          { value: "document", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("content.document"))}`);
          },
          "svelte-1f19htq"
        );
      },
      "svelte-1f19htq"
    );
    $$renderer2.push(` `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterMainSection,
        onchange: handleFilterChange,
        onfocus: () => {
          if (mainSectionsList.length === 0) fetchMainOptions();
        }
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("content.all_sections"))}`);
          },
          "svelte-1f19htq"
        );
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(mainSectionsList);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let ms = each_array[$$index];
          $$renderer3.option(
            { value: ms.id, class: "" },
            ($$renderer4) => {
              $$renderer4.push(`${escape_html(ms.name)}`);
            },
            "svelte-1f19htq"
          );
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-1f19htq"
    );
    $$renderer2.push(` `);
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
          "svelte-1f19htq"
        );
        $$renderer3.option(
          { value: "true", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.listed"))}`);
          },
          "svelte-1f19htq"
        );
        $$renderer3.option(
          { value: "false", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.unlisted"))}`);
          },
          "svelte-1f19htq"
        );
      },
      "svelte-1f19htq"
    );
    $$renderer2.push(` <div class="count-badge svelte-1f19htq">${escape_html(totalCount)} ${escape_html(t("common.total"))}</div></div> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-error svelte-1f19htq">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (partialFailures.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-warning svelte-1f19htq" style="margin-bottom:0.75rem">${escape_html(t("common.search_partial_warning"))} <!--[-->`);
      const each_array_1 = ensure_array_like(partialFailures);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let f = each_array_1[$$index_1];
        $$renderer2.push(`<span style="display:inline-block;margin:0 0.35rem" class="svelte-1f19htq">· ${escape_html(f.source)}</span>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="content-container svelte-1f19htq">`);
    if (isLoading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="file-list skeleton-list svelte-1f19htq" aria-busy="true"><!--[-->`);
      const each_array_2 = ensure_array_like(Array(6));
      for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
        each_array_2[i];
        $$renderer2.push(`<div class="skeleton-row svelte-1f19htq"><div class="sk-line svelte-1f19htq"></div><div class="sk-line sk-short svelte-1f19htq"></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else if (!hasSearched) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="state-box empty-state svelte-1f19htq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-1f19htq"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" class="svelte-1f19htq"></path></svg> <p class="empty-title svelte-1f19htq">${escape_html(t("common.search_empty_title"))}</p> <p class="empty-hint svelte-1f19htq">${escape_html(t("common.search_use_header"))}</p> <button type="button" class="btn btn-secondary svelte-1f19htq" style="margin-top:0.75rem">${escape_html(t("common.search_open_global"))}</button></div>`);
    } else if (items.length === 0) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="state-box empty-state svelte-1f19htq"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-1f19htq"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" stroke-linecap="round" stroke-linejoin="round" class="svelte-1f19htq"></path></svg> <p class="svelte-1f19htq">${escape_html(t("common.search_no_results"))}</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="file-list svelte-1f19htq"><!--[-->`);
      const each_array_3 = ensure_array_like(items);
      for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
        let item = each_array_3[$$index_3];
        $$renderer2.push(`<div${attr_class("file-row svelte-1f19htq", void 0, { "file-row-pending": item.upload_status === "pending" })}><div class="file-icon svelte-1f19htq">${escape_html(contentTypeIcon(item.metadata?.content_type))}</div> <div class="file-info svelte-1f19htq"><span class="file-name svelte-1f19htq">${html(highlightMatches(item.metadata?.title || item.filename || "Untitled", searchTokens))}</span> <span class="file-meta svelte-1f19htq"${attr_style(`color: ${stringify(item.metadata?.is_listed === false ? "var(--color-danger-400)" : "inherit")};`)}>${escape_html(item.metadata?.is_listed === false ? t("common.unlisted") : `${item.file_type} · ${formatFileSize(item.file_size)}`)}</span> `);
        EngagementBadge($$renderer2, { stats: item.engagement });
        $$renderer2.push(`<!----></div> <span${attr_class(`file-status ${stringify(statusColor(item.upload_status))}`, "svelte-1f19htq")}>${escape_html(item.upload_status)}</span> <span class="file-date svelte-1f19htq">${escape_html(formatDate(item.metadata?.created_at))}</span> <div class="file-actions svelte-1f19htq" role="presentation"><button class="action-btn edit svelte-1f19htq" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1f19htq"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" class="svelte-1f19htq"></path></svg></button> <button class="action-btn delete svelte-1f19htq" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-1f19htq"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" class="svelte-1f19htq"></path></svg></button></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (totalPages > 1) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pagination svelte-1f19htq"><button class="page-btn svelte-1f19htq"${attr("disabled", currentPage === 1, true)}>← ${escape_html(t("common.previous"))}</button> <div class="page-numbers svelte-1f19htq"><!--[-->`);
      const each_array_4 = ensure_array_like(Array.from({ length: totalPages }, (_, i) => i + 1));
      for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
        let p = each_array_4[$$index_4];
        if (p === 1 || p === totalPages || p >= currentPage - 1 && p <= currentPage + 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr_class("page-num svelte-1f19htq", void 0, { "active": p === currentPage })}>${escape_html(p)}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="page-ellipsis svelte-1f19htq">...</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> <button class="page-btn svelte-1f19htq"${attr("disabled", currentPage === totalPages, true)}>${escape_html(t("common.next"))} →</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
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
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
