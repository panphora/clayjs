// The frame every ClayJS dialog draws: a backdrop, a Bevel panel, an optional corner
// close. It holds no behaviour. The modal and the crop adapter own focus, Escape,
// backdrop clicks and settling, so each keeps the rules it already had.
import { set } from "../lib/hostile-css.js";
import { bevelBox, bevelCornerClose, bevelSurface, bevelText, pageScheme } from "./bevel-controls.js";
import { TOKENS, FONT_SANS } from "./bevel.js";

// A frame's own way to settle itself. The modal is a singleton and clears every frame
// when it opens; a frame it does not own (the crop dialog) registers here, so it is
// cancelled properly instead of vanishing with its caller still waiting.
export const dismissOf = new WeakMap();

const FOCUSABLE = 'a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [contenteditable], [tabindex]:not([tabindex^="-"])';

// Tab and Shift+Tab wrap inside `container`, the rule MicroModal applies to the modal.
export function keepFocusIn(container, event) {
  const nodes = [...container.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
  if (!nodes.length) return;
  const at = nodes.indexOf(document.activeElement);
  if (at === -1) {
    nodes[0].focus();
    event.preventDefault();
  } else if (event.shiftKey && at === 0) {
    nodes[nodes.length - 1].focus();
    event.preventDefault();
  } else if (!event.shiftKey && at === nodes.length - 1) {
    nodes[0].focus();
    event.preventDefault();
  }
}

export function bevelDialog({ zIndex = "100", width = "520px", closable = false } = {}) {
  const root = bevelBox("div", ["display:block"]);
  root.setAttribute("data-clay-modal", "");
  root.setAttribute("aria-hidden", "true");
  set(root, "color-scheme", pageScheme());

  const overlay = bevelBox("div", [
    "position:fixed", "inset:0", `z-index:${zIndex}`,
    "display:flex", "align-items:center", "justify-content:center", "padding:16px",
    `background:color-mix(in srgb, ${TOKENS.ground} 70%, transparent)`,
  ]);
  overlay.tabIndex = -1;

  const panel = bevelSurface("form", [
    "position:relative", "display:block", "margin:0", `width:min(${width}, 100%)`,
    "max-height:calc(100dvh - 32px)", "overflow:hidden", `border:2px solid ${TOKENS.ink}`,
  ]);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const inner = bevelBox("div", [
    "display:block", "max-height:calc(100dvh - 36px)", "overflow-x:hidden", "overflow-y:auto",
    "padding:38px clamp(20px, 6vw, 40px) 30px",
  ]);
  const body = bevelText("div", ["display:block", "overflow-wrap:anywhere", `font:15px/1.55 ${FONT_SANS}`]);
  const footer = bevelBox("div", [
    "display:flex", "flex-wrap:wrap", "justify-content:flex-end", "gap:9px",
    "margin-top:22px", "padding-top:18px", `border-top:1px solid ${TOKENS.line}`,
  ]);
  inner.append(body, footer);
  panel.append(inner);

  const close = closable ? bevelCornerClose({ label: "Close modal" }) : null;
  if (close) panel.append(close);

  overlay.append(panel);
  root.append(overlay);
  return { root, overlay, panel, body, footer, close };
}
