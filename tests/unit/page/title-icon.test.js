/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { history, model } from "../../../src/vendor/prosemirror.vendor.js";
import * as B from "../../../src/page/blocks.js";
import * as titleIcon from "../../../src/page/features/title-icon.js";
import { installPageFeature, runPageCommand } from "../../../src/page/editor.js";
import { DEFAULTS, OPAQUE, VALUE, canon, envelopeAttrs, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { documentTitle } from "../../../src/page/document-title.js";
import { blockMap } from "../../../src/page/model.js";
import { editor, posOf, select } from "./view-helpers.js";

/**
 * Page icon: one glyph on the title heading, drawn beside the title and never inside it.
 * The title is the document's first root H1, so a nested H1 is no title and an icon the
 * page does not show keeps sitting on the heading it was written to. A single grapheme is
 * the whole requirement — a joined family, a skin tone, a flag and a keycap each count as
 * one — and the command writes through the format gate, making the title when there is
 * none, in the same transaction as its decoration.
 */

const FAMILY = "👨‍👩‍👧‍👦";
const SKIN_TONE = "👋🏽";
const FLAG = "🇫🇷";
const KEYCAP = "1️⃣";
const RAINBOW = "🌈";

afterEach(() => { document.body.innerHTML = ""; });

const PAGE = () => [["h", "heading", "Notes", { level: 1 }], ["b", "paragraph", "Body"]];

// The gate answers as the page host's does when the document may use floor 1.
const open = (spec) => {
  const view = editor(spec);
  const asked = [];
  view.runFormatCommand = async (apply) => { asked.push(apply); return { status: "applied", floor: 1, result: await apply({ floor: 1 }) }; };
  installPageFeature({ view }, "titleIcon", titleIcon);
  return { view, asked };
};

const picker = () => document.querySelector(".page-mention-picker");
const options = () => [...document.querySelectorAll(".page-mention-picker .page-menu-item")];
const glyphs = () => options().map((option) => option.textContent.split(" ")[0]);
const choose = (char) => {
  const index = glyphs().indexOf(char);
  expect([char, index >= 0]).toEqual([char, true]);
  options()[index].click();
};
const record = (view, id) => blockMap(view.state.doc)[id];
const header = (view) => view.dom.querySelector("header[data-page-heading]");
const settle = () => new Promise((done) => setTimeout(done, 0));
const addIcon = async (view, char = RAINBOW) => {
  const started = runPageCommand(view, "titleIcon", {});
  const opening = await started;
  expect(opening.ok).toBe(true);
  await settle();
  if (char) choose(char);
  return started;
};

const articleOf = (inner, rev = "0") => {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`,
    "text/html",
  );
  return parsed.querySelector("article");
};
const reopen = (blocks) => {
  const shape = project(blocks);
  return { html: renderModel(shape), items: parseModel(articleOf(renderModel(shape), revOf(shape))) };
};

test("the first root H1 is the title, and the glyph is written to it alone", async () => {
  const { view, asked } = open([["p", "paragraph", "Before"], ...PAGE(), ["z", "heading", "Second", { level: 1 }]]);
  expect(titleIcon.titleOf(view.state.doc).node.attrs.id).toBe("h");

  await addIcon(view, RAINBOW);
  expect(asked).toHaveLength(1);
  expect(record(view, "h").pageIcon).toBe(RAINBOW);
  expect(record(view, "z").pageIcon).toBeUndefined();
  expect(record(view, "p").pageIcon).toBeUndefined();

  // The glyph is drawn beside the title, and a second root H1 does not show one.
  expect(header(view).getAttribute("data-id")).toBe("h");
  expect(header(view).querySelector("span[data-page-icon]").textContent).toBe(RAINBOW);
  expect(view.dom.querySelectorAll("header[data-page-heading]")).toHaveLength(1);
});

test("Add icon makes the title when the page has no H1: one admitted transaction, one undo step", async () => {
  const { view, asked } = open([["e", "paragraph", "Body"]]);
  const before = view.state.doc;
  await addIcon(view, RAINBOW);
  expect(asked).toHaveLength(1);

  expect(view.state.doc.childCount).toBe(2);
  const title = view.state.doc.child(0);
  expect([title.type.name, title.attrs.level, title.attrs.parent, title.attrs.pageIcon]).toEqual(["heading", 1, null, RAINBOW]);
  expect(title.attrs.id).toEqual(expect.stringMatching(/^b-/));
  expect(title.attrs.pos < view.state.doc.child(1).attrs.pos).toBe(true);
  expect([title.textContent, view.state.doc.child(1).textContent]).toEqual(["", "Body"]);
  expect(header(view).querySelector("h1").textContent).toBe("");

  history.undoNoScroll(view.state, view.dispatch);
  expect(view.state.doc.childCount).toBe(1);
  expect(canon(blockMap(view.state.doc))).toBe(canon(blockMap(before)));
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();
});

test("a nested H1 is no title: the command makes one rather than decorating the nested heading", async () => {
  const { view } = open([["t", "toggle", "Section", {}], ["n", "heading", "Inside it", { level: 1, parent: "t" }], ["b", "paragraph", "Body"]]);
  expect(titleIcon.titleOf(view.state.doc)).toBeNull();

  await addIcon(view, RAINBOW);
  expect(record(view, "n").pageIcon).toBeUndefined();
  const made = view.state.doc.child(0);
  expect([made.type.name, made.attrs.level, made.attrs.parent, made.attrs.pageIcon]).toEqual(["heading", 1, null, RAINBOW]);
  expect(header(view).querySelector("h1").textContent).toBe("");
  // The nested heading is untouched and the page still has exactly one title.
  expect(titleIcon.titleOf(view.state.doc).node.attrs.id).toBe(made.attrs.id);
});

test("the block id appears once, on the wrapper, and the decoration is outside the title text", async () => {
  const { view } = open(PAGE());
  await addIcon(view, RAINBOW);

  const box = header(view);
  expect(box.getAttribute("data-page-heading")).toBe("1");
  expect(view.dom.querySelectorAll('[data-id="h"]')).toHaveLength(1);
  expect(box.querySelector("h1").hasAttribute("data-id")).toBe(false);
  expect(box.querySelector("h1").textContent).toBe("Notes");
  expect(box.querySelector("span[data-page-icon]").getAttribute("aria-hidden")).toBe("true");
  expect(box.firstChild.tagName).toBe("SPAN");
});

test("the glyph stays out of the title, the search text and the plain words of the page", async () => {
  const { view } = open(PAGE());
  await addIcon(view, RAINBOW);

  const shape = project(blockMap(view.state.doc));
  expect(documentTitle(shape)).toBe("Notes");
  expect(shape.find((item) => item.id === "h").c).toBe("Notes");
  expect(shape.find((item) => item.id === "h").pageIcon).toBe(RAINBOW);
  expect(view.dom.querySelector("header[data-page-heading] h1").textContent).toBe("Notes");
});

test("a single glyph is the whole requirement, counted the way a person sees it", () => {
  expect([FAMILY, SKIN_TONE, FLAG, KEYCAP, RAINBOW].map((glyph) => titleIcon.isIconGlyph(glyph))).toEqual([true, true, true, true, true]);
  expect([...FAMILY]).toHaveLength(7);
  expect(["ab", "", "  ", "a b", null, 7].map((value) => titleIcon.isIconGlyph(value))).toEqual([false, false, false, false, false, false]);
  // The stored value is bounded in code points and in bytes, and a joined family is where
  // a single grapheme gets long.
  const long = "\u{1F468}" + "\u200D\u{1F469}".repeat(17);
  expect([...long].length).toBeGreaterThan(32);
  expect([titleIcon.isIconGlyph(long), titleIcon.isIconGlyph("\u{1F468}" + "\u200D\u{1F469}".repeat(3))]).toEqual([false, true]);

  // Without a segmenter the rule refuses rather than cutting a glyph in half.
  const segmenter = Intl.Segmenter;
  Object.defineProperty(Intl, "Segmenter", { value: undefined, configurable: true });
  try {
    expect(titleIcon.isIconGlyph(FAMILY)).toBe(false);
  } finally {
    Object.defineProperty(Intl, "Segmenter", { value: segmenter, configurable: true });
  }
  expect(titleIcon.isIconGlyph(FAMILY)).toBe(true);
});

test("a copied title pastes its words without a second icon, and undo takes it back", async () => {
  const { view } = open(PAGE());
  await addIcon(view, RAINBOW);

  const box = document.createElement("div");
  box.appendChild(B.clipboardSerializer.serializeFragment(model.Fragment.from([view.state.doc.child(0)])));
  const slice = B.clipboardParser.parseSlice(box);
  select(view, posOf(view, "b") - 1);
  view.dispatch(view.state.tr.replaceSelection(B.remapPasted(slice, view.state)));

  const kids = [...Array(view.state.doc.childCount).keys()].map((i) => view.state.doc.child(i));
  const pasted = kids.find((node) => node.textContent === "Notes" && node !== view.state.doc.child(0));
  expect(pasted).toBeTruthy();
  expect(pasted.attrs.pageIcon ?? null).toBeNull();
  expect(record(view, "h").pageIcon).toBe(RAINBOW);
  expect(view.dom.querySelectorAll("header[data-page-heading]")).toHaveLength(1);

  history.undoNoScroll(view.state, view.dispatch);
  expect(view.state.doc.childCount).toBe(2);
  expect(record(view, "h").pageIcon).toBe(RAINBOW);
  expect(header(view).querySelector("span[data-page-icon]").textContent).toBe(RAINBOW);
});

test("a writer that does not know the icon keeps it for this one, and this one writes the wrapper", () => {
  const env = envelopeAttrs({ pageIcon: RAINBOW });
  const theirs = articleOf(`<h1 data-id="h" ${OPAQUE}="${env[OPAQUE]}" ${VALUE}="${env[VALUE]}">Notes</h1>`);
  const items = parseModel(theirs);
  expect(items).toEqual([{ id: "h", t: "heading", level: 1, pageIcon: RAINBOW, c: "Notes" }]);

  const html = renderModel(items);
  expect(html).toBe(`<header data-id="h" data-page-heading="1"><span data-page-icon aria-hidden="true">${RAINBOW}</span><h1>Notes</h1></header>`);
  expect(canon(parseModel(articleOf(html)))).toBe(canon(items));
  // Read back through the record it is the same heading with the same glyph.
  expect(reopen({ h: { t: "heading", pos: "B", c: "Notes", level: 1, pageIcon: RAINBOW } }).items).toEqual(items);
});

test("an icon change and a concurrent title edit converge", async () => {
  const { view } = open(PAGE());
  const started = runPageCommand(view, "titleIcon", {});
  expect((await started).ok).toBe(true);
  await settle();

  // A peer renames the title while the list is open: the words are theirs, the glyph is ours.
  view.dispatch(view.state.tr.insertText(" today", posOf(view, "h", true)));
  choose(RAINBOW);
  await started;
  await settle();

  expect(view.state.doc.child(0).textContent).toBe("Notes today");
  expect(record(view, "h").pageIcon).toBe(RAINBOW);
  expect(header(view).querySelector("h1").textContent).toBe("Notes today");

  // A later rename keeps the glyph, and undo puts only the glyph back.
  view.dispatch(view.state.tr.insertText("!", posOf(view, "h", true)));
  expect([view.state.doc.child(0).textContent, record(view, "h").pageIcon]).toEqual(["Notes today!", RAINBOW]);
  history.undoNoScroll(view.state, view.dispatch);
  expect([view.state.doc.child(0).textContent, record(view, "h").pageIcon]).toEqual(["Notes today", RAINBOW]);
});

test("opening the list writes nothing, and a title that moves away while it is open refuses", async () => {
  const { view, asked } = open([["h", "heading", "Notes", { level: 1 }], ["z", "heading", "Second", { level: 1 }], ["b", "paragraph", "Body"]]);
  const before = view.state.doc;
  expect(await runPageCommand(view, "titleIcon", {})).toEqual({ ok: true, picker: true });
  expect(picker().hidden).toBe(false);
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();
  expect(view.state.doc).toBe(before);
  expect(asked).toHaveLength(0);
  history.undoNoScroll(view.state, view.dispatch);
  expect(view.state.doc).toBe(before);

  // The second H1 moves in front while the list is open: the heading the command was asked
  // for is no longer the title, so the glyph is written nowhere.
  const at = posOf(view, "z") - 1;
  const moved = view.state.doc.child(1);
  view.dispatch(view.state.tr.delete(at, at + moved.nodeSize).insert(0, moved));
  const after = view.state.doc;
  expect(titleIcon.titleOf(after).node.attrs.id).toBe("z");
  choose(RAINBOW);
  await settle();
  await settle();

  expect(view.state.doc).toBe(after);
  expect(view.state.doc.child(0).attrs.pageIcon ?? null).toBeNull();
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();
});

test("reordering the root H1s moves ownership, and the saved page decorates only the title", async () => {
  const saved = (view) => renderModel(project(blockMap(view.state.doc)));
  const { view } = open([["h", "heading", "Notes", { level: 1 }], ["z", "heading", "Second", { level: 1 }], ["b", "paragraph", "Body"]]);
  await addIcon(view, RAINBOW);
  expect(header(view).querySelector("h1").textContent).toBe("Notes");
  expect(saved(view)).toContain(`<header data-id="h" data-page-heading="1">`);

  // The second H1 moves to the front: it is the title now, and it carries no icon.
  const at = posOf(view, "z") - 1;
  const moved = view.state.doc.child(1);
  view.dispatch(view.state.tr.delete(at, at + moved.nodeSize).insert(0, moved));
  expect(titleIcon.titleOf(view.state.doc).node.attrs.id).toBe("z");
  // The displaced heading keeps its own attribute, and the page shows no icon for it.
  expect(record(view, "h").pageIcon).toBe(RAINBOW);
  expect(saved(view)).not.toContain("data-page-icon");

  // The command writes to the title the document has now.
  await addIcon(view, SKIN_TONE);
  expect(record(view, "z").pageIcon).toBe(SKIN_TONE);
  expect(record(view, "h").pageIcon).toBe(RAINBOW);
  const html = saved(view);
  expect(html.match(/data-page-icon/g)).toHaveLength(1);
  expect(html).toContain(`<header data-id="z" data-page-heading="1">`);
});

test("a gate that refuses writes nothing, and a page with no gate never asks one", async () => {
  const { view } = open(PAGE());
  const before = view.state.doc;
  view.runFormatCommand = async () => ({ status: "upgrade-required", code: "page-format-upgrade-required" });
  expect((await runPageCommand(view, "titleIcon", {})).ok).toBe(true);
  await settle();
  choose(RAINBOW);
  await settle();
  await settle();
  expect(view.state.doc).toBe(before);
  expect(record(view, "h").pageIcon).toBeUndefined();
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();

  delete view.runFormatCommand;
  expect(await titleIcon.createFeature({ view }).run()).toEqual({ ok: true, picker: true });
  choose(RAINBOW);
  await settle();
  await settle();
  expect(view.state.doc).toBe(before);
  expect(view.dom.querySelector("header[data-page-heading]")).toBeNull();
});

test("the title's attribute is one of the heading's defaults, so a page without one writes nothing new", () => {
  expect(DEFAULTS.heading).toEqual({ parent: null, level: 2, pageIcon: null, pageCoverSrc: null, pageCoverAlt: "", pageCoverX: 50, pageCoverY: 50 });
  const shape = project({ h: { t: "heading", pos: "B", c: "Notes", level: 1 } });
  expect(shape[0]).toEqual({ id: "h", t: "heading", level: 1, c: "Notes" });
  expect(renderModel(shape)).toBe('<h1 data-id="h">Notes</h1>');
  expect(canon(parseModel(articleOf(renderModel(shape))))).toBe(canon(shape));
});
