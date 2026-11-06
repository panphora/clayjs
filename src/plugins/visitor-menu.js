import { isDraftMode } from "../core/is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { paintLook } from "./menu/looks.js";

if (isDraftMode) {
  paintLook();
  document.addEventListener("clay:drafts-restored", () => paintLook());
  onDomReady(() => {
    import("./menu/visitor.js")
      .then((m) => m.start())
      .catch((error) => console.warn("visitor-menu: the menu did not load", error));
  });
}
