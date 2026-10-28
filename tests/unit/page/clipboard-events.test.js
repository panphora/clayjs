import { blocksOf, editor, ids, posOf, select, shape } from "./view-helpers.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { rectKey } from "../../../src/page/table-select.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { REMOTE_META } from "../../../src/page/ybind/layout.js";
import { loadClipboardShape } from "../../../src/page/blocks.js";

/**
 * Copy, cut and paste through the editor's own DOM events. jsdom has no
 * DataTransfer and dispatches no clipboard events of its own, so each fixture
 * fires a cancelable event with a DataTransfer-shaped map and reads what the
 * handlers wrote. Native clipboard permissions and cross-app behavior stay for
 * the browser pass.
 */

beforeAll(() => { document.elementFromPoint = () => null; return loadClipboardShape(); });
afterAll(() => { delete document.elementFromPoint; });
afterEach(() => { document.body.innerHTML = ""; });

const clip = (data = {}) => {
  const store = { ...data };
  const types = () => Object.keys(store);
  return {
    data: store,
    clipboardData: {
      setData: (type, value) => { store[type] = String(value); },
      getData: (type) => store[type] ?? "",
      clearData: (type) => { if (type === undefined) for (const key of Object.keys(store)) delete store[key]; else delete store[type]; },
      get types() { return types(); },
      files: [],
    },
  };
};
const fire = (view, type, event = clip()) => {
  const domEvent = Object.assign(new Event(type, { bubbles: true, cancelable: true }), event);
  view.dom.dispatchEvent(domEvent);
  return domEvent;
};
const blocks = (view, lo, hi = lo) => view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, lo, hi)));
const indexOf = (view, id) => { let found = -1; view.state.doc.forEach((n, _, i) => { if (n.attrs.id === id) found = i; }); return found; };
const mark = (view, id, from, to, name, attrs) => {
  const start = posOf(view, id) + from;
  view.dispatch(view.state.tr.addMark(start, start + to - from, view.state.schema.marks[name].create(attrs)));
};
const blocksText = (view) => { const out = []; view.state.doc.forEach((n) => out.push(`${n.type.name}${n.attrs.kind ? ":" + n.attrs.kind : ""}${n.attrs.parent ? "<" + n.attrs.parent : ""}:${n.textContent}`)); return out; };
const marksOf = (view) => { const out = []; view.state.doc.forEach((n) => n.forEach((t) => { if (t.isText) out.push(`${t.text}:${t.marks.map((m) => m.type.name).sort().join("+")}`); })); return out; };
const paste = (view, source) => fire(view, "paste", clip(source.data));
const undo = (view) => { view.scrollToSelection = () => {}; return history.undo(view.state, view.dispatch); };
const TABLE = {
  t: "table",
  pos: "V",
  cols: { c1: { pos: "1", name: "A" }, c2: { pos: "2", name: "B" }, c3: { pos: "3", name: "C" } },
  rows: {
    r1: { pos: "1", cells: { c1: "a1", c2: "b1", c3: "c1" } },
    r2: { pos: "2", cells: { c1: "a2", c2: "b2", c3: "c2" } },
    r3: { pos: "3", cells: { c1: "a3", c2: "b3", c3: "c3" } },
  },
};
const grid = (view) => {
  const table = blockJson(view.state.doc.child(0));
  const cols = orderedIds(table.cols);
  return orderedIds(table.rows).map((id) => cols.map((col) => table.rows[id].cells[col]));
};

test("copy writes marked text to both formats", () => {
  const view = editor([["p", "paragraph", "Bold here"]]);
  mark(view, "p", 0, 4, "strong");
  select(view, posOf(view, "p"), posOf(view, "p") + 9);
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/plain"]).toBe("Bold here");
  expect(event.data["text/html"]).toBe('<p data-id="p" data-pm-slice="1 1 []"><strong>Bold</strong> here</p>');
});

test("copy across blocks keeps their order and their marks", () => {
  const view = editor([["p", "paragraph", "Bold here"], ["q", "paragraph", "Second line"]]);
  mark(view, "p", 0, 4, "strong");
  select(view, posOf(view, "p") + 5, posOf(view, "q") + 6);
  const event = clip();
  fire(view, "copy", event);
  expect(event.data["text/plain"]).toBe("here\n\nSecond");
  expect(event.data["text/html"]).toBe('<p data-id="p" data-pm-slice="1 1 []">here</p><p data-id="q">Second</p>');
});

test("a collapsed toggle copies with the body it hides, in both formats", () => {
  const view = editor([["t", "toggle", "Title"], ["b", "paragraph", "Hidden body", { parent: "t" }], ["z", "paragraph", "Tail"]]);
  blocks(view, 0, 1);
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/plain"]).toBe("Title\n\nHidden body");
  expect(event.data["text/html"]).toBe('<div data-id="t" class="page-toggle" data-open="false" data-page-toggle="t" data-pm-slice="0 0 []">Title</div><p data-id="b" data-page-parent="t">Hidden body</p>');
});

test("lists, links and code text copy as their own markup", () => {
  const view = editor([["l1", "list_item", "One", { kind: "bullet" }], ["l2", "list_item", "Two", { kind: "bullet", indent: 1 }], ["cd", "code_block", "let x = 1;"], ["ln", "paragraph", "see site"]]);
  mark(view, "ln", 4, 8, "link", { href: "https://example.com" });
  blocks(view, 0, 3);
  const event = clip();
  fire(view, "copy", event);
  expect(event.data["text/plain"]).toBe("- One\n    - Two\n\nlet x = 1;\n\nsee site");
  expect(event.data["text/html"]).toBe('<ul data-pm-slice="0 0 []"><li>One<ul><li>Two</li></ul></li></ul><pre data-id="cd" data-lang=""><code>let x = 1;</code></pre><p data-id="ln">see <a href="https://example.com">site</a></p>');
});

const LISTS = [
  ["a", "list_item", "Alpha", { kind: "bullet" }],
  ["b", "list_item", "Beta", { kind: "ordered", indent: 1 }],
  ["c", "list_item", "Gamma", { kind: "ordered", indent: 1 }],
  ["d", "list_item", "Delta", { kind: "check", indent: 2, checked: true }],
  ["e", "list_item", "Epsilon", { kind: "check" }],
  ["f", "paragraph", "Between"],
  ["g", "list_item", "Zeta", { kind: "ordered" }],
];
const listsOf = (view) => { const out = []; view.state.doc.forEach((n) => { if (n.textContent) out.push(`${n.type.name}:${n.attrs.kind ?? ""}:${n.attrs.indent ?? ""}:${n.attrs.checked ?? ""}:${n.textContent}`); }); return out; };

test("lists copy out as nested ul/ol with checkboxes and markdown text, and paste back as the same items", () => {
  const src = editor(LISTS);
  blocks(src, 0, LISTS.length - 1);
  const event = clip();
  fire(src, "copy", event);
  expect(event.data["text/html"]).toBe('<ul data-pm-slice="0 0 []"><li>Alpha<ol><li>Beta</li><li>Gamma<ul><li><input type="checkbox" disabled="" checked="">Delta</li></ul></li></ol></li><li><input type="checkbox" disabled="">Epsilon</li></ul><p data-id="f">Between</p><ol><li>Zeta</li></ol>');
  expect(event.data["text/plain"]).toBe("- Alpha\n    1. Beta\n    2. Gamma\n        - [x] Delta\n- [ ] Epsilon\n\nBetween\n\n1. Zeta");
  const dst = editor([["e", "paragraph", ""]]);
  select(dst, posOf(dst, "e"));
  paste(dst, event);
  expect(listsOf(dst)).toEqual(listsOf(src));
});

test("a list's markdown text pastes back as the same items when only text reaches the clipboard", () => {
  const src = editor(LISTS.slice(0, 5));
  blocks(src, 0, 4);
  const event = clip();
  fire(src, "copy", event);
  const dst = editor([["e", "paragraph", ""]]);
  select(dst, posOf(dst, "e"));
  paste(dst, { data: { "text/plain": event.data["text/plain"] } });
  expect(listsOf(dst)).toEqual(listsOf(src));
});

test("list items inside a toggle copy and paste with the toggle still owning them", () => {
  const src = editor([["t", "toggle", "Title", { open: true }], ["i", "list_item", "Inside", { parent: "t" }], ["j", "list_item", "Nested", { parent: "t", indent: 1 }], ["z", "list_item", "Outside"]]);
  blocks(src, 0, 3);
  const event = clip();
  fire(src, "copy", event);
  const dst = editor([["e", "paragraph", ""]]);
  select(dst, posOf(dst, "e"));
  paste(dst, event);
  const out = [];
  dst.state.doc.forEach((n) => out.push(n));
  const toggle = out.find((n) => n.type.name === "toggle");
  expect(out.filter((n) => n.textContent).map((n) => [n.textContent, n.attrs.indent ?? null, n.attrs.parent === toggle.attrs.id])).toEqual([["Title", null, false], ["Inside", 0, true], ["Nested", 1, true], ["Outside", 0, false]]);
});

const WIDE = { ...TABLE, cols: { c1: { pos: "1", name: "A", width: 180 }, c2: { pos: "2", name: "B", kind: "number" }, c3: { pos: "3", name: "C" } }, sort: { col: "c2", dir: "desc" } };

test("a table copies its column names as a header row, in both formats", () => {
  const view = editor([], { blocks: { ...blocksOf([["p", "paragraph", "Before"]]), tbl: { ...WIDE, pos: "W" } } });
  blocks(view, 0, 1);
  const event = clip();
  fire(view, "copy", event);
  expect(event.data["text/plain"]).toBe("Before\n\nA\tB\tC\na1\tb1\tc1\na2\tb2\tc2\na3\tb3\tc3");
  expect(event.data["text/html"]).toContain('<thead><tr><th data-col="c1" scope="col" data-width="180" style="width: 180px;">A</th><th data-col="c2" scope="col" data-kind="number">B</th><th data-col="c3" scope="col">C</th></tr></thead><tbody>');
});

for (const [label, lo, hi] of [["with a paragraph", 0, 1], ["on its own", 1, 1]]) {
  test(`a table copied ${label} pastes into another Document with its header, cells, widths, kinds and sort`, () => {
    const src = editor([], { blocks: { ...blocksOf([["p", "paragraph", "Before"]]), tbl: { ...WIDE, pos: "W" } } });
    blocks(src, lo, hi);
    const event = clip();
    fire(src, "copy", event);
    const dst = editor([["e", "paragraph", "Target"], ["x", "paragraph", ""]]);
    select(dst, posOf(dst, "x"));
    paste(dst, event);
    let table = null;
    dst.state.doc.forEach((n) => { if (n.type.name === "table") table = blockJson(n); });
    const cols = orderedIds(table.cols);
    expect(cols.map((id) => table.cols[id])).toEqual([{ pos: expect.any(String), name: "A", width: 180 }, { pos: expect.any(String), name: "B", kind: "number" }, { pos: expect.any(String), name: "C" }]);
    expect(orderedIds(table.rows).map((id) => cols.map((col) => table.rows[id].cells[col]))).toEqual([["a1", "b1", "c1"], ["a2", "b2", "c2"], ["a3", "b3", "c3"]]);
    expect(table.sort).toEqual({ col: cols[1], dir: "desc" });
  });
}

test("a table rectangle pasted outside any table becomes a new table of those cells", () => {
  const view = editor([], { blocks: { ...blocksOf([["e", "paragraph", ""]]), tbl: { ...TABLE, pos: "W" } } });
  select(view, posOf(view, "e"));
  paste(view, { data: { "text/html": '<table><tbody><tr><td data-col="c2">b1</td><td data-col="c3">c1</td></tr><tr><td data-col="c2">b2</td><td data-col="c3">c2</td></tr></tbody></table>', "text/plain": "b1\tc1\nb2\tc2" } });
  const tables = [];
  view.state.doc.forEach((n) => { if (n.type.name === "table") tables.push(blockJson(n)); });
  const pasted = tables.find((t) => orderedIds(t.rows).length === 2);
  const cols = orderedIds(pasted.cols);
  expect(orderedIds(pasted.rows).map((id) => cols.map((col) => pasted.rows[id].cells[col]))).toEqual([["b1", "c1"], ["b2", "c2"]]);
});

test("a foreign table among other blocks pastes as a table, its header row naming the columns", () => {
  const view = editor([["e", "paragraph", ""]]);
  select(view, posOf(view, "e"));
  paste(view, { data: { "text/html": "<p>Lead</p><table><thead><tr><th>Name</th><th>Qty</th></tr></thead><tbody><tr><td>Pen</td><td><b>2</b></td></tr></tbody></table><p>Tail</p>", "text/plain": "Lead\nName\tQty\nPen\t2\nTail" } });
  const out = [];
  view.state.doc.forEach((n) => out.push(n.type.name === "table" ? blockJson(n) : n.textContent));
  const table = out.find((n) => typeof n === "object");
  const cols = orderedIds(table.cols);
  expect(out.filter((n) => n !== "")).toEqual(["Lead", table, "Tail"]);
  expect(cols.map((id) => table.cols[id].name)).toEqual(["Name", "Qty"]);
  expect(orderedIds(table.rows).map((id) => table.rows[id].cells[cols[0]])).toEqual(["Pen"]);
  expect(table.rows[orderedIds(table.rows)[0]].cells[cols[1]]).toMatchObject({ c: "2" });
});

test("cut copies the same text and removes exactly that selection in one undo step", () => {
  const view = editor([["p", "paragraph", "Hello world"], ["q", "paragraph", "Second line"]]);
  const before = view.state.doc;
  select(view, posOf(view, "p") + 2, posOf(view, "q") + 6);
  const event = clip();
  expect(fire(view, "cut", event).defaultPrevented).toBe(true);
  expect(event.data["text/plain"]).toBe("llo world\n\nSecond");
  expect(shape(view)).toBe("He line");
  expect(undo(view)).toBe(true);
  expect(view.state.doc.eq(before)).toBe(true);
});

test("pasting a copied block selection gives the same content, marks and order with fresh ids", () => {
  const view = editor([["t", "toggle", "Title"], ["b", "paragraph", "Hidden body", { parent: "t" }], ["e", "paragraph", ""]]);
  mark(view, "b", 0, 6, "strong");
  blocks(view, 0, 1);
  const event = clip();
  fire(view, "copy", event);
  select(view, posOf(view, "e"));
  paste(view, event);
  const after = ids(view);
  expect(after).toHaveLength(4);
  expect(new Set(after).size).toBe(4);
  const [toggle, body] = [view.state.doc.child(2), view.state.doc.child(3)];
  expect([toggle.type.name, toggle.attrs.open, toggle.textContent]).toEqual(["toggle", false, "Title"]);
  expect([body.type.name, body.attrs.parent, body.textContent]).toEqual(["paragraph", toggle.attrs.id, "Hidden body"]);
  expect(marksOf(view)).toEqual(["Title:", "Hidden:strong", " body:", "Title:", "Hidden:strong", " body:"]);
});

test("code text copies as code, not as a block", () => {
  const view = editor([["cd", "code_block", "let x = 1;"]]);
  select(view, posOf(view, "cd") + 4, posOf(view, "cd") + 10);
  const event = clip();
  fire(view, "copy", event);
  expect(event.data["text/plain"]).toBe("x = 1;");
  expect(event.data["text/html"]).toBe('<pre data-id="cd" data-lang="" data-pm-slice="1 1 []"><code>x = 1;</code></pre>');
});

test("a caret with nothing selected copies nothing and leaves the event to the browser", () => {
  const view = editor([["p", "paragraph", "Hello"], ["q", "paragraph", "Second"]]);
  const before = view.state.doc;
  select(view, posOf(view, "p") + 2);
  const copyEvent = clip();
  expect(fire(view, "copy", copyEvent).defaultPrevented).toBe(false);
  expect(copyEvent.data).toEqual({});
  const cutEvent = clip();
  fire(view, "cut", cutEvent);
  expect(cutEvent.data).toEqual({});
  expect(view.state.doc.eq(before)).toBe(true);
});

test("a peer edit before the selection does not change what cut removes", () => {
  const view = editor([["p", "paragraph", "Hello world"], ["q", "paragraph", "Second line"]]);
  view.dispatch(view.state.tr.insertText("REMOTE ", 1).setMeta(REMOTE_META, true));
  expect(shape(view)).toBe("REMOTE Hello world | Second line");
  select(view, posOf(view, "p") + 13, posOf(view, "p") + 18);
  const event = clip();
  fire(view, "cut", event);
  expect(event.data["text/plain"]).toBe("world");
  expect(shape(view)).toBe("REMOTE Hello  | Second line");
});

test("a table rectangle copies tab-separated text and an HTML table through the DOM event, and cut clears it", () => {
  const view = editor([], { blocks: { tbl: TABLE } });
  const td = (row, col) => view.dom.querySelectorAll("tbody tr")[row].querySelectorAll("td")[col];
  const mouse = (type, target) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  mouse("mousedown", td(0, 1));
  mouse("mouseover", td(1, 2));
  expect(rectKey.getState(view.state)).toEqual({ table: "tbl", anchor: ["r1", "c2"], head: ["r2", "c3"] });
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/plain"]).toBe("b1\tc1\nb2\tc2");
  expect(event.data["text/html"]).toBe('<table><tbody><tr><td data-col="c2">b1</td><td data-col="c3">c1</td></tr><tr><td data-col="c2">b2</td><td data-col="c3">c2</td></tr></tbody></table>');
  const cut = clip();
  expect(fire(view, "cut", cut).defaultPrevented).toBe(true);
  expect(cut.data["text/plain"]).toBe("b1\tc1\nb2\tc2");
  expect(grid(view).map((row) => row.slice(1))).toEqual([["", ""], ["", ""], ["b3", "c3"]]);
  expect(undo(view)).toBe(true);
  expect(grid(view).map((row) => row.slice(1))).toEqual([["b1", "c1"], ["b2", "c2"], ["b3", "c3"]]);
});
