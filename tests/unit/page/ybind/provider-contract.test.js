import { createStore } from "../../../../src/live/store.js";

test("the store members the provider depends on", () => {
  const store = createStore({ name: "page", value: { v: 1, g: 0, y: {} } });
  const events = [];
  store.onRebase((ev) => events.push(ev));
  const op = { op: "set", path: ["y", "k1"], value: "AA" };
  store.rebase({ v: 1, g: 0, y: { k1: "AA" } }, { source: "remote", frame: { ops: [op] } });
  expect(events.length).toBe(1);
  expect(events[0].source).toBe("remote");
  expect(events[0].frame.ops).toEqual([op]);
  expect(events[0].next).toEqual({ v: 1, g: 0, y: { k1: "AA" } });
  expect(store.authoritative).toEqual({ v: 1, g: 0, y: { k1: "AA" } });
  expect(store.value).toEqual({ v: 1, g: 0, y: { k1: "AA" } });

  const local = [];
  store.onLocal((ops) => local.push(ops));
  store.handle.set(["y", "k2"], "BB");
  expect(local[0]).toEqual([{ op: "set", path: ["y", "k2"], value: "BB" }]);
  expect(store.value.y.k2).toBe("BB");
  expect(store.authoritative.y.k2).toBeUndefined();

  store.handle.update((data) => { data.y.k3 = "CC"; delete data.y.k1; });
  expect(local[1]).toEqual([{ op: "set", path: ["y", "k3"], value: "CC" }, { op: "del", path: ["y", "k1"] }]);

  const deliveries = [];
  store.onDelivery((e) => deliveries.push(e));
  store.deliver({ phase: "refused", code: "x" });
  expect(deliveries).toEqual([{ phase: "refused", code: "x" }]);
});

test("rebase with drop removes the first pending op", () => {
  const store = createStore({ name: "page", value: { v: 1, g: 0, y: {} } });
  store.handle.set(["y", "k"], "AA");
  expect(store.value.y.k).toBe("AA");
  store.rebase(store.authoritative, { source: "state", drop: [1, 1] });
  expect(store.value.y.k).toBeUndefined();
});
