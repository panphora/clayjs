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
// Spec §6. Persistent, and carrying the host's own words, because this is the one
// save outcome the person has to act on: their edits are safe and unsaved, and
// autosave has stopped until they choose. Deliberately a toast and not a dialog:
// most conflicts surface on an autosave nobody asked for, and a modal thrown over
// the page a person is typing into is worse than the problem it reports.
document.addEventListener("clay:save-conflict", (e) =>
  toastPersistent(e.detail?.msg || "This document changed since you opened it", "warning"));
document.addEventListener("clay:save-offline", () => toastPersistent("Offline, not saved", "warning"));

export { toast, toastPersistent, ask, consent, tell, snippet, themodal };
