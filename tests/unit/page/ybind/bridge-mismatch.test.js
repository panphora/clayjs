globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, docOf, walk, bareShape } from "../../../../src/page/ybind/index.js";
import { NET, REMOTE_META } from "../../../../src/page/ybind/layout.js";

const opened = [];
afterEach(() => {
  for (const { view, binding, mount } of opened.splice(0)) {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
});

function open(blocks) {
  const store = createStore({ name: "page", value: seedValue(blocks) });
  const binding = createYPageBinding({ store });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  const tab = { view, binding, mount };
  opened.push(tab);
  return tab;
}

const projected = (tab) => bareShape(docOf(tab.binding.pd, walk(tab.binding.pd)));
const texts = (tab) => { const out = []; tab.view.state.doc.forEach((n) => out.push(n.textContent)); return out; };
const select = (tab, pos) => tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, pos)));
const holdCorrections = (tab) => {
  const dispatch = tab.view.dispatch.bind(tab.view);
  tab.view.dispatch = (tr) => {
    if (tr.getMeta(REMOTE_META)) return;
    dispatch(tr);
  };
};
const breakAt = (pd, id) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return { at, key: `${it.id.client}.${it.id.clock}` };
    at += it.length;
  }
  throw new Error(`Missing break ${id}`);
};

test("an implicit block split maps its alias into both sides of the writer", () => {
  const tab = open([{ id: "p", text: "ab" }]);
  tab.binding.pd.ydoc.transact(() => tab.binding.pd.flow.delete(0, 1), NET);
  expect(texts(tab)).toEqual(["ab"]);
  expect(walk(tab.binding.pd).visible[0].implicit).toBe(true);
  select(tab, 1);
  holdCorrections(tab);
  commands.splitBlock(tab.view.state, tab.view.dispatch);
  expect(texts(tab)).toEqual(["", "ab"]);
  expect(projected(tab)).toBe(bareShape(tab.view.state.doc));
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("an open-ended gone boundary does not consume a joined survivor", () => {
  const tab = open([{ id: "p", text: "A" }, { id: "q", text: "hidden" }, { id: "r", text: "B" }]);
  const q = breakAt(tab.binding.pd, "q");
  tab.binding.pd.ydoc.transact(() => tab.binding.pd.gone.set(q.key, { b: "q", e: null }), NET);
  expect(texts(tab)).toEqual(["A", "B"]);
  select(tab, tab.view.state.doc.child(0).nodeSize + 1);
  holdCorrections(tab);
  commands.joinBackward(tab.view.state, tab.view.dispatch);
  expect(texts(tab)).toEqual(["AB"]);
  expect(projected(tab)).toBe(bareShape(tab.view.state.doc));
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("deleting one of two adjacent copies of a break removes the visible block", () => {
  const tab = open([{ id: "p", text: "A" }, { id: "q", text: "B" }]);
  const q = breakAt(tab.binding.pd, "q");
  tab.binding.pd.ydoc.transact(() => tab.binding.pd.flow.insertEmbed(q.at, { b: "q" }), NET);
  expect(texts(tab)).toEqual(["A", "B"]);
  const at = tab.view.state.doc.child(0).nodeSize;
  holdCorrections(tab);
  tab.view.dispatch(tab.view.state.tr.delete(at, tab.view.state.doc.content.size));
  expect(texts(tab)).toEqual(["A"]);
  expect(projected(tab)).toBe(bareShape(tab.view.state.doc));
  expect(tab.binding.stats.mismatch).toBe(0);
});

test("joining an empty winning copy does not reveal a hidden duplicate", () => {
  const tab = open([{ id: "p", text: "A" }, { id: "q", text: "X" }, { id: "r", text: "B" }]);
  const q = breakAt(tab.binding.pd, "q");
  const peer = new Y.Doc();
  peer.clientID = 0;
  Y.applyUpdateV2(peer, Y.encodeStateAsUpdateV2(tab.binding.pd.ydoc), NET);
  peer.getText("flow").insertEmbed(q.at, { b: "q" });
  Y.applyUpdateV2(tab.binding.pd.ydoc, Y.encodeStateAsUpdateV2(peer), NET);
  peer.destroy();
  expect(texts(tab)).toEqual(["A", "", "B"]);
  select(tab, tab.view.state.doc.child(0).nodeSize + 1);
  holdCorrections(tab);
  commands.joinBackward(tab.view.state, tab.view.dispatch);
  expect(texts(tab)).toEqual(["A", "B"]);
  expect(projected(tab)).toBe(bareShape(tab.view.state.doc));
  expect(tab.binding.stats.mismatch).toBe(0);
});
