import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { createYProvider, enc, entriesOf, docFromValue } from "../../../../src/page/ybind/provider.js";
import { captureYValue } from "../../../../src/page/ybind/parts.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const encoder = new TextEncoder();
const utf8 = (text) => encoder.encode(text).length;

let queue;
beforeEach(() => { queue = []; });
const timers = { setTimer: (fn) => { queue.push(fn); return queue.length; }, clearTimer: () => {} };
const flush = () => { while (queue.length) queue.shift()(); };

const textOf = (value) => {
  const doc = docFromValue(value);
  const text = doc.getText("flow").toString();
  doc.destroy();
  return text;
};

const start = (value = { v: 1, g: 0, y: {} }, clientID = 5, compact) => {
  const store = createStore({ name: "page", value });
  const ydoc = new Y.Doc();
  ydoc.clientID = clientID;
  const provider = createYProvider({ store, ydoc, ...(compact ? { compact } : {}), ...timers });
  return { store, ydoc, provider };
};

const confirm = (store, value = clone(store.value)) => {
  store.rebase(value, { source: "remote", confirmed: store.pending.length });
  flush();
};

const echo = (store, value = clone(store.value)) => {
  store.rebase(value, { source: "remote" });
  flush();
};

const retained = (store) => new Set([...Object.keys(store.authoritative.y ?? {}), ...Object.keys(store.value.y ?? {})]);
const keysUnder = (value, first) => Object.keys(value.y).filter((k) => k[0] === first);

const makeRoom = (initial = { v: 1, g: 0, y: {} }) => {
  const room = { value: clone(initial), members: [] };
  room.join = (tab) => {
    room.members.push(tab);
    tab.store.onLocal((ops) => {
      for (const op of ops) {
        if (op.path.length !== 2 || op.path[0] !== "y") continue;
        if (op.op === "set") room.value.y[op.path[1]] = op.value;
        else if (op.op === "del") delete room.value.y[op.path[1]];
      }
      for (const other of room.members) if (other !== tab) other.store.rebase(clone(room.value), { source: "remote", frame: { ops } });
    });
    return tab;
  };
  room.ack = (tab) => { tab.store.rebase(clone(room.value), { source: "remote", confirmed: tab.store.pending.length }); flush(); };
  return room;
};

test("the 1,200-edit probe keeps known bounded by retained references", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 1200; i++) {
    ydoc.getText("flow").insert(i, "x");
    if (i % 40 === 39) confirm(store);
  }
  for (let i = 0; i < 3; i++) confirm(store);
  const live = retained(store);
  for (const key of provider.known) expect(live.has(key)).toBe(true);
  expect(provider.stats.compactions).toBeGreaterThan(10);
  expect(provider._diagnostics().known).toBeLessThan(5);
  expect(keysUnder(store.value, "m").length).toBeGreaterThan(0);
  expect(textOf(store.value)).toBe("x".repeat(1200));
});

test("a delayed fold part keeps every input until the authority has it all", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const inputs = clone(store.value.y);
  echo(store);
  expect(provider.stats.compactions).toBe(1);
  expect(keysUnder(store.value, "m").length).toBe(1);
  echo(store, { v: 1, g: 0, y: clone(inputs) });
  for (const [k, v] of Object.entries(inputs)) expect(store.value.y[k]).toBe(v);
  expect(textOf(store.value)).toBe("x".repeat(40));
  confirm(store);
  expect(keysUnder(store.value, "u").length).toBe(0);
  expect(textOf(store.value)).toBe("x".repeat(40));
});

test("an altered fold part never retires the originals", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const inputs = clone(store.value.y);
  echo(store);
  expect(provider.stats.compactions).toBe(1);
  const part = keysUnder(store.value, "m")[0];
  const other = new Y.Doc();
  other.clientID = 99;
  other.getText("flow").insert(0, "ZZZ");
  const altered = { v: 1, g: 0, y: { ...clone(store.authoritative.y), [part]: enc(Y.encodeStateAsUpdateV2(other)) } };
  store.rebase(altered, { source: "remote", confirmed: store.pending.length });
  flush();
  confirm(store);
  expect(provider.stats.compactions).toBe(1);
  for (const [k, v] of Object.entries(inputs)) expect(store.value.y[k]).toBe(v);
  expect(textOf(store.value).startsWith("x")).toBe(true);
  expect(store.value.y[part]).toBe(altered.y[part]);
});

test("a fold whose inputs were rewritten is abandoned once its parts arrive", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const inputs = clone(store.value.y);
  echo(store);
  expect(provider.stats.compactions).toBe(1);
  const [part] = keysUnder(store.value, "m");
  const partValue = store.value.y[part];
  const keys = Object.keys(inputs).filter((k) => k[0] === "u");
  const rewritten = enc(Y.mergeUpdatesV2([Y.fromBase64(inputs[keys[0]]), Y.fromBase64(inputs[keys[1]])]));

  confirm(store, { v: 1, g: 0, y: { ...clone(inputs), [keys[0]]: rewritten, [part]: partValue } });

  expect(store.value.y[keys[0]]).toBe(rewritten);
  expect(keysUnder(store.value, "u").length).toBe(40);
  expect(keysUnder(store.value, "m")).toEqual([]);
  expect(textOf(store.value)).toBe("x".repeat(40));

  for (let i = 40; i < 80; i++) ydoc.getText("flow").insert(i, "x");
  echo(store);
  expect(provider.stats.compactions).toBe(2);
  expect(keysUnder(store.value, "m").length).toBe(1);
  expect(textOf(store.value)).toBe("x".repeat(80));
});

test("an edit made during a fold survives it", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const before = new Set(Object.keys(store.value.y));
  echo(store);
  expect(provider.stats.compactions).toBe(1);
  ydoc.getText("flow").insert(40, "y");
  const typed = Object.keys(store.value.y).filter((k) => !before.has(k) && k[0] === "u");
  expect(typed.length).toBe(1);
  confirm(store);
  confirm(store);
  expect(store.value.y[typed[0]]).toBeDefined();
  expect(textOf(store.value)).toBe("x".repeat(40) + "y");
});

test("the same fold acknowledged twice retires its inputs once", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  echo(store);
  expect(provider.stats.compactions).toBe(1);
  confirm(store);
  confirm(store);
  const settled = provider._diagnostics().known;
  expect(provider.stats.compactions).toBe(1);
  expect(provider._diagnostics().known).toBe(settled);
  expect(Object.keys(store.value.y).length).toBe(1);
  expect(textOf(store.value)).toBe("x".repeat(40));
});

test("a deletion changes no state vector and still has to be covered", () => {
  const { store, ydoc, provider } = start();
  const text = ydoc.getText("flow");
  text.insert(0, "abc");
  const before = Y.encodeStateVector(ydoc);
  text.delete(1, 1);
  expect([...Y.encodeStateVector(ydoc)]).toEqual([...before]);
  for (let i = 0; i < 40; i++) text.insert(text.length, "x");
  provider.compact();
  confirm(store);
  confirm(store);
  expect(provider.stats.compactions).toBe(1);
  expect(Object.keys(store.value.y).length).toBe(1);
  expect(textOf(store.value)).toBe("ac" + "x".repeat(40));
  const rebuilt = docFromValue(store.value);
  const deletes = (doc) => Y.equalDeleteSets(Y.createDeleteSetFromStructStore(doc.store), Y.createDeleteSetFromStructStore(ydoc.store));
  expect(deletes(rebuilt)).toBe(true);
  rebuilt.destroy();
});

test("an incomplete multipart value is never a covered input", () => {
  const { store, ydoc, provider } = start();
  store.handle.set(["y", "plong.0.3"], "AAAA");
  store.rebase(clone(store.value), { source: "remote", confirmed: 1 });
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  confirm(store);
  confirm(store);
  expect(provider.stats.compactions).toBe(1);
  expect(store.value.y["plong.0.3"]).toBe("AAAA");
  expect(store.value.y["plong.1.3"]).toBeUndefined();
  expect(entriesOf(store.authoritative.y).some(([k]) => k === "plong")).toBe(false);
  expect(textOf(store.value)).toBe("x".repeat(40));
});

test("the fold is measured in UTF-8 bytes, keys and escapes included", () => {
  const edits = (tab) => { for (let i = 0; i < 40; i++) tab.ydoc.getText("flow").insert(i, "x"); };
  const probe = start();
  edits(probe);
  echo(probe.store);
  probe.provider.compact();
  expect(probe.provider.stats.compactions).toBe(1);
  const peak = clone(probe.store.value);
  const room = utf8(JSON.stringify(peak)) + 450;
  probe.provider.dispose();
  const parts = Object.fromEntries(Object.entries(peak.y).filter(([k]) => k[0] === "m"));

  const fits = start({ v: 1, g: 0, y: {} }, 5, { keys: 32, room });
  edits(fits);
  echo(fits.store);
  fits.provider.compact();
  expect(fits.provider.stats.compactions).toBe(1);

  const note = "\u00e9".repeat(300);
  const crowded = start({ v: 1, g: 0, y: {}, note }, 5, { keys: 32, room });
  edits(crowded);
  echo(crowded.store);
  const candidate = JSON.stringify({ ...clone(crowded.store.value), y: { ...clone(crowded.store.value.y), ...parts } });
  expect(candidate.length).toBeLessThan(room);
  expect(utf8(candidate)).toBeGreaterThan(room);
  expect(crowded.provider.compact()).toBe(false);
  expect(crowded.provider.stats.compactions).toBe(0);
  expect(Object.keys(crowded.store.value.y).length).toBe(40);
  expect(textOf(crowded.store.value)).toBe("x".repeat(40));
});

test("two tabs compacting at once still converge", () => {
  const room = makeRoom();
  const a = room.join(start({ v: 1, g: 0, y: {} }, 5));
  const b = room.join(start({ v: 1, g: 0, y: {} }, 6));
  const edit = (tab, n) => { const text = tab.ydoc.getText("flow"); for (let i = 0; i < n; i++) text.insert(text.length, "ab"[i % 2]); };
  for (let round = 0; round < 8; round++) {
    edit(a, 20);
    edit(b, 20);
    flush();
    room.ack(a);
    room.ack(b);
  }
  for (let round = 0; round < 4; round++) {
    room.ack(a);
    room.ack(b);
  }
  expect(a.provider.stats.compactions + b.provider.stats.compactions).toBeGreaterThan(0);
  expect(a.ydoc.getText("flow").toString()).toBe(b.ydoc.getText("flow").toString());
  expect(textOf(a.store.value)).toBe(textOf(b.store.value));
  expect(entriesOf(room.value.y).length).toBeLessThan(35);
  expect(entriesOf(a.store.authoritative.y).length).toBeLessThan(35);
  expect(entriesOf(b.store.authoritative.y).length).toBeLessThan(35);
  for (const tab of [a, b]) {
    const live = retained(tab.store);
    for (const key of tab.provider.known) expect(live.has(key)).toBe(true);
    expect(tab.provider._diagnostics().known).toBeLessThan(70);
  }
});

test("a coverage proof for one value never retires a different value under the same key", () => {
  const { store, ydoc, provider } = start({ v: 1, g: 0, y: {} }, 5, { keys: 0 });
  ydoc.getText("flow").insert(0, "hello");
  const value = store.value.y["u5-0"];
  store.handle.set(["y", "mpe"], value);
  store.rebase(clone(store.value), { source: "remote", confirmed: 2 });
  provider.compact();
  expect(store.value.y["u5-0"]).toBeUndefined();
  const other = new Y.Doc();
  other.clientID = 7;
  other.getText("flow").insert(0, "!");
  const changed = enc(Y.encodeStateAsUpdateV2(other));
  store.rebase({ v: 1, g: 0, y: { ...clone(store.authoritative.y), "u5-0": changed } }, { source: "remote", confirmed: store.pending.length });
  flush();
  expect(store.value.y["u5-0"]).toBe(changed);
  provider.compact();
  expect(store.value.y["u5-0"]).toBe(changed);
  confirm(store);
  confirm(store);
  expect(textOf(store.value)).toContain("hello");
});

test("an old entry redelivered after pruning changes nothing", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const old = clone(store.value.y);
  confirm(store);
  confirm(store);
  confirm(store);
  expect(provider.stats.compactions).toBe(1);
  expect(provider._diagnostics().known).toBeLessThan(5);
  const key = Object.keys(old).filter((k) => k[0] === "u")[0];
  const applied = provider.stats.applied;
  const next = { ...clone(store.authoritative), y: { ...clone(store.authoritative.y), [key]: old[key] } };
  store.rebase(next, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value: old[key] }] } });
  flush();
  expect(provider.stats.applied).toBe(applied + 1);
  expect(textOf(store.value)).toBe("x".repeat(40));
  confirm(store);
  expect(textOf(store.value)).toBe("x".repeat(40));
});

test("a blocked generation or admission compacts nothing", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  store.rebase({ v: 1, g: 1, y: clone(store.value.y) }, { source: "remote" });
  flush();
  expect(provider.compact()).toBe(false);
  expect(provider.stats.compactions).toBe(0);
  expect(textOf(store.value)).toBe("x".repeat(40));

  const stopped = start({ v: 1, g: 0, y: {} }, 8);
  for (let i = 0; i < 40; i++) stopped.ydoc.getText("flow").insert(i, "x");
  stopped.store.deliver({ phase: "refused", code: "too-large" });
  expect(stopped.provider.stopped).toBe("too-large");
  expect(stopped.provider.compact()).toBe(false);
  expect(stopped.provider.stats.compactions).toBe(0);
});

test("a fold the authority never takes keeps every original", () => {
  const { store, ydoc, provider } = start();
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  const inputs = clone(store.value.y);
  echo(store);
  expect(provider.stats.compactions).toBe(1);
  echo(store, { v: 1, g: 0, y: clone(inputs) });
  for (const [k, v] of Object.entries(inputs)) expect(store.value.y[k]).toBe(v);
  expect(textOf(store.value)).toBe("x".repeat(40));
});

test("a transport fold never counts as a checkpoint", () => {
  const { store, ydoc, provider } = start();
  const deliveries = [];
  store.onDelivery((event) => deliveries.push(event));
  for (let i = 0; i < 40; i++) ydoc.getText("flow").insert(i, "x");
  echo(store);
  const pending = store.pending.length;
  expect(provider.stats.compactions).toBe(1);
  expect(store.pending.length).toBe(pending);
  expect(deliveries).toEqual([]);
  expect(keysUnder(store.authoritative, "m")).toEqual([]);
  expect(textOf(store.authoritative).length).toBe(40);
});
