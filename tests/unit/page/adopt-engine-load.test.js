/**
 * The merge engine loads on first use. An adoption waits for it before it reads
 * the editor, so what a person typed while the engine downloaded is merged
 * against, exactly as if the engine had been there already.
 *
 * The engine module is held behind a deferred promise the test settles by hand,
 * and it hands back the real vendor once it settles.
 */
import { jest } from "@jest/globals";
import * as vendor from "../../../src/vendor/hyper-morph.vendor.js";
import { mergeTagRecognizers } from "../../../src/sync/merge-tags.js";

const engine = { HyperMorph: vendor.HyperMorph, morph: vendor.morph, mergeTagRecognizers };

let loaded = null;
let pending = null;
let release = null;
let rejectImport = null;

const mergeEngine = jest.fn(() => {
  if (loaded) return Promise.resolve(loaded);
  pending ??= new Promise((resolve, reject) => {
    release = () => { loaded = engine; resolve(engine); };
    rejectImport = () => { pending = null; reject(new Error("the engine download failed")); };
  });
  return pending;
});

jest.unstable_mockModule("../../../src/sync/merge-engine.js", () => ({
  loadedEngine: () => loaded,
  mergeEngine,
}));

let createPageEditor;
let blockMap;
let project;
let renderModel;
let revOf;
let blocksOfValues;
let readFile;
let installAdoption;

beforeAll(async () => {
  ({ createPageEditor } = await import("../../../src/page/editor.js"));
  ({ blockMap } = await import("../../../src/page/model.js"));
  ({ project, renderModel, revOf, blocksOfValues } = await import("../../../src/page/projection.js"));
  ({ readFile, installAdoption } = await import("../../../src/page/adopt-boot.js"));
});

beforeEach(() => {
  loaded = null;
  pending = null;
  release = null;
  rejectImport = null;
  mergeEngine.mockClear();
});

const RECORD = { blocks: {
  a: { t: "paragraph", pos: "1", c: "Hello world" },
}, deleted: {} };

const TWO = { blocks: {
  a: { t: "paragraph", pos: "1", c: "First paragraph" },
  b: { t: "paragraph", pos: "2", c: "Second paragraph" },
}, deleted: {} };

function fileHtml(record, edit = () => {}, { tags = true } = {}) {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const page = tags ? `<script type="application/json" merge="page" clay="live">${JSON.stringify(record)}</script>` : "";
  const html = `<!DOCTYPE html><html><head>${page}</head><body><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">${renderModel(model)}</article></body></html>`;
  const d = new DOMParser().parseFromString(html, "text/html");
  edit(d);
  return "<!DOCTYPE html>" + d.documentElement.outerHTML;
}

const fileOf = (html) => readFile(new DOMParser().parseFromString(html, "text/html"));
// A host that keeps no page data sends no page tag: every arrival is tagless.
const taglessHtml = (record, edit) => fileHtml(record, edit, { tags: false });
const frame = (html) => document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html } }));
const editHello = (d) => { d.querySelector('[data-id="a"]').textContent = "Hello world!"; };
const editFirst = (d) => { d.querySelector('[data-id="a"]').textContent = "First paragraph, edited by hand"; };
const clone = (v) => JSON.parse(JSON.stringify(v));
const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

function open(blocks) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const view = createPageEditor(mount, { blocks: clone(blocks) });
  return {
    view,
    close() {
      view.destroy();
      mount.remove();
    },
  };
}

function counters() {
  const counts = { holds: 0, releases: 0, checkpoints: 0, notices: [] };
  counts.hold = () => counts.holds++;
  counts.release = () => counts.releases++;
  counts.requestCheckpoint = () => counts.checkpoints++;
  counts.notice = (c) => counts.notices.push(c);
  return counts;
}

test("typing while the engine loads is kept when the file appends", async () => {
  const ed = open(RECORD.blocks);
  const c = counters();
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD, editHello)), hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await ticks();
  expect(mergeEngine).toHaveBeenCalled();
  expect(typeof release).toBe("function");
  ed.view.dispatch(ed.view.state.tr.insertText("brave ", 7));
  expect(blockMap(ed.view.state.doc).a.c).toBe("Hello brave world");
  release();
  await controller.idle();
  expect(blockMap(ed.view.state.doc).a.c).toBe("Hello brave world!");
  expect(c.notices).toEqual([{ edited: 1, created: 0, deleted: 0, moved: false }]);
  controller.dispose();
  ed.close();
});

test("typing in a block while the engine loads is kept in the merge", async () => {
  const ed = open(TWO.blocks);
  const c = counters();
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(TWO, editFirst)), hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await ticks();
  expect(typeof release).toBe("function");
  ed.view.dispatch(ed.view.state.tr.insertText("typed, ", 1));
  expect(blockMap(ed.view.state.doc).a.c).toBe("typed, First paragraph");
  release();
  await controller.idle();
  const blocks = blockMap(ed.view.state.doc);
  expect(blocks.a.c).toBe("typed, First paragraph, edited by hand");
  expect(blocks.b.c).toBe("Second paragraph");
  controller.dispose();
  ed.close();
});

test("a disposal while the engine loads makes no dispatch", async () => {
  const ed = open(RECORD.blocks);
  const before = blockMap(ed.view.state.doc);
  const c = counters();
  const dispatches = [];
  const dispatch = ed.view.dispatch;
  ed.view.dispatch = (tr) => { dispatches.push(tr); return dispatch(tr); };
  const controller = installAdoption({ view: ed.view, source: fileOf(fileHtml(RECORD, editHello)), hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice });
  await ticks();
  expect(typeof release).toBe("function");
  controller.dispose();
  release();
  await controller.idle();
  expect(dispatches).toHaveLength(0);
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(c.notices).toEqual([]);
  expect(c.checkpoints).toBe(0);
  expect(c.releases).toBe(1);
  ed.close();
});

// A tagless host: no page tag, so every arrival goes through adoptTagless.
const TAGLESS = { blocks: {
  h: { t: "heading", pos: "1", level: 1, c: "Long document" },
  p: { t: "paragraph", pos: "2", c: "First paragraph" },
  k: { t: "list_item", pos: "3", kind: "check", c: "Invite copy" },
  tl: { t: "tool", pos: "4", artifact: { title: "Countdown", html: "<b>x</b>", css: "", javascript: "", fallbackHtml: "", summary: "" }, rev: "r1", state: { n: 1 } },
}, deleted: {} };

const HAND = "First paragraph, edited by hand";
const editTagless = (d) => { d.querySelector('[data-id="p"]').textContent = HAND; };
const editRetitled = (d) => { d.querySelector('[data-id="h"]').textContent = "Long document, retitled"; };
const editChecked = (d) => { d.querySelector('[data-id="k"] input').setAttribute("checked", ""); };
const editPayload = (d) => {
  const script = d.querySelector("script[data-tool]");
  const data = JSON.parse(script.textContent);
  script.textContent = JSON.stringify({ ...data, artifact: { ...data.artifact, html: "<b>y</b>" } });
};

function installTagless(view, source, extra = {}) {
  const c = counters();
  const controller = installAdoption({ view, source, mergeTagless: true, hold: c.hold, release: c.release, requestCheckpoint: c.requestCheckpoint, notice: c.notice, ...extra });
  return { c, controller };
}

async function engineLoads(controller) {
  await ticks();
  expect(typeof release).toBe("function");
  release();
  await controller.idle();
}

test("the latest article again, attributes and all, loads no engine", async () => {
  const ed = open(TAGLESS.blocks);
  const source = fileOf(taglessHtml(TAGLESS));
  const { c, controller } = installTagless(ed.view, source);
  expect(await controller.idle()).toEqual({ ok: true, outcome: "unchanged" });
  expect(mergeEngine).not.toHaveBeenCalled();
  expect(c.holds).toBe(0);
  expect(c.notices).toEqual([]);
  controller.dispose();
  ed.close();
});

test("this tab's own saved article echoed back loads no engine", async () => {
  const ed = open(TAGLESS.blocks);
  const { c, controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)));
  await controller.idle();
  const saved = taglessHtml({ blocks: { a: { t: "paragraph", pos: "1", c: "Saved paragraph" } }, deleted: {} });
  controller.saved(saved);
  frame(saved);
  await controller.idle();
  expect(mergeEngine).not.toHaveBeenCalled();
  expect(blockMap(ed.view.state.doc).p.c).toBe("First paragraph");
  expect(c.notices).toEqual([]);
  expect(c.checkpoints).toBe(0);
  controller.dispose();
  ed.close();
});

test("a real hand edit loads the engine and is adopted", async () => {
  const ed = open(TAGLESS.blocks);
  const { c, controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)));
  await controller.idle();
  expect(mergeEngine).not.toHaveBeenCalled();
  frame(taglessHtml(TAGLESS, editTagless));
  await engineLoads(controller);
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  expect(blockMap(ed.view.state.doc).p.c).toBe(HAND);
  expect(c.notices).toHaveLength(1);
  expect(c.checkpoints).toBe(1);
  expect(c.releases).toBe(1);
  controller.dispose();
  ed.close();
});

test("the same data-rev with changed content still merges", async () => {
  const ed = open(TAGLESS.blocks);
  const boot = taglessHtml(TAGLESS);
  const edited = taglessHtml(TAGLESS, editTagless);
  expect(fileOf(edited).article.getAttribute("data-rev")).toBe(fileOf(boot).article.getAttribute("data-rev"));
  const { controller } = installTagless(ed.view, fileOf(boot));
  await controller.idle();
  frame(edited);
  await engineLoads(controller);
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  const blocks = blockMap(ed.view.state.doc);
  expect(blocks.p.c).toBe(HAND);
  expect(blocks.h.c).toBe("Long document");
  expect(blocks.k.c).toBe("Invite copy");
  controller.dispose();
  ed.close();
});

test("an older known article loads no engine and leaves the page alone", async () => {
  const ed = open(TAGLESS.blocks);
  const boot = taglessHtml(TAGLESS);
  const { c, controller } = installTagless(ed.view, fileOf(boot));
  await controller.idle();
  frame(taglessHtml(TAGLESS, editTagless));
  await engineLoads(controller);
  expect(blockMap(ed.view.state.doc).p.c).toBe(HAND);
  frame(boot);
  await controller.idle();
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  expect(blockMap(ed.view.state.doc).p.c).toBe(HAND);
  expect(c.notices).toHaveLength(1);
  expect(c.checkpoints).toBe(1);
  controller.dispose();
  ed.close();
});

test("a changed attribute loads the engine and the change is adopted", async () => {
  const ed = open(TAGLESS.blocks);
  const { c, controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)));
  await controller.idle();
  expect(blockMap(ed.view.state.doc).k.checked).toBeUndefined();
  frame(taglessHtml(TAGLESS, editChecked));
  await engineLoads(controller);
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  expect(blockMap(ed.view.state.doc).k.checked).toBe(true);
  expect(c.notices).toHaveLength(1);
  controller.dispose();
  ed.close();
});

test("a changed opaque payload loads the engine and the change is adopted", async () => {
  const ed = open(TAGLESS.blocks);
  const { controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)));
  await controller.idle();
  expect(blockMap(ed.view.state.doc).tl.artifact.html).toBe("<b>x</b>");
  frame(taglessHtml(TAGLESS, editPayload));
  await engineLoads(controller);
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  expect(blockMap(ed.view.state.doc).tl.artifact.html).toBe("<b>y</b>");
  controller.dispose();
  ed.close();
});

test("a writer lost during the import refuses without a dispatch", async () => {
  const ed = open(TAGLESS.blocks);
  const before = blockMap(ed.view.state.doc);
  let adopter = true;
  const { c, controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)), { isAdopter: () => adopter });
  await controller.idle();
  const dispatches = [];
  const dispatch = ed.view.dispatch;
  ed.view.dispatch = (tr) => { dispatches.push(tr); return dispatch(tr); };
  frame(taglessHtml(TAGLESS, editTagless));
  await ticks();
  expect(typeof release).toBe("function");
  adopter = false;
  release();
  await controller.idle();
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  expect(dispatches.filter((tr) => tr.docChanged)).toHaveLength(0);
  expect(blockMap(ed.view.state.doc)).toEqual(before);
  expect(c.notices).toEqual([]);
  expect(c.checkpoints).toBe(0);
  expect(c.releases).toBe(1);
  controller.dispose();
  ed.close();
});

test("a rejected import is retried, and the retry adopts", async () => {
  const ed = open(TAGLESS.blocks);
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const { c, controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)));
  await controller.idle();
  frame(taglessHtml(TAGLESS, editTagless));
  await ticks();
  expect(typeof rejectImport).toBe("function");
  rejectImport();
  await controller.idle();
  expect(mergeEngine).toHaveBeenCalledTimes(1);
  expect(blockMap(ed.view.state.doc).p.c).toBe("First paragraph");
  expect(c.notices).toEqual([]);
  frame(taglessHtml(TAGLESS, editRetitled));
  await engineLoads(controller);
  expect(mergeEngine).toHaveBeenCalledTimes(2);
  expect(blockMap(ed.view.state.doc).h.c).toBe("Long document, retitled");
  expect(c.notices).toHaveLength(1);
  spy.mockRestore();
  controller.dispose();
  ed.close();
});

test("the page keeps rendering while the edit-side import fails", async () => {
  const ed = open(TAGLESS.blocks);
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const { c, controller } = installTagless(ed.view, fileOf(taglessHtml(TAGLESS)));
  await controller.idle();
  frame(taglessHtml(TAGLESS, editTagless));
  await ticks();
  rejectImport();
  await controller.idle();
  expect(ed.view.dom.textContent).toContain("First paragraph");
  expect(ed.view.dom.textContent).toContain("Long document");
  expect(blockMap(ed.view.state.doc).p.c).toBe("First paragraph");
  expect(c.notices).toEqual([]);
  expect(c.checkpoints).toBe(0);
  spy.mockRestore();
  controller.dispose();
  ed.close();
});
