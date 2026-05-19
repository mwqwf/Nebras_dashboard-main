import { a8 as attr_class, a7 as ensure_array_like, a6 as attr, a4 as escape_html, ab as bind_props, a9 as stringify, a5 as getContext, ac as store_get, ad as unsubscribe_stores, a2 as head } from "../../../chunks/index2.js";
import "../../../chunks/auth.svelte.js";
import "firebase/auth";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
import { p as page$1 } from "../../../chunks/index3.js";
import { t, a as getLanguage } from "../../../chunks/store.svelte.js";
/* empty css                                                            */
import "clsx";
import { a as getMultiUploadState } from "../../../chunks/multiUpload.svelte.js";
import { h as html, a as highlightMatches } from "../../../chunks/search2.js";
function Sidebar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { isOpen = false } = $$props;
    let currentPath = page$1.url?.pathname || "";
    let displayName = "User";
    let userEmail = "";
    let menuItems = (() => {
      return [
        {
          label: t("common.dashboard"),
          href: "/moderator",
          icon: "dashboard"
        },
        {
          label: t("common.sections"),
          href: "/moderator/sections",
          icon: "sections"
        },
        {
          label: t("common.content"),
          href: "/moderator/content/files",
          icon: "content"
        },
        {
          label: t("content.multi_upload"),
          href: "/moderator/content/multi",
          icon: "multiUpload"
        },
        {
          label: "جلب من مكتبة نور",
          href: "/moderator/content/import-noor",
          icon: "noorImport"
        },
        {
          label: "استيراد أرشيف الإنترنت",
          href: "/admin/internet-archive",
          icon: "archiveImport"
        },
        {
          label: t("common.chat"),
          href: "/moderator/chat",
          icon: "chat"
        },
        ...[]
      ];
    })();
    function isActive(href) {
      if (!href) return false;
      if (href === "/moderator") {
        return currentPath === href;
      }
      return currentPath.startsWith(href);
    }
    function hasActiveChild(item) {
      if (!item.children) return false;
      return item.children.some((child) => isActive(child.href));
    }
    const icons = {
      dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
      stats: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      sections: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
      content: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
      multiUpload: "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M8 10l4-4 4 4M12 6v10",
      noorImport: "M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5zM9 7l3 3 3-3",
      archiveImport: "M4 7v13a2 2 0 002 2h12a2 2 0 002-2V7M4 7l2-3h12l2 3M4 7h16M9 11h6",
      chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
      supervisors: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 5.87v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m12-10a4 4 0 11-8 0 4 4 0 018 0z",
      crawl: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    };
    $$renderer2.push(`<aside${attr_class(`sidebar ${stringify(isOpen ? "open" : "")}`, "svelte-129hoe0")} id="sidebar"><div class="sidebar-top svelte-129hoe0"><a href="/moderator" class="app-brand svelte-129hoe0"><div class="brand-icon svelte-129hoe0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="svelte-129hoe0"><path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"></path></svg></div> <span class="brand-name svelte-129hoe0">Nebras</span></a></div> <nav class="sidebar-nav svelte-129hoe0" id="sidebar-nav"><!--[-->`);
    const each_array = ensure_array_like(menuItems);
    for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
      let item = each_array[$$index_1];
      if (item.children) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div${attr_class("nav-group svelte-129hoe0", void 0, { "active": hasActiveChild(item) })}><div class="nav-group-label svelte-129hoe0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon svelte-129hoe0"><path${attr("d", icons[item.icon])}></path></svg> <span>${escape_html(item.label)}</span></div> <div class="nav-children svelte-129hoe0"><!--[-->`);
        const each_array_1 = ensure_array_like(item.children);
        for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
          let child = each_array_1[$$index];
          $$renderer2.push(`<a${attr("href", child.href)}${attr_class("nav-child-link svelte-129hoe0", void 0, { "active": isActive(child.href) })}><span class="child-dot svelte-129hoe0"></span> <span>${escape_html(child.label)}</span></a>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<a${attr("href", item.href)}${attr_class("nav-link svelte-129hoe0", void 0, { "active": isActive(item.href) })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon svelte-129hoe0"><path${attr("d", icons[item.icon])}></path></svg> <span>${escape_html(item.label)}</span></a>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></nav> <div class="sidebar-bottom svelte-129hoe0"><div class="user-info svelte-129hoe0"><div class="avatar svelte-129hoe0">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<span class="avatar-letter svelte-129hoe0">${escape_html(displayName.charAt(0).toUpperCase())}</span>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="user-details svelte-129hoe0"><span class="user-name svelte-129hoe0">${escape_html(displayName)}</span> <span class="user-email svelte-129hoe0">${escape_html(userEmail)}</span></div></div> <button type="button" class="logout-btn svelte-129hoe0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-129hoe0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> <span>${escape_html(t("auth.logout"))}</span></button></div></aside>`);
    bind_props($$props, { isOpen });
  });
}
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function MultiUploadIndicator($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const multi = getMultiUploadState();
    multi.queue.length;
    multi.queue.filter((it) => it.status === "completed").length;
    multi.queue.find((it) => it.status === "uploading");
    multi.queue.filter((it) => it.status === "queued").length;
    store_get($$store_subs ??= {}, "$page", page).url?.pathname === "/moderator/content/multi";
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function DashboardLayout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children } = $$props;
    let searchQuery = "";
    let isSidebarOpen = false;
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="dashboard-layout svelte-b38hhi" id="dashboard-layout">`);
      Sidebar($$renderer3, {
        get isOpen() {
          return isSidebarOpen;
        },
        set isOpen($$value) {
          isSidebarOpen = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> `);
      if (isSidebarOpen) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="sidebar-overlay svelte-b38hhi"></div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> <div class="main-wrapper svelte-b38hhi"><header class="top-header svelte-b38hhi" id="top-header"><div class="header-left svelte-b38hhi"><button class="header-icon-btn hamburger-btn svelte-b38hhi" title="Open Sidebar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-b38hhi"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg></button> <form class="search-box svelte-b38hhi" role="search"><button type="submit" class="search-icon-btn svelte-b38hhi"${attr("aria-label", t("common.search_btn"))}${attr("title", t("common.search_btn"))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon svelte-b38hhi"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></button> <input type="text"${attr("placeholder", t("common.search_global_placeholder"))}${attr("value", searchQuery)} class="search-input svelte-b38hhi" id="search-input"/> `);
      {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--></form></div> <div class="header-right svelte-b38hhi"><button class="header-icon-btn lang-btn svelte-b38hhi" title="Change Language">${escape_html(getLanguage() === "ar" ? "EN" : "عربي")}</button> <button class="header-icon-btn svelte-b38hhi" id="notifications-btn" title="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-b38hhi"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg></button> <div class="header-user svelte-b38hhi"><div class="header-avatar svelte-b38hhi">`);
      {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push(`<span class="svelte-b38hhi">${escape_html("U".charAt(0).toUpperCase())}</span>`);
      }
      $$renderer3.push(`<!--]--></div></div></div></header> <main class="main-content svelte-b38hhi" id="main-content"><div class="content-inner animate-fade-in svelte-b38hhi">`);
      children($$renderer3);
      $$renderer3.push(`<!----></div></main></div> `);
      MultiUploadIndicator($$renderer3);
      $$renderer3.push(`<!----></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let query = "";
    let activeTab = "all";
    let partialFailures = [];
    let searchTokens = [];
    let sectionsResults = [];
    let filesResults = [];
    let videosResults = [];
    let counts = {
      sections: sectionsResults.length,
      files: filesResults.length,
      videos: videosResults.length,
      all: sectionsResults.length + filesResults.length + videosResults.length
    };
    function buildActionHref(action) {
      if (!action?.route) return "#";
      const url = new URL(action.route, store_get($$store_subs ??= {}, "$page", page).url.origin);
      for (const [key, value] of Object.entries(action.query || {})) {
        if (value !== void 0 && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
      return url.pathname + url.search;
    }
    function levelLabel(l) {
      if (l === "main") return t("sections.main_section");
      if (l === "sub") return t("sections.sub_section");
      return t("sections.secondary");
    }
    head("e12qt1", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("common.search_global_title"))} — Nebras</title>`);
      });
    });
    DashboardLayout($$renderer2, {
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="page svelte-e12qt1"><div class="page-header svelte-e12qt1"><div><h1 class="page-title svelte-e12qt1">${escape_html(t("common.search_global_title"))}</h1> <p class="page-desc svelte-e12qt1">${escape_html(t("common.search_global_desc"))}</p></div></div> <form class="search-form svelte-e12qt1"><div class="search-box svelte-e12qt1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon svelte-e12qt1"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> <input type="text"${attr("placeholder", t("common.search_global_placeholder"))}${attr("value", query)} class="search-input svelte-e12qt1" autofocus=""/> `);
        {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--></div> <button class="btn btn-primary svelte-e12qt1" type="submit"${attr("disabled", !String("").trim(), true)}>${escape_html(t("common.search_btn"))}</button></form> `);
        {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (partialFailures.length > 0) {
          $$renderer3.push("<!--[-->");
          $$renderer3.push(`<div class="alert alert-warning svelte-e12qt1">${escape_html(t("common.search_partial_warning"))} <!--[-->`);
          const each_array = ensure_array_like(partialFailures);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let f = each_array[$$index];
            $$renderer3.push(`<span style="display:inline-block;margin:0 0.35rem">· ${escape_html(f.source)}</span>`);
          }
          $$renderer3.push(`<!--]--></div>`);
        } else {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]--> <div class="tabs svelte-e12qt1"><button${attr_class("tab svelte-e12qt1", void 0, { "active": activeTab === "all" })}>${escape_html(t("common.all"))} (${escape_html(counts.all)})</button> <button${attr_class("tab svelte-e12qt1", void 0, { "active": activeTab === "sections" })}>${escape_html(t("common.sections"))} (${escape_html(counts.sections)})</button> <button${attr_class("tab svelte-e12qt1", void 0, { "active": activeTab === "files" })}>${escape_html(t("content.file_uploads"))} (${escape_html(counts.files)})</button> <button${attr_class("tab svelte-e12qt1", void 0, { "active": activeTab === "videos" })}>${escape_html(t("content.youtube_videos"))} (${escape_html(counts.videos)})</button></div> `);
        if (!String("").trim()) {
          $$renderer3.push("<!--[1-->");
          $$renderer3.push(`<div class="state-box empty-state svelte-e12qt1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-e12qt1"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round"></path></svg> <p class="empty-title svelte-e12qt1">${escape_html(t("common.search_empty_title"))}</p> <p class="empty-hint svelte-e12qt1">${escape_html(t("common.search_empty_hint"))}</p></div>`);
        } else if (counts.all === 0) {
          $$renderer3.push("<!--[2-->");
          $$renderer3.push(`<div class="state-box empty-state svelte-e12qt1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-e12qt1"><path d="M19 11H5" stroke-linecap="round" stroke-linejoin="round"></path></svg> <p>${escape_html(t("common.search_no_results"))}</p></div>`);
        } else {
          $$renderer3.push("<!--[!-->");
          if (sectionsResults.length > 0) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<h2 class="group-title svelte-e12qt1">${escape_html(t("common.sections"))} <span class="count-badge svelte-e12qt1">${escape_html(sectionsResults.length)}</span></h2> <div class="grid svelte-e12qt1"><!--[-->`);
            const each_array_1 = ensure_array_like(sectionsResults);
            for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
              let item = each_array_1[$$index_1];
              $$renderer3.push(`<div class="result-card svelte-e12qt1">`);
              if (item.thumbnail) {
                $$renderer3.push("<!--[-->");
                $$renderer3.push(`<img class="thumb svelte-e12qt1"${attr("src", item.thumbnail)}${attr("alt", item.name)}/>`);
              } else {
                $$renderer3.push("<!--[!-->");
              }
              $$renderer3.push(`<!--]--> <div class="body"><span class="chip svelte-e12qt1">${escape_html(levelLabel(item._level))}</span> <h3 class="title svelte-e12qt1">${html(highlightMatches(item.title || item.name, searchTokens))}</h3> <div class="meta svelte-e12qt1">#${escape_html(item.id)}</div> <div class="result-actions svelte-e12qt1"><a class="mini-btn svelte-e12qt1"${attr("href", buildActionHref(item.actions?.edit))}>${escape_html(t("common.edit"))}</a> <a class="mini-btn danger svelte-e12qt1"${attr("href", buildActionHref(item.actions?.delete))}>${escape_html(t("common.delete"))}</a></div></div></div>`);
            }
            $$renderer3.push(`<!--]--></div>`);
          } else {
            $$renderer3.push("<!--[!-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (filesResults.length > 0) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<h2 class="group-title svelte-e12qt1">${escape_html(t("content.file_uploads"))} <span class="count-badge svelte-e12qt1">${escape_html(filesResults.length)}</span></h2> <div class="grid svelte-e12qt1"><!--[-->`);
            const each_array_2 = ensure_array_like(filesResults);
            for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
              let item = each_array_2[$$index_2];
              $$renderer3.push(`<div class="result-card svelte-e12qt1">`);
              if (item.thumbnail) {
                $$renderer3.push("<!--[-->");
                $$renderer3.push(`<img class="thumb svelte-e12qt1"${attr("src", item.thumbnail)}${attr("alt", item.title)}/>`);
              } else {
                $$renderer3.push("<!--[!-->");
              }
              $$renderer3.push(`<!--]--> <div class="body"><span class="chip svelte-e12qt1">${escape_html(item.content_type || "file")}</span> <h3 class="title svelte-e12qt1">${html(highlightMatches(item.title || "Untitled", searchTokens))}</h3> `);
              if (item.description) {
                $$renderer3.push("<!--[-->");
                $$renderer3.push(`<p class="desc svelte-e12qt1">${html(highlightMatches(String(item.description).slice(0, 120), searchTokens))}</p>`);
              } else {
                $$renderer3.push("<!--[!-->");
              }
              $$renderer3.push(`<!--]--> <div class="result-actions svelte-e12qt1"><a class="mini-btn svelte-e12qt1"${attr("href", buildActionHref(item.actions?.edit))}>${escape_html(t("common.edit"))}</a> <a class="mini-btn danger svelte-e12qt1"${attr("href", buildActionHref(item.actions?.delete))}>${escape_html(t("common.delete"))}</a></div></div></div>`);
            }
            $$renderer3.push(`<!--]--></div>`);
          } else {
            $$renderer3.push("<!--[!-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (videosResults.length > 0) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<h2 class="group-title svelte-e12qt1">${escape_html(t("content.youtube_videos"))} <span class="count-badge svelte-e12qt1">${escape_html(videosResults.length)}</span></h2> <div class="grid svelte-e12qt1"><!--[-->`);
            const each_array_3 = ensure_array_like(videosResults);
            for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
              let item = each_array_3[$$index_3];
              $$renderer3.push(`<div class="result-card svelte-e12qt1">`);
              if (item.thumbnail) {
                $$renderer3.push("<!--[-->");
                $$renderer3.push(`<img class="thumb svelte-e12qt1"${attr("src", item.thumbnail)}${attr("alt", item.title)}/>`);
              } else {
                $$renderer3.push("<!--[!-->");
              }
              $$renderer3.push(`<!--]--> <div class="body"><span class="chip svelte-e12qt1">YouTube</span> <h3 class="title svelte-e12qt1">${html(highlightMatches(item.title || "Untitled", searchTokens))}</h3> <div class="result-actions svelte-e12qt1"><a class="mini-btn svelte-e12qt1"${attr("href", buildActionHref(item.actions?.edit))}>${escape_html(t("common.edit"))}</a> <a class="mini-btn danger svelte-e12qt1"${attr("href", buildActionHref(item.actions?.delete))}>${escape_html(t("common.delete"))}</a></div></div></div>`);
            }
            $$renderer3.push(`<!--]--></div>`);
          } else {
            $$renderer3.push("<!--[!-->");
          }
          $$renderer3.push(`<!--]-->`);
        }
        $$renderer3.push(`<!--]--></div>`);
      }
    });
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
