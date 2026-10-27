/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { history, state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createPageEditor, runPageCommand, setEditorActive } from "../../../src/page/editor.js";
import { schema } from "../../../src/page/schema.js";
import { runsOf } from "../../../src/page/inline.js";
import { blockMap } from "../../../src/page/model.js";
import { canon, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { createStore } from "../../../src/live/store.js";
import { createYPageBinding } from "../../../src/page/ybind/index.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";
import { yValueOf } from "../../../src/page/ybind/provider.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { caseOf, NEIGHBOUR } from "../../fixtures/page/formats/m13-cases.mjs";

/**
 * Person mentions: @ opens the people picker and choosing one writes that person's name as
 * ordinary text under the mention mark, whose only attribute is the people id. The command
 * is opt-in code — it arrives on the first @ and never on a plain document — and nothing it
 * does reaches the network, notifies anybody or invents a profile.
 */

const ADA = { id: "ada-lovelace", name: "Ada Lovelace" };
const GRACE = { id: "grace-hopper", name: "Grace Hopper" };
const ADA_KEY = 'x["mention",{"id":"ada-lovelace"}]';

const BLOCKS = () => ({
  a: { t: "paragraph", pos: "00000001", c: "Hello " },
  z: { t: "paragraph", pos: "00000002", c: "Neighbour line" },
});
const TABLE = { t: "table", pos: "00000001", cols: { c1: { pos: "00000001", name: "Name" } }, rows: { r1: { pos: "00000001", cells: { c1: "Ada Lovelace" } } } };

const cleanups = [];
const originals = {};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
    delete originals[name];
  }
});

// clay.people, as a page finds it: the names the document saved and the host's own list.
function people({ saved = [ADA, GRACE], allowed = [ADA, GRACE], fail = false } = {}) {
  globalThis.clay = { people: {
    list: () => saved,
    available: async () => { if (fail) throw new Error("no host"); return allowed; },
    add: () => { throw new Error("a mention never records a person"); },
  } };
}

function open(blocks = BLOCKS()) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks });
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); });
  return view;
}

const waitFor = async (check) => {
  for (let i = 0; i < 200; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};
const pickerEl = () => document.querySelector(".page-mention-picker");
const options = () => [...document.querySelectorAll(".page-mention-picker .page-menu-item")];
const record = (view, id) => blockMap(view.state.doc)[id];
const blockPos = (view, id) => {
  let found = null;
  view.state.doc.forEach((node, pos) => { if (found === null && node.attrs.id === id) found = pos; });
  return found;
};
const endOf = (view, id) => blockPos(view, id) + 1 + view.state.doc.nodeAt(blockPos(view, id)).textContent.length;
const caret = (view, pos) => view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, pos)));
// Typing @ asks the editor's plugin props the way ProseMirror asks them, with the
// transaction it would insert the character in as the default answer.
const type = (view, pos, text = "@") => {
  caret(view, pos);
  return view.someProp("handleTextInput", (fn) => fn(view, pos, pos, text, () => view.state.tr.insertText(text, pos, pos)));
};
const typeQuery = (view, letters) => {
  view.dispatch(view.state.tr.insertText(letters));
  view.dom.dispatchEvent(new Event("input"));
};
// An editor over a live binding, so the same records travel through Yjs as in a real page.
function bindingView(binding) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = new pmView.EditorView(mount, {
    state: pmState.EditorState.create({ doc: binding.doc(), plugins: [] }),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); });
  binding.attach(view);
  return view;
}
const keys = (view, key) => view.dom.dispatchEvent(Object.assign(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }), {}));
const markOf = (view, id, index) => view.state.doc.nodeAt(blockPos(view, id)).child(index).marks.map((mark) => [mark.type.name, mark.attrs.id ?? null]);

test("@ offers the roster and choosing one writes the name, then an unmarked space", async () => {
  people();
  const view = open();
  expect(type(view, endOf(view, "a"))).toBe(true);
  expect(await waitFor(() => options().length === 2)).toBe(true);
  expect(pickerEl().getAttribute("role")).toBe("listbox");
  expect(options().map((row) => row.textContent)).toEqual(["Ada Lovelace", "Grace Hopper"]);
  expect(record(view, "a").c).toBe("Hello @");
  expect(pickerEl().hidden).toBe(false);

  options()[0].click();
  expect(record(view, "a").c).toBe("Hello Ada Lovelace ");
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [12, ADA_KEY], [1, ""]]);
  expect(markOf(view, "a", 1)).toEqual([["mention", "ada-lovelace"]]);
  expect(markOf(view, "a", 2)).toEqual([]);
  expect(pickerEl()).toBeNull();
  expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
});

test("typing filters the roster, and Enter picks the highlighted person", async () => {
  people();
  const view = open();
  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  typeQuery(view, "gra");
  await waitFor(() => options().length === 1);
  expect(options()[0].textContent).toBe("Grace Hopper");
  expect(record(view, "a").c).toBe("Hello @gra");
  expect(record(view, "z").c).toBe("Neighbour line");
  keys(view, "Enter");
  expect(record(view, "a").c).toBe("Hello Grace Hopper ");
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [12, 'x["mention",{"id":"grace-hopper"}]'], [1, ""]]);
});

const values = (view) => Object.values(blockMap(view.state.doc)).map((block) => block.c).join("|");
const seed = (blocks) => {
  const model = project(blocks);
  return JSON.parse(JSON.stringify(seedPageFromArticle(articleOf(renderModel(model), revOf(model)))));
};

test("a query that no longer matches what was shown refuses, and so does a deleted block", async () => {
  people();
  const view = open();
  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  typeQuery(view, "ad");
  await waitFor(() => options().length === 1);
  // A peer (or a programmatic edit) changed the query range after the list was drawn.
  view.dispatch(view.state.tr.insertText("x"));
  expect(record(view, "a").c).toBe("Hello @adx");
  options()[0].click();
  expect(record(view, "a").c).toBe("Hello @adx");
  expect(record(view, "a").m).toBeUndefined();
  expect(pickerEl()).toBeNull();

  type(view, blockPos(view, "a") + 1);
  await waitFor(() => options().length === 2);
  const pos = blockPos(view, "a");
  view.dispatch(view.state.tr.delete(pos, pos + view.state.doc.nodeAt(pos).nodeSize));
  expect(options()[0]).toBeTruthy();
  expect(() => options()[0].click()).not.toThrow();
  expect(Object.keys(blockMap(view.state.doc))).toEqual(["z"]);
});

test("a host with no roster keeps the typed query and offers nobody", async () => {
  people({ saved: [], allowed: null });
  const view = open();
  type(view, endOf(view, "a"));
  expect(await waitFor(() => pickerEl() !== null)).toBe(true);
  await waitFor(() => pickerEl().textContent.length > 0);
  expect(options()).toEqual([]);
  expect(pickerEl().textContent).toBe("No people to mention");
  typeQuery(view, "ad");
  expect(record(view, "a").c).toBe("Hello @ad");
  expect(options()).toEqual([]);
  keys(view, "Enter");
  expect(record(view, "a").c).toBe("Hello @ad");
  expect(record(view, "a").m).toBeUndefined();
});

test("a host that fails still offers the people the document saved", async () => {
  people({ saved: [GRACE], allowed: null, fail: true });
  const view = open();
  type(view, endOf(view, "a"));
  expect(await waitFor(() => options().length === 1)).toBe(true);
  expect(options()[0].textContent).toBe("Grace Hopper");
});

test("nothing about a mention writes to the network", async () => {
  const calls = [];
  originals.fetch = globalThis.fetch;
  originals.XMLHttpRequest = globalThis.XMLHttpRequest;
  globalThis.fetch = (...args) => { calls.push(args[0]); return Promise.reject(new Error("no network in this test")); };
  globalThis.XMLHttpRequest = class { open(method, url) { calls.push(url); } send() { calls.push("send"); } };
  people();
  const view = open();
  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  typeQuery(view, "ada");
  await waitFor(() => options().length === 1);
  options()[0].click();
  expect(record(view, "a").c).toBe("Hello Ada Lovelace ");
  expect(calls).toEqual([]);
});

test("a composition never opens or replaces anything", async () => {
  people();
  const view = open();
  // An IME's own candidate window is what "@" belongs to while it composes: the key is
  // typed and nothing else happens.
  view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
  expect(view.composing).toBe(true);
  type(view, blockPos(view, "a") + 1);
  expect(record(view, "a").c).toBe("@Hello ");
  expect(pickerEl()).toBeNull();
  view.dom.dispatchEvent(new CompositionEvent("compositionend"));

  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
  keys(view, "Enter");
  expect(record(view, "a").c).toBe("@Hello @");
  expect(pickerEl()).not.toBeNull();
  view.dom.dispatchEvent(new CompositionEvent("compositionend"));
  expect(pickerEl()).not.toBeNull();
});

test("typing at the mark's edge stays unmarked, and an unknown person stays readable", async () => {
  people();
  const view = open();
  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  options()[0].click();
  view.dispatch(view.state.tr.insertText("Wrote this"));
  expect(record(view, "a").c).toBe("Hello Ada Lovelace Wrote this");
  expect(record(view, "a").m.slice(-1)).toEqual([""]);

  // The document keeps the label it was written with; the saved article shows the name and
  // the id, whether or not any roster still knows that person.
  people({ saved: [], allowed: [] });
  const records = { a: record(view, "a") };
  const model = project(records);
  const html = renderModel(model);
  expect(html).toContain('data-page-mention="ada-lovelace"');
  expect(html).toContain("Ada Lovelace");
  expect(html).not.toContain("href");
  const reopened = parseModel(articleOf(html, revOf(model)));
  expect(reopened.find((item) => item.id === "a").m).toEqual(runsOf(records.a.m));
});

test("part of a label can be deleted and other marks overlap it without losing the id", async () => {
  people();
  const view = open();
  const mark = schema.marks.mention.create({ id: ADA.id });
  const pos = blockPos(view, "a") + 1 + 6;
  view.dispatch(view.state.tr.insertText("Ada Lovelace", pos));
  view.dispatch(view.state.tr.addMark(pos, pos + 12, mark));
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [12, ADA_KEY]]);

  view.dispatch(view.state.tr.delete(pos + 8, pos + 12));
  expect(record(view, "a").c).toBe("Hello Ada Love");
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [8, ADA_KEY]]);

  view.dispatch(view.state.tr.addMark(pos, pos + 3, schema.marks.strong.create()));
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [3, `b${ADA_KEY}`], [5, ADA_KEY]]);
  const node = view.state.doc.nodeAt(blockPos(view, "a"));
  expect(node.child(1).text).toBe("Ada");
  expect(node.child(1).marks.map((m) => m.type.name).sort()).toEqual(["mention", "strong"]);
});

test("a mention in a table cell round-trips through the record and the binding", () => {
  people();
  const cell = { c: "Ada Lovelace", m: [[12, ADA_KEY]] };
  const blocks = { tbl: { ...TABLE, rows: { r1: { pos: "00000001", cells: { c1: cell } } } }, z: { t: "paragraph", pos: "00000002", c: NEIGHBOUR.c } };
  const view = open(blocks);
  expect(record(view, "tbl").rows.r1.cells.c1).toEqual(cell);

  const store = createStore({ name: "page", value: seed(blocks) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  cleanups.push(() => { binding.dispose(); binding.ydoc.destroy(); });
  const synced = blocksFromYValue(yValueOf(binding.ydoc));
  expect(synced.tbl.rows.r1.cells.c1).toEqual(cell);

  const model = project(blocks);
  const reopened = parseModel(articleOf(renderModel(model), revOf(model)));
  const row = reopened.find((item) => item.id === "tbl").rows[0];
  expect(row.cells.c1).toEqual(cell);
});

test("undo takes the mention back out and redo puts it back", async () => {
  people();
  const view = open();
  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  options()[0].click();
  expect(record(view, "a").c).toBe("Hello Ada Lovelace ");
  // The pick is one undo step of its own: the @ typed before it is a separate one.
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello @");
  expect(record(view, "a").m).toBeUndefined();
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello ");
  history.redoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello @");
  history.redoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello Ada Lovelace ");
  expect(runsOf(record(view, "a").m)).toEqual([[6, ""], [12, ADA_KEY], [1, ""]]);
});

test("a second peer opens the mention by its id and label", () => {
  people();
  const blocks = { a: { t: "paragraph", pos: "00000001", c: "Hello " }, z: { t: "paragraph", pos: "00000002", c: NEIGHBOUR.c } };
  const mineBinding = createYPageBinding({ store: createStore({ name: "page", value: seed(blocks) }), captureTimeout: 0 });
  const theirs = new Y.Doc();
  cleanups.push(() => { mineBinding.dispose(); mineBinding.ydoc.destroy(); theirs.destroy(); });

  const view = bindingView(mineBinding);
  const pos = 1 + 6;
  view.dispatch(view.state.tr.insertText("Ada Lovelace", pos));
  view.dispatch(view.state.tr.addMark(pos, pos + 12, schema.marks.mention.create({ id: ADA.id })));

  Y.applyUpdate(theirs, Y.encodeStateAsUpdate(mineBinding.ydoc));
  const seen = blocksFromYValue(yValueOf(theirs));
  expect(seen.a.c).toBe("Hello Ada Lovelace");
  expect(seen.a.m).toEqual([[6, ""], [12, ADA_KEY]]);
});

test("a saved article reopens with the same label and id", async () => {
  people();
  const view = open();
  type(view, endOf(view, "a"));
  await waitFor(() => options().length === 2);
  options()[0].click();
  const saved = blockMap(view.state.doc);
  const model = project(saved);
  const article = articleOf(renderModel(model), revOf(model));
  const reopened = parseModel(article);
  const mention = reopened.find((item) => item.id === "a");
  expect(mention.c).toBe("Hello Ada Lovelace ");
  expect(mention.m).toEqual(runsOf(saved.a.m));
  // The article states the mention on an inert span: a name, an id, no link.
  expect(article.innerHTML).toContain('data-page-mention="ada-lovelace">Ada Lovelace</span>');
});

test("an older writer's neighbour edit keeps the id and the label", () => {
  const formatCase = caseOf("a person mention");
  const blocks = JSON.parse(JSON.stringify(formatCase.blocks));
  const store = createStore({ name: "page", value: seed(blocks) });
  const binding = createYPageBinding({ store, captureTimeout: 0 });
  cleanups.push(() => { binding.dispose(); binding.ydoc.destroy(); });
  const view = bindingView(binding);
  let neighbour = null;
  view.state.doc.forEach((node, pos) => { if (node.attrs.id === NEIGHBOUR.id) neighbour = { node, pos }; });
  view.dispatch(view.state.tr.insertText(NEIGHBOUR.add, neighbour.pos + 1 + neighbour.node.textContent.length));
  const after = blocksFromYValue(yValueOf(binding.ydoc));
  expect(after.a.m).toEqual([[12, 'x["mention",{"id":"p-ada"}]'], [11, ""]]);
  expect(after.a.c).toBe("Ada Lovelace wrote this");
  expect(after.z.c).toBe(NEIGHBOUR.c + NEIGHBOUR.add);
});

test("view, edit, view leaves no picker and no listener behind", async () => {
  people();
  const view = open();
  type(view, blockPos(view, "a") + 1);
  await waitFor(() => options().length === 2);
  expect(pickerEl()).not.toBeNull();
  setEditorActive(view, false);
  expect(pickerEl()).toBeNull();
  expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
  // The disposed session hears nothing: a stale Enter changes no text.
  keys(view, "Enter");
  expect(record(view, "a").c).toBe("@Hello ");

  setEditorActive(view, true);
  type(view, endOf(view, "a"));
  expect(await waitFor(() => options().length === 2)).toBe(true);
  expect(document.querySelectorAll(".page-mention-picker")).toHaveLength(1);
  keys(view, "Escape");
  expect(pickerEl()).toBeNull();
  expect(document.querySelectorAll(".page-mention-picker")).toHaveLength(0);
  expect(record(view, "a").c).toBe("@Hello @");
});

test("@ opens only at the start of a word, and never inside a code block", async () => {
  people();
  const view = open({
    a: { t: "paragraph", pos: "00000001", c: "Hello " },
    code: { t: "code_block", pos: "00000002", c: "let x" },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  caret(view, blockPos(view, "a") + 3);
  expect(type(view, blockPos(view, "a") + 3)).toBe(true);
  await settle();
  expect(record(view, "a").c).toBe("He@llo ");
  expect(pickerEl()).toBeNull();

  const code = blockPos(view, "code") + 1;
  caret(view, code);
  expect(type(view, code)).toBe(true);
  await settle();
  expect(record(view, "code").c).toBe("@let x");
  expect(pickerEl()).toBeNull();
});

test("the Mention action types the @ it needs and opens the same picker", async () => {
  people();
  const view = open();
  caret(view, endOf(view, "a"));
  const answer = await runPageCommand(view, "mentions", {});
  expect(answer).toEqual({ ok: true, picker: true });
  expect(record(view, "a").c).toBe("Hello @");
  expect(await waitFor(() => options().length === 2)).toBe(true);
  options()[1].click();
  expect(record(view, "a").c).toBe("Hello Grace Hopper ");
  expect(await runPageCommand(view, "mentions", {})).toEqual({ ok: true, picker: true });
  expect(record(view, "a").c).toBe("Hello Grace Hopper @");
});

// The article a page saves, from the projection's own bytes.
function articleOf(html, rev) {
  const parsed = new DOMParser().parseFromString(`<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${html}\n</article></body></html>`, "text/html");
  return parsed.querySelector("article");
}
