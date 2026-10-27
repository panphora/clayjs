import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { schema } from "../../../../src/page/schema.js";
import { createPageDoc, mintId, attrKeys, walk, docOf, pickCopy } from "../../../../src/page/ybind/core.js";

const addBlock = (pd, id, text, t = "paragraph") => {
  const at = pd.flow.length;
  pd.flow.insertEmbed(at, { b: id });
  if (text) pd.flow.insert(at + 1, text);
  const m = new Y.Map();
  m.set("t", t);
  pd.attrs.set(id, m);
};
const breakKey = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) {
    if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return `${it.id.client}.${it.id.clock}`;
  }
  return null;
};
const fresh = () => { const pd = createPageDoc(); pd.ydoc.clientID = 7; return pd; };

test("layout", () => {
  const pd = createPageDoc();
  expect(pd.flow).toBeInstanceOf(Y.Text);
  for (const k of ["attrs", "gone", "boardFields"]) expect(pd[k]).toBeInstanceOf(Y.Map);
  expect(pd.ydoc).toBeInstanceOf(Y.Doc);
  const a = mintId(pd), b = mintId(pd);
  expect(a).not.toBe(b);
  expect(a.startsWith("b")).toBe(true);
  expect(attrKeys(schema.nodes.heading)).toEqual(["parent", "level", "pageIcon", "pageCoverSrc", "pageCoverAlt", "pageCoverX", "pageCoverY"]);
});

test("two blocks", () => {
  const pd = fresh();
  addBlock(pd, "p", "hello");
  addBlock(pd, "q", "world");
  const w = walk(pd);
  expect(w.visible.map((v) => v.id)).toEqual(["p", "q"]);
  expect(w.tokens).toBe(12);
  expect(w.holes).toEqual([]);
  expect(w.orphans).toEqual([]);
  const doc = docOf(pd, w);
  expect(doc.childCount).toBe(2);
  expect(doc.child(0).textContent).toBe("hello");
  expect(doc.child(1).attrs.id).toBe("q");
});

test("attributes", () => {
  const pd = fresh();
  addBlock(pd, "p", "hello");
  addBlock(pd, "q", "world");
  pd.attrs.get("p").set("t", "heading");
  pd.attrs.get("p").set("level", 3);
  const doc = docOf(pd, walk(pd));
  expect(doc.child(0).type.name).toBe("heading");
  expect(doc.child(0).attrs.level).toBe(3);
  expect(doc.child(1).type.name).toBe("paragraph");
});

test("join by a plain delete of the break", () => {
  const pd = fresh();
  addBlock(pd, "p", "hello");
  addBlock(pd, "q", "world");
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === "q") break;
    if (!it.deleted) at += it.length;
  }
  pd.flow.delete(at, 1);
  const w = walk(pd);
  expect(w.visible.length).toBe(1);
  expect(w.holes).toEqual([]);
  const doc = docOf(pd, w);
  expect(doc.childCount).toBe(1);
  expect(doc.textContent).toBe("helloworld");
});

test("removed block with live text", () => {
  const pd = fresh();
  addBlock(pd, "p", "hello");
  addBlock(pd, "q", "world");
  pd.gone.set(breakKey(pd, "q"), { b: "q", e: null });
  const w = walk(pd);
  expect(w.visible.length).toBe(1);
  expect(w.holes).toEqual([{ at: 6, len: 6 }]);
  expect(w.orphans.length).toBe(1);
  expect(w.orphans[0].text).toBe("world");
  expect(w.orphans[0].id).toBe("q");
});

test("marks", () => {
  const pd = fresh();
  addBlock(pd, "p", "hello");
  pd.flow.format(2, 2, { "strong~7-1": true });
  expect(docOf(pd, walk(pd)).child(0).content.toJSON()).toEqual([{ type: "text", text: "h" }, { type: "text", marks: [{ type: "strong" }], text: "el" }, { type: "text", text: "lo" }]);
  pd.flow.format(2, 2, { "strong~7-1!7-2": true });
  expect(docOf(pd, walk(pd)).child(0).content.toJSON()).toEqual([{ type: "text", text: "hello" }]);
});

test("hard break", () => {
  const pd = fresh();
  addBlock(pd, "p", "hello");
  pd.flow.insertEmbed(3, { br: 1 });
  expect(docOf(pd, walk(pd)).child(0).content.toJSON()).toEqual([{ type: "text", text: "he" }, { type: "hard_break" }, { type: "text", text: "llo" }]);
});

test("duplicate ids", () => {
  const same = fresh();
  addBlock(same, "p", "same");
  addBlock(same, "p", "same");
  const w1 = walk(same);
  expect(w1.visible.length).toBe(1);
  expect(w1.orphans.length).toBe(0);
  const pd = fresh();
  addBlock(pd, "p", "same");
  addBlock(pd, "p", "different");
  const w = walk(pd);
  expect(w.visible.length).toBe(1);
  expect(docOf(pd, w).child(0).textContent).toBe("same");
  expect(w.orphans.length).toBe(1);
  expect(w.orphans[0]).toMatchObject({ id: "p", text: "different", copy: true });
  expect(w.orphans[0].key).toMatch(/^d7\.\d+$/);
});

test("implicit start", () => {
  const pd = fresh();
  pd.flow.insert(0, "lead");
  addBlock(pd, "p", "x");
  const w = walk(pd);
  expect(w.visible.length).toBe(2);
  expect(w.visible[0].implicit).toBe(true);
  expect(w.visible[0].id).toBe("~start");
  expect(w.visible[1].id).toBe("p");
  expect(w.visible[1].implicit).toBe(false);
  expect(docOf(pd, w).child(0).textContent).toBe("lead");
});

test("pickCopy keeps the lowest client id, then the lowest clock", () => {
  const list = [{ brk: { client: 9, clock: 1 } }, { brk: { client: 3, clock: 40 } }, { brk: { client: 3, clock: 41 } }];
  expect(pickCopy(list)).toBe(list[1]);
});
