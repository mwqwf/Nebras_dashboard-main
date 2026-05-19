import { a2 as head, a4 as escape_html, a8 as attr_class, a7 as ensure_array_like, a6 as attr } from "../../../../chunks/index2.js";
import { o as onDestroy } from "../../../../chunks/index-server.js";
import "../../../../chunks/auth.svelte.js";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
import { t } from "../../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let messages = [];
    let messageText = "";
    let isConnected = false;
    let pendingFiles = [];
    onDestroy(() => {
    });
    function isImage(file) {
      const ext = (file.url || file.file || "").toLowerCase();
      return ext.match(/\.(jpg|jpeg|png|gif|webp|svg)/) || (file.type || "").startsWith("image/");
    }
    function fileName(url) {
      if (!url) return "File";
      return decodeURIComponent(url.split("/").pop().split("?")[0]);
    }
    function formatTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }
    function formatDate(ts) {
      if (!ts) return "";
      return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    }
    function shouldShowDate(idx) {
      if (idx === 0) return true;
      const curr = new Date(messages[idx].timestamp).toDateString();
      const prev = new Date(messages[idx - 1].timestamp).toDateString();
      return curr !== prev;
    }
    let currentUser = "";
    pendingFiles.length === 0 || pendingFiles.every((f) => f.id || f.error);
    head("iur5wb", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(t("chat.title"))} — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="chat-page svelte-iur5wb"><div class="chat-header svelte-iur5wb"><div class="chat-header-left svelte-iur5wb"><h1 class="chat-title svelte-iur5wb">${escape_html(t("chat.title"))}</h1> <span${attr_class("chat-status svelte-iur5wb", void 0, { "online": isConnected })}><span class="status-dot svelte-iur5wb"></span> ${escape_html(t("chat.connecting"))}</span></div> <span class="chat-members svelte-iur5wb">${escape_html(new Set(messages.map((m) => m.username)).size)} ${escape_html(t("chat.participants"))}</span></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="messages-container svelte-iur5wb">`);
    if (messages.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="empty-chat svelte-iur5wb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon svelte-iur5wb"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke-linecap="round" stroke-linejoin="round"></path></svg> <p>${escape_html(t("chat.no_messages_yet"))}</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(messages);
      for (let idx = 0, $$length = each_array.length; idx < $$length; idx++) {
        let msg = each_array[idx];
        const isMe = msg.username === currentUser;
        if (shouldShowDate(idx)) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="date-divider svelte-iur5wb"><span class="svelte-iur5wb">${escape_html(formatDate(msg.timestamp))}</span></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <div${attr_class("msg svelte-iur5wb", void 0, { "msg-me": isMe, "msg-other": !isMe })}>`);
        if (!isMe) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="msg-avatar svelte-iur5wb">${escape_html(msg.username?.charAt(0).toUpperCase())}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <div class="msg-bubble svelte-iur5wb">`);
        if (!isMe) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="msg-sender svelte-iur5wb">${escape_html(msg.username)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (msg.message) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="msg-text svelte-iur5wb">${escape_html(msg.message)}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (msg.files?.length > 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="msg-files svelte-iur5wb"><!--[-->`);
          const each_array_1 = ensure_array_like(msg.files);
          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
            let file = each_array_1[$$index];
            if (isImage(file)) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<a${attr("href", file.url || file.file)} target="_blank" rel="noopener" class="msg-image-link svelte-iur5wb"><img${attr("src", file.url || file.file)} alt="Attachment" class="msg-image svelte-iur5wb" loading="lazy"/></a>`);
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push(`<a${attr("href", file.url || file.file)} target="_blank" rel="noopener" class="msg-file-chip svelte-iur5wb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-chip-icon svelte-iur5wb"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke-linecap="round" stroke-linejoin="round"></path></svg> <span>${escape_html(fileName(file.url || file.file))}</span></a>`);
            }
            $$renderer2.push(`<!--]-->`);
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <span class="msg-time svelte-iur5wb">${escape_html(formatTime(msg.timestamp))}</span></div></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--> <div></div></div> `);
    if (pendingFiles.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="pending-bar svelte-iur5wb"><!--[-->`);
      const each_array_2 = ensure_array_like(pendingFiles);
      for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
        let pf = each_array_2[i];
        $$renderer2.push(`<div${attr_class("pending-chip svelte-iur5wb", void 0, { "pending-error": pf.error })}>`);
        if (pf.uploading) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="spinner-xs svelte-iur5wb"></span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <span class="pending-name svelte-iur5wb">${escape_html(pf.file.name)}</span> `);
        if (pf.error) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="pending-err svelte-iur5wb">Failed</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (pf.id) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="pending-ok svelte-iur5wb">✓</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <button class="pending-remove svelte-iur5wb">×</button></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="input-area svelte-iur5wb"><button class="attach-btn svelte-iur5wb" title="Attach file"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-iur5wb"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path></svg></button> <input type="file" class="file-input-hidden svelte-iur5wb" multiple=""/> <textarea class="msg-input svelte-iur5wb"${attr("placeholder", t("chat.type_message"))} rows="1">`);
    const $$body = escape_html(messageText);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea> <button class="send-btn svelte-iur5wb" aria-label="Send"${attr("disabled", !messageText.trim() && pendingFiles.filter((f) => f.id).length === 0 || !isConnected, true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svelte-iur5wb"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button></div></div>`);
  });
}
export {
  _page as default
};
