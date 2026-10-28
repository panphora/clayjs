/**
 * @jest-environment node
 */
import * as Y from "../../../src/vendor/yjs.vendor.js";
import {
  createRooms,
  roomIsDirty,
  stampOf,
  serializeLive,
  inspectPage,
} from "../../../src/server/rooms/index.js";
import { buildCandidate } from "../../../src/server/rooms/page-compaction.js";

const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;
const pageTag = (value, at = null) =>
  `<script type="application/json" merge="page" clay="live"${at ? ` live-at="${at}"` : ""}>${JSON.stringify(value)}</script>`;

let clients = 200;
const insert = (text, client = (clients += 1)) => {
  const d = new Y.Doc();
  d.clientID = client;
  d.getText("flow").insert(0, text);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(d));
  d.destroy();
  return encoded;
};

const extend = (base, text, client = (clients += 1)) => {
  const d = new Y.Doc();
  d.clientID = client;
  Y.applyUpdateV2(d, Y.fromBase64(base));
  const body = d.getText("flow");
  body.insert(body.length, text);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(d));
  d.destroy();
  return encoded;
};

const seed = (text = "seed") => insert(text, 900);

const page = ({ g = 0, y } = {}) => ({ v: 1, g, y: y ?? { seed: seed() } });

const html = (value) => doc(pageTag(value));

const setOp = (key, value) => ({ op: "set", path: ["y", key], value });

const frame = (room, n, ops) => ({
  name: "page",
  epoch: room.epoch,
  n,
  pageGeneration: room.pageTransition.id,
  compaction: 1,
  ops,
});

const clock = () => {
  const state = { now: 1_000_000, epoch: 0 };
  return {
    state,
    now: () => state.now,
    rooms: (options = {}) => createRooms({ now: () => state.now, newEpoch: () => `e${++state.epoch}`, ...options }),
  };
};

const hostRoom = (c, value = page()) => {
  const rooms = c.rooms({ compaction: true });
  const room = rooms.open("/p.html", html(value), { nodeId: "n1" });
  expect(room.compaction).not.toBeNull();
  return { rooms, room };
};

const send = (rooms, room, n, pairs) => rooms.apply(room, "a", frame(room, n, pairs.map(([key, value]) => setOp(key, value))));

const store = (room) => room.stores.get("page");

const runCompaction = (rooms, room, { overflow = false } = {}) => {
  const job = rooms.beginCompaction(room, { overflow });
  expect(job).not.toBeNull();
  const built = buildCandidate({ kind: job.kind, sources: job.sources });
  expect(built.failure).toBeUndefined();
  const answer = rooms.commitCompaction(job.token, built);
  expect(answer.refused).toBeUndefined();
  return { job, answer };
};

const copy = (value) => JSON.parse(JSON.stringify(value));

const textOf = (value) => {
  const d = new Y.Doc();
  for (const text of Object.values(value.y)) Y.applyUpdateV2(d, Y.fromBase64(text));
  const body = d.getText("flow").toString();
  d.destroy();
  return body;
};

const partsOf = (base, value, count = 2) => {
  const out = {};
  const size = Math.ceil(value.length / count);
  for (let i = 0; i < count; i++) out[`${base}.${i}.${count}`] = value.slice(i * size, (i + 1) * size);
  return out;
};

const hostKey = /^f[0-9a-z]{8}-[0-9a-z]+-[0-9a-z]+$/;

test("a stale capture saved before a commit merges with nothing lost and lands it", () => {
  const c = clock();
  const { rooms, room } = hostRoom(c);
  const first = insert("tab edit");
  expect(send(rooms, room, 1, [["u1-a-1", first]]).seq).toBe(1);

  const capture = copy(store(room).value);
  runCompaction(rooms, room, { overflow: true });

  const second = insert("later edit");
  expect(send(rooms, room, 2, [["u1-a-2", second]]).seq).toBe(3);
  expect(room.compaction.contentSeq).toBe(3);

  const keys = Object.keys(store(room).value.y);
  const result = rooms.fileWritten("/p.html", doc(pageTag(capture, stampOf(room.epoch, 1, serializeLive(capture)))));

  expect(result.valueChanged).toBe(false);
  expect(result.landed).toEqual(["page"]);
  expect(store(room).landed).not.toBe(-1);
  expect(store(room).landed).toBe(1);
  expect(Object.keys(store(room).value.y)).toEqual(keys);
  expect(keys.some((key) => hostKey.test(key))).toBe(false);
  const text = textOf(store(room).value);
  expect(text).toContain("seed");
  expect(text).toContain("tab edit");
  expect(text).toContain("later edit");
});

test("a legacy file with fold keys, parts and old-format keys merges only the uncontained entries", () => {
  const c = clock();
  const base = seed("hello");
  const { rooms, room } = hostRoom(c, page({ y: { seed: base } }));
  const folded = extend(base, " world");
  const foldedKeep = extend(base, "!");

  const fileValue = {
    v: 1,
    g: 0,
    y: {
      "u1-a-1": base,
      "m1-b-1": folded,
      ...partsOf("m2-c-1", base),
      ...partsOf("m3-d-1", foldedKeep, 3),
    },
  };

  const wakes = [];
  rooms.onCompactionDue((due, options) => wakes.push(options));
  const result = rooms.fileWritten("/p.html", html(fileValue));

  expect(result.valueChanged).toBe(true);
  expect(store(room).last).toBe(1);
  expect(room.seq).toBe(1);
  expect(room.compaction.contentSeq).toBe(1);
  expect(room.compaction.lastFull).toBeNull();
  expect(wakes).toEqual([{ overflow: false }]);

  const y = store(room).value.y;
  expect(y.seed).toBe(base);
  expect(Object.hasOwn(y, "u1-a-1")).toBe(false);
  expect(Object.keys(y).filter((key) => key.startsWith("m"))).toEqual([]);
  const added = Object.keys(y).filter((key) => key !== "seed");
  expect(added).toHaveLength(2);
  for (const key of added) expect(key).toMatch(hostKey);
  expect(added.map((key) => y[key]).sort()).toEqual([folded, foldedKeep].sort());
  expect(textOf(store(room).value)).toBe("hello world!");
  expect(store(room).log.at(-1).ops.map((op) => op.path[1])).toEqual(added);
  expect(store(room).log.at(-1).merge).toBe(true);
});

test("a file lacking room keys deletes none of them", () => {
  const c = clock();
  const { rooms, room } = hostRoom(c);
  const kept = insert("room edit");
  expect(send(rooms, room, 1, [["u1-a-1", kept]]).seq).toBe(1);
  const other = insert("outside edit");

  expect(rooms.fileWritten("/p.html", html(page({ y: {} })))).toBeNull();
  expect(Object.keys(store(room).value.y).sort()).toEqual(["seed", "u1-a-1"]);
  expect(store(room).value.y["u1-a-1"]).toBe(kept);

  const result = rooms.fileWritten("/p.html", html(page({ y: { "u2-b-1": other } })));
  expect(result.valueChanged).toBe(true);
  const y = store(room).value.y;
  expect(y.seed).toBeDefined();
  expect(y["u1-a-1"]).toBe(kept);
  const added = Object.keys(y).filter((key) => key !== "seed" && key !== "u1-a-1");
  expect(added).toHaveLength(1);
  expect(added[0]).toMatch(hostKey);
  expect(y[added[0]]).toBe(other);
});

test("a file entry whose key the room holds with another value goes under a fresh f key", () => {
  const c = clock();
  const mine = seed("mine");
  const { rooms, room } = hostRoom(c, page({ y: { seed: mine } }));
  const theirs = insert("theirs");

  const result = rooms.fileWritten("/p.html", html(page({ y: { seed: theirs } })));
  expect(result.valueChanged).toBe(true);

  const y = store(room).value.y;
  expect(y.seed).toBe(mine);
  const added = Object.keys(y).filter((key) => key !== "seed");
  expect(added).toHaveLength(1);
  expect(added[0]).toMatch(hostKey);
  expect(y[added[0]]).toBe(theirs);
  expect(textOf(store(room).value)).toContain("mine");
  expect(textOf(store(room).value)).toContain("theirs");
});

test("a restored replacement through commitPage is unaffected", () => {
  const c = clock();
  const { rooms, room } = hostRoom(c);
  const before = store(room).value.y.seed;

  const replacement = page({ y: { seed: insert("replacement") } });
  const replacementHtml = html(replacement);
  expect(inspectPage(replacementHtml).kind).toBe("yjs");
  const token = rooms.reservePageReplacement("/p.html", { nodeId: "n1", html: replacementHtml });
  const committed = rooms.commitPage(token);
  expect(committed.valueChanged).toBe(true);
  expect(store(room).value).toEqual(replacement);
  expect(store(room).landed).toBe(store(room).last);
  expect(hostKey.test(Object.keys(store(room).value.y)[0])).toBe(false);

  expect(rooms.fileWritten("/p.html", replacementHtml, { restored: true })).toBeNull();
  expect(store(room).value).toEqual(replacement);
  expect(Object.keys(store(room).value.y)).toEqual(["seed"]);
  expect(store(room).value.y.seed).not.toBe(before);
  expect(roomIsDirty(room)).toBe(false);

  rooms.releasePage(token);
  const seq = store(room).last;
  const next = insert("after the restore");
  expect(send(rooms, room, 1, [["u1-a-1", next]]).seq).toBe(seq + 1);
  expect(store(room).value.y["u1-a-1"]).toBe(next);
});

test("landed and dirtiness after a clean capture, a capture before an admission and a capture after", () => {
  const c = clock();
  const { rooms, room } = hostRoom(c);

  const first = insert("first");
  expect(send(rooms, room, 1, [["u1-a-1", first]]).seq).toBe(1);
  expect(roomIsDirty(room)).toBe(true);

  const clean = copy(store(room).value);
  const landedClean = rooms.fileWritten("/p.html", doc(pageTag(clean, stampOf(room.epoch, 1, serializeLive(clean)))));
  expect(landedClean).toEqual({ room, valueChanged: false, landed: ["page"] });
  expect(store(room).landed).toBe(1);
  expect(roomIsDirty(room)).toBe(false);

  const second = insert("second");
  expect(send(rooms, room, 2, [["u1-a-2", second]]).seq).toBe(2);
  expect(room.compaction.contentSeq).toBe(2);
  expect(roomIsDirty(room)).toBe(true);

  const stale = copy(store(room).value);
  delete stale.y["u1-a-2"];
  expect(rooms.fileWritten("/p.html", doc(pageTag(stale, stampOf(room.epoch, 1, serializeLive(stale)))))).toBeNull();
  expect(store(room).landed).toBe(1);
  expect(roomIsDirty(room)).toBe(true);
  expect(Object.hasOwn(store(room).value.y, "u1-a-2")).toBe(true);

  const after = copy(store(room).value);
  const landedAfter = rooms.fileWritten("/p.html", doc(pageTag(after, stampOf(room.epoch, 2, serializeLive(after)))));
  expect(landedAfter).toEqual({ room, valueChanged: false, landed: ["page"] });
  expect(store(room).landed).toBe(2);
  expect(roomIsDirty(room)).toBe(false);
});

test("a non-host room's file merge answers as it does today", () => {
  const c = clock();
  const rooms = c.rooms();
  const base = seed("hello");
  const room = rooms.open("/p.html", html(page({ y: { seed: base } })), { nodeId: "n1" });
  expect(room.compaction).toBeNull();

  const mine = insert("mine");
  expect(send(rooms, room, 1, [["u1-a-1", mine]]).seq).toBe(1);
  expect(send(rooms, room, 2, [["u1-a-2", insert("two")]]).seq).toBe(2);

  const outside = insert("outside");
  const result = rooms.fileWritten("/p.html", html(page({ y: { seed: base, "u9-z-1": outside } })));

  expect(result).toEqual({ room, valueChanged: true, landed: [] });
  const y = store(room).value.y;
  expect(Object.keys(y).sort()).toEqual(["seed", "u1-a-1", "u1-a-2", "u9-z-1"]);
  expect(y["u9-z-1"]).toBe(outside);
  expect(y["u1-a-1"]).toBe(mine);
  expect(room.seq).toBe(3);
  expect(store(room).last).toBe(3);
  expect(store(room).landed).toBe(0);
  expect(roomIsDirty(room)).toBe(true);
  const entry = store(room).log.at(-1);
  expect(entry.merge).toBe(true);
  expect(entry.ops).toEqual([{ op: "set", path: ["y", "u9-z-1"], value: outside }]);
  for (const piece of ["hello", "mine", "two", "outside"]) expect(textOf(store(room).value)).toContain(piece);
});
