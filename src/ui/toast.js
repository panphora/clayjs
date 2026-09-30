// a nice, simple alert
// ❗️ don't use too much text!
import { set } from "../lib/hostile-css.js";
import { bevelBox, bevelSurface, bevelText, bevelIconButton, pageScheme, protectIcon } from "./bevel-controls.js";
import { TOKENS, FONT_SANS } from "./bevel.js";

const icon = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>`;

const TONES = {
  success: { edge: TOKENS.teal, icon: icon("M5 12.5l4.5 4.5L19 7.5") },
  error: { edge: TOKENS.ox, icon: icon("M6 6l12 12M18 6L6 18") },
  warning: { edge: TOKENS.brass, icon: icon("M12 4L2.5 20h19L12 4zM12 10v4.5M12 17v1") },
  info: { edge: TOKENS["ink-2"], icon: icon("M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 11v6M12 7v1.5") },
};

const CLOSE_ICON =
  '<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2l8 8M10 2L2 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>';

const HIDDEN = ["opacity:0", "transform:translateX(24px)"];

function motion() {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? "none" : "opacity .5s ease-in-out, transform .5s ease-in-out";
}

// Looked up on every call, never cached: a live-sync morph or a caller can empty the
// body, and a detached stack would swallow every toast after it.
function stack() {
  const existing = document.querySelector("[data-clay-toasts]");
  if (existing) return existing;
  const box = bevelBox("div", [
    "position:fixed", "top:20px", "right:20px", "z-index:9999",
    "display:flex", "flex-direction:column", "align-items:flex-end", "gap:10px",
    "width:min(400px, calc(100vw - 40px))", "pointer-events:none",
  ]);
  box.setAttribute("data-clay-toasts", "");
  document.body.append(box);
  return box;
}

function build(message, type) {
  const tone = TONES[type];
  const el = bevelSurface("div", [
    "display:flex", "align-items:flex-start", "gap:12px", "max-width:100%",
    "padding:12px 12px 12px 14px", `border-inline-start:3px solid ${tone.edge}`,
    "cursor:pointer", "pointer-events:auto", `color-scheme:${pageScheme()}`,
    ...HIDDEN, `transition:${motion()}`,
  ]);
  el.setAttribute("data-clay-toast", type);
  const glyph = bevelText("span", ["display:inline-grid", "flex:none", "padding-top:1px", `color:${tone.edge}`]);
  glyph.innerHTML = tone.icon;
  protectIcon(glyph.firstElementChild, 16);
  // A message can carry a filename, and a filename is whatever whoever wrote the
  // file chose. It goes in as text so markup in a name can never become markup here.
  const text = bevelText("span", ["flex:1 1 auto", "min-width:0", `font:600 14px/1.35 ${FONT_SANS}`, "overflow-wrap:anywhere"], message);
  el.append(glyph, text);
  return el;
}

function reveal(el) {
  stack().append(el);
  setTimeout(() => {
    set(el, "opacity", "1");
    set(el, "transform", "none");
  }, 10);
}

function dismiss(el, after) {
  set(el, "opacity", "0");
  set(el, "transform", "translateX(24px)");
  setTimeout(() => {
    el.remove();
    after?.();
  }, 500);
}

function toast(message, messageType = "success") {
  const el = build(message, TONES[messageType] ? messageType : "success");
  el.addEventListener("click", () => dismiss(el));
  reveal(el);
  setTimeout(() => dismiss(el), 6600);
}

// Track active persistent toasts by message
const activePersistentToasts = new Map();

// Persistent toast function - doesn't auto-dismiss, requires click to close
function toastPersistent(message, messageType = "warning") {
  const existing = activePersistentToasts.get(message);
  if (existing) {
    dismiss(existing);
    activePersistentToasts.delete(message);
  }

  const el = build(message, TONES[messageType] ? messageType : "warning");
  set(el, "cursor", "default");
  const close = bevelIconButton(CLOSE_ICON, {
    label: "Close",
    onClick: (e) => {
      e.stopPropagation();
      // A newer toast with the same message may have taken this entry since.
      dismiss(el, () => { if (activePersistentToasts.get(message) === el) activePersistentToasts.delete(message); });
    },
  });
  el.append(close);

  activePersistentToasts.set(message, el);
  reveal(el);
}

export { toastPersistent };
export default toast;
