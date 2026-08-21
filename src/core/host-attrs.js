/**
 * host-attrs.js — the attributes a host puts on <html>, and what they mean.
 *
 * These are ephemeral: the host injects them into the response and strips them
 * back out of whatever the client saves, so they never reach disk. clayjs only
 * ever reads them, and reads them here so the two spellings of the save token
 * cannot drift between the edit-mode ladder and the save lane.
 */

import { HOST_TOKEN_ATTRS } from "../lib/root-attrs.js";

/**
 * The per-document save token this response carries, or null.
 * @returns {?string}
 */
export function saveToken() {
  if (typeof document === "undefined") return null;
  for (const attr of HOST_TOKEN_ATTRS) {
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
