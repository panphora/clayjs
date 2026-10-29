import { createPageEditor, installPageFeature } from "../../../src/page/editor.js";
import { createFeatureLoader } from "../../../src/page/feature-loader.js";
import { FEATURES } from "../../../src/page/features/registry.js";
import { RECORD } from "./fixtures/all-kinds.js";

/**
 * Charts are a feature: the chart view and the module its insert helpers live in
 * load the first time a document has or takes a chart, and a document that never
 * has one asks for neither.
 */

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (check) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return false;
};

let frames;
let originalRaf;
let originalCancel;
beforeEach(() => {
  frames = [];
  originalRaf = window.requestAnimationFrame;
  originalCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  window.cancelAnimationFrame = () => {};
});
afterEach(() => {
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancel;
});
const paint = () => { const queued = frames.splice(0); queued.forEach((callback) => callback()); return queued.length; };
const flushChrome = () => {
  const at = frames.findIndex((callback) => callback.toString().includes("measureLayout"));
  if (at >= 0) frames.splice(at, 1)[0]();
};

const PARAGRAPH = { t: "paragraph", pos: "B", c: "Hi" };
const table = RECORD.blocks.tbl;
const chart = RECORD.blocks.ch;

const open = (blocks, options = {}) => {
  const calls = [];
  const holder = { view: null };
  const features = createFeatureLoader({
    load: (id) => { calls.push(id); return FEATURES[id].load(); },
    install: (id, mod) => installPageFeature({ view: holder.view }, id, mod),
    reportError: () => {},
  });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks, features, ...options });
  holder.view = view;
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
  });
  return { view, calls, features };
};

test("a document with no chart or board asks for neither part", async () => {
  const { calls } = open({ p: PARAGRAPH });
  await flush();
  await flush();
  expect(calls).toEqual([]);
});

test("a table without a chart asks for the table part only", async () => {
  const { view, calls } = open({ tbl: table, p: PARAGRAPH });
  await flush();
  await flush();
  expect(calls).toEqual(["table"]);
  expect(view.dom.querySelector(".page-chart")).toBe(null);
});

test("a chart at boot draws once its part arrives and refreshes when its source table changes", async () => {
  const { view, calls } = open({ tbl: table, ch: chart });
  expect(await waitFor(() => { paint(); return view.dom.querySelector(".page-chart-plot svg") !== null; })).toBe(true);
  expect(calls.sort()).toEqual(["chart", "table"]);
  paint();
  const before = view.dom.querySelector(".page-chart-plot svg").outerHTML;
  view.dispatch(view.state.tr.insertText("!", 3));
  flushChrome();
  expect(frames).toHaveLength(1);
  expect(paint()).toBe(1);
  expect(view.dom.querySelector(".page-chart-plot svg").outerHTML).not.toBe(before);
});

test("inserting a chart from the menu loads the part before the block draws", async () => {
  const { view, calls } = open({ tbl: table, p: { t: "paragraph", pos: "Z", c: "" } });
  await flush();
  await flush();
  expect(calls).toEqual(["table"]);
  const items = await import("../../../src/page/items.js");
  const inserted = await items.runItem(view, items.CHART_ITEM, 1);
  expect(inserted).toBe(true);
  expect(calls).toEqual(["table", "chart"]);
  expect(view.state.doc.child(1).type.name).toBe("chart");
  expect(view.dom.querySelector("figure.page-chart")).toBeTruthy();
});

test("a board asks for the board part and never for the chart one", async () => {
  const { view, calls } = open({ p: PARAGRAPH, bd: { t: "board", pos: "C" } }, { board: null });
  expect(await waitFor(() => calls.includes("board"))).toBe(true);
  await flush();
  expect(calls).not.toContain("chart");
  expect(view.state.doc.child(1).type.name).toBe("board");
});
