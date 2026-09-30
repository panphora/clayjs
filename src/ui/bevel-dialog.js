// The frame every ClayJS dialog draws: a backdrop, a Bevel panel, an optional corner
// close. It holds no behaviour. The modal and the crop adapter own focus, Escape,
// backdrop clicks and settling, so each keeps the rules it already had.
import { set } from "../lib/hostile-css.js";
import { bevelBox, bevelSurface, bevelText, pageScheme, protectIcon } from "./bevel-controls.js";
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

// The dashboard's dialog (Bevel's React dialog with the dashboard's overrides), drawn
// inline. ClayJS loads no webfonts, so the title's Newsreader falls back to Georgia.
const FONT_SERIF = 'Newsreader,Georgia,"Times New Roman",serif';
const LINE = `1px solid ${TOKENS["line-2"]}`;
const CLOSE_X =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

// Footer buttons are 32px, as in the dashboard's dialogs.
export const DIALOG_BUTTON = ["height:32px", "padding:0 12px", "font-size:13.5px"];

// The close: a column at the header's right edge in the button face, or a 62px square
// at the panel's corner when there is no header.
function dialogClose(label, inHeader) {
  const hover = `color-mix(in srgb, ${TOKENS.face}, ${TOKENS["edge-hi"]} 45%)`;
  const b = bevelBox("button", [
    "position:absolute", "top:-1px", "right:-1px", "z-index:2",
    "display:grid", "place-items:center", "width:62px", inHeader ? "height:calc(100% + 1px)" : "height:62px",
    "margin:0", "padding:0", "border:0", `border-left:${LINE}`, ...(inHeader ? [] : [`border-bottom:${LINE}`]),
    "cursor:pointer", `background:${TOKENS.face}`, `color:${TOKENS.ink}`, "outline:none",
  ]);
  b.type = "button";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML = CLOSE_X;
  protectIcon(b.firstElementChild, 16);
  b.addEventListener("pointerenter", () => set(b, "background", hover));
  b.addEventListener("pointerleave", () => set(b, "background", TOKENS.face));
  b.addEventListener("focus", () => { set(b, "outline", `2px solid ${TOKENS.brass}`); set(b, "outline-offset", "-4px"); });
  b.addEventListener("blur", () => set(b, "outline", "none"));
  return b;
}

export function bevelDialog({ zIndex = "100", width = "600px", closable = false, titled = false } = {}) {
  const root = bevelBox("div", ["display:block"]);
  root.setAttribute("data-clay-modal", "");
  root.setAttribute("aria-hidden", "true");
  set(root, "color-scheme", pageScheme());

  const overlay = bevelBox("div", [
    "position:fixed", "inset:0", `z-index:${zIndex}`, "overflow:auto",
    "display:flex", "align-items:flex-start", "justify-content:center",
    "padding:min(96px, 10vh) 16px 16px",
    `background:color-mix(in srgb, ${TOKENS.ground} 72%, transparent)`,
  ]);
  overlay.tabIndex = -1;

  const panel = bevelSurface("form", [
    "position:relative", "display:flex", "flex-direction:column", "margin:0",
    `width:min(${width}, 100%)`, "max-height:calc(100dvh - min(96px, 10vh) - 16px)",
    "border-radius:0", `box-shadow:6px 6px 0 color-mix(in srgb, ${TOKENS.ink} 10%, transparent)`,
  ]);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  let header = null;
  let heading = null;
  if (titled) {
    header = bevelBox("div", [
      "position:relative", "display:block", "flex:none",
      `padding:20px ${closable ? "68px" : "22px"} 16px 22px`, `border-bottom:${LINE}`,
    ]);
    heading = bevelText("div", ["display:block", "margin:0", `font:400 24px/1.15 ${FONT_SERIF}`, "overflow-wrap:anywhere"]);
    heading.setAttribute("role", "heading");
    heading.setAttribute("aria-level", "2");
    header.append(heading);
    panel.append(header);
  }

  const body = bevelText("div", [
    "display:block", "flex:1 1 auto", "min-height:0", "overflow-y:auto", "overflow-x:hidden",
    `padding:20px ${closable && !titled ? "84px" : "22px"} 20px 22px`,
    "overflow-wrap:anywhere", `font:14.5px/1.55 ${FONT_SANS}`,
  ]);
  const footer = bevelBox("div", [
    "display:flex", "flex:none", "flex-wrap:wrap", "justify-content:flex-end", "align-items:center", "gap:10px",
    "padding:14px 22px", `border-top:${LINE}`,
  ]);
  panel.append(body, footer);

  const close = closable ? dialogClose("Close", titled) : null;
  if (close) (header || panel).append(close);

  overlay.append(panel);
  root.append(overlay);
  return { root, overlay, panel, header, heading, body, footer, close };
}
