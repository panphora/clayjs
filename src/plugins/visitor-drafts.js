import { isDraftMode } from "../core/is-edit-mode.js";
import { draftSlot, setDraftTransport } from "../core/draft-mode.js";
import { createStore } from "./visitor-drafts/store.js";

let store = null;
let restoredDetail = null;
let pending = false;

if (isDraftMode && draftSlot() && document.querySelector('script[data-rules-name~="api"]')) {
  store = createStore();
  setDraftTransport((html) => store.write(html));
  const result = store.restore();
  restoredDetail = { restored: result.restored, hadDraft: result.hadDraft, parked: Boolean(result.parked) };
  document.dispatchEvent(new CustomEvent("clay:drafts-restored", { detail: restoredDetail }));
  document.addEventListener("clay:dirty", () => { pending = true; });
  document.addEventListener("clay:drafts-saved", () => { pending = false; });
  const flush = () => { if (pending) store.writeLive(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
}

export const ready = Promise.resolve();

export const visitorDrafts = {
  active: Boolean(store),
  slot: store?.slot ?? null,
  key: store?.key ?? null,
  hasDraft: () => Boolean(store?.read()),
  restored: () => restoredDetail,
  saveNow: () => (store ? store.writeLive() : false),
  onRestore(fn) { if (restoredDetail) fn(restoredDetail); },
};
