import { schema } from "../../../src/page/schema.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { selectTableCell } from "../../../src/page/table.js";
import { editor, key, keyOn } from "./view-helpers.js";

/**
 * A table stays a native table. Its headers name their columns by id, its cells
 * point at them, and every control is reachable and usable from the keyboard.
 * The menus name the table, the row and the column when they open and find them
 * again by id when a row runs, so a peer's edit in between cannot hand a command
 * the wrong one; and the focus stays on the control the person was using.
 */

afterEach(() => { document.body.innerHTML = ""; });

const tbl = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Name" }, c2: { pos: "2", name: "Amount", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "B", c2: "1" } }, r2: { pos: "2", cells: { c1: "A", c2: "2" } } },
};

const open = (blocks = { tbl }) => {
  const view = editor([], { blocks });
  view.scrollToSelection = () => {};
  return view;
};
const shell = (view) => view.dom.parentElement;
const part = (view, cls) => shell(view).querySelector(cls);
const menu = (view) => part(view, ".page-menu");
const items = (view) => [...menu(view).querySelectorAll(".page-menu-item")];
const labels = (view) => items(view).map((row) => row.querySelector(".page-menu-label").textContent);
const isOpen = (view) => !menu(view).hidden;
const live = (view) => part(view, ".page-live").textContent;
const wrapper = (view) => view.dom.querySelector(".page-table");
const actionsButton = (view) => wrapper(view).querySelector(".page-table-actions");
const colButton = (view, id) => wrapper(view).querySelector(`th[data-col="${id}"] .page-table-col-menu`);
const handle = (view, id = "c1") => wrapper(view).querySelector(`th[data-col="${id}"] .page-table-resize`);
const rowButton = (view, id) => wrapper(view).querySelector(`tr[data-id="${id}"] .page-table-row-menu`);
const record = (view, index = 0) => blockJson(view.state.doc.child(index));
const tableId = (view) => view.state.doc.child(0).attrs.id;
const grid = (view) => {
  const table = record(view);
  return orderedIds(table.rows).map((id) => orderedIds(table.cols).map((col) => table.rows[id].cells[col]));
};
const press = (el, type, k, shiftKey = false) => el.dispatchEvent(new KeyboardEvent(type, { key: k, shiftKey, bubbles: true, cancelable: true }));
const active = () => document.activeElement;

// Keyboard-only menu use: Enter opens the menu, the arrows walk it, Enter picks.
const openActions = (view) => {
  actionsButton(view).focus();
  keyOn(actionsButton(view), "Enter");
  return isOpen(view);
};
const walkTo = (view, text) => {
  const at = labels(view).indexOf(text);
  expect(at).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < at; i++) keyOn(active(), "ArrowDown");
  expect(active().querySelector(".page-menu-label").textContent).toBe(text);
  keyOn(active(), "Enter");
  return at;
};
const clickItem = (view, text) => {
  const row = items(view).find((item) => item.querySelector(".page-menu-label").textContent === text);
  expect(row).toBeTruthy();
  row.click();
};
const tableNode = (view, cols, rows) => schema.nodes.table.create({ ...view.state.doc.child(0).attrs, cols }, rows);
// A peer's reorder and a peer's deletions, written the way the binding writes them.
const reorderColumns = (view, order) => {
  const table = view.state.doc.child(0);
  const cols = Object.fromEntries(order.map((id, i) => [id, { ...table.attrs.cols[id], pos: String(i + 1) }]));
  const rows = table.content.content.map((row) => schema.nodes.table_row.create(row.attrs, order.map((id) => row.content.content.find((cell) => cell.attrs.col === id))));
  view.dispatch(view.state.tr.replaceWith(0, table.nodeSize, tableNode(view, cols, rows)));
};
const dropColumn = (view, colId) => {
  const table = view.state.doc.child(0);
  const cols = { ...table.attrs.cols };
  delete cols[colId];
  const rows = table.content.content.map((row) => schema.nodes.table_row.create(row.attrs, row.content.content.filter((cell) => cell.attrs.col !== colId)));
  view.dispatch(view.state.tr.replaceWith(0, table.nodeSize, tableNode(view, cols, rows)));
};
const dropRow = (view, rowId) => {
  const table = view.state.doc.child(0);
  view.dispatch(view.state.tr.replaceWith(0, table.nodeSize, tableNode(view, { ...table.attrs.cols }, table.content.content.filter((row) => row.attrs.id !== rowId).map((row) => schema.nodes.table_row.create(row.attrs, row.content.content)))));
};
const peerCellEdit = (view) => {
  const row = view.state.doc.child(0).child(1);
  let at = 0;
  view.state.doc.child(0).forEach((_, offset, index) => { if (index === 1) at = offset; });
  view.dispatch(view.state.tr.insertText("!", at + 1 + row.child(0).nodeSize - 1));
};

describe("native semantics", () => {
  test("the table names itself, headers carry scope and ids, and every cell points at its header", () => {
    const view = open();
    const table = wrapper(view).querySelector("table");
    expect(table.getAttribute("aria-label")).toBe("Table");
    const id = tableId(view);
    const heads = [...wrapper(view).querySelectorAll("th")];
    expect(heads.map((th) => [th.dataset.col, th.id, th.getAttribute("scope")])).toEqual([
      ["c1", `${id}-c1`, "col"],
      ["c2", `${id}-c2`, "col"],
    ]);
    const cells = [...wrapper(view).querySelectorAll("td")];
    expect(cells.map((cell) => cell.getAttribute("headers"))).toEqual([`${id}-c1`, `${id}-c2`, `${id}-c1`, `${id}-c2`]);
    for (const cell of cells) expect(wrapper(view).querySelector(`th[id="${cell.getAttribute("headers")}"]`).dataset.col).toBe(cell.dataset.col);
  });

  test("the sorted header carries aria-sort, and only that header does", () => {
    const view = open();
    colButton(view, "c2").click();
    clickItem(view, "Sort descending");
    expect(wrapper(view).querySelector('th[data-col="c2"]').getAttribute("aria-sort")).toBe("descending");
    expect(wrapper(view).querySelector('th[data-col="c1"]').hasAttribute("aria-sort")).toBe(false);
  });

  test("the column and row controls name their label and their expanded state", () => {
    const view = open();
    const control = colButton(view, "c2");
    expect(control.getAttribute("aria-label")).toBe("Amount column actions");
    expect(control.getAttribute("aria-haspopup")).toBe("menu");
    expect(control.getAttribute("aria-expanded")).toBe("false");
    control.click();
    expect(control.getAttribute("aria-expanded")).toBe("true");
    expect(active()).toBe(items(view)[0]);
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(control.getAttribute("aria-expanded")).toBe("false");
    expect(active()).toBe(control);

    const row = rowButton(view, "r2");
    expect(row.getAttribute("aria-label")).toBe("Row actions: A");
    expect(row.getAttribute("aria-haspopup")).toBe("menu");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    row.click();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(active()).toBe(row);
  });
});

describe("the Table actions menu", () => {
  const opened = () => {
    const view = open();
    expect(openActions(view)).toBe(true);
    expect(menu(view).getAttribute("role")).toBe("menu");
    return view;
  };

  test("inserts a row and a column from the keyboard", () => {
    const view = opened();
    walkTo(view, "Insert row below");
    expect(orderedIds(record(view).rows)).toHaveLength(3);
    expect(live(view)).toBe("Row inserted");
    expect(openActions(view)).toBe(true);
    walkTo(view, "Insert column left");
    expect(orderedIds(record(view).cols)).toHaveLength(3);
    expect(live(view)).toBe("Column inserted");
  });

  test("moves a row and a column from the keyboard", () => {
    const view = opened();
    walkTo(view, "Move row down");
    expect(orderedIds(record(view).rows)).toEqual(["r2", "r1"]);
    expect(grid(view)).toEqual([["A", "2"], ["B", "1"]]);
    expect(live(view)).toBe("Row moved");
    expect(openActions(view)).toBe(true);
    walkTo(view, "Move column right");
    expect(orderedIds(record(view).cols)).toEqual(["c2", "c1"]);
    expect(grid(view)).toEqual([["2", "A"], ["1", "B"]]);
    expect(live(view)).toBe("Column moved");
  });

  test("sorts and deletes from the keyboard, one announcement each", () => {
    const view = opened();
    walkTo(view, "Sort ascending");
    expect(record(view).sort).toEqual({ col: "c1", dir: "asc" });
    expect(orderedIds(record(view).rows)).toEqual(["r2", "r1"]);
    expect(live(view)).toBe("Sorted ascending");
    expect(openActions(view)).toBe(true);
    walkTo(view, "Delete row");
    expect(orderedIds(record(view).rows)).toEqual(["r1"]);
    expect(live(view)).toBe("Row deleted");
    expect(openActions(view)).toBe(true);
    walkTo(view, "Delete column");
    expect(orderedIds(record(view).cols)).toEqual(["c2"]);
    expect(live(view)).toBe("Column deleted");
  });

  test("offers exactly the commands a keyboard user needs", () => {
    const view = opened();
    expect(labels(view)).toEqual([
      "Insert row above", "Insert row below", "Move row down", "Delete row",
      "Insert column left", "Insert column right", "Move column right",
      "Delete column", "Sort ascending", "Sort descending", "Rename column", "Column width ▸",
    ]);
    key(view, "Escape");
    expect(active()).toBe(actionsButton(view));
  });

  test("takes the name field from the menu and writes one name", () => {
    const view = opened();
    walkTo(view, "Rename column");
    const input = wrapper(view).querySelector("input.page-table-rename");
    expect(active()).toBe(input);
    expect(input.value).toBe("Name");
    input.value = "Person";
    keyOn(input, "Enter");
    expect(record(view).cols.c1.name).toBe("Person");
    expect(wrapper(view).querySelector('th[data-col="c1"] .page-table-col-menu').textContent).toBe("Person");
    expect(live(view)).toBe("Column renamed");
    expect(active()).toBe(colButton(view, "c1"));
  });

  test("Escape in the name field cancels it and writes nothing", () => {
    const view = opened();
    walkTo(view, "Rename column");
    const input = wrapper(view).querySelector("input.page-table-rename");
    const before = JSON.stringify(record(view));
    input.value = "Person";
    keyOn(input, "Escape");
    expect(JSON.stringify(record(view))).toBe(before);
    expect(wrapper(view).querySelector("input.page-table-rename")).toBe(null);
    expect(active()).toBe(colButton(view, "c1"));
    expect(history.undo(view.state, view.dispatch)).toBe(false);
  });

  test("sizes a column through the same command the menu uses", () => {
    const view = opened();
    walkTo(view, "Column width ▸");
    walkTo(view, "Wider");
    expect(record(view).cols.c1.width).toBe(200);
    expect(live(view)).toBe("Column width changed");
  });

  test("the resize separator still previews and commits from the keyboard", () => {
    const view = open();
    const el = handle(view, "c1");
    el.focus();
    press(el, "keydown", "ArrowRight");
    press(el, "keyup", "ArrowRight");
    expect(record(view).cols.c1.width).toBe(170);
    expect(active()).toBe(handle(view, "c1"));
  });
});

describe("ids survive a peer's edit", () => {
  test("a remote reorder while the column's menu is open still targets the same column id", () => {
    const view = open();
    colButton(view, "c1").click();
    expect(isOpen(view)).toBe(true);
    reorderColumns(view, ["c2", "c1"]);
    expect(orderedIds(record(view).cols)).toEqual(["c2", "c1"]);
    expect(isOpen(view)).toBe(true);
    expect(orderedIds(record(view).rows)).toEqual(["r1", "r2"]);
    clickItem(view, "Sort ascending");
    expect(record(view).sort).toEqual({ col: "c1", dir: "asc" });
    expect(orderedIds(record(view).rows)).toEqual(["r2", "r1"]);
    expect(grid(view)).toEqual([["2", "A"], ["1", "B"]]);
  });

  test("the Table actions menu keeps the column id it opened on and stays open", () => {
    const view = open();
    selectTableCell(view, 0, 0, 0);
    expect(openActions(view)).toBe(true);
    reorderColumns(view, ["c2", "c1"]);
    expect(isOpen(view)).toBe(true);
    clickItem(view, "Sort ascending");
    expect(record(view).sort.col).toBe("c1");
    expect(orderedIds(record(view).rows)).toEqual(["r2", "r1"]);
  });

  test("a removed column moves the focus to the control that took its place", () => {
    const view = open();
    const focused = colButton(view, "c2");
    focused.focus();
    dropColumn(view, "c2");
    expect(active()).toBe(colButton(view, "c1"));
    expect(live(view)).toBe("");
  });

  test("a removed row moves the focus to the row control that took its place", async () => {
    const view = open();
    const focused = rowButton(view, "r2");
    focused.focus();
    dropRow(view, "r2");
    await Promise.resolve();
    expect(active()).toBe(rowButton(view, "r1"));
  });

  test("a focused name field is not replaced by a peer's cell edit", () => {
    const view = open();
    colButton(view, "c1").click();
    clickItem(view, "Rename");
    const input = wrapper(view).querySelector("input.page-table-rename");
    input.value = "Pers";
    peerCellEdit(view);
    expect(wrapper(view).querySelector("input.page-table-rename")).toBe(input);
    expect(input.value).toBe("Pers");
    expect(active()).toBe(input);
    keyOn(input, "Enter");
    expect(record(view).cols.c1.name).toBe("Pers");
  });

  test("a denied action announces once and leaves no undo entry", () => {
    const view = open();
    selectTableCell(view, 0, 0, 0);
    const before = JSON.stringify(record(view));
    expect(openActions(view)).toBe(true);
    dropColumn(view, "c1");
    live(view);
    expect(isOpen(view)).toBe(true);
    clickItem(view, "Sort ascending");
    expect(live(view)).toBe("That part of the table is no longer available.");
    expect(record(view).cols.c1).toBeUndefined();
    expect(history.undo(view.state, view.dispatch)).toBe(true);
    expect(JSON.stringify(record(view))).toBe(before);
  });

  test("one announcement per action and none for a peer's cell edit", () => {
    const view = open();
    peerCellEdit(view);
    expect(live(view)).toBe("");
    expect(openActions(view)).toBe(true);
    walkTo(view, "Insert row above");
    expect(live(view)).toBe("Row inserted");
    peerCellEdit(view);
    expect(live(view)).toBe("Row inserted");
  });
});

describe("leaving the menu and leaving edit", () => {
  test("Tab closes the menu and is left to the page's own focus exit", () => {
    const view = open();
    expect(openActions(view)).toBe(true);
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    items(view)[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(isOpen(view)).toBe(false);
  });

  test("leaving edit takes the menus and the pending listeners with it", async () => {
    const view = open();
    expect(openActions(view)).toBe(true);
    view.destroy();
    await Promise.resolve();
    expect(document.querySelector(".page-menu")).toBe(null);
    expect(document.querySelector(".page-table")).toBe(null);
    expect(active()).toBe(document.body);
    expect(() => keyOn(document.body, "Enter")).not.toThrow();
  });
});
