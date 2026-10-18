import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { BlockSelection } from "../../../src/page/blocks.js";
import { selectBlocks } from "../../../src/page/blocksel.js";
import { blockMap, REMOTE } from "../../../src/page/model.js";
import { editor, posOf, select, shape } from "./view-helpers.js";

/**
 * The pointer drag from the grip, with fake layout: each block gets a 20 px high
 * rectangle every 30 px, and posAtCoords finds the block under the pointer.
 * What the browser decides (real hit testing, scrolling the page, the cursor)
 * is left to tests/browser/page-interact.test.js.
 */

afterEach(() => { document.body.innerHTML = ""; });

const ROW = 30;
function layout(view) {
  let at = 0;
  view.state.doc.forEach((n, _, i) => {
    const dom = view.nodeDOM(at);
    dom.getBoundingClientRect = () => ({ left: 0, top: i * ROW, width: 600, height: 20, right: 600, bottom: i * ROW + 20 });
    at += n.nodeSize;
  });
  view.posAtCoords = ({ top }) => {
    const i = Math.max(0, Math.min(Math.floor(top / ROW), view.state.doc.childCount - 1));
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    return { pos: pos + 1, inside: pos };
  };
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
}
function page(spec, caretId = spec[0][0]) {
  const view = editor(spec);
  layout(view);
  select(view, posOf(view, caretId));
  return view;
}
const grip = (view) => view.dom.parentElement.querySelector(".page-grip");
const shell = (view) => view.dom.parentElement;
const ptr = (type, props = {}) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: props.clientX ?? 0, clientY: props.clientY ?? 0 });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "pointerType", { value: props.pointerType ?? "mouse" });
  return e;
};
const hoverBlock = (view, i) => shell(view).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: i * ROW + 2 }));
const drag = (view, from, to, x = 5) => {
  hoverBlock(view, from);
  grip(view).dispatchEvent(ptr("pointerdown", { clientX: -20, clientY: from * ROW + 10 }));
  grip(view).dispatchEvent(ptr("pointermove", { clientX: x, clientY: from * ROW + 10 + 8 }));
  grip(view).dispatchEvent(ptr("pointermove", { clientX: x, clientY: to }));
};
const drop = (view) => grip(view).dispatchEvent(ptr("pointerup"));
const line = (view) => view.dom.parentElement.querySelector(".page-drop");
const keys = (view) => { const m = {}; view.state.doc.forEach((n) => { m[n.attrs.id] = n.attrs.pos; }); return m; };
const live = (view) => view.dom.parentElement.querySelector(".page-live").textContent;

const FOUR = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"], ["d", "paragraph", "D"]];

describe("a press on the grip", () => {
  test("a press and release without moving is a click that opens the actions menu on that block", () => {
    const view = page(FOUR);
    hoverBlock(view, 2);
    grip(view).dispatchEvent(ptr("pointerdown", { clientX: -20, clientY: 70 }));
    grip(view).dispatchEvent(ptr("pointerup", { clientX: -20, clientY: 70 }));
    expect(view.state.selection instanceof BlockSelection).toBe(true);
    expect(view.state.selection.span(view.state.doc)).toEqual({ lo: 2, hi: 2 });
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(false);
    grip(view).dispatchEvent(ptr("pointerdown"));
    grip(view).dispatchEvent(ptr("pointerup"));
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(true);
  });

  test("a keyboard activation of the grip opens the menu, and a mouse click event after a pointer click does not toggle it twice", () => {
    const view = page(FOUR);
    grip(view).dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(false);
    grip(view).dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(false);
  });

  test("movement under the slop is still a click", () => {
    const view = page(FOUR);
    grip(view).dispatchEvent(ptr("pointerdown", { clientX: 0, clientY: 0 }));
    grip(view).dispatchEvent(ptr("pointermove", { clientX: 2, clientY: 2 }));
    expect(shell(view).classList.contains("is-dragging")).toBe(false);
    grip(view).dispatchEvent(ptr("pointerup", { clientX: 2, clientY: 2 }));
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(false);
  });

  test("a touch press never drags: moving cancels it and releasing without moving is a click", () => {
    const view = page(FOUR);
    grip(view).dispatchEvent(ptr("pointerdown", { pointerType: "touch" }));
    grip(view).dispatchEvent(ptr("pointermove", { pointerType: "touch", clientX: 30, clientY: 80 }));
    expect(shell(view).classList.contains("is-dragging")).toBe(false);
    grip(view).dispatchEvent(ptr("pointerup", { pointerType: "touch" }));
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(true);
    grip(view).dispatchEvent(ptr("pointerdown", { pointerType: "touch" }));
    grip(view).dispatchEvent(ptr("pointerup", { pointerType: "touch" }));
    expect(view.dom.parentElement.querySelector(".page-menu").hidden).toBe(false);
  });
});

describe("dragging", () => {
  test("past the slop the span is block-selected, the shell says it is dragging, and a drop line shows at the gap", () => {
    const view = page(FOUR);
    drag(view, 0, 2 * ROW + 24);
    expect(shell(view).classList.contains("is-dragging")).toBe(true);
    expect(view.state.selection instanceof BlockSelection).toBe(true);
    expect(shell(view).dataset.drop).toBe("ok");
    expect(line(view).hidden).toBe(false);
    expect(line(view).style.getPropertyValue("--page-drop-y")).toBe(`${3 * ROW - 2}px`);
    drop(view);
    expect(shell(view).classList.contains("is-dragging")).toBe(false);
    expect(line(view).hidden).toBe(true);
  });

  test("dropping moves the block, rewrites only its key, announces it, and one undo puts it back", () => {
    const view = page(FOUR);
    const before = keys(view);
    drag(view, 0, 2 * ROW + 24);
    drop(view);
    expect(shape(view)).toBe("B | C | A | D");
    const after = keys(view);
    expect(Object.keys(after).filter((id) => after[id] !== before[id])).toEqual(["a"]);
    expect(live(view)).toBe("Moved 1 block");
    expect(view.state.selection.span(view.state.doc)).toEqual({ lo: 2, hi: 2 });
    history.undo(view.state, view.dispatch);
    expect(shape(view)).toBe("A | B | C | D");
  });

  test("a toggle is dragged with its body", () => {
    const view = page([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["c", "paragraph", "C"], ["d", "paragraph", "D"]]);
    drag(view, 0, 2 * ROW + 24);
    drop(view);
    expect(shape(view)).toBe("C | T | b1<t | D");
    expect(live(view)).toBe("Moved 2 blocks");
  });

  test("a grip pressed on a block inside the block selection drags the whole selection", () => {
    const view = page(FOUR);
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    layout(view);
    drag(view, 1, 3 * ROW + 24);
    drop(view);
    expect(shape(view)).toBe("C | D | A | B");
  });

  test("the pointer's x picks the nesting level at a gap, and the line moves with it", () => {
    const spec = [["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]];
    const view = page(spec);
    drag(view, 2, 2 * ROW + 2, 5);
    expect(line(view).style.getPropertyValue("--page-drop-x")).toBe("0px");
    grip(view).dispatchEvent(ptr("pointermove", { clientX: 40, clientY: 2 * ROW + 2 }));
    expect(line(view).style.getPropertyValue("--page-drop-x")).toBe("27px");
    drop(view);
    expect(shape(view)).toBe("T | b1<t | Z<t");
  });

  test("dropping where nothing would change does nothing", () => {
    const view = page(FOUR);
    const before = view.state.doc;
    drag(view, 1, ROW + 22);
    drop(view);
    expect(view.state.doc).toBe(before);
    expect(live(view)).not.toMatch(/Moved/);
  });

  test("a gap inside the span is not a target: the line is hidden and the shell says no drop", () => {
    const view = page([["t", "toggle", "T", { open: true }], ["b1", "paragraph", "b1", { parent: "t" }], ["b2", "paragraph", "b2", { parent: "t" }], ["z", "paragraph", "Z"]]);
    drag(view, 0, ROW + 24);
    expect(shell(view).dataset.drop).toBe("none");
    expect(line(view).hidden).toBe(true);
    const before = view.state.doc;
    drop(view);
    expect(view.state.doc).toBe(before);
  });

  test("Escape cancels the drag without moving anything", () => {
    const view = page(FOUR);
    const before = view.state.doc;
    drag(view, 0, 2 * ROW + 24);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(shell(view).classList.contains("is-dragging")).toBe(false);
    drop(view);
    expect(view.state.doc.eq(before)).toBe(true);
    expect(live(view)).toBe("Move cancelled");
  });

  test("the span is found again by id, so a remote edit during the drag cannot move other blocks", () => {
    const view = page(FOUR);
    drag(view, 1, 3 * ROW + 24);
    view.dispatch(view.state.tr.insert(0, view.state.schema.nodes.paragraph.create({ id: "r", pos: "A0", parent: null }, view.state.schema.text("R"))).setMeta(REMOTE, true));
    layout(view);
    grip(view).dispatchEvent(ptr("pointermove", { clientX: 5, clientY: 4 * ROW + 24 }));
    drop(view);
    expect(shape(view)).toBe("R | A | C | D | B");
  });

  test("a block deleted during the drag turns the drop into nothing", () => {
    const view = page(FOUR);
    drag(view, 1, 3 * ROW + 24);
    let off = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.delete(off, off + view.state.doc.child(1).nodeSize));
    const before = view.state.doc;
    drop(view);
    expect(view.state.doc).toBe(before);
  });
});

describe("dropping on a closed toggle's summary", () => {
  const SPEC = [["z", "paragraph", "Z"], ["c", "toggle", "C"], ["c1", "paragraph", "c1", { parent: "c" }], ["d", "paragraph", "D"]];

  test("the middle of the summary shows a line one level in, and the drop appends to its body and opens it", () => {
    const view = page(SPEC);
    drag(view, 0, ROW + 10);
    expect(shell(view).dataset.drop).toBe("ok");
    expect(line(view).style.getPropertyValue("--page-drop-x")).toBe("27px");
    drop(view);
    expect(shape(view)).toBe("C | c1<c | Z<c | D");
    expect(view.state.doc.child(0).attrs.open).toBe(true);
  });

  test("one undo takes the block out again and closes the toggle", () => {
    const view = page(SPEC);
    drag(view, 0, ROW + 10);
    drop(view);
    history.undo(view.state, view.dispatch);
    expect(shape(view)).toBe("Z | C | c1<c | D");
    expect(view.state.doc.child(1).attrs.open).toBe(false);
  });

  test("the top or bottom quarter of the summary is the gap before or after it, not a drop into it", () => {
    const view = page(SPEC);
    drag(view, 0, ROW + 1);
    drop(view);
    expect(shape(view)).toBe("Z | C | c1<c | D");
    expect(view.state.doc.child(1).attrs.open).toBe(false);
  });

  test("an open toggle's summary is not a drop into it: the drop lands at the gap before its first body block", () => {
    const view = page([["z", "paragraph", "Z"], ["c", "toggle", "C", { open: true }], ["c1", "paragraph", "c1", { parent: "c" }]]);
    drag(view, 0, ROW + 10);
    drop(view);
    expect(view.state.doc.child(0).attrs.open).toBe(true);
    expect(shape(view)).toBe("C | Z<c | c1<c");
  });
});

describe("auto-scroll", () => {
  test("holding the pointer near the bottom edge of the scrolling parent scrolls it", async () => {
    const view = page(FOUR);
    const parent = view.dom.parentElement.parentElement;
    parent.style.overflowY = "auto";
    let top = 0;
    Object.defineProperty(parent, "scrollTop", { configurable: true, get: () => top, set: (v) => { top = v; } });
    Object.defineProperty(parent, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(parent, "clientHeight", { configurable: true, value: 300 });
    parent.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 300, right: 600, bottom: 300 });
    drag(view, 0, 290);
    for (let i = 0; i < 200 && top === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(top).toBeGreaterThan(0);
    drop(view);
    const stopped = top;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(top).toBe(stopped);
  });
});

describe("the editor around it", () => {
  test("a native dragstart on a block selection is cancelled, and block moves never go through the paste path", () => {
    const view = page(FOUR);
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 1)));
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test("a native dragstart over a text selection is left alone", () => {
    const view = page(FOUR);
    select(view, posOf(view, "a"), posOf(view, "a", true));
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test("blockMap keeps working after a drop (ids unchanged)", () => {
    const view = page(FOUR);
    drag(view, 0, 2 * ROW + 24);
    drop(view);
    expect(Object.keys(blockMap(view.state.doc)).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
