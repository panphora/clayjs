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

const mergeEngine = jest.fn(() => {
  if (loaded) return Promise.resolve(loaded);
  pending ??= new Promise((resolve) => { release = () => { loaded = engine; resolve(engine); }; });
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
  mergeEngine.mockClear();
});

const RECORD = { blocks: {
  a: { t: "paragraph", pos: "1", c: "Hello world" },
}, deleted: {} };

const TWO = { blocks: {
  a: { t: "paragraph", pos: "1", c: "First paragraph" },
  b: { t: "paragraph", pos: "2", c: "Second paragraph" },
}, deleted: {} };

function fileHtml(record, edit = () => {}) {
  const blocks = blocksOfValues([record]);
  const model = project(blocks);
  const html = `<!DOCTYPE html><html><head><script type="application/json" merge="page" clay="live">${JSON.stringify(record)}</script></head><body><article class="page" clay="freeze" data-page="1" data-rev="${revOf(model)}">${renderModel(model)}</article></body></html>`;
  const d = new DOMParser().parseFromString(html, "text/html");
  edit(d);
  return "<!DOCTYPE html>" + d.documentElement.outerHTML;
}

const fileOf = (html) => readFile(new DOMParser().parseFromString(html, "text/html"));
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
