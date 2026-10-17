// The store's slot fast path (rebaseOps after checkOps) must leave state equal
// to authoritative with pending replayed, as a rebuild does. Round 7 review,
// Astra findings 1 and 8.
import { createStore } from "../../src/live/store.js";
import { applyOps, cloneJson, serializeLive } from "../../src/live/ops.js";

test("Astra 1: a pending list delete above the remote path does not move the remote set onto the wrong item", () => {
  const seed = { items: [{ x: 1 }, { x: 2 }, { x: 3 }] };
  const store = createStore({ name: "array", value: seed });
  store.handle.delete(["items", 0]);
  const remote = [{ op: "set", path: ["items", 1, "x"], value: 20 }];
  const expected = applyOps(applyOps(cloneJson(seed), remote), store.pending);
  store.rebaseOps(store.checkOps(remote));
  expect(store.value).toEqual(expected);
  expect(store.value).toEqual({ items: [{ x: 20 }, { x: 3 }] });
  const pending = store.pending;
  store.rebaseOps(store.checkOps(pending), { through: store.mark });
  expect(store.pending).toEqual([]);
  expect(store.value).toEqual(store.authoritative);
});

test("Astra 8: a key set, deleted and set again in one frame keeps the room's key order", () => {
  const ops = [
    { op: "set", path: ["a"], value: 1 },
    { op: "set", path: ["b"], value: 2 },
    { op: "del", path: ["a"] },
    { op: "set", path: ["a"], value: 3 },
  ];
  const store = createStore({ name: "order", value: {} });
  store.rebaseOps(store.checkOps(ops));
  expect(serializeLive(store.authoritative)).toBe('{"b":2,"a":3}');
  expect(serializeLive(store.value)).toBe(serializeLive(store.authoritative));
  expect(Object.keys(store.handle.data ?? store.value)).toEqual(["b", "a"]);
});
