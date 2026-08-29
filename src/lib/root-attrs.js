/**
 * root-attrs.js — the attributes that live on <html>, and who owns them.
 *
 * Three parties write to the root: the host at serve time, this library, and the
 * author. Only the author's belong to the document. The other two belong to one
 * response and one tab, which is why they are named here rather than inside the
 * modules that happen to read them — the observer has to ignore them, and a
 * peer's copy of them must never be applied.
 */

// The two spellings of the save token. Spec §9 bounds one to per-file and per-tab
// and makes the host strip it before writing, so it never reaches disk. But §9
// bounds only the save path, and §10 fans a snapshot out to other editors'
// browsers, which is the hole this module closes.
//
// Save tokens ONLY. host-attrs.js returns the first name it finds here and puts it
// straight into the save URL, so anything added to this list becomes a credential
// in a path. Durable identities go in the list below, never in this one.
export const SAVE_TOKEN_ATTRS = ["savetoken", "htmlclaytoken"];

// Host-injected, but NOT credentials. htmlclayid is htmlclay's durable file
// identity, stamped on every serve and absent from disk bytes, so it rides in the
// morph protection below for the same reason a token does: a morph of raw disk
// content would otherwise strip this tab's copy, and a peer's copy must never be
// applied.
//
// It was previously in the token list, where saveToken() returned it whenever a
// host minted no token of its own. That is reachable: htmlclay stamps the id on
// every serve but injects a token only for top-level document loads, and its save
// route strips only the token, so the id reaches disk. Any such file hosted
// somewhere tokenless made this library POST to /_/save/{id} with no cookie and
// hand edit mode to every visitor.
export const HOST_IDENTITY_ATTRS = ["htmlclayid"];

export const HOST_TOKEN_ATTRS = [...SAVE_TOKEN_ATTRS, ...HOST_IDENTITY_ATTRS];

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
  ...ROOT_LIBRARY_ATTRS,
]);

/**
 * True when an incoming morph must be kept away from this attribute.
 * Scoped to the root: the same names anywhere else are the author's business.
 */
export function isTabLocalRootAttr(name, element) {
  return element === document.documentElement && TAB_LOCAL_ROOT_ATTRS.has(name);
}
