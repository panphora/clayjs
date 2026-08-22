/**
 * splice-merge.js — scoped live sync's clayjs adapter.
 *
 * The shared core (findChangedRoots + spliceProtected, vendored from
 * hyper-morph) is pure tree logic. This module owns everything clayjs-specific
 * about feeding it: which capture pairs with which baseline, per lane, so the
 * diff always compares trees from ONE serialization domain.
 *
 *   Disk frames (htmlclay external changes; save domain on the wire):
 *     diff    loss-domain clone  vs  parse(lastSavedDirty)     [same domain]
 *     splice  save-clone subtrees into the incoming disk doc   [same domain]
 *     The two clones come from ONE snapshot via captureForMerge(), whose
 *     pairMap bridges them. Save-domain subtrees still carry the freeze /
 *     no-watch children the loss-domain clone strips.
 *
 *     The loss domain, not the autosave domain: the question here is "would
 *     this frame destroy work?", which is the close warning's question, so it
 *     keeps no-trigger-autosave content. Disposable churn is declared out of
 *     it with no-dirty rather than inferred from bytes or gesture timing.
 *
 *   Peer frames (live-lane relays; snapshot domain on the wire):
 *     diff    snapshot clone  vs  parse(lastHtml)               [same domain]
 *     splice  snapshot subtrees into the incoming peer doc      [same domain]
 *     Snapshot clones carry persist-finalized control values; live elements
 *     do not, which is why the splice never imports clones of live elements.
 *
 * Also owns edit-mode activation of incoming disk documents: disk holds the
 * inert attribute forms (inert-contenteditable, inert-onclick, disabled
 * viewmode inputs, type="inert/…" admin resources) and the live DOM holds the
 * activated forms, so the patched document is run through the same enable
 * passes boot runs before it is morphed in.
 */

import { findChangedRoots, spliceProtected } from '../vendor/hyper-morph.vendor.js';
import { captureSnapshot, captureForMerge } from '../core/snapshot.js';
// save.js is edit-only in the loader waves but safe to reach from here: its
// module body guards every init on isEditMode, and the disk lane that needs
// this state only ever runs in edit-mode tabs.
import { getLastSavedDirty } from '../core/save.js';
import { TAB_LOCAL_ROOT_ATTRS } from '../lib/root-attrs.js';
import {
  isSnapshotRemoved,
  STRIP_FROM_SAVE,
  FREEZE_SELECTOR,
  SNAPSHOT_REMOVE_SELECTOR,
  NO_DIRTY_SELECTOR,
} from '../lib/region-policy.js';
import { probeMarkClean, gateCaptureToken, gateClearIfUnchanged } from '../lib/dirty-gate.js';
import { isEditMode } from '../core/is-edit-mode.js';
import { enableContentEditable } from '../core/admin-contenteditable.js';
import { enableOnClick } from '../core/admin-onclick.js';
import { enableAdminInputs } from '../core/admin-inputs.js';
import { enableAdminResources } from '../core/admin-resources.js';

// Per-tab chrome the peer-lane diff must skip on BOTH sides: these regions
// legitimately differ between tabs, and the morph never touches them anyway
// (hyper-morph's sync-ignore set, composed from the same policy selectors).
const PEER_SKIP_SELECTOR = [
  STRIP_FROM_SAVE,
  FREEZE_SELECTOR,
  SNAPSHOT_REMOVE_SELECTOR,
  NO_DIRTY_SELECTOR,
].join(', ');

function peerSkip(el) {
  return el.matches(PEER_SKIP_SELECTOR);
}

// Root attributes owned by the host or this tab: never a local edit.
function ignoreTabLocalRootAttrs(el, name) {
  return !el.parentElement && TAB_LOCAL_ROOT_ATTRS.has(name);
}

// One-deep parse cache per lane: sender bursts reuse the same baseline string
// across consecutive frames, and parsing a full document per frame is the
// dirty path's single biggest avoidable cost.
function makeParseCache() {
  let lastString = null;
  let lastDoc = null;
  return (html) => {
    if (html !== lastString) {
      lastDoc = new DOMParser().parseFromString(html, 'text/html');
      lastString = html;
    }
    return lastDoc;
  };
}

const parsePeerBase = makeParseCache();
const parseDiskBase = makeParseCache();

/**
 * Walk two identically-shaped element trees in lockstep, invoking cb(a, b)
 * per pair. Used to carry synthetic ids across cloning and importing.
 */
function walkPairs(a, b, cb) {
  cb(a, b);
  const aKids = a.children;
  const bKids = b.children;
  for (let i = 0; i < aKids.length; i++) {
    walkPairs(aKids[i], bKids[i], cb);
  }
}

/**
 * Copy synthetic ids from live elements onto their snapshot-clone twins.
 * Mirrors _buildIdentityMap's walk: the live side filters [no-snapshot]
 * chrome to stay aligned with what captureSnapshot stripped, and a subtree
 * whose child counts diverge (extension noise beside the clone's strip) is
 * skipped — those elements fall back to data-id / id matching.
 */
function fillCloneIds(liveEl, cloneEl, liveWeakMap, idOf) {
  const id = liveWeakMap.get(liveEl);
  if (id) idOf.set(cloneEl, id);
  const liveKids = [];
  for (const c of liveEl.children) {
    if (!isSnapshotRemoved(c)) liveKids.push(c);
  }
  const cloneKids = cloneEl.children;
  if (liveKids.length !== cloneKids.length) return;
  for (let i = 0; i < liveKids.length; i++) {
    fillCloneIds(liveKids[i], cloneKids[i], liveWeakMap, idOf);
  }
}

/**
 * Fill ids onto a parsed tree from a path-keyed identityMap (the wire format
 * peers send). Same dot-path scheme as live-sync's _walkParsedTree.
 */
function fillParsedIds(root, identityMap, idOf) {
  if (!root || !identityMap) return;
  const visit = (el, path) => {
    const id = identityMap[path];
    if (id) idOf.set(el, id);
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      visit(kids[i], path === '' ? String(i) : `${path}.${i}`);
    }
  };
  visit(root, '');
}

/**
 * Protect local dirty regions in an incoming PEER document (snapshot domain).
 * Mutates newDoc in place on success.
 *
 * @returns {{ ok: boolean, entries: Array, held?: object }}
 *   ok:false means the frame must be held back (applied not at all).
 */
export function protectPeerDoc({ newDoc, parsedWeakMap, baseHtml, baseIdentityMap, liveWeakMap }) {
  // No baseline yet: nothing to diff against, and a dirty page must not be
  // full-morphed over. The next frame (or our own first send) sets one.
  if (typeof baseHtml !== 'string' || !baseHtml) {
    return { ok: false, entries: [], held: null };
  }

  const gateToken = gateCaptureToken();
  const localClone = captureSnapshot({ flushUndo: false });
  const baseDoc = parsePeerBase(baseHtml);
  if (!baseDoc.documentElement) return { ok: false, entries: [], held: null };

  // One synthetic-identity space across all three trees. Local clone ids come
  // from the live elements; base ids from the last frame's identityMap; the
  // incoming doc's ids are already in parsedWeakMap.
  const idOf = new WeakMap();
  fillCloneIds(document.documentElement, localClone, liveWeakMap, idOf);
  fillParsedIds(baseDoc.documentElement, baseIdentityMap, idOf);

  const tiers = [
    (el) => idOf.get(el) || (parsedWeakMap && parsedWeakMap.get(el)) || null,
    (el) => el.getAttribute('data-id'),
    (el) => el.getAttribute('id'),
  ];

  const { entries } = findChangedRoots(localClone, baseDoc.documentElement, {
    skip: peerSkip,
    ignoreAttr: ignoreTabLocalRootAttrs,
    tiers,
  });

  if (!entries.length) {
    // The oracle just proved the page clean against its baseline. probeMarkClean
    // only caches form signatures; without the generation-checked counter clear
    // an edit that was typed and then undone leaves the gate armed forever, and
    // every later frame pays the full capture-and-diff for nothing.
    probeMarkClean();
    gateClearIfUnchanged(gateToken);
    return { ok: true, entries };
  }

  const res = spliceProtected(newDoc, entries, { tiers });
  if (!res.ok) {
    return { ok: false, entries, held: res.held };
  }

  // The imported clones are fresh nodes; hand them their originals' synthetic
  // ids so the morph pairs each protected region with the exact live elements
  // it came from (zero churn, caret intact).
  if (parsedWeakMap) {
    for (const { entry, imported } of res.placed) {
      walkPairs(entry.el, imported, (original, copy) => {
        const id = idOf.get(original);
        if (id) parsedWeakMap.set(copy, id);
      });
    }
  }

  return { ok: true, entries };
}

/**
 * Protect local dirty regions in an incoming DISK document (save domain).
 * Mutates newDoc in place on success.
 *
 * @returns {{ ok: boolean, entries: Array, held?: object }}
 */
export function protectDiskDoc({ newDoc }) {
  const base = getLastSavedDirty();
  if (!base) return { ok: false, entries: [], held: null };

  const gateToken = gateCaptureToken();
  const { saveClone, compareClone, pairMap } = captureForMerge();
  const baseDoc = parseDiskBase(base);
  if (!baseDoc.documentElement) return { ok: false, entries: [], held: null };

  const { entries } = findChangedRoots(compareClone, baseDoc.documentElement, {
    ignoreAttr: ignoreTabLocalRootAttrs,
  });

  if (!entries.length) {
    probeMarkClean();
    gateClearIfUnchanged(gateToken);
    return { ok: true, entries };
  }

  // Dirty roots were found on the comparison clone; the subtrees that go into
  // the (save-domain) disk doc are their save-clone twins. An entry pairMap
  // can't bridge means an authored transform grew the comparison clone after
  // the pairing — unmappable, so the frame holds rather than guesses.
  const spliceEntries = [];
  for (const entry of entries) {
    if (entry.type === 'deletion') {
      spliceEntries.push(entry);
      continue;
    }
    const saveEl = pairMap.get(entry.el);
    if (!saveEl) return { ok: false, entries, held: entry };
    spliceEntries.push({ ...entry, el: saveEl });
  }

  const res = spliceProtected(newDoc, spliceEntries, {});
  if (!res.ok) {
    return { ok: false, entries, held: res.held };
  }

  return { ok: true, entries };
}

/**
 * Convert an incoming disk document from its saved (inert) form to the live
 * edit-mode form, exactly as boot does on page load, so the morph compares
 * like with like: without this, every disk frame would swap the live page's
 * contenteditable/onclick/admin state back to inert — caret killed mid-edit.
 * Root attributes (editmode, savestatus, tokens) need no reversal here; the
 * morph's beforeAttributeUpdated veto keeps the live root's own.
 */
export function activateIncomingDoc(rootEl) {
  if (!isEditMode || !rootEl) return;
  enableContentEditable(rootEl);
  enableOnClick(rootEl);
  enableAdminInputs(rootEl);
  enableAdminResources(rootEl);
}
