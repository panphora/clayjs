/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { history, state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { createPageEditor, runPageCommand, setEditorActive } from "../../../src/page/editor.js";
import { blockMap } from "../../../src/page/model.js";
import { canon, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { EMOJI } from "../../../src/page/emoji-data.js";
import { createFeature, emojiEntries, emojiLibrary, filterEmoji, graphemes, isEmojiText } from "../../../src/page/features/emoji.js";

/**
 * Emoji: the Emoji action opens a picker of a small bundled glyph list — fetched the first
 * time somebody opens it — and choosing one writes that glyph into the document as plain
 * Unicode text. A joined family, a skin tone, a flag and a keycap each go in whole, as the
 * one grapheme a person sees; nothing is stored but the characters, so a reader needs no
 * code, no font and no network to show them, and the picker keeps no state of its own.
 */

const BLOCKS = () => ({
  a: { t: "paragraph", pos: "00000001", c: "Hello " },
  z: { t: "paragraph", pos: "00000002", c: "Neighbour line" },
});
const TABLE = { t: "table", pos: "00000001", cols: { c1: { pos: "00000001", name: "Pick" } }, rows: { r1: { pos: "00000001", cells: { c1: "Due" } } } };
const ALL = emojiEntries(EMOJI);
const SKIN_TONE = "👋🏽";
const FAMILY = "👨‍👩‍👧‍👦";
const FLAG = "🇫🇷";
const KEYCAP = "1️⃣";

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  jest.restoreAllMocks();
});

function open(blocks = BLOCKS()) {
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks });
  cleanups.push(() => { if (!view.isDestroyed) view.destroy(); mount.remove(); });
  return view;
}

const record = (view, id) => blockMap(view.state.doc)[id];
const blockPos = (view, id) => {
  let found = null;
  view.state.doc.forEach((node, pos) => { if (found === null && node.attrs.id === id) found = pos; });
  return found;
};
const endOf = (view, id) => blockPos(view, id) + 1 + view.state.doc.nodeAt(blockPos(view, id)).textContent.length;
const caret = (view, pos) => view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, pos)));
const select = (view, from, to) => view.dispatch(view.state.tr.setSelection(pmState.TextSelection.create(view.state.doc, from, to)));
const pickerEl = () => document.querySelector(".page-mention-picker");
const options = () => [...document.querySelectorAll(".page-mention-picker .page-menu-item")];
const keys = (view, key) => view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const start = (view, args = {}) => runPageCommand(view, "emoji", args);
// The row for one glyph, found by the glyph itself rather than by a position in the list.
const rowFor = (char) => options().findIndex((option) => option.textContent.startsWith(char));
const choose = (char) => {
  const index = rowFor(char);
  expect([char, index >= 0]).toEqual([char, true]);
  options()[index].click();
};

function articleOf(html, rev) {
  const parsed = new DOMParser().parseFromString(`<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${html}\n</article></body></html>`, "text/html");
  return parsed.querySelector("article");
}
const reopen = (blocks) => {
  const model = project(blocks);
  return parseModel(articleOf(renderModel(model), revOf(model)));
};

test("a joined family, a skin tone, a flag and a keycap each go in as one grapheme", async () => {
  expect([FAMILY, SKIN_TONE, FLAG, KEYCAP].map((glyph) => graphemes(glyph).length)).toEqual([1, 1, 1, 1]);
  // Counting code points or UTF-16 units would call the family seven things and split it.
  expect([...FAMILY]).toHaveLength(7);
  expect(isEmojiText(FAMILY)).toBe(true);
  expect(isEmojiText("ab")).toBe(false);
  expect(isEmojiText("")).toBe(false);

  const view = open();
  caret(view, endOf(view, "a"));
  for (const glyph of [FAMILY, SKIN_TONE, FLAG, KEYCAP]) {
    expect(await start(view)).toEqual({ ok: true, picker: true });
    choose(glyph);
    expect(pickerEl()).toBeNull();
  }
  expect(record(view, "a").c).toBe(`Hello ${FAMILY}${SKIN_TONE}${FLAG}${KEYCAP}`);
  // Plain Unicode: no mark, no attribute, nothing a reader would need this code to show.
  expect(record(view, "a").m).toBeUndefined();
  expect(graphemes(record(view, "a").c.slice(6))).toHaveLength(4);

  const saved = blockMap(view.state.doc);
  const article = articleOf(renderModel(project(saved)), revOf(project(saved)));
  expect(article.textContent).toContain(`${FAMILY}${SKIN_TONE}${FLAG}${KEYCAP}`);
  expect(article.querySelector("[data-page-mention], [data-page-date]")).toBeNull();
  expect(reopen(saved).find((item) => item.id === "a").c).toBe(`Hello ${FAMILY}${SKIN_TONE}${FLAG}${KEYCAP}`);
});

test("choosing an emoji replaces the selected text, and nothing before it", async () => {
  const view = open();
  // "Hello " with "ell" selected: the command keeps the selection while its list is open
  // and the glyph takes exactly that place.
  select(view, blockPos(view, "a") + 2, blockPos(view, "a") + 5);
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(view.state.selection.empty).toBe(false);
  choose("🔥");
  expect(record(view, "a").c).toBe("H🔥o ");
  expect(record(view, "a").m).toBeUndefined();
  // The caret sits after the whole glyph, not in the middle of its surrogate pair.
  expect(view.state.selection.from).toBe(blockPos(view, "a") + 2 + "🔥".length);
  expect(graphemes(view.state.doc.textBetween(blockPos(view, "a") + 1, view.state.selection.from))).toEqual(["H", "🔥"]);

  // A selection that moved after the list opened is not the one the command was asked for.
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  select(view, blockPos(view, "a") + 1, blockPos(view, "a") + 2);
  choose("⭐");
  expect(record(view, "a").c).toBe("H🔥o ");
});

test("an emoji in a table cell round-trips through the record and the binding", async () => {
  const view = open({ tbl: { ...TABLE }, z: { t: "paragraph", pos: "00000002", c: "Neighbour line" } });
  let cell = null;
  view.state.doc.descendants((node, pos) => { if (cell === null && node.type.name === "table_cell") cell = { node, pos }; });
  caret(view, cell.pos + 1 + cell.node.textContent.length);
  expect(await start(view)).toEqual({ ok: true, picker: true });
  choose(FAMILY);
  const saved = blockMap(view.state.doc);
  // No mark travels with a glyph, so the cell stays a plain string in the {c, m} codec.
  expect(saved.tbl.rows.r1.cells.c1).toBe(`Due${FAMILY}`);
  const article = articleOf(renderModel(project(saved)), revOf(project(saved)));
  expect(article.querySelector("td").textContent).toBe(`Due${FAMILY}`);
  expect(reopen(saved).find((item) => item.id === "tbl").rows[0].cells.c1).toBe(`Due${FAMILY}`);
});

test("the list loads the first time the picker opens, and only then", async () => {
  let loads = 0;
  const view = open();
  const feature = createFeature({ view, load: () => { loads += 1; return import("../../../src/page/emoji-data.js"); } });
  expect(loads).toBe(0);

  caret(view, endOf(view, "a"));
  expect(await feature.run({})).toEqual({ ok: true, picker: true });
  expect(loads).toBe(1);
  expect(options()).toHaveLength(ALL.length);
  expect(options()[0].textContent).toBe(ALL[0].name);
  keys(view, "Escape");
  expect(pickerEl()).toBeNull();

  // A second opening reuses the list it already has: the data is one download per session.
  expect(await feature.run({})).toEqual({ ok: true, picker: true });
  expect(loads).toBe(1);
  keys(view, "Escape");
});

test("a failed list fetch refuses, and the next opening asks again", async () => {
  let attempt = 0;
  const view = open();
  const feature = createFeature({
    view,
    load: () => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error("no network")) : import("../../../src/page/emoji-data.js");
    },
  });
  caret(view, endOf(view, "a"));
  const refused = await feature.run({});
  expect(refused.ok).toBe(false);
  expect(refused.code).toBe("unavailable");
  expect(pickerEl()).toBeNull();
  expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
  expect(record(view, "a").c).toBe("Hello ");

  expect(await feature.run({})).toEqual({ ok: true, picker: true });
  expect(attempt).toBe(2);
  choose(FAMILY);
  expect(record(view, "a").c).toBe(`Hello ${FAMILY}`);
});

test("the Emoji action offers the bundled list on a page, and a query narrows it", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(options()).toHaveLength(ALL.length);
  keys(view, "Escape");
  expect(pickerEl()).toBeNull();

  expect(await start(view, { query: "cat" })).toEqual({ ok: true, picker: true });
  expect(options().map((option) => option.textContent)).toEqual(["🐱 cat"]);
  keys(view, "Enter");
  expect(pickerEl()).toBeNull();
  expect(record(view, "a").c).toBe("Hello 🐱");

  // The glyph itself is a query too, and a word nobody carries offers nothing to pick.
  expect(filterEmoji(ALL, FLAG).map((entry) => entry.char)).toEqual([FLAG]);
  expect(await start(view, { query: "nothing at all" })).toEqual({ ok: true, picker: true });
  expect(options()).toEqual([]);
  expect(pickerEl().textContent).toBe("No emoji found");
  keys(view, "Enter");
  expect(record(view, "a").c).toBe("Hello 🐱");
});

test("an entry that is not one glyph is refused rather than written", async () => {
  const view = open();
  const feature = createFeature({ view, load: async () => ({ EMOJI: { Odd: [["ab", "two letters", "letters"], ["👀", "eyes", "look see"]] } }) });
  caret(view, endOf(view, "a"));
  expect(await feature.run({ query: "two" })).toEqual({ ok: true, picker: true });
  expect(options().map((option) => option.textContent)).toEqual(["ab two letters"]);
  options()[0].click();
  expect(pickerEl()).toBeNull();
  expect(record(view, "a").c).toBe("Hello ");

  expect(await feature.run({ query: "eyes" })).toEqual({ ok: true, picker: true });
  options()[0].click();
  expect(record(view, "a").c).toBe("Hello 👀");
});

test("undo takes the emoji back out and redo puts it back", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  choose(SKIN_TONE);
  expect(record(view, "a").c).toBe(`Hello ${SKIN_TONE}`);

  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe("Hello ");
  expect(record(view, "a").m).toBeUndefined();
  history.redoNoScroll(view.state, view.dispatch);
  expect(record(view, "a").c).toBe(`Hello ${SKIN_TONE}`);
  expect(record(view, "a").m).toBeUndefined();
});

test("the picker asks for no image, font or CDN, and keeps no state of its own", async () => {
  const calls = [];
  const originals = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest };
  cleanups.push(() => { for (const [name, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; } });
  globalThis.fetch = (...args) => { calls.push(args[0]); return Promise.reject(new Error("no network in this test")); };
  globalThis.XMLHttpRequest = class { open(method, url) { calls.push(url); } send() { calls.push("send"); } };
  const made = [];
  const createElement = document.createElement.bind(document);
  jest.spyOn(document, "createElement").mockImplementation((tag, ...rest) => { made.push(String(tag).toLowerCase()); return createElement(tag, ...rest); });

  const view = open();
  caret(view, endOf(view, "a"));
  const before = canon(blockMap(view.state.doc));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(options().length).toBeGreaterThan(100);
  expect(pickerEl().querySelectorAll("img, image, link, style, iframe, object, embed, source, canvas")).toHaveLength(0);
  choose(FAMILY);
  expect(record(view, "a").c).toBe(`Hello ${FAMILY}`);

  expect(calls).toEqual([]);
  expect(made.filter((tag) => ["img", "image", "link", "style", "iframe", "object", "embed", "source"].includes(tag))).toEqual([]);
  // The list lives outside the saved article, and nothing about it is written anywhere: no
  // storage entry, no element inside the editor, and no mark or attribute on the block.
  expect(view.dom.querySelector(".page-mention-picker")).toBeNull();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(record(view, "a").m).toBeUndefined();
  const saved = blockMap(view.state.doc);
  const article = articleOf(renderModel(project(saved)), revOf(project(saved)));
  expect(article.querySelector("[role=listbox], .page-mention-picker")).toBeNull();
  expect(before).not.toBe(canon(saved));
});

test("nothing about an open picker changes the document, and the exit takes it away", async () => {
  const view = open();
  caret(view, endOf(view, "a"));
  const before = canon(blockMap(view.state.doc));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(pickerEl()).not.toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(canon(blockMap(view.state.doc))).toBe(before);
  history.undoNoScroll(view.state, view.dispatch);
  expect(canon(blockMap(view.state.doc))).toBe(before);
  expect(pickerEl()).not.toBeNull();

  keys(view, "ArrowDown");
  expect(view.dom.getAttribute("aria-activedescendant")).toBe(pickerEl().id + "-1");
  setEditorActive(view, false);
  expect(pickerEl()).toBeNull();
  expect(view.dom.hasAttribute("aria-activedescendant")).toBe(false);
  // The disposed session hears nothing: a stale Enter writes nothing.
  keys(view, "Enter");
  expect(canon(blockMap(view.state.doc))).toBe(before);

  setEditorActive(view, true);
  caret(view, endOf(view, "a"));
  expect(await start(view)).toEqual({ ok: true, picker: true });
  expect(document.querySelectorAll(".page-mention-picker")).toHaveLength(1);
  keys(view, "Enter");
  expect(document.querySelectorAll(".page-mention-picker")).toHaveLength(0);
  expect(canon(blockMap(view.state.doc))).not.toBe(before);
});

test("a block that holds no text, and a list loaded after the edit left, refuse", async () => {
  const view = open({ tbl: { ...TABLE }, z: { t: "paragraph", pos: "00000002", c: "Neighbour line" } });
  let cell = null;
  view.state.doc.descendants((node, pos) => { if (cell === null && node.type.name === "table_cell") cell = { node, pos }; });
  // A caret in a table's own structure, outside any cell that takes text.
  caret(view, blockPos(view, "tbl") + 1);
  expect(await start(view)).toEqual({ ok: false, code: "stale-target" });
  expect(pickerEl()).toBeNull();
  expect(record(view, "z").c).toBe("Neighbour line");

  // A list that arrives after the edit was left writes nothing and leaves no picker.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const late = createFeature({ view, load: () => gate.then(() => import("../../../src/page/emoji-data.js")) });
  caret(view, endOf(view, "z"));
  const arriving = late.run({});
  late.dispose();
  release();
  expect(await arriving).toEqual({ ok: false, code: "not-editing" });
  expect(pickerEl()).toBeNull();
  expect(record(view, "z").c).toBe("Neighbour line");
});

test("the list is a cached fetch that a failure does not poison", async () => {
  let attempt = 0;
  const load = () => {
    attempt += 1;
    return attempt === 1 ? Promise.reject(new Error("no network")) : import("../../../src/page/emoji-data.js");
  };
  const library = emojiLibrary(load);
  await expect(library()).rejects.toThrow("no network");
  expect(await library()).toHaveLength(ALL.length);
  expect(await library()).toHaveLength(ALL.length);
  expect(attempt).toBe(2);
  expect(emojiEntries({}).length).toBe(0);
  expect(filterEmoji(ALL, "")).toBe(ALL);
});
