globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, blocksFromYValue, physicalKeyOf, authorKey, copyLostKey } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const seed = () => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  pd.origins.set(authorKey(1), "seed");
  return pd;
};
const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc), NET);

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
    bridge.pd.ydoc.destroy();
    mount.remove();
  }
});
function open(pd, options = {}) {
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const notices = [];
  const bridge = createBridge({ pd, stats, captureTimeout: 0, onNotice: (notice) => notices.push(notice), ...options });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => bridge.dispatch(tr),
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount, notices };
  opened.push(tab);
  return tab;
}
const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const typeAtEnd = (tab, id, text) => {
  let end = null;
  tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) end = pos + node.nodeSize - 1; });
  tab.view.dispatch(tab.view.state.tr.insertText(text, end));
};
const loserKey = (pd, client) => {
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed.b === "q" && it.id.client === client) return physicalKeyOf(it.id);
  return null;
};

const race = () => {
  const base = seed();
  const a = open(clone(base, 100), { authorToken: "tok-a" });
  const b = open(clone(base, 200), { authorToken: "tok-b" });
  expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
  expect(b.bridge.moveBlocks({ ids: ["q"], afterId: null })).toEqual({ status: "moved", ids: ["q"] });
  typeAtEnd(b, "q", "!Z");
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);
  return { a, b, lost: loserKey(a.pd, 200) };
};

test("a losing duplicate copy with its own typing joins the shared recovery list", () => {
  const { a, b, lost } = race();
  expect(lost).not.toBe(null);
  for (const tab of [a, b]) {
    expect(blocks(tab)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
    const record = tab.bridge.recoverable.find((entry) => entry.source === lost);
    expect(record).toBeDefined();
    expect(record.blockId).toBe("q");
    expect(record.removals.map((removal) => removal.key)).toEqual([copyLostKey(lost)]);
    const displaced = record.blocks.flatMap((block) => block.runs).filter((run) => run.displaced);
    expect(displaced.map((run) => run.text).join("")).toBe("!Z");
    expect(displaced.every((run) => run.author === "tok-b")).toBe(true);
    expect(tab.notices.filter((notice) => notice.kind === "deleted-block-edit")).toEqual([]);
  }
  expect(a.notices.filter((notice) => notice.source === lost)).toEqual([]);
  expect(b.notices.filter((notice) => notice.source === lost).map((notice) => notice.kind)).toEqual(["recovered-change"]);
});

test("Restore of a losing copy shows it once as a recovered block, survives reload, and Undo puts it back in the list", () => {
  const { a, b, lost } = race();
  const record = a.bridge.recoverable.find((entry) => entry.source === lost);
  expect(a.bridge.restore(lost, record.revision)).toEqual({ status: "restored", id: `recovered:${lost}` });
  expect(blocks(a)).toEqual([[`recovered:${lost}`, "bravo!Z"], ["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(a.bridge.recoverable.find((entry) => entry.source === lost)).toBeUndefined();
  expect(a.bridge.restore(lost, record.revision)).toEqual({ status: "resolved", id: `recovered:${lost}` });
  merge(b.pd, a.pd);
  expect(blocks(b)).toEqual(blocks(a));
  const reloaded = blocksFromYValue(yValueOf(clone(a.pd, 401).ydoc));
  expect(Object.values(reloaded).sort((x, y) => (x.pos < y.pos ? -1 : 1)).map((block) => block.c)).toEqual(["bravo!Z", "ALPHA", "OMEGA", "bravo"]);
  expect(a.bridge.undo()).toBe(true);
  expect(blocks(a)).toEqual([["p", "ALPHA"], ["r", "OMEGA"], ["q", "bravo"]]);
  expect(a.bridge.recoverable.map((entry) => entry.source)).toContain(lost);
  expect(a.stats.mismatch).toBe(0);
});

const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };

test("a deleted copy marker ends a retired copy so a cross-block delete keeps the surviving text", () => {
  const base = createPageDoc(new Y.Doc());
  base.ydoc.clientID = 1;
  seedFrom(base, [{ id: "x", text: "" }, { id: "p", text: "ALPHA" }, { id: "u", text: "OMEGA" }, { id: "m", text: "" }, { id: "t", t: "toggle", attrs: { open: true }, text: "HEADTAIL" }]);
  base.origins.set(authorKey(1), "seed");
  const a = open(clone(base, 300), { authorToken: "tok-a" });
  const b = open(clone(base, 200), { authorToken: "tok-b" });

  expect(b.bridge.moveBlocks({ ids: ["m", "t"], afterId: "p" })).toEqual({ status: "moved", ids: ["m", "t"] });
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);
  expect(a.bridge.moveBlocks({ ids: ["x"], afterId: "p" })).toEqual({ status: "moved", ids: ["x"] });
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);
  expect(a.bridge.undo()).toBe(true);
  merge(a.pd, b.pd);
  merge(b.pd, a.pd);

  const retired = walk(a.pd).hidden.filter((entry) => entry.blockId === "x");
  expect(retired).toHaveLength(1);
  expect(retired[0].live).toBe(true);

  let from = null, to = null;
  a.view.state.doc.forEach((node, pos) => {
    if (node.attrs.id === "p") from = pos + node.textContent.length;
    if (node.attrs.id === "t") to = pos + 2;
  });
  a.view.dispatch(a.view.state.tr.delete(from, to));

  expect(a.stats.mismatch).toBe(0);
  expect(blocks(a)).toEqual([["x", ""], ["p", "ALPHEADTAIL"], ["u", "OMEGA"]]);
  expect(projected(a)).toEqual(blocks(a));
  expect(b.stats.mismatch).toBe(0);
});
