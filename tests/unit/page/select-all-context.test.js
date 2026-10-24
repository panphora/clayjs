import { editor, key, posOf } from "./view-helpers.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { BlockSelection } from "../../../src/page/blocks.js";
import { rectKey, setRect } from "../../../src/page/table-select.js";

const { TextSelection } = pmState;

const blocks = {
  h: { t: "heading", pos: "B", c: "Title" },
  tbl: {
    t: "table", pos: "C",
    cols: { c1: { pos: "1", name: "One" }, c2: { pos: "2", name: "Two" } },
    rows: {
      r1: { pos: "1", cells: { c1: "ab" } },
      r2: { pos: "2", cells: { c1: "cd", c2: "ef" } },
    },
  },
  keep: { t: "paragraph", pos: "D", c: "keep" },
};

// jsdom is not a Mac, so Mod is Ctrl.
const modA = (view) => view.someProp("handleKeyDown", (f) => f(view, new KeyboardEvent("keydown", { key: "a", ctrlKey: true })));
const td = (view, row, col) => view.dom.querySelectorAll("tbody tr")[row].querySelectorAll("td")[col];
const caretIn = (view, el) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.posAtDOM(el, 0))));
const tableAt = (view) => posOf(view, "tbl") - 1;
const blockIds = (view) => { const out = []; view.state.doc.forEach((n) => out.push(n.attrs.id)); return out; };

test("Mod-a in a cell selects the cell's text, then the table, then every block", () => {
  const view = editor([], { blocks });
  const table = view.state.doc.nodeAt(tableAt(view));
  const before = view.state.doc;
  const cell = td(view, 0, 0), cellAt = view.posAtDOM(cell, 0);
  caretIn(view, cell);
  modA(view);
  const first = view.state.selection;
  expect([first.from, first.to]).toEqual([cellAt, cellAt + 2]);
  expect(first instanceof TextSelection).toBe(true);
  expect(first.$from.parent.type.name).toBe("table_cell");
  expect(view.state.doc.textBetween(first.from, first.to)).toBe("ab");
  modA(view);
  const second = view.state.selection;
  expect(second instanceof BlockSelection).toBe(true);
  expect([second.from, second.to]).toEqual([tableAt(view), tableAt(view) + table.nodeSize]);
  expect(key(view, "Delete")).toBe(true);
  expect(blockIds(view)).toEqual(["h", "keep"]);

  const fresh = editor([], { blocks });
  caretIn(fresh, td(fresh, 0, 0));
  modA(fresh);
  modA(fresh);
  expect(fresh.state.selection instanceof BlockSelection).toBe(true);
  modA(fresh);
  const all = fresh.state.selection;
  expect(all instanceof BlockSelection).toBe(true);
  expect([all.from, all.to]).toEqual([0, fresh.state.doc.content.size]);
  expect(before.eq(view.state.doc)).toBe(false);
});

test("Mod-a in the empty cell of the table selects the table", () => {
  const view = editor([], { blocks });
  const table = view.state.doc.nodeAt(tableAt(view));
  caretIn(view, td(view, 0, 1));
  modA(view);
  const sel = view.state.selection;
  expect(sel instanceof BlockSelection).toBe(true);
  expect([sel.from, sel.to]).toEqual([tableAt(view), tableAt(view) + table.nodeSize]);
});

test("Mod-a on a rectangle over two cells selects the table", () => {
  const view = editor([], { blocks });
  const table = view.state.doc.nodeAt(tableAt(view));
  expect(setRect(view, view.posAtDOM(td(view, 0, 0), 0), view.posAtDOM(td(view, 1, 1), 0))).toBe(true);
  expect(rectKey.getState(view.state)).not.toBe(null);
  modA(view);
  const sel = view.state.selection;
  expect(sel instanceof BlockSelection).toBe(true);
  expect([sel.from, sel.to]).toEqual([tableAt(view), tableAt(view) + table.nodeSize]);
});

test("Mod-a outside a table keeps its old ladder: the block's text, then every block", () => {
  const view = editor([], { blocks });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posOf(view, "keep"))));
  modA(view);
  const text = view.state.selection;
  expect(text instanceof TextSelection).toBe(true);
  expect(view.state.doc.textBetween(text.from, text.to)).toBe("keep");
  modA(view);
  const all = view.state.selection;
  expect(all instanceof BlockSelection).toBe(true);
  expect([all.from, all.to]).toEqual([0, view.state.doc.content.size]);
});

test("no Mod-a changes the document", () => {
  const view = editor([], { blocks });
  const before = view.state.doc;
  caretIn(view, td(view, 0, 0));
  for (let press = 0; press < 4; press++) {
    modA(view);
    expect(view.state.doc.eq(before)).toBe(true);
  }
  caretIn(view, td(view, 0, 1));
  for (let press = 0; press < 3; press++) {
    modA(view);
    expect(view.state.doc.eq(before)).toBe(true);
  }
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posOf(view, "keep"))));
  for (let press = 0; press < 3; press++) {
    modA(view);
    expect(view.state.doc.eq(before)).toBe(true);
  }
});
