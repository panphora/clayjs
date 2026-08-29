/**
 * etag.js — the version stamp this tab last saw on disk (spec §6, `conditional`).
 *
 * One value, and one rule that decides everything about it: this client never
 * computes a stamp, it only ever echoes one the host handed it. The host stamps
 * the bytes it STORED, and on a document carrying formathtml="true" those are not
 * the bytes it was sent, so a stamp computed here would disagree with disk from
 * the first save onward and every later save would be refused against a value it
 * could never have matched.
 *
 * Three things move the stamp, and nothing else does:
 *
 *   - discovery seeds it, because a freshly loaded page has never saved and so
 *     holds no stamp of its own,
 *   - an accepted save replaces it with the one that response carried, and clears
 *     it when a response carries none: after our own write, any stamp still held
 *     here is known to describe bytes the host has stopped storing,
 *   - a disk-sourced live-sync frame clears it and asks for a fresh one, because
 *     the file changed under a tab that never saved.
 *
 * A peer's SNAPSHOT does not move it. §10 relays never write to disk, so the
 * stamp is still true after one lands, and treating one as a disk change would
 * refetch discovery on every keystroke another editor makes.
 *
 * No stamp means no `If-Match`, which means last write wins for that one save.
 * That is what every save did before this module existed, so an absent stamp is
 * always a step back to the old behaviour and never a new failure.
 */

import { hostMeta } from "./host-meta.js";
import { isEditMode } from "./is-edit-mode.js";

let lastSeen = null;
let conditional = false;
// Bumped by every write. A discovery answer that resolves after a save has
// already recorded a newer stamp must not overwrite it.
let generation = 0;

/** The stamp to send on the next save, or null. */
export function lastSeenEtag() {
  return lastSeen;
}

/** True only when the host announced `conditional` by name (§5). */
export function conditionalSaves() {
  return conditional;
}

/**
 * Take the stamp from a save response. A response with no stamp clears it.
 * @param {?string} value
 */
export function recordEtag(value) {
  lastSeen = typeof value === "string" && value !== "" ? value : null;
  generation++;
}

/** Forget the stamp: the next save goes out unconditional. */
export function forgetEtag() {
  recordEtag(null);
}

/**
 * Learn from discovery whether this host offers conditional saves, and what the
 * document's current stamp is.
 *
 * @param {Object} [options]
 * @param {boolean} [options.fresh] - Ask the host again instead of reusing the
 *   memoized answer, and take whatever it says as the whole truth: an answer with
 *   no stamp in it clears the one held here rather than leaving a stale value the
 *   host would refuse forever.
 * @returns {Promise<?string>}
 */
export async function seedEtag({ fresh = false } = {}) {
  const at = generation;
  const meta = await hostMeta({ fresh });
  conditional = meta.extensions.includes("conditional");

  if (generation !== at) return lastSeen;

  const seed = meta.document?.etag;
  if (typeof seed === "string" && seed !== "") {
    lastSeen = seed;
    generation++;
  } else if (fresh) {
    lastSeen = null;
    generation++;
  }
  return lastSeen;
}

// A disk-sourced frame is the one live-sync outcome that changes the file under a
// tab which did not save it. Holding the old stamp would refuse this tab's next
// save against bytes it has already morphed to and is looking at, so the stamp
// goes immediately and the replacement is asked for in the background: the save
// lane never waits on it.
//
// A frame that live-sync HELD is deliberately not covered, because it never
// dispatches this event. That tab has unsaved local edits and has not seen the
// new disk bytes, which is precisely the case a 412 exists for.
if (isEditMode) {
  document.addEventListener("clay:sync-applied", (event) => {
    if (event.detail?.source !== "disk") return;
    forgetEtag();
    seedEtag({ fresh: true });
  });
}
