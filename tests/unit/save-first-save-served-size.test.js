/**
 * save-first-save-served-size: a page that has never saved judges its size by the document
 * it was served as.
 *
 * `preparesSliced()` compares the bytes of the last accepted save with
 * `SLICED_SAVE_MIN_BYTES`, and a freshly opened page has no accepted save to compare. The
 * document the browser was served is what it has instead: a Journal of thousands of entries
 * is over the threshold before its first save, so its first autosave must prepare across
 * tasks rather than freeze typing. A page served small keeps the one-task path.
 *
 * Each case here is a page whose save code has never run a save, so the module is taken
 * fresh for it. The task boundary is the real one, and the clock spends the slice budget on
 * every step, so a prepared save always waits for a macrotask turn.
 */

import { jest } from "@jest/globals";
import { deserialize, serialize } from "node:v8";

globalThis.structuredClone ??= (value) => deserialize(serialize(value));

jest.setTimeout(120000);

// Comfortably over the threshold once serialized.
const BIG = 320 * 1024;

let posts = [];
let clock = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const drainMicrotasks = async (turns = 60) => { for (let i = 0; i < turns; i++) await Promise.resolve(); };
const lastPost = () => posts[posts.length - 1] ?? "";

function okJson(body) {
  return { ok: true, status: 200, statusText: "OK", headers: { get: () => null }, text: async () => JSON.stringify(body), json: async () => body };
}

function installRouter() {
  posts = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/_/save")) {
      posts.push(String(options.body ?? ""));
      return okJson({ msg: "Saved", etag: `etag-${posts.length}` });
    }
    return okJson({ spec: 1, document: { etag: "base-1" } });
  });
}

// A save that has settled before any macrotask turn took the one-task path: the prepared
// one always waits for at least one task boundary.
async function settlesInThisTask(promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await drainMicrotasks();
  return settled;
}

// The page the browser served, as its own measurement of the bytes it handed this document.
function stubServedSize(entry) {
  const own = Object.getOwnPropertyDescriptor(performance, "getEntriesByType");
  const original = performance.getEntriesByType;
  performance.getEntriesByType = function (type) {
    if (type === "navigation") return entry ? [entry] : [];
    return original ? original.call(this, type) : [];
  };
  return () => {
    if (own) Object.defineProperty(performance, "getEntriesByType", own);
    else delete performance.getEntriesByType;
  };
}

// The first save of a page served as `entry`: nothing has been saved yet, so the size the
// path is judged by is the served one.
async function firstSaveOf(entry) {
  jest.resetModules();
  Object.defineProperty(performance, "now", { configurable: true, writable: true, value: () => (clock += 10) });
  window.clayEditMode = true;
  window.clay = {};
  document.body.innerHTML = `<article id="filler">${"x".repeat(BIG)}</article><article id="c">initial</article>`;
  installRouter();
  const restoreServed = stubServedSize(entry);
  try {
    const save = await import("../../src/core/save.js");
    expect(save.getLastSavedBytes()).toBe(null);
    if (!save.baselineSettled()) save.adoptEntryBaseline();

    document.getElementById("c").textContent = "first-save";
    const sentBefore = posts.length;
    const saving = save.savePage();
    const sentWhilePreparing = posts.length - sentBefore;
    const settled = await settlesInThisTask(saving);
    const result = await saving;

    expect(result.ok).toBe(true);
    expect(posts.length).toBe(sentBefore + 1);
    expect(lastPost()).toContain("first-save");
    return { settled, sentWhilePreparing };
  } finally {
    restoreServed();
  }
}

test("a page served large takes the sliced path on its first save", async () => {
  const { settled, sentWhilePreparing } = await firstSaveOf({ decodedBodySize: 400 * 1024 });

  expect(sentWhilePreparing).toBe(0);
  expect(settled).toBe(false);
}, 60000);

test("a page served small keeps the one-task path on its first save", async () => {
  const { settled } = await firstSaveOf({ decodedBodySize: 1000 });

  expect(settled).toBe(true);
}, 60000);

test("a page with no served size keeps the one-task path on its first save", async () => {
  const { settled } = await firstSaveOf(null);

  expect(settled).toBe(true);
}, 60000);
