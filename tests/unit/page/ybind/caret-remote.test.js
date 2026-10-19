import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state, view, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, docFromValue, enc } from "../../../../src/page/ybind/index.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

const open = (initial) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const editor = new view.EditorView(document.body.appendChild(document.createElement("div")), {
    state: state.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editor);
  return { store, binding, editor };
};
const at = (tab, pos) => tab.editor.dispatch(tab.editor.state.tr.setSelection(state.TextSelection.create(tab.editor.state.doc, pos)));
const desc = (tab) => {
  const s = tab.editor.state.selection;
  return { doc: tab.editor.state.doc.textContent, pos: s.from, block: s.$from.parent.textContent, offset: s.$from.parentOffset };
};

const run = (kind) => {
  const initial = seedValue(kind.startsWith("join") ? [{ id: "p", text: "ABC" }, { id: "q", text: "DEFghiJKL" }] : [{ id: "p", text: "ABCdefGHIjkl" }]);
  const a = open(initial), b = open(initial);
  at(a, 2);
  a.editor.dispatch(a.editor.state.tr.insertText(""));
  at(b, kind.startsWith("join") ? 12 : 7);
  const sv = Y.encodeStateVector(b.binding.ydoc);
  if (kind === "single-insert") a.editor.dispatch(a.editor.state.tr.insertText("X", 3));
  if (kind === "split-before-caret" || kind === "split-at-caret") {
    at(a, kind === "split-at-caret" ? 7 : 4);
    commands.splitBlock(a.editor.state, a.editor.dispatch);
  }
  if (kind === "join-before-caret") {
    at(a, 6);
    commands.joinBackward(a.editor.state, a.editor.dispatch);
  }
  if (kind === "batched-inserts-around-caret") {
    a.editor.dispatch(a.editor.state.tr.insertText("X", 3));
    a.editor.dispatch(a.editor.state.tr.insertText("Y", 11));
  }
  const update = Y.encodeStateAsUpdateV2(a.binding.ydoc, sv);
  const encoded = enc(update);
  b.store.rebase({ ...initial, y: { ...initial.y, remote: encoded } }, kind === "batched-inserts-around-caret" ? { source: "state" } : { source: "remote", frame: { ops: [{ op: "set", path: ["y", "remote"], value: encoded }] } });
  const after = desc(b);
  b.editor.dispatch(b.editor.state.tr.insertText("!"));
  const afterTyping = desc(b);
  for (const t of [a, b]) { t.editor.destroy(); t.binding.dispose(); t.binding.ydoc.destroy(); }
  return { after, afterTyping };
};

test("a single remote insert before the caret leaves the caret and types there", () => {
  const { after, afterTyping } = run("single-insert");
  expect(after.doc).toBe("ABXCdefGHIjkl");
  expect(after.offset).toBe(7);
  expect(afterTyping.doc).toBe("ABXCdef!GHIjkl");
});

test("a remote split before the caret keeps it in the second block", () => {
  const { after, afterTyping } = run("split-before-caret");
  expect(after.block).toBe("defGHIjkl");
  expect(after.offset).toBe(3);
  expect(afterTyping.block).toBe("def!GHIjkl");
});

test("a remote split at the caret keeps it at the block start", () => {
  const { after, afterTyping } = run("split-at-caret");
  expect(after.block).toBe("GHIjkl");
  expect(after.offset).toBe(0);
  expect(afterTyping.block).toBe("!GHIjkl");
});

test("a remote join before the caret keeps it after the joined text", () => {
  const { after, afterTyping } = run("join-before-caret");
  expect(after.doc).toBe("ABCDEFghiJKL");
  expect(after.offset).toBe(9);
  expect(afterTyping.doc).toBe("ABCDEFghi!JKL");
});

test("batched remote inserts around the caret keep it and type there", () => {
  const { after, afterTyping } = run("batched-inserts-around-caret");
  expect(after.doc).toBe("ABXCdefGHIYjkl");
  expect(after.offset).toBe(7);
  expect(afterTyping.doc).toBe("ABXCdef!GHIYjkl");
});

test("merged nonadjacent remote edits keep the caret and type there", () => {
  const initial = seedValue([{ id: "p", text: "abcdefghij" }]);
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const editor = new view.EditorView(document.body.appendChild(document.createElement("div")), {
    state: state.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(editor);
  editor.dispatch(editor.state.tr.setSelection(state.TextSelection.create(editor.state.doc, 5)));
  const peer = docFromValue(initial);
  peer.getText("flow").insert(2, "X");
  peer.getText("flow").insert(9, "Y");
  store.rebase({ v: 1, g: 0, y: { merged: enc(Y.encodeStateAsUpdateV2(peer)) } }, { source: "state" });
  const after = { doc: editor.state.doc.textContent, pos: editor.state.selection.from };
  editor.dispatch(editor.state.tr.insertText("!"));
  const afterTyping = editor.state.doc.textContent;
  editor.destroy();
  binding.dispose();
  binding.ydoc.destroy();
  peer.destroy();
  expect(after.doc).toBe("aXbcdefgYhij");
  expect(after.pos).toBe(6);
  expect(afterTyping).toBe("aXbcd!efgYhij");
});
