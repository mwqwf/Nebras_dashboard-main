import { a2 as head, a4 as escape_html, a6 as attr, a8 as attr_class, aa as attr_style, a7 as ensure_array_like, a9 as stringify } from "../../../../../chunks/index2.js";
import { f as formatFileSize, m as mimeToContentType } from "../../../../../chunks/fileUpload.js";
import * as pdfjs from "pdfjs-dist";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
import { g as getItemProgress, a as getMultiUploadState, s as setConcurrency, D as DEFAULT_CONCURRENCY } from "../../../../../chunks/multiUpload.svelte.js";
import { t } from "../../../../../chunks/store.svelte.js";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const multi = getMultiUploadState();
    let pageTab = "files";
    let dragReorderFrom = null;
    let completedCount = multi.queue.filter((it) => it.status === "completed").length;
    let totalCount = multi.queue.length;
    let hasQueue = multi.queue.length > 0;
    let canStart = multi.queue.some((it) => it.status === "queued" || it.status === "failed");
    function handleConcurrencyChange(e) {
      setConcurrency(Number(e.target.value));
    }
    function statusLabel(status) {
      if (status === "uploading") return t("content.item_active");
      if (status === "committing") return t("content.item_committing");
      if (status === "completed") return t("content.item_done");
      if (status === "failed") return t("content.item_error");
      return t("content.item_queued");
    }
    function iconFor(mime) {
      const ct = mimeToContentType(mime);
      if (ct === "video") return "🎬";
      if (ct === "audio") return "🎵";
      return "📄";
    }
    head("hot9rw", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("content.multi_upload_title"))} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-hot9rw"><div class="page-header svelte-hot9rw"><div><h1 class="page-title svelte-hot9rw">${escape_html(t("content.multi_upload_title"))}</h1> <p class="page-desc svelte-hot9rw">${escape_html(t("content.multi_upload_desc"))}</p></div> <div class="header-actions svelte-hot9rw">`);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<label class="concurrency-picker svelte-hot9rw"${attr("title", t("content.concurrency_label"))}><span class="concurrency-label svelte-hot9rw">${escape_html(t("content.parallel_hint"))}</span> `);
      $$renderer2.select(
        {
          class: "concurrency-select",
          value: multi.concurrency || DEFAULT_CONCURRENCY,
          onchange: handleConcurrencyChange,
          disabled: multi.isUploading
        },
        ($$renderer3) => {
          $$renderer3.option({ value: 1 }, ($$renderer4) => {
            $$renderer4.push(`1`);
          });
          $$renderer3.option({ value: 2 }, ($$renderer4) => {
            $$renderer4.push(`2`);
          });
          $$renderer3.option({ value: 3 }, ($$renderer4) => {
            $$renderer4.push(`3`);
          });
          $$renderer3.option({ value: 4 }, ($$renderer4) => {
            $$renderer4.push(`4`);
          });
          $$renderer3.option({ value: 5 }, ($$renderer4) => {
            $$renderer4.push(`5`);
          });
        },
        "svelte-hot9rw"
      );
      $$renderer2.push(`</label>`);
    }
    $$renderer2.push(`<!--]--> <button class="btn btn-secondary svelte-hot9rw"${attr("disabled", !hasQueue, true)}>${escape_html(t("content.reset_queue"))}</button> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="btn btn-primary svelte-hot9rw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-hot9rw"><path d="M12 5v14m-7-7h14"></path></svg> ${escape_html(t("content.add_to_queue_multi"))}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="tabs svelte-hot9rw"><a href="/moderator/content/youtube" class="tab svelte-hot9rw">${escape_html(t("content.youtube_videos"))}</a> <a href="/moderator/content/files" class="tab svelte-hot9rw">${escape_html(t("content.file_uploads"))}</a> <a href="/moderator/content/multi" class="tab active svelte-hot9rw">${escape_html(t("content.multi_upload"))}</a></div> <div class="mode-tabs svelte-hot9rw" role="tablist"><button type="button"${attr_class("mode-tab svelte-hot9rw", void 0, { "active": pageTab === "files" })} role="tab"${attr("aria-selected", pageTab === "files")}>${escape_html(t("content.multi_tab_files"))}</button> <button type="button"${attr_class("mode-tab svelte-hot9rw", void 0, { "active": pageTab === "youtube" })} role="tab"${attr("aria-selected", pageTab === "youtube")}>${escape_html(t("content.multi_tab_youtube"))}</button></div> <div class="summary-strip svelte-hot9rw"><div class="summary-left svelte-hot9rw"><span class="summary-count svelte-hot9rw">${escape_html(totalCount)}</span> <span class="summary-label svelte-hot9rw">${escape_html(t("content.files_in_queue"))}</span></div> <div class="summary-progress svelte-hot9rw"><div class="summary-bar-track svelte-hot9rw"><div class="summary-bar-fill svelte-hot9rw"${attr_style(`width: ${stringify(totalCount > 0 ? completedCount / totalCount * 100 : 0)}%`)}></div></div> <span class="summary-numbers svelte-hot9rw">${escape_html(completedCount)} ${escape_html(t("content.summary_of"))} ${escape_html(totalCount)} ${escape_html(t("content.summary_done"))}</span></div> <div class="summary-actions svelte-hot9rw">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<button class="btn btn-secondary svelte-hot9rw"${attr("disabled", !completedCount, true)}>${escape_html(t("content.clear_completed"))}</button> <button class="btn btn-primary svelte-hot9rw"${attr("disabled", !canStart, true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon svelte-hot9rw"><path d="M5 3l14 9-14 9V3z"></path></svg> ${escape_html(t("content.start_all"))}</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="hints svelte-hot9rw"><p class="hint-note svelte-hot9rw">${escape_html(t("content.upload_order_note"))}</p> <p class="hint-note hint-info svelte-hot9rw">• ${escape_html(t("content.upload_commit_order_note"))}</p> <p class="hint-note hint-info svelte-hot9rw">• ${escape_html(t("content.remove_during_upload_hint"))}</p> <p class="hint-note hint-info svelte-hot9rw">• ${escape_html(t("content.background_hint"))}</p> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="hint-note hint-info svelte-hot9rw">• ${escape_html(t("content.drag_reorder_hint"))}</p>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="queue-container svelte-hot9rw">`);
    if (!hasQueue) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="empty-state svelte-hot9rw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-hot9rw"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" stroke-linecap="round" stroke-linejoin="round"></path></svg> <p>${escape_html(t("content.queue_empty"))}</p> `);
      {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<button class="btn btn-primary btn-sm svelte-hot9rw">${escape_html(t("content.add_to_queue_multi"))}</button>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="queue-list svelte-hot9rw"><!--[-->`);
      const each_array_3 = ensure_array_like(multi.queue);
      for (let idx = 0, $$length = each_array_3.length; idx < $$length; idx++) {
        let item = each_array_3[idx];
        const pct = getItemProgress(item.id);
        $$renderer2.push(`<li${attr_class("queue-item svelte-hot9rw", void 0, {
          "is-active": item.status === "uploading" || item.status === "committing",
          "is-completed": item.status === "completed",
          "is-failed": item.status === "failed",
          "is-dragging": dragReorderFrom === idx
        })}${attr("draggable", item.status !== "uploading" && item.status !== "committing")}><div class="queue-order svelte-hot9rw">${escape_html(idx + 1)}</div> `);
        if (item.thumbnailPreview) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<img class="queue-thumb svelte-hot9rw"${attr("src", item.thumbnailPreview)} alt=""/>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="queue-thumb queue-thumb-fallback svelte-hot9rw">${escape_html(iconFor(item.file.type))}</div>`);
        }
        $$renderer2.push(`<!--]--> <div class="queue-main svelte-hot9rw"><div class="queue-title-row svelte-hot9rw"><span class="queue-title svelte-hot9rw">${escape_html(item.form.title)}</span> <span${attr_class(`queue-chip queue-chip-${stringify(item.status)}`, "svelte-hot9rw")}>${escape_html(statusLabel(item.status))}</span></div> <div class="queue-meta-row svelte-hot9rw"><span class="queue-filename svelte-hot9rw">${escape_html(item.file.name)}</span> <span class="queue-dot svelte-hot9rw">•</span> <span class="queue-size">${escape_html(formatFileSize(item.file.size))}</span> <span class="queue-dot svelte-hot9rw">•</span> <span class="queue-section-chain svelte-hot9rw">${escape_html(item.labels.main)} `);
        if (item.labels.sub) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`› ${escape_html(item.labels.sub)}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item.labels.secondary) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`› ${escape_html(item.labels.secondary)}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></span></div> `);
        if (item.status === "uploading" || item.status === "committing" || item.status === "completed" && pct > 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="queue-progress svelte-hot9rw"><div class="queue-progress-track svelte-hot9rw"><div class="queue-progress-fill svelte-hot9rw"${attr_style(`width: ${stringify(pct)}%`)}></div></div> <span class="queue-progress-pct svelte-hot9rw">${escape_html(pct)}%</span></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item.error) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="queue-error svelte-hot9rw">${escape_html(item.error)}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="queue-actions svelte-hot9rw"><button class="icon-btn svelte-hot9rw"${attr("title", t("content.move_up"))}${attr("disabled", item.status === "uploading" || item.status === "committing" || idx === 0, true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-hot9rw"><path d="M18 15l-6-6-6 6"></path></svg></button> <button class="icon-btn svelte-hot9rw"${attr("title", t("content.move_down"))}${attr("disabled", item.status === "uploading" || item.status === "committing" || idx === multi.queue.length - 1, true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-hot9rw"><path d="M6 9l6 6 6-6"></path></svg></button> <button class="icon-btn edit svelte-hot9rw"${attr("title", t("content.edit_item"))}${attr("disabled", item.status === "uploading" || item.status === "completed", true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-hot9rw"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button> <button class="icon-btn delete svelte-hot9rw"${attr("title", t("content.remove_from_queue"))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-hot9rw"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
