import { a2 as head } from "../../../../chunks/index2.js";
import { o as onDestroy } from "../../../../chunks/index-server.js";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    onDestroy(() => {
    });
    head("z3ojpo", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Crawl4AI — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page-container svelte-z3ojpo"><div class="page-header svelte-z3ojpo"><div><h1 class="page-title svelte-z3ojpo">Crawl4AI</h1> <p class="page-desc svelte-z3ojpo">تشغيل خدمة الزحف كعملية Python منفصلة، والتحكم بها من لوحة التحكم (للمالك فقط). تأكد من
				تشغيل السكربت داخل مجلد <code class="svelte-z3ojpo">crawl4ai_service</code> ومن ضبط <code class="svelte-z3ojpo">CRAWL4AI_SERVICE_URL</code> في ملف <code class="svelte-z3ojpo">.env</code> للوحة.</p></div></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="loading-state"><span class="spinner-lg"></span> <p>جاري التحميل…</p></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
