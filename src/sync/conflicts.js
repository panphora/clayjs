import { registerUnsavedState } from '../lib/unsaved-state.js';
import { releaseProtection } from './conflict-footprints.js';
import { TAB_LOCAL_ROOT_ATTRS } from '../lib/root-attrs.js';
import { serializeRecoveryClone } from '../core/snapshot.js';
import { rowOf } from '../core/conflict-presentation.js';

// What incoming frames won over this tab's unsaved edits, kept for the life of
// the document until the person decides. Nothing here is read by a save, a
// baseline, a reconnect or a 412 release: a record leaves only through
// acknowledge(). Each apply keeps the clone the merge read as "mine", which is
// the recovery copy for Download and the source for Revert.

const REASONS = new Set(['accepted', 'reverted', 'reconciled']);
const nonce = Math.random().toString(36).slice(2, 8);
let counter = 0;
const records = new Map();
const applies = new Map();
const pending = new Set();
const resolvers = new Set();
let registration = null;

// The recovery half of this module is fetched, not imported: no recovery code is in
// the boot graph, and a page that never loses anything never downloads it. The copy
// itself is made synchronously below and queued here, so what has to be preserved is
// preserved before anything is released; the queue drains the moment the module
// arrives. Until it does, the live record is the only copy, which is where this
// started.
const DURABLE_QUEUE_MAX = 20;
let durable = null;
let loadingDurable = false;
const durableQueue = [];

function loadDurable() {
  if (durable || loadingDurable) return;
  loadingDurable = true;
  import('../recovery/conflicts.js').then(
    (module) => {
      durable = module;
      loadingDurable = false;
      drainDurable();
    },
    (error) => {
      loadingDurable = false;
      console.error('clayjs: the conflict recovery module could not be downloaded; conflicts stay in this tab only', error);
    }
  );
}

function drainDurable() {
  if (!durable) {
    loadDurable();
    return;
  }
  while (durableQueue.length) {
    const spec = durableQueue.shift();
    try {
      durable.recordConflicts(spec);
    } catch (err) {
      console.error('clayjs: the conflict could not be stored for a later reload; it is still here', err);
    }
  }
}

function nextId(prefix = '') {
  return `${nonce}:${prefix}${++counter}`;
}

function register() {
  loadDurable();
  registration ||= registerUnsavedState({
    id: 'live-sync-conflicts',
    isPending: () => records.size > 0 || pending.size > 0,
  });
  return registration;
}

function changed(detail) {
  register().changed();
  document.dispatchEvent(new CustomEvent('clay:sync-conflicts-changed', {
    detail: { open: [...records.keys()], added: [], removedIds: [], updatedIds: [], ...detail },
  }));
}

// A report is a loss unless the engine says this tab's operation survived, or a
// hook kept the incoming change off the page. One the engine could not map to the
// live page ("missing-output") still replaced this tab's work: it shows, without
// a place to point at.
function isLoss(c) {
  const r = c.recovery;
  if (!r) return true;
  if (r.applied === false && r.unavailable === 'hook-veto') return false;
  return r.localLost !== false;
}

// The page names a conflict when it can: a record id, a label and a field, from the
// app's own registered resolver. What comes back is a name and an action for the
// notice, never a claim, and never a replacement for the generic ones.
const CONTEXT_FIELDS = ['kind', 'id', 'label', 'field'];

// What can be stored: the identity, the label and the field. An `open` action is a
// function bound to this page's tree and stays on the live record.
function contextFields(value) {
  if (!value || typeof value !== 'object') return null;
  const context = {};
  for (const field of CONTEXT_FIELDS) {
    const found = value[field];
    if (typeof found === 'string' && found) context[field] = found;
    else if (typeof found === 'number' && Number.isFinite(found)) context[field] = String(found);
  }
  return Object.keys(context).length ? context : null;
}

function contextOf(value) {
  const context = contextFields(value);
  if (!context) return null;
  if (typeof value.open === 'function') context.open = value.open;
  return context;
}

// The newest registration answers first: an app that changes its own resolver gets
// the new one without having to unregister the old.
function contextFor(rec, apply) {
  for (const resolver of [...resolvers].reverse()) {
    let answer;
    try {
      answer = resolver(rec, apply);
    } catch (err) {
      console.error('clayjs: a conflict context resolver threw; the conflict stays generic', err);
      continue;
    }
    const context = contextOf(answer);
    if (context) return context;
  }
  return null;
}

export function registerContext(resolver) {
  if (typeof resolver !== 'function') throw new TypeError('clay.conflicts.registerContext needs a resolver function');
  resolvers.add(resolver);
  return () => resolvers.delete(resolver);
}

function install(apply, raw) {
  const id = nextId();
  const rec = Object.assign(raw[0], {
    id, applyId: apply.id, source: apply.source, ticket: apply.ticket,
    rawReports: raw, claimedBy: null,
  });
  rec.context = contextFor(rec, apply);
  records.set(id, rec);
  apply.ids.add(id);
  return id;
}

export function beginApply({ source, seq = null, etag = null, domain, root, recoveryRoot = null }) {
  const id = nextId('a');
  applies.set(id, { id, source, seq, etag, ticket: 0, domain, root, recoveryRoot, ids: new Set() });
  pending.add(id);
  register().changed();
  return id;
}

function insertionProof(raw) {
  if (!raw.every((c) => c.kind === 'structure' && c.detail === 'insert-collision' && c.recovery?.applied === true && !c.recovery.unavailable && c.recovery.structure?.localAction === 'inserted' && c.recovery.structure.fragmentKind === 'element')) return null;
  const subject = raw[0].recovery.subject;
  if (subject?.local?.length !== 1 || subject.merged?.length !== 1 || subject.live?.length !== 1) return null;
  return { local: subject.local[0], merged: subject.merged[0], live: subject.live[0] };
}

function foldInsertions(groups) {
  const proofs = new Map(groups.map((raw) => [raw, insertionProof(raw)]));
  const below = (parent, child) => parent.length < child.length && parent.every((step, i) => step === child[i]);
  const at = (root, path) => path.reduce((node, step) => step === 'content' ? node?.content : node?.childNodes[step], root);
  const folded = new Map();
  for (const raw of groups) {
    const child = proofs.get(raw);
    let owner = raw;
    if (child) {
      for (const candidate of groups) {
        const parent = proofs.get(candidate);
        if (parent && parent.local.length < proofs.get(owner).local.length && below(parent.local, child.local) && below(parent.merged, child.merged) && (parent.live.contains(child.live) || at(parent.live, child.merged.slice(parent.merged.length)) === child.live)) owner = candidate;
      }
    }
    if (!folded.has(owner)) folded.set(owner, [...owner]);
    if (raw !== owner) folded.get(owner).push(...raw);
  }
  return [...folded.values()];
}

// The losing text a reload has to keep, as the notice already words it. Everything
// here is plain text: the row's own name, the sentence that explains it, and the two
// sides, with the rest of the copy in the stored root.
function conflictEntry(rec) {
  let row = null;
  try {
    row = rowOf(rec);
  } catch (_) {}
  const full = (side) => (!side ? '' : (side.cutBefore ? '\u2026' : '') + side.before + side.hit + side.after + (side.cutAfter ? '\u2026' : ''));
  return {
    id: String(rec.id),
    kind: String(rec.kind ?? ''),
    key: rec.recovery?.key == null ? '' : String(rec.recovery.key),
    name: row?.name ? String(row.name) : '',
    sentence: row?.sentence ? String(row.sentence) : '',
    yours: full(row?.yours),
    now: full(row?.now),
    context: contextFields(rec.context),
  };
}

// The pre-apply root as the bytes a save would have written, with the root
// attributes this response and this tab own removed first: a recovery copy never
// carries a save token, a file id or this library's own UI state.
function recoveryHtml(apply) {
  try {
    const source = apply.recoveryRoot ?? apply.root;
    const clone = source?.cloneNode?.(true);
    if (!clone) return null;
    for (const name of TAB_LOCAL_ROOT_ATTRS) clone.removeAttribute(name);
    return serializeRecoveryClone(clone, { prepared: apply.domain === 'save' });
  } catch (err) {
    console.error('clayjs: the conflict recovery page could not be serialized; the conflict text is still stored', err);
    return null;
  }
}

// Copy the material before anything is released, and never let the store's failure
// reach the ledger: a quota or a blocked database leaves the live record exactly
// where it was. Losing the copy to this queue is bounded, never silent.
function keepConflicts(apply, ids) {
  try {
    durableQueue.push({
      apply: { id: apply.id, source: apply.source, domain: apply.domain, seq: apply.seq, etag: apply.etag, ticket: apply.ticket },
      root: recoveryHtml(apply),
      conflicts: ids.map((id) => records.get(id)).filter(Boolean).map(conflictEntry),
    });
    if (durableQueue.length > DURABLE_QUEUE_MAX) durableQueue.shift();
    drainDurable();
  } catch (err) {
    console.error('clayjs: the conflict could not be stored for a later reload; it is still here', err);
  }
}

export function completeApply(applyId, conflicts, { ticket }) {
  const apply = applies.get(applyId);
  if (!apply) return [];
  apply.ticket = ticket;
  const groups = new Map();
  for (const c of conflicts) {
    if (!isLoss(c)) continue;
    const key = c.recovery?.key ?? Symbol();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const ids = foldInsertions([...groups.values()]).map((raw) => install(apply, raw));
  if (ids.length) keepConflicts(apply, ids);
  pending.delete(applyId);
  if (!ids.length) applies.delete(applyId);
  if (ids.length) changed({ added: ids.map((id) => records.get(id)) });
  else register().changed();
  return ids;
}

export function failApply(applyId, error, { ticket = 0 } = {}) {
  const apply = applies.get(applyId);
  if (!apply) return [];
  apply.ticket = ticket;
  pending.delete(applyId);
  const id = install(apply, [{ kind: 'apply-incomplete', detail: null, error: String(error) }]);
  records.get(id).rawReports = [];
  keepConflicts(apply, [id]);
  changed({ added: [records.get(id)] });
  return [id];
}

export const conflicts = {
  get size() {
    return records.size;
  },
  list() {
    return [...records.values()];
  },
  get(id) {
    return records.get(id) || null;
  },
  acknowledge(ids, { reason } = {}) {
    if (!Array.isArray(ids)) throw new TypeError('clay.conflicts.acknowledge needs an array of ids');
    if (!REASONS.has(reason)) throw new TypeError(`clay.conflicts.acknowledge: unknown reason "${reason}"`);
    const removedIds = [];
    for (const id of ids) {
      const rec = records.get(id);
      if (!rec) continue;
      releaseProtection(rec);
      records.delete(id);
      removedIds.push(id);
      const apply = applies.get(rec.applyId);
      if (apply) {
        apply.ids.delete(id);
        if (!apply.ids.size) applies.delete(rec.applyId);
      }
    }
    if (removedIds.length) {
      changed({ removedIds, reason });
      import('../recovery/conflicts.js').then(
        (module) => module.dismissConflicts(removedIds),
        () => {}
      ).catch(() => {});
    }
    return { removedIds, remainingIds: [...records.keys()] };
  },
  claim(ids, { owner }) {
    if (!owner) throw new TypeError('clay.conflicts.claim needs an owner');
    for (const id of ids) {
      const rec = records.get(id);
      if (rec && rec.claimedBy && rec.claimedBy !== owner) {
        throw new Error(`conflict ${id} is already claimed by ${rec.claimedBy}`);
      }
    }
    const acquired = [];
    for (const id of ids) {
      const rec = records.get(id);
      if (rec && !rec.claimedBy) {
        rec.claimedBy = owner;
        acquired.push(id);
      }
    }
    if (acquired.length) changed({ updatedIds: acquired, reason: 'claimed' });
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        const freed = acquired.filter((id) => records.get(id)?.claimedBy === owner);
        for (const id of freed) records.get(id).claimedBy = null;
        if (freed.length) changed({ updatedIds: freed, reason: 'released' });
      },
    };
  },
  registerContext,

  recoveryOf(id) {
    const rec = records.get(id);
    return rec ? applies.get(rec.applyId) || null : null;
  },
  hasPendingApply() {
    return pending.size > 0;
  },
};
