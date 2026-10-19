import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { createYProvider, docFromValue, enc, entriesOf } from "../../../../src/page/ybind/provider.js";

let queue;
let opened;
beforeEach(() => { queue = []; opened = []; });
afterEach(() => { for (const tab of opened) { tab.provider.dispose(); tab.ydoc.destroy(); tab.peer.destroy(); } });
const flush = () => { while (queue.length) queue.shift()(); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const confirm = (store) => { store.rebase(clone(store.value), { source: "remote", confirmed: store.pending.length }); flush(); };
const confirmAll = (store) => { for (let i = 0; i < 4; i++) confirm(store); };
const text = (value) => { const doc = docFromValue(value); const result = doc.getText("flow").toString(); doc.destroy(); return result; };

function open(folds = 1) {
  const peer = new Y.Doc();
  peer.clientID = 6;
  peer.getText("flow").insert(0, "base");
  const folded = enc(Y.encodeStateAsUpdateV2(peer));
  const value = { v: 1, g: 0, y: { "m6-0": folded } };
  if (folds === 2) value.y["m7-0"] = folded;
  let update;
  peer.on("updateV2", (bytes) => { update = enc(bytes); });
  for (let i = 0; i < 40; i++) {
    peer.getText("flow").insert(4 + i, "x");
    value.y[`u6-${i + 1}`] = update;
  }
  const store = createStore({ name: "page", value });
  const ydoc = docFromValue(value);
  ydoc.clientID = 5;
  const provider = createYProvider({ store, ydoc, setTimer: (fn) => { queue.push(fn); return queue.length; }, clearTimer: () => {} });
  const tab = { store, ydoc, peer, provider, value, peerUpdate: () => update };
  opened.push(tab);
  return tab;
}

test.each([1, 2])("opening a checkpoint with %i folded copies does not write", (folds) => {
  const { store, ydoc, provider, value } = open(folds);
  store.rebase(clone(value), { source: "state" });
  flush();
  provider.settle();
  expect(store.pending).toEqual([]);
  expect(store.value).toEqual(value);
  expect(provider.stats.compactions).toBe(0);
  expect(ydoc.getText("flow").toString()).toBe("base" + "x".repeat(40));
});

test("new local edits resume compaction of a loaded checkpoint", () => {
  const { store, ydoc, provider } = open();
  ydoc.getText("flow").insert(44, "!");
  confirmAll(store);
  expect(provider.stats.compactions).toBe(1);
  expect(entriesOf(store.value.y)).toHaveLength(1);
  expect(store.pending).toEqual([]);
  expect(text(store.value)).toBe("base" + "x".repeat(40) + "!");
});

test("new remote edits resume compaction of a loaded checkpoint", () => {
  const { store, ydoc, peer, provider, value, peerUpdate } = open();
  peer.getText("flow").insert(44, "?");
  const update = peerUpdate();
  const next = clone(value);
  next.y["u6-41"] = update;
  store.rebase(next, { source: "remote", frame: { ops: [{ op: "set", path: ["y", "u6-41"], value: update }] } });
  flush();
  confirmAll(store);
  expect(provider.stats.compactions).toBe(1);
  expect(entriesOf(store.value.y)).toHaveLength(1);
  expect(store.pending).toEqual([]);
  expect(text(store.value)).toBe("base" + "x".repeat(40) + "?");
  expect(ydoc.getText("flow").toString()).toBe(text(store.value));
});
