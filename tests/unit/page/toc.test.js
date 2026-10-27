import { history } from "../../../src/vendor/prosemirror.vendor.js";
import * as I from "../../../src/page/items.js";
import * as tocFeature from "../../../src/page/features/toc.js";
import { installPageFeature } from "../../../src/page/editor.js";
import { collapseKey, hiddenRanges, outline, setOpen } from "../../../src/page/blocks.js";
import { DEFAULTS, OPAQUE, VALUE, canon, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { blockMap } from "../../../src/page/model.js";
import { requiredPageFormat } from "../../../src/page/format-level.js";
import { captureFormat } from "../../../src/server/rooms/index.js";
import { seedPageFromArticle } from "../../../src/page/ybind/migrate.js";
import { TOC_LABEL, blockAnchor, idFromHref, tocEntries } from "../../../src/page/toc.js";
import { followTocLink } from "../../../src/page/features/toc.js";
import { followTocLink as followSavedLink } from "../../../src/page/view.js";
import { editor, posOf, select, typeText, key } from "./view-helpers.js";

/**
 * The table of contents: an atom `toc` block that stores no heading list and draws one
 * from the document every time it changes. Entries are the document's headings in order,
 * toggle headings and headings inside closed toggles included, never the title H1. A link
 * names its block by a stable anchor, so renames and moves keep it working; following one
 * reveals a collapsed target without saving, dirtying, entering history or broadcasting.
 * The block is a floor-1 format, so its first write asks the format gate.
 */

const articleOf = (inner, rev = "0") => {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`,
    "text/html",
  );
  return parsed.querySelector("article");
};

const b64encode = (text) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const envelopeOf = (value) => ` ${OPAQUE}="1" ${VALUE}="${b64encode(JSON.stringify(value))}"`;

// The block record a spec makes, without a text field on the blocks that hold none.
const blocksOf = (spec) => {
  const out = {};
  spec.forEach(([id, t, c, attrs = {}], i) => { out[id] = { t, pos: String.fromCharCode(66 + i), ...(c === null ? {} : { c }), ...attrs }; });
  return out;
};
const TO = () => {
  const view = editor([["e", "paragraph", ""]]);
  const asked = [];
  view.runFormatCommand = async (apply) => { asked.push(true); return { status: "applied", floor: 1, result: await apply({ floor: 1 }) }; };
  installPageFeature({ view }, "toc", tocFeature);
  return { view, asked };
};
const record = (view, id) => blockMap(view.state.doc)[id];
const links = (view) => [...view.dom.querySelectorAll(".page-toc nav a")].map((a) => [a.textContent, a.getAttribute("href")]);

// A page holding a title, two headings and a toc, as blocks.
const PAGE = () => [
  ["h", "heading", "The title", { level: 1 }],
  ["a", "heading", "Alpha", { level: 2 }],
  ["t", "toc", null, { maxLevel: 3 }],
  ["b", "heading", "Beta", { level: 3 }],
];

test("the menu offers Table of contents, and a pick writes one block through the format gate", async () => {
  const row = I.MENU_ITEMS.find((i) => i.key === "toc");
  expect([row.label, row.insert]).toEqual(["Table of contents", "toc"]);
  expect(I.rankItems(I.MENU_ITEMS, "toc")[0].key).toBe("toc");

  const { view, asked } = TO();
  select(view, posOf(view, "e"));
  for (const ch of "/toc") typeText(view, ch);
  key(view, "Enter");
  expect(asked).toHaveLength(1);
  await new Promise((done) => setTimeout(done, 0));

  expect(record(view, "e")).toEqual({ t: "toc", pos: expect.any(String), maxLevel: 3 });
  // A block that holds no caret is followed by the line the pick leaves you in.
  expect(view.state.doc.child(1).type.name).toBe("paragraph");
});

test("a gate that refuses writes no toc, and neither does a page with no gate", async () => {
  const { view } = TO();
  const before = view.state.doc;
  view.runFormatCommand = async () => ({ status: "upgrade-required", code: "page-format-upgrade-required" });
  expect(await I.runTocItem(view, 0)).toEqual({ ok: false, code: "page-format-upgrade-required", retry: false });
  expect(view.state.doc).toBe(before);
  expect(record(view, "e")).toEqual({ t: "paragraph", pos: expect.any(String), c: "" });

  delete view.runFormatCommand;
  expect(await I.runTocItem(view, 0)).toEqual({ ok: false, code: "page-format-unsupported" });
  expect(view.state.doc).toBe(before);
  history.undoNoScroll(view.state, view.dispatch);
  expect(view.state.doc.child(0).type.name).toBe("paragraph");
});

test("the entries are the document's headings in order: toggle headings in, title out, closed toggles included", () => {
  const model = project(blocksOf([
    ["h", "heading", "The title", { level: 1 }],
    ["a", "heading", "Alpha", { level: 2 }],
    ["t", "toggle", "Collapsed", { level: 2, open: false }],
    ["b", "heading", "Inside it", { level: 3, parent: "t" }],
    ["c", "callout", "Not a heading"],
    ["d", "heading", "", { level: 2 }],
    ["e", "paragraph", "Plain"],
  ]));
  expect(tocEntries(model)).toEqual([
    { id: "a", level: 2, text: "Alpha" },
    { id: "t", level: 2, text: "Collapsed" },
    { id: "b", level: 3, text: "Inside it" },
    { id: "d", level: 2, text: "Untitled" },
  ]);

  // A nested H1 is no title, and maxLevel keeps the shallower headings only.
  const nested = project(blocksOf([["h", "heading", "The title", { level: 1 }], ["t", "toggle", "Section", { level: 1, parent: null }], ["b", "heading", "Deeper", { level: 3 }]]));
  expect(tocEntries(nested).map((e) => e.id)).toEqual(["t", "b"]);
  expect(tocEntries(nested, 1).map((e) => e.id)).toEqual(["t"]);
});

test("two headings with the same words keep their own entries and their own anchors", () => {
  const model = project(blocksOf([["a", "heading", "Notes", { level: 2 }], ["b", "heading", "Notes", { level: 2 }]]));
  const entries = tocEntries(model);
  expect(entries.map((e) => e.text)).toEqual(["Notes", "Notes"]);
  expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  expect(blockAnchor("a")).not.toBe(blockAnchor("b"));
});

test("a renamed heading keeps its anchor, a moved one keeps it and takes its new place, a deleted one leaves no entry", () => {
  const anchorOf = (spec, id) => {
    const model = project(blocksOf(spec));
    const html = renderModel([{ id: "t", t: "toc" }, ...model]);
    return [...articleOf(html).querySelectorAll("nav a")].find((a) => a.textContent !== undefined && a.getAttribute("href") === `#${blockAnchor(id)}`)?.getAttribute("href") ?? null;
  };
  const page = (heading, extra = []) => [["h", "heading", "The title", { level: 1 }], ["a", "heading", heading, { level: 2 }], ...extra];
  expect(anchorOf(page("Alpha"), "a")).toBe(`#${blockAnchor("a")}`);
  expect(anchorOf(page("Renamed"), "a")).toBe(`#${blockAnchor("a")}`);

  const moved = project(blocksOf([["h", "heading", "The title", { level: 1 }], ["z", "heading", "Zulu", { level: 2 }], ["a", "heading", "Alpha", { level: 2 }]]));
  expect(tocEntries(moved).map((e) => e.id)).toEqual(["z", "a"]);
  expect(blockAnchor("a")).toBe(blockAnchor("a"));

  const deleted = project(blocksOf([["h", "heading", "The title", { level: 1 }], ["z", "heading", "Zulu", { level: 2 }]]));
  expect(tocEntries(deleted).map((e) => e.id)).toEqual(["z"]);
});

test("the saved page is a nav of nested links that reads back as one block and never as writing", () => {
  const model = project(blocksOf(PAGE()));
  const html = renderModel(model);
  expect(html).toContain(`<nav aria-label="${TOC_LABEL}" data-type="toc" data-id="t" data-max-level="3">`);
  expect(html).toContain(`<a href="#${blockAnchor("a")}">Alpha</a><ul><li><a href="#${blockAnchor("b")}">Beta</a></li></ul>`);
  // The title is the page's, not an entry: no link names it.
  expect(articleOf(html).querySelector("nav").textContent).toBe("AlphaBeta");

  const reopened = parseModel(articleOf(html, revOf(model)));
  expect(reopened).toEqual([
    { id: "h", t: "heading", level: 1, c: "The title" },
    { id: "a", t: "heading", c: "Alpha" },
    { id: "t", t: "toc", maxLevel: 3 },
    { id: "b", t: "heading", level: 3, c: "Beta" },
  ]);
  expect(canon(reopened)).toBe(canon(model));
  expect(DEFAULTS.toc).toEqual({ parent: null, maxLevel: null });
});

test("a toc stores no heading list: the block's record is its type, order, place and depth", () => {
  const editorView = editor(PAGE());
  const toc = blockMap(editorView.state.doc).t;
  expect(toc).toEqual({ t: "toc", pos: "D", maxLevel: 3 });
  expect(JSON.stringify(toc)).not.toContain("Alpha");
  // Its saved record is the same four fields after a rename and after a move.
  const blocks = blocksOf(PAGE());
  expect(blocks.t).toEqual({ t: "toc", pos: "D", maxLevel: 3 });
  const model = project(blocks);
  expect(renderModel(model)).toContain(`${blockAnchor("a")}`);
  expect(JSON.stringify(parseModel(articleOf(renderModel(model))).find((i) => i.t === "toc"))).toBe('{"id":"t","t":"toc","maxLevel":3}');
});

test("the node view draws the entries and follows a rename once the document changes", () => {
  const view = editor(PAGE());
  installPageFeature({ view }, "toc", tocFeature);
  expect(links(view)).toEqual([["Alpha", `#${blockAnchor("a")}`], ["Beta", `#${blockAnchor("b")}`]]);

  const at = posOf(view, "a");
  view.dispatch(view.state.tr.insertText("One", at + 5));
  expect(links(view)).toEqual([["AlphaOne", `#${blockAnchor("a")}`], ["Beta", `#${blockAnchor("b")}`]]);
  expect(view.state.doc.child(1).textContent).toBe("AlphaOne");
});

test("following a link reveals collapsed ancestors without saving, dirtying, entering history or broadcasting", () => {
  const spec = [
    ["t", "toggle", "Collapsed", { open: false }],
    ["b", "heading", "Inside", { level: 2, parent: "t" }],
    ["c", "toc", null, { maxLevel: 3 }],
  ];
  const view = editor(spec);
  installPageFeature({ view }, "toc", tocFeature);
  const before = view.state.doc;
  const saved = [];
  view.dispatch = ((dispatch) => (tr) => { if (tr.docChanged) saved.push(tr); return dispatch(tr); })(view.dispatch);

  expect(hiddenRanges(outline(view.state.doc))).toHaveLength(1);
  expect(followTocLink(view, "b")).not.toBeNull();

  expect(view.state.doc).toBe(before);
  expect(saved).toHaveLength(0);
  expect(hiddenRanges(outline(view.state.doc, collapseKey.getState(view.state).reveal))).toHaveLength(0);
  expect(collapseKey.getState(view.state).ranges).toHaveLength(0);
  expect(view.dom.querySelector('[data-id="b"]').classList.contains("page-hidden")).toBe(false);
  expect(view.state.selection.from).toBe(posOf(view, "b"));

  // The saved document still says the toggle is closed, and no undo step was made.
  expect(blockMap(before).t).toEqual({ t: "toggle", pos: expect.any(String), c: "Collapsed" });
  history.undoNoScroll(view.state, view.dispatch);
  expect(blockMap(view.state.doc).t).toEqual(blockMap(before).t);
  expect(view.state.doc).toBe(before);

  // An explicit toggle takes the override back.
  view.dispatch(setOpen(view.state, 0, true, outline(view.state.doc, collapseKey.getState(view.state).reveal)));
  expect(collapseKey.getState(view.state).reveal.size).toBe(0);
  expect(blockMap(view.state.doc).t.open).toBe(true);
});

test("a missing target is a no-op that says so", () => {
  const view = editor(PAGE());
  installPageFeature({ view }, "toc", tocFeature);
  const before = view.state.doc;
  expect(followTocLink(view, "gone")).toBeNull();
  expect(view.state.doc).toBe(before);
  expect(view.dom.parentElement.querySelector(".page-live").textContent).toContain("gone");
});

test("the saved nav works without the editor: a link opens the closed bodies above its target", async () => {
  const model = project(blocksOf([
    ["t", "toggle", "Collapsed", { open: false }],
    ["u", "toggle", "Inner", { open: false, parent: "t" }],
    ["b", "heading", "Deep", { level: 2, parent: "u" }],
    ["c", "toc", null, { maxLevel: 3 }],
  ]));
  const article = articleOf(renderModel(model));
  const pageOf = article.ownerDocument;
  pageOf.body.appendChild(article);
  const details = [...article.querySelectorAll("details")];
  expect(details.map((d) => d.open)).toEqual([false, false]);

  const link = article.querySelector("nav a");
  expect(await followSavedLink(article, link.getAttribute("href"))).toBe(article.querySelector('[data-id="b"]'));
  expect(details.map((d) => d.open)).toEqual([true, true]);
  // A link whose block is gone changes nothing.
  expect(await followSavedLink(article, `#${blockAnchor("gone")}`)).toBeNull();
  expect(details.map((d) => d.open)).toEqual([true, true]);
});

test("an old copied block link resolves, and a link to anywhere else is left alone", async () => {
  expect(idFromHref(`#${blockAnchor("b-1")}`)).toBe("b-1");
  expect(idFromHref(`#${encodeURIComponent("b-1")}`)).toBe("b-1");
  expect(idFromHref("#b-1")).toBe("b-1");
  expect(idFromHref("https://example.com/page#b-1")).toBe("https://example.com/page#b-1");

  const model = project(blocksOf([["b", "heading", "Beta", { level: 2 }], ["c", "toc", null, { maxLevel: 3 }]]));
  const article = articleOf(renderModel(model));
  expect(await followSavedLink(article, "#b")).toBe(article.querySelector('[data-id="b"]'));
});

test("a toc arriving from a peer or a paste needs floor 1, and a page without one needs none", () => {
  const fileOf = (records) => {
    const model = project(records);
    const inner = renderModel(model);
    const value = seedPageFromArticle(articleOf(inner, revOf(model)));
    return `<!doctype html><html><body><article data-page="1" data-rev="${revOf(model)}">\n${inner}\n</article><script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script></body></html>`;
  };
  const withToc = blocksOf(PAGE());
  const without = blocksOf(PAGE().filter(([id]) => id !== "t"));
  expect(requiredPageFormat(project(withToc))).toBe(1);
  expect(requiredPageFormat(project(without))).toBe(0);
  expect(captureFormat(fileOf(withToc))).toBe(1);
  expect(captureFormat(fileOf(without))).toBe(0);
});

test("an older writer\u0027s envelope holding a toc record opens as that toc", () => {
  const article = articleOf(`<div data-id="t"${envelopeOf({ t: "toc", maxLevel: 4 })}>Contents</div><p data-id="z">Neighbour line</p>`);
  expect(parseModel(article)).toEqual([
    { id: "t", t: "toc", maxLevel: 4 },
    { id: "z", t: "paragraph", c: "Neighbour line" },
  ]);
});

test("an older writer's toc record comes back as the toc it stood for, beside a neighbour's edit", () => {
  const records = { t: { t: "toc", pos: "00000002", maxLevel: 3 }, z: { t: "paragraph", pos: "00000009", c: "Neighbour line" } };
  const model = project(records);
  expect(model).toEqual([
    { id: "t", t: "toc", maxLevel: 3 },
    { id: "z", t: "paragraph", c: "Neighbour line" },
  ]);
  const reopened = parseModel(articleOf(renderModel(model), revOf(model)));
  expect(reopened).toEqual(model);
  expect(reopened[0]).toEqual({ id: "t", t: "toc", maxLevel: 3 });
});
