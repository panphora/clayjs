import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, parseGoneIntents, removeKey, attrKey } from "../../../../src/page/ybind/index.js";

const page = () => createPageDoc(new Y.Doc());

test("an unchanged gone entry is parsed once and shared, frozen, across calls", () => {
  const pd = page();
  pd.gone.set(removeKey("1.0", "op-1"), { blockId: "q", end: null, sv: [[1, 4]] });
  pd.gone.set(attrKey("1.0", "level"), { nested: [1] });
  const first = parseGoneIntents(pd.gone);
  const second = parseGoneIntents(pd.gone);
  expect(second).not.toBe(first);
  expect(second.removals).not.toBe(first.removals);
  expect(second.removals[0]).toBe(first.removals[0]);
  expect(Object.isFrozen(first.removals[0].sv[0])).toBe(true);
  expect(() => first.removals[0].sv.push([2, 2])).toThrow(TypeError);
  expect(Object.isFrozen(first.attrs.get("1.0").get("level").nested)).toBe(true);
  second.removals.push("extra");
  expect(parseGoneIntents(pd.gone).removals).toHaveLength(1);
});

test("a rewritten, added or deleted entry is seen on the next call", () => {
  const pd = page();
  const key = removeKey("1.0", "op-1");
  pd.gone.set(key, { blockId: "q", end: null, sv: [[1, 4]] });
  const before = parseGoneIntents(pd.gone).removals[0];
  pd.gone.set(key, { blockId: "q", end: "1.9", sv: [[1, 4]] });
  pd.gone.set(removeKey("1.5", "op-2"), { blockId: "r", end: null, sv: [] });
  const after = parseGoneIntents(pd.gone);
  expect(after.removals[0]).not.toBe(before);
  expect(after.removals.map((removal) => [removal.key, removal.end])).toEqual([[key, "1.9"], [removeKey("1.5", "op-2"), null]]);
  pd.gone.delete(key);
  expect(parseGoneIntents(pd.gone).removals.map((removal) => removal.key)).toEqual([removeKey("1.5", "op-2")]);
  pd.gone.set("not a key", 1);
  expect(parseGoneIntents(pd.gone).removals).toHaveLength(1);
  expect(() => parseGoneIntents(pd.gone, { strict: true })).toThrow();
});

test("the kept records equal a fresh parse after appends, rewrites, deletes and re-adds, inside a transaction too", () => {
  const pd = page();
  const signature = (intents) => JSON.stringify([intents.removals, intents.restores, intents.textDeletes, [...intents.copyActive], [...intents.attrs].map(([key, fields]) => [key, [...fields]])]);
  const same = () => expect(signature(parseGoneIntents(pd.gone))).toBe(signature(parseGoneIntents(pd.gone, { kept: false })));
  const a = removeKey("1.0", "op-1"), b = removeKey("1.5", "op-2");
  pd.gone.set(a, { blockId: "q", end: null, sv: [[1, 4]] });
  same();
  pd.gone.set(attrKey("1.0", "level"), { nested: [1] });
  pd.gone.set(b, { blockId: "r", end: null, sv: [] });
  same();
  pd.ydoc.transact(() => {
    pd.gone.set(attrKey("1.0", "level"), { nested: [2] });
    same();
    pd.gone.delete(a);
    same();
    pd.gone.set(removeKey("1.7", "op-3"), { blockId: "s", end: null, sv: [] });
    same();
  });
  same();
  pd.gone.set(a, { blockId: "q", end: "1.9", sv: [[1, 4]] });
  same();
  expect(parseGoneIntents(pd.gone).removals.map((removal) => removal.key)).toEqual([a, b, removeKey("1.7", "op-3")]);
});
