import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, walk, docOf, NET } from "../../../../src/page/ybind/core.js";
import { seedValue } from "../../../../src/page/ybind/seed.js";

const decode = (value) => {
  const ydoc = new Y.Doc();
  for (const k of Object.keys(value.y).sort()) Y.applyUpdateV2(ydoc, Y.fromBase64(value.y[k]), NET);
  const pd = createPageDoc(ydoc);
  return docOf(pd, walk(pd));
};

test("a small seed is one key and decodes", () => {
  const value = seedValue([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);
  expect(value.v).toBe(1);
  expect(value.g).toBe(0);
  expect(Object.keys(value.y)).toEqual(["seed-0000"]);
  const doc = decode(value);
  expect(doc.child(0).attrs.id).toBe("p");
  expect(doc.child(0).textContent).toBe("hello");
  expect(doc.child(1).textContent).toBe("world");
});

test("the seed is deterministic and chunked", () => {
  const word = (i) => String.fromCharCode(97 + ((i * 31) % 26));
  const blocks = Array.from({ length: 200 }, (_, b) => ({ id: "b" + b, text: Array.from({ length: 350 }, (_, i) => word(i + b)).join("") }));
  const a = seedValue(blocks);
  expect(JSON.stringify(a)).toBe(JSON.stringify(seedValue(blocks)));
  const keys = Object.keys(a.y);
  expect(keys.length).toBeGreaterThan(30);
  for (const k of keys) expect(a.y[k].length).toBeLessThan(4000);
});

test("one long block is several keys", () => {
  const value = seedValue([{ id: "x", text: "a".repeat(5000) }]);
  expect(Object.keys(value.y).length).toBeGreaterThanOrEqual(3);
});
