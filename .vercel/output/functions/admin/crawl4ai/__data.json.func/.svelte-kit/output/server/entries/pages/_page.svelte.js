import { a2 as head } from "../../chunks/index2.js";
import { L as LoadingScreen } from "../../chunks/LoadingScreen.js";
function _page($$renderer) {
  head("1uha8ag", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>Nebras Dashboard</title>`);
    });
  });
  LoadingScreen($$renderer, { message: "Loading" });
}
export {
  _page as default
};
