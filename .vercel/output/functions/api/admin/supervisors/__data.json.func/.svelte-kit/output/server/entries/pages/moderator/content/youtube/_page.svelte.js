import { a2 as head, a4 as escape_html, a7 as ensure_array_like, a6 as attr, a8 as attr_class, a9 as stringify } from "../../../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/root.js";
import "../../../../../chunks/state.svelte.js";
import "../../../../../chunks/client.js";
import { l as listMyMainSections, b as listMyYoutubeVideos, g as getLastPartialFailures, p as pickEngagementStats } from "../../../../../chunks/moderator.js";
import { t } from "../../../../../chunks/store.svelte.js";
import { t as tokenize, h as html, a as highlightMatches } from "../../../../../chunks/search2.js";
import { E as EngagementBadge } from "../../../../../chunks/EngagementBadge.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let items = [];
    let totalCount = 0;
    let currentPage = 1;
    let filterMainSection = "";
    let filterSubSection = "";
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
      const hasActiveFilter = !!filterSubSection || filterIsListed !== "";
      if (!q && !hasActiveFilter) {
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
        const data = await listMyYoutubeVideos({
          search: q,
          main_section: filterMainSection || void 0,
          subsection: filterSubSection || void 0,
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
    async function fetchMainSectionsOptions() {
      try {
        const data = await listMyMainSections({ page: 1 });
        mainSectionsList = data.results;
      } catch {
      }
    }
    function handleMainFilterChange() {
      currentPage = 1;
      filterSubSection = "";
      fetchItems();
    }
    function handleFilterChange() {
      currentPage = 1;
      fetchItems();
    }
    function formatDate(d) {
      if (!d) return "—";
      return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    function extractYoutubeId(url) {
      if (!url) return null;
      const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
      return m ? m[1] : null;
    }
    head("bpd908", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("content.title"))} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-bpd908"><div class="page-header svelte-bpd908"><div class="svelte-bpd908"><h1 class="page-title svelte-bpd908">${escape_html(t("content.my_content"))}</h1> <p class="page-desc svelte-bpd908">${escape_html(t("content.my_content_desc"))}</p></div> <button class="btn btn-primary svelte-bpd908" id="create-content-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-bpd908"><path d="M12 5v14m-7-7h14" class="svelte-bpd908"></path></svg> ${escape_html(t("content.add_youtube"))}</button></div> <div class="tabs svelte-bpd908"><a href="/moderator/content/youtube" class="tab active svelte-bpd908">${escape_html(t("content.youtube_videos"))}</a> <a href="/moderator/content/files" class="tab svelte-bpd908">${escape_html(t("content.file_uploads"))}</a></div> <div class="toolbar svelte-bpd908">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    $$renderer2.select(
      {
        class: "filter-select",
        value: filterMainSection,
        onchange: handleMainFilterChange,
        onfocus: () => {
          if (mainSectionsList.length === 0) fetchMainSectionsOptions();
        }
      },
      ($$renderer3) => {
        $$renderer3.option(
          { value: "", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("content.all_main_sections"))}`);
          },
          "svelte-bpd908"
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
            "svelte-bpd908"
          );
        }
        $$renderer3.push(`<!--]-->`);
      },
      "svelte-bpd908"
    );
    $$renderer2.push(` `);
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
          "svelte-bpd908"
        );
        $$renderer3.option(
          { value: "true", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.listed"))}`);
          },
          "svelte-bpd908"
        );
        $$renderer3.option(
          { value: "false", class: "" },
          ($$renderer4) => {
            $$renderer4.push(`${escape_html(t("common.unlisted"))}`);
          },
          "svelte-bpd908"
        );
      },
      "svelte-bpd908"
    );
    $$renderer2.push(` <div class="count-badge svelte-bpd908">${escape_html(totalCount)} ${escape_html(t("common.total"))}</div></div> `);
    if (error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-error svelte-bpd908">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (partialFailures.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="alert alert-warning svelte-bpd908" style="margin-bottom:0.75rem">${escape_html(t("common.search_partial_warning"))} <!--[-->`);
      const each_array_2 = ensure_array_like(partialFailures);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let f = each_array_2[$$index_2];
        $$renderer2.push(`<span style="display:inline-block;margin:0 0.35rem" class="svelte-bpd908">· ${escape_html(f.source)}</span>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="content-container svelte-bpd908">`);
    if (isLoading) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="content-grid skeleton-grid svelte-bpd908" aria-busy="true"><!--[-->`);
      const each_array_3 = ensure_array_like(Array(6));
      for (let i = 0, $$length = each_array_3.length; i < $$length; i++) {
        each_array_3[i];
        $$renderer2.push(`<div class="skeleton-card svelte-bpd908"><div class="sk-thumb svelte-bpd908"></div><div class="sk-line svelte-bpd908"></div><div class="sk-line sk-short svelte-bpd908"></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else if (!hasSearched) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="state-box empty-state svelte-bpd908"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-bpd908"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" class="svelte-bpd908"></path></svg> <p class="empty-title svelte-bpd908">${escape_html(t("common.search_empty_title"))}</p> <p class="empty-hint svelte-bpd908">${escape_html(t("common.search_use_header"))}</p> <button type="button" class="btn btn-secondary svelte-bpd908" style="margin-top:0.75rem">${escape_html(t("common.search_open_global"))}</button></div>`);
    } else if (items.length === 0) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="state-box empty-state svelte-bpd908"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-bpd908"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" class="svelte-bpd908"></path><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" class="svelte-bpd908"></path></svg> <p class="svelte-bpd908">${escape_html(t("common.search_no_results"))}</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="content-grid svelte-bpd908"><!--[-->`);
      const each_array_4 = ensure_array_like(items);
      for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
        let item = each_array_4[$$index_4];
        const ytId = extractYoutubeId(item.video_url);
        $$renderer2.push(`<div class="content-card svelte-bpd908"><div class="card-thumbnail svelte-bpd908">`);
        if (item.metadata?.thumbnail) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<img${attr("src", item.metadata.thumbnail)}${attr("alt", item.metadata?.title)} class="thumbnail-img svelte-bpd908"/>`);
        } else if (ytId) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<img${attr("src", `https://img.youtube.com/vi/${stringify(ytId)}/mqdefault.jpg`)}${attr("alt", item.metadata?.title)} class="thumbnail-img svelte-bpd908"/>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="thumbnail-placeholder svelte-bpd908"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svelte-bpd908"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" class="svelte-bpd908"></path><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" class="svelte-bpd908"></path></svg></div>`);
        }
        $$renderer2.push(`<!--]--> <div class="type-badge svelte-bpd908">YouTube</div></div> <div class="card-body svelte-bpd908"><h3 class="card-title svelte-bpd908">${html(highlightMatches(item.metadata?.title || "Untitled", searchTokens))}</h3> `);
        if (item.metadata?.description) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="card-desc svelte-bpd908">${html(highlightMatches(item.metadata.description.slice(0, 80) + (item.metadata.description.length > 80 ? "..." : ""), searchTokens))}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        EngagementBadge($$renderer2, { stats: pickEngagementStats(item) });
        $$renderer2.push(`<!----> <div class="card-footer svelte-bpd908"><span class="card-date svelte-bpd908">${escape_html(formatDate(item.metadata?.created_at))}</span> <div class="card-actions svelte-bpd908"><button class="action-btn edit svelte-bpd908" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-bpd908"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" class="svelte-bpd908"></path></svg></button> <button class="action-btn delete svelte-bpd908" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-bpd908"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" class="svelte-bpd908"></path></svg></button></div></div> `);
        if (item.metadata?.author) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="meta-row svelte-bpd908"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon svelte-bpd908"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" class="svelte-bpd908"></path></svg> <span class="svelte-bpd908">${escape_html(item.metadata.author)}</span></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    if (totalPages > 1) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pagination svelte-bpd908"><button class="page-btn svelte-bpd908"${attr("disabled", currentPage === 1, true)}>← ${escape_html(t("common.previous"))}</button> <div class="page-numbers svelte-bpd908"><!--[-->`);
      const each_array_5 = ensure_array_like(Array.from({ length: totalPages }, (_, i) => i + 1));
      for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
        let p = each_array_5[$$index_5];
        if (p === 1 || p === totalPages || p >= currentPage - 1 && p <= currentPage + 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr_class("page-num svelte-bpd908", void 0, { "active": p === currentPage })}>${escape_html(p)}</button>`);
        } else if (p === currentPage - 2 || p === currentPage + 2) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="page-ellipsis svelte-bpd908">...</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div> <button class="page-btn svelte-bpd908"${attr("disabled", currentPage === totalPages, true)}>${escape_html(t("common.next"))} →</button></div>`);
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
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
