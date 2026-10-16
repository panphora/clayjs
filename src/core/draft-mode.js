const SLOT = /^[A-Za-z0-9._-]{1,100}$/;
export const DRAFT_ATTR = "visitor-drafts";
export const DRAFT_PLUGIN = "visitor-drafts";

let requested = false;
let transport = null;
let storeFailed = false;

const listed = (params, key) =>
  (params?.get?.(key) || "").split(",").map((name) => name.trim()).includes(DRAFT_PLUGIN);

export function noteBootParams(params) {
  requested = listed(params, "plugins") && !listed(params, "exclude");
}

export function draftSlot(doc = document) {
  const value = doc.documentElement.getAttribute(DRAFT_ATTR);
  return value && SLOT.test(value) ? value : null;
}

export function draftEligible(doc = document, loc = window.location) {
  return requested
    && (loc.protocol === "https:" || loc.protocol === "http:")
    && draftSlot(doc) !== null
    && doc.querySelector('script[data-rules-name~="api"]') !== null;
}

export function setDraftTransport(fn) { transport = fn; }
export function draftTransport() { return transport; }
export function setDraftStoreFailed(value) { storeFailed = Boolean(value); }
export function draftStoreFailed() { return storeFailed; }
