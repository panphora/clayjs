globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, enc } from "../../../../src/page/ybind/index.js";
import { blocksFromYValue } from "../../../../src/page/ybind/decode.js";

const open = (initial) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  return { store, binding, view };
};

const texts = (tab) => { const out = []; tab.view.state.doc.forEach((n) => out.push(n.textContent)); return out; };

const rows = (tab) => {
  const out = [];
  tab.view.state.doc.forEach((n) => out.push({ id: n.attrs.id, type: n.type.name, text: n.textContent, parent: n.attrs.parent ?? null }));
  return out;
};

let key = 0;
const send = (from, to) => {
  const update = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const k = `remote${key++}`;
  to.store.rebase(
    { ...to.store.value, y: { ...to.store.value.y, [k]: update } },
    { source: "remote", frame: { ops: [{ op: "set", path: ["y", k], value: update }] } },
  );
};

const close = (tab) => { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); };

const initial = () => seedValue([
  { id: "t", t: "toggle", text: "Summary", attrs: { open: true } },
  { id: "b1", text: "body one", attrs: { parent: "t" } },
  { id: "b2", text: "body two", attrs: { parent: "t" } },
  { id: "q", text: "" },
]);

const original = [
  { id: "t", type: "toggle", text: "Summary", parent: null },
  { id: "b1", type: "paragraph", text: "body one", parent: "t" },
  { id: "b2", type: "paragraph", text: "body two", parent: "t" },
  { id: "q", type: "paragraph", text: "", parent: null },
];

test("a toggle with a body deleted and undone is whole again in both tabs and in the record", () => {
  const value = initial();
  const a = open(value), b = open(value);
  const doc = a.view.state.doc;
  a.view.dispatch(a.view.state.tr.delete(0, doc.child(0).nodeSize + doc.child(1).nodeSize + doc.child(2).nodeSize));
  expect(texts(a)).toEqual([""]);
  a.binding.undo();
  send(a, b);
  expect(rows(a)).toEqual(original);
  expect(rows(b)).toEqual(original);
  expect(texts(a)).toEqual(["Summary", "body one", "body two", ""]);
  expect(texts(b)).toEqual(["Summary", "body one", "body two", ""]);
  const decoded = blocksFromYValue(a.store.value);
  expect(decoded.t).toMatchObject({ t: "toggle", c: "Summary" });
  expect(decoded.b1).toMatchObject({ t: "paragraph", c: "body one", parent: "t" });
  expect(decoded.b2).toMatchObject({ t: "paragraph", c: "body two", parent: "t" });
  close(a); close(b);
});
