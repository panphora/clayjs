/**
 * root-attrs.js — the attributes that live on <html>, and who owns them.
 *
 * Three parties write to the root: the host at serve time, this library, and the
 * author. Only the author's belong to the document. The other two belong to one
 * response and one tab, which is why they are named here rather than inside the
 * modules that happen to read them — the observer has to ignore them, and a
 * peer's copy of them must never be applied.
 */

// Injected by the host at serve time. Spec §9 bounds a save token to per-file and
// per-tab and makes the host strip it before writing, so it never reaches disk.
// But §9 bounds only the save path, and §10 fans a snapshot out to other editors'
// browsers, which is the hole this module closes.
export const HOST_TOKEN_ATTRS = ["savetoken", "htmlclaytoken"];

// Which save envelope this host's lane takes: a fact about the response, not
// about the document.
export const SAVE_TRANSPORT_ATTR = "clay-save-transport";

// This library's own root state, and this tab's UI truth.
export const ROOT_LIBRARY_ATTRS = ["savestatus", "editmode", "pageowner"];

// Never copied between tabs: not written onto this root by an incoming morph, not
// sent out on a sync broadcast.
//
// Both directions matter, and each was found separately. Accepting a peer's token
// makes every later save go out as that peer, and keeps working after this tab's
// own access is revoked, because revocation cannot reach a token minted for
// somebody else. Accepting a peer's ABSENCE of one is the mirror failure logged in
// documentid.md §5: a token-stripped broadcast removes this tab's own token and it
// can no longer save at all.
export const TAB_LOCAL_ROOT_ATTRS = new Set([
  ...HOST_TOKEN_ATTRS,
  SAVE_TRANSPORT_ATTR,
  ...ROOT_LIBRARY_ATTRS,
]);

/**
 * True when an incoming morph must be kept away from this attribute.
 * Scoped to the root: the same names anywhere else are the author's business.
 */
export function isTabLocalRootAttr(name, element) {
  return element === document.documentElement && TAB_LOCAL_ROOT_ATTRS.has(name);
}
