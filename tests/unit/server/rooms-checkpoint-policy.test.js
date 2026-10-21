/**
 * @jest-environment node
 */
import { createRooms, roomIsDirty, LIVE_LIMITS } from "../../../src/server/rooms/index.js";

const tag = (name, value) => `<script type="application/json" merge="${name}" clay="live">${JSON.stringify(value)}</script>`;
const DOC = `<!doctype html><html><body>${tag("game", { score: 0 })}</body></html>`;
const increment = (n) => ({ name: "game", n, ops: [{ op: "add", path: ["score"], n: 1 }] });

const setup = () => {
  const state = { now: 1_000_000, epoch: 0 };
  const rooms = createRooms({ now: () => state.now, newEpoch: () => `e${++state.epoch}` });
  return { state, rooms };
};

test("a dirty empty room outlives the retention interval, and a clean one expires", () => {
  const { state, rooms } = setup();
  const room = rooms.open("/a.html", DOC);
  expect(rooms.apply(room, "A", increment(1)).seq).toBe(1);
  expect(roomIsDirty(room)).toBe(true);
  rooms.leave(room, "A", []);
  state.now += LIVE_LIMITS.retainMs;
  rooms.sweep();
  expect(rooms.get("/a.html")).toBe(room);

  expect(rooms.markSaved(room, { seq: room.seq, stores: [{ name: "game" }] })).toBe(true);
  expect(roomIsDirty(room)).toBe(false);
  rooms.sweep(() => [], { mayExpire: () => false });
  expect(rooms.get("/a.html")).toBe(room);
  rooms.sweep();
  expect(rooms.get("/a.html")).toBeNull();
});

test("markSaved leaves a store with later frames dirty and refuses a replaced room", () => {
  const { rooms } = setup();
  const room = rooms.open("/a.html", DOC);
  rooms.apply(room, "A", increment(1));
  const capture = { seq: room.seq, stores: [{ name: "game" }] };
  rooms.apply(room, "A", increment(2));
  expect(rooms.markSaved(room, capture)).toBe(false);
  expect(roomIsDirty(room)).toBe(true);
  rooms.drop("/a.html");
  expect(rooms.markSaved(room, { seq: room.seq, stores: [{ name: "game" }] })).toBe(false);
});

test("an identical set elects its writer and records a receipt without dirtying the room", () => {
  const { rooms } = setup();
  const room = rooms.open("/a.html", DOC);
  const claim = { name: "game", n: 1, ops: [{ op: "set", path: ["score"], value: 0 }] };
  const accepted = rooms.apply(room, "A", claim, { connected: ["A"] });
  expect(accepted).toMatchObject({ seq: 0, writer: "A" });
  expect(room.seq).toBe(0);
  expect(room.stores.get("game").last).toBe(0);
  expect(room.stores.get("game").log).toEqual([]);
  expect(roomIsDirty(room)).toBe(false);
  expect(rooms.apply(room, "A", claim).duplicate).toBe(true);
  expect(rooms.state(room, "A").stores.game.seen.A).toBe(1);
  const changed = rooms.apply(room, "A", { ...claim, n: 2, ops: [{ op: "set", path: ["score"], value: 1 }] });
  expect(changed.seq).toBe(1);
  expect(room.stores.get("game").last).toBe(1);
  expect(roomIsDirty(room)).toBe(true);

  const nested = rooms.open("/nested.html", tag("game", { options: { a: 1, b: 2 } }));
  const equalObject = rooms.apply(nested, "B", { name: "game", n: 1, ops: [{ op: "set", path: ["options"], value: { b: 2, a: 1 } }] });
  expect(equalObject.seq).toBe(0);
  expect(nested.stores.get("game").value.options).toEqual({ a: 1, b: 2 });
  expect(roomIsDirty(nested)).toBe(false);
});

test("rekey moves the same room object and refuses an occupied destination or a missing source", () => {
  const { rooms } = setup();
  const room = rooms.open("/a.html", DOC);
  const other = rooms.open("/b.html", DOC);
  expect(rooms.rekey("/a.html", "/b.html")).toBe(false);
  expect(rooms.rekey("/missing.html", "/c.html")).toBe(false);
  expect(rooms.rekey("/a.html", "/a.html")).toBe(true);
  expect(rooms.rekey("/a.html", "/c.html")).toBe(true);
  expect(rooms.get("/c.html")).toBe(room);
  expect(room.key).toBe("/c.html");
  expect(rooms.get("/a.html")).toBeNull();
  expect(rooms.get("/b.html")).toBe(other);
});

test("rekey refuses a room under a persistent reservation", () => {
  const { rooms } = setup();
  rooms.open("/a.html", DOC, { nodeId: "n1" });
  const token = rooms.holdPersistent("/a.html", { nodeId: "n1" });
  expect(rooms.rekey("/a.html", "/c.html")).toBe(false);
  rooms.releasePersistent(token);
  expect(rooms.rekey("/a.html", "/c.html")).toBe(true);
});
