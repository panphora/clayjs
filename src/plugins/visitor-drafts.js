import { isDraftMode, isEditMode, isOwner } from "../core/is-edit-mode.js";
import { draftSlot, setDraftTransport } from "../core/draft-mode.js";
import { createStore } from "./visitor-drafts/store.js";

const DOWNLOAD_URL = "/_/download?as=htmlclay";

let store = null;
let restoredDetail = null;
let pending = false;

const slot = draftSlot();
const rulesTag = document.querySelector('script[data-rules-name~="api"]');

if (isDraftMode && slot && rulesTag) {
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
} else if (!slot || !rulesTag) {
  const missing = [];
  if (!slot) missing.push('a visitor-drafts="<slot>" attribute on <html>');
  if (!rulesTag) missing.push('a <script data-rules-name~="api"> rules tag');
  console.warn(`visitor-drafts: this page keeps no draft (missing ${missing.join(" and ")})`);
}

export const ready = Promise.resolve();

function inertVisitorDrafts() {
  return {
    active: false,
    slot: null,
    key: null,
    hasDraft: () => false,
    restored: () => null,
    saveNow: () => false,
    reset: () => false,
    onRestore: () => false,
    editOriginal: () => false,
    backToDraft: () => false,
    downloadUrl: () => DOWNLOAD_URL,
    source: null,
  };
}

export const visitorDrafts = store ? {
  active: true,
  slot: store.slot,
  key: store.key,
  hasDraft: () => Boolean(store.read()),
  restored: () => restoredDetail,
  saveNow: () => store.writeLive(),
  reset() {
    store.clear();
    window.location.reload();
    return true;
  },
  onRestore(fn) {
    if (restoredDetail) {
      fn(restoredDetail);
      return true;
    }
    document.addEventListener("clay:drafts-restored", (event) => fn(event.detail), { once: true });
    return false;
  },
  editOriginal() {
    const url = new URL(window.location.href);
    url.searchParams.set("editmode", "true");
    window.location.href = url.toString();
    return true;
  },
  backToDraft() {
    const url = new URL(window.location.href);
    url.searchParams.delete("editmode");
    window.location.href = url.toString();
    return true;
  },
  downloadUrl: () => DOWNLOAD_URL,
  source: null,
} : inertVisitorDrafts();
