import { editor, posOf, select } from "./view-helpers.js";
import { selectBlocks } from "../../../src/page/blocksel.js";

/**
 * The chrome reads layout in one batched pass per frame: transactions, hover,
 * resize, viewport changes and menu placement all schedule, and only the frame
 * touches geometry. jsdom has no layout, so each block's rectangle is a stub
 * that counts its own reads, and style writes are counted at setProperty.
 */

let realSet, realRaf;
// ProseMirror reads the editor element's own rectangle once per transaction, so
// the chrome's reads are counted on the shell and on each block instead. Only
// the chrome's own --page-* writes are counted; jsdom writes a few of its own
// when getComputedStyle resolves.
const counts = { shell: 0, blocks: 0, coords: 0, hits: 0, writes: 0, frames: 0 };
beforeAll(() => { document.elementFromPoint = () => null; });
afterAll(() => { delete document.elementFromPoint; });
beforeEach(() => {
  for (const k of Object.keys(counts)) counts[k] = 0;
  realSet = CSSStyleDeclaration.prototype.setProperty;
  realRaf = window.requestAnimationFrame;
  CSSStyleDeclaration.prototype.setProperty = function (name, ...rest) {
    if (String(name).startsWith("--page-")) counts.writes++;
    return realSet.call(this, name, ...rest);
  };
  window.requestAnimationFrame = function (cb) { counts.frames++; return realRaf.call(window, cb); };
});
afterEach(() => {
  CSSStyleDeclaration.prototype.setProperty = realSet;
  window.requestAnimationFrame = realRaf;
  document.body.innerHTML = "";
});
const frame = () => new Promise((done) => realRaf.call(window, () => done()));
const reset = () => { for (const k of Object.keys(counts)) counts[k] = 0; };
const part = (view, cls) => view.dom.parentElement.querySelector(cls);
const top = (view, cls) => part(view, cls).style.getPropertyValue("--page-plus-top");

// Each block reports a first line that moves down with the text it gained, so
// a frame that painted an older view would land on an older line.
function gutter(spec, caretId = spec[0][0]) {
  const view = editor(spec);
  view.dom.parentElement.getBoundingClientRect = () => { counts.shell++; return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; };
  view.dom.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400 });
  let at = 0;
  view.state.doc.forEach((n, _, i) => {
    view.nodeDOM(at).getBoundingClientRect = () => {
      counts.blocks++;
      const grown = (view.state.doc.child(i).textContent.length - spec[i][2].length) * 5;
      return { left: 100, top: 10 * i + grown, width: 600, height: 20, right: 700, bottom: 30 + grown };
    };
    at += n.nodeSize;
  });
  view.coordsAtPos = () => { counts.coords++; return { left: 40, right: 48, top: 100, bottom: 120 }; };
  view.posAtCoords = () => { counts.hits++; return { pos: 1, inside: 0 }; };
  select(view, posOf(view, caretId));
  return view;
}

test("twenty transactions before one frame read and paint once, for the newest view", async () => {
  const view = gutter([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);
  await frame();
  reset();
  for (let i = 0; i < 20; i++) view.dispatch(view.state.tr.insertText("x", view.state.selection.head));
  expect(view.state.doc.child(0).textContent).toHaveLength(21);
  expect(counts.frames).toBe(1);
  expect([counts.shell, counts.blocks, counts.coords, counts.writes]).toEqual([0, 0, 0, 0]);
  await frame();
  expect([counts.shell, counts.blocks, counts.coords, counts.writes]).toEqual([1, 1, 0, 5]);
  expect(top(view, ".page-plus")).toBe("110px");
  expect(top(view, ".page-grip")).toBe("110px");
  expect(part(view, ".page-plus").style.getPropertyValue("--page-text-left")).toBe("0px");
});

test("hover, resize, viewport changes and a menu opening share the same frame", async () => {
  const viewport = new EventTarget();
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  try {
    const view = gutter([["a", "paragraph", "A"], ["b", "paragraph", "B"], ["c", "paragraph", "C"]]);
    await frame();
    reset();
    view.dom.parentElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 10 }));
    view.dom.parentElement.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 30 }));
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    part(view, ".page-plus").click();
    expect(counts.frames).toBe(1);
    expect([counts.shell, counts.blocks, counts.coords, counts.hits, counts.writes]).toEqual([0, 0, 0, 0, 0]);
    await frame();
    expect([counts.shell, counts.blocks, counts.hits]).toEqual([1, 2, 1]);
    expect(counts.writes).toBeGreaterThan(0);
  } finally {
    delete window.visualViewport;
  }
});

test("a destroyed chrome cancels its frame: no geometry read and no style write", async () => {
  const view = gutter([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);
  await frame();
  reset();
  view.dispatch(view.state.tr.insertText("x", view.state.selection.head));
  expect(counts.frames).toBe(1);
  view.destroy();
  await frame();
  expect([counts.shell, counts.blocks, counts.writes]).toEqual([0, 0, 0]);
});

test("the visual viewport and window listeners go away with the chrome", async () => {
  const viewport = new EventTarget();
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  try {
    const view = gutter([["a", "paragraph", "A"]]);
    view.destroy();
    reset();
    viewport.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
    expect(counts.frames).toBe(0);
  } finally {
    delete window.visualViewport;
  }
});

test("command pressed state and the menu selection are correct before the frame", () => {
  const view = gutter([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);
  select(view, posOf(view, "a"), posOf(view, "a") + 1);
  view.dispatch(view.state.tr.addMark(posOf(view, "a"), posOf(view, "a") + 1, view.state.schema.marks.strong.create()));
  expect(part(view, '.page-dock [data-cmd="strong"]').getAttribute("aria-pressed")).toBe("true");
  view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
  part(view, ".page-grip").click();
  const rows = [...part(view, ".page-menu").querySelectorAll(".page-menu-item")];
  expect(rows[0].getAttribute("aria-selected")).toBe("true");
  expect(rows[0].getAttribute("tabindex")).toBe("0");
  expect(document.activeElement).toBe(rows[0]);
});
