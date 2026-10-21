import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../src/live/store.js";
import { createPageEditor } from "../../../src/page/editor.js";
import { createYPageBinding, seedValue, blocksFromYValue, enc } from "../../../src/page/ybind/index.js";
import { NET } from "../../../src/page/ybind/layout.js";
import { ORIGINS_ORIGIN } from "../../../src/page/ybind/origins.js";

export const COLUMNS = { todo: { pos: "1", name: "To do" }, doing: { pos: "2", name: "In progress" }, done: { pos: "3", name: "Done" } };
export const CARDS = { a: { pos: "1", col: "todo", title: "Sample inbox", owner: "Maya", due: "2020-01-02" }, b: { pos: "2", col: "todo", title: "Invite flow" }, c: { pos: "1", col: "done", title: "Pricing page", due: "2999-03-04" } };
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const initial = seedValue([{ id: "p", text: "Before" }, { id: "bd", t: "board", attrs: { columns: clone(COLUMNS), cards: clone(CARDS) } }, { id: "q", text: "After" }]);
export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const tabs = [];
let frame = 0;
afterEach(() => {
  for (const tab of tabs.splice(0)) { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); }
  document.body.innerHTML = "";
});

export const open = (value = initial) => {
  const store = createStore({ name: "page", value: clone(value) });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = createPageEditor(document.body.appendChild(document.createElement("div")), { doc: binding.doc(), dispatch: binding.dispatch, history: false, undo: binding.undo, redo: binding.redo, board: binding.board });
  binding.attach(view);
  const updates = [];
  binding.ydoc.on("updateV2", (update, origin) => { if (origin !== NET && origin !== ORIGINS_ORIGIN) updates.push(update); });
  const tab = { store, binding, view, updates, root: () => view.dom.querySelector(".page-board") };
  tabs.push(tab);
  return tab;
};
export const nodeBoard = (tab) => {
  let found = null;
  tab.view.state.doc.forEach((node) => { if (node.attrs.id === "bd") found = { columns: node.attrs.columns, cards: node.attrs.cards }; });
  return found;
};
export const stored = (tab) => {
  const decoded = blocksFromYValue(tab.store.value).bd;
  return { columns: decoded.columns, cards: decoded.cards };
};
export const lanes = (tab) => [...tab.root().querySelectorAll(".page-board-lane[data-col]")].map((lane) => `${lane.querySelector(".page-board-name").textContent}: ${[...lane.querySelectorAll(".page-board-card .page-board-title")].map((title) => title.textContent).join(", ")}`);
export const control = (scope, key) => [...scope.querySelectorAll("[data-focus]")].find((node) => node.dataset.focus === key);
export const keyOn = (target, key, options = {}) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
export const deliver = (from, to) => {
  const key = `peer-${++frame}`;
  const value = enc(Y.encodeStateAsUpdateV2(from.binding.ydoc, Y.encodeStateVector(to.binding.ydoc)));
  const base = to.store.authoritative;
  to.store.rebase({ ...base, y: { ...base.y, [key]: value } }, { source: "remote", frame: { ops: [{ op: "set", path: ["y", key], value }] } });
};
export const settled = (tab) => {
  expect(stored(tab)).toEqual(nodeBoard(tab));
  expect(tab.binding.stats.mismatch).toBe(0);
};
