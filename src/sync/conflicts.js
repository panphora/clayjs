import { registerUnsavedState } from '../lib/unsaved-state.js';

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
let registration = null;

function nextId(prefix = '') {
  return `${nonce}:${prefix}${++counter}`;
}

function register() {
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

function isLoss(c) {
  const r = c.recovery;
  return !r || (r.localLost !== false && r.applied !== false);
}

function install(apply, raw) {
  const id = nextId();
  const rec = Object.assign(raw[0], {
    id, applyId: apply.id, source: apply.source, ticket: apply.ticket,
    rawReports: raw, claimedBy: null,
  });
  records.set(id, rec);
  apply.ids.add(id);
  return id;
}

export function beginApply({ source, seq = null, etag = null, domain, root }) {
  const id = nextId('a');
  applies.set(id, { id, source, seq, etag, ticket: 0, domain, root, ids: new Set() });
  pending.add(id);
  register().changed();
  return id;
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
  const ids = [...groups.values()].map((raw) => install(apply, raw));
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
      records.delete(id);
      removedIds.push(id);
      const apply = applies.get(rec.applyId);
      if (apply) {
        apply.ids.delete(id);
        if (!apply.ids.size) applies.delete(rec.applyId);
      }
    }
    if (removedIds.length) changed({ removedIds, reason });
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
  recoveryOf(id) {
    const rec = records.get(id);
    return rec ? applies.get(rec.applyId) || null : null;
  },
  hasPendingApply() {
    return pending.size > 0;
  },
};
