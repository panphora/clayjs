import { isEditMode } from "../core/is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { set, style } from "../lib/hostile-css.js";
import { bevelSurface, pageScheme } from "../ui/bevel-controls.js";
import { TOKENS, FONT_SANS } from "../ui/bevel.js";

// No 'conflict' here on purpose. core/conflict-notice.js owns that state now,
// and it ships in every document rather than only the ones that turned this chip on.
// Both listen to clay:save-conflict, so keeping a label here put a chip in the corner
// saying the same thing as the bar at the same moment. Dropping it from this side
// leaves core unaware that this plugin exists, which is the direction that
// dependency has to point.
const LABELS = {
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
  offline: "Offline, not saved",
};

// States that stay on screen instead of fading, because 'saving' is still in flight.
const STICKY = new Set(["saving"]);

const ALARMING = new Set(["error", "offline"]);

const REST = [`background:${TOKENS.surface}`, `color:${TOKENS.ink}`, `border-color:${TOKENS["line-2"]}`];
const ALARM = [
  `background:${TOKENS["ox-soft"]}`,
  `color:${TOKENS.ox}`,
  `border-color:color-mix(in srgb, ${TOKENS.ox} 28%, ${TOKENS["ox-soft"]})`,
];

let el = null;
let hideTimer = null;

function ensure() {
  if (el) return el;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el = bevelSurface("div", [
    "position:fixed", "right:16px", "bottom:16px", "z-index:2147483000",
    "padding:4px 12px", `font:500 13px/1.6 ${FONT_SANS}`,
    "opacity:0", `transition:${reduced ? "none" : "opacity .25s"}`, "pointer-events:none",
    `color-scheme:${pageScheme()}`,
  ]);
  el.setAttribute("data-clay-indicator", "");
  el.setAttribute("role", "status");
  document.body.appendChild(el);
  return el;
}

function show(state) {
  const node = ensure();
  node.textContent = LABELS[state];
  node.dataset.state = state;
  set(node, "color-scheme", pageScheme());
  style(node, ALARMING.has(state) ? ALARM : REST);
  set(node, "opacity", "1");
  clearTimeout(hideTimer);
  if (!STICKY.has(state)) hideTimer = setTimeout(() => { set(node, "opacity", "0"); }, 2200);
}

function init() {
  if (!isEditMode) return;
  for (const state of Object.keys(LABELS)) {
    document.addEventListener("clay:save-" + state, () => show(state));
  }
}

onDomReady(init);
