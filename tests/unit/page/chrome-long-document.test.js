/**
 * Pointer work on a long document costs work around the pointer, not around the
 * document: the outline is built once per ProseMirror document and a drag frame
 * searches the visible blocks instead of measuring every one of them. jsdom has
 * no layout, so each block gets a fake rectangle from a layout table and every
 * read is counted.
 */
import { jest } from "@jest/globals";
import * as blocks from "../../../src/page/blocks.js";

const builds = { n: 0 };
await jest.unstable_mockModule("../../../src/page/blocks.js", () => ({
  ...blocks,
  outline: (doc) => { builds.n++; return blocks.outline(doc); },
}));

const { editor, posOf, select, shape, ids } = await import("./view-helpers.js");
const { outlineOf } = await import("../../../src/page/outline-cache.js");
const { schema } = await import("../../../src/page/schema.js");
const { docFromBlocks, keysBetween, REMOTE } = await import("../../../src/page/model.js");
const { selectBlocks } = await import("../../../src/page/blocksel.js");

const opened = [];
const ROW = 30;
const HEIGHT = 20;
const rows = (shift = 0) => (i) => ({ left: 0, top: shift + i * ROW, width: 600, height: HEIGHT, right: 600, bottom: shift + i * ROW + HEIGHT });

// The test's own frame waits go through the real function, so they are not counted.
const raf = window.requestAnimationFrame.bind(window);
const frame = () => new Promise((done) => raf(() => done()));

afterEach(() => {
  for (const view of opened) if (!view.isDestroyed) view.destroy();
  opened.length = 0;
  document.body.innerHTML = "";
});

// Every frame the page code asks for, so a stray loop or a leftover frame shows.
function frameCounter() {
  const real = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  const live = new Set();
  const ran = { n: 0 };
  window.requestAnimationFrame = (cb) => {
    let id = 0;
    id = real((time) => { live.delete(id); ran.n++; cb(time); });
    live.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => { live.delete(id); realCancel(id); };
  return {
    live, ran,
    stop() { window.requestAnimationFrame = real; window.cancelAnimationFrame = realCancel; },
  };
}
let counter = null;

function coords(view) {
  view.posAtCoords = ({ top }) => {
    const index = Math.max(0, Math.min(Math.floor(top / ROW), view.state.doc.childCount - 1));
    let pos = 0;
    for (let k = 0; k < index; k++) pos += view.state.doc.child(k).nodeSize;
    return { pos: pos + 1, inside: pos };
  };
}

// Each block's rectangle comes from the table, and every read is counted.
function geometry(view, table = rows()) {
  const reads = { n: 0 };
  let at = 0;
  view.state.doc.forEach((n, _, i) => {
    const dom = view.nodeDOM(at);
    dom.getBoundingClientRect = () => { reads.n++; return table(i); };
    at += n.nodeSize;
  });
  return reads;
}

function page(spec, options = {}) {
  const view = editor(spec, options);
  opened.push(view);
  coords(view);
  geometry(view, options.table ?? rows());
  select(view, posOf(view, ids(view)[0]));
  return view;
}

function many(n) {
  const keys = keysBetween(null, null, n);
  const blocks = {};
  for (let i = 0; i < n; i++) blocks[`b${i}`] = { t: "paragraph", pos: keys[i], c: `p${i}` };
  return docFromBlocks(schema, blocks);
}

const shell = (view) => view.dom.parentElement;
const grip = (view) => shell(view).querySelector(".page-grip");
const dropLine = (view) => shell(view).querySelector(".page-drop");
const plus = (view) => shell(view).querySelector(".page-plus");
const pointer = (type, x, y) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  return e;
};
const slide = (view, x, y) => grip(view).dispatchEvent(pointer("pointermove", x, y));
const hover = (view, y) => shell(view).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: y }));
function press(view, y) {
  hover(view, y);
  grip(view).dispatchEvent(pointer("pointerdown", -20, y));
}
function drag(view, from, to) {
  press(view, from * ROW + 10);
  slide(view, 5, from * ROW + 18);
  slide(view, 5, to);
}
const drop = (view) => grip(view).dispatchEvent(pointer("pointerup", 0, 0));
const dropY = (view) => parseFloat(dropLine(view).style.getPropertyValue("--page-drop-y"));
const dropX = (view) => parseFloat(dropLine(view).style.getPropertyValue("--page-drop-x"));

const FOUR = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"], ["d", "paragraph", "D"]];

beforeEach(() => { counter = frameCounter(); builds.n = 0; });
afterEach(() => { counter.stop(); counter = null; });

test("a hundred pointer moves before one frame cost one hover read, one paint pass and one outline build", async () => {
  const view = page(FOUR);
  await frame();
  let hoverReads = 0;
  const hit = view.posAtCoords.bind(view);
  view.posAtCoords = (at) => { hoverReads++; return hit(at); };
  let paints = 0;
  const setProperty = plus(view).style.setProperty.bind(plus(view).style);
  plus(view).style.setProperty = (name, value, priority) => {
    if (name === "--page-text-left") paints++;
    setProperty(name, value, priority);
  };
  builds.n = 0;

  for (let i = 0; i < 100; i++) hover(view, (i % 4) * ROW + 5);

  expect(hoverReads).toBe(0);
  expect(builds.n).toBe(0);
  expect(counter.live.size).toBe(1);

  await frame();

  expect(hoverReads).toBe(1);
  expect(builds.n).toBe(1);
  expect(paints).toBe(1);
  expect(counter.live.size).toBe(0);
  expect(plus(view).style.getPropertyValue("--page-plus-top")).toBe(`${3 * ROW + 10}px`);
});

test("a drag frame on 2,000 blocks reads rectangles around the pointer, not around the document", async () => {
  const view = page([], { doc: many(2000) });
  const reads = geometry(view, rows());
  await frame();
  press(view, 10);
  slide(view, 5, 18);

  reads.n = 0;
  slide(view, 5, 1900 * ROW + 12);

  expect(reads.n).toBeGreaterThan(0);
  expect(reads.n).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(2000)) + 4);
  expect(shell(view).dataset.drop).toBe("ok");
  expect(dropY(view)).toBe(1901 * ROW - 2);
  drop(view);
});

test("a selection change reuses the document's outline", async () => {
  const view = page(FOUR);
  await frame();
  builds.n = 0;

  outlineOf(view.state.doc);
  expect(builds.n).toBe(1);

  view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
  await frame();
  drag(view, 1, 3 * ROW + 24);
  slide(view, 5, 4 * ROW + 24);

  expect(builds.n).toBe(1);
  drop(view);
  expect(shape(view)).toBe("C | D | A | B");
});

test("a remote change builds the outline again and the drop finds the span by id", () => {
  const view = page(FOUR);
  builds.n = 0;
  drag(view, 1, 3 * ROW + 24);
  expect(builds.n).toBe(1);

  const before = view.state.doc;
  view.dispatch(view.state.tr.insert(0, schema.nodes.paragraph.create({ id: "r", pos: "A0", parent: null }, schema.text("R"))).setMeta(REMOTE, true));
  expect(view.state.doc).not.toBe(before);
  geometry(view, rows());

  slide(view, 5, 4 * ROW + 12);
  expect(builds.n).toBe(2);

  drop(view);
  expect(shape(view)).toBe("R | A | C | D | B");
});

test("scrolling moves the targets with the rectangles and keeps the outline", async () => {
  const view = page(FOUR);
  await frame();
  drag(view, 0, 2 * ROW + 24);
  expect(dropY(view)).toBe(3 * ROW - 2);
  builds.n = 0;

  geometry(view, rows(-50));
  slide(view, 5, 20);
  expect(dropY(view)).toBe(3 * ROW - 50 - 2);
  expect(builds.n).toBe(0);

  geometry(view, rows(1000));
  slide(view, 5, 20);
  expect(dropY(view)).toBe(1000 - 2);
  expect(builds.n).toBe(0);
  drop(view);
});

test("a closed toggle's hidden children are never targets", () => {
  const view = page([["a", "paragraph", "A"], ["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["z", "paragraph", "Z"]]);
  drag(view, 0, 2 * ROW + 5);

  expect(shell(view).dataset.drop).toBe("ok");
  expect(dropY(view)).toBe(4 * ROW - 2);

  drop(view);
  expect(ids(view).sort()).toEqual(["a", "b1", "b2", "t", "z"]);
});

test("a closed toggle's summary is a target when the pointer is in its middle half", () => {
  const view = page([["a", "paragraph", "A"], ["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["z", "paragraph", "Z"]]);
  drag(view, 0, 42);

  expect(shell(view).dataset.drop).toBe("ok");
  expect(dropY(view)).toBe(ROW + HEIGHT + 2);
  expect(dropX(view)).toBe(27);

  drop(view);
  expect(shape(view)).toBe("T | b1<t | b2<t | A<t | Z");
});

test("the first and last gaps keep their targets", () => {
  const first = page(FOUR);
  drag(first, 2, -5);
  expect(dropY(first)).toBe(-2);
  drop(first);
  expect(shape(first)).toBe("C | A | B | D");

  const last = page(FOUR);
  drag(last, 1, 1000);
  expect(dropY(last)).toBe(3 * ROW + HEIGHT + 2);
  drop(last);
  expect(shape(last)).toBe("A | C | D | B");
});

test("a nested list's gaps are found by the search and keep their levels", () => {
  const view = page([["l0", "list_item", "a", { indent: 0 }], ["l1", "list_item", "b", { indent: 1 }], ["l2", "list_item", "c", { indent: 2 }], ["p", "paragraph", "P"], ["l3", "list_item", "e", { indent: 0 }]]);
  drag(view, 4, 3 * ROW - 6);

  expect(shell(view).dataset.drop).toBe("ok");
  expect(dropY(view)).toBe(3 * ROW - 2);
  expect(dropX(view)).toBe(0);
  slide(view, 40, 3 * ROW - 6);
  expect(dropX(view)).toBe(27);
  slide(view, 70, 3 * ROW - 6);
  expect(dropX(view)).toBe(3 * 27);

  slide(view, 40, 3 * ROW - 6);
  drop(view);
  expect(shape(view)).toBe("a | b | c | e | P");
  expect(view.state.doc.child(3).attrs.indent).toBe(1);
});

test("a cancelled drag and a disposed editor leave no frame scheduled", async () => {
  const view = page(FOUR);
  await frame();
  drag(view, 0, 2 * ROW + 24);
  expect(counter.live.size).toBeGreaterThan(0);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await frame();
  expect(counter.live.size).toBe(0);
  const ran = counter.ran.n;
  await frame();
  await frame();
  expect(counter.ran.n).toBe(ran);
  expect(dropLine(view).hidden).toBe(true);

  drag(view, 0, 2 * ROW + 24);
  view.destroy();
  expect(counter.live.size).toBe(0);
});

test("a refused move keeps the document", () => {
  const view = page([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["z", "paragraph", "Z"]]);
  const before = view.state.doc;
  drag(view, 0, ROW + 24);

  expect(shell(view).dataset.drop).toBe("none");
  expect(dropLine(view).hidden).toBe(true);
  drop(view);
  expect(view.state.doc).toBe(before);
});

test("the search finds the same line as the linear scan over two hundred positions on 2,000 blocks", () => {
  const view = page([], { doc: many(2000) });
  const table = rows();
  const ent = outlineOf(view.state.doc);
  const reference = (y) => {
    let line = null;
    for (const e of ent) {
      if (e.hidden) continue;
      const r = table(e.i);
      if (y < r.top + r.height / 2) { line = r.top - 2; break; }
      line = r.bottom + 2;
    }
    return line;
  };
  drag(view, 0, 12);

  let seed = 20261026;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let compared = 0;
  for (let i = 0; i < 200; i++) {
    const y = Math.round(next() * (2000 * ROW + 100)) - 50;
    slide(view, 5, y);
    const want = reference(y);
    expect(shell(view).dataset.drop).toBe("ok");
    expect(dropY(view)).toBe(want);
    compared++;
  }
  expect(compared).toBe(200);
  drop(view);
});
