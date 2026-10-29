import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createYProvider, entriesOf, docFromValue, PART, enc } from "../../../../src/page/ybind/provider.js";

const clone = (v) => JSON.parse(JSON.stringify(v));

let queue;
beforeEach(() => { queue = []; });
const timers = { setTimer: (fn) => { queue.push(fn); return queue.length; }, clearTimer: () => {} };
const flush = () => { while (queue.length) queue.shift()(); };

const COMPACTION = { v: 1, loose: 32, activeBytes: 1024 };

const textOf = (value) => {
  const doc = docFromValue(value);
  const text = doc.getText("flow").toString();
  doc.destroy();
  return text;
};
const keysUnder = (value, first) => Object.keys(value.y ?? {}).filter((k) => k[0] === first);

const makeHost = ({ value = { v: 1, g: 0, y: {} }, clientID = 5, compaction = COMPACTION, journal = null } = {}) => {
  const store = createStore({ name: "page", value });
  const ydoc = new Y.Doc();
  ydoc.clientID = clientID;
  const room = { value: clone(value) };
  const ops = [];
  store.onLocal((batch) => {
    for (const op of batch) {
      ops.push(op);
      if (op.path.length !== 2 || op.path[0] !== "y") continue;
      if (op.op === "set") room.value.y[op.path[1]] = op.value;
      else if (op.op === "del") delete room.value.y[op.path[1]];
    }
  });
  const provider = createYProvider({ store, ydoc, journal, ...timers });
  const enter = () => { store.rebase(clone(room.value), { source: "state", room: { compaction } }); flush(); };
  const ack = (descriptor = compaction) => {
    store.rebase(clone(room.value), { source: "state", room: { compaction: descriptor }, confirmed: store.pending.length });
    flush();
  };
  return { store, ydoc, provider, room, ops, enter, ack };
};

test("a slow ack keeps one frame in flight and batches 50 transactions into one key", () => {
  const h = makeHost();
  h.enter();
  for (let i = 0; i < 50; i++) h.ydoc.getText("flow").insert(i, "x");
  expect(keysUnder(h.store.value, "u")).toHaveLength(1);
  expect(h.provider.pending).toBe(true);
  h.ack();
  expect(keysUnder(h.store.value, "u")).toHaveLength(2);
  expect(h.provider.pending).toBe(false);
  h.ack();
  expect(keysUnder(h.store.value, "u")).toHaveLength(2);
  expect(textOf(h.store.value)).toBe("x".repeat(50));
  expect(h.provider.stats.compactions).toBe(0);
  expect(h.provider.stopped).toBe(null);
});

test("host mode never writes a del op, an m key or a part key", () => {
  const h = makeHost();
  h.enter();
  for (let i = 0; i < 50; i++) {
    h.ydoc.getText("flow").insert(i, "x");
    h.ack();
  }
  expect(h.ops.length).toBeGreaterThan(32);
  expect(h.ops.every((op) => op.op === "set" && op.path.length === 2 && op.path[0] === "y")).toBe(true);
  const keys = Object.keys(h.store.value.y);
  expect(keys.some((k) => k[0] === "m")).toBe(false);
  expect(keys.some((k) => k.includes("."))).toBe(false);
  expect(h.provider.stats.compactions).toBe(0);
  expect(textOf(h.store.value)).toBe("x".repeat(50));
});

test("a 3 MB paste travels as one whole key", () => {
  const h = makeHost();
  h.enter();
  h.ydoc.getText("flow").insert(0, "z".repeat(3_000_000));
  const keys = keysUnder(h.store.value, "u");
  expect(keys).toHaveLength(1);
  expect(keys[0].includes(".")).toBe(false);
  expect(h.store.value.y[keys[0]].length).toBeGreaterThan(PART);
  expect(Object.keys(h.store.value.y)).toHaveLength(1);
  expect(textOf(h.store.value).length).toBe(3_000_000);
}, 30000);

test("a page-immutable refusal offers the content again as one r key", () => {
  const h = makeHost();
  h.enter();
  h.ydoc.getText("flow").insert(0, "kept");
  expect(keysUnder(h.store.value, "u")).toHaveLength(1);
  h.store.deliver({ phase: "refused", code: "page-immutable" });
  const pending = h.store.pendingEntries();
  h.store.rebase(h.store.authoritative, { source: "state", drop: [pending[0].id, pending.at(-1).id] });
  flush();
  expect(keysUnder(h.store.value, "u")).toHaveLength(0);
  expect(keysUnder(h.store.value, "r")).toHaveLength(1);
  expect(h.provider.stats.offered).toBe(1);
  expect(h.provider.pending).toBe(false);
  expect(h.provider.stopped).toBe(null);
  expect(textOf(h.store.value)).toBe("kept");
});

test("a page-full refusal stops the provider with the document and journal intact", () => {
  const journaled = [];
  const journal = { local: (u) => journaled.push(u), dependency: () => {} };
  const h = makeHost({ journal });
  h.enter();
  h.ydoc.getText("flow").insert(0, "mine");
  expect(keysUnder(h.store.value, "u")).toHaveLength(1);
  h.store.deliver({ phase: "refused", code: "page-full" });
  flush();
  expect(h.provider.stopped).toBe("page-full");
  expect(h.ydoc.getText("flow").toString()).toBe("mine");
  expect(journaled).toHaveLength(1);
  expect(textOf(h.store.value)).toBe("mine");
  h.ydoc.getText("flow").insert(4, "more");
  expect(keysUnder(h.store.value, "u")).toHaveLength(1);
  expect(journaled).toHaveLength(2);
  expect(h.ydoc.getText("flow").toString()).toBe("minemore");
  expect(h.provider.pending).toBe(false);
});

test("a recreated provider with the same client id writes new key names", () => {
  const start = (random) => {
    const real = Math.random;
    Math.random = () => random;
    try { return makeHost({ clientID: 5 }); } finally { Math.random = real; }
  };
  const first = start(0.5);
  first.enter();
  first.ydoc.getText("flow").insert(0, "a");
  const [one] = keysUnder(first.store.value, "u");
  first.provider.dispose();
  first.ydoc.destroy();
  const second = start(0.25);
  second.enter();
  second.ydoc.getText("flow").insert(0, "b");
  const [two] = keysUnder(second.store.value, "u");
  expect(one).toMatch(/^u5-[0-9a-z]+-0$/);
  expect(two).toMatch(/^u5-[0-9a-z]+-0$/);
  expect(two).not.toBe(one);
  expect(textOf(second.store.value)).toBe("b");
});

test("a state rebase with a compaction descriptor switches a legacy provider to host mode", () => {
  const h = makeHost({ compaction: null });
  h.enter();
  h.ydoc.getText("flow").insert(0, "legacy");
  const [legacyKey] = keysUnder(h.store.value, "u");
  expect(legacyKey).toBe("u5-0");
  h.store.rebase(clone(h.room.value), { source: "state", room: { compaction: COMPACTION } });
  flush();
  h.ydoc.getText("flow").insert(6, "!");
  h.ack(COMPACTION);
  const keys = keysUnder(h.store.value, "u");
  expect(keys).toHaveLength(2);
  const hostKey = keys.find((k) => k !== legacyKey);
  expect(hostKey).toMatch(/^u5-[0-9a-z]+-1$/);
  expect(h.provider.stats.compactions).toBe(0);
  expect(textOf(h.store.value)).toBe("legacy!");
});

test("without a compaction descriptor the provider folds as it always did", () => {
  const h = makeHost({ compaction: null });
  h.enter();
  for (let i = 0; i < 40; i++) h.ydoc.getText("flow").insert(i, "x");
  expect(Object.keys(h.store.value.y).length).toBe(40);
  h.ack();
  h.ack();
  h.ack();
  expect(h.provider.stats.compactions).toBe(1);
  const keys = Object.keys(h.store.value.y);
  expect(keys.some((k) => k[0] === "m")).toBe(true);
  for (const k of keys) expect(k.split("-")).toHaveLength(2);
  expect(h.ops.some((op) => op.op === "del")).toBe(true);
  expect(entriesOf(h.store.value.y)).toHaveLength(1);
  expect(textOf(h.store.value)).toBe("x".repeat(40));
});

test("a pending op that is not the provider's own does not hold the outbox", () => {
  const h = makeHost();
  h.enter();
  h.ydoc.getText("flow").insert(0, "mine");
  h.ack();
  const other = docFromValue(h.room.value);
  other.getText("flow").insert(4, "!");
  h.room.value.y["u9-0"] = enc(Y.encodeStateAsUpdateV2(other));
  other.destroy();
  h.enter();
  h.store.handle.set(["y", "u9-0"], h.store.value.y["u9-0"]);
  expect(h.store.pending.length).toBe(1);
  const before = new Set(Object.keys(h.store.value.y));
  h.ydoc.getText("flow").insert(0, "!");
  const added = Object.keys(h.store.value.y).filter((k) => !before.has(k));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatch(/^u5-/);
  expect(h.store.pending.length).toBe(2);
  expect(textOf(h.store.value)).toBe("!mine!");
});
