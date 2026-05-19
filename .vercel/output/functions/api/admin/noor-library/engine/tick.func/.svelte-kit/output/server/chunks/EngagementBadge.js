import { a6 as attr, a4 as escape_html } from "./index2.js";
import { t } from "./store.svelte.js";
function EngagementBadge($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { stats = {} } = $$props;
    const views = Number(stats?.view_count) || 0;
    const plays = Number(stats?.play_count) || 0;
    const completes = Number(stats?.complete_count) || 0;
    const visible = views > 0 || plays > 0 || completes > 0;
    if (visible) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="engagement-badge svelte-qzaaeu"${attr("title", t("content.engagement_tooltip"))}><span class="eng-stat"${attr("aria-label", t("content.engagement_views"))}>👁 ${escape_html(views)}</span> <span class="eng-sep svelte-qzaaeu">·</span> <span class="eng-stat"${attr("aria-label", t("content.engagement_plays"))}>▶ ${escape_html(plays)}</span> <span class="eng-sep svelte-qzaaeu">·</span> <span class="eng-stat"${attr("aria-label", t("content.engagement_completes"))}>✓ ${escape_html(completes)}</span></span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
export {
  EngagementBadge as E
};
