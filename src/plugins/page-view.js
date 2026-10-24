// The reader half of plugins=page. A Document opened in view mode applies each newer
// saved file the host sends to its article (page/view.js); the editor half,
// plugins/page.js, is edit-only. resolveModules adds this module; no URL names it.
import { startPageView } from "../page/view.js";

let stopView = document.querySelectorAll("article[data-page]").length === 1 ? startPageView(document) : null;

export function stop() {
  stopView?.();
  stopView = null;
}
