// Edit mode system - combines the editmode toggle with page type setting.
// Loads in BOTH view and edit mode: setMode must exist in view mode
// (it's the way IN), and setPageTypeOnPageLoad marks <html> in either mode.
import { canEdit, isDraftMode, isEditMode, isOwner, mode, modeState, registerModeParticipant } from "./is-edit-mode.js";
import { writeReceipt } from "./mode-receipt.js";
import onDomReady from "../lib/dom-ready.js";

let leaving = false;

// The public registration. The built-ins own the `clay:` prefix (`clay:resources` and
// every module participant), so an application may not take an id from that space.
const register = (participant) => {
  if (typeof participant?.id === "string" && participant.id.startsWith("clay:")) {
    throw new TypeError(`clay.modeLifecycle: the id "${participant.id}" is reserved`);
  }
  return registerModeParticipant(participant);
};

export const modeLifecycle = {
  register,
  canWrite: () => modeState().phase === "idle" && isEditMode,
  get state() {
    return Object.freeze(modeState());
  },
};

// The lazy dispatcher. The controller is a dynamic target, fetched by an explicit
// initial edit or the first live switch — never because a live declaration, a menu or
// a participant exists — and a rejected fetch is retried on the next ask.
let controller = null;

// A live switch is a contract the document signs, not a hint. The loader records this
// document's boot here only when `<html clay-mode-switch="live">` asked for one; the
// decision behind it -- adapters, authored resources, participants -- and the controller
// that runs the transaction are a dynamic target, fetched by the first switch and never
// by the declaration itself.
let liveSwitch = null;

export const noteLiveSwitch = (boot) => {
  liveSwitch = boot;
};

export async function activateInitialMode() {
  if (!isEditMode) return;
  try {
    controller ||= await import("./mode-lifecycle.js");
    await controller.activateInitial();
  } catch (err) {
    console.error("clayjs: the mode lifecycle failed to start:", err);
  }
}

export async function setMode(next) {
  if (next !== "edit" && next !== "view") throw new TypeError(`clay.setMode: unknown mode "${next}"`);
  if (next === mode) return { ok: true, mode, changed: false };
  if (isDraftMode || !canEdit) return { ok: false, mode, code: "not-allowed" };
  if (liveSwitch) {
    // A fetch that fails keeps the old way in: the guarded reload below, and the failed
    // import is cleared so the next ask asks again.
    controller ||= await import("./mode-lifecycle.js").catch(() => null);
    const live = controller && (await controller.switchMode(next, liveSwitch));
    if (live) return live;
  }
  if (mode === "edit") {
    let result;
    try {
      result = await window.clay?.save?.flush?.();
    } catch (err) {
      return { ok: false, mode, code: "save-failed", state: err?.state };
    }
    if (result && result.state && result.state !== "saved" && result.state !== "clean") {
      return { ok: false, mode, code: "save-failed", state: result.state };
    }
  }
  leaving = true;
  writeReceipt({ mode: next, canEdit: true, internal: true });
  location.reload();
  return { ok: true, mode: next, changed: true, reloading: true };
}

function openEditParam() {
  const url = new URL(window.location.href);
  url.searchParams.set('editmode', 'true');
  window.location.href = url.toString();
}

export const toggleEditMode = () =>
  isDraftMode ? openEditParam() : setMode(mode === "edit" ? "view" : "edit");

function keepModeOnReload() {
  if (!canEdit || isDraftMode) return;
  window.addEventListener("pagehide", () => { if (!leaving) writeReceipt({ mode, canEdit: true, internal: false }); });
}

export function setPageTypeOnPageLoad () {
  onDomReady(() => {
    document.documentElement.setAttribute("editmode", isEditMode ? "true" : "false");
    document.documentElement.setAttribute("pageowner", isOwner ? "true" : "false");
    if (canEdit) {
      document.documentElement.setAttribute("canedit", "true");
    } else {
      document.documentElement.removeAttribute("canedit");
    }
    if (isDraftMode) {
      document.documentElement.setAttribute("draftmode", "true");
    } else {
      document.documentElement.removeAttribute("draftmode");
    }
  });
}

function init() {
  setPageTypeOnPageLoad();
  keepModeOnReload();
}

// Auto-init when module is imported
init();

export { init, isEditMode, isOwner, canEdit, mode };
export default { init, setMode, toggleEditMode, isEditMode, isOwner, canEdit, mode };
