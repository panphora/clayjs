/**
 * @jest-environment node
 */
import { jest } from "@jest/globals";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import {
  createRooms,
  roomIsDirty,
  COMPACTION,
  ROOM_ERROR_STATUS,
  COMPACTOR,
} from "../../../src/server/rooms/index.js";
import { buildCandidate, isCheckpointKey, pageShape } from "../../../src/live/page-compaction.js";
import { rangesOf, within, docRanges } from "../../../src/page/ybind/containment.js";

const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;
const pageTag = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;

let clients = 100;
const insert = (text, client = (clients += 1)) => {
  const d = new Y.Doc();
  d.clientID = client;
  d.getText("flow").insert(0, text);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(d));
  d.destroy();
  return encoded;
};

let keys = 0;
const nextKey = () => `u1-a-${(++keys).toString(36)}`;
const setOp = (key, value) => ({ op: "set", path: ["y", key], value });

const seed = (text = "seed") => insert(text, 900);

const html = ({ g = 0, text = "seed" } = {}) => doc(pageTag({ v: 1, g, y: { seed: seed(text) } }));

const clock = () => {
  const state = { now: 1_000_000, epoch: 0 };
  return {
    state,
    now: () => state.now,
    rooms: (options = {}) => createRooms({ now: () => state.now, newEpoch: () => `e${++state.epoch}`, ...options }),
  };
};

const frame = (room, n, ops, over = {}) => ({
  name: "page",
  epoch: room.epoch,
  n,
  pageGeneration: room.pageTransition.id,
  compaction: 1,
  ops,
  ...over,
});

// Everything a refusal must leave alone, and a commit changes on purpose.
const snapshot = (room) => {
  const store = room.stores.get("page");
  return {
    value: JSON.stringify(store.value),
    bytes: store.bytes,
    seq: room.seq,
    last: store.last,
    landed: store.landed,
    log: JSON.stringify(store.log),
    logBytes: store.logBytes,
    receipts: JSON.stringify([...room.lastN]),
    receiptBytes: room.receiptBytes ?? 0,
  };
};

const expectUsed = (rooms) => {
  let total = 0;
  for (const key of rooms.keys()) {
    const room = rooms.get(key);
    total += (room.receiptBytes ?? 0) + (room.pageTransition?.bytes ?? 0) + (room.compaction?.job?.reserved ?? 0);
    for (const store of room.stores.values()) total += store.bytes + store.logBytes;
  }
  expect(rooms.used()).toBe(total);
};

const open = (rooms, options) => rooms.open("/p.html", html(options), { nodeId: "n1" });

const send = (rooms, room, n, pairs, over = {}) => rooms.apply(room, "a", frame(room, n, pairs.map(([key, value]) => setOp(key, value)), over));

const fill = (rooms, room, count, start = 1) => {
  let n = start;
  let left = count;
  while (left > 0) {
    const take = Math.min(4, left);
    const pairs = [];
    for (let i = 0; i < take; i++) pairs.push([nextKey(), insert(`batched ${left}-${i}`)]);
    const answer = send(rooms, room, n++, pairs);
    expect(answer.ops).toHaveLength(take);
    expect(answer.duplicate).toBeUndefined();
    left -= take;
  }
  return n;
};

const run = (rooms, room, { overflow = false } = {}) => {
  const job = rooms.beginCompaction(room, { overflow });
  expect(job).not.toBeNull();
  const built = buildCandidate({ kind: job.kind, sources: job.sources });
  expect(built.failure).toBeUndefined();
  const answer = rooms.commitCompaction(job.token, built);
  expect(answer.refused).toBeUndefined();
  return { job, answer };
};

const integrated = (value) => {
  const d = new Y.Doc();
  for (const text of Object.values(value.y)) Y.applyUpdateV2(d, Y.fromBase64(text));
  return d;
};

test("compaction off leaves the frame and state answers as they are today", () => {
  const c = clock();
  const rooms = c.rooms();
  const room = open(rooms);
  const page = rooms.state(room, "a", null);
  expect(Object.keys(page.stores.page).sort()).toEqual(["ephemeral", "floor", "from", "landed", "last", "seen", "value"]);
  expect(page.stores.page.value).toEqual({ v: 1, g: 0, y: room.stores.get("page").value.y });

  const key = nextKey();
  expect(rooms.apply(room, "a", { name: "page", epoch: room.epoch, n: 1, pageGeneration: room.pageTransition.id, ops: [setOp(key, insert("free"))] }))
    .toEqual({ seq: 1, epoch: room.epoch, name: "page", ops: [setOp(key, room.stores.get("page").value.y[key])], writer: "a", checkpoint: false, receiptGeneration: 0, pageGeneration: room.pageTransition.id });
  const del = rooms.apply(room, "a", { name: "page", epoch: room.epoch, n: 2, pageGeneration: room.pageTransition.id, ops: [{ op: "del", path: ["y", key] }] });
  expect(del.error).toBeUndefined();
  expect(Object.hasOwn(room.stores.get("page").value.y, key)).toBe(false);
  expect(rooms.state(room, "a", null).stores.page.compaction).toBeUndefined();
});

test("a host mode room advertises the descriptor and admits one whole client key", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms, { g: 7 });
  expect(room.compaction).toMatchObject({ fence: 0, job: null, failed: null });
  const state = rooms.state(room, "a", null, { compaction: 1 });
  expect(state.stores.page.compaction).toEqual({ v: 1, loose: COMPACTION.loose, activeBytes: COMPACTION.activeBytes });

  const key = nextKey();
  const answer = send(rooms, room, 1, [[key, insert("hello")]]);
  expect(answer.seq).toBe(1);
  expect(room.stores.get("page").value.y[key]).toBe(answer.ops[0].value);
  expect(room.compaction.contentSeq).toBe(1);
  expect(room.stores.get("page").value.g).toBe(7);
  expectUsed(rooms);
});

test("every refusal code leaves the value, the seq, the log and the receipts unchanged", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const key = nextKey();
  expect(send(rooms, room, 1, [[key, insert("kept")]]).seq).toBe(1);

  const refused = (answer, code) => {
    const before = snapshot(room);
    expect(answer.error).toBe(code);
    expect(snapshot(room)).toEqual(before);
    expectUsed(rooms);
  };

  refused(send(rooms, room, 2, [[nextKey(), insert("x")]], { compaction: 2 }), "page-upgrade");
  refused(rooms.apply(room, "a", frame(room, 2, [{ op: "del", path: ["y", key] }])), "page-immutable");
  refused(send(rooms, room, 2, [["seed", insert("x")]]), "page-immutable");
  refused(send(rooms, room, 2, [[key, insert("different")]]), "page-immutable");
  refused(send(rooms, room, 2, [[nextKey(), "not base64 at all!"]]), "page-update-invalid");
  refused(send(rooms, room, 2, [[nextKey(), insert("a")], [nextKey(), insert("b")], [nextKey(), insert("c")], [nextKey(), insert("d")], [nextKey(), insert("e")]]), "page-batch");

  const before = snapshot(room);
  expect(send(rooms, room, 2, [[key, room.stores.get("page").value.y[key]]]).seq).toBeGreaterThan(0);
  expect(JSON.stringify(room.stores.get("page").value)).toBe(before.value);
});

test("a retired key is refused, and the loose bound asks for a checkpoint", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const key = nextKey();
  expect(send(rooms, room, 1, [[key, insert("retired")]]).seq).toBe(1);
  const { answer } = run(rooms, room, { overflow: true });
  expect(answer.ops.filter((op) => op.op === "del").map((op) => op.path[1])).toEqual(["seed", key]);
  expect(answer.ops.at(-1).op).toBe("set");
  expect(room.compaction.retired.has(key)).toBe(true);

  const before = snapshot(room);
  expect(send(rooms, room, 2, [[key, insert("again")]]).error).toBe("page-immutable");
  expect(snapshot(room)).toEqual(before);

  const wakes = [];
  rooms.onCompactionDue((due, options) => wakes.push(options));
  const next = fill(rooms, room, COMPACTION.loose, 10);
  expect(pageShape(room.stores.get("page").value.y).loose).toBe(COMPACTION.loose);
  const refused = send(rooms, room, next, [[nextKey(), insert("over")]]);
  expect(refused).toMatchObject({ error: "checkpoint-required", retryAfter: 0 });
  expect(wakes.length).toBeGreaterThan(0);
  expectUsed(rooms);
});

test("a failed room refuses every page frame until it is rebuilt", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  expect(send(rooms, room, 1, [[nextKey(), insert("one")]]).seq).toBe(1);
  const job = rooms.beginCompaction(room, { overflow: true });
  expect(job).not.toBeNull();
  expect(rooms.abandonCompaction(job.token, { failed: "worker-crash" })).toBe(true);
  expect(room.compaction.failed).toMatchObject({ reason: "worker-crash" });

  const before = snapshot(room);
  expect(send(rooms, room, 2, [[nextKey(), insert("two")]]).error).toBe("compaction-failed");
  expect(snapshot(room)).toEqual(before);
  expect(rooms.beginCompaction(room)).toBeNull();
  expectUsed(rooms);

  const rebuilt = rooms.reset("/p.html", html());
  expect(rebuilt.compaction.failed).toBeNull();
  expect(send(rooms, rebuilt, 1, [[nextKey(), insert("three")]]).seq).toBe(1);
  expectUsed(rooms);
});

test("four contenders at the loose bound get one slot and one commit", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const next = fill(rooms, room, COMPACTION.loose);
  const wakes = [];
  rooms.onCompactionDue((due, options) => wakes.push(options));
  expect(send(rooms, room, next, [[nextKey(), insert("over the bound")]]).error).toBe("checkpoint-required");
  expect(wakes).toEqual([{ overflow: false }]);

  const contenders = [0, 1, 2, 3].map(() => rooms.beginCompaction(room, { overflow: true }));
  expect(contenders.filter(Boolean)).toHaveLength(1);
  const job = contenders.find(Boolean);
  expect(room.compaction.job.token).toBe(job.token);
  expectUsed(rooms);

  const built = buildCandidate({ kind: job.kind, sources: job.sources });
  const answer = rooms.commitCompaction(job.token, built);
  expect(answer.from).toBe(COMPACTOR);
  expect(pageShape(room.stores.get("page").value.y)).toMatchObject({ normal: true, loose: 0, checkpoints: 1 });
  expect(rooms.commitCompaction(job.token, built)).toEqual({ refused: "stale-token" });
  expectUsed(rooms);
});

test("a crashed compactor's token is stale and retires nothing", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  expect(send(rooms, room, 1, [[nextKey(), insert("before the crash")]]).seq).toBe(1);
  const usedBefore = rooms.used();
  const job = rooms.beginCompaction(room, { overflow: true });
  expect(rooms.used()).toBeGreaterThan(usedBefore);
  expect(rooms.abandonCompaction(job.token)).toBe(true);
  expect(rooms.used()).toBe(usedBefore);
  const before = snapshot(room);
  const built = buildCandidate({ kind: job.kind, sources: job.sources });
  expect(rooms.commitCompaction(job.token, built)).toEqual({ refused: "stale-token" });
  expect(snapshot(room)).toEqual(before);
  expect(room.compaction.retired.size).toBe(0);
  expect(rooms.abandonCompaction(job.token)).toBe(false);
  expectUsed(rooms);
});

test("a candidate that drops a deletion fails the proof and the full candidate keeps it", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const kept = insert("keep me");
  const doomed = insert("delete me");
  const keptKey = nextKey();
  const doomedKey = nextKey();
  expect(send(rooms, room, 1, [[keptKey, kept]]).seq).toBe(1);
  expect(send(rooms, room, 2, [[doomedKey, doomed]]).seq).toBe(2);

  const deleting = new Y.Doc();
  deleting.clientID = (clients += 1);
  for (const text of [seed(), kept, doomed]) Y.applyUpdateV2(deleting, Y.fromBase64(text));
  deleting.getText("flow").delete(0, 4);
  const removal = Y.toBase64(Y.encodeStateAsUpdateV2(deleting));
  deleting.destroy();
  const removalKey = nextKey();
  expect(send(rooms, room, 3, [[removalKey, removal]]).seq).toBe(3);

  const job = rooms.beginCompaction(room, { overflow: true });
  expect(job.sources.map(([source]) => source)).toEqual(expect.arrayContaining(["seed", keptKey, doomedKey, removalKey]));
  const withoutDeletion = buildCandidate({ kind: job.kind, sources: job.sources.filter(([source]) => source !== removalKey) });
  expect(withoutDeletion.failure).toBeUndefined();
  const partial = new Y.Doc();
  Y.applyUpdateV2(partial, Y.fromBase64(withoutDeletion.update));
  expect(within(docRanges(partial), rangesOf(Y.fromBase64(removal)))).toBe(false);
  partial.destroy();

  const before = snapshot(room);
  const answer = rooms.commitCompaction(job.token, withoutDeletion);
  expect(answer.refused).toBeUndefined();
  expect(snapshot(room)).not.toEqual(before);
  expect(integrated(room.stores.get("page").value).getText("flow").toString()).toContain("keep me");
  expectUsed(rooms);
});

test("admission counts one budget across rooms", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true, liveBytes: 64 * 1024 });
  const first = open(rooms);
  const second = rooms.open("/q.html", html({ text: "other" }), { nodeId: "n2" });
  expect(send(rooms, first, 1, [[nextKey(), insert("first")]]).seq).toBe(1);
  expect(send(rooms, second, 1, [[nextKey(), insert("second")]]).seq).toBe(1);
  expect(rooms.keys()).toEqual(["/p.html", "/q.html"]);
  expectUsed(rooms);

  const job = rooms.beginCompaction(first, { overflow: true });
  expect(job).not.toBeNull();
  expectUsed(rooms);
  rooms.abandonCompaction(job.token);
  expectUsed(rooms);

  rooms.drop("/q.html");
  expectUsed(rooms);
  expect(send(rooms, first, 2, [[nextKey(), insert("after the drop")]]).seq).toBeGreaterThan(1);
  expectUsed(rooms);
});

test("two hundred cycles keep every admitted edit and one checkpoint", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms, { g: 3 });
  const oracle = new Y.Doc();
  Y.applyUpdateV2(oracle, Y.fromBase64(room.stores.get("page").value.y.seed));
  for (let cycle = 1; cycle <= 200; cycle++) {
    const text = insert(`edit ${cycle} `);
    const answer = send(rooms, room, cycle, [[nextKey(), text]]);
    expect(answer.seq).toBeGreaterThan(cycle - 1);
    Y.applyUpdateV2(oracle, Y.fromBase64(text));
    const { answer: committed } = run(rooms, room, { overflow: true });
    expect(committed.seq).toBeGreaterThan(0);
    const value = room.stores.get("page").value;
    expect(value.v).toBe(1);
    expect(value.g).toBe(3);
    expect(pageShape(value.y)).toMatchObject({ normal: true, loose: 0, checkpoints: 1 });
    expect(integrated(value).getText("flow").toString()).toBe(oracle.getText("flow").toString());
  }
  expect(room.compaction.retired.size).toBe(400);
  expectUsed(rooms);
  oracle.destroy();
});

test("a stale token after reset, drop, commitPage and the lease changes nothing", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const first = open(rooms);
  const key = nextKey();
  expect(send(rooms, first, 1, [[key, insert("sources")]]).seq).toBe(1);

  const begin = (target) => {
    const job = rooms.beginCompaction(target, { overflow: true });
    expect(job).not.toBeNull();
    return { job, built: buildCandidate({ kind: job.kind, sources: job.sources }) };
  };

  const reset = begin(first);
  const room = rooms.reset("/p.html", html());
  const beforeReset = snapshot(first);
  expect(rooms.commitCompaction(reset.job.token, reset.built)).toEqual({ refused: "stale-token" });
  expect(snapshot(first)).toEqual(beforeReset);
  expect(first.compaction.job).toBe(null);
  expect(room).toBe(rooms.get("/p.html"));
  expect(room.compaction).toMatchObject({ fence: 0, job: null, failed: null });
  expect(room.compaction.retired.size).toBe(0);
  expectUsed(rooms);

  const room2 = rooms.open("/q.html", html(), { nodeId: "n2" });
  expect(send(rooms, room2, 1, [[nextKey(), insert("second room")]]).seq).toBe(1);
  const dropped = rooms.beginCompaction(room2, { overflow: true });
  expect(dropped).not.toBeNull();
  const droppedBuilt = buildCandidate({ kind: dropped.kind, sources: dropped.sources });
  const beforeDrop = snapshot(room2);
  rooms.drop("/q.html");
  expect(rooms.get("/q.html")).toBeNull();
  expectUsed(rooms);
  expect(rooms.commitCompaction(dropped.token, droppedBuilt)).toEqual({ refused: "stale-token" });
  expect(snapshot(room2)).toEqual(beforeDrop);
  expectUsed(rooms);

  const leased = rooms.beginCompaction(room, { overflow: true });
  const leasedBuilt = buildCandidate({ kind: leased.kind, sources: leased.sources });
  const beforeLease = snapshot(room);
  c.state.now += COMPACTION.leaseMs + 1;
  rooms.sweep();
  expect(room.compaction.job).toBeNull();
  expect(rooms.commitCompaction(leased.token, leasedBuilt)).toEqual({ refused: "stale-token" });
  expect(snapshot(room)).toEqual(beforeLease);
  expectUsed(rooms);

  expect(send(rooms, room, 2, [[nextKey(), insert("after the lease")]]).seq).toBeGreaterThan(0);
  const replaced = rooms.beginCompaction(room, { overflow: true });
  expect(replaced).not.toBeNull();
  const replacedBuilt = buildCandidate({ kind: replaced.kind, sources: replaced.sources });
  const token = rooms.reservePageReplacement("/p.html", { nodeId: "n1", html: doc(pageTag({ v: 1, g: 0, y: { seed: seed("replaced") } })) });
  expect(rooms.commitPage(token).valueChanged).toBe(true);
  expect(room.compaction).toMatchObject({ fence: 0, job: null, failed: null });
  expect(room.compaction.legacy.size).toBe(0);
  const afterPage = snapshot(room);
  expect(rooms.commitCompaction(replaced.token, replacedBuilt)).toEqual({ refused: "stale-token" });
  expect(snapshot(room)).toEqual(afterPage);
  expect(room.pageTransition.format).toBe("yjs");
  expect(rooms.commitPage(token)).toBe(rooms.commitPage(token));
  expectUsed(rooms);
});

test("used matches a recount after every operation", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  expect(rooms.used()).toBe(0);
  const room = open(rooms);
  expectUsed(rooms);
  send(rooms, room, 1, [[nextKey(), insert("one")]]);
  expectUsed(rooms);
  const job = rooms.beginCompaction(room, { overflow: true });
  expectUsed(rooms);
  rooms.abandonCompaction(job.token);
  expectUsed(rooms);
  const { answer } = run(rooms, room, { overflow: true });
  expect(answer.kind).toBe("full");
  expectUsed(rooms);
  send(rooms, room, 3, [[nextKey(), insert("refused")], [nextKey(), insert("refused")], [nextKey(), insert("refused")], [nextKey(), insert("refused")], [nextKey(), insert("refused")]]);
  expectUsed(rooms);
  c.state.now += COMPACTION.leaseMs + 1;
  const expired = rooms.beginCompaction(room, { overflow: true });
  expect(expired).not.toBeNull();
  rooms.sweep();
  expectUsed(rooms);
  rooms.drop("/p.html");
  expectUsed(rooms);
});

test("a clean room stays clean through a full commit and is never committed as a page", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms, { g: 9 });
  const spy = jest.spyOn(rooms, "commitPage");
  expect(roomIsDirty(room)).toBe(false);
  const value = room.stores.get("page").value;
  expect(Object.keys(value.y)).toEqual(["seed"]);
  const { answer } = run(rooms, room, { overflow: true });
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
  expect(roomIsDirty(room)).toBe(false);
  expect(room.stores.get("page").landed).toBe(room.stores.get("page").last);
  expect(room.stores.get("page").value.v).toBe(1);
  expect(room.stores.get("page").value.g).toBe(9);
  expect(room.stores.get("page").value.y.seed).toBeUndefined();
  expect(answer.landed).toBe(answer.seq);
  expect(Object.keys(room.stores.get("page").value.y)).toHaveLength(1);
  expect(isCheckpointKey(Object.keys(room.stores.get("page").value.y)[0])).toBe(true);
  expect(Object.keys(room.stores.get("page").value.y)).not.toContain("seed");
});

test("successive full commits write fresh checkpoint keys", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const first = run(rooms, room, { overflow: true }).answer;
  const second = run(rooms, room, { overflow: true }).answer;
  const keyOf = (answer) => answer.ops.at(-1).path[1];
  const keys = [keyOf(first), keyOf(second)];
  expect(keys[0]).toMatch(/^c[0-9a-z]{8}-[0-9a-z]+$/);
  expect(keys[1]).toMatch(/^c[0-9a-z]{8}-[0-9a-z]+$/);
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys).not.toContain("seed");
  expect(first.ops.at(-1).op).toBe("set");
  expect(second.ops.filter((op) => op.op === "del").map((op) => op.path[1])).toEqual([keys[0]]);
  expect(Object.keys(room.stores.get("page").value.y)).toEqual([keys[1]]);
});

test("a legacy client's state hides the page store and a declared client's carries it", () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  expect(send(rooms, room, 1, [[nextKey(), insert("content")]]).seq).toBe(1);

  expect(rooms.state(room, "old", null, { compaction: 0 }).stores.page).toBeUndefined();
  expect([...room.compaction.legacy]).toEqual(["old"]);
  expect(rooms.state(room, "new", null, { compaction: 1 }).stores.page.compaction.v).toBe(1);
  expect(rooms.state(room, "new").stores.page).toBeDefined();

  const push = rooms.state(room, "old");
  expect(push.stores.page).toBeUndefined();
  expect(rooms.state(room, "new").stores.page).toBeDefined();
  expect(rooms.state(room, null).stores.page).toBeDefined();
});

test("the compaction status table names every refusal the room can answer", () => {
  expect(ROOM_ERROR_STATUS).toEqual({
    "checkpoint-required": 503, "page-full": 409, "compaction-failed": 409,
    "page-immutable": 409, "page-batch": 409, "page-update-invalid": 422, "page-upgrade": 404,
  });
  expect(COMPACTOR).toBe("compactor");
});
