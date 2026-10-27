globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { schema } from "../../../src/page/schema.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { createYPageBinding, createPageDoc, docOf, walk, bareShape, seedValue } from "../../../src/page/ybind/index.js";
import { docFromValue, yValueOf } from "../../../src/page/ybind/provider.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { renderFromTags } from "../../../src/page/save-projection.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { opaqueMark } from "../../../src/page/format-codec.js";
import { turnInto, REFUSED } from "../../../src/page/items.js";
import { gridFromClipboard } from "../../../src/page/table-paste.js";
import { editor, posOf, select, typeText } from "./view-helpers.js";

/**
 * The editing commands a person uses on a page holding content from a newer
 * version: what is copied, pasted, cut, converted, undone and saved through the
 * editor's own clipboard events, commands and history. Nothing here reads the
 * clipboard through an API the browser pass would not use.
 */

beforeAll(() => { document.elementFromPoint = () => null; });
afterAll(() => { delete document.elementFromPoint; });

const opened = [];
afterEach(() => {
  for (const { view, binding, mount } of opened.splice(0)) {
    if (!view.isDestroyed) view.destroy();
    binding.dispose();
    binding.ydoc.destroy();
    mount.remove();
  }
  document.body.innerHTML = "";
});

const clip = (data = {}) => {
  const store = { ...data };
  return {
    data: store,
    clipboardData: {
      setData: (type, value) => { store[type] = String(value); },
      getData: (type) => store[type] ?? "",
      clearData: (type) => { if (type === undefined) for (const key of Object.keys(store)) delete store[key]; else delete store[type]; },
      get types() { return Object.keys(store); },
      files: [],
    },
  };
};
const fire = (view, type, event = clip()) => {
  const domEvent = Object.assign(new Event(type, { bubbles: true, cancelable: true }), event);
  view.dom.dispatchEvent(domEvent);
  return domEvent;
};
const paste = (view, data) => fire(view, "paste", clip(data));
const selectBlocksIn = (view, lo, hi = lo) => view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, lo, hi)));
const shapeOf = (view) => { const out = []; view.state.doc.forEach((n) => out.push(`${n.type.name}:${n.textContent}`)); return out; };

// ---- a page from a newer peer ------------------------------------------------

const NEWER = {
  marks: [{ key: "underline~p1", value: true }, { key: "clay_opaque_code~p2", value: { tokens: ["u"] } }],
  block: { id: "q", t: "quote", text: "Read this too", record: { unknown: { keep: true } } },
};

function newerPeer(value) {
  const pd = createPageDoc(docFromValue(value));
  pd.ydoc.clientID = 707;
  pd.ydoc.transact(() => {
    pd.flow.insertEmbed(7, { b: NEWER.block.id });
    pd.flow.insert(8, NEWER.block.text);
    pd.flow.format(1, 4, { [NEWER.marks[0].key]: NEWER.marks[0].value });
    pd.flow.format(5, 2, { [NEWER.marks[1].key]: NEWER.marks[1].value });
    pd.attrs.set(NEWER.block.id, new Y.Map([["t", NEWER.block.t], ...Object.entries(NEWER.block.record)]));
  }, NET);
  return pd;
}

const features = { ensure: () => Promise.resolve(), has: () => false, dispose() {} };

function open(value) {
  const store = createStore({ name: "page", value: JSON.parse(JSON.stringify(value)) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: (tr) => binding.dispatch(tr), features });
  binding.attach(view);
  const tab = { store, binding, view, mount };
  opened.push(tab);
  return tab;
}

const relay = (from, to) => Y.applyUpdateV2(to.binding.ydoc, Y.encodeStateAsUpdateV2(from.ydoc ?? from.binding.ydoc), NET);
const page = () => seedValue([{ id: "a", text: "before" }, { id: "b", text: "after" }]);
function room() {
  const peer = newerPeer(page());
  const tab = open(page());
  relay(peer, tab);
  return { tab, peer };
}

const find = (doc, id) => { let found = null; doc.forEach((node, pos) => { if (!found && node.attrs.id === id) found = { node, pos }; }); return found; };
const nodeOf = (tab, id) => find(tab.view.state.doc, id)?.node ?? null;
const types = (doc) => { const out = []; doc.forEach((node) => out.push(node.type.name)); return out; };
const updates = (tab) => { const counter = { n: 0 }; tab.binding.ydoc.on("update", () => { counter.n++; }); return counter; };
const runsOf = (pd, id) => {
  const out = [];
  let inside = false;
  for (const part of pd.flow.toDelta()) {
    if (typeof part.insert !== "string") { inside = part.insert?.b === id; continue; }
    if (inside) out.push({ text: part.insert, attributes: part.attributes ?? null });
  }
  return out;
};
const attrsOf = (pd, id) => {
  const map = pd.attrs.get(id);
  return map ? JSON.parse(JSON.stringify(Object.fromEntries(map))) : null;
};
const known = (key) => schema.marks[key.split("!")[0].split("~")[0]] !== undefined;
const unknown = (attributes) => Object.fromEntries(Object.entries(attributes ?? {}).filter(([key]) => !known(key)));
const unknownRuns = (pd, id) => runsOf(pd, id).map((part) => [part.text, unknown(part.attributes)]);
const unknownUnits = (pd, id) => runsOf(pd, id).flatMap((part) => [...part.text].map((ch) => [ch, unknown(part.attributes)]));

// ---- the clipboard, on a page this runtime can hold --------------------------

const QUOTE = { t: "quote", c: "Read this too", unknown: { keep: true } };
const quoteAt = (view, at) => {
  const node = schema.nodes.opaque_block.create({ id: "q", pos: "C", parent: null, raw: QUOTE }, schema.text(QUOTE.c));
  view.dispatch(view.state.tr.insert(at, node));
};

test("copying a selection with an opaque block and pasting it reproduces the record and its text", () => {
  const view = editor([["a", "paragraph", "before"], ["b", "paragraph", "after"]]);
  quoteAt(view, posOf(view, "b") - 1);
  expect(shapeOf(view)).toEqual(["paragraph:before", "opaque_block:Read this too", "paragraph:after"]);
  selectBlocksIn(view, 1);
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/plain"]).toBe("Read this too");
  expect(event.data["text/html"]).toContain('data-clay-page-opaque="1"');
  expect(event.data["text/html"]).toContain('data-clay-page-value="');
  expect(event.data["text/html"]).toContain("Read this too");

  select(view, posOf(view, "b") + "after".length);
  paste(view, event.data);
  expect(shapeOf(view)).toEqual(["paragraph:before", "opaque_block:Read this too", "paragraph:after", "opaque_block:Read this too"]);
  const copied = view.state.doc.child(3);
  expect(copied.type.name).toBe("opaque_block");
  expect(copied.attrs.raw).toEqual(QUOTE);
  expect(copied.textContent).toBe(QUOTE.c);
  expect(copied.attrs.id).not.toBe("q");
});

test("pasting a copied opaque block into a live page keeps it in the document and in Yjs", () => {
  const { tab } = room();
  const view = tab.view;
  const pd = tab.binding.pd;
  selectBlocksIn(view, 1);
  const event = clip();
  fire(view, "copy", event);
  const b = find(view.state.doc, "b");
  select(view, b.pos + 1 + "after".length);
  paste(view, event.data);
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph", "opaque_block"]);
  const pasted = view.state.doc.child(3);
  expect(pasted.textContent).toBe("Read this too");
  expect(pasted.attrs.raw).toEqual({ t: "quote", c: "Read this too", unknown: { keep: true } });
  const id = pasted.attrs.id;
  expect(id).not.toBe("q");
  expect(attrsOf(pd, id)).toEqual({ t: "quote", c: "Read this too", unknown: { keep: true } });
  expect(runsOf(pd, id)).toEqual([{ text: "Read this too", attributes: null }]);
  expect(walk(pd).orphans).toEqual([]);
});

test("copying text with an unknown descriptor pastes the descriptor back", () => {
  const { tab } = room();
  const view = tab.view;
  const a = find(view.state.doc, "a");
  select(view, a.pos + 1, a.pos + 1 + "befo".length);
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/html"]).toContain("data-clay-page-marks=");
  const b = find(view.state.doc, "b");
  select(view, b.pos + 1 + "after".length);
  paste(view, event.data);
  const last = view.state.doc.child(2);
  expect(last.textContent).toBe("afterbefo");
  const marked = last.child(last.childCount - 1);
  expect(marked.text).toBe("befo");
  expect(marked.marks.map((mark) => mark.type.name)).toEqual(["opaque_marks"]);
  expect(JSON.parse(JSON.stringify(marked.marks[0].attrs.entries))).toEqual([{ name: "underline", attrs: {} }]);
});

test("an invalid envelope on paste falls back to readable text and invents no record", () => {
  const view = editor([["a", "paragraph", "before"], ["b", "paragraph", "after"]]);
  quoteAt(view, posOf(view, "b") - 1);
  selectBlocksIn(view, 1);
  const event = clip();
  fire(view, "copy", event);
  const broken = event.data["text/html"].replace(/data-clay-page-value="[^"]*"/, 'data-clay-page-value="not-a-record"');
  expect(broken).not.toBe(event.data["text/html"]);

  select(view, posOf(view, "b") + "after".length);
  paste(view, { "text/html": broken, "text/plain": "Read this too" });
  expect(shapeOf(view)).toEqual(["paragraph:before", "opaque_block:Read this too", "paragraph:after", "paragraph:Read this too"]);
});

test("an invalid marks envelope on paste keeps the text and invents no descriptor", () => {
  const { tab } = room();
  const view = tab.view;
  const a = find(view.state.doc, "a");
  select(view, a.pos + 1, a.pos + 1 + "befo".length);
  const event = clip();
  fire(view, "copy", event);
  const broken = event.data["text/html"].replace(/data-clay-page-marks="[^"]*"/, 'data-clay-page-marks="%%%"');
  expect(broken).not.toBe(event.data["text/html"]);
  const b = find(view.state.doc, "b");
  select(view, b.pos + 1 + "after".length);
  paste(view, { "text/html": broken, "text/plain": "befo" });
  const last = view.state.doc.child(2);
  expect(last.textContent).toBe("afterbefo");
  let marked = false;
  last.descendants((node) => { if (node.isText && node.marks.length) marked = true; });
  expect(marked).toBe(false);
});

test("a plain-text paste stays plain text", () => {
  const view = editor([["a", "paragraph", "before"]]);
  select(view, posOf(view, "a") + "before".length);
  paste(view, { "text/plain": "<b>not markup</b>" });
  expect(view.state.doc.child(0).textContent).toBe("before<b>not markup</b>");
  let marked = false;
  view.state.doc.descendants((node) => { if (node.isText && node.marks.length) marked = true; });
  expect(marked).toBe(false);
});

test("a copied table cell keeps the unknown marks in the cell", () => {
  const cell = { c: "ab", m: [[1, 'x["underline",{}]'], [1, ""]] };
  const cols = { c1: { pos: "1", name: "A" }, c2: { pos: "2", name: "B" } };
  const rows = { r1: { pos: "1", cells: { c1: cell, c2: "b1" } }, r2: { pos: "2", cells: { c1: "a2", c2: "b2" } } };
  const view = editor([], { blocks: { tbl: { t: "table", pos: "V", cols, rows } } });
  const td = (row, col) => view.dom.querySelectorAll("tbody tr")[row].querySelectorAll("td")[col];
  const mouse = (type, target) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  mouse("mousedown", td(0, 0));
  mouse("mouseover", td(1, 1));
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/html"]).toContain("data-clay-page-marks=");
  const found = gridFromClipboard(event.data["text/html"], event.data["text/plain"], document);
  expect(found.grid[0][0]).toEqual(cell);
});

// ---- commands that cannot keep unknown content ------------------------------

test("turn-into refuses an opaque block and a conversion that would erase an unknown mark", () => {
  const view = editor([["a", "paragraph", "before"], ["b", "paragraph", "after"]]);
  quoteAt(view, posOf(view, "b") - 1);
  const before = view.state.doc;
  expect(turnInto(view.state, 1, { type: "paragraph" })).toBe(REFUSED);
  expect(turnInto(view.state, 1, { type: "code_block" })).toBe(REFUSED);
  expect(view.state.doc).toBe(before);

  const marked = editor([["a", "paragraph", "before"]]);
  marked.dispatch(marked.state.tr.addMark(posOf(marked, "a"), posOf(marked, "a") + 6, opaqueMark([{ name: "underline", attrs: {} }])));
  expect(turnInto(marked.state, 0, { type: "code_block" })).toBe(REFUSED);
  expect(marked.state.doc.child(0).type.name).toBe("paragraph");
  const kept = turnInto(marked.state, 0, { type: "heading", attrs: { level: 2 } });
  expect(kept.doc.child(0).type.name).toBe("heading");
  expect(kept.doc.child(0).firstChild.marks.map((mark) => mark.type.name)).toEqual(["opaque_marks"]);
});

test("turn-into and code-block conversion change no Yjs state", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { q: runsOf(pd, "q"), a: runsOf(pd, "a"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);
  expect(turnInto(tab.view.state, 1, { type: "paragraph" })).toEqual({ status: "refused", code: "unsupported-format" });
  expect(turnInto(tab.view.state, 0, { type: "code_block" })).toEqual({ status: "refused", code: "unsupported-format" });
  expect(counter.n).toBe(0);
  expect(types(tab.view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(runsOf(pd, "a")).toEqual(before.a);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
});

test("cut over an opaque block is refused and leaves the document and Yjs untouched", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { doc: tab.view.state.doc, q: runsOf(pd, "q"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);
  selectBlocksIn(tab.view, 1);
  const event = clip();
  fire(tab.view, "cut", event);
  expect(event.data["text/plain"]).toBe("Read this too");
  expect(tab.view.state.doc.eq(before.doc)).toBe(true);
  expect(counter.n).toBe(0);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
});

// ---- the page chrome refuses where the commands do --------------------------

const CANNOT = "This block holds content from a newer version, so it can't be converted here.";
const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };
const pinned = (view) => { view.coordsAtPos = () => COORDS; return view; };
const part = (view, sel) => view.dom.parentElement.querySelector(sel);
const row = (view, label) => [...part(view, ".page-menu").querySelectorAll(".page-menu-item")]
  .find((r) => r.querySelector(".page-menu-label").textContent === label);
const notice = (view) => part(view, ".page-live").textContent;
const wholeLine = (view, id) => {
  const { node, pos } = find(view.state.doc, id);
  select(view, pos + 1, pos + 1 + node.content.size);
};

test("the block menu's Turn into refuses an opaque block and changes nothing", () => {
  const { tab } = room();
  const view = pinned(tab.view);
  const pd = tab.binding.pd;
  selectBlocksIn(view, 1);
  const before = { doc: view.state.doc, q: runsOf(pd, "q"), a: runsOf(pd, "a"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);
  part(view, ".page-tool-turn").click();
  row(view, "Heading 1").click();
  expect(view.state.doc.eq(before.doc)).toBe(true);
  expect(counter.n).toBe(0);
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(runsOf(pd, "a")).toEqual(before.a);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
  expect(notice(view)).toBe(CANNOT);
  expect(part(view, ".page-menu").hidden).toBe(true);
});

test("a list button over a selection holding an opaque block refuses and changes nothing", () => {
  const { tab } = room();
  const view = pinned(tab.view);
  const pd = tab.binding.pd;
  selectBlocksIn(view, 0, 1);
  const before = { doc: view.state.doc, q: runsOf(pd, "q"), qAttrs: attrsOf(pd, "q") };
  const counter = updates(tab);
  part(view, '.page-dock [data-cmd="bullet"]').click();
  expect(view.state.doc.eq(before.doc)).toBe(true);
  expect(counter.n).toBe(0);
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(attrsOf(pd, "q")).toEqual(before.qAttrs);
  expect(notice(view)).toBe(CANNOT);
});

test("the code button over a paragraph with an unknown mark refuses and changes nothing", () => {
  const { tab } = room();
  const view = pinned(tab.view);
  const pd = tab.binding.pd;
  wholeLine(view, "a");
  const before = { doc: view.state.doc, a: runsOf(pd, "a") };
  const counter = updates(tab);
  part(view, '.page-dock [data-cmd="code"]').click();
  expect(view.state.doc.eq(before.doc)).toBe(true);
  expect(counter.n).toBe(0);
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "paragraph"]);
  expect(runsOf(pd, "a")).toEqual(before.a);
  expect(notice(view)).toBe(CANNOT);
});

test("the same chrome actions still convert ordinary blocks, and a marked line into a list", () => {
  const { tab } = room();
  const view = pinned(tab.view);
  const pd = tab.binding.pd;
  const counter = updates(tab);

  selectBlocksIn(view, 2);
  part(view, ".page-tool-turn").click();
  row(view, "Heading 1").click();
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "heading"]);

  selectBlocksIn(view, 2);
  part(view, '.page-dock [data-cmd="bullet"]').click();
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "list_item"]);
  expect(view.state.doc.child(2).attrs.kind).toBe("bullet");

  wholeLine(view, "b");
  part(view, '.page-dock [data-cmd="code"]').click();
  expect(types(view.state.doc)).toEqual(["paragraph", "opaque_block", "code_block"]);
  expect(view.state.doc.child(2).textContent).toBe("after");
  expect(counter.n).toBeGreaterThan(0);
  expect(notice(view)).not.toBe(CANNOT);

  selectBlocksIn(view, 0);
  part(view, '.page-dock [data-cmd="bullet"]').click();
  expect(types(view.state.doc)).toEqual(["list_item", "opaque_block", "code_block"]);
  expect(runsOf(pd, "a")).toEqual([
    { text: "befo", attributes: { "underline~p1": true } },
    { text: "re", attributes: { "clay_opaque_code~p2": { tokens: ["u"] } } },
  ]);
});

// ---- known commands over unknown content ------------------------------------

test("text typed inside, before and after an unknown mark keeps the descriptor on exactly its units", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const a = find(tab.view.state.doc, "a");
  const underline = { "underline~p1": true };
  const token = { "clay_opaque_code~p2": { tokens: ["u"] } };
  select(tab.view, a.pos + 1 + 3);
  typeText(tab.view, "Z");
  expect(unknownUnits(pd, "a")).toEqual([["b", underline], ["e", underline], ["f", underline], ["Z", underline], ["o", underline], ["r", token], ["e", token]]);

  const start = find(tab.view.state.doc, "a");
  select(tab.view, start.pos + 1);
  typeText(tab.view, "Y");
  expect(unknownUnits(pd, "a")[0]).toEqual(["Y", {}]);

  const end = find(tab.view.state.doc, "a");
  select(tab.view, end.pos + 1 + end.node.content.size);
  typeText(tab.view, "W");
  expect(unknownUnits(pd, "a").at(-1)).toEqual(["W", {}]);
  expect(nodeOf(tab, "q").textContent).toBe("Read this too");
});

test("bold and italic over an unknown mark keep the unknown descriptor and touch nothing else", () => {
  const { tab } = room();
  const pd = tab.binding.pd;
  const before = { q: runsOf(pd, "q"), b: runsOf(pd, "b") };
  const a = find(tab.view.state.doc, "a");
  tab.view.dispatch(tab.view.state.tr.addMark(a.pos + 1, a.pos + 5, schema.marks.strong.create()));
  tab.view.dispatch(tab.view.state.tr.addMark(a.pos + 1, a.pos + 3, schema.marks.em.create()));
  expect(nodeOf(tab, "a").firstChild.marks.map((mark) => mark.type.name)).toEqual(["strong", "em", "opaque_marks"]);
  expect(unknownRuns(pd, "a")).toEqual([
    ["be", { "underline~p1": true }],
    ["fo", { "underline~p1": true }],
    ["re", { "clay_opaque_code~p2": { tokens: ["u"] } }],
  ]);
  expect(runsOf(pd, "q")).toEqual(before.q);
  expect(runsOf(pd, "b")).toEqual(before.b);

  // Clearing the known marks of the span leaves the descriptor alone.
  tab.view.dispatch(tab.view.state.tr.removeMark(a.pos + 1, a.pos + 5, schema.marks.strong.create()));
  tab.view.dispatch(tab.view.state.tr.removeMark(a.pos + 1, a.pos + 3, schema.marks.em.create()));
  expect(unknownUnits(pd, "a")).toEqual([
    ["b", { "underline~p1": true }],
    ["e", { "underline~p1": true }],
    ["f", { "underline~p1": true }],
    ["o", { "underline~p1": true }],
    ["r", { "clay_opaque_code~p2": { tokens: ["u"] } }],
    ["e", { "clay_opaque_code~p2": { tokens: ["u"] } }],
  ]);
});

test("undo after a peer added a descriptor keeps that descriptor", () => {
  const { tab, peer } = room();
  const pd = tab.binding.pd;
  const b = find(tab.view.state.doc, "b");
  tab.view.dispatch(tab.view.state.tr.insertText("X", b.pos + 1));
  expect(find(tab.view.state.doc, "b").node.textContent).toBe("Xafter");

  peer.ydoc.transact(() => { peer.flow.format(1, 6, { "highlight~p3": { color: "yellow" } }); }, NET);
  relay(peer, tab);
  const highlight = { color: "yellow" };
  const seen = () => unknownUnits(pd, "a");
  expect(seen()).toEqual([
    ["b", { "underline~p1": true, "highlight~p3": highlight }],
    ["e", { "underline~p1": true, "highlight~p3": highlight }],
    ["f", { "underline~p1": true, "highlight~p3": highlight }],
    ["o", { "underline~p1": true, "highlight~p3": highlight }],
    ["r", { "clay_opaque_code~p2": { tokens: ["u"] }, "highlight~p3": highlight }],
    ["e", { "clay_opaque_code~p2": { tokens: ["u"] }, "highlight~p3": highlight }],
  ]);

  expect(tab.binding.undo()).toBe(true);
  expect(find(tab.view.state.doc, "b").node.textContent).toBe("after");
  expect(seen()).toHaveLength(6);
  expect(seen()[0]).toEqual(["b", { "underline~p1": true, "highlight~p3": highlight }]);
  expect(attrsOf(pd, "q")).toEqual({ t: "quote", unknown: { keep: true } });
  expect(bareShape(docOf(pd, walk(pd)))).toBe(bareShape(tab.view.state.doc));
});

test("the saved article carries the envelopes and no runtime wrapper names", () => {
  const { tab } = room();
  const { html } = renderFromTags([JSON.stringify(yValueOf(tab.binding.ydoc))]);
  expect(html).toContain('data-clay-page-opaque="1"');
  expect(html).toContain("data-clay-page-value=");
  expect(html).toContain("data-clay-page-marks=");
  expect(html).toContain("Read this too");
  expect(html).not.toMatch(/ProseMirror|data-pm-slice|pm-/);
});
