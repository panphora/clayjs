import { history } from "../../../src/vendor/prosemirror.vendor.js";
import * as I from "../../../src/page/items.js";
import * as B from "../../../src/page/blocks.js";
import { guardSelection, hiddenRanges, moveBlock, outline, siblingSpan, subtreeRange } from "../../../src/page/blocks.js";
import { OPAQUE, VALUE, canon, envelopeAttrs, parseModel, project, renderModel, revOf } from "../../../src/page/projection.js";
import { documentTitle } from "../../../src/page/document-title.js";
import { blockMap } from "../../../src/page/model.js";
import { schema } from "../../../src/page/schema.js";
import { state as pmState } from "../../../src/vendor/prosemirror.vendor.js";
import { at, caret, make, run, short } from "./blocks-helpers.js";
import { editor, posOf, select, shape, typeText, key } from "./view-helpers.js";

/**
 * Toggle headings: a toggle that keeps a nullable `level` from 1 to 3, offered by Slash
 * and Turn into, saved as a `details` with a heading in its summary. Type, parent,
 * children, collapse, selection guards and move spans are a plain toggle's, and a toggle
 * heading never owns the document title. A level is a floor-1 format, so the first one
 * written asks the format gate before anything changes.
 */

const { TextSelection } = pmState;

afterEach(() => { document.body.innerHTML = ""; });

const TOGGLE_H2 = () => I.BLOCK_TYPES.find((b) => b.key === "toggle-h2");
const TOGGLE_PLAIN = () => I.BLOCK_TYPES.find((b) => b.key === "toggle");
const row = (view, label) => [...view.dom.parentElement.querySelectorAll(".page-menu-item")]
  .find((r) => r.querySelector(".page-menu-label").textContent === label);
const checked = (view) => [...view.dom.parentElement.querySelectorAll(".page-menu-item")]
  .filter((r) => r.getAttribute("aria-checked") === "true")
  .map((r) => r.querySelector(".page-menu-label").textContent);
const record = (view, id) => blockMap(view.state.doc)[id];
const settle = () => new Promise((done) => setTimeout(done, 0));

// The gate answers as the page host's does when the document may use floor 1.
const open = (spec) => {
  const view = editor(spec);
  const asked = [];
  view.runFormatCommand = async (apply) => { asked.push(apply); return { status: "applied", floor: 1, result: await apply({ floor: 1 }) }; };
  return { view, asked };
};

const articleOf = (inner, rev = "0") => {
  const parsed = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body><article data-page="1" data-rev="${rev}">\n${inner}\n</article></body></html>`,
    "text/html",
  );
  return parsed.querySelector("article");
};

const BODY = () => [["t", "toggle", "Summary", { open: true }], ["b", "paragraph", "Body", { parent: "t" }], ["z", "paragraph", "Z"]];
const heading = (spec) => spec.map(([id, t, c, attrs]) => (id === "t" ? [id, t, c, { ...attrs, level: 2 }] : [id, t, c, attrs]));

test("Slash and Turn into list Toggle heading 1, 2 and 3, and `> ` still writes a plain toggle", () => {
  const rows = I.BLOCK_TYPES.filter((b) => b.type === "toggle" && b.attrs?.level != null);
  expect(rows.map((r) => [r.label, r.attrs.level])).toEqual([["Toggle heading 1", 1], ["Toggle heading 2", 2], ["Toggle heading 3", 3]]);
  expect(I.rankItems(I.MENU_ITEMS, "toggle heading").slice(0, 3).map((i) => i.key)).toEqual(["toggle-h1", "toggle-h2", "toggle-h3"]);

  const { view } = open([["e", "paragraph", ""]]);
  select(view, posOf(view, "e"));
  typeText(view, ">");
  typeText(view, " ");
  const node = view.state.doc.child(0);
  expect([node.type.name, node.attrs.open, node.attrs.level]).toEqual(["toggle", true, null]);
});

test("Turn into makes the caret's toggle a toggle heading and leaves its body where it is", async () => {
  const { view, asked } = open(BODY());
  select(view, posOf(view, "t"));
  view.dom.parentElement.querySelector(".page-tool-turn").click();
  row(view, "Toggle heading 2").click();
  expect(asked).toHaveLength(1);
  await settle();

  expect(record(view, "t")).toEqual({ t: "toggle", pos: expect.any(String), c: "Summary", open: true, level: 2 });
  expect(record(view, "b")).toEqual({ t: "paragraph", pos: expect.any(String), c: "Body", parent: "t" });
  expect(shape(view)).toBe("Summary | Body<t | Z");

  // The row the menu shows as current is the one the block now is.
  view.dom.parentElement.querySelector(".page-tool-turn").click();
  expect(checked(view)).toEqual(["Toggle heading 2"]);
});

test("a slash pick turns the line into a toggle heading through the same gate", async () => {
  const { view, asked } = open([["e", "paragraph", ""], ["z", "paragraph", "Z"]]);
  select(view, posOf(view, "e"));
  for (const ch of "/toggle heading 2") typeText(view, ch);
  key(view, "Enter");
  expect(asked).toHaveLength(1);
  await settle();

  expect(record(view, "e")).toEqual({ t: "toggle", pos: expect.any(String), open: true, level: 2, c: "" });
  expect(view.state.doc.child(0).attrs.id).toBe("e");
});

test("the summary converts without moving children, and keeps the toggle's own id, key and open state", async () => {
  const { view } = open(BODY());
  const before = record(view, "t");

  expect(await I.turnBlocks(view, TOGGLE_H2(), ["t"])).toEqual({ ok: true });
  expect(record(view, "t")).toEqual({ ...before, level: 2 });
  expect(record(view, "b")).toEqual({ t: "paragraph", pos: expect.any(String), c: "Body", parent: "t" });
  expect(blockMap(view.state.doc).z.parent).toBeUndefined();
  expect(shape(view)).toBe("Summary | Body<t | Z");
});

test("nested toggles keep their nesting when the outer one becomes a heading", async () => {
  const spec = [["t", "toggle", "Outer", { open: true }], ["u", "toggle", "Inner", { open: false, parent: "t" }], ["b", "paragraph", "Deep", { parent: "u" }], ["z", "paragraph", "Z"]];
  const { view } = open(spec);
  await I.turnBlocks(view, TOGGLE_H2(), ["t"]);

  expect(record(view, "t").level).toBe(2);
  expect(record(view, "u").level).toBeUndefined();
  expect(record(view, "u").parent).toBe("t");
  expect(record(view, "b").parent).toBe("u");
  const ents = outline(view.state.doc);
  expect(ents.map((e) => e.depth)).toEqual([0, 1, 2, 0]);
  expect(ents.map((e) => e.hidden)).toEqual([false, false, true, false]);
});

test("a toggle heading moves and deletes with its body exactly as a plain toggle does", () => {
  const spans = (spec) => {
    const s = make(spec);
    const ents = outline(s.doc);
    return [subtreeRange(ents, 0), siblingSpan(ents, 0, 1)];
  };
  expect(spans(heading(BODY()))).toEqual(spans(BODY()));

  const moved = (spec) => run(caret(make(spec), "t"), moveBlock(1));
  expect(short(moved(heading(BODY())))).toBe("Z | Summary | Body<t");
  expect(short(moved(heading(BODY())))).toBe(short(moved(BODY())));

  const deleted = (spec) => {
    const s = make(spec);
    const { from, to } = subtreeRange(outline(s.doc), 0);
    const out = s.apply(s.tr.delete(from, to));
    const ids = [];
    out.doc.forEach((n) => ids.push(n.attrs.id));
    return ids;
  };
  expect(deleted(heading(BODY()))).toEqual(deleted(BODY()));
  expect(deleted(heading(BODY()))).toEqual(["z"]);
});

test("the closed-toggle keyboard guard takes a toggle heading's hidden body too", () => {
  const guarded = (spec) => {
    const s = make(spec);
    const ranges = hiddenRanges(outline(s.doc));
    expect(ranges).toHaveLength(1);
    const sel = TextSelection.create(s.doc, at(s, "b") + 1);
    const next = guardSelection(s.doc, sel, ranges, -1);
    return [ranges[0].from, ranges[0].to, next.head];
  };
  expect(guarded(heading([["t", "toggle", "Summary", { level: 2 }], ["b", "paragraph", "Body", { parent: "t" }], ["z", "paragraph", "Z"]])))
    .toEqual(guarded([["t", "toggle", "Summary", {}], ["b", "paragraph", "Body", { parent: "t" }], ["z", "paragraph", "Z"]]));
});

test("the saved page is a details with a heading in its summary, and reads back as a toggle heading", () => {
  const blocks = { t: { t: "toggle", pos: "00000001", c: "Summary", level: 2 }, b: { t: "paragraph", pos: "00000002", c: "Body", parent: "t" } };
  const model = project(blocks);
  expect(renderModel(model)).toBe('<details data-id="t"><summary><h2>Summary</h2></summary>\n<p data-id="b">Body</p>\n</details>');

  const reopened = parseModel(articleOf(renderModel(model), revOf(model)));
  expect(reopened).toEqual([{ id: "t", t: "toggle", level: 2, c: "Summary" }, { id: "b", t: "paragraph", parent: "t", c: "Body" }]);
  expect(canon(reopened)).toBe(canon(model));

  for (const level of [1, 3]) {
    const shown = renderModel(project({ t: { ...blocks.t, level } }));
    expect(shown).toContain(`<summary><h${level}>Summary</h${level}></summary>`);
    expect(parseModel(articleOf(shown))[0].level).toBe(level);
  }
});

test("a plain toggle keeps today's summary, and a level outside 1 to 3 is no level at all", () => {
  const plain = project({ t: { t: "toggle", pos: "00000001", c: "Summary" } });
  expect(renderModel(plain)).toBe('<details data-id="t"><summary>Summary</summary>\n</details>');
  expect(Object.hasOwn(parseModel(articleOf(renderModel(plain)))[0], "level")).toBe(false);

  for (const level of [0, 4, "2", 2.5, null]) {
    const item = project({ t: { t: "toggle", pos: "00000001", c: "Summary", level } })[0];
    expect([level, item.level ?? null]).toEqual([level, null]);
    expect(renderModel([item])).toBe('<details data-id="t"><summary>Summary</summary>\n</details>');
  }
});

test("a toggle heading never owns the document title", () => {
  const withHeading = project({
    t: { t: "toggle", pos: "00000001", c: "Collapsible", level: 1 },
    h: { t: "heading", pos: "00000002", c: "The title", level: 1 },
  });
  expect(documentTitle(withHeading)).toBe("The title");
  expect(documentTitle(withHeading.filter((item) => item.id !== "h"))).toBe("Untitled");
  expect(documentTitle(project({ t: { t: "toggle", pos: "00000001", c: "Collapsed body title", level: 2 } }))).toBe("Untitled");
});

test("a writer that does not know the level keeps it for this one", () => {
  // The level a released writer has no field for rides beside its summary in the inert
  // envelope, and the summary it writes is the text it reads.
  const env = envelopeAttrs({ level: 2 });
  const theirs = articleOf(`<details data-id="t" ${OPAQUE}="${env[OPAQUE]}" ${VALUE}="${env[VALUE]}"><summary>Summary</summary></details>`);
  const items = parseModel(theirs);
  expect(items).toEqual([{ id: "t", t: "toggle", level: 2, c: "Summary" }]);

  // Opened here it is a toggle heading again, and saving it writes the heading form.
  const html = renderModel(items);
  expect(html).toBe('<details data-id="t"><summary><h2>Summary</h2></summary>\n</details>');
  expect(canon(parseModel(articleOf(html)))).toBe(canon(items));
});

test("a gate that refuses writes nothing and leaves the toggle's level unchanged", async () => {
  const { view } = open(BODY());
  const asked = [];
  view.runFormatCommand = async () => { asked.push(true); return { status: "upgrade-required", code: "page-format-upgrade-required" }; };
  const before = view.state.doc;

  expect(await I.turnBlocks(view, TOGGLE_H2(), ["t"])).toEqual({ ok: false, code: "page-format-upgrade-required", retry: false });
  expect(asked).toHaveLength(1);
  // Nothing was dispatched at all, so no level was written and history has no entry.
  expect(view.state.doc).toBe(before);
  expect(record(view, "t").level).toBeUndefined();
  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "t")).toEqual({ t: "toggle", pos: expect.any(String), c: "Summary", open: true });
});

test("a page with no format gate refuses a toggle heading and writes nothing", async () => {
  const { view } = open(BODY());
  delete view.runFormatCommand;
  const before = view.state.doc;
  expect(await I.turnBlocks(view, TOGGLE_H2(), ["t"])).toEqual({ ok: false, code: "page-format-unsupported" });
  expect(view.state.doc).toBe(before);
});

test("turning a toggle heading back into a plain toggle asks no gate", () => {
  const { view } = open(heading(BODY()));
  expect(record(view, "t").level).toBe(2);
  view.runFormatCommand = () => { throw new Error("a plain toggle writes no new format"); };

  expect(I.turnBlocks(view, TOGGLE_PLAIN(), ["t"])).toEqual({ ok: true });
  expect(record(view, "t")).toEqual({ t: "toggle", pos: expect.any(String), c: "Summary", open: true });
});

test("a stale target or a block whose marks the type would erase refuses and writes nothing", async () => {
  const { view } = open(BODY());
  const before = view.state.doc;
  expect(await I.turnBlocks(view, TOGGLE_H2(), ["gone"])).toEqual({ ok: false, code: "stale-target" });
  expect(await I.turnBlocks(view, TOGGLE_H2(), ["t", "gone"])).toEqual({ ok: false, code: "stale-target" });
  expect(view.state.doc).toBe(before);

  const kept = editor([["a", "paragraph", "before"], ["b", "paragraph", "after"]]);
  kept.runFormatCommand = async (apply) => ({ status: "applied", floor: 1, result: await apply({}) });
  const quote = schema.nodes.opaque_block.create({ id: "q", pos: "C", parent: null, raw: { t: "quote", c: "Read this too" } }, schema.text("Read this too"));
  kept.dispatch(kept.state.tr.insert(posOf(kept, "b") - 1, quote));
  const before2 = kept.state.doc;
  expect(await I.turnBlocks(kept, TOGGLE_H2(), ["q"])).toEqual({ status: "refused", code: "unsupported-format" });
  expect(kept.state.doc).toBe(before2);
  expect(kept.state.doc.child(1).attrs.level).toBeUndefined();
});

test("undo puts the toggle's level back the way it was", async () => {
  const { view } = open(BODY());
  await I.turnBlocks(view, TOGGLE_H2(), ["t"]);
  expect(record(view, "t").level).toBe(2);

  history.undoNoScroll(view.state, view.dispatch);
  expect(record(view, "t")).toEqual({ t: "toggle", pos: expect.any(String), c: "Summary", open: true });
  expect(renderModel(project(blockMap(view.state.doc)))).toContain("<summary>Summary</summary>");
});

test("a saved page's toggle heading pastes back as a toggle heading", () => {
  const box = document.createElement("div");
  box.innerHTML = B.flattenPastedHTML(renderModel(project({ t: { t: "toggle", pos: "00000001", c: "Summary", level: 2 } })), document);
  const toggle = box.querySelector("div[data-page-toggle]");
  expect(toggle.getAttribute("data-level")).toBe("2");
  expect(toggle.textContent).toBe("Summary");
  expect(box.querySelector("h2")).toBeNull();

  const parsed = B.clipboardParser.parse(box).firstChild;
  expect([parsed.type.name, parsed.attrs.level, parsed.textContent]).toEqual(["toggle", 2, "Summary"]);
});
