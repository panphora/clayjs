import { createStore } from "../../../../src/live/store.js";
import { identityPlugin, isKey } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, migrateHybridValues, NET, bareShape, docOf, walk } from "../../../../src/page/ybind/index.js";

globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

const open = () => {
  const value = migrateHybridValues([{ blocks: {
    first: { t: "paragraph", pos: "A", c: "before" },
    second: { t: "paragraph", pos: "B", c: "abcdef" },
    third: { t: "paragraph", pos: "C", c: "after" },
  } }]);
  const binding = createYPageBinding({ store: createStore({ name: "page", value }) });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  return { binding, view, close() { view.destroy(); binding.dispose(); mount.remove(); } };
};

test("view identity is ready before the first text edit and after a remote split", () => {
  const tab = open();
  try {
    const { binding, view } = tab;
    const positions = [];
    view.state.doc.forEach((block) => positions.push(block.attrs.pos));
    expect(positions.every(isKey)).toBe(true);
    expect(positions).toEqual([...positions].sort());
    expect([...binding.pd.attrs.values()].every((attrs) => !attrs.has("pos"))).toBe(true);

    const second = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.insertText("X", second + 4));
    expect(binding.stats.lastGroup.regional).toBe(true);
    expect(binding.stats.mismatch).toBe(0);

    const split = second + 1 + 4;
    binding.pd.ydoc.transact(() => binding.pd.flow.insertEmbed(split - 1, { b: "remote" }), NET);
    const ids = [];
    const keys = [];
    view.state.doc.forEach((block) => { ids.push(block.attrs.id); keys.push(block.attrs.pos); });
    expect(ids).toContain("remote");
    expect(keys.every(isKey)).toBe(true);
    expect(keys).toEqual([...keys].sort());

    let remoteAt;
    view.state.doc.forEach((block, offset) => { if (block.attrs.id === "remote") remoteAt = offset + 1; });
    view.dispatch(view.state.tr.insertText("Y", remoteAt));
    expect(binding.stats.lastGroup.regional).toBe(true);
    expect(binding.stats.mismatch).toBe(0);
    expect(bareShape(view.state.doc)).toBe(bareShape(docOf(binding.pd, walk(binding.pd))));
    expect([...binding.pd.attrs.values()].every((attrs) => !attrs.has("pos"))).toBe(true);
  } finally { tab.close(); }
});
