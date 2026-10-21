globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, removeKey, NET } from "../../../../src/page/ybind/index.js";

const opened = [];
afterEach(() => {
  for (const tab of opened.splice(0)) {
    tab.view.destroy();
    tab.binding.dispose();
    tab.view.dom.parentNode?.remove();
  }
});
const seed = () => [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }];
const open = () => {
  const store = createStore({ name: "page", value: seedValue(seed()) });
  const binding = createYPageBinding({ store });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  const tab = { store, binding, view, pd: binding.pd };
  opened.push(tab);
  return tab;
};
const exchange = (...tabs) => {
  const updates = tabs.map((tab) => Y.encodeStateAsUpdateV2(tab.pd.ydoc));
  for (const tab of tabs) for (const update of updates) Y.applyUpdateV2(tab.pd.ydoc, update, NET);
};
const ids = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push(node.attrs.id)); return out; };
const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const caretIn = (tab, id, offset) => {
  let found = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) found = pos + 1 + offset; });
  if (found === null) throw new Error(`Missing ${id}`);
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, found)));
};
const caret = (tab) => {
  const { $from, empty } = tab.view.state.selection;
  return { id: $from.parent.attrs.id, offset: $from.parentOffset, empty };
};
const type = (tab, text) => tab.view.dispatch(tab.view.state.tr.insertText(text));
const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === id) return `${it.id.client}.${it.id.clock}`;
  throw new Error(`Missing marker ${id}`);
};
const hide = (tab, id, endId) => {
  const key = keyOf(tab.pd, id);
  tab.pd.ydoc.transact(() => tab.pd.gone.set(removeKey(key, "peer-remove"), { blockId: id, end: endId ? keyOf(tab.pd, endId) : null, sv: [] }), NET);
  return key;
};
const settled = (...tabs) => { for (const tab of tabs) expect(tab.binding.stats.mismatch).toBe(0); };

test("a peer move keeps the local caret inside the moved block at the same offset", () => {
  const a = open(), c = open();
  caretIn(c, "q", 2);
  expect(a.binding.moveBlocks({ ids: ["q"], afterId: "r" })).toMatchObject({ status: "moved" });
  exchange(a, c);
  expect(ids(c)).toEqual(["p", "r", "q"]);
  expect(caret(c)).toEqual({ id: "q", offset: 2, empty: true });
  type(c, "Z");
  exchange(a, c);
  expect(blocks(c)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "brZavo"]]);
  expect(blocks(a)).toEqual(blocks(c));
  settled(a, c);
});

test("a caret at the end of a block a peer moves stays at its end", () => {
  const a = open(), c = open();
  caretIn(c, "q", 5);
  a.binding.moveBlocks({ ids: ["q"], afterId: null });
  exchange(a, c);
  expect(ids(c)).toEqual(["q", "p", "r"]);
  expect(caret(c)).toEqual({ id: "q", offset: 5, empty: true });
  type(c, "Z");
  exchange(a, c);
  expect(blocks(a)).toEqual([["q", "bravoZ"], ["p", "ALPHA"], ["r", "OMEGA"]]);
  settled(a, c);
});

test("a caret beside a block a peer restores stays in its own block", () => {
  const a = open(), c = open();
  const q = hide(a, "q", "r");
  exchange(a, c);
  expect(ids(c)).toEqual(["p", "r"]);
  caretIn(c, "p", 5);
  const record = a.binding.recoverable[0];
  expect(a.binding.restore(record.source, record.revision)).toEqual({ status: "restored", id: `recovered:${q}` });
  exchange(a, c);
  expect(ids(c)).toEqual(["p", `recovered:${q}`, "r"]);
  expect(caret(c)).toEqual({ id: "p", offset: 5, empty: true });
  type(c, "Y");
  exchange(a, c);
  expect(blocks(a)).toEqual([["p", "ALPHAY"], [`recovered:${q}`, "bravo"], ["r", "OMEGA"]]);
  settled(a, c);
});

test("a caret inside a recovered block follows a peer move of that block", () => {
  const a = open(), c = open();
  const q = hide(a, "q", "r");
  const record = a.binding.recoverable[0];
  a.binding.restore(record.source, record.revision);
  exchange(a, c);
  const id = `recovered:${q}`;
  caretIn(c, id, 3);
  expect(a.binding.moveBlocks({ ids: [id], afterId: "r" })).toMatchObject({ status: "moved" });
  exchange(a, c);
  expect(ids(c)).toEqual(["p", "r", id]);
  expect(caret(c)).toEqual({ id, offset: 3, empty: true });
  type(c, "Z");
  exchange(a, c);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], [id, "braZvo"]]);
  settled(a, c);
});

test("a caret inside a recovered block lands in a visible block when the peer undoes the Restore", () => {
  const a = open(), c = open();
  const q = hide(a, "q", "r");
  const record = a.binding.recoverable[0];
  a.binding.restore(record.source, record.revision);
  exchange(a, c);
  caretIn(c, `recovered:${q}`, 2);
  expect(a.binding.undo()).toBe(true);
  exchange(a, c);
  expect(ids(c)).toEqual(["p", "r"]);
  const after = caret(c);
  expect(after.empty).toBe(true);
  expect(["p", "r"]).toContain(after.id);
  type(c, "Y");
  exchange(a, c);
  expect(blocks(a)).toEqual(blocks(c));
  expect(blocks(c).map(([, text]) => text).join("")).toContain("Y");
  settled(a, c);
});
