globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView, commands } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, migrateHybridValues, createOriginIndex, unitIds, docOf, walk, bareShape, tokenIndex, yBefore } from "../../../../src/page/ybind/index.js";

const opened = [];
afterEach(() => {
  for (const { view, binding, mount } of opened.splice(0)) {
    view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
});

function open(value) {
  const binding = createYPageBinding({ store: createStore({ name: "page", value }), captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding.attach(view);
  const tab = { binding, view, mount, pd: binding.pd };
  opened.push(tab);
  return tab;
}

const keyOf = (id) => `${id.client}.${id.clock}`;
const yAt = (tab, pos) => {
  const w = tab.binding.bridge.walk;
  return yBefore(w.holes, tokenIndex(tab.view.state.doc, new Map(), w.visible)[pos]);
};
const liveIds = (tab, from, to) => unitIds(tab.pd.flow, from, to).map(keyOf);
const ownersOf = (tab, from, to) => {
  const index = createOriginIndex(tab.pd.origins);
  return unitIds(tab.pd.flow, from, to).map((id) => keyOf(index.resolve(id)));
};
const liveFlow = (tab) => {
  const items = [];
  let at = 0;
  for (let it = tab.pd.flow._start; it; it = it.right) {
    if (it.deleted || !it.countable) continue;
    const embed = it.content instanceof Y.ContentEmbed ? it.content.embed : null;
    items.push({
      at,
      key: keyOf(it.id),
      length: it.length,
      kind: it.content instanceof Y.ContentString ? "text" : embed.b !== undefined ? "marker" : "br",
      blockId: embed && embed.b !== undefined ? embed.b : null,
    });
    at += it.length;
  }
  return items;
};
const texts = (items) => items.filter((i) => i.kind === "text").map((i) => `${i.key}:${i.length}`);
const contentIds = (tab) => {
  const out = [];
  tab.view.state.doc.forEach((block, offset) => {
    if (!block.isTextblock) return;
    out.push(...liveIds(tab, yAt(tab, offset + 1), yAt(tab, offset + 1 + block.content.size)));
  });
  return out;
};
const markers = (items) => items.filter((i) => i.kind === "marker").map((i) => usingKey(i));
const usingKey = (i) => `${i.key}:${i.blockId}`;
const agrees = (tab) => {
  expect(tab.binding.stats.mismatch).toBe(0);
  expect(bareShape(tab.view.state.doc)).toBe(bareShape(docOf(tab.pd, walk(tab.pd))));
};

test("an identical ASCII replacement mints new text item ids", () => {
  const tab = open(seedValue([{ id: "p", text: "abcde" }]));
  const before = liveIds(tab, 1, 6);
  const ownersBefore = ownersOf(tab, 1, 6);
  expect(before).toHaveLength(5);

  tab.view.dispatch(tab.view.state.tr.replaceWith(2, 4, schema.text("bc")));

  expect(tab.binding.stats.lastGroup.regional).toBe(true);
  expect(tab.view.state.doc.child(0).textContent).toBe("abcde");
  const after = liveIds(tab, 1, 6);
  expect(after).toHaveLength(5);
  expect(after[0]).toBe(before[0]);
  expect(after[3]).toBe(before[3]);
  expect(after[4]).toBe(before[4]);
  expect(after.slice(1, 3)).not.toEqual(before.slice(1, 3));
  expect(after.some((id) => before.slice(1, 3).includes(id))).toBe(false);
  expect(ownersOf(tab, 1, 6)).toEqual([ownersBefore[0], after[1], after[2], ownersBefore[3], ownersBefore[4]]);
  agrees(tab);
});

test("an identical bold emoji replacement mints new item ids and keeps marks", () => {
  const tab = open(migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "A", c: [{ type: "text", text: "a\u{1F600}b", marks: [{ type: "strong" }] }] } } }]));
  const shape = JSON.stringify(tab.view.state.doc.child(0).content.toJSON());
  const before = liveIds(tab, 1, 5);
  expect(before).toHaveLength(4);

  tab.view.dispatch(tab.view.state.tr.replaceWith(2, 4, schema.text("\u{1F600}", [schema.marks.strong.create()])));

  expect(tab.binding.stats.lastGroup.regional).toBe(true);
  const after = liveIds(tab, 1, 5);
  expect(after).toHaveLength(4);
  expect(JSON.stringify(tab.view.state.doc.child(0).content.toJSON())).toBe(shape);
  expect(after[0]).toBe(before[0]);
  expect(after[3]).toBe(before[3]);
  expect(after.slice(1, 3)).not.toEqual(before.slice(1, 3));
  expect(after.some((id) => before.slice(1, 3).includes(id))).toBe(false);
  agrees(tab);
});

test("a surviving prefix keeps its items beside a replacement", () => {
  const tab = open(seedValue([{ id: "p", text: "hello world" }]));
  const before = liveIds(tab, 1, 12);
  expect(before).toHaveLength(11);

  tab.view.dispatch(tab.view.state.tr.replaceWith(6, 12, schema.text(" world")));

  expect(tab.binding.stats.lastGroup.regional).toBe(true);
  expect(tab.view.state.doc.child(0).textContent).toBe("hello world");
  const after = liveIds(tab, 1, 12);
  expect(after).toHaveLength(11);
  expect(after.slice(0, 5)).toEqual(before.slice(0, 5));
  expect(after.slice(5)).not.toEqual(before.slice(5));
  expect(after.some((id) => before.slice(5).includes(id))).toBe(false);
  agrees(tab);
});

test("a multi-step transaction keeps surviving context and rewrites only the replaced text", () => {
  const tab = open(seedValue([{ id: "p", text: "abcdef" }]));
  const before = liveIds(tab, 1, 7);
  expect(before).toHaveLength(6);

  const tr = tab.view.state.tr.insertText("X", 2);
  tr.delete(4, 5);
  tab.view.dispatch(tr);

  expect(tab.binding.stats.lastGroup.regional).toBe(true);
  expect(tab.view.state.doc.child(0).textContent).toBe("aXbdef");
  const after = liveIds(tab, 1, 7);
  expect(after).toHaveLength(6);
  expect(after[0]).toBe(before[0]);
  expect(after[2]).toBe(before[1]);
  expect(after.slice(3)).toEqual(before.slice(3, 6));
  expect(after[1]).not.toBe(before[1]);
  expect(after).not.toContain(before[2]);
  agrees(tab);
});

test("joinBackward changes only the merged block marker id", () => {
  const tab = open(seedValue([{ id: "p", text: "ab" }, { id: "q", text: "cd" }]));
  const before = liveFlow(tab);
  const beforeIds = contentIds(tab);
  expect(markers(before)).toEqual(["1.0:p", "1.5:q"]);

  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, tab.view.state.doc.child(0).nodeSize + 1)));
  commands.joinBackward(tab.view.state, tab.view.dispatch);

  expect(tab.binding.stats.lastGroup.regional).toBe(false);
  expect(tab.binding.stats.lastGroup.structural).toBe(true);
  expect(tab.view.state.doc.childCount).toBe(1);
  expect(tab.view.state.doc.child(0).textContent).toBe("abcd");
  const after = liveFlow(tab);
  expect(markers(after)).toEqual(["1.0:p"]);
  expect(contentIds(tab)).toEqual(beforeIds);
  agrees(tab);
});

test("joinForward changes only the merged block marker id", () => {
  const tab = open(seedValue([{ id: "p", text: "ab" }, { id: "q", text: "cd" }]));
  const before = liveFlow(tab);
  const beforeIds = contentIds(tab);

  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, tab.view.state.doc.child(0).nodeSize - 1)));
  commands.joinForward(tab.view.state, tab.view.dispatch);

  expect(tab.binding.stats.lastGroup.regional).toBe(false);
  expect(tab.binding.stats.lastGroup.structural).toBe(true);
  expect(tab.view.state.doc.childCount).toBe(1);
  expect(tab.view.state.doc.child(0).textContent).toBe("abcd");
  const after = liveFlow(tab);
  expect(markers(after)).toEqual(["1.0:p"]);
  expect(contentIds(tab)).toEqual(beforeIds);
  agrees(tab);
});

test("splitBlock mints only a new block marker id", () => {
  const tab = open(seedValue([{ id: "p", text: "abcd" }]));
  const before = liveFlow(tab);
  const beforeIds = contentIds(tab);
  expect(beforeIds).toEqual(["1.3", "1.4", "1.5", "1.6"]);

  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, 3)));
  commands.splitBlock(tab.view.state, tab.view.dispatch);

  expect(tab.binding.stats.lastGroup.regional).toBe(false);
  expect(tab.binding.stats.lastGroup.structural).toBe(true);
  expect(tab.view.state.doc.childCount).toBe(2);
  expect([tab.view.state.doc.child(0).textContent, tab.view.state.doc.child(1).textContent]).toEqual(["ab", "cd"]);
  const after = liveFlow(tab);
  expect(after.filter((i) => i.kind === "marker")).toHaveLength(2);
  expect(markers(after)[0]).toBe("1.0:p");
  expect(markers(before)).toEqual(["1.0:p"]);
  const minted = markers(after).filter((m) => !markers(before).includes(m));
  expect(minted).toHaveLength(1);
  expect(minted[0].endsWith(`:${tab.view.state.doc.child(1).attrs.id}`)).toBe(true);
  expect(contentIds(tab)).toEqual(beforeIds);
  agrees(tab);
});

test("a hard-break replacement mints a new break id", () => {
  const tab = open(seedValue([{ id: "p", text: "ab" }]));
  tab.view.dispatch(tab.view.state.tr.insert(yAt(tab, 3), schema.nodes.hard_break.create()));
  const before = liveFlow(tab);
  const breaksBefore = before.filter((i) => i.kind === "br");
  expect(breaksBefore).toHaveLength(1);
  expect(texts(before)).toEqual(["1.3:2"]);

  tab.view.dispatch(tab.view.state.tr.replaceWith(3, 4, schema.nodes.hard_break.create()));

  expect(tab.binding.stats.lastGroup.regional).toBe(true);
  const after = liveFlow(tab);
  const breaksAfter = after.filter((i) => i.kind === "br");
  expect(breaksAfter).toHaveLength(1);
  expect(breaksAfter[0].key).not.toBe(breaksBefore[0].key);
  expect(breaksAfter[0].key).toBe(`${tab.pd.ydoc.clientID}.${Number(breaksBefore[0].key.split(".")[1]) + 2}`);
  expect(texts(after)).toEqual(texts(before));
  expect(JSON.stringify(tab.view.state.doc.child(0).content.toJSON())).toBe(JSON.stringify([{ type: "text", text: "ab" }, { type: "hard_break" }]));
  agrees(tab);
});
