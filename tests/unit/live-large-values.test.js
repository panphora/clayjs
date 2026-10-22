import { createRooms } from "../../src/server/rooms/index.js";
import { createStore } from "../../src/live/store.js";
import { cloneJson } from "../../src/live/ops.js";
import { createFastLane, FRAME_BYTES } from "../../src/live/fast-lane.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;
const tag = (name, value) => `<script type="application/json" merge="${name}" clay="live">${JSON.stringify(value)}</script>`;
const ERROR_STATUS = { "bad-frame": 400, "unknown-store": 404, "too-large": 413, "bad-op": 422, "receipt-expired": 409, "page-converting": 503, "page-generation": 409, "page-format": 409, "page-conversion-required": 409 };
const BODY_CAP = 5 * 1024 * 1024;
const sizeOf = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length;

// Real rooms, two tabs: each send is one POST, capped as the host's body parser
// is, and every applied frame reaches both tabs as the route's `data` event does.
function harness(initial, { bodyCap = BODY_CAP } = {}) {
  const rooms = createRooms({ newEpoch: (() => { let n = 0; return () => `e${++n}`; })() });
  const room = rooms.open("doc", doc(...Object.entries(initial).map(([name, value]) => tag(name, value))));
  const posts = [];
  const handlers = new Map();
  const tabs = new Map();
  const make = (id) => {
    const entries = new Map();
    for (const [name, store] of room.stores) {
      entries.set(name, { store: createStore({ name, value: cloneJson(store.value) }) });
    }
    const deliveries = [];
    for (const entry of entries.values()) entry.store.onDelivery((event) => deliveries.push(event));
    const transport = {
      start(h) {
        handlers.set(id, h);
        return () => handlers.delete(id);
      },
      fetchState: async () => cloneJson(rooms.state(room, id, null)),
      send: async (client, frame) => {
        const body = JSON.stringify(frame);
        const bytes = sizeOf(body);
        posts.push({ id: client, frame: cloneJson(frame), bytes });
        if (bytes > bodyCap) return { status: 413, body: { code: "too-large" } };
        const result = rooms.apply(room, client, frame);
        if (result.error) return { status: ERROR_STATUS[result.error], body: { code: result.error } };
        if (result.duplicate) return { status: 200, body: { duplicate: true, seq: result.seq, epoch: result.epoch } };
        if (result.stale) return { status: 200, body: { stale: true, epoch: result.epoch } };
        const applied = { epoch: result.epoch, seq: result.seq, name: result.name, ops: result.ops, from: client, n: frame.n, receiptGeneration: result.receiptGeneration };
        for (const h of handlers.values()) h.frame(cloneJson(applied));
        return { status: 200, body: { seq: result.seq, epoch: result.epoch, receiptGeneration: result.receiptGeneration } };
      },
    };
    const lane = createFastLane({ transport, entries });
    for (const [name, entry] of entries) entry.store.onLocal((ops) => lane.local(name, ops, entry.store.mark));
    lane.start();
    handlers.get(id).open({ clientId: id, lane: "live" });
    const handle = (name) => entries.get(name).store.handle;
    const t = { id, entries, lane, deliveries, handle };
    tabs.set(id, t);
    return t;
  };
  return { rooms, room, posts, make };
}

const roomValue = (room, name) => room.stores.get(name).value;

test("a 200 KB object value goes in one frame of its own and reaches both tabs whole", async () => {
  const h = harness({ game: { s: 0 } });
  const a = h.make("a");
  const b = h.make("b");
  await sleep(100);
  const obj = {};
  for (let i = 0; i < 400; i++) obj["k" + i] = "v".repeat(500);
  h.posts.length = 0;
  const changes = [];
  b.handle("game").on("change", (change) => changes.push(change));
  a.handle("game").set(["obj"], obj);
  await sleep(200);
  expect(h.posts).toHaveLength(1);
  expect(h.posts[0].frame.ops).toHaveLength(1);
  expect(h.posts[0].bytes).toBeGreaterThan(FRAME_BYTES);
  expect(roomValue(h.room, "game").obj).toEqual(obj);
  expect(a.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(b.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(a.entries.get("game").store.pending).toEqual([]);
  expect(a.deliveries.filter((e) => e.phase === "undone" || e.phase === "refused")).toEqual([]);
  expect(changes).toHaveLength(1);
  a.lane.stop();
  b.lane.stop();
});

test("a 200 KB string value goes in one frame of its own and reaches both tabs whole", async () => {
  const h = harness({ game: { s: 0 } });
  const a = h.make("a");
  const b = h.make("b");
  await sleep(100);
  const str = "y".repeat(200 * 1024);
  h.posts.length = 0;
  const changes = [];
  b.handle("game").on("change", (change) => changes.push(change));
  a.handle("game").set(["str"], str);
  await sleep(200);
  expect(h.posts).toHaveLength(1);
  expect(h.posts[0].frame.ops).toHaveLength(1);
  expect(h.posts[0].bytes).toBeGreaterThan(FRAME_BYTES);
  expect(roomValue(h.room, "game").str).toBe(str);
  expect(a.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(b.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(a.entries.get("game").store.pending).toEqual([]);
  expect(a.deliveries.filter((e) => e.phase === "undone" || e.phase === "refused")).toEqual([]);
  expect(changes).toHaveLength(1);
  a.lane.stop();
  b.lane.stop();
});

test("a 200 KB array element goes in one frame of its own and reaches both tabs whole", async () => {
  const h = harness({ game: { list: [0, 1, 2] } });
  const a = h.make("a");
  const b = h.make("b");
  await sleep(100);
  const element = "z".repeat(200 * 1024);
  h.posts.length = 0;
  const changes = [];
  b.handle("game").on("change", (change) => changes.push(change));
  a.handle("game").set(["list", 1], element);
  await sleep(200);
  expect(h.posts).toHaveLength(1);
  expect(h.posts[0].frame.ops).toHaveLength(1);
  expect(h.posts[0].bytes).toBeGreaterThan(FRAME_BYTES);
  expect(roomValue(h.room, "game").list).toEqual([0, element, 2]);
  expect(a.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(b.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(a.entries.get("game").store.pending).toEqual([]);
  expect(a.deliveries.filter((e) => e.phase === "undone" || e.phase === "refused")).toEqual([]);
  expect(changes).toHaveLength(1);
  a.lane.stop();
  b.lane.stop();
});

test("a small key, a 200 KB key, then another small key go out in three frames in that order", async () => {
  const h = harness({ game: { s: 0 } });
  const a = h.make("a");
  const b = h.make("b");
  await sleep(100);
  const big = "q".repeat(200 * 1024);
  h.posts.length = 0;
  a.handle("game").update((draft) => {
    draft.before = 1;
    draft.big = big;
    draft.after = 2;
  });
  await sleep(200);
  expect(h.posts.map((p) => p.frame.ops.map((op) => op.path[0]))).toEqual([["before"], ["big"], ["after"]]);
  expect(roomValue(h.room, "game")).toEqual({ s: 0, before: 1, big, after: 2 });
  expect(a.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  expect(b.handle("game").toJSON()).toEqual(roomValue(h.room, "game"));
  a.lane.stop();
  b.lane.stop();
});

test("a 4.5 MB value is refused too-large and is gone from every tab and the room", async () => {
  const h = harness({ game: { s: 0 } });
  const a = h.make("a");
  const b = h.make("b");
  await sleep(100);
  h.posts.length = 0;
  a.handle("game").set(["big"], "w".repeat(4.5 * 1024 * 1024));
  await sleep(500);
  expect(h.posts).toHaveLength(1);
  expect(h.posts[0].bytes).toBeGreaterThan(FRAME_BYTES);
  expect(a.handle("game").toJSON()).toEqual({ s: 0 });
  expect(a.entries.get("game").store.pending).toEqual([]);
  expect(a.deliveries.find((e) => e.phase === "refused")).toMatchObject({ code: "too-large" });
  expect("big" in roomValue(h.room, "game")).toBe(false);
  expect(b.handle("game").toJSON()).toEqual({ s: 0 });
  a.lane.stop();
  b.lane.stop();
});

test("an old 64 KB host refuses the lone op and tab A undoes it", async () => {
  const h = harness({ game: { s: 0 } }, { bodyCap: 64 * 1024 });
  const a = h.make("a");
  const b = h.make("b");
  await sleep(100);
  h.posts.length = 0;
  a.handle("game").set(["big"], "w".repeat(200 * 1024));
  await sleep(200);
  expect(h.posts).toHaveLength(1);
  expect(h.posts[0].bytes).toBeGreaterThan(FRAME_BYTES);
  expect(a.handle("game").toJSON()).toEqual({ s: 0 });
  expect(a.entries.get("game").store.pending).toEqual([]);
  expect(a.deliveries.find((e) => e.phase === "refused")).toMatchObject({ code: "too-large" });
  expect("big" in roomValue(h.room, "game")).toBe(false);
  expect(b.handle("game").toJSON()).toEqual({ s: 0 });
  a.lane.stop();
  b.lane.stop();
});
