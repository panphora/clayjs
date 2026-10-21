globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk, blocksFromYValue, authorKey, removeKey, boundaryKey, copyActiveKey, parseGoneIntents } from "../../../../src/page/ybind/index.js";
import { NET } from "../../../../src/page/ybind/layout.js";
import { createProjectionMap } from "../../../../src/page/ybind/projection-map.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";

const A = 300, B = 100, C = 200;

const seed = (blocks) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = 1;
  seedFrom(pd, blocks);
  return Y.encodeStateAsUpdateV2(pd.ydoc);
};

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
    bridge.pd.ydoc.destroy();
    mount.remove();
  }
});

function open(update, client) {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, update);
  const pd = createPageDoc(doc);
  pd.ydoc.transact(() => pd.origins.set(authorKey(client), `T${client}`), NET);
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, stats, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin()] }),
    dispatchTransaction: (tr) => bridge.dispatch(tr),
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount };
  opened.push(tab);
  return tab;
}

const exchange = (tabs) => { for (const from of tabs) for (const to of tabs) if (to !== from) Y.applyUpdateV2(to.pd.ydoc, Y.encodeStateAsUpdateV2(from.pd.ydoc), NET); };
const rows = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.type.name, node.textContent])); return out; };
const reloaded = (pd) => {
  const doc = new Y.Doc();
  doc.clientID = 401;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return Object.entries(blocksFromYValue(yValueOf(doc))).sort((left, right) => (left[1].pos < right[1].pos ? -1 : 1)).map(([id, block]) => [id, block.t, block.c]);
};
const recovery = (tab) => tab.bridge.recoverable.map((record) => [record.source, record.blockId, record.type, record.blocks.flatMap((block) => block.runs).filter((run) => run.displaced).map((run) => [run.text, run.id, run.author])]);
const agreed = (tabs, expected, records) => {
  for (const tab of tabs) {
    expect(tab.stats.mismatch).toBe(0);
    expect(rows(tab)).toEqual(expected);
    expect(reloaded(tab.pd)).toEqual(expected);
    expect(recovery(tab)).toEqual(records);
    expect(() => createProjectionMap(walk(tab.pd), tab.pd.flow.length)).not.toThrow();
  }
};
const posIn = (tab, id, offset) => { let pos = null; tab.view.state.doc.forEach((node, at) => { if (node.attrs.id === id) pos = at + 1 + offset; }); return pos; };
const type = (tab, id, offset, text) => tab.view.dispatch(tab.view.state.tr.insertText(text, posIn(tab, id, offset)));
const copyMarker = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted || !(it.content instanceof Y.ContentEmbed) || it.content.embed.b !== id) continue;
    if (pd.origins.get(boundaryKey(it.id.client, it.id.clock))?.kind === "copy") return `${it.id.client}.${it.id.clock}`;
  }
  return null;
};
const itemKey = (pd, client, str) => { for (let it = pd.flow._start; it; it = it.right) if (it.id.client === client && it.content instanceof Y.ContentString && it.content.str === str) return `${it.id.client}.${it.id.clock}`; return null; };

const P = ["p", "paragraph", "ALPHA"];

for (const order of ["after the peer edit", "concurrently with the peer edit"]) {
  test(`Undo of a moved copy ${order} keeps the peer text recoverable, and Restore, Redo and a second Undo agree everywhere`, () => {
    const update = seed([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
    const a = open(update, A), b = open(update, B), c = open(update, C);
    const tabs = [a, b, c];

    expect(a.bridge.moveBlocks({ ids: ["q"], afterId: "r" })).toEqual({ status: "moved", ids: ["q"] });
    exchange(tabs);
    const M = copyMarker(a.pd, "q");
    agreed(tabs, [P, ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]], []);

    type(b, "q", 2, "Y");
    const peerY = itemKey(b.pd, B, "Y");
    if (order === "after the peer edit") exchange([b, a]);
    expect(a.bridge.undo()).toBe(true);
    exchange(tabs);
    const displacedY = [[M, "q", "paragraph", [["Y", peerY, `T${B}`]]]];
    agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA"]], displacedY);
    expect(parseGoneIntents(a.pd.gone).copyActive.has(M)).toBe(false);
    expect(walk(a.pd).removals.filter((removal) => removal.sourceKey === M).map((removal) => removal.key)).toEqual([copyActiveKey(M)]);
    expect(b.bridge.notices.map((notice) => [notice.source, notice.authors])).toEqual([[M, [`T${B}`]]]);
    expect(a.bridge.notices).toEqual([]);

    type(c, "r", 5, "!");
    exchange(tabs);
    agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA!"]], displacedY);

    const revision = c.bridge.recoverable[0].revision;
    expect(c.bridge.restore(M, revision)).toEqual({ status: "restored", id: `recovered:${M}` });
    exchange(tabs);
    agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA!"], [`recovered:${M}`, "paragraph", "Y"]], []);
    expect(b.bridge.restore(M, revision)).toEqual({ status: "resolved", id: `recovered:${M}` });

    expect(a.bridge.redo()).toBe(true);
    exchange(tabs);
    agreed(tabs, [P, ["r", "paragraph", "OMEGA!"], ["q", "paragraph", "brYavo"]], []);
    expect(c.bridge.restore(M, revision)).toEqual({ status: "resolved", id: "q" });

    expect(a.bridge.undo()).toBe(true);
    exchange(tabs);
    agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA!"], [`recovered:${M}`, "paragraph", "Y"]], []);

    expect(c.bridge.undo()).toBe(true);
    exchange(tabs);
    agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA!"]], displacedY);

    const again = b.bridge.recoverable[0].revision;
    expect(b.bridge.restore(M, again)).toEqual({ status: "restored", id: `recovered:${M}` });
    expect(c.bridge.restore(M, again)).toEqual({ status: "restored", id: `recovered:${M}` });
    exchange(tabs);
    agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGA!"], [`recovered:${M}`, "paragraph", "Y"]], []);
  });
}

test("Undo of a moved recovered block keeps the peer text recoverable under the moved copy and Redo puts it back", () => {
  const update = seed([{ id: "p", text: "ALPHA" }, { id: "q", t: "heading", attrs: { level: 2 }, text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const a = open(update, A), b = open(update, B), c = open(update, C);
  const tabs = [a, b, c];
  const S = "1.8";
  const target = `recovered:${S}`;
  a.pd.ydoc.transact(() => a.pd.gone.set(removeKey(S, "hide-1"), { blockId: "q", end: "1.16", sv: [] }), NET);
  expect(a.bridge.restore(S, a.bridge.recoverable[0].revision)).toEqual({ status: "restored", id: target });
  exchange(tabs);
  for (const tab of tabs) tab.bridge.um.clear();

  expect(a.bridge.moveBlocks({ ids: [target], afterId: "r" })).toEqual({ status: "moved", ids: [target] });
  exchange(tabs);
  const M = copyMarker(a.pd, target);
  agreed(tabs, [P, ["r", "paragraph", "OMEGA"], [target, "heading", "bravo"]], []);

  type(b, target, 2, "Z");
  const peerZ = itemKey(b.pd, B, "Z");
  exchange([b, a]);
  expect(a.bridge.undo()).toBe(true);
  exchange(tabs);
  agreed(tabs, [P, [target, "heading", "bravo"], ["r", "paragraph", "OMEGA"]], [[M, target, "heading", [["Z", peerZ, `T${B}`]]]]);

  expect(c.bridge.restore(M, c.bridge.recoverable[0].revision)).toEqual({ status: "restored", id: `recovered:${M}` });
  exchange(tabs);
  agreed(tabs, [P, [target, "heading", "bravo"], ["r", "paragraph", "OMEGA"], [`recovered:${M}`, "heading", "Z"]], []);

  expect(a.bridge.redo()).toBe(true);
  exchange(tabs);
  agreed(tabs, [P, ["r", "paragraph", "OMEGA"], [target, "heading", "brZavo"]], []);
});

test("a retired copy ends at a concurrent copy of the same block", () => {
  const update = seed([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const a = open(update, A), b = open(update, B), c = open(update, 400);
  const tabs = [a, b, c];
  a.bridge.moveBlocks({ ids: ["q"], afterId: "r" });
  c.bridge.moveBlocks({ ids: ["q"], afterId: "r" });
  exchange([a, b]);
  type(b, "q", 5, "Y");
  exchange(tabs);
  agreed(tabs, [P, ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravoY"]], []);
  const M = copyMarker(a.pd, "q");
  expect(a.bridge.undo()).toBe(true);
  exchange(tabs);
  agreed(tabs, [P, ["r", "paragraph", "OMEGA"], ["q", "paragraph", "bravo"]], [[M, "q", "paragraph", [["Y", itemKey(b.pd, B, "Y"), `T${B}`]]]]);
});

test("a peer join of the moved copy keeps its text in the receiving block after Undo", () => {
  const update = seed([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const a = open(update, A), b = open(update, B);
  const tabs = [a, b];
  a.bridge.moveBlocks({ ids: ["q"], afterId: "r" });
  exchange(tabs);
  type(b, "q", 2, "Y");
  const start = posIn(b, "q", 0);
  b.view.dispatch(b.view.state.tr.delete(start - 2, start));
  exchange(tabs);
  agreed(tabs, [P, ["r", "paragraph", "OMEGAbrYavo"]], []);
  expect(a.bridge.undo()).toBe(true);
  exchange(tabs);
  agreed(tabs, [P, ["q", "paragraph", "bravo"], ["r", "paragraph", "OMEGAY"]], []);
});
