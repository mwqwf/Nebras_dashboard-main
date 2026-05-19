import { a4 as escape_html } from "./index2.js";
import "clsx";
function LoadingScreen($$renderer, $$props) {
  let { message = "Loading..." } = $$props;
  $$renderer.push(`<div class="loading-screen svelte-1p9h290" id="loading-screen"><div class="loading-orb svelte-1p9h290"><div class="orb-ring svelte-1p9h290"></div> <div class="orb-core svelte-1p9h290"></div></div> <p class="loading-text svelte-1p9h290">${escape_html(message)}</p> <div class="loading-dots svelte-1p9h290"><span class="dot svelte-1p9h290" style="animation-delay: 0s;"></span> <span class="dot svelte-1p9h290" style="animation-delay: 0.2s;"></span> <span class="dot svelte-1p9h290" style="animation-delay: 0.4s;"></span></div></div>`);
}
export {
  LoadingScreen as L
};
