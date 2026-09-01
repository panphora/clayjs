import { isEditMode } from "./is-edit-mode.js";
import onDomReady from "../lib/dom-ready.js";
import { style, set, make } from "../lib/hostile-css.js";

// The page's only word on a refused save. Without it a document whose host said no
// looks exactly like one that is saving fine, while autosave sits suspended: the
// status chip that would have said so is a plugin, off by default, so most
// documents show nothing at all.
//
// It sits at the bottom because that is where a hand already is on a phone, and
// one line because the decision is small: keep this version, or take the other.
// Discarding arms before it fires, since it is the only control here that destroys
// work with no undo, and the page's own CSS is treated as hostile throughout.

const BG = "var(--clay-conflict-bg,#222)";
const INK = "var(--clay-conflict-ink,#fff)";
const EDGE = "var(--clay-conflict-edge,rgba(255,255,255,.28))";
const WARN = "var(--clay-conflict-warn,#e3a33f)";
const FONT = "14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif";

// The host names what moved the file when it knows. It often cannot: a plain
// filesystem write has no author. Anything unrecognised falls back to the phrase
// that is true in every case.
const SOURCES = {
  "another-tab": "in another tab",
  "another-person": "by someone else",
  "an-agent": "by an agent",
};

const ARM_MS = 5000;

let root = null, line = null, keep = null, drop = null;
let armTimer = null, armed = false, busy = false;

const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// all:initial first, because a page restyling every button is the normal case, not
// the adversarial one. Everything the control needs is restated after it.
function button(label, rules) {
  const b = make("button", [
    "all:initial", "box-sizing:border-box", "cursor:pointer", `font:${FONT}`,
    "font-weight:500", "border-radius:6px", "padding:6px 12px", "white-space:nowrap",
    "flex:none", ...rules,
  ], label);
  b.type = "button";
  b.addEventListener("focus", () => {
    set(b, "outline", `2px solid ${WARN}`);
    set(b, "outline-offset", "2px");
  });
  b.addEventListener("blur", () => set(b, "outline", "none"));
  return b;
}

// A phone keyboard shrinks the visual viewport but leaves fixed elements pinned to
// the layout viewport, which parks a bottom-anchored bar behind the keyboard at the
// exact moment somebody is typing. Lift it by the difference instead.
function place() {
  if (!root) return;
  const vv = window.visualViewport;
  const lift = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  set(root, "bottom", `calc(${16 + lift}px + env(safe-area-inset-bottom,0px))`);
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
  root.setAttribute("clay", "no-save no-watch no-snapshot");
  root.setAttribute("data-clay-conflict", "");
  root.setAttribute("role", "alert");

  line = make("span", ["margin-right:2px"]);
  drop = button("Load theirs", [`color:${INK}`, "opacity:.72", "padding:6px 8px"]);
  keep = button("Keep mine", [`background:${INK}`, `color:${BG}`, "font-weight:600"]);

  drop.addEventListener("click", onDrop);
  keep.addEventListener("click", onKeep);
  root.append(line, drop, keep);

  if (!still()) {
    set(root, "transition", "opacity .18s");
    set(root, "opacity", "0");
  }
  document.body.appendChild(root);
  place();
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
  requestAnimationFrame(() => set(root, "opacity", "1"));
}

// One arming click before the reload. A first click is a choice, not a confirmation
// of anything, and this is the only control here that throws away work nothing can
// bring back. It disarms itself so a bar left open does not stay one stray tap from
// discarding an afternoon.
function onDrop() {
  if (armed) { window.location.reload(); return; }
  armed = true;
  drop.textContent = "Yes, drop my edits";
  set(drop, "opacity", "1");
  set(drop, "color", WARN);
  set(drop, "box-shadow", `inset 0 0 0 1px ${WARN}`);
  clearTimeout(armTimer);
  armTimer = setTimeout(disarm, ARM_MS);
}

function disarm() {
  clearTimeout(armTimer);
  if (!armed) return;
  armed = false;
  drop.textContent = "Load theirs";
  set(drop, "opacity", ".72");
  set(drop, "color", INK);
  set(drop, "box-shadow", "none");
}

async function onKeep() {
  if (busy) return;
  busy = true;
  disarm();
  keep.textContent = "Saving…";
  set(keep, "opacity", ".65");
  try {
    const result = await window.clay?.save?.overwrite?.();
    if (result && result.ok === false) throw new Error(result.msg || "");
  } catch {
    // Left showing: the save still has not happened, and clearing the bar here
    // would put the page back to looking like one that is saving normally.
    line.textContent = "That did not save either. Your edits are still here.";
    keep.textContent = "Try again";
    set(keep, "opacity", "1");
    busy = false;
    return;
  }
  busy = false;
}

function onKeydown(e) {
  if (e.key === "Escape" && armed) { e.preventDefault(); drop.focus(); disarm(); }
}

function show(e) {
  if (!root) build();
  set(root, "display", "flex");
  const named = SOURCES[e?.detail?.changedBy];
  // Reassurance first, then the fact. What a person needs to know at this moment
  // is that nothing of theirs is gone and nothing is about to be overwritten; the
  // detail of what happened is the second half of the sentence, not the first.
  // "Saving is paused" led here once and read as a failure, which it is not: the
  // page is holding a version, and the two buttons below are the whole decision.
  //
  // An earlier save of this tab's timed out and the host could not say what became
  // of it, so this refusal may be answering that write rather than anybody else's.
  // Saying so is the whole reason the stamp is kept across a timeout instead of
  // quietly reconciled. A host that NAMED the writer, or that answered the question
  // with a receipt, knows better than this guess, so the name wins.
  if (!named && e?.detail?.afterTimeout) {
    line.textContent =
      "This page changed elsewhere, possibly by your own save that timed out. " +
      "Your edits here are safe, and nothing will be overwritten until you choose.";
  } else {
    line.textContent =
      `This page changed ${named || "elsewhere"}. ` +
      "Your edits here are safe, and nothing will be overwritten until you choose.";
  }
  keep.textContent = "Keep mine";
  set(keep, "opacity", "1");
  busy = false;
  disarm();
  place();
}

function hide() {
  if (!root) return;
  disarm();
  set(root, "display", "none");
}

function init() {
  if (!isEditMode) return;
  document.addEventListener("clay:save-conflict", show);
  document.addEventListener("clay:save-saved", hide);
  document.addEventListener("keydown", onKeydown);
}

onDomReady(init);
