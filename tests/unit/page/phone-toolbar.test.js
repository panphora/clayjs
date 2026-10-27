globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import * as Y from "../../../src/vendor/yjs.vendor.js";
import { identityPlugin } from "../../../src/page/model.js";
import { state as pmState, view as pmView } from "../../../src/vendor/prosemirror.vendor.js";
import { createPageDoc, createBridge, keepViewPos, seedFrom, docOf, walk } from "../../../src/page/ybind/index.js";
import { REMOTE_META } from "../../../src/page/ybind/layout.js";
import { MOVE } from "../../../src/page/blocks.js";
import { chromePlugin, phoneViewport, phoneBarBox } from "../../../src/page/chrome.js";
import { PAGE_EDITOR_CSS } from "../../../src/page/editor.js";
import { editor, posOf, select, shape } from "./view-helpers.js";

/**
 * A phone's keyboard shrinks the visual viewport and can pan it, so the toolbar
 * is placed from that rectangle rather than from a bottom inset. These are the
 * arithmetic of that placement, the structure of the four controls it keeps, and
 * the proof that its Move command is the same validated page move as the menus'.
 */

afterEach(() => { document.body.innerHTML = ""; });

const phoneCss = () => {
  const start = PAGE_EDITOR_CSS.indexOf("@media (max-width: 560px)");
  const end = PAGE_EDITOR_CSS.indexOf("@media (prefers-reduced-motion", start);
  return PAGE_EDITOR_CSS.slice(start, end < 0 ? undefined : end);
};

const withPhone = async (run, viewport = { offsetLeft: 0, offsetTop: 0, width: 390, height: 844 }) => {
  const media = window.matchMedia;
  const vv = window.visualViewport;
  window.matchMedia = (query) => ({ matches: query === "(max-width: 560px)", media: query, addEventListener() {}, removeEventListener() {} });
  window.visualViewport = { ...viewport, addEventListener() {}, removeEventListener() {} };
  try {
    return await run();
  } finally {
    window.matchMedia = media;
    window.visualViewport = vv;
  }
};

// Placement happens in the frame's measure and paint pass, so the tests read it
// after one frame.
const frame = () => new Promise((done) => window.requestAnimationFrame(() => done()));

const dock = (view) => view.dom.parentElement.querySelector(".page-dock");
const menu = (view) => view.dom.parentElement.querySelector(".page-menu");
const rows = (view) => [...menu(view).querySelectorAll(".page-menu-item")];
const row = (view, label) => rows(view).find((r) => r.querySelector(".page-menu-label").textContent === label);

test("the bar centres itself inside a 390 px viewport, just above its bottom edge", () => {
  expect(phoneBarBox({ left: 0, top: 0, width: 390, height: 844 }, 204, 52)).toEqual({ left: 93, top: 784, width: 204 });
});

test("a 320 px viewport still fits the four 44 px controls with their gaps and padding", () => {
  const box = phoneBarBox({ left: 0, top: 0, width: 320, height: 568 }, 204, 52);
  expect(box).toEqual({ left: 58, top: 508, width: 204 });
  expect(4 * 44 + 3 * 4 + 16).toBe(204);
});

test("an open keyboard raises the bar to the visible bottom", () => {
  expect(phoneBarBox({ left: 0, top: 0, width: 390, height: 500 }, 204, 52)).toEqual({ left: 93, top: 440, width: 204 });
});

test("a panned visual viewport keeps the bar inside the part on screen, not the layout viewport", () => {
  const v = { left: 0, top: 120, width: 390, height: 400 };
  expect(phoneBarBox(v, 204, 52)).toEqual({ left: 93, top: 460, width: 204 });
  expect(phoneBarBox({ ...v, left: 12 }, 204, 52).left).toBe(105);
});

test("a safe-area inset lifts the bar off the home indicator", () => {
  expect(phoneBarBox({ left: 0, top: 0, width: 390, height: 844 }, 204, 52, 34)).toEqual({ left: 93, top: 750, width: 204 });
});

test("a viewport too short for the bar keeps it at the top inset instead of off screen", () => {
  expect(phoneBarBox({ left: 0, top: 0, width: 390, height: 40 }, 204, 52)).toEqual({ left: 93, top: 8, width: 204 });
});

test("a zoomed narrow viewport narrows the bar to its own edges", () => {
  expect(phoneBarBox({ left: 0, top: 0, width: 200, height: 700 }, 204, 52)).toEqual({ left: 8, top: 640, width: 184 });
});

test("without a visual viewport the layout viewport stands in", () => {
  const win = {};
  Object.assign(win, { innerWidth: 390, innerHeight: 844 });
  expect(phoneViewport(win)).toEqual({ left: 0, top: 0, width: 390, height: 844 });
  expect(phoneViewport({ innerWidth: 1, innerHeight: 2, visualViewport: { offsetLeft: 5, offsetTop: 6, width: 7, height: 8 } }))
    .toEqual({ left: 5, top: 6, width: 7, height: 8 });
});

test("the phone bar draws exactly four primary controls in order, labelled", () => {
  const view = editor([["a", "paragraph", "A"]]);
  const primary = [...dock(view).querySelectorAll(".page-tool-primary")];
  expect(primary.map((b) => b.dataset.cmd ?? "more")).toEqual(["strong", "em", "link", "more"]);
  expect(primary.map((b) => b.getAttribute("aria-label"))).toEqual(["Bold", "Italic", "Link", "More"]);
  expect(dock(view).querySelector(".page-tool-more").textContent).toBe("");
  // The desktop tools are still there, marked so only the phone hides them.
  expect([...dock(view).querySelectorAll("[data-cmd]")].map((b) => b.dataset.cmd))
    .toEqual(["strong", "em", "strike", "link", "bullet", "ordered", "check", "code"]);
  expect(dock(view).querySelectorAll(".page-tool-desk").length).toBeGreaterThan(0);
});

test("the phone stylesheet keeps 44 px targets, 4 px gaps, 8 px padding and one bar", () => {
  const css = phoneCss();
  expect(css).toContain(".page-dock .page-tool { min-width: 44px; height: 44px; }");
  expect(css).toContain("gap: 4px");
  expect(css).toContain("padding: 8px");
  expect(css).toContain("min-width: 204px");
  expect(css).toContain(".page-tool-desk { display: none; }");
  expect(css).toContain(".page-dock .page-tool-more { display: inline-flex; }");
  // One bar: the selection bubble stands down and the dock stays visible.
  expect(css).toContain(".page-bubble { display: none; }");
  expect(css).toContain(".page-shell:has(.page-bubble:not([hidden])) .page-dock { visibility: visible; }");
  expect(PAGE_EDITOR_CSS).toContain(".page-safe-probe { position: fixed; left: 0; bottom: 0; width: 0; height: 0; padding-bottom: env(safe-area-inset-bottom);");
});

test("the bar is fixed to the visible viewport and follows it", async () => {
  await withPhone(async () => {
    const view = editor([["a", "paragraph", "A"]]);
    await frame();
    expect([dock(view).style.left, dock(view).style.top, dock(view).style.width]).toEqual(["93px", "784px", "204px"]);
    window.visualViewport.height = 500;
    window.visualViewport.offsetTop = 40;
    window.dispatchEvent(new Event("resize"));
    await frame();
    expect([dock(view).style.left, dock(view).style.top]).toEqual(["93px", "480px"]);
  });
});

test("the More menu stays inside the visible viewport, above the bar", async () => {
  await withPhone(async () => {
    const view = editor([["a", "paragraph", "A"]]);
    dock(view).querySelector(".page-tool-more").click();
    await frame();
    const box = menu(view);
    expect(box.hidden).toBe(false);
    const x = parseFloat(box.style.getPropertyValue("--page-pop-x"));
    const y = parseFloat(box.style.getPropertyValue("--page-pop-y"));
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + parseFloat(box.style.getPropertyValue("--page-pop-width"))).toBeLessThanOrEqual(390);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(784);
    expect(box.style.getPropertyValue("--page-pop-max")).toBe("828px");
    expect(phoneCss()).toContain("max-height: min(70vh, var(--page-pop-max, 70vh))");
    expect(phoneCss()).toContain("overflow-y: auto");
  });
});

test("the More menu carries the rest of the formatting and the block actions", () => {
  withPhone(() => {
    const view = editor([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);
    dock(view).querySelector(".page-tool-more").click();
    expect(rows(view).map((r) => r.querySelector(".page-menu-label").textContent)).toEqual([
      "Strikethrough", "Bulleted list", "Numbered list", "Checklist", "Code",
      "Underline", "Text color", "Highlight", "Turn into", "Insert", "Move up", "Move down", "Indent", "Outdent",
      "Add icon", "Add cover", "Export reading copy", "Export as Markdown",
    ]);
    row(view, "Move down").click();
    expect(shape(view)).toBe("B | A");
  });
});

test("a phone tool marks the selection without losing it, and Turn into retypes the caret's block", () => {
  withPhone(() => {
    const view = editor([["a", "paragraph", "A"], ["b", "paragraph", "B"]]);
    select(view, posOf(view, "a"), posOf(view, "a") + 1);
    const from = view.state.selection.from;
    dock(view).querySelector('[data-cmd="strong"]').click();
    expect(view.state.doc.rangeHasMark(from, from + 1, view.state.schema.marks.strong)).toBe(true);
    expect(view.state.selection.from).toBe(from);
    dock(view).querySelector(".page-tool-more").click();
    row(view, "Turn into").click();
    expect(view.state.selection.from).toBe(posOf(view, "a"));
    row(view, "Heading 2").click();
    expect(view.state.doc.child(0).type.name).toBe("heading");
    expect(shape(view)).toBe("A | B");
  });
});

test("Escape on the bar hands the keyboard back to the editor", () => {
  withPhone(() => {
    const view = editor([["a", "paragraph", "A"]]);
    dock(view).querySelector(".page-tool-more").focus();
    dock(view).querySelector(".page-tool-more").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(view.hasFocus()).toBe(true);
  });
});

test("destroying the editor removes the visual viewport listeners it added", () => {
  const media = window.matchMedia;
  const added = [];
  const removed = [];
  window.matchMedia = (query) => ({ matches: query === "(max-width: 560px)", media: query, addEventListener() {}, removeEventListener() {} });
  window.visualViewport = { width: 390, height: 844, offsetLeft: 0, offsetTop: 0, addEventListener: (type) => added.push(type), removeEventListener: (type) => removed.push(type) };
  try {
    const view = editor([["a", "paragraph", "A"]]);
    expect(added).toEqual(["resize", "scroll"]);
    view.destroy();
    expect(removed).toEqual(["resize", "scroll"]);
  } finally {
    window.matchMedia = media;
    delete window.visualViewport;
  }
});

describe("the phone's Move buttons take the validated page-move port", () => {
  const opened = [];
  afterEach(() => {
    for (const { view, bridge, mount } of opened.splice(0)) {
      view.destroy();
      bridge.dispose();
      bridge.pd.ydoc.destroy();
      mount.remove();
    }
  });

  function open(spec) {
    const pd = createPageDoc(new Y.Doc());
    pd.ydoc.clientID = 1;
    seedFrom(pd, spec);
    pd.ydoc.clientID = 300;
    const stats = { groups: 0, mismatch: 0, renders: 0, first: null };
    const bridge = createBridge({ pd, stats, captureTimeout: 0 });
    const mount = document.body.appendChild(document.createElement("div"));
    const seen = [];
    const view = new pmView.EditorView(mount, {
      state: pmState.EditorState.create({ doc: keepViewPos(docOf(pd, walk(pd))), plugins: [identityPlugin(), chromePlugin()] }),
      dispatchTransaction: (tr) => { seen.push(tr); bridge.dispatch(tr); },
    });
    bridge.attach(view);
    const tab = { pd, bridge, stats, view, mount, seen };
    opened.push(tab);
    return tab;
  }

  const ids = (tab) => { const out = []; tab.view.state.doc.forEach((n) => out.push(n.attrs.id)); return out; };
  const projected = (tab) => { const out = []; docOf(tab.pd, walk(tab.pd)).forEach((n) => out.push([n.attrs.id, n.textContent])); return out; };
  const blocks = (tab) => { const out = []; tab.view.state.doc.forEach((n) => out.push([n.attrs.id, n.textContent])); return out; };
  const caretIn = (tab, id, offset = 0) => {
    let at = null;
    tab.view.state.doc.forEach((node, pos) => { if (node.attrs.id === id) at = pos + 1 + offset; });
    tab.view.dispatch(tab.view.state.tr.setSelection(pmState.TextSelection.create(tab.view.state.doc, at)));
  };

  test("a phone Move down is one MOVE transaction through the port, and one undo puts it back", () => {
    const tab = open([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
    caretIn(tab, "q", 2);
    const groups = tab.stats.groups;
    const start = tab.seen.length;
    tab.mount.querySelector(".page-tool-more").click();
    [...tab.mount.querySelectorAll(".page-menu-item")].find((row) => row.textContent.includes("Move down")).click();
    const changed = tab.seen.slice(start).filter((tr) => tr.docChanged && !tr.getMeta(REMOTE_META));
    expect(changed.length).toBe(1);
    expect(changed[0].getMeta(MOVE)).toBeTruthy();
    expect(tab.stats.groups).toBe(groups);
    expect(tab.stats.moveRefusals).toBeUndefined();
    expect(tab.stats.mismatch).toBe(0);
    expect(ids(tab)).toEqual(["p", "r", "q"]);
    expect(projected(tab)).toEqual(blocks(tab));
    expect(tab.bridge.um.undoStack.length).toBe(1);
    expect(tab.bridge.undo()).toBe(true);
    expect(ids(tab)).toEqual(["p", "q", "r"]);
  });

  test("a phone Move up from a block selection moves exactly the selected blocks", () => {
    const tab = open([{ id: "p", text: "ALPHA" }, { id: "q", text: "bravo" }, { id: "r", text: "OMEGA" }]);
    caretIn(tab, "q", 2);
    const start = tab.seen.length;
    tab.mount.querySelector(".page-tool-more").click();
    [...tab.mount.querySelectorAll(".page-menu-item")].find((row) => row.textContent.includes("Move up")).click();
    const changed = tab.seen.slice(start).filter((tr) => tr.docChanged && !tr.getMeta(REMOTE_META));
    expect(changed.length).toBe(1);
    expect(changed[0].getMeta(MOVE).ids).toEqual(["q"]);
    expect(ids(tab)).toEqual(["q", "p", "r"]);
  });
});

test("the block grip sits above the bar instead of under it at 320, 360 and 390 px", async () => {
  const gap = 16, size = 44, left = 68;
  const screens = [[320, 568], [360, 640], [390, 844]];
  for (const [width, height] of screens) {
    await withPhone(async () => {
      const view = editor([["a", "paragraph", "A"]]);
      await frame();
      const bar = { left: parseFloat(dock(view).style.left), top: parseFloat(dock(view).style.top), width: parseFloat(dock(view).style.width), height: 52 };
      const grip = view.dom.parentElement.querySelector(".page-grip");
      const lift = parseFloat(grip.style.getPropertyValue("--page-grip-lift")) || 0;
      expect(lift).toBe(bar.height);
      const box = { left, top: height - gap - lift - size, width: size, height: size };
      const overlap = box.left < bar.left + bar.width && bar.left < box.left + box.width
        && box.top < bar.top + bar.height && bar.top < box.top + box.height;
      expect({ width, overlap }).toEqual({ width, overlap: false });
    }, { offsetLeft: 0, offsetTop: 0, width, height });
  }
});

test("the phone stylesheet lifts the grip by the bar's height and keeps the safe-area inset", () => {
  expect(phoneCss()).toContain(".page-grip { position: fixed; top: auto; left: 68px; bottom: calc(16px + var(--page-grip-lift, 0px) + env(safe-area-inset-bottom));");
});
