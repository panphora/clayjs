import { readFileSync } from 'node:fs';
import * as Y from '../../src/vendor/yjs.vendor.js';
import { createRooms, LIVE_LIMITS } from '../../src/server/rooms/live-data-rooms.js';
import { buildCandidate, pageShape } from '../../src/server/rooms/page-compaction.js';
import { serializeLive, cloneJson, stampOf } from '../../src/server/rooms/live-data-ops.js';
import { entriesOf } from '../../src/page/ybind/parts.js';
import { rangesOf, within, docRanges } from '../../src/page/ybind/containment.js';

const NET = 'net';
const TEMPLATE = readFileSync(new URL('../../tests/fixtures/ypage-template.html', import.meta.url), 'utf8');
const TAG = /merge="page" clay="live"(?: live-at="[^"]*")?>(.*?)<\/script>/;
const htmlOf = (value, at = null) => TEMPLATE.replace(TAG, () =>
  `merge="page" clay="live"${at ? ` live-at="${at}"` : ''}>${JSON.stringify(value)}</script>`);

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function run({ seed = 1, steps = 400, tabs: tabCount = 3, activeBytes = 160 * 1024, tailFloor = 8 * 1024, restarts = true, paste = 6000, log = false } = {}) {
  const r = rng(seed);
  const pick = (n) => Math.floor(r() * n);
  let clock = 1000;
  let epochs = 0;
  const limits = { activeBytes, loose: 32, soft: 16, leaseMs: 5000, tailFloor };
  let rooms = createRooms({ now: () => clock, newEpoch: () => `e${seed}-${++epochs}`, compaction: limits });
  const dueSet = new Set();
  rooms.onCompactionDue((room, { overflow }) => dueSet.add({ room, overflow }));
  let room = rooms.open('doc', TEMPLATE, { nodeId: 1 });
  const stats = { admitted: 0, refusedRetry: 0, capacity: 0, commits: { tail: 0, full: 0 }, stale: 0, staleChecked: 0, restarts: 0, resets: 0, maxLoose: 0, maxBytes: 0, unchangedRefusals: 0, reserve: 0, landed: 0 };
  const pending = [];
  let saved = cloneJson(room.stores.get('page').value);
  const admitted = [];

  const tabs = Array.from({ length: tabCount }, (_, i) => {
    const doc = new Y.Doc();
    doc.clientID = 1000 + i;
    const t = { id: `t${i}`, doc, inst: `${seed}${i}x${pick(1e6).toString(36)}`, counter: 0, n: 0, outbox: [], inflight: null, known: new Set(), journal: [], blocked: false, epoch: null };
    doc.on('updateV2', (u, origin) => { if (origin === NET) return; t.journal.push(u); t.outbox.push(u); });
    return t;
  });

  const store = () => room.stores.get('page');
  const history = [{ value: saved, epoch: room.epoch, seq: room.seq }];
  const legacy = { doc: new Y.Doc(), n: 0, writes: 0, merged: 0, keys: {} };
  legacy.doc.clientID = 900;

  const fail = (message, extra = {}) => { throw Object.assign(new Error(`seed ${seed}: ${message}`), extra); };
  const usedNow = () => {
    let total = (room.receiptBytes ?? 0) + (room.pageTransition?.bytes ?? 0) + (room.compaction?.job?.reserved ?? 0);
    for (const s of room.stores.values()) total += s.bytes + s.logBytes;
    return total;
  };

  const check = (where) => {
    const s = store();
    const shape = pageShape(s.value.y, limits);
    stats.maxLoose = Math.max(stats.maxLoose, shape.loose);
    stats.maxBytes = Math.max(stats.maxBytes, s.bytes);
    if (s.bytes > LIVE_LIMITS.storeBytes) fail(`${where}: store over the hard cap`);
    if (where === 'admit' && !shape.normal) fail(`${where}: admitted into a value out of normal form`, { shape });
    if (where === 'admit' && s.bytes > activeBytes + 64 * 1024) fail(`${where}: active value ${s.bytes} over ${activeBytes} plus the delete reserve`);
    if (s.bytes > activeBytes) stats.reserve++;
    if (rooms.used() !== usedNow()) fail(`${where}: budget ${rooms.used()} != ${usedNow()}`);
  };

  const contains = (updates) => {
    const d = new Y.Doc();
    for (const [, v] of entriesOf(store().value.y)) Y.applyUpdateV2(d, Y.fromBase64(v));
    const index = docRanges(d);
    d.destroy();
    return updates.every((u) => within(index, rangesOf(u)));
  };

  const legacyWrite = () => {
    const entry = history[pick(history.length)];
    const base = entry.value;
    for (const [, v] of entriesOf(base.y)) Y.applyUpdateV2(legacy.doc, Y.fromBase64(v), NET);
    const got = [];
    const on = (u, origin) => { if (origin !== NET) got.push(u); };
    legacy.doc.on('updateV2', on);
    const text = legacy.doc.getText('probe');
    text.insert(pick(text.length + 1), 'L'.repeat(1 + pick(r() < 0.2 ? 20000 : 60)));
    legacy.doc.off('updateV2', on);
    const update = Y.mergeUpdatesV2(got);
    const b64 = Y.toBase64(update);
    const key = `u900-${(legacy.n++).toString(36)}`;
    if (b64.length > 12 * 1024) {
      const parts = Math.ceil(b64.length / (12 * 1024));
      for (let i = 0; i < parts; i++) legacy.keys[`${key}.${i}.${parts}`] = b64.slice(i * 12 * 1024, (i + 1) * 12 * 1024);
    } else legacy.keys[key] = b64;
    const file = cloneJson(base);
    Object.assign(file.y, legacy.keys);
    if (r() < 0.3) file.y[`m900-${legacy.n}`] = Y.toBase64(Y.mergeUpdatesV2(entriesOf(base.y).map(([, v]) => Y.fromBase64(v))));
    const keysBefore = Object.keys(store().value.y);
    const valueBefore = cloneJson(store().value);
    const at = stampOf(entry.epoch, entry.seq, serializeLive(file));
    const out = rooms.fileWritten('doc', htmlOf(file, at));
    legacy.writes++;
    if (!room.stores.get('page')) fail('a merge dropped the page store');
    const after = store().value.y;
    if (keysBefore.some((k) => !(k in after) || after[k] !== valueBefore.y[k])) fail('a file merge deleted or changed a room key');
    if (!contains([update])) fail('a file merge lost the legacy edit');
    if (out?.valueChanged) legacy.merged++;
    if (out?.landed?.includes('page')) stats.landed++;
    admitted.push(update);
    if (rooms.used() !== usedNow()) fail('budget after merge');
  };

  const sync = (t) => {
    const y = store().value.y;
    for (const [k, v] of entriesOf(y)) if (!t.known.has(k)) { t.known.add(k); Y.applyUpdateV2(t.doc, Y.fromBase64(v), NET); }
    if (t.epoch !== room.epoch) {
      t.epoch = room.epoch;
      t.inflight = null;
      const scratch = new Y.Doc();
      for (const [, v] of entriesOf(y)) Y.applyUpdateV2(scratch, Y.fromBase64(v));
      const diff = Y.encodeStateAsUpdateV2(t.doc, Y.encodeStateVector(scratch));
      const covered = within(docRanges(scratch), rangesOf(Y.encodeStateAsUpdateV2(t.doc)));
      scratch.destroy();
      if (!covered) t.outbox.push(diff);
    }
  };

  const send = (t) => {
    if (t.blocked) return;
    if (!t.inflight) {
      if (!t.outbox.length) return;
      const merged = Y.mergeUpdatesV2(t.outbox);
      t.outbox = [];
      t.inflight = { key: `u${t.doc.clientID.toString(36)}-${t.inst}-${(t.counter++).toString(36)}`, value: Y.toBase64(merged), n: ++t.n, update: merged };
    }
    const f = t.inflight;
    const before = serializeLive(store().value);
    const seqBefore = room.seq;
    const res = rooms.apply(room, t.id, { name: 'page', n: f.n, epoch: room.epoch, pageGeneration: room.pageTransition?.id ?? null, compaction: 1, ops: [{ op: 'set', path: ['y', f.key], value: f.value }] });
    if (res.error || res.busy) {
      if (serializeLive(store().value) !== before || room.seq !== seqBefore) fail(`refusal ${res.error} changed the room`);
      stats.unchangedRefusals++;
      if (res.error === 'checkpoint-required') { stats.refusedRetry++; return; }
      if (res.error === 'page-full') { stats.capacity++; t.blocked = true; return; }
      fail(`unexpected refusal ${res.error || 'busy'}`);
    }
    if (res.stale) { t.inflight = null; return; }
    if (!res.duplicate) { stats.admitted++; admitted.push(f.update); }
    t.known.add(f.key);
    t.inflight = null;
    check('admit');
  };

  const compactBegin = () => {
    if (!dueSet.size) return;
    const [{ overflow }] = dueSet;
    dueSet.clear();
    const job = rooms.beginCompaction(room, { overflow });
    if (job) pending.push({ job, room, value: serializeLive(store().value) });
  };

  const compactFinish = () => {
    if (!pending.length) return;
    const entry = pending.shift();
    const { job } = entry;
    const choice = r();
    if (choice < 0.08) {
      clock += limits.leaseMs + 1;
      const next = rooms.beginCompaction(room, {});
      const before = serializeLive(store().value);
      const result = buildCandidate({ kind: job.kind, sources: job.sources });
      const answer = rooms.commitCompaction(job.token, result);
      stats.staleChecked++;
      if (!answer.refused) fail('an expired token committed');
      if (serializeLive(store().value) !== before) fail('a stale commit changed the room');
      stats.stale++;
      if (next) pending.push({ job: next, room });
      return;
    }
    if (choice < 0.12) { rooms.abandonCompaction(job.token); return; }
    const result = buildCandidate({ kind: job.kind, sources: job.sources });
    if (result.failure) fail(`candidate failed: ${result.failure}`);
    const before = serializeLive(store().value);
    const answer = rooms.commitCompaction(job.token, result);
    if (answer.refused) {
      if (serializeLive(store().value) !== before) fail(`refused commit ${answer.refused} changed the room`);
      if (entry.room !== room) { stats.stale++; return; }
      if (answer.refused !== 'stale-token') fail(`commit refused: ${answer.refused}`);
      stats.stale++;
      return;
    }
    stats.commits[answer.kind]++;
    check('commit');
    if (!contains(admitted)) fail('a commit lost an admitted update');
  };

  const edit = (t) => {
    const text = t.doc.getText('probe');
    const len = text.length;
    const roll = r();
    if (roll < 0.55 || len < 50) text.insert(pick(len + 1), 'x'.repeat(1 + pick(roll < 0.05 ? paste : 80)) + t.id);
    else text.delete(pick(len), Math.min(len, 1 + pick(400)));
  };

  for (let step = 0; step < steps; step++) {
    clock += 50;
    const t = tabs[pick(tabs.length)];
    const roll = r();
    if (roll < 0.45) edit(t);
    else if (roll < 0.75) send(t);
    else if (roll < 0.82) compactBegin();
    else if (roll < 0.9) compactFinish();
    else if (roll < 0.95) { sync(t); saved = cloneJson(store().value); history.push({ value: saved, epoch: room.epoch, seq: room.seq }); if (history.length > 8) history.shift(); }
    else if (roll < 0.97) legacyWrite();
    else if (restarts && roll < 0.985) {
      const before = saved;
      rooms = createRooms({ now: () => clock, newEpoch: () => `e${seed}-${++epochs}`, compaction: limits });
      rooms.onCompactionDue((rm, { overflow }) => dueSet.add({ room: rm, overflow }));
      room = rooms.open('doc', htmlOf(before), { nodeId: 1 });
      dueSet.clear();
      pending.length = 0;
      stats.restarts++;
      for (const x of tabs) x.known = new Set();
      history.length = 0;
      history.push({ value: cloneJson(before), epoch: room.epoch, seq: room.seq });
      admitted.length = 0;
    } else if (restarts) {
      const next = rooms.reset('doc', htmlOf(saved), { nodeId: 1 });
      if (next) { room = next; stats.resets++; for (const x of tabs) x.known = new Set(); admitted.length = 0; history.length = 0; history.push({ value: cloneJson(saved), epoch: room.epoch, seq: room.seq }); }
    }
    for (const x of tabs) if (x.epoch !== room.epoch) sync(x);
  }

  for (let round = 0; round < 400; round++) {
    let busy = false;
    for (const t of tabs) {
      sync(t);
      if (!t.blocked && (t.inflight || t.outbox.length)) { send(t); busy = true; }
    }
    if (dueSet.size) { compactBegin(); busy = true; }
    if (pending.length) { compactFinish(); busy = true; }
    clock += 50;
    if (!busy) break;
  }
  for (const t of tabs) sync(t);
  check('end');
  const lost = tabs.filter((t) => !t.blocked && !contains(t.journal));
  if (lost.length) fail(`edits lost for ${lost.map((t) => t.id)}`);
  const blocked = tabs.filter((t) => t.blocked);
  for (const t of blocked) {
    const mine = docRanges(t.doc);
    if (!t.journal.every((u) => within(mine, rangesOf(u)))) fail(`blocked tab ${t.id} lost its own edits`);
  }
  if (!blocked.length) {
    const roomDoc = new Y.Doc();
    for (const [, v] of entriesOf(store().value.y)) Y.applyUpdateV2(roomDoc, Y.fromBase64(v));
    const want = roomDoc.getText('probe').toString();
    for (const t of tabs) if (t.doc.getText('probe').toString() !== want) fail(`tab ${t.id} diverged`);
    roomDoc.destroy();
  }
  const s = store();
  const out = { seed, ...stats, legacyWrites: legacy.writes, legacyMerged: legacy.merged, blocked: blocked.length, end: { bytes: s.bytes, ...pageShape(s.value.y, limits) } };
  if (log) console.log(JSON.stringify(out));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = 1, count = 20, steps = 400, tabs = 3, restarts = 1, activeKiB = 160, paste = 6000] = process.argv.slice(2).map(Number);
  const results = [];
  for (let seed = from; seed < from + count; seed++) results.push(run({ seed, steps, tabs, restarts: Boolean(restarts), activeBytes: activeKiB * 1024, paste }));
  const sum = (k) => results.reduce((a, x) => a + x[k], 0);
  console.log(JSON.stringify({ seeds: results.length, admitted: sum('admitted'), refusedRetry: sum('refusedRetry'), capacity: sum('capacity'), stale: sum('stale'), restarts: sum('restarts'), resets: sum('resets'), unchangedRefusals: sum('unchangedRefusals'), reserve: sum('reserve'), tail: results.reduce((a, x) => a + x.commits.tail, 0), full: results.reduce((a, x) => a + x.commits.full, 0), maxLoose: Math.max(...results.map((x) => x.maxLoose)), maxBytes: Math.max(...results.map((x) => x.maxBytes)), blockedRuns: results.filter((x) => x.blocked).length, legacyWrites: sum('legacyWrites'), legacyMerged: sum('legacyMerged'), landed: sum('landed') }));
}
