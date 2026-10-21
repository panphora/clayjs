import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { createYProvider, enc, dec, PART, entriesOf, docFromValue } from "../../../../src/page/ybind/provider.js";
import { captureYValue } from "../../../../src/page/ybind/parts.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";

let queue;
beforeEach(() => { queue = []; });
const timers = { setTimer: (fn) => { queue.push(fn); return queue.length; }, clearTimer: () => {} };
const flush = () => { while (queue.length) queue.shift()(); };
const confirm = (store) => { store.rebase(JSON.parse(JSON.stringify(store.value)), { source: "remote", confirmed: store.pending.length }); flush(); };
const confirmAll = (store) => { for (let i = 0; i < 4; i++) confirm(store); };
const textOf = (value) => docFromValue(value).getText("flow").toString();
const start = (extra = {}) => {
  const store = createStore({ name: "page", value: { v: 1, g: 0, y: {} }, ...extra });
  const ydoc = new Y.Doc();
  ydoc.clientID = 5;
  const provider = createYProvider({ store, ydoc, ...timers });
  return { store, ydoc, provider };
};

test("a local update becomes one key", () => {
  const { store, ydoc } = start();
  ydoc.getText("flow").insert(0, "hi");
  expect(Object.keys(store.value.y)).toEqual(["u5-0"]);
  expect(textOf(store.value)).toBe("hi");
  ydoc.transact(() => ydoc.getText("flow").insert(2, "!"), NET);
  expect(Object.keys(store.value.y).length).toBe(1);
});

test("a remote key is applied once", () => {
  const { store, ydoc, provider } = start();
  const peer = new Y.Doc();
  peer.clientID = 6;
  let update;
  peer.on("updateV2", (u) => { update = u; });
  peer.getText("flow").insert(0, "from-peer");
  const value = enc(update);
  const next = { v: 1, g: 0, y: { "u6-0": value } };
  const frame = { ops: [{ op: "set", path: ["y", "u6-0"], value }] };
  store.rebase(next, { source: "remote", frame });
  store.rebase(next, { source: "remote", frame });
  expect(ydoc.getText("flow").toString()).toBe("from-peer");
  expect(provider.stats.applied).toBe(1);
});

test("a dropped op is offered again", () => {
  const { store, ydoc, provider } = start();
  ydoc.getText("flow").insert(0, "local");
  store.rebase({ v: 1, g: 0, y: {} }, { source: "state", drop: [1, 1] });
  flush();
  expect(Object.keys(store.value.y)).toEqual(["r5-1"]);
  expect(textOf(store.value)).toBe("local");
  expect(provider.stats.offered).toBe(1);
});

test("small keys are folded, once", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  expect(Object.keys(store.value.y).length).toBe(40);
  store.rebase(JSON.parse(JSON.stringify(store.value)), { source: "remote", confirmed: 40 });
  flush();
  confirmAll(store);
  const keys = Object.keys(store.value.y);
  expect(keys.length).toBe(1);
  expect(keys[0][0]).toBe("m");
  expect(textOf(store.value)).toBe("x".repeat(40));
  expect(provider.stats.compactions).toBe(1);
  flush();
  expect(Object.keys(store.value.y)).toEqual(keys);
});

test("compaction folds the seed into one entry, in parts when long", () => {
  const word = (i) => String.fromCharCode(97 + ((i * 31) % 26));
  const blocks = Array.from({ length: 200 }, (_, b) => ({ id: "b" + b, text: Array.from({ length: 350 }, (_, i) => word(i + b)).join("") }));
  const value = seedValue(blocks);
  expect(Object.keys(value.y).length).toBe(36);
  const store = createStore({ name: "page", value });
  const ydoc = new Y.Doc();
  ydoc.clientID = 5;
  for (const k of Object.keys(value.y).sort()) Y.applyUpdateV2(ydoc, dec(value.y[k]), NET);
  const provider = createYProvider({ store, ydoc, setTimer: (fn) => { fn(); return 1; }, clearTimer: () => {} });
  provider.settle();
  confirmAll(store);
  const keys = Object.keys(store.value.y);
  expect(entriesOf(store.value.y).length).toBe(1);
  expect(new Set(keys.map((k) => k.split(".")[0])).size).toBe(1);
  for (const k of keys) {
    expect(k[0]).toBe("m");
    expect(store.value.y[k].length).toBeLessThanOrEqual(PART);
  }
  expect(textOf(store.value).length).toBe(70000);
});

test("compaction collapses duplicate copies of the state", () => {
  const { store, ydoc, provider } = start();
  ydoc.getText("flow").insert(0, "z".repeat(3000));
  const copy = enc(Y.encodeStateAsUpdateV2(ydoc));
  for (let i = 0; i < 40; i++) store.handle.set(["y", `dup${i}`], copy);
  store.rebase(JSON.parse(JSON.stringify(store.value)), { source: "remote", confirmed: 41 });
  flush();
  confirmAll(store);
  expect(provider.stats.compactions).toBe(1);
  const total = Object.values(store.value.y).reduce((n, v) => n + v.length, 0);
  expect(total).toBeLessThan(copy.length * 2);
  expect(textOf(store.value)).toBe("z".repeat(3000));
});

test("entriesOf joins complete groups only", () => {
  expect(entriesOf({ a: "x", "b.0.2": "he", "b.1.2": "llo", "c.0.3": "1", "c.2.3": "3" })).toEqual([["a", "x"], ["b", "hello"]]);
});

const FRAME_CAP = 63 * 1024;

function makeRoom() {
  const value = { v: 1, g: 0, y: {} };
  const members = [];
  return {
    value,
    refusals: 0,
    join(store) { members.push(store); return store; },
    offer(store) {
      const ops = [];
      for (const k of Object.keys(store.value.y)) {
        if (Object.prototype.hasOwnProperty.call(value.y, k)) continue;
        const v = store.value.y[k];
        if (v.length > FRAME_CAP) { this.refusals++; continue; }
        value.y[k] = v;
        ops.push({ op: "set", path: ["y", k], value: v });
      }
      return ops;
    },
    publish(from, ops) {
      if (!ops.length) return;
      for (const other of members) {
        if (other === from) continue;
        other.rebase(JSON.parse(JSON.stringify(value)), { source: "remote", frame: { ops } });
      }
    },
  };
}

const open = (clientID) => {
  const store = createStore({ name: "page", value: { v: 1, g: 0, y: {} } });
  const ydoc = new Y.Doc();
  ydoc.clientID = clientID;
  const provider = createYProvider({ store, ydoc, ...timers });
  return { store, ydoc, provider };
};

test("a long offer goes out in parts and converges", () => {
  const warns = [];
  const realWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(" "));
  try {
    const room = makeRoom();
    const a = open(5);
    const b = open(6);
    room.join(a.store);
    room.join(b.store);
    const chunk = "x".repeat(2000);
    for (let i = 0; i < 40; i++) b.ydoc.getText("flow").insert(i * 2000, chunk);
    expect(Object.keys(b.store.value.y).length).toBe(40);
    b.store.rebase({ v: 1, g: 0, y: {} }, { source: "state", drop: [1, 40] });
    flush();
    room.publish(b.store, room.offer(b.store));
    flush();
    room.publish(a.store, room.offer(a.store));
    flush();
    const keys = Object.keys(room.value.y);
    expect(keys.some((k) => /\.\d+\.\d+$/.test(k))).toBe(true);
    expect(keys.every((k) => room.value.y[k].length <= PART)).toBe(true);
    expect(room.refusals).toBe(0);
    expect(warns.join(" ")).not.toMatch(/too-large|refused/);
    expect(b.ydoc.getText("flow").toString().length).toBe(80000);
    expect(a.ydoc.getText("flow").toString()).toBe(b.ydoc.getText("flow").toString());
  } finally {
    console.warn = realWarn;
  }
});

test("compaction folds a complete long entry and leaves an incomplete one", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const long = (client, ch) => {
    const d = new Y.Doc();
    d.clientID = client;
    d.getText("flow").insert(0, ch.repeat(30000));
    const s = enc(Y.encodeStateAsUpdateV2(d));
    const n = Math.ceil(s.length / PART);
    return Object.fromEntries(Array.from({ length: n }, (_, i) => [`${ch}long.${i}.${n}`, s.slice(i * PART, (i + 1) * PART)]));
  };
  const done = long(77, "y");
  const half = long(78, "w");
  delete half[Object.keys(half).at(-1)];
  for (const [k, v] of Object.entries({ ...done, ...half })) store.handle.set(["y", k], v);
  store.rebase(JSON.parse(JSON.stringify(store.value)), { source: "remote", confirmed: 40 });
  flush();
  confirmAll(store);
  expect(provider.stats.compactions).toBe(1);
  for (const k of Object.keys(done)) expect(store.value.y[k]).toBeUndefined();
  for (const [k, v] of Object.entries(half)) expect(store.value.y[k]).toBe(v);
  expect(textOf(store.value)).toContain("y".repeat(30000));
  const captured = docFromValue(captureYValue(store.value), { strict: true });
  expect(captured.getText("flow").toString()).toContain("y".repeat(30000));
  captured.destroy();
});

test("a later fold removes an incomplete older fold after covering its state", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  store.handle.set(["y", "mold.0.2"], "AAAA");
  store.rebase(JSON.parse(JSON.stringify(store.value)), { source: "remote", confirmed: store.pending.length });
  expect(entriesOf(store.authoritative.y).some(([key]) => key === "mold")).toBe(false);
  expect(docFromValue(captureYValue(store.authoritative), { strict: true }).getText("flow").toString()).toBe("x".repeat(40));
  flush();
  expect(provider.stats.compactions).toBe(1);
  confirmAll(store);
  expect(store.value.y["mold.0.2"]).toBeUndefined();
  expect(docFromValue(store.value, { strict: true }).getText("flow").toString()).toBe("x".repeat(40));
});
