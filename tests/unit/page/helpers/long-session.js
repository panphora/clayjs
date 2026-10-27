// The long session harness, shared by the Jest test and the measure script: two real
// page editors, bindings and stores, a seeded operation log, a room that can pause,
// duplicate and reorder delivery, checkpoints through the real projection, and a journal
// that is destroyed and recovered. It owns no DOM of its own: the caller supplies the
// page (`document`) and the assertion library (`expect`).
import { performance } from "node:perf_hooks";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createPageEditor } from "../../../../src/page/editor.js";
import { createYPageBinding, docOf, walk, shapeOf } from "../../../../src/page/ybind/index.js";
import { createPageDoc } from "../../../../src/page/ybind/layout.js";
import { docFromValue } from "../../../../src/page/ybind/provider.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import { renderFromTags } from "../../../../src/page/save-projection.js";
import { canonicalPageBytes } from "../../../../src/page/ybind/recovery-proof.js";
import { moveBlock } from "../../../../src/page/blocks.js";
import { addRow, deleteRow, setCellText, selectTableCell } from "../../../../src/page/table.js";
import { createPageJournal, pageJournalContext, replayJournals } from "../../../../src/page/ybind/recovery-replay.js";
import { buildLongDocument, LONG_DOCUMENT_SEED, rng } from "./long-document.js";

const BATCH = 25;
const AUTHORITY = { host: "https://example.test", documentId: "long-session", principalId: "acct-1" };
const COVER_MAX = 256;

const clone = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settleJs = async () => { for (let i = 0; i < 8; i++) await tick(); };

function fakeChannel(writer, records) {
  let seq = 0;
  const compactions = [];
  const retire = (named) => { for (const item of named || []) records.delete(item?.id); return named || []; };
  return {
    writer,
    records,
    compactions,
    async append({ key, context, update, origin = "local", base = null }) {
      const revision = ++seq;
      const id = `${writer}-${revision}`;
      const capsuleId = `capsule:${writer}:${key}`;
      if (!records.has(capsuleId)) {
        records.set(capsuleId, {
          id: capsuleId,
          kind: "binary",
          revision: 0,
          context,
          payload: { base: base ? base.slice() : new Uint8Array(0), dependencies: new Uint8Array(0), owned: new Uint8Array(0) },
        });
      }
      records.set(id, { id, kind: "binary-batch", revision, capsuleId, origin, context, payload: update.slice() });
      return { ok: true, id, revision };
    },
    async list() { return { ok: true, records: [...records.values()] }; },
    async checkpoint({ records: named = [] } = {}) { return { ok: true, retired: retire(named) }; },
    async compact({ records: named = [] } = {}) {
      compactions.push(named.map((entry) => entry.id));
      const batches = named.map(({ id }) => records.get(id)).filter(Boolean);
      const capsule = batches.length ? records.get(batches[0].capsuleId) : null;
      if (capsule) {
        const owned = [capsule.payload.owned, ...batches.filter((b) => b.origin !== "dependency").map((b) => b.payload)].filter((b) => b && b.byteLength);
        const dependencies = [capsule.payload.dependencies, ...batches.filter((b) => b.origin === "dependency").map((b) => b.payload)].filter((b) => b && b.byteLength);
        const { mergeUpdatesV2 } = await import("../../../src/vendor/yjs.vendor.js");
        capsule.payload = {
          base: capsule.payload.base,
          dependencies: dependencies.length ? mergeUpdatesV2(dependencies) : new Uint8Array(0),
          owned: owned.length ? mergeUpdatesV2(owned) : new Uint8Array(0),
        };
      }
      return { ok: true, retired: retire(named) };
    },
    async markAcknowledged() { return { ok: true, acknowledged: 0 }; },
    async flush() { return { ok: true }; },
  };
}

function clock() {
  const queue = [];
  return {
    queue,
    setTimer(fn) { queue.push(fn); return queue.length; },
    clearTimer() {},
    flush() {
      let guard = 0;
      while (queue.length && guard++ < 200) queue.shift()();
    },
  };
}

function openTab({ id, value, clientID, journal }) {
  const store = createStore({ name: "page", value: clone(value) });
  const timers = clock();
  const binding = createYPageBinding({ store, setTimer: timers.setTimer, clearTimer: timers.clearTimer, captureTimeout: 0, journal });
  binding.ydoc.clientID = clientID;
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, {
    doc: binding.doc(),
    dispatch: binding.dispatch,
    history: false,
    undo: binding.undo,
    redo: binding.redo,
    board: binding.board,
  });
  binding.attach(view);
  return { id, store, binding, view, mount, timers, clientID };
}

function closeTab(tab) {
  if (tab.closed) return;
  tab.closed = true;
  tab.unbind?.();
  tab.view.destroy();
  tab.binding.dispose();
  tab.binding.ydoc.destroy();
  tab.mount.remove();
}

function createRoom(initial) {
  const room = {
    value: clone(initial),
    members: new Map(),
    queue: [],
    paused: false,
    deliveries: 0,
    duplicates: 0,
    reordered: 0,
  };
  room.join = (tab) => {
    room.members.set(tab.id, tab);
    tab.unbind = tab.store.onLocal((ops) => {
      const applied = [];
      for (const op of ops) {
        if (op.path.length !== 2 || op.path[0] !== "y") continue;
        if (op.op === "set") room.value.y[op.path[1]] = op.value;
        else if (op.op === "del") delete room.value.y[op.path[1]];
        applied.push(op);
      }
      if (applied.length) room.queue.push({ from: tab.id, ops: applied });
    });
    return tab;
  };
  room.leave = (id) => { room.members.delete(id); };
  room.deliver = ({ duplicate = false, reorder = false } = {}) => {
    if (room.paused) return;
    const queued = room.queue.splice(0);
    const order = reorder && queued.length > 1 ? [queued[queued.length - 1], ...queued.slice(0, -1)] : queued;
    if (reorder && queued.length > 1) room.reordered++;
    for (const item of order) {
      for (const [id, tab] of room.members) {
        if (id === item.from) continue;
        const frame = { ops: item.ops };
        tab.store.rebase(clone(room.value), { source: "remote", frame });
        tab.timers.flush();
        room.deliveries++;
        if (duplicate) {
          tab.store.rebase(clone(room.value), { source: "remote", frame });
          tab.timers.flush();
          room.duplicates++;
        }
      }
    }
  };
  room.ack = (tab) => {
    tab.store.rebase(clone(room.value), { source: "remote", confirmed: tab.store.pending.length });
    tab.timers.flush();
  };
  room.ackAll = () => { for (const tab of room.members.values()) room.ack(tab); };
  return room;
}

const TEXT_TYPES = new Set(["paragraph", "heading", "list_item", "callout", "quote", "toggle"]);
const blocksOf = (tab) => {
  const out = [];
  tab.view.state.doc.forEach((node, pos) => out.push({ id: node.attrs.id, type: node.type.name, pos, size: node.nodeSize, text: node.textContent }));
  return out;
};
const textBlocks = (tab) => blocksOf(tab).filter((block) => TEXT_TYPES.has(block.type) && block.size > 2);
const tablesOf = (tab) => blocksOf(tab).filter((block) => block.type === "table");
const pick = (r, list) => list[r.int(list.length)];
const caret = (tab, r, block) => {
  const offset = 1 + (block.text.length ? r.int(block.text.length) : 0);
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, block.pos + offset)));
};
const typeOp = (tab, r, text) => {
  const block = pick(r, textBlocks(tab));
  if (!block) return false;
  caret(tab, r, block);
  tab.view.dispatch(tab.view.state.tr.insertText(text));
  return true;
};
const rangeDeleteOp = (tab, r) => {
  const block = pick(r, textBlocks(tab));
  if (!block || !block.text.length) return false;
  const at = 1 + r.int(block.text.length);
  const width = 1 + r.int(Math.min(8, block.text.length - (at - 1)));
  tab.view.dispatch(tab.view.state.tr.delete(block.pos + at, block.pos + at + width));
  return true;
};
const acrossDeleteOp = (tab, r) => {
  const all = blocksOf(tab);
  if (all.length < 4) return false;
  const i = r.int(all.length - 3);
  const from = all[i], to = all[i + 2];
  const start = from.pos + Math.max(1, from.size - 2);
  const end = to.pos + Math.min(2, to.size - 1);
  if (start >= end) return false;
  tab.view.dispatch(tab.view.state.tr.delete(start, end));
  return true;
};
const splitOp = (tab, r) => {
  const block = pick(r, textBlocks(tab));
  if (!block) return false;
  const offset = 1 + r.int(Math.max(1, block.text.length));
  tab.view.dispatch(tab.view.state.tr.split(block.pos + offset));
  return true;
};
const moveOp = (tab, r) => {
  const block = pick(r, textBlocks(tab));
  if (!block) return false;
  caret(tab, r, block);
  moveBlock(r.next() < 0.5 ? -1 : 1)(tab.view.state, tab.view.dispatch);
  return true;
};
const undoOp = (tab) => tab.binding.undo();
const redoOp = (tab) => tab.binding.redo();
const tableCellOp = (tab, r) => {
  const table = pick(r, tablesOf(tab));
  if (!table) return false;
  const node = tab.view.state.doc.nodeAt(table.pos);
  if (!node || !node.childCount) return false;
  const row = r.int(node.childCount);
  const col = r.int(node.child(row).childCount);
  if (!selectTableCell(tab.view, table.pos, row, col)) return false;
  let cellPos = table.pos + 1;
  for (let i = 0; i < row; i++) cellPos += node.child(i).nodeSize;
  cellPos += 1;
  for (let i = 0; i < col; i++) cellPos += node.child(row).child(i).nodeSize;
  return setCellText(tab.view, cellPos, `cell ${r.int(1000)}`);
};
const tableRowOp = (tab, r) => {
  const table = pick(r, tablesOf(tab));
  if (!table) return false;
  const node = tab.view.state.doc.nodeAt(table.pos);
  if (!node || !node.childCount) return false;
  if (!selectTableCell(tab.view, table.pos, r.int(node.childCount), 0)) return false;
  if (r.next() < 0.5) addRow(true)(tab.view.state, tab.view.dispatch);
  else deleteRow(tab.view.state, tab.view.dispatch);
  return true;
};

function diffShape(a, b) {
  if (a === b) return null;
  const left = JSON.parse(a), right = JSON.parse(b);
  let at = 0;
  while (at < left.length && at < right.length && JSON.stringify(left[at]) === JSON.stringify(right[at])) at++;
  return { at, left: left[at] ?? null, right: right[at] ?? null, counts: [left.length, right.length] };
}

function strictShape(value) {
  const doc = docFromValue(value, { strict: true });
  try {
    const pd = createPageDoc(doc);
    return shapeOf(docOf(pd, walk(pd)));
  } finally {
    doc.destroy();
  }
}

export async function runLongSession({ seed = LONG_DOCUMENT_SEED, operations = 200, expect } = {}) {
  const fixture = buildLongDocument({ seed });
  const initial = clone(fixture.value);
  const room = createRoom(initial);
  const records = new Map();
  const journalA = createPageJournal({
    channel: fakeChannel("w-a", records),
    key: `${AUTHORITY.host}:${AUTHORITY.documentId}`,
    context: (base) => pageJournalContext({ authority: AUTHORITY, base }),
    base: canonicalPageBytes(initial),
  });
  let tabA = openTab({ id: "a", value: initial, clientID: 5, journal: journalA });
  const journalB = createPageJournal({
    channel: fakeChannel("w-b", records),
    key: `${AUTHORITY.host}:${AUTHORITY.documentId}`,
    context: (base) => pageJournalContext({ authority: AUTHORITY, base }),
    base: canonicalPageBytes(initial),
  });
  const tabB = openTab({ id: "b", value: initial, clientID: 6, journal: journalB });
  room.join(tabA);
  room.join(tabB);
  let now = 1_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  const r = rng(seed);
  const log = [];
  const foldViolations = [];
  const mismatches = [];
  const samples = [];
  const delivered = {};
  const refused = {};
  const cacheHighWater = { a: { cover: 0, known: 0, fold: 0 }, b: { cover: 0, known: 0, fold: 0 } };
  const reopen = { checkpointEqual: false, recoveredEqual: false };

  const watch = (tab) => tab.store.onRebase((ev) => {
    if (tab.binding.provider.stopped) return;
    const prev = ev.prev?.y ?? {};
    const next = (ev.next?.y ?? {});
    const removed = Object.keys(prev).filter((key) => !(key in next));
    if (!removed.length) return;
    const foldParts = Object.keys(next).some((key) => key[0] === "m");
    const checkpointed = tab.checkpointing === true;
    if (!foldParts && !checkpointed) foldViolations.push({ tab: tab.id, batch: tab.batch, removed: removed.slice(0, 4) });
  });
  tabA.unwatch = watch(tabA);
  tabB.unwatch = watch(tabB);

  const tabs = () => [tabA, tabB];
  const settle = async () => {
    room.deliver();
    room.ackAll();
    for (const tab of tabs()) tab.timers.flush();
    await settleJs();
    for (const tab of tabs()) tab.timers.flush();
  };

  const checkBatch = (batch) => {
    for (const tab of tabs()) {
      if (tab.binding.stats.mismatch) mismatches.push({ batch, tab: tab.id, stats: tab.binding.stats.first });
    }
    const shapes = tabs().map((tab) => shapeOf(tab.view.state.doc));
    for (const tab of tabs()) {
      const decoded = strictShape(tab.store.value);
      const diff = diffShape(decoded, shapeOf(tab.view.state.doc));
      if (diff) mismatches.push({ batch, tab: tab.id, decode: diff });
    }
    const between = diffShape(shapes[0], shapes[1]);
    if (between) mismatches.push({ batch, tabs: between });
    const idsA = Object.keys(blocksFromYValue(tabA.store.value)).sort();
    const idsB = Object.keys(blocksFromYValue(tabB.store.value)).sort();
    if (idsA.length !== idsB.length || idsA.some((id, i) => id !== idsB[i])) {
      mismatches.push({ batch, ids: [idsA.length, idsB.length], missing: idsA.filter((id) => !idsB.includes(id)).slice(0, 5) });
    }
    const here = mismatches.filter((entry) => entry.batch === batch);
    if (here.length) expect(here).toEqual([]);
    for (const tab of tabs()) {
      const diag = tab.binding.provider._diagnostics();
      const high = cacheHighWater[tab.id];
      high.cover = Math.max(high.cover, diag.cover);
      high.known = Math.max(high.known, diag.known);
      high.fold = Math.max(high.fold, diag.fold);
      const retained = Object.keys(tab.store.value.y).length + Object.keys(tab.store.authoritative.y).length;
      expect(diag.cover).toBeLessThanOrEqual(COVER_MAX);
      expect(diag.known).toBeLessThanOrEqual(retained + diag.fold);
    }
  };

  const checkpoint = ({ final: last = false } = {}) => {
    for (const tab of tabs()) tab.checkpointing = true;
    room.deliver();
    room.ackAll();
    for (const tab of tabs()) tab.timers.flush();
    const saved = clone(tabA.store.value);
    const rendered = renderFromTags([JSON.stringify(saved)]);
    const foldsBefore = new Map(tabs().map((tab) => [tab.id, new Set(Object.keys(tab.store.authoritative.y).filter((key) => key[0] === "m").map((key) => key.split(".")[0]))]));
    for (let round = 0; round < 8; round++) {
      for (const tab of tabs()) {
        tab.binding.provider.compact();
        tab.timers.flush();
      }
      room.deliver();
      room.ackAll();
      for (const tab of tabs()) tab.timers.flush();
    }
    const store = createStore({ name: "page", value: clone(saved) });
    const rebuilt = createYPageBinding({ store, captureTimeout: 0 });
    const fromBytes = shapeOf(docOf(rebuilt.pd, walk(rebuilt.pd)));
    rebuilt.dispose();
    rebuilt.ydoc.destroy();
    const checkpointDiff = diffShape(fromBytes, shapeOf(tabA.view.state.doc));
    reopen.checkpointEqual = checkpointDiff === null;
    expect(checkpointDiff).toBe(null);
    expect(typeof rendered.html).toBe("string");
    expect(rendered.rev).toBeTruthy();
    for (const tab of tabs()) tab.checkpointing = false;
    for (const tab of tabs()) {
      const keys = Object.keys(tab.store.authoritative.y);
      const foldGroups = new Set(keys.filter((key) => key[0] === "m").map((key) => key.split(".")[0]));
      const loose = keys.filter((key) => key[0] !== "m").length;
      expect([...foldGroups].filter((key) => !foldsBefore.get(tab.id).has(key)).length).toBeLessThanOrEqual(1);
      if (last) {
        expect(loose).toBeLessThanOrEqual(32);
        expect(foldGroups.size).toBeLessThanOrEqual(1);
      }
    }
    return { saved, rendered };
  };

  let recreations = 0;
  const recreate = async (op) => {
    await settle();
    const expected = shapeOf(tabA.view.state.doc);
    const expectedIds = Object.keys(blocksFromYValue(tabA.store.value));
    const disposed = tabA;
    room.leave("a");
    await settleJs();
    for (let i = 0; i < 100 && disposed.binding.journal.pending() > 0; i++) await tick();
    await settleJs();
    closeTab(disposed);
    // A disposed tab hears nothing: the room moves on without it.
    const disposedRecords = disposed.binding.journal.names().length;
    room.deliver();
    for (const tab of tabs()) tab.timers.flush();
    disposed.store.handle.set(["y", "u-disposed-probe"], "AA");
    await settleJs();
    expect(disposed.binding.journal.names().length).toBe(disposedRecords);
    expect(disposed.view.isDestroyed).toBe(true);

    const journal = createPageJournal({
      channel: fakeChannel("w-c", records),
      key: `${AUTHORITY.host}:${AUTHORITY.documentId}`,
      context: (base) => pageJournalContext({ authority: AUTHORITY, base }),
      base: canonicalPageBytes(initial),
    });
    tabA = openTab({ id: "a", value: initial, clientID: 7, journal });
    room.join(tabA);
    tabA.unwatch = watch(tabA);
    await settleJs();
    const context = await tabA.binding.journal.context();
    const listed = await tabA.binding.journal.channel.list();
    const outcome = replayJournals({ records: listed.records, current: { context, state: initial }, into: tabA.binding.ydoc });
    expect(outcome.review).toEqual([]);
    expect(outcome.replayed.length).toBeGreaterThan(0);
    tabA.binding.provider.settle();
    for (const tab of tabs()) tab.timers.flush();
    expect({ op, diff: diffShape(shapeOf(tabA.view.state.doc), expected) }).toEqual({ op, diff: null });
    expect({ op, ids: Object.keys(blocksFromYValue(tabA.store.value)) }).toEqual({ op, ids: expectedIds });
    recreations += 1;
  };

  const rejectedMove = () => {
    const tab = tabB;
    const block = pick(r, textBlocks(tab));
    const before = shapeOf(tab.view.state.doc);
    caret(tab, r, block);
    const refused = tab.binding.dispatch(tab.view.state.tr.setMeta("page-move", { ids: [block.id], afterId: null, parent: block.id }));
    expect(refused).toEqual({ status: "refused", code: "invalid-parent" });
    expect(diffShape(shapeOf(tab.view.state.doc), before)).toBe(null);
  };

  const refusedUndo = () => {
    const tab = tabB;
    while (tab.binding.undo()) { /* drain this tab's history */ }
    const before = shapeOf(tab.view.state.doc);
    expect(tab.binding.undo()).toBe(false);
    expect(diffShape(shapeOf(tab.view.state.doc), before)).toBe(null);
  };

  const kinds = [
    "type", "type", "type", "type", "type", "type", "type", "type",
    "range", "range", "range", "range",
    "across", "across",
    "split", "split", "split",
    "move", "move", "move",
    "undo", "redo",
    "tableCell", "tableCell", "tableRow",
    "remote", "remote", "remote",
    "pause", "duplicate", "reorder",
    "checkpoint",
  ];

  const run = (kind, tab) => {
    switch (kind) {
      case "type": return typeOp(tab, r, ["a", "b", "c", "xy", " "][r.int(5)]);
      case "range": return rangeDeleteOp(tab, r);
      case "across": return acrossDeleteOp(tab, r);
      case "split": return splitOp(tab, r);
      case "move": return moveOp(tab, r);
      case "undo": return undoOp(tab);
      case "redo": return redoOp(tab);
      case "tableCell": return tableCellOp(tab, r);
      case "tableRow": return tableRowOp(tab, r);
      case "remote": return typeOp(tab === tabA ? tabB : tabA, r, "remote");
      case "pause": room.paused = true; return true;
      case "duplicate": room.paused = false; room.deliver({ duplicate: true }); return true;
      case "reorder": room.paused = false; room.deliver({ reorder: true }); return true;
      case "checkpoint": room.paused = false; checkpoint(); return true;
      default: return false;
    }
  };

  try {
    for (let op = 0; op < operations; op++) {
      now += 40;
      const kind = pick(r, kinds);
      const tab = r.next() < 0.5 ? tabA : tabB;
      log.push({ op, kind, tab: tab.id });
      const startedAt = performance.now();
      const applied = run(kind, tab);
      samples.push({ kind, ms: performance.now() - startedAt });
      if (applied) delivered[kind] = (delivered[kind] ?? 0) + 1;
      else refused[kind] = (refused[kind] ?? 0) + 1;
      room.deliver();
      for (const t of tabs()) t.timers.flush();
      if ((op + 1) % BATCH === 0) {
        await settle();
        tabA.batch = tabB.batch = op + 1;
        checkBatch(op + 1);
      }
      const at = Math.floor(operations * [0.35, 0.7][recreations]);
      if (recreations < 2 && op === at) await recreate(op);
    }

    // Scripted refusals leave the content exactly as it was.
    room.paused = false;
    room.deliver();
    for (const t of tabs()) t.batch = "refusals";
    rejectedMove();
    refusedUndo();

    await settle();
    checkBatch("final");

    // A blocked room keeps this tab's typing in its journal; a matching-generation
    // reopen recovers it.
    room.paused = true;
    tabB.store.deliver({ phase: "refused", code: "too-large" });
    expect(tabB.binding.provider.stopped).toBe("too-large");
    await settleJs();
    await settleJs();
    const typed = "blocked-room-typing";
    const block = pick(r, textBlocks(tabB));
    caret(tabB, r, block);
    tabB.view.dispatch(tabB.view.state.tr.insertText(typed));
    const blockedShape = shapeOf(tabB.view.state.doc);
    await settleJs();
    expect(blockedShape).toContain(typed);
    expect(tabB.binding.journal.failure).toBe(null);
    expect(tabB.binding.journal.pending()).toBe(0);
    tabB.store.deliver({ phase: "refused", code: "too-large" });
    room.paused = false;
    room.ackAll();

    const recoveredJournal = createPageJournal({
      channel: fakeChannel("w-d", records),
      key: `${AUTHORITY.host}:${AUTHORITY.documentId}`,
      context: (base) => pageJournalContext({ authority: AUTHORITY, base }),
      base: canonicalPageBytes(initial),
    });
    const recovered = openTab({ id: "recovered", value: initial, clientID: 9, journal: recoveredJournal });
    await settleJs();
    const recoveredContext = await recovered.binding.journal.context();
    const listed = await recovered.binding.journal.channel.list();
    const outcome = replayJournals({ records: listed.records, current: { context: recoveredContext, state: initial }, into: recovered.binding.ydoc });
    expect(outcome.review).toEqual([]);
    recovered.binding.provider.settle();
    recovered.timers.flush();
    await settleJs();
    const recoveredShape = shapeOf(recovered.view.state.doc);
    const recoveredDiff = diffShape(recoveredShape, blockedShape);
    reopen.recoveredEqual = recoveredDiff === null;
    expect(recoveredDiff).toBe(null);
    expect(recoveredShape).toContain(typed);
    closeTab(recovered);

    expect(foldViolations).toEqual([]);
    expect(mismatches).toEqual([]);
    expect(tabA.binding.stats.mismatch).toBe(0);
    expect(tabB.binding.stats.mismatch).toBe(0);
    const final = checkpoint({ final: true });
    expect(tabA.binding.provider.stats.compactions).toBeGreaterThan(0);
    expect(room.deliveries).toBeGreaterThan(0);
    const compacted = JSON.stringify(final.saved);
    const times = samples.map((sample) => sample.ms).sort((a, b) => a - b);
    return {
      seed, operations, logged: log.length, batches: Math.ceil(operations / BATCH),
      blocks: fixture.total, counts: fixture.counts,
      deliveredOperations: delivered, refusedOperations: refused, samples: samples.length,
      medianMs: times[Math.floor(times.length / 2)],
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      maximumMs: times[times.length - 1],
      deliveries: room.deliveries, duplicates: room.duplicates, reordered: room.reordered,
      journalRecords: records.size, compactedBytes: compacted.length,
      compactedUtf8Bytes: new TextEncoder().encode(compacted).length,
      cacheHighWater, reopen,
      foldViolations: foldViolations.length, mismatches: mismatches.length,
      diagnostics: { a: tabA.binding.provider._diagnostics(), b: tabB.binding.provider._diagnostics() },
    };
  } finally {
    Date.now = realNow;
    for (const tab of tabs()) closeTab(tab);
  }
}
