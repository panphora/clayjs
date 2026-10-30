globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {};

import { schema } from "../../../src/page/schema.js";
import { flatten } from "../../../src/page/inline.js";
import { PALETTE } from "../../../src/page/format-native.js";
import { formatMark } from "../../../src/page/format-native-commands.js";
import { renderModel, parseModel, revOf } from "../../../src/page/projection.js";
import { editor, posOf, select, key, typeText } from "./view-helpers.js";

/**
 * The four formats this release adds, driven the way a person drives them: the
 * keyboard, the toolbar's More menu, the block menu and a paste. Every writer
 * asks the format gate first, so the document's floor rises (or the command is
 * refused with nothing applied) before any descriptor is written.
 */

const UPGRADE = "This document uses a newer page format; update the editor in the other tabs to keep writing";
const MESSAGE = { message: UPGRADE, required: 1, minimum: 1, code: "page-format-upgrade-required" };

function gate({ refuse = false } = {}) {
  const calls = [];
  return {
    calls,
    run: async (command) => {
      calls.push(command);
      if (refuse) return { status: "upgrade-required", ...MESSAGE };
      return { status: "applied", floor: 1, result: await command?.apply?.({}) };
    },
  };
}

const toastSaying = async (text) => {
  for (let i = 0; i < 50; i++) {
    if ([...document.querySelectorAll("[data-clay-toast]")].some((el) => el.textContent.includes(text))) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
};

const opened = (spec, options = {}) => {
  const g = options.gate ?? gate();
  const view = editor(spec, { formatGate: () => Promise.resolve(g), ...options.editor });
  return { view, gate: g };
};

const nodeOf = (view, id) => {
  let found = null;
  view.state.doc.forEach((node) => { if (!found && node.attrs.id === id) found = node; });
  return found;
};
const keysOf = (view, id) => {
  const { c, m } = flatten(nodeOf(view, id).content);
  const out = [];
  for (let i = 0; i < c.length; i++) {
    const key = m[i] || "";
    const last = out[out.length - 1];
    if (last && last.key === key) last.text += c[i];
    else out.push({ key, text: c[i] });
  }
  return out;
};
const keyOf = (view, id) => {
  const runs = keysOf(view, id);
  expect(runs).toHaveLength(1);
  return runs[0].key;
};
const descriptors = (view, id) => {
  const out = [];
  for (const run of keysOf(view, id)) if (run.key) out.push(run.key);
  return out;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const pinned = (view) => { view.coordsAtPos = () => ({ left: 40, right: 48, top: 100, bottom: 120 }); return view; };
const part = (view, selector) => view.dom.parentElement.querySelector(selector);
const row = (view, label) => [...part(view, ".page-menu").querySelectorAll(".page-menu-item")]
  .find((item) => item.querySelector(".page-menu-label").textContent === label);
const wholeLine = (view, id) => {
  const node = nodeOf(view, id);
  select(view, posOf(view, id), posOf(view, id) + node.content.size);
};

// ---- underline ---------------------------------------------------------------

test("underline toggles through the gate and is written as the named descriptor", async () => {
  const { view, gate: g } = opened([["a", "paragraph", "under me"]]);
  wholeLine(view, "a");
  expect(key(view, "u", { ctrlKey: true })).toBe(true);
  await settle();
  expect(g.calls).toHaveLength(1);
  expect(keyOf(view, "a")).toBe('x["underline",{}]');

  expect(key(view, "u", { ctrlKey: true })).toBe(true);
  await settle();
  expect(g.calls).toHaveLength(2);
  expect(keyOf(view, "a")).toBe("");
});

test("a refused floor activation writes no descriptor and leaves the document alone", async () => {
  const { view, gate: g } = opened([["a", "paragraph", "under me"]], { gate: gate({ refuse: true }) });
  const before = view.state.doc;
  wholeLine(view, "a");
  key(view, "u", { ctrlKey: true });
  await settle();
  expect(g.calls).toHaveLength(1);
  expect(view.state.doc.eq(before)).toBe(true);
  expect(keyOf(view, "a")).toBe("");
  expect(part(view, ".page-live").textContent).toBe(UPGRADE);
  expect(await toastSaying(UPGRADE)).toBe(true);
});

test("Mod-u belongs to an editable page selection only", async () => {
  const { view, gate: g } = opened([["a", "paragraph", "under me"], ["b", "code_block", "let a = 1"]]);
  wholeLine(view, "b");
  expect(key(view, "u", { ctrlKey: true })).toBe(false);
  await settle();
  expect(g.calls).toHaveLength(0);
  expect(keyOf(view, "b")).toBe("");

  view.setProps({ editable: () => false });
  wholeLine(view, "a");
  expect(key(view, "u", { ctrlKey: true })).toBe(false);
  await settle();
  expect(g.calls).toHaveLength(0);
  expect(keyOf(view, "a")).toBe("");
});

// ---- the two color marks -----------------------------------------------------

test("text color takes only the fixed palette and reset takes it off again", async () => {
  const { view, gate: g } = opened([["a", "paragraph", "color me"]]);
  wholeLine(view, "a");
  pinned(view);
  part(view, ".page-tool-more").click();
  row(view, "Text color").click();
  await settle();
  expect([...part(view, ".page-menu").querySelectorAll(".page-menu-label")].map((x) => x.textContent))
    .toEqual([...PALETTE.map((color) => `Text: ${color[0].toUpperCase()}${color.slice(1)}`), "Automatic"]);
  row(view, "Text: Red").click();
  await settle();
  expect(g.calls).toHaveLength(1);
  expect(keyOf(view, "a")).toBe('x["text_color",{"color":"red"}]');
});

test("a second color replaces the first, and reset removes only that mark", async () => {
  const { view } = opened([["a", "paragraph", "color me"]]);
  wholeLine(view, "a");
  
  await formatMark(view, "text_color", { color: "red" });
  expect(keyOf(view, "a")).toBe('x["text_color",{"color":"red"}]');
  await formatMark(view, "text_color", { color: "blue" });
  expect(keyOf(view, "a")).toBe('x["text_color",{"color":"blue"}]');
  await formatMark(view, "highlight", { color: "blue" });
  expect(keyOf(view, "a")).toBe('x["highlight",{"color":"blue"}]x["text_color",{"color":"blue"}]');
  await formatMark(view, "text_color", {}, { reset: true });
  expect(keyOf(view, "a")).toBe('x["highlight",{"color":"blue"}]');
  await formatMark(view, "highlight", {}, { reset: true });
  expect(keyOf(view, "a")).toBe("");
});

test("a color key outside the palette is not a native format and stays exactly as written", async () => {
  const { view } = opened([["a", "paragraph", "color me", { m: [[8, 'x["text_color",{"color":"magenta"}]']] }]]);
  expect(nodeOf(view, "a").child(0).marks.map((mark) => mark.type.name)).toEqual(["opaque_marks"]);
  wholeLine(view, "a");
  
  await formatMark(view, "underline");
  expect(keysOf(view, "a").map((run) => run.key)).toEqual(['x["text_color",{"color":"magenta"}]x["underline",{}]']);
});

// ---- mixed selections and links ----------------------------------------------

test("a half-marked selection takes the whole mark, and a link keeps every format beside it", async () => {
  const { view } = opened([["a", "paragraph", "half and half"]]);
  
  select(view, posOf(view, "a"), posOf(view, "a") + 4);
  await formatMark(view, "underline");
  expect(keysOf(view, "a").map((run) => [run.text, run.key])).toEqual([
    ["half", 'x["underline",{}]'],
    [" and half", ""],
  ]);

  wholeLine(view, "a");
  await formatMark(view, "underline");
  expect(keyOf(view, "a")).toBe('x["underline",{}]');

  view.dispatch(view.state.tr.addMark(posOf(view, "a"), posOf(view, "a") + 4, schema.marks.link.create({ href: "https://x.test" })));
  for (const [name, attrs] of [["text_color", { color: "green" }], ["highlight", { color: "yellow" }]]) {
    wholeLine(view, "a");
    await formatMark(view, name, attrs);
  }
  expect(keysOf(view, "a").map((run) => [run.text, run.key])).toEqual([
    ["half", `a["https://x.test"]x["highlight",{"color":"yellow"}]x["text_color",{"color":"green"}]x["underline",{}]`],
    [" and half", `x["highlight",{"color":"yellow"}]x["text_color",{"color":"green"}]x["underline",{}]`],
  ]);
  const marked = nodeOf(view, "a").child(0);
  expect(marked.marks.map((mark) => mark.type.name).sort()).toEqual(["highlight", "link", "text_color", "underline"]);
});

test("a code block refuses the formats before the gate is asked", async () => {
  const { view, gate: g } = opened([["a", "code_block", "let a = 1"]]);
  const before = view.state.doc;
  wholeLine(view, "a");
  
  for (const [name, attrs] of [["underline", {}], ["text_color", { color: "red" }], ["highlight", { color: "red" }]]) {
    expect(await formatMark(view, name, attrs)).toEqual({ status: "refused", code: "mark-not-allowed" });
  }
  expect(g.calls).toHaveLength(0);
  expect(view.state.doc.eq(before)).toBe(true);
  expect(keyOf(view, "a")).toBe("");
});

// ---- quote -------------------------------------------------------------------

const quoteOf = (view, id) => nodeOf(view, id).type.name;

test("the block menu turns a line into a quote through the gate", async () => {
  const { view, gate: g } = opened([["a", "paragraph", "read this"]]);
  pinned(view);
  select(view, posOf(view, "a") + 2);
  part(view, ".page-tool-turn").click();
  row(view, "Quote").click();
  await settle();
  expect(g.calls).toHaveLength(1);
  expect(quoteOf(view, "a")).toBe("quote");
  expect(renderModel([{ id: "a", t: "quote", c: "read this" }])).toBe('<blockquote data-id="a">read this</blockquote>');
});

test("a refused quote leaves the paragraph as it was", async () => {
  const { view } = opened([["a", "paragraph", "read this"]], { gate: gate({ refuse: true }) });
  const before = view.state.doc;
  pinned(view);
  select(view, posOf(view, "a") + 2);
  part(view, ".page-tool-turn").click();
  row(view, "Quote").click();
  await settle();
  expect(view.state.doc.eq(before)).toBe(true);
  expect(quoteOf(view, "a")).toBe("paragraph");
  expect(part(view, ".page-live").textContent).toBe(UPGRADE);
  expect(await toastSaying(UPGRADE)).toBe(true);
});

test("a quote inside a toggle keeps its identity, its hierarchy and its inline content", async () => {
  const { view } = opened([["t", "toggle", "top", { open: true }], ["q", "quote", "inner", { parent: "t" }]]);
  const node = nodeOf(view, "q");
  expect(node.type.name).toBe("quote");
  expect(node.attrs.parent).toBe("t");
  expect(node.textContent).toBe("inner");
  expect(renderModel([{ id: "t", t: "toggle", c: "top", open: true }, { id: "q", t: "quote", c: "inner", parent: "t" }]))
    .toBe('<details data-id="t" open><summary>top</summary>\n<blockquote data-id="q">inner</blockquote>\n</details>');
});

test('" at the start of a line quotes it, and Backspace puts the literal shortcut back', async () => {
  const { view } = opened([["a", "paragraph", ""]]);
  select(view, posOf(view, "a"));
  typeText(view, '"');
  expect(typeText(view, " ")).toBe(true);
  await settle();
  expect(quoteOf(view, "a")).toBe("quote");
  expect(nodeOf(view, "a").textContent).toBe("");
  key(view, "Backspace");
  await settle();
  expect(quoteOf(view, "a")).toBe("paragraph");
  expect(nodeOf(view, "a").textContent).toBe('" ');
});

test('" stays literal when the floor cannot rise', async () => {
  const { view } = opened([["a", "paragraph", ""]], { gate: gate({ refuse: true }) });
  select(view, posOf(view, "a"));
  typeText(view, '"');
  expect(typeText(view, " ")).toBe(true);
  await settle();
  expect(quoteOf(view, "a")).toBe("paragraph");
  expect(nodeOf(view, "a").textContent).toBe('" ');
});

// ---- paste and copy -----------------------------------------------------------

const clip = (data = {}) => {
  const store = { ...data };
  return {
    data: store,
    clipboardData: {
      setData: (type, value) => { store[type] = String(value); },
      getData: (type) => store[type] ?? "",
      clearData: (type) => { if (type === undefined) for (const k of Object.keys(store)) delete store[k]; else delete store[type]; },
      get types() { return Object.keys(store); },
      files: [],
    },
  };
};
const fire = (view, type, event = clip()) => {
  const domEvent = Object.assign(new Event(type, { bubbles: true, cancelable: true }), event);
  view.dom.dispatchEvent(domEvent);
  return domEvent;
};

test("pasting the four formats asks the gate, and a refusal keeps the text and no descriptor", async () => {
  const html = '<p><u>one</u> <mark data-color="red">two</mark></p><blockquote>three</blockquote>';
  const { view, gate: g } = opened([["a", "paragraph", "here "]], { gate: gate({ refuse: true }) });
  select(view, posOf(view, "a") + 5);
  fire(view, "paste", clip({ "text/html": html, "text/plain": "one two\n\nthree" }));
  await settle();
  expect(g.calls).toHaveLength(1);
  expect(quoteOf(view, "a")).toBe("paragraph");
  expect(descriptors(view, "a")).toEqual([]);
  expect(nodeOf(view, "a").textContent).toContain("one two");
});

test("pasting the four formats writes them once the floor is active", async () => {
  const html = '<p><u>one</u> <mark data-color="red">two</mark></p><blockquote>three</blockquote>';
  const { view, gate: g } = opened([["a", "paragraph", ""]]);
  select(view, posOf(view, "a"));
  fire(view, "paste", clip({ "text/html": html, "text/plain": "one two\n\nthree" }));
  await settle();
  expect(g.calls).toHaveLength(1);
  const types = [];
  view.state.doc.forEach((node) => types.push(node.type.name));
  expect(types).toEqual(["paragraph", "quote"]);
  expect(descriptors(view, "a")).toEqual(['x["underline",{}]', 'x["highlight",{"color":"red"}]']);
  expect(quoteOf(view, view.state.doc.child(1).attrs.id)).toBe("quote");
});

test("copying formatted text keeps plain text plain and the descriptors in the html", async () => {
  const { view } = opened([["a", "paragraph", "copy me"]]);
  
  wholeLine(view, "a");
  await formatMark(view, "underline");
  const event = clip();
  expect(fire(view, "copy", event).defaultPrevented).toBe(true);
  expect(event.data["text/plain"]).toBe("copy me");
  expect(event.data["text/html"]).toContain("<u>copy me</u>");
});

// ---- the phone bar ------------------------------------------------------------

test("the More menu keeps the phone's four controls and puts the formats behind it", async () => {
  const matchMedia = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query === "(max-width: 560px)", addEventListener() {}, removeEventListener() {} });
  try {
    const { view, gate: g } = opened([["a", "paragraph", "under me"]]);
    pinned(view);
    const primary = [...view.dom.parentElement.querySelectorAll(".page-dock .page-tool-primary")].map((b) => b.getAttribute("aria-label"));
    expect(primary).toEqual(["Bold", "Italic", "Link", "More"]);

    wholeLine(view, "a");
    part(view, ".page-tool-more").click();
    expect(["Underline", "Text color", "Highlight"].every((label) => row(view, label) !== undefined)).toBe(true);
    row(view, "Underline").click();
    await settle();
    expect(g.calls).toHaveLength(1);
    expect(keyOf(view, "a")).toBe('x["underline",{}]');
    expect(view.state.selection.empty).toBe(false);
    expect(view.state.selection.from).toBe(posOf(view, "a"));
    expect(view.state.selection.to).toBe(posOf(view, "a") + "under me".length);
    expect(document.activeElement).toBe(view.dom);
  } finally {
    window.matchMedia = matchMedia;
  }
});

// ---- the saved article --------------------------------------------------------

test("the article renders the four formats as u, mark and blockquote and reads them back", () => {
  const model = [
    { id: "a", t: "paragraph", c: "red and underlined", m: [[13, 'x["text_color",{"color":"red"}]x["underline",{}]'], [5, 'x["underline",{}]']] },
    { id: "b", t: "quote", c: "marked", m: [[6, 'x["highlight",{"color":"blue"}]']] },
  ];
  const html = renderModel(model);
  expect(html).toBe('<p data-id="a"><span data-color="red"><u>red and under</u></span><u>lined</u></p>\n<blockquote data-id="b"><mark data-color="blue">marked</mark></blockquote>');
  const parsed = parseModel(new DOMParser().parseFromString(`<article data-page="1">${html}</article>`, "text/html").querySelector("article"));
  expect(revOf(parsed)).toBe(revOf(model));
  expect(renderModel(parsed)).toBe(html);
});


test("an underline written to the Yjs doc as a bare mark reads back as underline, not as an opaque mark", async () => {
  const { marksAttrs, marksFromAttributes } = await import("../../../src/page/ybind/marks.js");
  const written = marksAttrs([schema.marks.underline.create()]);
  expect(written).toEqual({ underline: true });
  const read = marksFromAttributes(written, "paragraph");
  expect(read.map((m) => m.type.name)).toEqual(["underline"]);
});
