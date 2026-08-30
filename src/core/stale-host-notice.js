import { servedStaleToken } from "./host-attrs.js";
import onDomReady from "../lib/dom-ready.js";
import { set, make } from "../lib/hostile-css.js";

// The page's only visible word on a host too old to save to.
//
// This library reads one save-token name. A host older than that rename sends the
// other one, so there is no token here, and it also sets the owner cookie, so without
// help the page would open fully editable and 404 every save against a route that no
// longer matches. is-edit-mode.js takes editing away for that reason. This says why.
//
// It loads in the ALWAYS wave, not the edit-only one, which is the whole point: the
// case it exists for is precisely the case where edit mode is off, so a module gated on
// edit mode could never run in it. host-attrs.js also logs a line, and that line is for
// a developer. Somebody editing a document in a desktop app has no console open, and
// "why can I not edit this any more" is the question they are actually holding.
//
// One line, no choice to make: nothing on this page can fix it, so offering a button
// would be a lie. Dismissable, because after you have read it, it is only in the way.

const BG = "var(--clay-notice-bg,#222)";
const INK = "var(--clay-notice-ink,#fff)";
const EDGE = "var(--clay-notice-edge,rgba(255,255,255,.28))";
const FONT = "14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif";

const MESSAGE =
  "This page can't be edited: the app serving it is out of date. " +
  "Update HTML Clay to 1.9.0 or newer.";

let root = null;

// A phone keyboard shrinks the visual viewport but leaves fixed elements pinned to the
// layout viewport, so a bottom-anchored bar parks itself behind the keyboard. Same fix
// as the conflict notice.
function place() {
  if (!root) return;
  const vv = window.visualViewport;
  const lift = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  set(root, "bottom", `calc(${16 + lift}px + env(safe-area-inset-bottom,0px))`);
}

function dismiss() {
  if (!root) return;
  set(root, "display", "none");
  window.visualViewport?.removeEventListener("resize", place);
  window.visualViewport?.removeEventListener("scroll", place);
}

function build() {
  root = make("div", [
    "position:fixed", "left:50%", "transform:translateX(-50%)",
    "z-index:2147483001", "display:flex", "align-items:center", "gap:10px",
    "max-width:calc(100vw - 24px)", "flex-wrap:wrap", "justify-content:center",
    "padding:9px 12px", "border-radius:10px",
    `background:${BG}`, `color:${INK}`, `border:1px solid ${EDGE}`,
    "box-shadow:0 6px 24px rgba(0,0,0,.32),0 1px 2px rgba(0,0,0,.24)",
    `font:${FONT}`, "text-align:left",
  ]);
  // Three markers, and each is load-bearing on a page that CAN save: this element is
  // injected, so it is in no document on disk and must never reach one, never wake the
  // watcher, and never ride out in a snapshot to somebody else's browser.
  root.setAttribute("clay", "no-save no-watch no-snapshot");
  root.setAttribute("data-clay-stale-host", "");
  root.setAttribute("role", "alert");

  root.append(make("span", ["margin-right:2px"], MESSAGE));

  const close = make("button", [
    "all:initial", "box-sizing:border-box", "cursor:pointer", `font:${FONT}`,
    "color:" + INK, "opacity:.72", "padding:2px 6px", "border-radius:6px", "flex:none",
  ], "Dismiss");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss this message");
  close.addEventListener("click", dismiss);
  root.append(close);

  document.body.appendChild(root);
  place();
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
}

function init() {
  if (!servedStaleToken()) return;
  build();
}

onDomReady(init);
