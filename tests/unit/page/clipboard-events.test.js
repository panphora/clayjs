import { editor, ids, posOf, select, shape } from "./view-helpers.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { rectKey } from "../../../src/page/table-select.js";
import { blockJson, orderedIds } from "../../../src/page/model.js";
import { REMOTE_META } from "../../../src/page/ybind/layout.js";

/**
 * Copy, cut and paste through the editor's own DOM events. jsdom has no
 * DataTransfer and dispatches no clipboard events of its own, so each fixture
 * fires a cancelable event with a DataTransfer-shaped map and reads what the
 * handlers wrote. Native clipboard permissions and cross-app behavior stay for
 * the browser pass.
 */

beforeAll(() => { document.elementFromPoint = () => null; });
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
  expect(event.data["text/plain"]).toBe("One\n\nTwo\n\nlet x = 1;\n\nsee site");
  expect(event.data["text/html"]).toBe('<div data-id="l1" class="page-li" data-kind="bullet" data-indent="0" data-checked="false" data-pm-slice="0 0 []">One</div><div data-id="l2" class="page-li" data-kind="bullet" data-indent="1" data-checked="false">Two</div><pre data-id="cd" data-lang=""><code>let x = 1;</code></pre><p data-id="ln">see <a href="https://example.com">site</a></p>');
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
