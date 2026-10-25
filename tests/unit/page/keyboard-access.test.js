import { BlockSelection } from "../../../src/page/blocks.js";
import { editor, key, keyOn, posOf, select } from "./view-helpers.js";

/**
 * A keyboard user has to be able to leave the writing surface without a mouse.
 * Escape closes what is open, then hands focus to the toolbar; the toolbar walks
 * with Left and Right and hands it back, and Tab is never taken away.
 */

afterEach(() => { document.body.innerHTML = ""; });

const part = (view, cls) => view.dom.parentElement.querySelector(cls);
const dock = (view) => part(view, ".page-dock");
const controls = (view) => [...dock(view).querySelectorAll("button")];
const primary = (view) => [...dock(view).querySelectorAll(".page-tool-primary")];
const phone = (run) => {
  const media = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query === "(max-width: 560px)", media: query, addEventListener() {}, removeEventListener() {} });
  try { return run(); } finally { window.matchMedia = media; }
};

const DOC = [["a", "paragraph", "A"], ["b", "paragraph", "B"]];

test("Escape with nothing open selects the caret's block and leaves the keyboard in the editor", () => {
  const view = editor(DOC);
  select(view, posOf(view, "b"));
  key(view, "Escape");
  expect(view.state.selection instanceof BlockSelection).toBe(true);
  expect(document.activeElement).not.toBe(controls(view)[0]);
});

test("Escape from a block selection focuses the first toolbar control", async () => {
  const view = editor(DOC);
  view.focus();
  select(view, posOf(view, "b"));
  key(view, "Escape");
  key(view, "Escape");
  await Promise.resolve();
  expect(document.activeElement).toBe(controls(view)[0]);
  // The block the person was on is still the one the model names.
  expect(view.state.selection.$head.parent.textContent).toBe("B");
});

test("Escape closes an open menu before it moves focus", () => {
  const view = editor(DOC);
  view.focus();
  part(view, ".page-tool-turn").click();
  expect(part(view, ".page-menu").hidden).toBe(false);
  key(view, "Escape");
  expect(part(view, ".page-menu").hidden).toBe(true);
  expect(document.activeElement).toBe(part(view, ".page-tool-turn"));
});

test("the toolbar is one tab stop, and the arrows walk it", () => {
  const view = editor(DOC);
  const list = controls(view);
  expect(list.filter((b) => b.tabIndex === 0)).toHaveLength(1);
  expect(list[0].tabIndex).toBe(0);
  expect(list.slice(1).every((b) => b.tabIndex === -1)).toBe(true);

  keyOn(list[0], "ArrowRight");
  expect(document.activeElement).toBe(list[1]);
  expect([list[0].tabIndex, list[1].tabIndex]).toEqual([-1, 0]);
  keyOn(list[1], "ArrowLeft");
  expect(document.activeElement).toBe(list[0]);
  keyOn(list[0], "ArrowLeft");
  expect(document.activeElement).toBe(list[list.length - 1]);
  expect(list.filter((b) => b.tabIndex === 0)).toHaveLength(1);
});

test("Escape from the toolbar returns to the editor, and Tab is left to the browser", async () => {
  const view = editor(DOC);
  view.focus();
  select(view, posOf(view, "a"));
  key(view, "Escape");
  key(view, "Escape");
  await Promise.resolve();
  const first = controls(view)[0];
  expect(document.activeElement).toBe(first);
  const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  first.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(false);
  keyOn(first, "Escape");
  expect(document.activeElement).toBe(view.dom);
});

test("a phone walks only its four controls and skips the desktop-only ones", () => {
  phone(() => {
    const view = editor(DOC);
    const list = primary(view);
    expect(list).toHaveLength(4);
    expect(list.filter((b) => b.tabIndex === 0)).toEqual([list[0]]);
    for (const hidden of dock(view).querySelectorAll(".page-tool-desk")) expect(hidden.tabIndex).toBe(-1);
    keyOn(list[0], "ArrowRight");
    keyOn(list[1], "ArrowRight");
    keyOn(list[2], "ArrowRight");
    expect(document.activeElement).toBe(list[3]);
    keyOn(list[3], "ArrowRight");
    expect(document.activeElement).toBe(list[0]);
  });
});
