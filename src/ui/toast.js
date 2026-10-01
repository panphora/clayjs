// a nice, simple alert
// ❗️ don't use too much text!
//
// The Hyperclay dashboard's toast (Bevel's React toast with the dashboard's overrides),
// drawn inline: a 3px tone edge, a 16px Phosphor glyph, 13.5px semibold text, a quiet close.
import { set } from "../lib/hostile-css.js";
import { bevelBox, bevelSurface, bevelText, pageScheme, protectIcon } from "./bevel-controls.js";
import { TOKENS, RULES } from "./bevel.js";

const icon = (d) =>
  `<svg viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`;

const CHECK = "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z";
const WARNING = "M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z";
const INFO = "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z";
const X = "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z";

const TONES = {
  success: { edge: TOKENS.teal, icon: icon(CHECK) },
  error: { edge: TOKENS.ox, icon: icon(WARNING) },
  warning: { edge: TOKENS.brass, icon: icon(WARNING) },
  info: { edge: TOKENS.brass, icon: icon(INFO) },
};

const CLOSE_ICON = icon(X);

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
    "position:fixed", "top:18px", "right:18px", "z-index:9999",
    "display:flex", "flex-direction:column", "align-items:flex-end", "gap:10px",
    "width:min(330px, calc(100vw - 36px))", "pointer-events:none",
  ]);
  box.setAttribute("data-clay-toasts", "");
  box.setAttribute("aria-live", "polite");
  document.body.append(box);
  return box;
}

function build(message, type) {
  const tone = TONES[type];
  const el = bevelSurface("div", [
    "display:flex", "align-items:flex-start", ...RULES.toast, "width:100%",
    `border-inline-start:3px solid ${tone.edge}`,
    "cursor:pointer", "pointer-events:auto", `color-scheme:${pageScheme()}`,
    ...HIDDEN, `transition:${motion()}`,
  ]);
  el.setAttribute("data-clay-toast", type);
  const glyph = bevelText("span", ["display:inline-grid", "flex:none", "padding-top:1px", `color:${tone.edge}`]);
  glyph.innerHTML = tone.icon;
  protectIcon(glyph.firstElementChild, 16);
  // A message can carry a filename, and a filename is whatever whoever wrote the
  // file chose. It goes in as text so markup in a name can never become markup here.
  const text = bevelText("span", ["flex:1 1 auto", "min-width:120px", ...RULES.toastTitle, "overflow-wrap:anywhere"], message);
  el.append(glyph, text);
  return el;
}

// The dashboard's toast close: a bare 24px square in the muted ink, the sunk ground on hover.
function closeButton(onClick) {
  const b = bevelBox("button", [
    "flex:none", "display:inline-grid", "place-items:center", ...RULES.toastClose,
    "cursor:pointer",
  ]);
  b.type = "button";
  b.setAttribute("aria-label", "Dismiss");
  b.title = "Dismiss";
  b.innerHTML = CLOSE_ICON;
  protectIcon(b.firstElementChild, 14);
  const paint = (lit) => {
    set(b, "color", lit ? TOKENS.ink : TOKENS.muted);
    set(b, "background", lit ? TOKENS.sunk : "transparent");
  };
  b.addEventListener("pointerenter", () => paint(true));
  b.addEventListener("pointerleave", () => paint(false));
  b.addEventListener("focus", () => { paint(true); set(b, "outline", `2px solid ${TOKENS.brass}`); set(b, "outline-offset", "1px"); });
  b.addEventListener("blur", () => { paint(false); set(b, "outline", "none"); });
  b.addEventListener("click", onClick);
  return b;
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
  const close = closeButton((e) => {
    e.stopPropagation();
    // A newer toast with the same message may have taken this entry since.
    dismiss(el, () => { if (activePersistentToasts.get(message) === el) activePersistentToasts.delete(message); });
  });
  el.append(close);

  activePersistentToasts.set(message, el);
  reveal(el);
}

// Takes down the persistent toast showing this message, if one is up.
function dismissPersistent(message) {
  const el = activePersistentToasts.get(message);
  if (!el) return;
  activePersistentToasts.delete(message);
  dismiss(el);
}

export { toastPersistent, dismissPersistent };
export default toast;
