import { a2 as head, a6 as attr, a4 as escape_html } from "../../../chunks/index2.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
import "../../../chunks/client.js";
import "../../../chunks/auth.svelte.js";
import "firebase/auth";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import { t, g as getDir, a as getLanguage } from "../../../chunks/store.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let dir = getDir();
    let lang = getLanguage();
    onDestroy(() => {
    });
    head("1x05zx6", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Nebras — ${escape_html(t("auth.login_title"))}</title>`);
      });
    });
    $$renderer2.push(`<div class="login-shell svelte-1x05zx6"${attr("dir", dir)}><button type="button" class="lang-pill svelte-1x05zx6">${escape_html(lang === "ar" ? "EN" : "عربي")}</button> <div class="card svelte-1x05zx6">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="logo-wrap svelte-1x05zx6"><div class="logo svelte-1x05zx6"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" class="svelte-1x05zx6"><path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"></path></svg></div></div> <h1 class="greeting svelte-1x05zx6">${escape_html(t("auth.greeting"))}</h1> <h2 class="title svelte-1x05zx6">${escape_html(t("auth.welcome_title"))}</h2> <p class="subtitle svelte-1x05zx6">${escape_html(t("auth.welcome_subtitle"))}</p> <div class="actions svelte-1x05zx6"><button type="button" class="btn btn-primary svelte-1x05zx6"><svg class="btn-icon svelte-1x05zx6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg> <span>${escape_html(t("auth.create_account"))}</span></button> <button type="button" class="btn btn-secondary svelte-1x05zx6"><svg class="btn-icon svelte-1x05zx6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg> <span>${escape_html(t("auth.sign_in"))}</span></button></div> <p class="footer-note svelte-1x05zx6">${escape_html(t("auth.google_hint"))}</p>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
