import { a2 as head, a6 as attr, a8 as attr_class, a4 as escape_html, a7 as ensure_array_like, a9 as stringify } from "../../../../../chunks/index2.js";
import { o as onDestroy } from "../../../../../chunks/index-server.js";
import "firebase/app";
import "firebase/analytics";
import "firebase/database";
import "firebase/firestore";
import "firebase/storage";
import "firebase/auth";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let isLoading = true;
    let isSavingSeeds = false;
    let isResettingCursor = false;
    let seedsText = "";
    let stats = {
      totalFetched: 0,
      sectionsCreated: 0,
      runsCount: 0,
      lastRunAt: null,
      lastError: null
    };
    let cursor = { seedIndex: 0, page: 1 };
    let log = [];
    let engineActive = false;
    let metaChipVariant = "off";
    onDestroy(() => {
    });
    function formatDate(ts) {
      if (!ts) return "—";
      try {
        return new Date(Number(ts)).toLocaleString("ar", {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
      } catch {
        return "—";
      }
    }
    function relativeTime(ts) {
      if (!ts) return "لم يحدث بعد";
      const diff = Date.now() - Number(ts);
      if (diff < 0) return formatDate(ts);
      if (diff < 5e3) return "الآن";
      if (diff < 6e4) return `منذ ${Math.floor(diff / 1e3)} ث`;
      if (diff < 36e5) return `منذ ${Math.floor(diff / 6e4)} د`;
      if (diff < 864e5) return `منذ ${Math.floor(diff / 36e5)} س`;
      return formatDate(ts);
    }
    function logIcon(level) {
      if (level === "success") return "✓";
      if (level === "error") return "✕";
      return "ℹ";
    }
    function logLevelClass(level) {
      if (level === "success") return "log-success";
      if (level === "error") return "log-error";
      return "log-info";
    }
    head("1l68qrj", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>محرّك جلب مكتبة نور — Nebras</title>`);
      });
    });
    $$renderer2.push(`<div class="page svelte-1l68qrj"><header class="page-header svelte-1l68qrj"><div class="svelte-1l68qrj"><h1 class="page-title svelte-1l68qrj">محرّك الجلب الآلي — مكتبة نور</h1> <p class="page-desc svelte-1l68qrj">محرّك مستقلّ يتصفّح أقسام مكتبة نور في الخلفية، يصنّف الكتب آليّاً،
				ويرفعها مباشرةً إلى قاعدة بيانات نبراس مع إنشاء أقسام جديدة عند الحاجة.
				بمجرّد التشغيل، الدورات تتجدّد تلقائياً إلى ما لا نهاية ولا تتوقّف
				إلا حين تضغط زرّ الإيقاف. عند الفشل المتتالي يُطبَّق back-off (تباطؤ
				الفترة بين الدورات) دون إيقاف المحرّك.</p></div> <div class="header-meta svelte-1l68qrj"><span class="meta-chip svelte-1l68qrj"${attr("data-variant", metaChipVariant)}><span class="dot svelte-1l68qrj"></span> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`الحلقة الداخليّة متوقّفة`);
    }
    $$renderer2.push(`<!--]--></span></div></header> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <section${attr_class("card master-card svelte-1l68qrj", void 0, { "active": engineActive })}><div class="master-row svelte-1l68qrj"><div class="master-info svelte-1l68qrj"><div class="master-status svelte-1l68qrj"><span${attr_class("status-pulse svelte-1l68qrj", void 0, { "on": engineActive })}></span> <span class="status-text svelte-1l68qrj">${escape_html("المحرّك متوقّف")}</span></div> <div class="master-meta svelte-1l68qrj">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`جارِ تحميل الإعدادات...`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="master-actions svelte-1l68qrj"><button${attr_class(`btn btn-master ${stringify("btn-start")}`, "svelte-1l68qrj")}${attr("disabled", isLoading, true)}>`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<span class="btn-icon svelte-1l68qrj">▶</span> تشغيل المحرّك`);
    }
    $$renderer2.push(`<!--]--></button></div></div></section> <div class="stats-grid svelte-1l68qrj"><div class="stat-card svelte-1l68qrj"><div class="stat-label svelte-1l68qrj">إجمالي الكتب المُجلَبة</div> <div class="stat-value primary svelte-1l68qrj">${escape_html(stats.totalFetched.toLocaleString("ar"))}</div> <div class="stat-sub svelte-1l68qrj">منذ بدء المحرّك</div></div> <div class="stat-card svelte-1l68qrj"><div class="stat-label svelte-1l68qrj">الأقسام الجديدة المُنشَأة</div> <div class="stat-value accent svelte-1l68qrj">${escape_html(stats.sectionsCreated.toLocaleString("ar"))}</div> <div class="stat-sub svelte-1l68qrj">آليّاً</div></div> <div class="stat-card svelte-1l68qrj"><div class="stat-label svelte-1l68qrj">عدد الدورات المنفّذة</div> <div class="stat-value svelte-1l68qrj">${escape_html(stats.runsCount.toLocaleString("ar"))}</div> <div class="stat-sub svelte-1l68qrj">دورة جلب لـ batch</div></div> <div class="stat-card svelte-1l68qrj"><div class="stat-label svelte-1l68qrj">آخر تشغيل</div> <div class="stat-value sm svelte-1l68qrj">${escape_html(relativeTime(stats.lastRunAt))}</div> <div class="stat-sub svelte-1l68qrj"${attr("title", formatDate(stats.lastRunAt))}>${escape_html(stats.lastError ? `آخر خطأ: ${stats.lastError}` : "بلا أخطاء")}</div></div></div> <section class="card svelte-1l68qrj"><div class="card-header svelte-1l68qrj"><div class="svelte-1l68qrj"><h2 class="card-title svelte-1l68qrj">المؤشّر الحالي</h2> <p class="card-desc svelte-1l68qrj">يوضّح أين توقّف المحرّك آخر مرّة. عند إعادة التشغيل يكمل من نفس النقطة.</p></div> <button class="btn btn-secondary btn-sm svelte-1l68qrj"${attr("disabled", isResettingCursor, true)}>${escape_html("إعادة المؤشّر للبداية")}</button></div> <div class="cursor-row svelte-1l68qrj"><div class="cursor-item svelte-1l68qrj"><div class="cursor-label svelte-1l68qrj">البذرة #</div> <div class="cursor-value svelte-1l68qrj">${escape_html(cursor.seedIndex + 1)}</div></div> <div class="cursor-item grow svelte-1l68qrj"><div class="cursor-label svelte-1l68qrj">الرابط الحالي</div> <div class="cursor-value mono trunc svelte-1l68qrj"${attr("title", "")}>${escape_html("—")}</div></div> <div class="cursor-item svelte-1l68qrj"><div class="cursor-label svelte-1l68qrj">الصفحة</div> <div class="cursor-value svelte-1l68qrj">${escape_html(cursor.page)}</div></div></div></section> <section class="card svelte-1l68qrj"><div class="card-header svelte-1l68qrj"><div class="svelte-1l68qrj"><h2 class="card-title svelte-1l68qrj">روابط البذور (Seed URLs)</h2> <p class="card-desc svelte-1l68qrj">رابط واحد لكلّ سطر. كلّها يجب أن تنتمي لـ <code class="svelte-1l68qrj">noor-book.com</code>.
					تغييرها يُعيد المؤشّر للبداية ولا يمسح ما جُلِب سابقاً.</p></div></div> <textarea class="seeds-textarea svelte-1l68qrj" rows="8" placeholder="https://www.noor-book.com/category/..."${attr("disabled", isSavingSeeds, true)}>`);
    const $$body = escape_html(seedsText);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea> <div class="seeds-actions svelte-1l68qrj"><span class="seeds-count svelte-1l68qrj">${escape_html(seedsText.split("\n").filter((s) => s.trim()).length)} بذرة `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></span> <button class="btn btn-primary btn-sm svelte-1l68qrj"${attr("disabled", true, true)}>${escape_html("حفظ البذور")}</button></div></section> <section class="card svelte-1l68qrj"><div class="card-header svelte-1l68qrj"><div class="svelte-1l68qrj"><h2 class="card-title svelte-1l68qrj">السجلّ الحيّ</h2> <p class="card-desc svelte-1l68qrj">آخر 30 حدث (يتحدّث كلّ 3 ث).</p></div> <span class="live-indicator svelte-1l68qrj"><span class="dot pulse svelte-1l68qrj"></span> Live</span></div> `);
    if (log.length === 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="empty svelte-1l68qrj">لا توجد أحداث بعد. شغّل المحرّك أو دورةً يدويّة لرؤية النتائج هنا.</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<ul class="log-list svelte-1l68qrj"><!--[-->`);
      const each_array = ensure_array_like(log);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let entry = each_array[$$index];
        $$renderer2.push(`<li${attr_class(`log-entry ${stringify(logLevelClass(entry.level))}`, "svelte-1l68qrj")}><span class="log-icon svelte-1l68qrj">${escape_html(logIcon(entry.level))}</span> <div class="log-body svelte-1l68qrj"><div class="log-message svelte-1l68qrj">${escape_html(entry.message)}</div> `);
        if (entry.hierarchy) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="log-meta svelte-1l68qrj"><strong class="svelte-1l68qrj">${escape_html(entry.hierarchy.main?.name || "—")}</strong> › ${escape_html(entry.hierarchy.sub?.name || "—")} `);
          if (entry.hierarchy.secondary) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`› ${escape_html(entry.hierarchy.secondary.name)}`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (entry.decision === "create_sub" || entry.decision === "create_secondary") {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="badge new-section svelte-1l68qrj">قسم جديد</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.url) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<a class="log-url svelte-1l68qrj"${attr("href", entry.url)} target="_blank" rel="noreferrer">${escape_html(entry.url)}</a>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.reason) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="log-reason svelte-1l68qrj"><code class="svelte-1l68qrj">${escape_html(entry.reason)}</code></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="log-time svelte-1l68qrj"${attr("title", formatDate(entry.ts))}>${escape_html(relativeTime(entry.ts))}</div></li>`);
      }
      $$renderer2.push(`<!--]--></ul>`);
    }
    $$renderer2.push(`<!--]--></section> <section class="card danger-card svelte-1l68qrj"><div class="card-header svelte-1l68qrj"><div class="svelte-1l68qrj"><h2 class="card-title danger-title svelte-1l68qrj">منطقة الخطر</h2> <p class="card-desc svelte-1l68qrj">"إعادة ضبط المصنع للروبوت" تمسح <strong class="svelte-1l68qrj">كلّ ما أحدثه المحرّك الآلي</strong>:
					الكتب التي رفعها (<code class="svelte-1l68qrj">__provider: 'noor-library'</code>)، الأقسام التي
					أنشأها (<code class="svelte-1l68qrj">__createdBy: 'noor_library_engine'</code>)، السجلّ المركزيّ،
					وسجلّ الفشل، والمؤشّر الحالي. <strong class="svelte-1l68qrj">لا يلمس أيّ محتوى أو قسم أنشأه
					مديرٌ بشريّ.</strong> العمليّة غير قابلة للتراجع.</p></div></div> <div class="danger-actions svelte-1l68qrj"><button type="button" class="btn btn-nuclear svelte-1l68qrj"${attr("disabled", isLoading, true)}><span class="btn-icon svelte-1l68qrj">⚠️</span> إعادة ضبط المصنع للروبوت (مسح الفوضى)</button></div></section></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  _page as default
};
