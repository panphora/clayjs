import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createPageDoc, docOf, seedFrom, walk } from "../../../../src/page/ybind/index.js";

const clone = (source, client) => {
  const ydoc = new Y.Doc();
  ydoc.clientID = client;
  Y.applyUpdateV2(ydoc, Y.encodeStateAsUpdateV2(source.ydoc));
  return createPageDoc(ydoc);
};

const parents = (pd) => {
  const before = Array.from(Y.encodeStateVector(pd.ydoc));
  const out = [];
  docOf(pd, walk(pd)).forEach((block) => out.push([block.attrs.id, block.attrs.parent]));
  expect(Array.from(Y.encodeStateVector(pd.ydoc))).toEqual(before);
  return out;
};

test("case 15: the lower-ranked parent edge is projected away without changing raw assignments", () => {
  const seed = createPageDoc(new Y.Doc());
  seed.ydoc.clientID = 1;
  seedFrom(seed, [
    { id: "q", t: "toggle", text: "bravo" },
    { id: "p", t: "toggle", text: "ALPHA" },
    { id: "r", text: "OMEGA" },
  ]);
  const a = clone(seed, 100), b = clone(seed, 200);
  for (let i = 0; i < 64; i++) a.ydoc.getMap("padding").set("clock", i);
  a.attrs.get("p").set("parent", "q");
  b.attrs.get("q").set("parent", "p");
  const aRank = a.attrs.get("p")._map.get("parent").id;
  const bRank = b.attrs.get("q")._map.get("parent").id;
  expect(aRank.clock).toBeGreaterThan(bRank.clock);
  const updateA = Y.encodeStateAsUpdateV2(a.ydoc), updateB = Y.encodeStateAsUpdateV2(b.ydoc);
  for (const updates of [[updateA, updateB], [updateB, updateA]]) {
    const pd = clone(seed, 300);
    for (const update of updates) Y.applyUpdateV2(pd.ydoc, update);
    expect(pd.attrs.get("p").get("parent")).toBe("q");
    expect(pd.attrs.get("q").get("parent")).toBe("p");
    expect(parents(pd)).toEqual([["q", null], ["p", "q"], ["r", null]]);
    expect(parents(clone(pd, 400))).toEqual([["q", null], ["p", "q"], ["r", null]]);
  }
});
