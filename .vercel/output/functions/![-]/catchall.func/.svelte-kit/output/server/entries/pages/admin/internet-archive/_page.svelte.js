import { a6 as attr, a4 as escape_html, a8 as attr_class, a9 as stringify } from "../../../../chunks/index2.js";
import { o as onDestroy } from "../../../../chunks/index-server.js";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let engine = (
      /** @type {any} */
      null
    );
    let busyAction = "";
    let diagBusy = false;
    onDestroy(() => {
    });
    const isEnabled = Boolean(engine?.config?.enabled);
    $$renderer2.push(`<div class="space-y-6 p-6" dir="rtl"><header class="space-y-1"><h1 class="text-2xl font-bold">إدارة المحرّك الآليّ</h1> <p class="text-sm text-gray-500">كلّ شيء آليّ. اضغط زرّ التشغيل التلقائي، وسيظهر محتوى في التطبيق خلال
			ثوانٍ — بدون أيّ تدخّل يدويّ. التطبيق لا يعلم بمصدر الجلب ولا توجد روابط
			خارجيّة.</p></header> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <section class="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">`);
    if (!isEnabled) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 class="text-lg font-semibold text-emerald-900">المحرّك جاهز للتشغيل التلقائي</h2> <p class="mt-1 text-sm text-emerald-800">سنُهيّء بذوراً افتراضيّة (كتب عربية / صوتيات / فيديو من مصادر مفتوحة)،
						نُفعّل المحرّك، ونطلق أوّل دورة فوراً. التصنيف يحدث آلياً والأقسام
						تُنشأ تلقائياً.</p></div> <button class="rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"${attr("disabled", busyAction === "bootstrap", true)}>${escape_html("▶ تشغيل تلقائي كامل")}</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"><div><div class="text-gray-500">الحالة</div> <div${attr_class(`text-base font-semibold ${stringify(isEnabled ? "text-emerald-700" : "text-gray-700")}`)}>${escape_html(isEnabled ? "يعمل آلياً" : "متوقّف")}</div></div> <div><div class="text-gray-500">مستورد</div> <div class="text-base font-semibold">${escape_html(0)}</div></div> <div><div class="text-gray-500">أقسام جديدة</div> <div class="text-base font-semibold">${escape_html(0)}</div></div> <div><div class="text-gray-500">آخر دورة</div> <div class="text-base font-semibold">${escape_html("—")}</div></div> <div><div class="text-gray-500">البذرة الحاليّة</div> <div class="text-sm">${escape_html("—")}</div></div> <div><div class="text-gray-500">قيد التنفيذ</div> <div class="text-sm">${escape_html("لا")}</div></div> <div><div class="text-gray-500">تخطّى</div> <div class="text-sm">${escape_html(0)}</div></div> <div><div class="text-gray-500">فشل</div> <div class="text-sm">${escape_html(0)}</div></div></div> <div class="mt-4 flex flex-wrap gap-2">`);
      if (isEnabled) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<button class="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"${attr("disabled", busyAction === "stop", true)}>إيقاف</button>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<button class="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"${attr("disabled", busyAction === "start", true)}>تشغيل</button>`);
      }
      $$renderer2.push(`<!--]--> <button class="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"${attr("disabled", busyAction === "tick", true)}>جلب دفعة الآن</button> <button class="rounded bg-purple-600 px-3 py-1 text-sm text-white disabled:opacity-50"${attr("disabled", diagBusy, true)}>${escape_html("فحص النظام")}</button> <button class="rounded bg-gray-200 px-3 py-1 text-sm disabled:opacity-50"${attr("disabled", busyAction === "reset-cursor", true)}>إعادة المؤشّر</button> <button class="rounded bg-orange-700 px-3 py-1 text-sm text-white disabled:opacity-50"${attr("disabled", busyAction === "factory", true)}>إعادة ضبط المصنع</button></div>`);
    }
    $$renderer2.push(`<!--]--></section> `);
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
    $$renderer2.push(`<!--]--> <section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"><button class="flex w-full items-center justify-between text-sm font-semibold text-gray-700"><span>إعدادات متقدّمة</span> <span>${escape_html("+")}</span></button> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></section></div>`);
  });
}
export {
  _page as default
};
