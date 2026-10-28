/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { Marked } from "../../../src/vendor/marked.vendor.js";
import { exportMarkdown, markdownFileName } from "../../../src/page/export-markdown.js";
import { importMarkdownTokens } from "../../../src/page/import-markdown.js";
import { blockMap, orderedIds } from "../../../src/page/model.js";
import { project } from "../../../src/page/projection.js";
import { runsOf } from "../../../src/page/inline.js";
import { pendingIds } from "../../../src/lib/unsaved-state.js";
import { runPageCommand } from "../../../src/page/editor.js";
import { editor } from "./view-helpers.js";

/**
 * Markdown export: the live record as Markdown text, with every construct written as an
 * HTML extension or dropped named per block. The text is deterministic, fences never
 * collide, and the supported subset comes back through the import codec as the same
 * text and structure. The action snapshots the record once and shows the report before
 * anything downloads; nothing it does writes, enters history or fetches a parser.
 */

const markdown = (text) => new Marked().lexer(text);
const convert = (text) => importMarkdownTokens(markdown(text));
const inorder = (blocks) => orderedIds(blocks).map((id) => blocks[id]);
// What a block is, without the ids and keys an import makes fresh. A table is its
// column names and its body cells.
const cell = (value) => (value && typeof value === "object" ? { c: value.c, m: value.m } : value);
const shapes = (blocks) => project(blocks).map((item) => {
  const { id, pos, parent, rows, cols, ...rest } = item;
  if (item.t !== "table") return rest;
  const head = cols.map((col) => col.name);
  const line = (row) => cols.map((col) => cell(row.cells[col.id]));
  return { ...rest, cols: head, rows: rows.map(line) };
});

// spec: [t, c, attrs]; positions are "B", "C", ... so the records keep their order.
const records = (list) => Object.fromEntries(list.map(([t, c, attrs = {}], i) => [`b${i}`, { t, pos: String.fromCharCode(66 + i), c, ...attrs }]));
const units = (...runs) => runs.flatMap(([count, key]) => Array(count).fill(key));
const descriptor = (name, attrs) => `x${JSON.stringify([name, attrs])}`;

let blobs = [];
let anchors = [];
let clickSpy;

beforeEach(() => {
  document.body.innerHTML = "";
  blobs = [];
  anchors = [];
  URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:export"; };
  URL.revokeObjectURL = () => {};
  clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { anchors.push(this); });
});

afterEach(() => {
  clickSpy.mockRestore();
});

const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});
const panel = () => document.querySelector(".page-export-preview");
const rows = (selector) => [...(panel()?.querySelectorAll(`${selector} .page-export-row`) ?? [])].map((row) => row.textContent);
const settle = async (turns = 4) => {
  for (let i = 0; i < turns; i++) await new Promise((done) => setTimeout(done, 0));
};

test("Markdown's own characters in text are escaped, and the text reads back as written", () => {
  const original = "1. one, A *star*, _under_, [brackets], `tick`, # hash, <html> and & more";
  const dashed = "- dash";
  const { text, extensions, losses } = exportMarkdown(records([["paragraph", original], ["paragraph", dashed]]));
  expect(text).toContain("1\\. one");
  expect(text).toContain("\\- dash");
  expect(text).toContain("A \\*star\\*");
  expect(text).toContain("\\_under\\_");
  expect(text).toContain("\\[brackets\\]");
  expect(text).toContain("\\`tick\\`");
  expect(text).toContain("\\# hash");
  expect(text).toContain("\\<html\\>");
  expect(text).toContain("\\& more");
  expect(extensions).toEqual([]);
  expect(losses).toEqual([]);

  const again = convert(text);
  expect(inorder(again.blocks).map((block) => block.c)).toEqual([original, dashed]);
});

test("a fence grows past the longest backtick run inside the code", () => {
  const body = "before\n```js\nnested\n```\nafter";
  const { text } = exportMarkdown(records([["code_block", body, { lang: "js" }]]));
  expect(text).toBe("````js\nbefore\n```js\nnested\n```\nafter\n````\n");

  const again = convert(text);
  const [block] = inorder(again.blocks);
  expect(block).toMatchObject({ t: "code_block", lang: "js", c: body });
});

test("lists, tasks and tables are written as GFM and keep their fields", () => {
  const blocks = {
    b0: { t: "list_item", pos: "B", c: "One" },
    b1: { t: "list_item", pos: "C", c: "Nested", indent: 1 },
    b2: { t: "list_item", pos: "D", c: "First", kind: "ordered" },
    b3: { t: "list_item", pos: "E", c: "Done", kind: "check", checked: true },
    b4: { t: "list_item", pos: "F", c: "Open", kind: "check" },
    b5: {
      t: "table", pos: "G",
      cols: { c1: { pos: "B", name: "Name" }, c2: { pos: "C", name: "Count" } },
      rows: { r1: { pos: "B", cells: { c1: "Ada", c2: { c: "3", m: runsOf(["b"]) } } } },
    },
  };
  const { text, losses } = exportMarkdown(blocks);
  expect(text).toContain("- One\n    - Nested\n");
  expect(text).toContain("1. First");
  expect(text).toContain("- [x] Done");
  expect(text).toContain("- [ ] Open");
  expect(text).toContain("| Name | Count |\n| --- | --- |\n| Ada | **3** |");
  expect(losses).toEqual([]);

  const again = convert(text);
  expect(inorder(again.blocks).map((block) => [block.t, block.c ?? "", block.kind ?? "bullet", block.indent ?? 0, block.checked ?? false])).toEqual([
    ["list_item", "One", "bullet", 0, false],
    ["list_item", "Nested", "bullet", 1, false],
    ["list_item", "First", "ordered", 0, false],
    ["list_item", "Done", "check", 0, true],
    ["list_item", "Open", "check", 0, false],
    ["table", "", "bullet", 0, false],
  ]);
});

test("mentions become their label, dates their ISO text, and the reference is a named loss", () => {
  const c = "Ask Ada on 2026-10-27";
  const m = runsOf(units([4, ""], [3, descriptor("mention", { id: "p-1" })], [4, ""], [10, descriptor("date", { date: "2026-10-27" })]));
  const { text, extensions, losses } = exportMarkdown(records([["paragraph", c, { m }]]));
  expect(text).toBe("Ask Ada on 2026-10-27\n");
  expect(extensions).toEqual([]);
  expect(losses).toEqual([{ block: "b0", type: "paragraph", name: "mention" }]);

  const again = convert(text);
  expect(inorder(again.blocks)[0].c).toBe(c);
});

test("a toggle heading is a heading and its body follows; a plain toggle stays HTML", () => {
  const toggle = exportMarkdown({
    b0: { t: "toggle", pos: "B", c: "Details", level: 2, open: false },
    b1: { t: "paragraph", pos: "C", c: "Body text", parent: "b0" },
  });
  expect(toggle.text).toBe("## Details\n\nBody text\n");
  expect(toggle.extensions).toEqual([]);
  expect(toggle.losses).toEqual([{ block: "b0", type: "toggle", name: "toggle collapse" }]);
  expect(inorder(convert(toggle.text).blocks).map((block) => [block.t, block.level ?? null, block.c])).toEqual([
    ["heading", null, "Details"],
    ["paragraph", null, "Body text"],
  ]);

  const plain = exportMarkdown({
    b0: { t: "toggle", pos: "B", c: "More" },
    b1: { t: "paragraph", pos: "C", c: "Hidden body", parent: "b0" },
    b2: { t: "paragraph", pos: "D", c: "After" },
  });
  expect(plain.extensions).toEqual([{ block: "b0", type: "toggle", name: "Toggle" }]);
  expect(plain.text).toContain("<details");
  expect(plain.text).toContain("<summary>More</summary>");
  expect(plain.text).toContain("Hidden body");
  expect(plain.text.endsWith("After\n")).toBe(true);
});

test("the decorated title and the TOC are written as semantic HTML and listed", () => {
  const blocks = {
    b0: { t: "heading", pos: "B", level: 1, c: "Notes", pageIcon: "\u{1F4D8}", pageCoverSrc: "/cover.jpg", pageCoverAlt: "A door" },
    b1: { t: "paragraph", pos: "C", c: "Body" },
    b2: { t: "toc", pos: "D", maxLevel: 3 },
    b3: { t: "heading", pos: "E", level: 2, c: "Second" },
  };
  const { text, extensions } = exportMarkdown(blocks);
  expect(extensions.map((one) => one.name)).toEqual(["Page icon", "Page cover", "Table of contents"]);
  expect(extensions.map((one) => one.block)).toEqual(["b0", "b0", "b2"]);
  expect(text).toContain("<header");
  expect(text).toContain('data-page-icon aria-hidden="true"');
  expect(text).toContain("<h1>Notes</h1>");
  expect(text).toContain('data-type="toc"');
  expect(text).toContain('<a href="#page-block-');
  expect(text).toContain(">Second</a>");
  expect(text).toContain("\n## Second\n");
});

test("an opaque record keeps only its text, and says so", () => {
  const { text, extensions, losses } = exportMarkdown({
    b0: { t: "opaque_block", pos: "B", scoped: { one: 1 } },
    b1: { t: "opaque_block", pos: "C", c: "Future text", raw: { t: "future_block", note: "x" } },
  });
  expect(text).toBe("Future text\n");
  expect(extensions).toEqual([]);
  expect(losses).toEqual([
    { block: "b0", type: "opaque_block", name: "opaque record (opaque_block)" },
    { block: "b1", type: "opaque_block", name: "opaque record (future_block)" },
  ]);
});

test("the report is shown before anything downloads, and the file is the page's name", async () => {
  const view = editor([
    ["a", "heading", "Title", { level: 1, pageIcon: "\u{1F4D8}" }],
    ["b", "paragraph", "Alpha"],
    ["c", "toc", "", { maxLevel: 3 }],
    ["d", "list_item", "Task", { owner: "p-1" }],
  ]);
  expect(await runPageCommand(view, "exportMarkdown")).toEqual({ ok: true, preview: true });
  expect(panel()).not.toBeNull();
  expect(panel().querySelector(".page-export-summary").textContent).toBe("4 blocks \u00b7 2 kept as HTML \u00b7 1 lost");
  expect(rows(".page-export-extensions")).toEqual(["Page icon", "Table of contents"]);
  expect(rows(".page-export-losses")).toEqual(["owner"]);
  expect(blobs).toHaveLength(0);

  panel().querySelector('[data-export="download"]').click();
  await settle();
  expect(panel()).toBeNull();
  expect(blobs).toHaveLength(1);
  expect(anchors[0].download).toBe("notes.md");
  const text = await blobText(blobs[0]);
  expect(text).toContain("<h1>Title</h1>");
  expect(text).toContain("\nAlpha\n");
  expect(text).toContain('data-type="toc"');
});

test("emphasis reaches a word and not the space beside it", () => {
  const text = "hello world";
  const padded = " padded ";
  const out = exportMarkdown({
    b0: { t: "paragraph", c: text, m: runsOf([...text].map((_, i) => (i < 6 ? "b" : ""))), pos: "B" },
    b1: { t: "paragraph", c: padded, m: runsOf([...padded].map((_, i) => (i > 0 && i < 7 ? "i" : ""))), pos: "C" },
  });
  expect(out.text).toContain("**hello** world\n");
  expect(out.text).not.toContain("**hello **");
  expect(out.text).toContain(" *padded* ");
  expect(out.losses).toEqual([]);
});

test("a Markdown file of the supported subset exports back to the same text and structure", () => {
  const SOURCE = `# Title

A paragraph with **strong**, *emphasis*, ~~struck~~ and \`inline code\`,
plus a [link](https://example.test/a) and an ![image](https://example.test/i.png).

## Second

- a bullet
- another bullet

1. one
2. two

- [ ] a task
- [x] a done task

> A quote.

\`\`\`js
const answer = 42;
\`\`\`

---

| Column one | Column two |
| --- | --- |
| a value | a bold value |
`;
  const first = convert(SOURCE);
  const exported = exportMarkdown(first.blocks);
  expect(exported.extensions).toEqual([]);
  expect(exported.losses).toEqual([]);

  expect(exported.text).toContain("| Column one | Column two |");

  const again = convert(exported.text);
  expect(shapes(again.blocks)).toEqual(shapes(first.blocks));
  expect(again.blocks[orderedIds(again.blocks)[0]].c).toBe("Title");

  const [name] = orderedIds(again.blocks);
  expect(again.blocks[name].t).toBe("heading");
});

test("a peer edit while the report is open does not change the file", async () => {
  const view = editor([["a", "heading", "Title", { level: 1 }], ["b", "paragraph", "Alpha"]]);
  await runPageCommand(view, "exportMarkdown");
  view.dispatch(view.state.tr.insert(0, view.state.schema.nodes.paragraph.create(
    { id: "peer", pos: "Aa" },
    view.state.schema.text("Peer"),
  )));
  const after = blockMap(view.state.doc);
  expect(after.peer).toBeTruthy();

  panel().querySelector('[data-export="download"]').click();
  await settle();
  const text = await blobText(blobs[0]);
  expect(text).toBe("# Title\n\nAlpha\n");
  expect(text).not.toContain("Peer");
});

test("the file downloads as Markdown, not as HTML", async () => {
  const view = editor([["a", "paragraph", "Alpha"]]);
  expect(await runPageCommand(view, "exportMarkdown")).toEqual({ ok: true, preview: true });
  panel().querySelector('[data-export="download"]').click();
  await settle();
  expect(blobs).toHaveLength(1);
  expect(blobs[0].type).toBe("text/markdown");
});

test("an export leaves the document, history, save counters and pending state alone", async () => {
  const view = editor([["a", "heading", "Title", { level: 1 }], ["b", "paragraph", "Alpha"]]);
  const doc = view.state.doc;
  const undo = history.undoDepth(view.state);
  const redo = history.redoDepth(view.state);
  const pending = pendingIds();
  let changes = 0;
  const heard = () => { changes += 1; };
  document.addEventListener("clay:unsaved-state-changed", heard);

  await runPageCommand(view, "exportMarkdown");
  panel().querySelector('[data-export="download"]').click();
  await settle();
  document.removeEventListener("clay:unsaved-state-changed", heard);

  expect(view.state.doc).toBe(doc);
  expect(history.undoDepth(view.state)).toBe(undo);
  expect(history.redoDepth(view.state)).toBe(redo);
  expect(pendingIds()).toEqual(pending);
  expect(changes).toBe(0);
  expect(blobs).toHaveLength(1);
});

test("an active composition is waited out, never forced", async () => {
  const view = editor([["a", "heading", "Title", { level: 1 }], ["b", "paragraph", "Alpha"]]);
  let composing = true;
  Object.defineProperty(view, "composing", { configurable: true, get: () => composing });
  const started = runPageCommand(view, "exportMarkdown");
  await settle();
  expect(panel()).toBeNull();
  composing = false;
  view.dom.dispatchEvent(new Event("compositionend"));
  expect(await started).toEqual({ ok: true, preview: true });
  expect(panel()).not.toBeNull();
  expect(view.state.doc.textContent).toBe("TitleAlpha");
});

test("nothing in the export loads marked, and simple editing loads no command at all", async () => {
  for (const path of ["../../../src/page/export-markdown.js", "../../../src/page/features/export-markdown.js"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source).not.toMatch(/marked/i);
    expect(source).not.toMatch(/marked\.vendor/);
  }
  const view = editor([["a", "paragraph", "Alpha"]]);
  let loads = 0;
  window.clay = { assets: { load: () => { loads += 1; return Promise.resolve({ Marked }); } } };
  await runPageCommand(view, "exportMarkdown");
  expect(loads).toBe(0);
  expect(panel()).not.toBeNull();
  await settle();
  delete window.clay;
});

test("a download name is the page's, with what a filesystem refuses replaced", () => {
  expect(markdownFileName("My Notes")).toBe("My Notes.md");
  expect(markdownFileName("../bad:name?")).toBe("-bad-name-.md");
  expect(markdownFileName("")).toBe("page.md");
});
