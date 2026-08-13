import toast, { toastPersistent } from "./toast.js";
import themodal from "./modal.js";
import { ask, consent, tell, snippet } from "./dialogs.js";

// Attach the public surface explicitly (§2.3). We do NOT rely on toast.js /
// dialogs.js evaluation side effects — their window auto-exports are stripped.
const clay = (window.clay = window.clay || {});
clay.toast = toast;
clay.toastPersistent = toastPersistent;
clay.ask = ask;
clay.confirm = consent;   // hyperclayjs `consent` → clayjs `clay.confirm`
clay.tell = tell;
clay.snippet = snippet;
clay.modal = themodal;

// Toast globals are a carve-out because core's live-sync soft-reads exactly these
// names. Only set them when absent, honoring "already have a toast library? keep yours".
if (typeof window.toast === "undefined") window.toast = toast;
if (typeof window.toastPersistent === "undefined") window.toastPersistent = toastPersistent;

// Automatic save feedback. clay:save-saving stays deliberately silent (a toast for
// a sub-second transient is noise). Keep your own toast lib? The events are public.
document.addEventListener("clay:save-saved", (e) =>
  toast(e.detail?.msg || "Saved", e.detail?.msgType === "warning" ? "warning" : "success"));
document.addEventListener("clay:save-error", () => toastPersistent("Couldn't save", "error"));
document.addEventListener("clay:save-offline", () => toastPersistent("Offline, not saved", "warning"));

export { toast, toastPersistent, ask, consent, tell, snippet, themodal };
