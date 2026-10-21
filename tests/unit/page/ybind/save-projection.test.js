import { jest } from "@jest/globals";
import { createStore } from "../../../../src/live/store.js";
import { createYPageBinding } from "../../../../src/page/ybind/binding.js";
import { blocksFromPageValues, blocksFromYValue } from "../../../../src/page/ybind/decode.js";
import { migrateHybridValues } from "../../../../src/page/ybind/migrate.js";
import { docFromValue, yValueOf, YDecodeError } from "../../../../src/page/ybind/provider.js";
import { RECORD } from "../fixtures/all-kinds.js";

const seed = () => migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "1", c: "First" } } }]);
const parse = (html) => new DOMParser().parseFromString(html, "text/html");
const tagValue = (doc) => JSON.parse(doc.querySelector('script[merge="page"]').textContent);
const idleTimers = { setTimer: () => 1, clearTimer: () => {} };
let snapshot, projection, save, live, storeOf;

beforeAll(async () => {
  window.clayEditMode = true;
  document.head.innerHTML = `<script type="application/json" merge="page" clay="live">${JSON.stringify(seed())}</script><script type="application/json" merge="prefs" clay="live">{"theme":"one"}</script><style id="owned-style" clay="no-dirty">.page { color: red; }</style>`;
  document.body.innerHTML = '<main><article data-page="1" clay="freeze" data-rev="old"><p>Load-time article</p></article></main>';
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '{"msg":"Saved"}' }));
  projection = await import("../../../../src/page/save-projection.js");
  snapshot = await import("../../../../src/core/snapshot.js");
  ({ live, storeOf } = await import("../../../../src/plugins/live.js"));
  save = await import("../../../../src/core/save.js");
});

beforeEach(() => {
  live("page").update((value) => {
    for (const key of Object.keys(value)) delete value[key];
    Object.assign(value, seed());
  });
  live("prefs").set("theme", "one");
  document.querySelector("article").innerHTML = '<div class="page-editor">Editor DOM</div>';
  global.fetch.mockClear();
});

test("a save carries its captured Yjs value and article even when another edit follows capture", async () => {
  const binding = createYPageBinding({ store: storeOf("page"), ...idleTimers });
  const editLater = () => {
    binding.pd.flow.insert(binding.pd.flow.length, " later");
    live("prefs").set("theme", "two");
  };
  document.addEventListener("clay:snapshot-ready", editLater, { once: true });
  try {
    expect((await save.savePageForce()).msgType).toBe("success");
    const posts = () => global.fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts()).toHaveLength(1);
    const first = parse(posts()[0][1].body);
    expect(first.querySelector("article").textContent).toBe("First");
    expect(blocksFromYValue(tagValue(first)).p.c).toBe("First");
    expect(JSON.parse(first.querySelector('script[merge="prefs"]').textContent).theme).toBe("one");
    expect(binding.doc().textContent).toBe("First later");
    expect(document.querySelector("article").textContent).toBe("Editor DOM");
    expect((await save.savePageForce()).msgType).toBe("success");
    expect(posts()).toHaveLength(2);
    const second = parse(posts()[1][1].body);
    expect(second.querySelector("article").textContent).toBe("First later");
    expect(blocksFromYValue(tagValue(second)).p.c).toBe("First later");
    expect(JSON.parse(second.querySelector('script[merge="prefs"]').textContent).theme).toBe("two");
    const reload = createYPageBinding({ store: createStore({ name: "page", value: tagValue(first) }), ...idleTimers });
    try { expect(reload.doc().textContent).toBe("First"); }
    finally { reload.dispose(); reload.ydoc.destroy(); }
  } finally {
    document.removeEventListener("clay:snapshot-ready", editLater);
    binding.dispose();
    binding.ydoc.destroy();
  }
});

test("the complete migrated fixture renders the same readable article as its hybrid record", () => {
  const legacy = projection.renderFromTags([JSON.stringify(RECORD)]);
  const converted = projection.renderFromTags([JSON.stringify(migrateHybridValues([RECORD]))]);
  expect(converted.html).toBe(legacy.html);
  expect(converted.rev).toBe(legacy.rev);
  const article = parse(converted.html);
  expect(article.querySelectorAll("tbody td")).toHaveLength(6);
  expect(article.querySelector('[data-id="tool"]').textContent).toBe("Launch in 9 days");
  expect(article.querySelector("strong")).not.toBeNull();
});

test("page and style updates stay out of comparison while the save carries both", () => {
  const before = snapshot.captureForSaveAndComparison({ emitForSync: false, flushUndo: false });
  document.querySelector("article").textContent = "Different editor DOM";
  document.getElementById("owned-style").textContent = ".page { color: blue; }";
  live("page").set("y", migrateHybridValues([{ blocks: { p: { t: "paragraph", pos: "1", c: "Changed" } } }]).y);
  const after = snapshot.captureForSaveAndComparison({ emitForSync: false, flushUndo: false });
  expect(after.forComparison).toBe(before.forComparison);
  expect(after.forDirty).toBe(before.forDirty);
  expect(after.forComparison).not.toContain("<article");
  const doc = parse(after.forSave);
  expect(doc.querySelector("article").textContent).toBe("Changed");
  expect(doc.getElementById("owned-style").textContent).toBe(".page { color: blue; }");
});

test("fast captures omit only incomplete multipart groups from the saved page tag", () => {
  const store = storeOf("page");
  const value = seed();
  const text = Object.values(value.y).join("");
  const half = Math.floor(text.length / 2);
  const first = { ...value, y: { ...value.y, "orphan.0.2": text.slice(0, half) } };
  store.setMode("fast");
  try {
    store.rebase(first, { source: "remote" });
    const partial = parse(snapshot.captureForSaveAndComparison({ emitForSync: false, flushUndo: false }).forSave);
    expect(partial.querySelector("article").textContent).toBe("First");
    expect(tagValue(partial).y).toEqual(value.y);
    expect(store.authoritative.y["orphan.0.2"]).toBe(first.y["orphan.0.2"]);

    const complete = { ...value, y: { ...first.y, "orphan.1.2": text.slice(half) } };
    store.rebase(complete, { source: "remote" });
    const finished = parse(snapshot.captureForSaveAndComparison({ emitForSync: false, flushUndo: false }).forSave);
    expect(tagValue(finished).y).toEqual(complete.y);
    expect(finished.querySelector("article").textContent).toBe("First");

    store.rebase({ ...value, y: { ...value.y, "bad.0.2": "@@bad@@" } }, { source: "remote" });
    expect(() => snapshot.captureForSaveAndComparison({ emitForSync: false, flushUndo: false })).toThrow(YDecodeError);
  } finally {
    store.setMode("file");
  }
});

test.each([
  ["malformed", { seed: "@@bad@@" }],
  ["incomplete", { "seed.0.2": "AAAA" }],
])("%s Yjs data fails both real save entry points without a write or a live article change", async (_, y) => {
  live("page").set("y", y);
  const before = document.querySelector("article").outerHTML;
  const pending = JSON.parse(JSON.stringify(storeOf("page").pending));
  const prefs = JSON.parse(JSON.stringify(storeOf("prefs").pending));
  const errors = [];
  const onError = (event) => errors.push(event.detail.msg);
  document.addEventListener("clay:save-error", onError);
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const savePage of [save.savePage, save.savePageForce]) {
      const callback = jest.fn();
      const result = await savePage(callback);
      expect(result.msgType).toBe("error");
      expect(callback).toHaveBeenCalledWith(result);
      expect(document.documentElement.getAttribute("savestatus")).toBe("error");
      expect(live("page").toJSON().y).toEqual(y);
      expect(storeOf("page").pending).toEqual(pending);
      expect(storeOf("prefs").pending).toEqual(prefs);
    }
    expect(errors).toHaveLength(2);
    expect(errors.every(Boolean)).toBe(true);
    expect(global.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    expect(document.querySelector("article").outerHTML).toBe(before);
    live("page").set("y", seed().y);
    expect((await save.savePageForce()).msgType).toBe("success");
    expect(global.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  } finally {
    log.mockRestore();
    document.removeEventListener("clay:save-error", onError);
  }
});

test("unsupported or mixed page values refuse instead of replacing the article with an empty projection", () => {
  const value = seed();
  for (const values of [[{ ...value, v: 2 }], [{ ...value, blocks: {} }], [{ ...value, deleted: {} }], [value, value], [value, { blocks: {} }], [null], [[]]]) {
    expect(() => blocksFromPageValues(values)).toThrow(YDecodeError);
  }
  expect(() => projection.renderFromTags(['{"v":1,"y":'])).toThrow(YDecodeError);
  expect(projection.renderFromTags([JSON.stringify(value)]).html).toContain("First");
  expect(blocksFromPageValues([{ blocks: { a: { t: "paragraph", pos: "1", c: "old" } } }, { blocks: { a: { t: "paragraph", pos: "1", c: "new" } } }]).a.c).toBe("new");
});

test("a complete folded capture reloads without generating startup frames", () => {
  const doc = docFromValue(seed(), { strict: true });
  const full = yValueOf(doc);
  doc.destroy();
  const value = { ...full, y: { "mfold-0": full.y.seed } };
  const store = createStore({ name: "page", value });
  const binding = createYPageBinding({ store, ...idleTimers });
  try {
    binding.provider.settle();
    expect(binding.doc().textContent).toBe("First");
    expect(store.pending).toHaveLength(0);
    expect(store.value).toEqual(value);
    expect(binding.provider.stats.offered).toBe(0);
    expect(binding.provider.stats.compactions).toBe(0);
    expect(projection.renderFromTags([JSON.stringify(store.value)]).html).toContain("First");
  } finally { binding.dispose(); binding.ydoc.destroy(); }
});
