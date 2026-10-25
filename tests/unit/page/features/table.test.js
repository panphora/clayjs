globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { state as pmState, history } from "../../../../src/vendor/prosemirror.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { blockMap } from "../../../../src/page/model.js";
import { schema } from "../../../../src/page/schema.js";
import { project, renderModel, fragmentCleaner } from "../../../../src/page/projection.js";
import { createPageEditor, installPageFeature } from "../../../../src/page/editor.js";
import { createFeatureLoader } from "../../../../src/page/feature-loader.js";
import { FEATURES } from "../../../../src/page/features/registry.js";
import { createYPageBinding, seedValue, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";

const { TextSelection } = pmState;

const TABLE = {
  t: "table", pos: "W",
  cols: { c1: { pos: "1", name: "Name", kind: "text" }, c2: { pos: "2", name: "Amount", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "A", c2: "10" } }, r2: { pos: "2", cells: { c1: "B", c2: "2" } } },
};
const PARAGRAPH = { t: "paragraph", pos: "V", c: "Hi " };

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
const track = (view, mount, binding = null) => {
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
    binding?.binding?.dispose();
    binding?.binding?.ydoc?.destroy();
  });
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};
const realLoad = (id) => FEATURES[id].load();
const recordingLoader = (holder, calls, load = realLoad) => createFeatureLoader({
  load: (id) => { calls.push(id); return load(id); },
  install: (id, mod) => installPageFeature({ view: holder.view }, id, mod),
  reportError: () => {},
});

const open = (blocks, { load = realLoad } = {}) => {
  const calls = [];
  const holder = { view: null };
  const features = recordingLoader(holder, calls, load);
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks, features });
  holder.view = view;
  track(view, mount);
  return { view, calls, features };
};

const openTab = (initial, { load = realLoad } = {}) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const calls = [];
  const holder = { view: null };
  const features = recordingLoader(holder, calls, load);
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, features });
  holder.view = view;
  binding.attach(view);
  track(view, mount, { binding });
  return { store, binding, view, calls };
};

const tables = (view) => {
  const found = [];
  view.state.doc.forEach((node) => { if (node.type.name === "table") found.push(node); });
  return found;
};
const historyOf = (state) => state.plugins.find((plugin) => String(plugin.key).startsWith("history$"))?.getState(state);
const savedHtml = (view) => renderModel(project(blockMap(view.state.doc)), { fallbackOf: () => "", clean: fragmentCleaner(document) });
const typeIn = (view, pos, text) => view.dispatch(view.state.tr.insertText(text, pos));
const coords = { left: 40, right: 48, top: 100, bottom: 120 };
const slash = (view) => {
  view.coordsAtPos = () => coords;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 1)));
  const { from, to } = view.state.selection;
  view.someProp("handleTextInput", (handler) => handler(view, from, to, "/", () => view.state.tr.insertText("/", from, to)));
  return view.dom.parentElement.querySelector(".page-menu");
};
const pick = (menu, label) => [...menu.querySelectorAll(".page-menu-item")].find((row) => row.querySelector(".page-menu-label")?.textContent === label);

test("a text-only document's editor boots without loading the table view part", async () => {
  const { view, calls } = open({ p: PARAGRAPH });
  expect(calls).toEqual([]);
  await flush();
  expect(calls).toEqual([]);
  expect(view.dom.querySelector(".page-table")).toBe(null);
});

test("opening the slash menu loads nothing", async () => {
  const { view, calls } = open({ p: PARAGRAPH });
  const menu = slash(view);
  expect(menu.hidden).toBe(false);
  await flush();
  expect(calls).toEqual([]);
});

test("a document with a table boots with the table view part loaded", async () => {
  const { view, calls } = open({ tbl: TABLE });
  expect(calls).toEqual(["table"]);
  expect(view.dom.querySelector(".page-table")).toBe(null);
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);
  expect(view.dom.querySelectorAll("thead th").length).toBe(2);
});

test("inserting a table into a text-only document inserts one table and loads the view part once", async () => {
  const { view, calls } = open({ p: PARAGRAPH });
  const menu = slash(view);
  pick(menu, "Table").click();
  expect(tables(view)).toHaveLength(1);
  expect(calls).toEqual(["table"]);
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);
  expect(calls).toEqual(["table"]);
  expect(tables(view)).toHaveLength(1);
});

test("a table that arrives from a peer loads the view part", async () => {
  const initial = seedValue([{ id: "p", text: "Hi " }]);
  const a = openTab(JSON.parse(JSON.stringify(initial)));
  const b = openTab(JSON.parse(JSON.stringify(initial)));
  expect(b.calls).toEqual([]);
  const menu = slash(a.view);
  pick(menu, "Table").click();
  expect(tables(a.view)).toHaveLength(1);
  const value = enc(Y.encodeStateAsUpdateV2(a.binding.ydoc, Y.encodeStateVector(b.binding.ydoc)));
  const base = b.store.authoritative;
  b.store.rebase({ ...base, y: { ...base.y, "peer-1": value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", "peer-1"], value }] } });
  expect(b.calls).toEqual(["table"]);
  expect(await waitFor(() => b.view.dom.querySelector(".page-table"))).toBe(true);
  expect(tables(b.view)).toHaveLength(1);
});

test("a failing load leaves the text editable and the table's cell text intact", async () => {
  const { view } = open({ p: PARAGRAPH, tbl: TABLE }, { load: () => Promise.reject(new Error("no network")) });
  await flush();
  await flush();
  expect(view.dom.querySelector(".page-table")).toBe(null);
  expect(view.editable).toBe(true);
  expect(tables(view)).toHaveLength(1);
  expect(tables(view)[0].textContent).toBe("A10B2");
  typeIn(view, 1, "Hello ");
  expect(view.state.doc.child(0).textContent).toBe("Hello Hi ");
});

test("an install while composing waits for compositionend", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view } = open({ tbl: TABLE }, { load: () => gate.then(() => realLoad("table")) });
  view.input.composing = true;
  expect(view.composing).toBe(true);
  release();
  await flush();
  await flush();
  expect(view.dom.querySelector(".page-table")).toBe(null);
  view.dom.dispatchEvent(new CompositionEvent("compositionend"));
  await flush();
  expect(view.dom.querySelector(".page-table")).toBeTruthy();
});

test("selection, the undo stack and the save output are the same before and after the view part installs", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view } = open({ p: PARAGRAPH, tbl: TABLE }, { load: () => gate.then(() => realLoad("table")) });
  typeIn(view, 4, "!");
  const cellAt = view.state.doc.child(0).nodeSize + 3;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellAt)));
  const snap = () => ({
    selection: { from: view.state.selection.from, to: view.state.selection.to },
    history: { done: historyOf(view.state).done.length, undone: historyOf(view.state).undone.length },
    saved: savedHtml(view),
  });
  const before = snap();
  release();
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);
  expect(snap()).toEqual(before);
  expect(history.undo(view.state)).toBe(true);
});

test("after relaying both ways, two peers have the same projection", async () => {
  const initial = seedValue([{ id: "p", text: "Hi " }]);
  const a = openTab(JSON.parse(JSON.stringify(initial)));
  const b = openTab(JSON.parse(JSON.stringify(initial)));
  const send = (from, to, key) => {
    const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
    const base = to.store.authoritative;
    to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
  };
  pick(slash(a.view), "Table").click();
  send(a, b, "peer-1");
  await waitFor(() => b.view.dom.querySelector(".page-table"));
  b.view.dispatch(b.view.state.tr.insertText("!", 2));
  send(b, a, "peer-2");
  await flush();
  expect(blocksFromYValue(a.store.value)).toEqual(blocksFromYValue(b.store.value));
  expect(renderModel(project(blocksFromYValue(a.store.value)))).toBe(renderModel(project(blocksFromYValue(b.store.value))));
  expect(schema.nodes.table).toBeTruthy();
});
