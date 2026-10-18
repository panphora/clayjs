import { editor, key, posOf, select, shape } from "./view-helpers.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";

/**
 * The gutter follows the hovered block: the plus and the grip sit on its first
 * line, a plus pick lands after it, and a grip click selects it and opens the
 * actions menu. jsdom has no layout, so each block gets a fake rectangle and
 * posAtCoords reads them.
 */

afterEach(() => { document.body.innerHTML = ""; });

const ROW = 30;
function gutter(spec, caretId = spec[0][0]) {
  const view = editor(spec);
  let at = 0;
  view.state.doc.forEach((n, _, i) => {
    const dom = view.nodeDOM(at);
    dom.getBoundingClientRect = () => ({ left: 100, top: i * ROW, width: 600, height: 20, right: 700, bottom: i * ROW + 20 });
    at += n.nodeSize;
  });
  view.posAtCoords = ({ top }) => {
    const i = Math.min(Math.floor(top / ROW), view.state.doc.childCount - 1);
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    return { pos: pos + 1, inside: pos };
  };
  view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 });
  select(view, posOf(view, caretId));
  return view;
}
const part = (view, cls) => view.dom.parentElement.querySelector(cls);
const move = (view, y) => view.dom.parentElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: y }));
const top = (view, cls) => part(view, cls).style.getPropertyValue("--page-plus-top");

const DOC = [["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"]];

test("at rest the plus and the grip sit on the caret's block", () => {
  const view = gutter(DOC, "b");
  expect(top(view, ".page-plus")).toBe("40px");
  expect(top(view, ".page-grip")).toBe("40px");
  expect(part(view, ".page-grip").getAttribute("aria-label")).toBe("Block actions");
  expect(part(view, ".page-grip").getAttribute("aria-haspopup")).toBe("menu");
});

test("moving the pointer over a block moves both buttons to its first line, and leaving the page puts them back", () => {
  const view = gutter(DOC, "a");
  expect(top(view, ".page-plus")).toBe("10px");
  move(view, 2 * ROW + 5);
  expect(top(view, ".page-plus")).toBe("70px");
  expect(top(view, ".page-grip")).toBe("70px");
  view.dom.parentElement.dispatchEvent(new MouseEvent("mouseleave"));
  expect(top(view, ".page-plus")).toBe("10px");
});

test("typing makes the gutter follow the caret again", () => {
  const view = gutter(DOC, "a");
  move(view, 2 * ROW);
  expect(top(view, ".page-grip")).toBe("70px");
  view.dom.parentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
  expect(top(view, ".page-grip")).toBe("10px");
});

test("a block inside a closed toggle is skipped: the gutter stays on the toggle", () => {
  const view = gutter([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]], "z");
  move(view, ROW + 2);
  expect(top(view, ".page-grip")).toBe("10px");
});

test("the plus inserts after the hovered block, not the caret's", () => {
  const view = gutter(DOC, "a");
  move(view, ROW + 2);
  part(view, ".page-plus").click();
  const rows = [...view.dom.parentElement.querySelectorAll(".page-menu-item")];
  rows[1].click();
  expect(shape(view)).toBe("A | B | heading | C");
});

test("the hover does not move while the menu is open", () => {
  const view = gutter(DOC, "a");
  move(view, ROW + 2);
  part(view, ".page-plus").click();
  move(view, 2 * ROW + 2);
  expect(top(view, ".page-grip")).toBe("40px");
});

test("a grip click selects the hovered block with its subtree and opens the actions menu under the grip", () => {
  const view = gutter([["t", "toggle", "T"], ["b1", "paragraph", "b1", { parent: "t" }], ["z", "paragraph", "Z"]], "z");
  move(view, 2);
  part(view, ".page-grip").click();
  const { lo, hi } = view.state.selection.span(view.state.doc);
  expect([lo, hi]).toEqual([0, 1]);
  expect(part(view, ".page-menu").hidden).toBe(false);
  expect(part(view, ".page-grip").getAttribute("aria-expanded")).toBe("true");
  expect(part(view, ".page-grip").classList.contains("is-on")).toBe(true);
  part(view, ".page-grip").click();
  expect(part(view, ".page-menu").hidden).toBe(true);
  expect(part(view, ".page-grip").getAttribute("aria-expanded")).toBe("false");
});

test("a grip click on a block inside the current block selection keeps the whole selection", () => {
  const view = gutter(DOC, "a");
  key(view, "Escape");
  key(view, "ArrowDown", { shiftKey: true });
  move(view, 2);
  part(view, ".page-grip").click();
  expect(view.state.selection.span(view.state.doc)).toEqual({ lo: 0, hi: 1 });
});

test("Move down from the grip's menu moves the hovered block", () => {
  const view = gutter(DOC, "c");
  move(view, 2);
  part(view, ".page-grip").click();
  [...view.dom.parentElement.querySelectorAll(".page-menu-item")].find((r) => r.textContent.includes("Move down")).click();
  expect(shape(view)).toBe("B | A | C");
});

test.each(["plus", "grip"])("F17 the phone %s acts on the caret despite retained hover", (control) => {
  const media = window.matchMedia;
  const view = gutter(DOC, "a");
  try {
    move(view, 2 * ROW + 2);
    window.matchMedia = () => ({ matches: true });
    part(view, `.page-${control}`).click();
    if (control === "plus") {
      part(view, ".page-menu-item:nth-child(2)").click();
      expect(shape(view)).toBe("A | heading | B | C");
    } else expect(view.state.selection.span(view.state.doc)).toEqual({ lo: 0, hi: 0 });
  } finally { window.matchMedia = media; view.destroy(); }
});

test("a selected divider, image or file keeps the plus and the grip beside it, not on the block below", () => {
  for (const atom of [["d", "divider", ""], ["i", "image", "", { src: "https://example.com/a.png" }], ["f", "file", "", { src: "https://example.com/a.pdf", name: "a.pdf" }]]) {
    const view = gutter([["a", "paragraph", "A"], atom, ["c", "paragraph", "C"]]);
    const caretTop = top(view, ".page-plus");
    select(view, posOf(view, "c"));
    const below = top(view, ".page-plus");
    view.dispatch(view.state.tr.setSelection(pmState.NodeSelection.create(view.state.doc, view.state.doc.child(0).nodeSize)));
    expect([atom[1], top(view, ".page-plus"), top(view, ".page-grip")]).not.toEqual([atom[1], below, below]);
    expect(top(view, ".page-plus")).not.toBe(caretTop);
    document.body.innerHTML = "";
  }
});
