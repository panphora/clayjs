import { schema } from "../../../src/page/schema.js";
import { nodeFromBlock } from "../../../src/page/model.js";
import { createPageEditor, installPageFeature } from "../../../src/page/editor.js";
import { createFeatureLoader } from "../../../src/page/feature-loader.js";
import { FEATURES } from "../../../src/page/features/registry.js";
import { highlightKey } from "../../../src/page/highlight.js";
import { posOf, select, typeText } from "./view-helpers.js";

/**
 * Code blocks are a feature: the highlighter and the language picker load the
 * first time a document has or takes a code block, and a plain document never
 * asks for them.
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
const fake = () => {
  const calls = [];
  const run = (code, lang) => {
    calls.push([code, lang]);
    return Promise.resolve([[{ content: code.slice(0, 5), offset: 0, color: "var(--page-code-token-keyword)", fontStyle: 0 }]]);
  };
  return { calls, run };
};
const decos = (view) => highlightKey.getState(view.state).find();
const picker = (view) => view.dom.querySelector("select.page-code-lang");

const PARAGRAPH = { t: "paragraph", pos: "B", c: "Hi" };
const CODE = { t: "code_block", pos: "B", c: "const x = 1", lang: "javascript" };

const open = (blocks, { highlight = {}, load = (id) => FEATURES[id].load() } = {}) => {
  const calls = [];
  const holder = { view: null };
  const features = createFeatureLoader({
    load: (id) => { calls.push(id); return load(id); },
    install: (id, mod) => installPageFeature({ view: holder.view, highlight }, id, mod),
    reportError: () => {},
  });
  const mount = document.body.appendChild(document.createElement("div"));
  const view = createPageEditor(mount, { blocks, features });
  holder.view = view;
  cleanups.push(() => {
    if (!view.isDestroyed) view.destroy();
    mount.remove();
  });
  return { view, calls };
};

test("a document with no code block never asks for the code feature", async () => {
  const { calls } = open({ p: PARAGRAPH });
  await flush();
  await flush();
  expect(calls).toEqual([]);
});

test("a code block at boot loads the feature once, with its picker and its colours", async () => {
  const { calls: tokens, run } = fake();
  const { view, calls } = open({ c: CODE }, { highlight: { tokenize: run, delay: 0 } });
  expect(await waitFor(() => picker(view) !== null)).toBe(true);
  expect(calls).toEqual(["code"]);
  expect(tokens).toEqual([["const x = 1", "javascript"]]);
  expect(view.dom.querySelector("pre").dataset.lang).toBe("javascript");
  expect(await waitFor(() => decos(view).length === 1)).toBe(true);
  expect(decos(view).map((d) => [d.from, d.to])).toEqual([[1, 6]]);
  await flush();
  expect(calls).toEqual(["code"]);
});

test("a code block inserted later loads the feature then", async () => {
  const { run } = fake();
  const { view, calls } = open({ p: PARAGRAPH }, { highlight: { tokenize: run, delay: 0 } });
  await flush();
  expect(calls).toEqual([]);
  expect(picker(view)).toBe(null);

  view.dispatch(view.state.tr.insert(view.state.doc.content.size, nodeFromBlock(schema, "c", CODE)));
  expect(await waitFor(() => picker(view) !== null)).toBe(true);
  expect(calls).toEqual(["code"]);
  expect(await waitFor(() => decos(view).length === 1)).toBe(true);
});

test("typing in a code block before the feature resolves keeps the text", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { view, calls } = open({ c: CODE }, { load: (id) => gate.then(() => FEATURES[id].load()) });
  await flush();
  expect(calls).toEqual(["code"]);
  expect(picker(view)).toBe(null);
  expect(view.dom.querySelector("pre")).toBeTruthy();

  select(view, posOf(view, "c", true));
  typeText(view, "2");
  expect(view.state.doc.child(0).textContent).toBe("const x = 12");

  release();
  expect(await waitFor(() => picker(view) !== null)).toBe(true);
  expect(view.state.doc.child(0).textContent).toBe("const x = 12");
  expect(picker(view).value).toBe("javascript");
});

test("destroying the editor stops the highlighter's timer", async () => {
  const scheduled = new Map();
  const cleared = new Set();
  const win = document.defaultView;
  const realSet = win.setTimeout;
  const realClear = win.clearTimeout;
  win.setTimeout = (fn, ms, ...rest) => { const id = realSet(fn, ms, ...rest); scheduled.set(id, ms); return id; };
  win.clearTimeout = (id) => { cleared.add(id); realClear(id); };
  try {
    const { run } = fake();
    const { view } = open({ c: CODE }, { highlight: { tokenize: run, delay: 400 } });
    expect(await waitFor(() => picker(view) !== null)).toBe(true);
    select(view, posOf(view, "c", true));
    typeText(view, "2");
    const pending = [...scheduled].filter(([, ms]) => ms === 400).map(([id]) => id);
    expect(pending.length).toBeGreaterThan(0);

    view.destroy();
    expect(pending.every((id) => cleared.has(id))).toBe(true);
  } finally {
    win.setTimeout = realSet;
    win.clearTimeout = realClear;
  }
});
