/**
 * region-policy.js — the region capability model.
 *
 * A region declares how it participates in the framework via a small set of
 * orthogonal tokens. The canonical spelling is the space-separated `clay`
 * attribute (`clay="no-save no-undo"`); bare naked attributes are still
 * resolved for back-compat. They apply to an element and its descendants:
 *
 *   no-save               — not written to the saved file (stripped). Live at runtime.
 *   no-trigger-autosave   — saved, but editing it doesn't trigger an autosave / mark dirty.
 *   no-undo               — edits here are not recorded in the undo stack.
 *   no-watch              — invisible to the whole mutation system (high-churn regions). Still saved.
 *   freeze                — saved as authored (runtime changes not persisted). Live at runtime.
 *
 * Four legacy markers map onto bundles of the above for back-compat. They all
 * additionally gain "watched" (behaviors now run inside them):
 *
 *   mutations-ignore  ->  no-watch
 *   save-remove       ->  no-save  no-undo
 *   save-ignore       ->  no-trigger-autosave  no-undo
 *   save-freeze       ->  freeze  no-undo
 *
 * Separately, a snapshot-layer marker controls whether an element appears in any
 * snapshot at all (save file, live-sync broadcast, and dirty-comparison):
 *
 *   snapshot-remove / no-snapshot  — removed from every snapshot. Runtime-only
 *     local chrome. hyper-morph also treats it as sync-ignored, so a live-sync
 *     receiver preserves its own copy instead of deleting it. Handled in
 *     snapshot.js, not by the policy axes below; no-snapshot is the consistent
 *     alias for the original snapshot-remove.
 *
 * resolveRegionPolicy() walks an element's self-or-ancestor chain once and
 * returns the four independent axes the rest of the framework keys off:
 *   { watched, autosaveTriggered, undoable, persist, extension }
 */

import { EXTENSION_NODE_SELECTOR } from './extension-noise.js';

export const PERSIST = { FULL: 'full', FROZEN: 'frozen', NONE: 'none' };

// The canonical region tokens (spelled in the `clay` attribute or as bare attrs).
export const REGION_ATTRS = ['no-save', 'no-trigger-autosave', 'no-undo', 'no-watch', 'freeze'];

// Canonical tokens spellable inside the space-separated `clay` attribute.
const CLAY_TOKENS = ["no-save", "no-snapshot", "no-trigger-autosave", "no-watch", "no-undo", "freeze"];

// True when a region marker is present, whether spelled as a `clay` token
// (whitespace-token semantics, matching [clay~=token]) or a legacy bare attribute.
function hasRegionToken(el, token) {
  const clay = el.getAttribute?.("clay");
  if (clay && clay.split(/\s+/).includes(token)) return true;   // whitespace-token semantics, matches [clay~=…]
  return !!el.hasAttribute?.(token);                            // legacy bare attribute
}

// Serializer selectors (recognize the clay-token spelling FIRST, then new + legacy bare).
export const STRIP_FROM_SAVE = '[clay~="no-save"], [no-save], [save-remove]';
export const FREEZE_SELECTOR = '[clay~="freeze"], [freeze], [save-freeze]';
// forComparison additionally strips every region whose autosave-trigger is off,
// so their churn never marks the page dirty — including the no-watch /
// mutations-ignore footgun (their content stays in the saved file, but is no
// longer counted as a change).
export const STRIP_FROM_COMPARISON =
  '[clay~="no-save"], [clay~="no-trigger-autosave"], [clay~="freeze"], [clay~="no-watch"], [no-save], [save-remove], [no-trigger-autosave], [save-ignore], [freeze], [save-freeze], [no-watch], [mutations-ignore]';

// Snapshot-layer marker: removed from EVERY snapshot (save, live-sync broadcast,
// dirty-comparison) in snapshot.js. `no-snapshot` is the consistent alias for the
// original `snapshot-remove`; hyper-morph treats both as sync-ignored so a
// live-sync receiver keeps its own local copy instead of deleting it.
export const SNAPSHOT_REMOVE_SELECTOR = '[clay~="no-snapshot"], [snapshot-remove], [no-snapshot]';

export function isSnapshotRemoved(el) {
  return hasRegionToken(el, 'snapshot-remove') || hasRegionToken(el, 'no-snapshot');
}

const PERSIST_RANK = { full: 0, frozen: 1, none: 2 };
const RANK_PERSIST = ['full', 'frozen', 'none'];

function startElement(node) {
  return node && node.nodeType !== 1 ? node.parentElement : node;
}

/**
 * Walk an element's self-or-ancestor chain once and resolve its region axes.
 *
 * @param {Node} node
 * @returns {{watched:boolean, autosaveTriggered:boolean, undoable:boolean, persist:string, extension:boolean}}
 */
export function resolveRegionPolicy(node) {
  let element = startElement(node);

  // Browser-extension injected content is never page content, for any consumer.
  if (element && element.closest && element.closest(EXTENSION_NODE_SELECTOR)) {
    return { watched: false, autosaveTriggered: false, undoable: false, persist: PERSIST.FULL, extension: true };
  }

  let watched = true;
  let undoable = true;
  let autosaveOff = false;
  let persistRank = 0;

  while (element && element.nodeType === 1) {
    if (element.hasAttribute) {
      // new naked attributes
      if (hasRegionToken(element, 'no-watch')) watched = false;
      if (hasRegionToken(element, 'no-trigger-autosave')) autosaveOff = true;
      if (hasRegionToken(element, 'no-undo')) undoable = false;
      if (hasRegionToken(element, 'no-save')) persistRank = Math.max(persistRank, PERSIST_RANK.none);
      if (hasRegionToken(element, 'freeze')) persistRank = Math.max(persistRank, PERSIST_RANK.frozen);
      // legacy markers -> bundles
      if (hasRegionToken(element, 'mutations-ignore')) watched = false;
      if (hasRegionToken(element, 'save-remove')) { persistRank = Math.max(persistRank, PERSIST_RANK.none); undoable = false; }
      if (hasRegionToken(element, 'save-ignore')) { autosaveOff = true; undoable = false; }
      if (hasRegionToken(element, 'save-freeze')) { persistRank = Math.max(persistRank, PERSIST_RANK.frozen); undoable = false; }
    }
    element = element.parentElement;
  }

  // Implication rules (no-save wins over freeze automatically via Math.max above):
  //   no-watch  ⟹ no autosave + no undo (can't track what isn't watched)
  //   no-save / freeze ⟹ no autosave (nothing live to persist)
  if (!watched) { autosaveOff = true; undoable = false; }
  if (persistRank > 0) autosaveOff = true;

  return {
    watched,
    autosaveTriggered: !autosaveOff,
    undoable,
    persist: RANK_PERSIST[persistRank],
    extension: false,
  };
}

/**
 * Cheap intake-level check: is a node invisible to EVERY consumer?
 *
 * Only no-watch / mutations-ignore (and extension noise) qualify — they're the
 * one universal drop, so the observer can skip walking those subtrees entirely.
 * All other region attributes are resolved per-consumer in Mutation._notify.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isInert(node) {
  let element = startElement(node);
  if (element && element.closest && element.closest(EXTENSION_NODE_SELECTOR)) return true;
  while (element && element.nodeType === 1) {
    if (element.hasAttribute &&
        (hasRegionToken(element, 'no-watch') || hasRegionToken(element, 'mutations-ignore'))) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

/**
 * Combine two resolved policies into the stricter of each axis. Used to merge a
 * removed (detached) element's own markers with its still-attached parent's.
 */
export function strictestPolicy(a, b) {
  return {
    watched: a.watched && b.watched,
    autosaveTriggered: a.autosaveTriggered && b.autosaveTriggered,
    undoable: a.undoable && b.undoable,
    persist: PERSIST_RANK[a.persist] >= PERSIST_RANK[b.persist] ? a.persist : b.persist,
    extension: a.extension || b.extension,
  };
}

// Literal `skip:[...]` escape-hatch tokens -> axis predicate.
const SKIP_TOKEN_PREDICATES = {
  'no-watch': p => !p.watched,
  'mutations-ignore': p => !p.watched,
  'no-save': p => p.persist === PERSIST.NONE,
  'save-remove': p => p.persist === PERSIST.NONE,
  'freeze': p => p.persist === PERSIST.FROZEN,
  'save-freeze': p => p.persist === PERSIST.FROZEN,
  'no-trigger-autosave': p => !p.autosaveTriggered,
  'save-ignore': p => !p.autosaveTriggered,
  'no-undo': p => !p.undoable,
};

/**
 * Should a consumer skip a change in this region?
 *
 * @param {object} policy   resolved region policy
 * @param {string} [require] axis the consumer needs: 'observed' | 'autosave' | 'undo'
 * @param {string[]} [skip]  literal attribute escape-hatch (any match -> skip)
 * @returns {boolean}
 */
export function skipForPolicy(policy, require, skip) {
  if (policy.extension) return true;
  if (skip && skip.length) {
    return skip.some(tok => SKIP_TOKEN_PREDICATES[tok]?.(policy) || false);
  }
  switch (require) {
    case 'observed': return !policy.watched;
    case 'autosave': return !policy.autosaveTriggered;
    case 'undo': return !policy.undoable;
    default:
      // No require declared: preserve the legacy four-marker skip so unmodified
      // consumers behave exactly as before. (Undo-only opt-outs still pass.)
      return !policy.watched || !policy.autosaveTriggered || policy.persist !== PERSIST.FULL;
  }
}

// The canonical region API the vendored hyper-undo (a separate bundle that can't
// import this module) delegates "is this undoable?" to via window.hyperclay.region,
// so the two can no longer drift. The loader assembles this onto the compat shim.
export const windowRegionShape = {
  resolveRegionPolicy,
  isInert,
  skipForPolicy,
  strictestPolicy,
  PERSIST,
  REGION_ATTRS,
  STRIP_FROM_SAVE,
  FREEZE_SELECTOR,
  STRIP_FROM_COMPARISON,
};
