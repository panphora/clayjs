import { readFileSync } from "node:fs";
import { history } from "../../../../src/vendor/prosemirror.vendor.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";
import { schema } from "../../../../src/page/schema.js";
import { nodeFromBlock } from "../../../../src/page/model.js";
import { createPageEditor, installPageFeature } from "../../../../src/page/editor.js";
import { createFeatureLoader } from "../../../../src/page/feature-loader.js";
import { FEATURES } from "../../../../src/page/features/registry.js";

const { TextSelection } = pmState;

const ARTIFACTS = [...readFileSync(new URL("../../../../docs/page-tool.md", import.meta.url), "utf8").matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
const TALLY = ARTIFACTS[1];

const PARAGRAPH = { t: "paragraph", pos: "B", c: "Hi " };
const IMAGE = { t: "image", pos: "C", c: "", src: "/a.png", alt: "A door", caption: "Front door" };
const TOOL = { t: "tool", pos: "D", artifact: TALLY, rev: "r1" };
const TABLE = {
  t: "table", pos: "Z",
  cols: { c1: { pos: "1", name: "Name", kind: "text" }, c2: { pos: "2", name: "Amount", kind: "number" } },
  rows: { r1: { pos: "1", cells: { c1: "A", c2: "10" } }, r2: { pos: "2", cells: { c1: "B", c2: "2" } } },
};

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
const realLoad = (id) => FEATURES[id].load();
const deferred = () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release };
};
const recordingHost = () => {
  const mounts = [];
  const disposes = [];
  return {
    mounts,
    disposes,
    host: {
      mount(container, info) {
        mounts.push(info.id);
        return { dispose() { disposes.push(info.id); } };
      },
      tablesChanged() {},
      dispose() {},
    },
  };
};

const open = (blocks, { load = realLoad, host = recordingHost(), onChange = null } = {}) => {
  const calls = [];
  const holder = { view: null };
  const features = createFeatureLoader({
    load: (id) => { calls.push(id); return load(id); },
    install: (id, mod) => installPageFeature({ view: holder.view, toolHost: host.host }, id, mod),
    reportError: () => {},
  });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks, features, toolHost: host.host, onChange });
  holder.view = view;
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
  });
  return { view, calls, host };
};

// One selection-only transaction, so any decoration from an earlier install is
// gone and the views it recreated are the ones the test looks at.
const settle = async (view) => {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
  await flush();
  await flush();
};

const insertTable = (view, id = "tb") => {
  const node = nodeFromBlock(schema, id, TABLE);
  view.dispatch(view.state.tr.insert(view.state.doc.content.size, node));
};

const historyOf = (state) => state.plugins.find((plugin) => String(plugin.key).startsWith("history$"))?.getState(state);

test("a first table recreates the table's views only; the paragraph, the image, its typed caption and a running tool stay", async () => {
  const { gate, release } = deferred();
  const host = recordingHost();
  const { view, calls } = open({ p: PARAGRAPH, img: IMAGE, tl: TOOL }, {
    host,
    load: (id) => (id === "table" ? gate.then(() => realLoad("table")) : realLoad(id)),
  });
  expect(await waitFor(() => view.dom.querySelector(".page-image") && view.dom.querySelector(".page-tool-block"))).toBe(true);
  await settle(view);

  const paragraph = view.dom.querySelector("p");
  const figure = view.dom.querySelector("figure.page-image");
  const caption = figure.querySelector(".page-image-caption");
  const tool = view.dom.querySelector(".page-tool-block");
  caption.focus();
  caption.textContent = "Draft caption";
  const mounts = host.mounts.length;
  const disposes = host.disposes.length;

  insertTable(view);
  await flush();
  await flush();
  expect(view.dom.querySelector("figure.page-image")).toBe(figure);
  expect(view.dom.querySelector("p")).toBe(paragraph);
  expect(view.dom.querySelector(".page-image-caption").textContent).toBe("Draft caption");
  expect(calls).toEqual(["media", "tool", "table"]);

  release();
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);

  expect(view.dom.querySelector("p")).toBe(paragraph);
  expect(view.dom.querySelector("figure.page-image")).toBe(figure);
  expect(view.dom.querySelector(".page-image-caption")).toBe(caption);
  expect(caption.textContent).toBe("Draft caption");
  expect(view.state.doc.child(1).attrs.caption).toBe("Front door");
  expect(view.dom.querySelector(".page-tool-block")).toBe(tool);
  expect(host.mounts.length).toBe(mounts);
  expect(host.disposes.length).toBe(disposes);
});

test("a table present at boot draws its real table view, cells included, once the part loads", async () => {
  const { gate, release } = deferred();
  const { view, calls } = open({ tbl: TABLE }, { load: (id) => gate.then(() => realLoad(id)) });
  expect(calls).toEqual(["table"]);
  await flush();
  expect(view.dom.querySelector(".page-table")).toBe(null);
  expect(view.dom.querySelector("table tbody td")).toBeTruthy();

  release();
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);
  expect(view.dom.querySelectorAll("thead th").length).toBe(2);
  expect(view.dom.querySelectorAll("td[data-col] .page-table-row-menu").length).toBeGreaterThan(0);
});

test("the install transaction changes no document and leaves no undo step and no save", async () => {
  const { gate, release } = deferred();
  const changes = [];
  const { view } = open({ p: PARAGRAPH, tbl: TABLE }, {
    load: (id) => gate.then(() => realLoad(id)),
    onChange: (record) => changes.push(record),
  });
  const doc = view.state.doc;
  const selection = view.state.selection.from;
  const steps = { done: historyOf(view.state).done.length, undone: historyOf(view.state).undone.length };

  release();
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);

  expect(view.state.doc).toBe(doc);
  expect(view.state.selection.from).toBe(selection);
  expect({ done: historyOf(view.state).done.length, undone: historyOf(view.state).undone.length }).toEqual(steps);
  expect(history.undo(view.state)).toBe(false);
  expect(changes).toEqual([]);
});

test("an install requested while composing applies only after composing ends", async () => {
  const { gate, release } = deferred();
  const { view } = open({ tbl: TABLE }, { load: (id) => gate.then(() => realLoad(id)) });
  view.input.composing = true;
  expect(view.composing).toBe(true);
  release();
  await flush();
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 60));
  expect(view.dom.querySelector(".page-table")).toBe(null);

  // ProseMirror clears `composing` at compositionend and flushes the composed
  // text after it; hold the flag up for one more turn, as a browser that fires
  // compositionend before the final mutation does.
  view.dom.addEventListener("compositionend", () => {
    view.input.composing = true;
    setTimeout(() => { view.input.composing = false; }, 40);
  });
  view.dom.dispatchEvent(new CompositionEvent("compositionend"));
  await flush();
  expect(view.dom.querySelector(".page-table")).toBe(null);
  expect(await waitFor(() => view.dom.querySelector(".page-table"))).toBe(true);
});
