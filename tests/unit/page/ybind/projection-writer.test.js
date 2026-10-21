globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { schema } from "../../../../src/page/schema.js";
import { identityPlugin } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, docOf, walk, removeKey, restoreKey, boundaryKey, blocksFromYValue, deletePieces, projectionOf, attrKey, parseGoneIntents } from "../../../../src/page/ybind/index.js";
import { yValueOf } from "../../../../src/page/ybind/provider.js";
import { LOCAL } from "../../../../src/page/ybind/layout.js";

const page = (client, blocks) => {
  const pd = createPageDoc(new Y.Doc());
  pd.ydoc.clientID = client;
  pd.ydoc.transact(() => {
    for (const block of blocks) {
      pd.flow.insertEmbed(pd.flow.length, { b: block.id });
      for (const part of block.parts ?? (block.text ? [block.text] : [])) {
        if (typeof part === "string") pd.flow.insert(pd.flow.length, part);
        else pd.flow.insertEmbed(pd.flow.length, part);
      }
    }
  }, LOCAL);
  return pd;
};

const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.content instanceof Y.ContentEmbed && it.content.embed.b === id) return `${it.id.client}.${it.id.clock}`;
  }
  throw new Error(`Missing marker ${id}`);
};
const indexAt = (pd, sourceKey) => {
  let at = 0;
  for (let it = pd.flow._start; it; it = it.right) {
    if (`${it.id.client}.${it.id.clock}` === sourceKey) return it.deleted ? at : at + it.length;
    if (!it.deleted && it.countable) at += it.length;
  }
  throw new Error(`Missing source ${sourceKey}`);
};
const hide = (pd, sourceKey, blockId, end, operationId, sv = []) => {
  pd.ydoc.transact(() => pd.gone.set(removeKey(sourceKey, operationId), { blockId, end, sv }), LOCAL);
};
const addRestore = (pd, sourceKey, operationId, covers, baseline) => addRestoreAt(pd, sourceKey, indexAt(pd, sourceKey), operationId, covers, baseline);
const registerBoundary = (pd, id, sourceKey) => {
  let marker = null;
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.id.client !== pd.ydoc.clientID || !(it.content instanceof Y.ContentEmbed) || it.content.embed.b !== id) continue;
    if (!marker || it.id.clock > marker.clock) marker = it.id;
  }
  if (!marker) throw new Error(`Missing recovered marker ${id}`);
  pd.origins.set(boundaryKey(marker.client, marker.clock), { blockId: id, kind: "restore", recoveryOf: sourceKey });
};
const addRestoreAt = (pd, sourceKey, at, operationId, covers, baseline) => {
  const id = `recovered:${sourceKey}`;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(at, { b: id });
    registerBoundary(pd, id, sourceKey);
    pd.gone.set(restoreKey(sourceKey, operationId), { covers, baseline });
  }, LOCAL);
};
const clone = (pd, client) => {
  const doc = new Y.Doc();
  doc.clientID = client;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  return createPageDoc(doc);
};
const merge = (target, source) => Y.applyUpdateV2(target.ydoc, Y.encodeStateAsUpdateV2(source.ydoc));

const opened = [];
afterEach(() => {
  for (const { view, bridge, mount } of opened.splice(0)) {
    view.destroy();
    bridge.dispose();
    bridge.pd.ydoc.destroy();
    mount.remove();
  }
});

function open(pd, plugins = []) {
  const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
  const bridge = createBridge({ pd, stats, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin(), ...plugins] }),
    dispatchTransaction: (tr) => bridge.dispatch(tr),
  });
  bridge.attach(view);
  const tab = { pd, bridge, stats, view, mount };
  opened.push(tab);
  return tab;
}

const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((node) => out.push([node.attrs.id, node.textContent])); return out; };
const at = (tab, index, offset) => {
  let pos;
  tab.view.state.doc.forEach((node, start, i) => { if (i === index) pos = start + 1 + offset; });
  return pos;
};

const units = (pd) => {
  const out = [];
  let ctx = {};
  for (let it = pd.flow._start; it; it = it.right) {
    if (it.deleted) continue;
    const c = it.content;
    if (c instanceof Y.ContentFormat) { if (c.value === null) delete ctx[c.key]; else ctx[c.key] = c.value; continue; }
    if (!it.countable) continue;
    const kind = c.str !== undefined ? "text" : c.embed.b !== undefined ? "marker" : "br";
    for (let i = 0; i < it.length; i++) out.push({ kind, id: `${it.id.client}.${it.id.clock + i}`, value: c.str !== undefined ? c.str[i] : c.embed.b !== undefined ? c.embed.b : "br", attrs: { ...ctx } });
  }
  return out;
};
const itemIds = (pd) => units(pd).map((unit) => `${unit.id}:${unit.kind === "text" ? unit.value : `[${unit.value}]`}`);
const settled = (tab) => { expect(tab.stats.mismatch).toBe(0); expect(projected(tab)).toEqual(blocks(tab)); };

const recoveredBang = () => {
  const pd = page(1, [{ id: "p", text: "OMEGA" }, { id: "q", text: "!" }]);
  const q = keyOf(pd, "q");
  hide(pd, q, "q", null, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });
  return { pd, q };
};

const recoveredHeading = () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "!" }, { id: "r", text: "OMEGA" }]);
  const q = keyOf(pd, "q");
  hide(pd, q, "q", null, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "heading", attrs: { parent: null, level: 2 } });
  return { pd, q };
};

const blockRows = (doc) => {
  const out = [];
  doc.forEach((node) => out.push([node.attrs.id, node.type.name, node.textContent, node.attrs.level ?? null, node.attrs.parent ?? null]));
  return out;
};
const viewRows = (tab) => blockRows(tab.view.state.doc);
const modelRows = (tab) => blockRows(docOf(tab.pd, walk(tab.pd)));
const setMarkup = (tab, id, attrs) => {
  let pos = null, node = null;
  tab.view.state.doc.forEach((n, at) => { if (n.attrs.id === id) { pos = at; node = n; } });
  if (pos === null) throw new Error(`Missing block ${id}`);
  tab.view.dispatch(tab.view.state.tr.setNodeMarkup(pos, node.type, { ...node.attrs, ...attrs }));
};
const reloadFields = (pd, sourceKey) => {
  const doc = new Y.Doc();
  doc.clientID = 700;
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(pd.ydoc));
  const fresh = createPageDoc(doc);
  const intents = parseGoneIntents(fresh.gone, { strict: true });
  const fields = intents.attrs.get(sourceKey);
  const out = fields ? Object.fromEntries(fields) : null;
  fresh.ydoc.destroy();
  return out;
};

test("a recovered ! sits beside the preceding OMEGA block in one physical flow", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.7:!"]);
  settled(tab);
});

test("deleting only the recovered ! leaves the preceding paragraph intact", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  tab.view.dispatch(tab.view.state.tr.delete(at(tab, 1, 0), at(tab, 1, 1)));
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, ""]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.9:[recovered:${q}]`]);
  settled(tab);
  expect(blocksFromYValue(yValueOf(tab.pd.ydoc))).toEqual({
    p: { t: "paragraph", pos: "00000001", c: "OMEGA" },
    [`recovered:${q}`]: { t: "paragraph", pos: "00000002", c: "" },
  });
});

test("new text inside the recovered root reaches its source physical region", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  tab.view.dispatch(tab.view.state.tr.insertText("X", at(tab, 1, 1)));
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "!X"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.7:!", "1.12:X"]);
  settled(tab);
});

test("insertion on the left of the hidden source marker appends to the preceding block", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  tab.view.dispatch(tab.view.state.tr.insertText("A", at(tab, 0, 5)));
  expect(blocks(tab)).toEqual([["p", "OMEGAA"], [`recovered:${q}`, "!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.12:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.7:!"]);
  settled(tab);
});

test("insertion on the right of the hidden source marker reaches the recovered root", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  tab.view.dispatch(tab.view.state.tr.insertText("B", at(tab, 1, 0)));
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "B!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.12:B", "1.7:!"]);
  settled(tab);
});

test("formatting the recovered text never marks the hidden source marker", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  tab.view.dispatch(tab.view.state.tr.addMark(at(tab, 1, 0), at(tab, 1, 1), schema.marks.strong.create()));
  const marked = units(pd).filter((unit) => Object.keys(unit.attrs).length);
  expect(marked.map((unit) => unit.id)).toEqual(["1.7"]);
  expect(Object.values(marked[0].attrs)).toEqual([true]);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "!"]]);
  settled(tab);
});

test("the recovered marker is one physical unit and a zero-width deletion has no physical range", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  const map = projectionOf(walk(pd).tokens, walk(pd).holes, pd.flow.length);
  expect(map.physicalRanges(7, 8)).toEqual([[8, 9]]);
  expect(units(pd).slice(8, 9)).toEqual([{ kind: "text", id: "1.7", value: "!", attrs: {} }]);
  expect(map.physicalRanges(7, 7)).toEqual([]);
  const before = itemIds(pd);
  deletePieces(pd, map, [[7, 7]]);
  expect(itemIds(pd)).toEqual(before);
  tab.view.dispatch(tab.view.state.tr.delete(at(tab, 1, 0), at(tab, 1, 0)));
  expect(itemIds(pd)).toEqual(before);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "!"]]);
  settled(tab);
});

test("a hard break and a surrogate-pair emoji keep their exact units beside a recovered block", () => {
  const pd = page(1, [{ id: "p", parts: ["a", { br: 1 }, "\u{1F600}"] }, { id: "q", text: "!" }]);
  const q = keyOf(pd, "q");
  hide(pd, q, "q", null, "move-1");
  addRestore(pd, q, "restore-1", [removeKey(q, "move-1")], { type: "paragraph", attrs: {} });
  const tab = open(pd);
  expect(blocks(tab)).toEqual([["p", "a\u{1F600}"], [`recovered:${q}`, "!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:a", "1.2:[br]", "1.3:\ud83d", "1.4:\ude00", "1.5:[q]", `1.8:[recovered:${q}]`, "1.6:!"]);

  tab.view.dispatch(tab.view.state.tr.delete(3, 5));
  expect(blocks(tab)).toEqual([["p", "a"], [`recovered:${q}`, "!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:a", "1.2:[br]", "1.5:[q]", `1.8:[recovered:${q}]`, "1.6:!"]);
  settled(tab);

  tab.view.dispatch(tab.view.state.tr.insertText("\u{1F600}", 3));
  expect(blocks(tab)).toEqual([["p", "a\u{1F600}"], [`recovered:${q}`, "!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:a", "1.2:[br]", "1.12:\ud83d", "1.13:\ude00", "1.5:[q]", `1.8:[recovered:${q}]`, "1.6:!"]);
  settled(tab);
  expect(blocksFromYValue(yValueOf(pd.ydoc))).toEqual({
    p: { t: "paragraph", pos: "00000001", c: "a\ufffc\u{1F600}", m: [[1, ""], [1, '@{"type":"hard_break"}'], [2, ""]] },
    [`recovered:${q}`]: { t: "paragraph", pos: "00000002", c: "!" },
  });
});

test("a hidden second marker inside the recovered root is never formatted or deleted", () => {
  const pd = page(1, [{ id: "p", text: "OMEGA" }, { id: "q", text: "bravo!" }]);
  const q = keyOf(pd, "q");
  hide(pd, q, "q", null, "move-1");
  const removal = removeKey(q, "move-1");
  addRestoreAt(pd, q, 7, "restore-1", [removal], { type: "paragraph", attrs: {} });
  addRestoreAt(pd, q, 13, "restore-2", [removal], { type: "paragraph", attrs: {} });
  const tab = open(pd);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "bravo!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.14:[recovered:${q}]`, "1.7:b", "1.8:r", "1.9:a", "1.10:v", "1.11:o", `1.17:[recovered:${q}]`, "1.12:!"]);

  tab.view.dispatch(tab.view.state.tr.addMark(at(tab, 1, 0), at(tab, 1, 6), schema.marks.strong.create()));
  const marked = units(pd).filter((unit) => Object.keys(unit.attrs).length);
  expect(marked.map((unit) => unit.id)).toEqual(["1.7", "1.8", "1.9", "1.10", "1.11", "1.12"]);
  settled(tab);

  tab.view.dispatch(tab.view.state.tr.delete(at(tab, 1, 0), at(tab, 1, 6)));
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, ""]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.14:[recovered:${q}]`, `1.17:[recovered:${q}]`]);
  settled(tab);
});

test("typing at the end of a block before a plain hidden span stays visible", () => {
  const seed = page(1, [{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
  const peer = clone(seed, 2);
  peer.ydoc.transact(() => peer.flow.insert(7, "ZZ"), LOCAL);
  merge(seed, peer);
  const q = keyOf(seed, "q");
  const rr = keyOf(seed, "r");
  hide(seed, q, "q", rr, "op-b");
  hide(seed, q, "q", null, "op-c");
  const tab = open(seed);
  expect(blocks(tab)).toEqual([["p", "ALPHA"], ["r", "OMEGA"]]);
  expect(walk(seed).holes).toEqual([{ at: 6, len: 8 }]);

  tab.view.dispatch(tab.view.state.tr.insertText("A", at(tab, 0, 5)));
  expect(blocks(tab)).toEqual([["p", "ALPHAA"], ["r", "OMEGA"]]);
  expect(itemIds(seed)).toEqual(["1.0:[p]", "1.1:A", "1.2:L", "1.3:P", "1.4:H", "1.5:A", "1.20:A", "1.6:[q]", "2.0:Z", "2.1:Z", "1.7:b", "1.8:r", "1.9:a", "1.10:v", "1.11:o", "1.12:[r]", "1.13:O", "1.14:M", "1.15:E", "1.16:G", "1.17:A"]);
  settled(tab);
});

test("a mark step in the same transaction as an insertion keeps its visible units", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  const tr = tab.view.state.tr.insertText("XY", at(tab, 1, 0));
  tr.addMark(at(tab, 1, 0), at(tab, 1, 0) + 2, schema.marks.strong.create());
  tab.view.dispatch(tr);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "XY!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.13:X", "1.14:Y", "1.7:!"]);
  const marked = units(pd).filter((unit) => Object.keys(unit.attrs).length);
  expect(marked.map((unit) => unit.id)).toEqual(["1.13", "1.14"]);
  settled(tab);

  const tail = tab.view.state.tr.insertText("Z", at(tab, 1, 3));
  tail.addMark(at(tab, 1, 3), at(tab, 1, 4), schema.marks.em.create());
  tab.view.dispatch(tail);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "XY!Z"]]);
  expect(units(pd).filter((unit) => Object.keys(unit.attrs).length).map((unit) => unit.id)).toEqual(["1.13", "1.14", "1.19"]);
  const z = units(pd).find((unit) => unit.value === "Z");
  expect(z.id).toBe("1.19");
  expect(Object.keys(z.attrs).every((key) => key.startsWith("em~"))).toBe(true);
  expect(Object.keys(z.attrs).length).toBeGreaterThan(0);
  settled(tab);
});

test("inserting before a hidden span and marking the new character never marks the recovered text", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  const from = at(tab, 0, 5);
  const tr = tab.view.state.tr.insertText("X", from);
  tr.addMark(from, from + 1, schema.marks.strong.create());
  tab.view.dispatch(tr);

  expect(blocks(tab)).toEqual([["p", "OMEGAX"], [`recovered:${q}`, "!"]]);
  const marked = units(pd).filter((unit) => Object.keys(unit.attrs).length);
  expect(marked.map((unit) => unit.value)).toEqual(["X"]);
  expect(marked[0].id).not.toBe("1.7");
  settled(tab);
});

test("a multi-step local transaction writes both sides of the hidden span at their physical positions", () => {
  const { pd, q } = recoveredBang();
  const tab = open(pd);
  const tr = tab.view.state.tr.insertText("A", at(tab, 0, 5));
  tr.insertText("B", tr.mapping.map(at(tab, 1, 0)));
  tab.view.dispatch(tr);
  expect(blocks(tab)).toEqual([["p", "OMEGAA"], [`recovered:${q}`, "B!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.13:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.12:B", "1.7:!"]);
  settled(tab);
  expect(blocksFromYValue(yValueOf(pd.ydoc))).toEqual({
    p: { t: "paragraph", pos: "00000001", c: "OMEGAA" },
    [`recovered:${q}`]: { t: "paragraph", pos: "00000002", c: "B!" },
  });

  expect(tab.bridge.undo()).toBe(true);
  expect(blocks(tab)).toEqual([["p", "OMEGA"], [`recovered:${q}`, "!"]]);
  expect(itemIds(pd)).toEqual(["1.0:[p]", "1.1:O", "1.2:M", "1.3:E", "1.4:G", "1.5:A", "1.6:[q]", `1.9:[recovered:${q}]`, "1.7:!"]);
  settled(tab);

  expect(tab.bridge.redo()).toBe(true);
  expect(blocks(tab)).toEqual([["p", "OMEGAA"], [`recovered:${q}`, "B!"]]);
  settled(tab);
});

test("a field edit on a recovered block writes a flat override keyed by its source", () => {
  const { pd, q } = recoveredHeading();
  const tab = open(pd);
  const target = `recovered:${q}`;
  expect(blocks(tab)).toEqual([["p", "ALPHA"], [target, "!"], ["r", "OMEGA"]]);
  expect(viewRows(tab)).toEqual([
    ["p", "paragraph", "ALPHA", null, null],
    [target, "heading", "!", 2, null],
    ["r", "paragraph", "OMEGA", null, null],
  ]);
  settled(tab);

  setMarkup(tab, target, { level: 3, parent: "p" });
  settled(tab);
  expect(viewRows(tab)).toEqual([
    ["p", "paragraph", "ALPHA", null, null],
    [target, "heading", "!", 3, "p"],
    ["r", "paragraph", "OMEGA", null, null],
  ]);
  expect(modelRows(tab)).toEqual(viewRows(tab));
  expect(pd.gone.get(attrKey(q, "level"))).toBe(3);
  expect(pd.gone.get(attrKey(q, "parent"))).toBe("p");
  expect(pd.attrs.has(target)).toBe(false);
  expect(reloadFields(pd, q)).toEqual({ level: 3, parent: "p" });

  expect(tab.bridge.undo()).toBe(true);
  settled(tab);
  expect(viewRows(tab)[1]).toEqual([target, "heading", "!", 2, null]);
  expect(pd.gone.has(attrKey(q, "level"))).toBe(false);
  expect(pd.gone.has(attrKey(q, "parent"))).toBe(false);

  expect(tab.bridge.redo()).toBe(true);
  settled(tab);
  expect(viewRows(tab)[1]).toEqual([target, "heading", "!", 3, "p"]);

  expect(tab.bridge.moveBlocks({ ids: [target], afterId: "r", parent: null })).toEqual({ status: "moved", ids: [target] });
  settled(tab);
  expect(viewRows(tab)).toEqual([
    ["p", "paragraph", "ALPHA", null, null],
    ["r", "paragraph", "OMEGA", null, null],
    [target, "heading", "!", 3, null],
  ]);

  setMarkup(tab, target, { level: 4 });
  settled(tab);
  expect(viewRows(tab)[2]).toEqual([target, "heading", "!", 4, null]);
  expect(pd.gone.get(attrKey(q, "level"))).toBe(4);
  expect(pd.gone.get(attrKey(q, "parent"))).toBe(null);
  expect(pd.attrs.has(target)).toBe(false);
  expect(reloadFields(pd, q)).toEqual({ level: 4, parent: null });
});

test("an ordinary block whose public ID begins recovered: keeps writing ordinary attributes", () => {
  const pd = page(1, [{ id: "p", text: "ALPHA" }, { id: "recovered:1.0", text: "ok" }]);
  pd.ydoc.transact(() => {
    const m = new Y.Map();
    m.set("t", "heading");
    m.set("level", 2);
    pd.attrs.set("recovered:1.0", m);
  }, LOCAL);
  const tab = open(pd);
  expect(viewRows(tab)).toEqual([
    ["p", "paragraph", "ALPHA", null, null],
    ["recovered:1.0", "heading", "ok", 2, null],
  ]);
  settled(tab);

  setMarkup(tab, "recovered:1.0", { level: 3, parent: "p" });
  settled(tab);
  expect(viewRows(tab)[1]).toEqual(["recovered:1.0", "heading", "ok", 3, "p"]);
  expect(modelRows(tab)).toEqual(viewRows(tab));
  expect(pd.attrs.get("recovered:1.0").get("level")).toBe(3);
  expect(pd.attrs.get("recovered:1.0").get("parent")).toBe("p");
  expect(parseGoneIntents(pd.gone).attrs.size).toBe(0);
});
