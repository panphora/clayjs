import { isEditMode } from "../core/is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";

const LABELS = {
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
  offline: "Offline, not saved",
  conflict: "Changed elsewhere, not saved",
};

// States that stay on screen instead of fading. 'saving' is still in flight, and a
// conflict has stopped autosave until the person chooses, so a chip that faded
// after two seconds would leave a page that is no longer saving looking like one
// that is.
const STICKY = new Set(["saving", "conflict"]);

const ALARMING = new Set(["error", "offline", "conflict"]);

let el = null;
let hideTimer = null;

function ensure() {
  if (el) return el;
  el = document.createElement("div");
  el.setAttribute("clay", "no-save no-watch no-snapshot");
  el.setAttribute("data-clay-indicator", "");
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483000",
    "padding:4px 12px", "border-radius:999px",
    "font:13px/1.6 system-ui,-apple-system,sans-serif",
    "background:var(--clay-indicator-bg,#2e2b27)",
    "color:var(--clay-indicator-ink,#f2f0eb)",
    "opacity:0", "transition:opacity .25s", "pointer-events:none",
  ].join(";");
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) el.style.transition = "none";
  document.body.appendChild(el);
  return el;
}

function show(state) {
  const node = ensure();
  node.textContent = LABELS[state];
  node.dataset.state = state;
  node.style.background = ALARMING.has(state)
    ? "var(--clay-indicator-error-bg,#7a3b28)" : "var(--clay-indicator-bg,#2e2b27)";
  node.style.opacity = "1";
  clearTimeout(hideTimer);
  if (!STICKY.has(state)) hideTimer = setTimeout(() => { node.style.opacity = "0"; }, 2200);
}

function init() {
  if (!isEditMode) return;
  for (const state of Object.keys(LABELS)) {
    document.addEventListener("clay:save-" + state, () => show(state));
  }
}

onDomReady(init);
