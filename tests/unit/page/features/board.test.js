globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { blockMap } from "../../../../src/page/model.js";
import { schema } from "../../../../src/page/schema.js";
import { project, renderModel, fragmentCleaner } from "../../../../src/page/projection.js";
import { createPageEditor, installPageFeature } from "../../../../src/page/editor.js";
import { createFeatureLoader } from "../../../../src/page/feature-loader.js";
import { FEATURES } from "../../../../src/page/features/registry.js";
import { createYPageBinding, seedValue, blocksFromYValue, enc } from "../../../../src/page/ybind/index.js";

const { TextSelection } = pmState;

const COLUMNS = { todo: { pos: "1", name: "To do" }, done: { pos: "3", name: "Done" } };
const CARDS = { a: { pos: "1", col: "todo", title: "Sample inbox" }, b: { pos: "2", col: "done", title: "Pricing page" } };
const PARAGRAPH = { id: "p", text: "Hi " };
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
  install: (id, mod) => installPageFeature({ view: holder.view, board: holder.board, undo: holder.undo, redo: holder.redo }, id, mod),
  reportError: () => {},
});

const openTab = (initial, { load = realLoad } = {}) => {
  const store = createStore({ name: "page", value: initial });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const calls = [];
  const holder = { view: null, board: binding.board, undo: binding.undo, redo: binding.redo };
  const features = recordingLoader(holder, calls, load);
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, board: binding.board, features });
  holder.view = view;
  binding.attach(view);
  track(view, mount, { binding });
  return { store, binding, view, calls };
};

const boards = (view) => {
  const found = [];
  view.state.doc.forEach((node) => { if (node.type.name === "board") found.push(node); });
  return found;
};
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
const send = (from, to, key) => {
  const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};

test("a text-only document's editor boots without loading the board view part", async () => {
  const { view, calls } = openTab(seedValue([PARAGRAPH]));
  expect(calls).toEqual([]);
  await flush();
  expect(calls).toEqual([]);
  expect(view.dom.querySelector(".page-board")).toBe(null);
});

test("opening the slash menu loads nothing", async () => {
  const { view, calls } = openTab(seedValue([PARAGRAPH]));
  const menu = slash(view);
  expect(menu.hidden).toBe(false);
  await flush();
  expect(calls).toEqual([]);
});

test("a document with a board boots with the board view part loaded", async () => {
  const { view, calls } = openTab(seedValue([PARAGRAPH, { id: "bd", t: "board", attrs: { columns: COLUMNS, cards: CARDS } }]));
  expect(calls).toEqual(["board"]);
  expect(view.dom.querySelector(".page-board")).toBe(null);
  expect(await waitFor(() => view.dom.querySelector(".page-board"))).toBe(true);
  expect(view.dom.querySelectorAll(".page-board-lane[data-col]")).toHaveLength(2);
});

test("inserting a board into a text-only document inserts one board and loads the view part once", async () => {
  const { view, calls } = openTab(seedValue([PARAGRAPH]));
  const menu = slash(view);
  pick(menu, "Board").click();
  expect(boards(view)).toHaveLength(1);
  expect(calls).toEqual(["board"]);
  expect(await waitFor(() => view.dom.querySelector(".page-board"))).toBe(true);
  expect(calls).toEqual(["board"]);
  expect(boards(view)).toHaveLength(1);
});

test("a board that arrives from a peer loads the view part", async () => {
  const initial = seedValue([PARAGRAPH]);
  const a = openTab(JSON.parse(JSON.stringify(initial)));
  const b = openTab(JSON.parse(JSON.stringify(initial)));
  expect(b.calls).toEqual([]);
  pick(slash(a.view), "Board").click();
  expect(boards(a.view)).toHaveLength(1);
  send(a, b, "peer-1");
  expect(b.calls).toEqual(["board"]);
  expect(await waitFor(() => b.view.dom.querySelector(".page-board"))).toBe(true);
  expect(boards(b.view)).toHaveLength(1);
});

test("a failing load leaves the text editable and the board's cards intact", async () => {
  const { view } = openTab(seedValue([PARAGRAPH, { id: "bd", t: "board", attrs: { columns: COLUMNS, cards: CARDS } }]), { load: () => Promise.reject(new Error("no network")) });
  await flush();
  await flush();
  expect(view.dom.querySelector(".page-board")).toBe(null);
  expect(view.dom.querySelector('section[data-type="board"]')).not.toBe(null);
  expect(view.editable).toBe(true);
  expect(boards(view)).toHaveLength(1);
  expect(boards(view)[0].attrs.cards).toEqual(CARDS);
  typeIn(view, 1, "Hello ");
  expect(view.state.doc.child(0).textContent).toBe("Hello Hi ");
});

test("an install while composing waits for compositionend", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view } = openTab(seedValue([PARAGRAPH, { id: "bd", t: "board", attrs: { columns: COLUMNS, cards: CARDS } }]), { load: () => gate.then(() => realLoad("board")) });
  view.input.composing = true;
  expect(view.composing).toBe(true);
  release();
  await flush();
  await flush();
  expect(view.dom.querySelector(".page-board")).toBe(null);
  view.dom.dispatchEvent(new CompositionEvent("compositionend"));
  expect(await waitFor(() => view.dom.querySelector(".page-board"))).toBe(true);
});

test("selection, the undo stack and the save output are the same before and after the view part installs", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view, binding } = openTab(seedValue([PARAGRAPH, { id: "bd", t: "board", attrs: { columns: COLUMNS, cards: CARDS } }]), { load: () => gate.then(() => realLoad("board")) });
  typeIn(view, 4, "!");
  const snap = () => ({
    selection: { from: view.state.selection.from, to: view.state.selection.to },
    saved: savedHtml(view),
  });
  const before = snap();
  release();
  expect(await waitFor(() => view.dom.querySelector(".page-board"))).toBe(true);
  expect(snap()).toEqual(before);
  expect(binding.undo()).toBe(true);
  await flush();
  expect(view.state.doc.child(0).textContent).toBe("Hi ");
});

test("after relaying both ways, two peers have the same projection", async () => {
  const initial = seedValue([PARAGRAPH]);
  const a = openTab(JSON.parse(JSON.stringify(initial)));
  const b = openTab(JSON.parse(JSON.stringify(initial)));
  pick(slash(a.view), "Board").click();
  send(a, b, "peer-1");
  await waitFor(() => b.view.dom.querySelector(".page-board"));
  b.view.dispatch(b.view.state.tr.insertText("!", 2));
  send(b, a, "peer-2");
  await flush();
  expect(blocksFromYValue(a.store.value)).toEqual(blocksFromYValue(b.store.value));
  expect(renderModel(project(blocksFromYValue(a.store.value)))).toBe(renderModel(project(blocksFromYValue(b.store.value))));
  expect(schema.nodes.board).toBeTruthy();
});
