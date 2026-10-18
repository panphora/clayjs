import { jest } from "@jest/globals";
import { state as pmState, model as pmModel, history } from "../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../src/page/schema.js";
import { REMOTE } from "../../../src/page/model.js";
import { safeHref, safeSrc, isUrlText, linkRange, setLinkTr, linkKey } from "../../../src/page/link.js";
import { editor, key, keyOn, posOf, select, typeText } from "./view-helpers.js";

const { TextSelection } = pmState;
const LINK = schema.marks.link;

/**
 * Link addresses and the link plugin's model: what is safe to store, the run of
 * text a link covers, URL paste, Mod+click and the pending highlight.
 */

afterEach(() => { document.body.innerHTML = ""; });

describe("safeHref", () => {
  test.each([
    ["https://a.io/x?y=1#z", "https://a.io/x?y=1#z"],
    ["HTTP://A.IO", "HTTP://A.IO"],
    ["mailto:me@a.io", "mailto:me@a.io"],
    ["tel:+15551234", "tel:+15551234"],
    ["/docs/page", "/docs/page"],
    ["#section", "#section"],
    ["example.com", "https://example.com"],
    ["//cdn.example.com:8080/x", "https://cdn.example.com:8080/x"],
    ["//cdn.example.com/x", "https://cdn.example.com/x"],
    ["me@a.io", "mailto:me@a.io"],
    ["  https://a.io  ", "https://a.io"],
    ["javascript:alert(1)", null],
    ["JaVaScRiPt:alert(1)", null],
    ["java\tscript:alert(1)", null],
    ["data:text/html,<b>x</b>", null],
    ["vbscript:x", null],
    ["file:///etc/hosts", null],
    ["", null],
    ["two words", null],
  ])("%j gives %j", (raw, want) => {
    expect(safeHref(raw)).toBe(want);
  });

  test("isUrlText accepts a single address and nothing with spaces or only a word", () => {
    expect(isUrlText("https://a.io")).toBe(true);
    expect(isUrlText("b.io")).toBe(false);
    expect(isUrlText("www.b.io")).toBe(true);
    expect(isUrlText("hello")).toBe(false);
    expect(isUrlText("hello there")).toBe(false);
    expect(isUrlText("javascript:alert(1)")).toBe(false);
  });

  test("safeSrc lets a small raster data: image through, refuses svg, scripts and huge payloads", () => {
    expect(safeSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(safeSrc("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(safeSrc("javascript:alert(1)")).toBeNull();
    expect(safeSrc(`data:image/png;base64,${"A".repeat(2_100_001)}`)).toBeNull();
    expect(safeSrc("https://a.io/p.png")).toBe("https://a.io/p.png");
    expect(safeSrc("")).toBeNull();
  });
});

describe("linkRange and setLinkTr", () => {
  const withLinks = () => {
    const view = editor([["p", "paragraph", "go here now"]]);
    const a = posOf(view, "p");
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://a.io" })));
    return view;
  };

  test("linkRange returns the whole run of the link from inside it or its left edge, and null outside it or at its right edge", () => {
    const view = withLinks();
    const a = posOf(view, "p");
    expect(linkRange(view.state.doc, a + 5)).toEqual({ from: a + 3, to: a + 7, href: "https://a.io" });
    expect(linkRange(view.state.doc, a + 3)).toEqual({ from: a + 3, to: a + 7, href: "https://a.io" });
    expect(linkRange(view.state.doc, a + 7)).toBeNull();
    expect(linkRange(view.state.doc, a + 1)).toBeNull();
    expect(linkRange(view.state.doc, a + 9)).toBeNull();
  });

  test("a link split by a bold stretch is still one run", () => {
    const view = withLinks();
    const a = posOf(view, "p");
    view.dispatch(view.state.tr.addMark(a + 4, a + 6, schema.marks.strong.create()));
    expect(linkRange(view.state.doc, a + 3)).toEqual({ from: a + 3, to: a + 7, href: "https://a.io" });
  });

  test("setLinkTr replaces the link on a range and an empty href removes it", () => {
    const view = withLinks();
    const a = posOf(view, "p");
    view.dispatch(setLinkTr(view.state, a + 3, a + 7, "https://b.io"));
    expect(linkRange(view.state.doc, a + 5).href).toBe("https://b.io");
    view.dispatch(setLinkTr(view.state, a + 3, a + 7, null));
    expect(linkRange(view.state.doc, a + 5)).toBeNull();
  });
});

describe("the link plugin", () => {
  const paste = (view, text) => !!view.someProp("handlePaste", (f) => f(view, { clipboardData: { getData: (t) => (t === "text/plain" ? text : "") } }, null));
  const page = () => editor([["p", "paragraph", "go here now"], ["c", "code_block", "x.io"]]);

  test("pasting a URL over a text selection links it", () => {
    const view = page();
    const a = posOf(view, "p");
    select(view, a, a + 2);
    expect(paste(view, "https://a.io/x")).toBe(true);
    expect(linkRange(view.state.doc, a + 1).href).toBe("https://a.io/x");
    expect(view.state.doc.child(0).textContent).toBe("go here now");
  });

  test("pasting a URL at a caret inserts it as linked text", () => {
    const view = page();
    select(view, posOf(view, "p", true));
    expect(paste(view, "https://b.io")).toBe(true);
    expect(view.state.doc.child(0).textContent).toBe("go here nowhttps://b.io");
    expect(linkRange(view.state.doc, view.state.selection.head - 1).href).toBe("https://b.io");
  });

  test("a pasted URL is one undo step", () => {
    const view = page();
    const a = posOf(view, "p");
    select(view, a, a + 2);
    paste(view, "https://a.io");
    key(view, "z", { ctrlKey: true });
    expect(linkRange(view.state.doc, a + 1)).toBeNull();
  });

  test("ordinary text, a javascript: address and a URL in code take the normal paste", () => {
    const view = page();
    select(view, posOf(view, "p"));
    expect(paste(view, "hello there")).toBe(false);
    expect(paste(view, "javascript:alert(1)")).toBe(false);
    select(view, posOf(view, "c"));
    expect(paste(view, "c.io")).toBe(false);
  });

  test("a clipboard that carries files is left to the upload code even when its text looks like an address", () => {
    const view = page();
    select(view, posOf(view, "p"));
    const data = { files: [{}], getData: (t) => (t === "text/plain" ? "note.txt" : "") };
    expect(!!linkKey.get(view.state).props.handlePaste(view, { clipboardData: data })).toBe(false);
  });

  test("a URL over a selection that spans two blocks takes the normal paste", () => {
    const view = page();
    select(view, posOf(view, "p"), posOf(view, "c"));
    expect(paste(view, "https://a.io")).toBe(false);
  });

  test("Mod+K is swallowed even when there is nothing to open", () => {
    const view = page();
    select(view, posOf(view, "c"));
    expect(key(view, "k", { ctrlKey: true })).toBe(true);
  });

  test("Mod+click on a link opens it in a new tab with noopener, a plain click does not", () => {
    const view = page();
    const a = posOf(view, "p");
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://a.io" })));
    const open = jest.fn();
    view.dom.ownerDocument.defaultView.open = open;
    const click = (init) => view.someProp("handleClick", (f) => f(view, a + 5, init));
    expect(click({ ctrlKey: false, metaKey: false })).toBeFalsy();
    expect(open).not.toHaveBeenCalled();
    expect(click({ ctrlKey: true })).toBe(true);
    expect(open).toHaveBeenCalledWith("https://a.io", "_blank", "noopener,noreferrer");
  });

  test("the pending range is drawn, and it maps through an edit above it", () => {
    const view = page();
    const a = posOf(view, "p");
    view.dispatch(view.state.tr.setMeta(linkKey, { from: a + 3, to: a + 7 }));
    expect(view.dom.querySelectorAll(".page-link-pending").length).toBe(1);
    view.dispatch(view.state.tr.insertText("xy", a));
    expect(linkKey.getState(view.state)).toEqual({ from: a + 5, to: a + 9 });
    view.dispatch(view.state.tr.setMeta(linkKey, null));
    expect(view.dom.querySelectorAll(".page-link-pending").length).toBe(0);
  });

  test("the clipboard parser drops a pasted javascript: link and keeps its text", () => {
    const view = page();
    const slice = view.someProp("clipboardParser", (p) => p).parseSlice(
      Object.assign(document.createElement("div"), { innerHTML: '<p>see <a href="javascript:alert(1)">here</a> and <a href="https://ok.io">ok</a></p>' }),
      { context: view.state.doc.resolve(1) },
    );
    const links = [];
    slice.content.descendants((n) => { n.marks.forEach((m) => { if (m.type === LINK) links.push(m.attrs.href); }); });
    expect(slice.content.textBetween(0, slice.content.size, " ")).toContain("see here and ok");
    expect(links).toEqual(["https://ok.io"]);
  });
});

describe("the link popover", () => {
  const setup = (blocks = [["p", "paragraph", "go here now"], ["c", "code_block", "x.io"]]) => {
    const view = editor(blocks);
    view.coordsAtPos = () => ({ left: 10, right: 10, top: 20, bottom: 30 });
    const pop = view.dom.parentElement.querySelector(".page-link");
    const input = pop.querySelector(".page-link-input");
    return { view, pop, input, a: posOf(view, "p") };
  };
  const modK = (view) => key(view, "k", { ctrlKey: true });

  test("the popover exists, hidden, inside the shell", () => {
    const { view, pop } = setup();
    expect(pop.parentElement).toBe(view.dom.parentElement);
    expect([pop.hidden, pop.getAttribute("role")]).toEqual([true, "dialog"]);
  });

  test("Mod+K on a text selection opens the edit mode with the field focused and the selection still drawn", () => {
    const { view, pop, input, a } = setup();
    select(view, a + 3, a + 7);
    expect(modK(view)).toBe(true);
    expect([pop.hidden, pop.dataset.mode, document.activeElement === input]).toEqual([false, "edit", true]);
    expect(view.dom.querySelectorAll(".page-link-pending").length).toBe(1);
  });

  test("an unsafe address is refused: the field is marked invalid and the editor stays open", () => {
    const { view, pop, input, a } = setup();
    select(view, a + 3, a + 7);
    modK(view);
    input.value = "javascript:alert(1)";
    keyOn(input, "Enter");
    expect([input.getAttribute("aria-invalid"), pop.hidden, linkRange(view.state.doc, a + 5)]).toEqual(["true", false, null]);
  });

  test("Enter applies a bare domain as https, closes the popover and clears the pending highlight", () => {
    const { view, pop, input, a } = setup();
    select(view, a + 3, a + 7);
    modK(view);
    input.value = "example.com";
    keyOn(input, "Enter");
    expect(linkRange(view.state.doc, a + 5)).toEqual({ from: a + 3, to: a + 7, href: "https://example.com" });
    expect([pop.hidden, view.dom.querySelectorAll(".page-link-pending").length]).toEqual([true, 0]);
  });

  test("Mod+K with the caret inside a link edits that link, prefilled", () => {
    const { view, input, a } = setup();
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://example.com" })));
    select(view, a + 5);
    expect(modK(view)).toBe(true);
    expect(input.value).toBe("https://example.com");
  });

  test("Esc closes the field, changes nothing and leaves the quiet card for the link under the caret", () => {
    const { view, pop, input, a } = setup();
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://example.com" })));
    select(view, a + 5);
    modK(view);
    input.value = "other.io";
    keyOn(input, "Escape");
    expect(pop.dataset.mode).toBe("view");
    expect(document.activeElement).toBe(view.dom);
    expect(linkRange(view.state.doc, a + 5).href).toBe("https://example.com");
  });

  test("an emptied field removes the link, and one undo brings it back", () => {
    const { view, input, a } = setup();
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://example.com" })));
    select(view, a + 5);
    modK(view);
    input.value = "";
    keyOn(input, "Enter");
    expect(linkRange(view.state.doc, a + 5)).toBeNull();
    key(view, "z", { ctrlKey: true });
    expect(linkRange(view.state.doc, a + 5).href).toBe("https://example.com");
  });

  test("Mod+K at a bare caret opens an empty field and Enter inserts the address as linked text", () => {
    const { view, input, a } = setup();
    select(view, a + 11);
    modK(view);
    input.value = "b.io";
    keyOn(input, "Enter");
    expect(view.state.doc.child(0).textContent).toBe("go here nowb.io");
    expect(linkRange(view.state.doc, view.state.selection.head - 1).href).toBe("https://b.io");
  });

  test("Mod+K in a code block, or across blocks, opens nothing but is swallowed", () => {
    const { view, pop } = setup();
    select(view, posOf(view, "c"));
    expect(modK(view)).toBe(true);
    select(view, posOf(view, "p"), posOf(view, "c"));
    expect(modK(view)).toBe(true);
    expect(pop.hidden).toBe(true);
  });

  test("with the caret strictly inside a link and the editor focused a quiet card shows the address, Edit and Remove", () => {
    const { view, pop, a } = setup();
    view.hasFocus = () => true;
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://example.com/x" })));
    select(view, a + 5);
    expect([pop.hidden, pop.dataset.mode]).toEqual([false, "view"]);
    expect(pop.querySelector(".page-link-url").textContent).toBe("example.com/x");
    expect(pop.querySelector('[data-act="open"]').getAttribute("target")).toBe("_blank");
    expect(pop.querySelector('[data-act="open"]').getAttribute("rel")).toBe("noopener noreferrer");
    select(view, a + 3);
    expect(pop.hidden).toBe(true);
    select(view, a + 7);
    expect(pop.hidden).toBe(true);
  });

  test("Remove on the card removes the link and Edit opens the field", () => {
    const { view, pop, input, a } = setup();
    view.hasFocus = () => true;
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://example.com" })));
    select(view, a + 5);
    pop.querySelector('[data-act="edit"]').click();
    expect([pop.dataset.mode, input.value]).toEqual(["edit", "https://example.com"]);
    input.value = "";
    pop.querySelector('[data-act="remove"]').click();
    expect(linkRange(view.state.doc, a + 5)).toBeNull();
  });

  test("Remove on the quiet card removes the link without opening Edit first", () => {
    const { view, pop, a } = setup();
    view.hasFocus = () => true;
    view.dispatch(view.state.tr.addMark(a + 3, a + 7, LINK.create({ href: "https://example.com" })));
    select(view, a + 5);
    expect(pop.dataset.mode).toBe("view");
    pop.querySelector('[data-act="remove"]').click();
    expect(linkRange(view.state.doc, a + 5)).toBeNull();
  });

  test("a mousedown outside the popover closes the editor without applying", () => {
    const { view, pop, input, a } = setup();
    select(view, a + 3, a + 7);
    modK(view);
    input.value = "typed.io";
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(pop.hidden).toBe(true);
    expect(linkRange(view.state.doc, a + 5)).toBeNull();
  });

  test("the pending range follows an edit made while the field is open", () => {
    const { view, input, a } = setup();
    select(view, a + 3, a + 7);
    modK(view);
    view.dispatch(view.state.tr.insertText("zz", a));
    input.value = "https://a.io";
    keyOn(input, "Enter");
    expect(linkRange(view.state.doc, a + 7)).toEqual({ from: a + 5, to: a + 9, href: "https://a.io" });
  });

  test("the toolbar link button opens the popover and never calls window.prompt", () => {
    const { view, pop, a } = setup();
    const prompt = jest.fn();
    window.prompt = prompt;
    select(view, a + 3, a + 7);
    const button = view.dom.parentElement.querySelector('.page-tool[data-mark="link"], .page-tool[aria-label="Link"]');
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    button.click();
    expect(prompt).not.toHaveBeenCalled();
    expect(pop.dataset.mode).toBe("edit");
  });

  test("destroying the view removes the popover and its document listener", () => {
    const { view, pop } = setup();
    view.destroy();
    expect(pop.isConnected).toBe(false);
  });
});

describe("review regressions", () => {
  test("F5 file clipboard serialization never emits an unsafe address", () => {
    const file = schema.nodes.file.create({ src: "javascript:void(0)", name: "file" });
    const dom = pmModel.DOMSerializer.fromSchema(schema).serializeNode(file);
    expect(dom.querySelector("a").hasAttribute("href")).toBe(false);
    expect(dom.dataset.src).toBe("");
  });

  test("F5 stored unsafe links are inert on the editing surface", () => {
    const view = editor([["p", "paragraph", "link"]]);
    try {
      view.dispatch(view.state.tr.addMark(1, 5, LINK.create({ href: "javascript:void(0)" })));
      expect(view.dom.querySelector("a").hasAttribute("href")).toBe(false);
    } finally { view.destroy(); }
  });

  test("F5 stored unsafe links never reach the popover anchors", () => {
    const view = editor([["p", "paragraph", "link"]]);
    try {
      view.coordsAtPos = () => ({ left: 0, bottom: 20 });
      view.dispatch(view.state.tr.addMark(1, 5, LINK.create({ href: "https://example.test" })));
      select(view, 2);
      key(view, "k", { ctrlKey: true });
      keyOn(view.dom.parentElement.querySelector(".page-link-input"), "Escape");
      view.dispatch(view.state.tr.addMark(1, 5, LINK.create({ href: "javascript:void(0)" })));
      key(view, "k", { ctrlKey: true });
      for (const a of view.dom.parentElement.querySelectorAll(".page-link a")) expect(a.hasAttribute("href")).toBe(false);
    } finally { view.destroy(); }
  });

  test("F5 Mod+click refuses stored unsafe links", () => {
    const view = editor([["p", "paragraph", "link"]]);
    const open = jest.spyOn(window, "open").mockImplementation(() => null).mockClear();
    try {
      view.dispatch(view.state.tr.addMark(1, 5, LINK.create({ href: "javascript:void(0)" })));
      expect(linkKey.get(view.state).props.handleClick(view, 2, { ctrlKey: true })).toBe(false);
      expect(open).not.toHaveBeenCalled();
    } finally { open.mockRestore(); view.destroy(); }
  });

  test("F6 deleting a pending target closes the popover without stale coordinates", () => {
    const view = editor([["p", "paragraph", "long target text here"]]);
    try {
      view.coordsAtPos = (pos) => { view.state.doc.resolve(pos); return { left: 0, bottom: 20 }; };
      select(view, 12, 17);
      key(view, "k", { ctrlKey: true });
      expect(() => view.dispatch(view.state.tr.delete(1, 22).setMeta(REMOTE, true))).not.toThrow();
      expect(linkKey.getState(view.state)).toBeNull();
      expect(view.dom.parentElement.querySelector(".page-link").hidden).toBe(true);
    } finally { view.destroy(); }
  });

  test("F6 a collapsed pending insertion keeps one mapped position", () => {
    const view = editor([["p", "paragraph", "text"]]);
    try {
      view.coordsAtPos = () => ({ left: 0, bottom: 20 });
      select(view, 3);
      key(view, "k", { ctrlKey: true });
      view.dispatch(view.state.tr.insertText("remote", 3).setMeta(REMOTE, true));
      expect(linkKey.getState(view.state)).toEqual({ from: 9, to: 9 });
    } finally { view.destroy(); }
  });

  test("F14 bare-caret link insertion and following typing undo separately", () => {
    const view = editor([["p", "paragraph", "text"]]);
    try {
      view.coordsAtPos = () => ({ left: 0, bottom: 20 });
      select(view, posOf(view, "p", true));
      key(view, "k", { ctrlKey: true });
      const input = view.dom.parentElement.querySelector(".page-link-input");
      input.value = "example.test";
      keyOn(input, "Enter");
      typeText(view, "!");
      expect(history.undoDepth(view.state)).toBe(2);
      history.undo(view.state, view.dispatch);
      expect(view.state.doc.textContent).toBe("textexample.test");
    } finally { view.destroy(); }
  });

  test.each(["e.g", "v1.2", "1.5", "package.json"])("F19 dotted text %s uses normal paste", (text) => {
    const view = editor([["p", "paragraph", "text"]]);
    try {
      select(view, 1, 5);
      expect(linkKey.get(view.state).props.handlePaste(view, { clipboardData: { getData: () => text } })).toBe(false);
      expect(view.state.doc.firstChild.firstChild.marks).toEqual([]);
    } finally { view.destroy(); }
  });
});
