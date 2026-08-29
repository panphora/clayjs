/**
 * root-attrs.js — the attributes that live on <html>, and who owns them.
 *
 * Three parties write to the root: the host at serve time, this library, and the
 * author. Only the author's belong to the document. The other two belong to one
 * response and one tab, which is why they are named here rather than inside the
 * modules that happen to read them — the observer has to ignore them, and a
 * peer's copy of them must never be applied.
 */

// The save token, in the order a reader tries the two spellings. Spec §9 bounds it to
// per-file and per-tab and makes the host strip it before writing, so it never reaches
// disk. But §9 bounds only the save path, and §10 fans a snapshot out to other editors'
// browsers, which is the hole this module closes.
//
// Save tokens ONLY. host-attrs.js returns the first name it finds here and puts it
// straight into the save URL, so anything added to this list becomes a credential
// in a path. Durable identities go in HOST_IDENTITY_ATTRS, never in this one.
//
// One name, deliberately. §9 names exactly one save-token attribute.
//
// This is a knowing break, not an oversight. htmlclay is the only host that mints a save
// token at all (hyperclay and Hyperclay Local authorize by cookie and inject nothing),
// it serves both spellings only from 1.9.0, and a document loads this library from a
// rolling URL. So a document served by an htmlclay at or below 1.8.0 keeps edit mode,
// because that host also sets the isAdminOfCurrentResource cookie, and every save 404s,
// because that host registers only `POST /_/save/{token}`.
//
// Taken on purpose, and taken now because the cost only grows: htmlclay 1.8.0 is days
// old, the product is pre-launch, and the alternative is carrying a second credential
// name in the save path permanently, since "wait until the old hosts are gone" is a
// condition nobody ever measures. host-attrs.js says so plainly in the console when it
// finds the old name, so the failure names its own cause and its own fix.
//
// ⚠️ RELEASE ORDER: htmlclay 1.9.0, which injects both names, must publish BEFORE this.
export const SAVE_TOKEN_ATTRS = ["savetoken"];

// The pre-rename spelling. Never read as a credential, which is the point of it being
// here rather than above, and never removed from HOST_TOKEN_ATTRS below, which is a
// different job: a name a host may inject has to go on being stripped before a save and
// kept out of a peer's morph, or a live token gets written into a document or handed to
// another tab. htmlclay injects it forever, because documents frozen against an older
// client read it, so this name never leaves this file.
export const LEGACY_SAVE_TOKEN_ATTRS = ["htmlclaytoken"];

// Host-injected, but NOT credentials. This is htmlclay's durable file identity,
// stamped on every serve and absent from disk bytes, so it rides in the morph
// protection below for the same reason a token does: a morph of raw disk content
// would otherwise strip this tab's copy, and a peer's copy must never be applied.
//
// Two spellings, permanently, mirroring the token list above. htmlclay serves
// `documentid` and reads either, but a document saved before that rename holds
// `htmlclayid` on disk forever, and this list is what a morph consults. Knowing
// only the current name would leave every pre-rename file's identity unprotected,
// which is the failure this list exists to prevent.
//
// It was previously in the token list, where saveToken() returned it whenever a
// host minted no token of its own. That is reachable: htmlclay stamps the id on
// every serve but injects a token only for top-level document loads, and its save
// route strips only the token, so the id reaches disk. Any such file hosted
// somewhere tokenless made this library POST to /_/save/{id} with no cookie and
// hand edit mode to every visitor. Splitting this list off from the token list is
// what fixed that, and the split holds whatever token spellings are read above.
export const HOST_IDENTITY_ATTRS = ["documentid", "htmlclayid"];

// What a host may have injected, and therefore what has to be stripped before a save
// and kept out of an incoming morph. Wider than what is READ, on purpose: the old token
// spelling is still injected by every htmlclay, so it still has to be stripped, whether
// or not this library will accept it as a credential.
export const HOST_TOKEN_ATTRS = [
  ...SAVE_TOKEN_ATTRS,
  ...LEGACY_SAVE_TOKEN_ATTRS,
  ...HOST_IDENTITY_ATTRS,
];

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
