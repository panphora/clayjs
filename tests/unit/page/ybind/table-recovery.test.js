globalThis.ClipboardEvent ??= class ClipboardEvent extends Event { constructor(t, i = {}) { super(t, i); this.clipboardData = i.clipboardData ?? null; } };
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { identityPlugin, blockJson } from "../../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../../src/vendor/prosemirror.vendor.js";
import { createYPageBinding, seedValue, removeKey, attrKey, reduceRecovery, blocksFromYValue } from "../../../../src/page/ybind/index.js";
import { tableKey } from "../../../../src/page/ybind/table.js";

const COLS = { c1: { pos: "1", name: "Week" }, c2: { pos: "2", name: "Signups", kind: "number" } };
const ROWS = { r1: { pos: "1", cells: { c1: "Sep 21", c2: "58" } }, r2: { pos: "2", cells: { c1: "Sep 28", c2: "41" } } };
const blocks = () => [{ id: "p", text: "Before" }, { id: "tbl", t: "table", attrs: { cols: COLS, rows: ROWS } }, { id: "q", text: "After" }];

let tabs;
beforeEach(() => { tabs = []; });
afterEach(() => { for (const tab of tabs) { tab.view.destroy(); tab.binding.dispose(); tab.binding.ydoc.destroy(); } });

const open = (value = seedValue(blocks())) => {
  const store = createStore({ name: "page", value });
  const binding = createYPageBinding({ store, setTimer: () => 1, clearTimer: () => {} });
  const view = new pmView.EditorView(document.body.appendChild(document.createElement("div")), { state: pmState.EditorState.create({ doc: binding.doc(), plugins: [identityPlugin()] }), dispatchTransaction: (tr) => binding.dispatch(tr) });
  binding.attach(view);
  const tab = { store, binding, view, pd: binding.pd };
  tabs.push(tab);
  return tab;
};
const keyOf = (pd, id) => {
  for (let it = pd.flow._start; it; it = it.right) if (!it.deleted && it.content instanceof Y.ContentEmbed && it.content.embed?.b === id) return `${it.id.client}.${it.id.clock}`;
  throw new Error(`Missing marker ${id}`);
};
const tableIn = (view, id) => {
  let found = null;
  view.state.doc.forEach((node) => { if (node.attrs.id === id) found = node; });
  return found;
};
const cellIn = (view, id, row, col) => {
  let found = null;
  view.state.doc.forEach((table, at) => {
    if (table.attrs.id !== id) return;
    table.forEach((item, rowAt) => {
      if (item.attrs.id !== row) return;
      item.forEach((cell, cellAt) => { if (cell.attrs.col === col) found = at + 2 + rowAt + cellAt + 1; });
    });
  });
  return found;
};
const type = (tab, pos, text) => {
  tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, pos)));
  tab.view.dispatch(tab.view.state.tr.insertText(text));
};
const peer = (pd, write) => pd.ydoc.transact(() => write(pd.tableFields), "peer-test");
const EFFECTIVE = { r1: { pos: "1", cells: { c1: "Sep 20", c2: "58" } }, r3: { pos: "3", cells: { c1: "Oct 5", c2: "63" } } };

test("a removed table with peer overlay edits comes back with those edits on Restore", () => {
  const a = open();
  peer(a.pd, (fields) => {
    fields.set(tableKey("tbl", "cell", "r1", "c1"), "Sep 20");
    fields.set(tableKey("tbl", "row", "r2", "alive"), false);
    fields.set(tableKey("tbl", "row", "r3", "alive"), true);
    fields.set(tableKey("tbl", "row", "r3", "pos"), "3");
    fields.set(tableKey("tbl", "cell", "r3", "c1"), "Oct 5");
    fields.set(tableKey("tbl", "cell", "r3", "c2"), "63");
  });
  expect(blockJson(tableIn(a.view, "tbl")).rows).toEqual(EFFECTIVE);
  const source = keyOf(a.pd, "tbl");
  a.pd.ydoc.transact(() => a.pd.gone.set(removeKey(source, "move-1"), { blockId: "tbl", end: keyOf(a.pd, "q"), sv: [] }), "peer-test");
  expect(tableIn(a.view, "tbl")).toBeNull();
  const record = reduceRecovery(a.pd).sources.get(source);
  expect(record.attrs.rows).toEqual(EFFECTIVE);
  expect(a.binding.restore(source, record.revision)).toEqual({ status: "restored", id: `recovered:${source}` });
  const restored = tableIn(a.view, `recovered:${source}`);
  expect(blockJson(restored).rows).toEqual(EFFECTIVE);
  expect(blocksFromYValue(a.store.value)[`recovered:${source}`].rows).toEqual(EFFECTIVE);
  peer(a.pd, (fields) => fields.set(tableKey("tbl", "cell", "r1", "c1"), "after Restore"));
  expect(blockJson(tableIn(a.view, `recovered:${source}`)).rows).toEqual(EFFECTIVE);
  expect(a.binding.stats.mismatch).toBe(0);
});

test("a Restore reloads with the same cells in a fresh tab", () => {
  const a = open();
  peer(a.pd, (fields) => fields.set(tableKey("tbl", "cell", "r2", "c2"), "44"));
  const source = keyOf(a.pd, "tbl");
  a.pd.ydoc.transact(() => a.pd.gone.set(removeKey(source, "move-1"), { blockId: "tbl", end: keyOf(a.pd, "q"), sv: [] }), "peer-test");
  const record = reduceRecovery(a.pd).sources.get(source);
  a.binding.restore(source, record.revision);
  const reloaded = open(a.store.value);
  expect(blockJson(tableIn(reloaded.view, `recovered:${source}`)).rows).toEqual({ ...ROWS, r2: { pos: "2", cells: { c1: "Sep 28", c2: "44" } } });
});

test("editor edits made before a removal come back on Restore, and edits after Restore go to the removal record", () => {
  const a = open();
  type(a, cellIn(a.view, "tbl", "r1", "c1"), "edited ");
  expect(a.pd.tableFields.get(tableKey("tbl", "cell", "r1", "c1"))).toBe("edited Sep 21");
  const source = keyOf(a.pd, "tbl");
  a.pd.ydoc.transact(() => a.pd.gone.set(removeKey(source, "move-1"), { blockId: "tbl", end: keyOf(a.pd, "q"), sv: [] }), "peer-test");
  const record = reduceRecovery(a.pd).sources.get(source);
  expect(record.attrs.rows.r1.cells.c1).toBe("edited Sep 21");
  a.binding.restore(source, record.revision);
  const id = `recovered:${source}`;
  expect(blockJson(tableIn(a.view, id)).rows.r1.cells.c1).toBe("edited Sep 21");
  const keys = [...a.pd.tableFields.keys()];
  type(a, cellIn(a.view, id, "r2", "c2"), "9");
  expect([...a.pd.tableFields.keys()]).toEqual(keys);
  expect(keys.every((key) => !JSON.parse(key)[0].startsWith("recovered:"))).toBe(true);
  expect(a.pd.gone.get(attrKey(source, "rows")).r2.cells.c2).toBe("941");
  expect(blocksFromYValue(a.store.value)[id].rows.r2.cells.c2).toBe("941");
  expect(blocksFromYValue(a.store.value)[id].rows.r1.cells.c1).toBe("edited Sep 21");
  const reloaded = open(a.store.value);
  expect(blockJson(tableIn(reloaded.view, id)).rows).toEqual(blockJson(tableIn(a.view, id)).rows);
  expect(a.binding.undo()).toBe(true);
  expect(blocksFromYValue(a.store.value)[id].rows.r2.cells.c2).toBe("41");
  expect(a.binding.stats.mismatch + reloaded.binding.stats.mismatch).toBe(0);
});
