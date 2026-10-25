import { selectBlocks } from "../../../src/page/blocksel.js";
import { editor, key, posOf, select, shape, typeText } from "./view-helpers.js";

/**
 * What a menu targets: the current type a Turn into row marks, where focus goes
 * while a menu is open, and the block ids a command resolves against the
 * document at the moment it runs.
 */

afterEach(() => { document.body.innerHTML = ""; });

const COORDS = { left: 40, right: 48, top: 100, bottom: 120 };
const open = (spec, id = spec[0][0], end = true, options = {}) => {
  const view = editor(spec, options);
  view.coordsAtPos = () => COORDS;
  select(view, posOf(view, id, end));
  return view;
};
const shell = (view) => view.dom.parentElement;
const part = (view, cls) => shell(view).querySelector(cls);
const menu = (view) => part(view, ".page-menu");
const rows = (view) => [...menu(view).querySelectorAll(".page-menu-item")];
const label = (view, text) => rows(view).find((r) => r.querySelector(".page-menu-label").textContent === text);
const labels = (view) => rows(view).map((r) => r.querySelector(".page-menu-label").textContent);
const type = (view, text) => { for (const ch of text) typeText(view, ch); };
const isOpen = (view) => !menu(view).hidden;
const live = (view) => part(view, ".page-live").textContent;
const chromeOf = (view) => view.pluginViews.find((pv) => pv && pv.menuEl);
const types = (view) => { const out = []; view.state.doc.forEach((n) => out.push(n.type.name)); return out; };
const checked = (view) => rows(view).filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.querySelector(".page-menu-label").textContent);
const deferred = () => {
  let settle;
  const gate = new Promise((ok) => { settle = ok; });
  return { gate, settle, features: { ensure: () => gate, has: () => false, dispose() {} } };
};

describe("the current type", () => {
  test("Turn into marks the current type and only that type, apart from the keyboard's active row", () => {
    const view = open([["p", "paragraph", "P"]]);
    part(view, ".page-tool-turn").click();
    expect(rows(view).map((r) => r.getAttribute("role"))).toEqual(rows(view).map(() => "menuitemradio"));
    expect(checked(view)).toEqual(["Text"]);
    expect(label(view, "Heading 1").getAttribute("aria-checked")).toBe("false");
    expect(label(view, "Text").classList.contains("is-active")).toBe(true);
    key(view, "ArrowDown");
    expect(checked(view)).toEqual(["Text"]);
    expect(label(view, "Heading 1").classList.contains("is-active")).toBe(true);
    expect(label(view, "Text").classList.contains("is-active")).toBe(false);
  });

  test("a block selection of one type checks that type", () => {
    const view = open([["a", "heading", "A", { level: 2 }], ["b", "heading", "B", { level: 2 }]], "a");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    part(view, ".page-tool-turn").click();
    expect(checked(view)).toEqual(["Heading 2"]);
  });

  test("a selection that mixes types checks no row", () => {
    const view = open([["a", "paragraph", "A"], ["h", "heading", "H", { level: 2 }], ["z", "paragraph", "Z"]], "a");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    part(view, ".page-tool-turn").click();
    expect(labels(view).length).toBe(10);
    expect(checked(view)).toEqual([]);
    expect(rows(view).every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
  });

  test("a selected toggle with its body counts as one Toggle, not as a mixed selection", () => {
    const view = open([["t", "toggle", "T", { open: true }], ["b", "paragraph", "body", { parent: "t" }], ["z", "paragraph", "Z"]], "t");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    part(view, ".page-tool-turn").click();
    expect(checked(view)).toEqual(["Toggle"]);
  });
});

describe("focus and popup semantics", () => {
  test("a slash menu is a listbox on the editor, which keeps focus", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/");
    expect(menu(view).getAttribute("role")).toBe("listbox");
    expect(rows(view).map((r) => r.getAttribute("role"))).toEqual(rows(view).map(() => "option"));
    expect(rows(view).map((r) => r.getAttribute("tabindex"))).toEqual(rows(view).map(() => "-1"));
    expect(menu(view).contains(document.activeElement)).toBe(false);
    expect(view.dom.getAttribute("aria-haspopup")).toBe("listbox");
    expect(view.dom.getAttribute("aria-controls")).toBe(menu(view).id);
    expect(view.dom.getAttribute("aria-activedescendant")).toBe(`${menu(view).id}-0`);
  });

  test("a slash menu puts the editor's own aria attributes back when it closes", () => {
    const view = open([["e", "paragraph", ""]]);
    view.dom.setAttribute("aria-haspopup", "dialog");
    view.dom.setAttribute("aria-controls", "elsewhere");
    view.dom.setAttribute("aria-activedescendant", "other");
    type(view, "/");
    expect(view.dom.getAttribute("aria-haspopup")).toBe("listbox");
    expect(view.dom.getAttribute("aria-controls")).toBe(menu(view).id);
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(menu(view).contains(document.activeElement)).toBe(false);
    expect(view.dom.getAttribute("aria-haspopup")).toBe("dialog");
    expect(view.dom.getAttribute("aria-controls")).toBe("elsewhere");
    expect(view.dom.getAttribute("aria-activedescendant")).toBe("other");
  });

  test("an explicit menu focuses its active row and Escape returns focus to the control that opened it", () => {
    const view = open([["p", "paragraph", "P"]]);
    const turn = part(view, ".page-tool-turn");
    turn.click();
    expect(menu(view).getAttribute("role")).toBe("menu");
    expect(document.activeElement).toBe(rows(view)[0]);
    expect(rows(view)[0].getAttribute("tabindex")).toBe("0");
    expect(rows(view)[1].getAttribute("tabindex")).toBe("-1");
    key(view, "ArrowDown");
    expect(document.activeElement).toBe(rows(view)[1]);
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(document.activeElement).toBe(turn);
  });

  test("Escape returns focus to the plus that opened the insert menu", () => {
    const view = open([["p", "paragraph", "P"]]);
    const plus = part(view, ".page-plus");
    plus.click();
    expect(document.activeElement).toBe(rows(view)[0]);
    key(view, "Escape");
    expect(isOpen(view)).toBe(false);
    expect(document.activeElement).toBe(plus);
  });

  test("a composing Enter or keyCode 229 never picks a row", () => {
    const view = open([["e", "paragraph", ""]]);
    type(view, "/h1");
    const before = view.state.doc;
    key(view, "Enter", { isComposing: true });
    key(view, "Enter", { keyCode: 229 });
    expect(view.state.doc).toBe(before);
    expect(isOpen(view)).toBe(true);
    expect(view.state.doc.textContent).toBe("/h1");
  });

  test("a composing Enter leaves a focused menu row unpicked", () => {
    const view = open([["p", "paragraph", "P"]]);
    part(view, ".page-tool-turn").click();
    const before = view.state.doc;
    rows(view)[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }));
    expect(view.state.doc).toBe(before);
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
  });
});

describe("the ids a command resolves", () => {
  test("a menu keeps the ids of the blocks it opened on, not the block under the selection now", () => {
    const view = open([["a", "paragraph", "A"], ["b", "paragraph", "B"]], "b");
    part(view, ".page-tool-turn").click();
    expect(chromeOf(view).menu.ids).toEqual(["b"]);
    select(view, posOf(view, "a") + 1);
    expect(isOpen(view)).toBe(true);
    label(view, "Heading 1").click();
    expect(types(view)).toEqual(["paragraph", "heading"]);
    expect(view.state.doc.child(0).textContent).toBe("A");
    expect(view.state.doc.child(1).attrs.id).toBe("b");
    expect(view.state.doc.child(1).attrs.level).toBe(1);
  });

  test("a block selection keeps every id it opened on", () => {
    const view = open([["a", "paragraph", "A"], ["b", "paragraph", "B"], ["z", "paragraph", "Z"]], "a");
    view.dispatch(view.state.tr.setSelection(selectBlocks(view.state.doc, 0, 1)));
    part(view, ".page-tool-turn").click();
    expect(chromeOf(view).menu.ids).toEqual(["a", "b"]);
    select(view, posOf(view, "z"));
    label(view, "Heading 3").click();
    expect(types(view)).toEqual(["heading", "heading", "paragraph"]);
    expect([...Array(3).keys()].map((i) => view.state.doc.child(i).attrs.id)).toEqual(["a", "b", "z"]);
    expect(shape(view)).toBe("A | B | Z");
  });

  test("a command whose anchor a peer removed cancels and announces instead of filling the index it left", () => {
    const view = open([["x", "paragraph", "X"], ["p", "paragraph", ""], ["z", "paragraph", "Z"]]);
    const chrome = chromeOf(view);
    const plus = part(view, ".page-plus");
    chrome.openMenu("insert", plus, null, null, "p");
    const at = posOf(view, "p") - 1;
    view.dispatch(view.state.tr.delete(at, at + view.state.doc.child(1).nodeSize));
    expect(shape(view)).toBe("X | Z");
    expect(isOpen(view)).toBe(false);
    chrome.openMenu("insert", plus, null, null, "p");
    label(view, "Table").click();
    expect(shape(view)).toBe("X | Z");
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
    expect(live(view)).toBe("That block is no longer available.");
  });

  test("a pick inserts once, right away, and a settling feature import runs no command again", async () => {
    const features = deferred();
    const view = open([["p", "paragraph", ""], ["z", "paragraph", "Z"]], "p", true, { features: features.features });
    const chrome = chromeOf(view);
    chrome.openMenu("insert", part(view, ".page-plus"), null, null, "p");
    label(view, "Table").click();
    expect(shape(view)).toBe("table | Z");
    const afterPick = view.state.doc;
    features.settle();
    await features.gate;
    await Promise.resolve();
    expect(view.state.doc).toBe(afterPick);
    expect(shape(view)).toBe("table | Z");
  });

  test("an anchor removed while a feature import is pending inserts nothing and replays nothing", async () => {
    const features = deferred();
    const view = open([["p", "paragraph", ""], ["z", "paragraph", "Z"]], "p", true, { features: features.features });
    const chrome = chromeOf(view);
    const plus = part(view, ".page-plus");
    chrome.openMenu("insert", plus, null, null, "p");
    label(view, "Table").click();
    const inserted = view.state.doc;
    view.dispatch(view.state.tr.delete(0, inserted.child(0).nodeSize));
    expect(shape(view)).toBe("Z");
    chrome.openMenu("insert", plus, null, null, "p");
    label(view, "Table").click();
    expect(shape(view)).toBe("Z");
    features.settle();
    await features.gate;
    await Promise.resolve();
    expect(shape(view)).toBe("Z");
    expect(live(view)).toBe("That block is no longer available.");
  });
});
