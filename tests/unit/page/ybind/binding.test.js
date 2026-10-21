globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView, model as pmModel, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { toBase64 } from "../../../../src/vendor/yjs.vendor.js";
import { createYPageBinding, seedValue, blocksFromYValue, LOCAL } from "../../../../src/page/ybind/index.js";

const { EditorState, TextSelection } = pmState;
const open = (blocks, extra = {}) => {
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store, ...extra });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  return { store, binding, view, pd: binding.pd };
};
const texts = (view) => { const o = []; view.state.doc.forEach((n) => o.push(n.textContent)); return o; };
const at = (view, n) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, n)));

test("authored ids shaped like internal ids keep edits on their own blocks", () => {
  const leading = open([{ id: "~intro", text: "Hello" }, { id: "b2", text: "World" }]);
  const second = leading.view.state.doc.child(0).nodeSize;
  leading.view.dispatch(leading.view.state.tr.insertText("X", second + 1));
  const firstBlocks = blocksFromYValue(leading.store.value);
  expect(firstBlocks["~intro"].c).toBe("Hello");
  expect(firstBlocks.b2.c).toBe("XWorld");
  expect(leading.binding.stats.mismatch).toBe(0);

  const trailing = open([{ id: "intro", text: "Title" }, { id: "intro~2", text: "Body" }]);
  const pos = trailing.view.state.doc.child(0).nodeSize;
  const node = trailing.view.state.doc.child(1);
  trailing.view.dispatch(trailing.view.state.tr.setNodeMarkup(pos, schema.nodes.heading, { ...node.attrs, level: 3 }));
  const secondBlocks = blocksFromYValue(trailing.store.value);
  expect(secondBlocks.intro.t).toBe("paragraph");
  expect(secondBlocks["intro~2"].t).toBe("heading");
  expect(trailing.binding.stats.mismatch).toBe(0);
});

test("a single tab: typing, Enter, Backspace, undo, redo, block delete", () => {
  const { view, binding, pd } = open([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);
  expect(texts(view)).toEqual(["hello", "world"]);
  expect(pd.flow.length).toBe(12);
  at(view, 6);
  view.dispatch(view.state.tr.insertText("X"));
  expect(texts(view)).toEqual(["helloX", "world"]);
  const before = pd.flow.length;
  at(view, 3);
  commands.splitBlock(view.state, view.dispatch);
  expect(texts(view)).toEqual(["he", "lloX", "world"]);
  expect(pd.flow.length).toBe(before + 1);
  expect(pd.gone.size).toBe(0);
  const lengthBeforeJoin = pd.flow.length;
  at(view, view.state.doc.child(0).nodeSize + 1);
  commands.joinBackward(view.state, view.dispatch);
  expect(texts(view)).toEqual(["helloX", "world"]);
  expect(pd.flow.length).toBe(lengthBeforeJoin - 1);
  expect(pd.gone.size).toBe(0);
  binding.undo();
  expect(texts(view)).toEqual(["he", "lloX", "world"]);
  expect(pd.gone.size).toBe(0);
  binding.undo();
  expect(texts(view)).toEqual(["helloX", "world"]);
  binding.undo();
  expect(texts(view)).toEqual(["hello", "world"]);
  binding.redo();
  expect(texts(view)).toEqual(["helloX", "world"]);
  const q = view.state.doc.child(1);
  const pos = view.state.doc.child(0).nodeSize;
  view.dispatch(view.state.tr.delete(pos, pos + q.nodeSize));
  expect(texts(view)).toEqual(["helloX"]);
  expect([...pd.gone.values()]).toEqual([{ b: "q", e: null }]);
  binding.undo();
  expect(texts(view)).toEqual(["helloX", "world"]);
  expect(pd.gone.size).toBe(0);
  expect(binding.stats.mismatch).toBe(0);
});

const mkText = (n, wide) => Array.from({ length: n }, (_, i) => String.fromCodePoint(wide ? 0x4e00 + ((i * 7919) % 20000) : 97 + ((i * 31) % 26))).join("");

test.each([[false, 2868], [true, 8196]])("a large paste is chunked (wide: %s)", (wide) => {
  const { view, binding, pd } = open([{ id: "x1", text: "start" }, { id: "x2", text: "end" }]);
  const sizes = [];
  pd.ydoc.on("updateV2", (u, o) => { if (o === LOCAL) sizes.push(toBase64(u).length); });
  at(view, 6);
  const paras = [mkText(7000, wide), mkText(900, wide), mkText(3500, wide)];
  const frag = pmModel.Fragment.fromArray(paras.map((t, i) => schema.nodes.paragraph.create({ id: "pp" + i, pos: null }, schema.text(t))));
  view.dispatch(view.state.tr.replaceSelection(new pmModel.Slice(frag, 1, 1)));
  expect(texts(view).map((t) => t.length)).toEqual([7005, 900, 3500, 3]);
  expect(binding.stats.lastGroup.chunked).toBe(true);
  expect(sizes.length).toBeGreaterThanOrEqual(5);
  expect(Math.max(...sizes)).toBeLessThan(15 * 1024);
  expect(Math.max(...sizes)).toBeLessThan(wide ? 9000 : 4000);
  expect(binding.stats.mismatch).toBe(0);
  binding.undo();
  expect(texts(view)).toEqual(["start", "end"]);
});

test("marks", () => {
  const { view, pd } = open([{ id: "p", text: "hello" }]);
  view.dispatch(view.state.tr.addMark(2, 4, schema.marks.strong.create()));
  expect(view.state.doc.child(0).content.toJSON()).toEqual([{ type: "text", text: "h" }, { type: "text", marks: [{ type: "strong" }], text: "el" }, { type: "text", text: "lo" }]);
  at(view, 3);
  view.dispatch(view.state.tr.insertText("X"));
  const mid = view.state.doc.child(0).content.toJSON()[1];
  expect(mid).toEqual({ type: "text", marks: [{ type: "strong" }], text: "eXl" });
  const withMarks = pd.flow.toDelta().filter((d) => d.attributes && Object.keys(d.attributes).some((k) => k.startsWith("strong~")));
  expect(withMarks.length).toBe(1);
  expect(withMarks[0].insert).toBe("eXl");
  view.dispatch(view.state.tr.removeMark(1, 7, schema.marks.strong));
  expect(view.state.doc.child(0).content.toJSON()).toEqual([{ type: "text", text: "heXllo" }]);
});

test("an edit inside a block a peer removed raises one notice and Restore brings the block back", () => {
  const notices = [];
  const { view, binding, pd } = open([{ id: "p", text: "hello" }, { id: "q", text: "world" }], { onNotice: (n) => notices.push(n) });
  let key = null;
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content.embed && it.content.embed.b === "q") key = `${it.id.client}.${it.id.clock}`;
  pd.ydoc.transact(() => pd.gone.set(key, { b: "q", e: null }), "page-net");
  expect(texts(view)).toEqual(["hello"]);
  expect(notices.length).toBe(1);
  expect(notices[0]).toMatchObject({ kind: "deleted-block-edit", id: "q", text: "world" });
  expect(binding.notices.length).toBe(1);
  expect(binding.notices[0].key).toBe(notices[0].key);
  binding.restore(notices[0].key);
  expect(texts(view)).toEqual(["hello", "world"]);
});
