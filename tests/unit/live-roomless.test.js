// A host with no room for the document (over its live budget) answers the state
// read 503 busy. Round 7 review, Opus findings 1 and 8: the stores go to file
// mode with their own pending ops, so saves carry this tab's edits, never the
// stale room value; the lane asks again a minute later (Retry-After), not every
// 8 s; once the host has room, the lane rejoins.
import { jest } from "@jest/globals";
import { createFastLane } from "../../src/live/fast-lane.js";
import { createStore } from "../../src/live/store.js";
import { Sim } from "./page/collab/room-double.js";
import { createCheckpoints, CHECKPOINT_MS } from "../../src/live/checkpoint.js";

function harness() {
  let t = 0;
  const q = [];
  const setTimer = (fn, ms) => { const h = { fn, at: t + ms, dead: false }; q.push(h); return h; };
  const clearTimer = (h) => { if (h) h.dead = true; };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const tick = async (until) => {
    for (;;) {
      await flush();
      q.sort((a, b) => a.at - b.at);
      const h = q[0];
      if (!h || h.at > until) break;
      q.shift();
      t = h.at;
      if (!h.dead) h.fn();
    }
    t = until;
  };
  return { now: () => t, setTimer, clearTimer, tick };
}

test("Opus 1, 8: after a room loss, a 503 busy state read puts the store at save speed with its edits, and the lane asks again a minute later", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const h = harness();
  let handlers, overBudget = false;
  const reads = [], posts = [];
  const transport = {
    start(x) { handlers = x; setTimeout(() => x.open({ clientId: "a", lane: "live" }), 0); return () => {}; },
    send: async (id, frame) => { posts.push(frame); return { status: 200, body: { seq: posts.length, epoch: "e2" } }; },
    fetchState: async () => {
      reads.push(h.now());
      if (overBudget) return { status: 503, code: "busy", retryAfter: 60 };
      return { epoch: reads.length === 1 ? "e1" : "e2", seq: 0, writer: "a", stores: { s: { value: { n: 0 }, last: 0, landed: 0, seen: {} } } };
    },
  };
  const store = createStore({ name: "s", value: { n: 0 } });
  const lane = createFastLane({ transport, entries: new Map([["s", { store }]]), now: h.now, setTimer: h.setTimer, clearTimer: h.clearTimer });
  store.onLocal((ops) => lane.local("s", ops, store.mark));
  lane.start();
  await h.tick(100);
  expect(store.handle.status.mode).toBe("fast");

  overBudget = true;
  handlers.close();
  handlers.open({ clientId: "a", lane: "live" });
  await h.tick(200);
  store.handle.set(["n"], 5);
  await h.tick(120_200);
  expect(store.handle.status.mode).toBe("file");
  expect(store.value).toEqual({ n: 5 });
  expect(store.pending.length).toBe(1);
  expect(posts).toEqual([]);
  const after = reads.filter((x) => x >= 100);
  expect(after.length).toBeLessThanOrEqual(3);
  expect(after[1] - after[0]).toBeGreaterThanOrEqual(60_000);

  overBudget = false;
  await h.tick(200_000);
  const mode = store.handle.status.mode;
  lane.stop();
  warn.mockRestore();
  expect(mode).toBe("fast");
  expect(posts.map((f) => f.ops)).toEqual([[{ op: "set", path: ["n"], value: 5 }]]);
});

test("Opus 1 (reviewer fixture shape): a plain 503 state read, with no code, also puts the store at save speed with its edits", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const h = harness();
  let handlers, down = false;
  const transport = {
    start(x) { handlers = x; setTimeout(() => x.open({ clientId: "a", lane: "live" }), 0); return () => {}; },
    send: async () => ({ status: 200, body: { seq: 1, epoch: "e1" } }),
    fetchState: async () => (down ? { status: 503 } : { epoch: "e1", seq: 0, writer: "a", stores: { s: { value: { n: 0 }, last: 0, landed: 0, seen: {} } } }),
  };
  const store = createStore({ name: "s", value: { n: 0 } });
  const lane = createFastLane({ transport, entries: new Map([["s", { store }]]), now: h.now, setTimer: h.setTimer, clearTimer: h.clearTimer });
  store.onLocal((ops) => lane.local("s", ops, store.mark));
  lane.start();
  await h.tick(100);
  down = true;
  handlers.close();
  handlers.open({ clientId: "a", lane: "live" });
  await h.tick(200);
  store.handle.set(["n"], 5);
  await h.tick(300_000);
  const status = { mode: store.handle.status.mode, value: store.value, pending: store.pending.length };
  lane.stop();
  warn.mockRestore();
  expect(status).toEqual({ mode: "file", value: { n: 5 }, pending: 1 });
});

// Round 8 review: the edit comes before the 503, and the real checkpoint
// scheduler (checkpoint.js) runs with the save predicate plugins/live.js uses.
// Leaving the room never drops a write (Astra 1, Opus 3), and it wakes the
// checkpoints, so the edit is saved within the save-speed interval (Astra 3).

function scheduled(transport) {
  const sim = new Sim(1);
  const store = createStore({ name: "s", value: { n: 0 } });
  const entry = { store, last: 0, landed: 0, leftAt: null };
  const saves = [];
  let lane;
  const checkpoints = createCheckpoints({
    needsSave: () => (store.handle.status.mode === "fast" ? lane.isWriter() && entry.landed < entry.last : store.pending.length > 0),
    blocked: () => false,
    save: async () => { saves.push({ at: sim.now(), value: JSON.parse(JSON.stringify(store.value)), leftAt: entry.leftAt }); store.confirm(store.mark); return { ok: true }; },
    saveNow: () => {},
    now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer,
  });
  lane = createFastLane({
    transport, entries: new Map([["s", entry]]), now: sim.now, setTimer: sim.setTimer, clearTimer: sim.clearTimer,
    onApplied: () => checkpoints.changed(), onWriter: () => checkpoints.changed(),
    onLeave: (_name, at) => { entry.leftAt = at; },
  });
  store.onLocal(() => checkpoints.changed());
  store.onLocal((ops) => lane.local("s", ops, store.mark));
  lane.start();
  return { sim, store, lane, saves, checkpoints };
}

test("Astra 1: a 503 state read while a frame is on the wire, then that frame answered 503, keeps the write pending and the save writes it", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let handlers, busy = false, posts = 0;
  const transport = {
    start(x) { handlers = x; return () => {}; },
    async fetchState() { return busy ? { status: 503, code: "busy", retryAfter: 60 } : { epoch: "e1", seq: 0, writer: "a", stores: { s: { value: { n: 0 }, last: 0, landed: 0, seen: {} } } }; },
    send() { posts++; return new Promise((resolve) => t.sim.after(100, () => resolve({ status: 503, body: { code: "busy" }, retryAfter: 60 }))); },
  };
  const t = scheduled(transport);
  t.sim.at(0, () => handlers.open({ clientId: "a" }));
  t.sim.at(100, () => t.store.handle.set(["n"], 5));
  t.sim.at(120, () => { busy = true; handlers.close(); handlers.open({ clientId: "a" }); });
  await t.sim.run(1000);
  expect({ mode: t.store.handle.status.mode, value: t.store.value, pending: t.store.pending.length, posts }).toEqual({ mode: "file", value: { n: 5 }, pending: 1, posts: 1 });
  await t.sim.run(1000 + CHECKPOINT_MS + 1000);
  t.lane.stop();
  warn.mockRestore();
  expect(t.saves.map((s) => s.value)).toEqual([{ n: 5 }]);
});

test("Opus 3: a write that landed but had not come back when the room was lost stays pending through a 503 busy minute, and the save writes it", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let handlers, busy = false;
  const transport = {
    start(x) { handlers = x; return () => {}; },
    async fetchState() { return busy ? { status: 503, code: "busy", retryAfter: 60 } : { epoch: "e1", seq: 0, writer: "a", stores: { s: { value: { n: 0 }, last: 0, landed: 0, seen: {} } } }; },
    // Lands at seq 1; its echo never comes: the room is lost first.
    async send() { return { status: 200, body: { epoch: "e1", seq: 1 } }; },
  };
  const t = scheduled(transport);
  t.sim.at(0, () => handlers.open({ clientId: "a" }));
  t.sim.at(100, () => t.store.handle.set(["n"], 5));
  t.sim.at(300, () => { busy = true; handlers.close(); handlers.open({ clientId: "a" }); });
  await t.sim.run(5000);
  expect({ mode: t.store.handle.status.mode, value: t.store.value, pending: t.store.pending.length }).toEqual({ mode: "file", value: { n: 5 }, pending: 1 });
  await t.sim.run(30_000);
  t.lane.stop();
  warn.mockRestore();
  expect(t.saves.map((s) => s.value)).toEqual([{ n: 5 }]);
});

test("Astra 3: an edit made offline in fast mode is saved within the save-speed interval once a 503 busy state read leaves the room", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  let handlers, busy = false;
  const transport = {
    start(x) { handlers = x; return () => {}; },
    async fetchState() { return busy ? { status: 503, code: "busy", retryAfter: 60 } : { epoch: "e1", seq: 0, writer: "a", stores: { s: { value: { n: 0 }, last: 0, landed: 0 } } }; },
    async send() { throw new Error("no frame while offline or out of the room"); },
  };
  const t = scheduled(transport);
  t.sim.at(0, () => handlers.open({ clientId: "a" }));
  t.sim.at(500, () => handlers.close());
  t.sim.at(600, () => t.store.handle.set(["n"], 5));
  t.sim.at(10_000, () => { busy = true; handlers.open({ clientId: "a" }); });
  await t.sim.run(10_000 + CHECKPOINT_MS + 1000);
  t.lane.stop();
  warn.mockRestore();
  expect(t.saves.map((s) => s.value)).toEqual([{ n: 5 }]);
  expect(t.saves[0].at).toBeLessThanOrEqual(10_000 + CHECKPOINT_MS);
});
