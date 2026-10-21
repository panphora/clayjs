globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, enc } from "../../../../src/page/ybind/index.js";
import { schema } from "../../../../src/page/schema.js";

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

let key = 0;
const send = (from, to) => {
  const update = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const k = `remote${key++}`;
  to.store.rebase(
    { ...to.store.value, y: { ...to.store.value.y, [k]: update } },
    { source: "remote", frame: { ops: [{ op: "set", path: ["y", k], value: update }] } },
  );
};

const pair = () => {
  const initial = seedValue([{ id: "p", text: "hello" }, { id: "q", text: "world" }]);
  const a = open(initial), b = open(initial);
  b.view.dispatch(b.view.state.tr.insertText("X", 6));
  b.view.dispatch(b.view.state.tr.insertText("Y", b.view.state.doc.child(0).nodeSize + 6));
  return { a, b };
};

const close = (tab) => { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); };

test("a remote edit renders at once while the local view is composing; ProseMirror protects the composing text", () => {
  const { a, b } = pair();
  a.view.input.composing = true;
  send(b, a);
  expect(texts(a)).toEqual(["helloX", "worldY"]);
  a.view.input.composing = false;
  close(a); close(b);
});

test("with no composition a remote edit lands synchronously", () => {
  const { a, b } = pair();
  send(b, a);
  expect(texts(a)).toEqual(["helloX", "worldY"]);
  close(a); close(b);
});

const blockEnd = (tab, i) => { let p = 0; for (let j = 0; j < i; j++) p += tab.view.state.doc.child(j).nodeSize; return p + tab.view.state.doc.child(i).nodeSize - 1; };

const finish = async (from, to) => {
  from.view.input.composing = false;
  from.view.dom.dispatchEvent(new Event("compositionend"));
  await new Promise((r) => setTimeout(r, 0));
  send(from, to);
};

test("typing at the caret during a composition, after a peer inserts above, lands in the caret block", async () => {
  const initial = seedValue([{ id: "p1", text: "alpha" }, { id: "p2", text: "beta" }]);
  const a = open(initial), b = open(initial);
  const end = blockEnd(a, 1);
  a.view.dispatch(a.view.state.tr.setSelection(pmState.TextSelection.create(a.view.state.doc, end)));
  a.view.input.composing = true;
  b.view.dispatch(b.view.state.tr.insert(0, schema.nodes.paragraph.create({ id: "p0", pos: null }, schema.text("gamma"))));
  b.view.dispatch(b.view.state.tr.insertText("XYZ", 8));
  send(b, a);
  a.view.dispatch(a.view.state.tr.insertText("!"));
  await finish(a, b);
  expect(texts(a)).toEqual(["gamma", "XYZalpha", "beta!"]);
  expect(texts(b)).toEqual(texts(a));
  close(a); close(b);
});

test("typing at the caret during a composition, after a peer deletes before it, lands at the caret", async () => {
  const initial = seedValue([{ id: "p1", text: "hello world" }]);
  const a = open(initial), b = open(initial);
  const end = blockEnd(a, 0);
  a.view.dispatch(a.view.state.tr.setSelection(pmState.TextSelection.create(a.view.state.doc, end)));
  a.view.input.composing = true;
  b.view.dispatch(b.view.state.tr.delete(1, 7));
  send(b, a);
  a.view.dispatch(a.view.state.tr.insertText("!"));
  await finish(a, b);
  expect(texts(a)).toEqual(["world!"]);
  expect(texts(b)).toEqual(texts(a));
  close(a); close(b);
});
