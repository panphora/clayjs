import { jest } from "@jest/globals";
import { resolveModules, MODULES } from "../../../src/loader-logic.js";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { blocksFromYValue } from "../../../src/page/ybind/decode.js";

/**
 * The page plugin: installs the real editor over a strict Yjs page store through
 * clay.live, saves through the shared capture, adopts a hand-edited article once,
 * and leaves nothing behind on dispose.
 */

let extensions = ["page"];

await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
  hostMeta: async () => ({ spec: 1, extensions, document: null }),
  hostSupports: async (name) => extensions.includes(name),
  hostMetaOutcome: () => "ok",
  querySaveOutcome: () => null,
  resetHostMeta: () => {},
}));

await jest.unstable_mockModule("../../../src/core/save.js", () => ({
  savePageForce: async () => ({ ok: true, msgType: "success" }),
  savePage: async () => ({ ok: true, msgType: "success" }),
  savePageThrottled: () => {},
  baselineSettled: () => true,
  isSaveConflicted: () => false,
  autosaveIsSuspended: () => false,
  suspendAutosave: () => {},
  resumeAutosave: () => {},
  holdAllSaves: () => {},
  releaseAllSaves: () => {},
  getLastSavedDirty: () => false,
  setLastSavedBaselines: () => {},
  getLastSavedBytes: () => null,
}));

await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
  localLaneSupported: () => false,
  localTransport: () => ({}),
}));

window.clayEditMode = true;

const { live, storeOf } = await import("../../../src/plugins/live.js");
window.clay = { live };
const { page } = await import("../../../src/plugins/page.js");
await import("../../../src/plugins/indicator.js");
const snapshot = await import("../../../src/core/snapshot.js");
const projection = await import("../../../src/page/save-projection.js");
const { hasUnsavedState, pendingIds } = await import("../../../src/lib/unsaved-state.js");

const clone = (v) => JSON.parse(JSON.stringify(v));
const tagText = (doc) => JSON.parse(doc.querySelector('script[merge="page"]').textContent);
const tagHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
const articleHtml = (value) => {
  const { html, rev } = projection.renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};

function setPage(blocks) {
  const value = seedValue(blocks);
  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleHtml(value);
  if (!storeOf("page")) live("page");
  const store = storeOf("page");
  live("page").update((data) => {
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, clone(value));
  });
  store.confirm(store.mark);
  return { value, store };
}

const params = (obj = {}) => new URLSearchParams(obj);

afterEach(() => {
  page.dispose();
  extensions = ["page"];
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("a typed edit reaches the live store and the capture carries the projected article and page store", async () => {
  const { store } = setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  const view = page.view;
  expect(view).toBeTruthy();

  view.dispatch(view.state.tr.insertText("!", 6));
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello!");

  const cap = snapshot.captureForSaveAndComparison({ flushUndo: false, emitForSync: false });
  const saved = new DOMParser().parseFromString(cap.forSave, "text/html");
  const expected = projection.renderFromTags([JSON.stringify(storeOf("page").value)]);
  expect(saved.querySelector("article").innerHTML).toBe(expected.html);
  expect(saved.querySelector("article").getAttribute("data-rev")).toBe(expected.rev);
  expect(blocksFromYValue(tagText(saved)).p.c).toBe("Hello!");
  expect(tagText(saved).y).toEqual(storeOf("page").value.y);
});

test("a hand-edited boot article adopts once and stays adopted after a remount", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  document.querySelector('article[data-page] [data-id="p"]').textContent = "Hello, edited";
  const adopted = [];
  const onAdopted = (event) => adopted.push(event.detail);
  document.addEventListener("clay:page-adopted", onAdopted);

  await page.install();
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello, edited");
  expect(adopted).toEqual([{ edited: 1, created: 0, deleted: 0, moved: false }]);

  await page.install();
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello, edited");
  expect(adopted).toHaveLength(1);
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  document.removeEventListener("clay:page-adopted", onAdopted);
});

test("an outside edit to words the tab also changed offers a download of the tab's copy", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello world" }]);
  await page.install();
  const view = page.view;
  const end = view.state.doc.content.size - 1;
  view.dispatch(view.state.tr.insertText("!", end));
  expect(blocksFromYValue(storeOf("page").value).p.c).toBe("Hello world!");

  const value = seedValue([{ id: "p", t: "paragraph", text: "Hello world" }]);
  const { html, rev } = projection.renderFromTags([JSON.stringify(value)]);
  const file = new DOMParser().parseFromString(`<!DOCTYPE html><html><head>${tagHtml(value)}</head><body><article data-page="1" data-rev="${rev}">${html}</article></body></html>`, "text/html");
  file.querySelector('[data-id="p"]').textContent = "Hello friend";
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: "<!DOCTYPE html>" + file.documentElement.outerHTML } }));

  for (let i = 0; i < 50 && !toasts().some((t) => t.textContent.includes("Some changes you made were replaced")); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const toast = toasts().find((t) => t.textContent.includes("Some changes you made were replaced"));
  expect(toast.textContent).toContain("Some changes you made were replaced by a change made outside the editor.");
  expect(actionLabels(toast)).toEqual(["Download your copy"]);
});

test("an unsupported host keeps the article untouched and reports blocked", async () => {
  extensions = [];
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  const before = document.querySelector("article[data-page]").outerHTML;
  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);

  await page.install();
  expect(page.view).toBe(null);
  expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
  expect(document.querySelector("article[data-page]").outerHTML).toBe(before);
  expect(states).toEqual([{ state: "blocked", code: "unsupported-host", message: "This host does not support page editing" }]);
  document.removeEventListener("clay:page-save-state", onState);
});

test("the AI entry follows the host capability", async () => {
  setPage([{ id: "p", t: "paragraph", text: "" }]);
  await page.install({ transport: { request: async () => ({}), cancel: () => {} } });
  page.view.dom.parentElement.querySelector(".page-plus").click();
  expect(page.view.dom.parentElement.querySelector(".page-menu").textContent).not.toContain("Make a tool with AI");

  extensions = ["page", "page-tool/1"];
  await page.install({ transport: { request: async () => ({}), cancel: () => {} } });
  page.view.dom.parentElement.querySelector(".page-plus").click();
  expect(page.view.dom.parentElement.querySelector(".page-menu").textContent).toContain("Make a tool with AI");
});

test("legacy hybrid and malformed page data warn and stay readable without mounting", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const record = { blocks: { p: { t: "paragraph", pos: "1", c: "Hello" } }, deleted: {} };
  const hybrid = projection.renderFromTags([JSON.stringify(record)]);
  document.head.innerHTML = tagHtml(record);
  document.body.innerHTML = `<article data-page="1" data-rev="${hybrid.rev}">${hybrid.html}</article>`;
  const before = document.querySelector("article[data-page]").outerHTML;

  await page.install();
  expect(page.view).toBe(null);
  expect(document.querySelector("article[data-page]").outerHTML).toBe(before);
  expect(warn).toHaveBeenCalled();

  warn.mockClear();
  document.head.innerHTML = tagHtml({ v: 1, y: { seed: "@@bad@@" } });
  await page.install();
  expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
  expect(warn).toHaveBeenCalled();

  warn.mockClear();
  document.head.innerHTML = '<script type="application/json" merge="page" clay="live">{oops</script>';
  await page.install();
  expect(page.view).toBe(null);
  expect(warn).toHaveBeenCalled();

  warn.mockRestore();
});

test("duplicate tags or articles refuse and leave the page readable", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const { value } = setPage([{ id: "p", t: "paragraph", text: "Hello" }]);

  document.head.innerHTML = tagHtml(value) + tagHtml(value);
  const before = document.querySelector("article[data-page]").outerHTML;
  await page.install();
  expect(page.view).toBe(null);
  expect(document.querySelector("article[data-page]").outerHTML).toBe(before);

  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleHtml(value) + articleHtml(value);
  await page.install();
  expect(page.view).toBe(null);
  expect(document.querySelectorAll("article[data-page]")).toHaveLength(2);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a remount leaves one shell, one binding writer, one adopted sync listener and one unsaved source", async () => {
  const { store } = setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  const counts = { onLocal: 0, onRebase: 0, onConfirm: 0, offLocal: 0, offRebase: 0, offConfirm: 0 };
  for (const key of ["onLocal", "onRebase", "onConfirm"]) {
    const original = store[key].bind(store);
    jest.spyOn(store, key).mockImplementation((fn) => {
      counts[key] += 1;
      const off = original(fn);
      return () => { counts[`off${key.slice(2)}`] += 1; off(); };
    });
  }

  await page.install();
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
  expect(counts.onLocal - counts.offLocal).toBe(1);
  expect(pendingIds()).toEqual(["page:live"]);

  await page.install();
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  expect(document.querySelectorAll(".page-editor")).toHaveLength(1);
  expect(counts.onLocal).toBe(2);
  expect(counts.onLocal - counts.offLocal).toBe(1);
  expect(pendingIds()).toEqual(["page:live"]);

  page.dispose();
  expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
  expect(counts.onLocal - counts.offLocal).toBe(0);
  expect(pendingIds()).toEqual([]);

  for (const key of ["onLocal", "onRebase", "onConfirm"]) store[key].mockRestore();
});

test("flush waits for the checkpoint, and a timeout keeps hasUnsavedState true", async () => {
  const { store } = setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  expect(storeOf("page").pending.length).toBeGreaterThan(0);

  const asked = page.flush({ timeoutMs: 1000 });
  let settled = false;
  asked.then(() => { settled = true; });
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);

  store.confirm(store.mark);
  await expect(asked).resolves.toEqual({ ok: true });
  expect(hasUnsavedState()).toBe(false);

  page.view.dispatch(page.view.state.tr.insertText("?", 7));
  await expect(page.flush({ timeoutMs: 25 })).resolves.toEqual({ ok: false, code: "timeout" });
  store.confirm(store.mark);
  expect(storeOf("page").pending).toEqual([]);
  expect(hasUnsavedState()).toBe(true);

  await expect(page.flush({ timeoutMs: 500 })).resolves.toEqual({ ok: true });
  expect(hasUnsavedState()).toBe(false);
});

test("dispose removes the adopted sync listener, the shell and the unsaved source", async () => {
  const { store } = setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  const remove = jest.spyOn(document, "removeEventListener");
  await page.install();
  page.view.dispatch(page.view.state.tr.insertText("!", 6));
  expect(document.querySelectorAll(".page-shell")).toHaveLength(1);
  expect(pendingIds()).toEqual(["page:live"]);

  page.dispose();
  page.dispose();
  expect(remove.mock.calls.some(([type]) => type === "clay:sync-applied")).toBe(true);
  expect(document.querySelectorAll(".page-shell")).toHaveLength(0);
  expect(document.querySelectorAll(".page-editor")).toHaveLength(0);
  expect(pendingIds()).toEqual([]);
  expect(blocksFromYValue(store.value).p.c).toBe("Hello!");
  expect(document.querySelector("article[data-page]").textContent).toContain("Hello!");
  expect(document.querySelector("article[data-page]").getAttribute("data-rev")).toBeTruthy();
  remove.mockRestore();
});

const chip = () => document.querySelector("[data-clay-indicator]");
const toasts = () => [...document.querySelectorAll("[data-clay-toast]")];
const actionLabels = (el) => [...el.querySelectorAll("button")].map((b) => b.textContent).filter(Boolean);

test("a known code shows the blocked chip and toast, a retrying save waits out its bound and clears on saved", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  try {
    document.dispatchEvent(new CustomEvent("clay:save-error", {
      detail: { code: "too-large", msg: "This page is too large to save" },
    }));

    expect(chip().textContent).toBe("Can't save here");
    expect(states.at(-1)).toEqual({ state: "blocked", code: "too-large", message: "This page is too large to save" });
    const blocked = toasts().at(-1);
    expect(blocked.textContent).toContain("Can't save here. Your edits are still in this tab.");
    expect(blocked.textContent).toContain("This page is too large to save");
    expect(actionLabels(blocked)).toEqual(["Download a copy", "Copy text"]);

    // Saved clears the blocked toast and the chip reports it.
    document.dispatchEvent(new CustomEvent("clay:save-saved"));
    await new Promise((resolve) => setTimeout(resolve, 520));
    expect(toasts()).toEqual([]);
    expect(states.at(-1).state).toBe("saved");

    // An unknown code leaves the generic feedback alone.
    const before = states.length;
    document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { code: "mystery", msg: "?" } }));
    expect(states).toHaveLength(before);
    expect(toasts()).toEqual([]);

    // Fake timers only for the 45-second bound: the chip holds at once and the
    // toast waits for the bound, survives a repeated failure, and clears on saved.
    jest.useFakeTimers();
    document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { code: "busy", msg: "Busy" } }));
    expect(chip().textContent).toBe("Saving\u2026");
    expect(states.at(-1)).toEqual({ state: "retrying", code: "busy", message: "Busy" });
    expect(toasts()).toEqual([]);

    jest.advanceTimersByTime(10000);
    document.dispatchEvent(new CustomEvent("clay:save-error", { detail: { code: "busy", msg: "Busy" } }));
    jest.advanceTimersByTime(34999);
    expect(toasts()).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(toasts().at(-1).textContent).toContain("Still trying to save. Your edits are safe in this tab.");

    document.dispatchEvent(new CustomEvent("clay:save-saved"));
    jest.advanceTimersByTime(500);
    expect(toasts()).toEqual([]);
    expect(states.at(-1).state).toBe("saved");
    jest.runOnlyPendingTimers();
  } finally {
    document.removeEventListener("clay:page-save-state", onState);
    jest.useRealTimers();
  }
});

test("an unsupported host shows the blocked toast with both export actions", async () => {
  extensions = [];
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();

  const toast = toasts().at(-1);
  expect(toast.textContent).toContain("Can't save here. Your edits are still in this tab.");
  expect(toast.textContent).toContain("This host does not support page editing");
  expect(actionLabels(toast)).toEqual(["Download a copy", "Copy text"]);

  page.dispose();
  await new Promise((resolve) => setTimeout(resolve, 520));
  expect(toasts()).toEqual([]);
});

test("a retrying event with no code is retrying, and an unknown code never dispatches a page state", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  const states = [];
  const onState = (event) => states.push(event.detail);
  document.addEventListener("clay:page-save-state", onState);
  try {
    document.dispatchEvent(new CustomEvent("clay:save-offline", { detail: { msg: "Offline" } }));
    expect(states.at(-1)).toEqual({ state: "retrying", code: null, message: "Offline" });

    const before = states.length;
    document.dispatchEvent(new CustomEvent("clay:live-notice", { detail: { name: "other", code: "too-large", message: "x" } }));
    document.dispatchEvent(new CustomEvent("clay:live-notice", { detail: { name: "page", code: "save-uncertain", message: "x" } }));
    expect(states).toHaveLength(before);
  } finally {
    document.removeEventListener("clay:page-save-state", onState);
  }
});

test("dispose removes every save-state listener the plugin added", async () => {
  setPage([{ id: "p", t: "paragraph", text: "Hello" }]);
  await page.install();
  const remove = jest.spyOn(document, "removeEventListener");
  page.dispose();
  const removed = remove.mock.calls.map(([type]) => type);
  for (const type of ["clay:save-error", "clay:save-offline", "clay:save-conflict", "clay:save-saved", "clay:live-notice"]) {
    expect(removed).toContain(type);
  }
  remove.mockRestore();
});

test("view mode resolves without the page plugin and never calls its module thunk", async () => {
  const view = resolveModules(params({ plugins: "page" }), false);
  expect(view.plugins).not.toContain("plugins/page.js");
  const spy = jest.spyOn(MODULES, "plugins/page.js");
  // live-sync opens its stream on evaluation, so it is the one implied module not run here.
  await Promise.all(view.plugins.filter((path) => path !== "sync/live-sync.js").map((path) => MODULES[path]()));
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();

  const edit = resolveModules(params({ plugins: "page" }), true);
  expect(edit.plugins).toContain("plugins/live.js");
  expect(edit.plugins).toContain("sync/live-sync.js");
  expect(edit.plugins).toContain("plugins/page.js");
});
