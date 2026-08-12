/**
 * host-attrs.js — the attributes a host puts on <html>, and what they mean.
 *
 * These are ephemeral: the host injects them into the response and strips them
 * back out of whatever the client saves, so they never reach disk. clayjs only
 * ever reads them, and reads them here so the two spellings of the save token
 * cannot drift between the edit-mode ladder and the save lane.
 */

// The spec spells it `savetoken`. htmlclay ships `htmlclaytoken` today and is a
// first-class host, so both are read and the canonical one wins.
const TOKEN_ATTRS = ["savetoken", "htmlclaytoken"];

// A host that wants the desktop JSON envelope on its save lane declares it on
// the root. This replaced a `location.hostname === 'localhost'` sniff, which sent
// the envelope to every host that happened to be local, including ones whose
// save lane takes text and answers 415.
export const DESKTOP_JSON = "desktop-json-v1";

/**
 * The per-document save token this response carries, or null.
 * @returns {?string}
 */
export function saveToken() {
  if (typeof document === "undefined") return null;
  for (const attr of TOKEN_ATTRS) {
    const value = document.documentElement.getAttribute(attr);
    if (value) return value;
  }
  return null;
}

/**
 * True when the host handed this response a save token of either spelling.
 * @returns {boolean}
 */
export function hasSaveToken() {
  return saveToken() !== null;
}

/**
 * The save transport the served document declares, or null.
 * @returns {?string}
 */
export function saveTransport() {
  if (typeof document === "undefined") return null;
  return document.documentElement.getAttribute("clay-save-transport");
}
