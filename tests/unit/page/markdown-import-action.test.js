/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { readFileSync } from "node:fs";
import { history, model, state } from "../../../src/vendor/prosemirror.vendor.js";
import * as markdownImport from "../../../src/page/features/import-markdown.js";
import { runPageCommand } from "../../../src/page/editor.js";
import { blockMap } from "../../../src/page/model.js";
import { MAX_BYTES } from "../../../src/page/import-markdown.js";
import { pendingIds, flushUnsaved } from "../../../src/lib/unsaved-state.js";
import { editor, posOf, select, shape, typeText } from "./view-helpers.js";

/**
 * The Markdown import action: a .md file is measured before it is parsed, its blocks are
 * inserted where the selection was as one undo step, and the place is found again by block
 * id once the file has been read, so a peer's move keeps its own place and a peer's
 * deletion refuses instead of writing at a stale offset. The preview lists what the schema
 * could not keep, survives a refused upgrade and a parse failure, and holds the mode exit
 * open while it waits for its person.
 */

afterEach(() => {
  document.body.innerHTML = "";
});

const PAGE = () => [["a", "paragraph", "Alpha"], ["b", "paragraph", "Bravo"]];
const TOGGLE = () => [["t", "toggle", "Details", { open: false }], ["p", "paragraph", "Body"]];
const settle = async (turns = 4) => {
  for (let i = 0; i < turns; i++) await new Promise((done) => setTimeout(done, 0));
};
const file = (name, text) => ({ name, size: new TextEncoder().encode(text).length, text: async () => text });
// A read the test lets finish when it chooses, so a peer can change the document while the
// action is still waiting for the file.
const held = (name, text) => {
  let release;
  const read = new Promise((resolve) => { release = () => resolve(text); });
  return { file: { name, size: text.length, text: () => read }, release };
};
const panel = () => document.querySelector(".page-import-preview");
const rows = (selector) => [...(panel()?.querySelectorAll(`${selector} .page-import-row`) ?? [])].map((row) => row.textContent);
const click = (what) => panel().querySelector(`[data-import="${what}"]`).click();
const record = (view, id) => blockMap(view.state.doc)[id];
const ids = (view) => { const out = []; view.state.doc.forEach((node) => out.push(node.attrs.id)); return out; };
const importFile = (view, name, text) => runPageCommand(view, "importMarkdown", { file: file(name, text) });
const insert = async (what = "insert") => {
  click(what);
  await settle();
};

test("the blocks go in at the selection, with fresh ids, between the halves of the line", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 2);
  expect(await importFile(view, "notes.md", "# Heading\n\nSome *body* text")).toEqual({ ok: true, preview: true });
  expect(panel()).not.toBeNull();
  expect(panel().querySelector(".page-import-summary").textContent).toBe("2 blocks");
  expect(view.state.doc.textContent).toBe("AlphaBravo");

  await insert();
  expect(shape(view)).toBe("Alpha | Br | Heading | Some body text | avo");
  // The line that was being written in keeps its id on its first half, and the half after
  // the import is a block of its own.
  expect(ids(view)).toEqual(["a", "b", expect.any(String), expect.any(String), expect.any(String)]);
  expect(record(view, ids(view)[2]).t).toBe("heading");
  expect(record(view, ids(view)[4]).c).toBe("avo");
  expect(panel()).toBeNull();
});

test("an empty line is filled in place, keeping its order key and taking a fresh id", async () => {
  const view = editor([["a", "paragraph", "Alpha"], ["b", "paragraph", ""]]);
  select(view, posOf(view, "b"));
  await importFile(view, "notes.md", "# One");
  await insert();
  expect(shape(view)).toBe("Alpha | One");
  expect(ids(view)).toEqual(["a", expect.any(String)]);
});

test("blocks that arrive at a closed toggle open it and join its body, as a paste does", async () => {
  const view = editor(TOGGLE());
  select(view, posOf(view, "t") + 2);
  await importFile(view, "notes.md", "## One\n\nTwo");
  await insert();
  expect(record(view, "t").open).toBe(true);
  const after = ids(view).filter((id) => id !== "t" && id !== "p");
  expect(after).toHaveLength(2);
  for (const id of after) expect(record(view, id).parent).toBe("t");
  expect(view.state.doc.textContent).toBe("DetailsOneTwoBody");
});

test("one insert is one undo entry", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 5);
  await importFile(view, "notes.md", "# Heading\n\n- one\n- two\n\n## Two");
  await insert();
  expect(shape(view)).toBe("Alpha | Bravo | Heading | one | two | Two");
  history.undoNoScroll(view.state, view.dispatch);
  expect(shape(view)).toBe("Alpha | Bravo");
  history.redoNoScroll(view.state, view.dispatch);
  expect(shape(view)).toBe("Alpha | Bravo | Heading | one | two | Two");
});

test("a peer that moves the target keeps the blocks at its own new place", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 2);
  const reading = held("notes.md", "# Heading\n\nBody");
  const started = runPageCommand(view, "importMarkdown", { file: reading.file });
  await settle(1);
  // A peer's line lands in front of the block the import was asked for.
  view.dispatch(view.state.tr.insert(0, view.state.schema.nodes.paragraph.create(
    { id: "peer", pos: "Aa" },
    view.state.schema.text("Peer"),
  )));
  const before = view.state.doc;
  reading.release();
  expect(await started).toEqual({ ok: true, preview: true });
  expect(view.state.doc).toBe(before);

  await insert();
  expect(shape(view)).toBe("Peer | Alpha | Br | Heading | Body | avo");
});

test("a peer that deletes the target refuses, and the preview stays open to copy from", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 2);
  const reading = held("notes.md", "# Heading\n\nBody");
  const started = runPageCommand(view, "importMarkdown", { file: reading.file });
  await settle(1);
  const at = posOf(view, "b") - 1;
  view.dispatch(view.state.tr.delete(at, at + view.state.doc.child(1).nodeSize));
  const before = view.state.doc;
  reading.release();
  expect(await started).toEqual({ ok: true, preview: true });

  await insert();
  expect(view.state.doc).toBe(before);
  expect(shape(view)).toBe("Alpha");
  expect(panel()).not.toBeNull();
  expect(panel().querySelector(".page-import-error").textContent).toMatch(/changed/);
});

test("a refused format upgrade writes nothing and keeps the preview", async () => {
  const view = editor(PAGE());
  view.runFormatCommand = async () => ({ status: "upgrade-required", code: "page-format-upgrade-required" });
  select(view, posOf(view, "a") + 1);
  await importFile(view, "notes.md", "> Quoted\n\nAfter");
  const before = view.state.doc;
  await insert();
  expect(view.state.doc).toBe(before);
  expect(panel()).not.toBeNull();
  expect(panel().querySelector(".page-import-error").textContent).toMatch(/newer page format/);

  // A gate that lets the newer format through writes the quoted line where it was asked.
  view.runFormatCommand = async (apply) => ({ status: "applied", result: await apply({ floor: 1 }) });
  await insert();
  expect(panel()).toBeNull();
  expect(ids(view).map((id) => record(view, id).t)).toEqual(["paragraph", "quote", "paragraph", "paragraph", "paragraph"]);
  expect(ids(view).at(-1)).toBe("b");
  expect(view.state.doc.textContent).toBe("AQuotedAfterlphaBravo");
});

test("the preview lists what was kept as written and what was refused", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 1);
  await importFile(view, "notes.md", "Text [link](javascript:alert(1))\n\n[ref]: https://example.com\n");
  expect(rows(".page-import-refused")).toEqual(["link: javascript:alert(1)"]);
  expect(rows(".page-import-unsupported")).toEqual(["def: [ref]: https://example.com"]);
  await insert("cancel");
  expect(shape(view)).toBe("Alpha | Bravo");
});

test("a parse failure keeps the preview open with its error and inserts nothing", async () => {
  const view = editor(PAGE());
  const broken = { createFeature: (context) => markdownImport.createFeature({ ...context, load: async () => ({ Marked: class { lexer() { return [null]; } } }) }) };
  const feature = broken.createFeature({ view });
  select(view, posOf(view, "b") + 1);
  const before = view.state.doc;
  expect(await feature.run({ file: file("notes.md", "# One") })).toEqual({ ok: true, preview: true });
  expect(view.state.doc).toBe(before);
  expect(panel().querySelector(".page-import-error").textContent).toMatch(/no type/);
  expect(panel().querySelector('[data-import="insert"]').disabled).toBe(true);
  feature.dispose();
});

test("cancel leaves the document unchanged and stops holding the mode exit", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 2);
  await importFile(view, "notes.md", "# Heading");
  const before = view.state.doc;
  expect(pendingIds()).toContain("markdown-import-preview");
  await insert("cancel");
  expect(view.state.doc).toBe(before);
  expect(panel()).toBeNull();
  expect(pendingIds()).not.toContain("markdown-import-preview");
});

test("an unsent preview refuses the mode exit by name", async () => {
  const view = editor(PAGE());
  select(view, posOf(view, "b") + 2);
  await importFile(view, "notes.md", "# Heading");
  // The mode exit's barrier refuses with `pending-input` and this list of names.
  expect(pendingIds()).toEqual(["markdown-import-preview"]);
  expect(await flushUnsaved()).toEqual({ ok: true, pending: ["markdown-import-preview"] });
  await insert();
  expect(pendingIds()).toEqual([]);
  expect(await flushUnsaved()).toEqual({ ok: true, pending: [] });
});

test("a file over the limit is refused before anything is read or parsed", async () => {
  const view = editor(PAGE());
  const before = view.state.doc;
  let read = false;
  const oversize = { name: "huge.md", size: MAX_BYTES + 1, text: async () => { read = true; return "# One"; } };
  expect(await runPageCommand(view, "importMarkdown", { file: oversize })).toEqual({ ok: false, code: "input-too-large" });
  expect(read).toBe(false);
  expect(view.state.doc).toBe(before);
  expect(panel()).toBeNull();
});

test("the parser loads on the first import only, and simple editing loads none", async () => {
  // Nothing of the parser is in the action's own graph: it arrives through the loader
  // below, on the first import. A static import of the vendor would be in every edit-mode
  // download, and the count below would still read zero.
  const source = readFileSync(new URL("../../../src/page/features/import-markdown.js", import.meta.url), "utf8");
  expect(source).not.toMatch(/^import\b[^\n]*marked\.vendor\.js/m);
  let loads = 0;
  const load = () => {
    loads += 1;
    return import("../../../src/vendor/marked.vendor.js");
  };
  const view = editor(PAGE());
  const feature = markdownImport.createFeature({ view, load });
  select(view, posOf(view, "b") + 1);
  typeText(view, "editing");
  expect(loads).toBe(0);

  expect(await feature.run({ file: file("one.md", "# One") })).toEqual({ ok: true, preview: true });
  expect(loads).toBe(1);
  await insert();
  expect(ids(view)).toContain("b");

  expect(await feature.run({ file: file("two.md", "# Two") })).toEqual({ ok: true, preview: true });
  expect(loads).toBe(1);
  await insert("cancel");
  feature.dispose();
});
