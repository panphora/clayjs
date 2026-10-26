import { editor, key, posOf, select, typeText } from "./view-helpers.js";
import { importCsv } from "../../../src/page/csv-import.js";
import { state as pmState, history } from "../../../src/vendor/prosemirror.vendor.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";

const file = (body) => new File([body], "values.csv", { type: "text/csv" });
const fresh = (options = {}) => editor([["p", "paragraph", ""]], options);
const type = (view, text) => { for (const ch of text) typeText(view, ch); };
afterEach(() => { delete globalThis.clay; });

test("CSV import keeps strings, infers kinds and is one undo step", async () => {
  const view = fresh();
  expect(await importCsv(view, file("Code,Amount,Due\n007,12,2026-10-26\n008,2,2026-10-27"))).toBe(true);
  const table = blockJson(view.state.doc.child(0));
  const cols = orderedIds(table.cols), rows = orderedIds(table.rows);
  expect(cols.map((id) => table.cols[id].kind)).toEqual(["text", "number", "date"]);
  expect(table.rows[rows[0]].cells[cols[0]]).toBe("007");
  let undone;
  expect(history.undo(view.state, (tr) => { undone = view.state.apply(tr); })).toBe(true);
  expect(undone.doc.child(0).type.name).toBe("paragraph");
});

test("truncation can insert the first rows with the original file in one undo step", async () => {
  const view = fresh();
  let message;
  globalThis.clay = { confirm: async (text) => { message = text; } };
  const body = "Name,Amount\n" + Array.from({ length: 9000 }, (_, i) => `Item ${i},${i}`).join("\n");
  const upload = async () => ({ ok: true, uploads: [{ url: "/files/values.csv" }] });
  expect(await importCsv(view, file(body), { upload })).toBe(true);
  expect(message).toMatch(/This file has 9000 rows\. The first \d+ fit in a table\./);
  expect(view.state.doc.childCount).toBe(2);
  expect(view.state.doc.child(1).attrs.src).toBe("/files/values.csv");
  let undone;
  history.undo(view.state, (tr) => { undone = view.state.apply(tr); });
  expect(undone.doc.childCount).toBe(1);
  expect(undone.doc.child(0).type.name).toBe("paragraph");
});

test("cancel and an unclosed quote leave the document alone", async () => {
  const view = fresh();
  const body = "Name,Amount\n" + Array.from({ length: 9000 }, (_, i) => `Item ${i},${i}`).join("\n");
  globalThis.clay = { confirm: () => Promise.reject(new Error("cancel")) };
  expect(await importCsv(view, file(body))).toBe(false);
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
  expect(await importCsv(view, file('Name\n"unterminated'))).toBe(false);
  expect(view.dom.parentElement.querySelector('[role="alert"]').textContent).toBe("Couldn't read this CSV: unclosed quote on line 2.");
});

test("pasted CSV file uses the same import path", async () => {
  const view = fresh();
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files: [file("Name\nAda")], getData: () => "" } });
  view.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  for (let waited = 0; waited < 2000 && view.state.doc.child(0).type.name !== "table"; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(view.state.doc.child(0).type.name).toBe("table");
});

test("a slash import that arrives after an edit keeps the person\u0027s text and lands under the slash\u0027s block", async () => {
  const view = editor([["a", "paragraph", "Peer paragraph text"], ["b", "paragraph", "Mine "]]);
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, "b", true));
  type(view, "/csv");
  const menu = view.dom.parentElement.querySelector(".page-menu");
  expect(menu.hidden).toBe(false);
  key(view, "Enter");
  expect(menu.hidden).toBe(true);
  expect(view.state.doc.child(1).textContent).toBe("Mine /csv");
  // An edit before the file arrives moves every position the slash range held.
  view.dispatch(view.state.tr.insertText("12345", 1));
  const input = view.dom.parentElement.querySelector(".page-csv-input");
  Object.defineProperty(input, "files", { value: [file("Name\nAda")], configurable: true });
  input.dispatchEvent(new Event("change"));
  for (let waited = 0; waited < 2000 && view.state.doc.childCount < 3; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(view.state.doc.child(0).textContent).toBe("12345Peer paragraph text");
  expect(view.state.doc.child(1).textContent).toBe("Mine ");
  expect(view.state.doc.child(2).type.name).toBe("table");
});

test("a slash import whose range no longer holds its text inserts after that block and removes nothing", async () => {
  const view = editor([["a", "paragraph", "Peer paragraph text"], ["b", "paragraph", "Mine "]]);
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, "b", true));
  type(view, "/csv");
  const from = view.state.selection.head - 4;
  key(view, "Enter");
  view.dispatch(view.state.tr.insertText("x", from + 2));
  expect(view.state.doc.child(1).textContent).toBe("Mine /cxsv");
  const input = view.dom.parentElement.querySelector(".page-csv-input");
  Object.defineProperty(input, "files", { value: [file("Name\nAda")], configurable: true });
  input.dispatchEvent(new Event("change"));
  for (let waited = 0; waited < 2000 && view.state.doc.childCount < 3; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(view.state.doc.child(0).textContent).toBe("Peer paragraph text");
  expect(view.state.doc.child(1).textContent).toBe("Mine /cxsv");
  expect(view.state.doc.child(2).type.name).toBe("table");
});
