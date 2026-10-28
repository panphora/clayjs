import { editor, select, key } from "./view-helpers.js";
import { blockJson, nodeFromBlock } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";

const table = {
  t: "table", pos: "V",
  cols: { c1: { pos: "1", name: "Name", kind: "text" }, c2: { pos: "2", name: "Amount", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "A", c2: "10" } }, r2: { pos: "2", cells: { c1: "B", c2: "2" } } },
};

test("table view has labelled buttons, a scroll container and command menus", () => {
  const view = editor([], { blocks: { tbl: table } });
  const wrapper = view.dom.querySelector(".page-table");
  expect(wrapper.getAttribute("role")).toBe("group");
  expect(wrapper.querySelector(".page-table-scroll")).toBeTruthy();
  const buttons = [...wrapper.querySelectorAll("thead button")];
  expect(buttons.map((button) => button.textContent)).toEqual(["Name", "Amount"]);
  expect(wrapper.querySelector('td[data-kind="number"]')).toBeTruthy();
  buttons[1].click();
  const menu = view.dom.parentElement.querySelector(".page-menu");
  expect(menu.querySelectorAll('button[role="menuitem"]').length).toBeGreaterThan(5);
  [...menu.querySelectorAll("button")].find((button) => button.textContent.includes("Sort ascending")).click();
  expect(view.state.doc.child(0).attrs.sort).toEqual({ col: "c2", dir: "asc" });
  expect(wrapper.querySelector('th[data-col="c2"]').getAttribute("aria-sort")).toBe("ascending");
  wrapper.querySelector('th[data-col="c1"] button').click();
  [...menu.querySelectorAll("button")].find((button) => button.textContent.includes("Rename")).click();
  const name = wrapper.querySelector('input[aria-label="Column name"]');
  name.value = "Person";
  name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(view.state.doc.child(0).attrs.cols.c1.name).toBe("Person");
  wrapper.querySelector('th[data-col="c1"] button').click();
  [...menu.querySelectorAll("button")].find((button) => button.textContent.includes("Kind")).click();
  [...menu.querySelectorAll("button")].find((button) => button.textContent.includes("Date")).click();
  expect(view.state.doc.child(0).attrs.cols.c1.kind).toBe("date");
  expect(wrapper.querySelector('td[data-col="c1"]').dataset.kind).toBe("date");
  wrapper.querySelector(".page-table-row-menu").click();
  [...menu.querySelectorAll("button")].find((button) => button.textContent.includes("Insert below")).click();
  expect(view.state.doc.child(0).childCount).toBe(3);
});

test("edited table retains the existing block record shape through a round trip", () => {
  const view = editor([], { blocks: { tbl: table } });
  const before = blockJson(view.state.doc.child(0));
  select(view, 4);
  view.dispatch(view.state.tr.insertText("!"));
  const after = blockJson(view.state.doc.child(0));
  expect(after.rows.r1.cells.c1).not.toBe(before.rows.r1.cells.c1);
  expect(blockJson(nodeFromBlock(schema, "tbl", after))).toEqual(after);
});

test("editor keymap uses Tab, Enter and Mod-Enter inside cells", () => {
  const view = editor([], { blocks: { tbl: table } });
  select(view, 3);
  expect(key(view, "Tab")).toBe(true);
  expect(view.state.selection.$head.index(2)).toBe(1);
  expect(key(view, "Enter")).toBe(true);
  expect(view.state.selection.$head.index(1)).toBe(1);
  expect(key(view, "Enter", { ctrlKey: true })).toBe(true);
  expect(view.state.doc.child(0).childCount).toBe(3);
});

test("a press on a cell's padding puts the caret in that cell's text, after the row button", () => {
  const view = editor([], { blocks: { tbl: table } });
  const cells = view.dom.querySelectorAll("tbody td");
  for (const [index, text] of [[1, "10"], [2, "B"]]) {
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    cells[index].dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    const { $head } = view.state.selection;
    expect($head.parent.type.name).toBe("table_cell");
    expect($head.parent.textContent).toBe(text);
    expect($head.parentOffset).toBe(text.length);
  }
  expect(cells[0].querySelector(".page-table-row-menu").nextElementSibling).toBe(cells[0].querySelector("span"));
});
