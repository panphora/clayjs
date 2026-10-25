/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://fixture.invalid/document.html"}
 */
import { jest } from "@jest/globals";

/**
 * parse5 loads only for a page that writes an owned style.
 *
 * `clay.style()` stays synchronous, so the adopter queues the identity and the
 * stripper module arrives later. The three claims, in the order a page meets them:
 *
 *   a page that never writes one never asks for the stripper at all;
 *
 *   a page that writes one at boot stays clean once the baseline settles, and the
 *   close warning is quiet WHILE the stripper is still loading, which is the window
 *   the stored baselines still carry the owned tag;
 *
 *   a save asked for right after a style write stores the stripped comparison, so
 *   the style write does not go out as an edit.
 *
 * The stripper's module is held behind a deferred promise the test settles by hand,
 * and it hands back the real stripper once it settles, so the strips below are real
 * strips over real parse5.
 */

const actual = await import("../../src/core/style-comparisons.js");

const requested = [];
jest.unstable_mockModule("../../src/core/style-comparisons.js", () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  requested.push(release);
  return ready.then(() => ({ styleComparisonStripper: actual.styleComparisonStripper }));
});

const releaseStripper = () => {
  const releases = requested.splice(0);
  for (const release of releases) release();
};

const INLINE = '<style data-name="saved" clay="no-data">.item { color: red; }</style>';
const LINK = '<link rel="stylesheet" href="/app.css?v=1" clay="no-data">';

let save, snapshot, warning, style, bootPhase;

const posts = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate) => {
  for (let n = 0; n < 500; n++) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("test timed out");
};
const warn = () => {
  const event = new window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  globalThis.fetch = window.fetch = async (url, options) => {
    if (options?.method === "POST") {
      posts.push(String(options.body));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ msg: "Saved", msgType: "success" }),
      };
    }
    return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  };

  document.head.innerHTML = INLINE + LINK;
  document.body.innerHTML = '<p id="content">Original</p><div id="mount"></div>';

  // The loader holds save.js's settled baseline for a derive engine's first pass.
  // Holding it here is what lets the boot window outlive the module setup.
  bootPhase = (await import("../../src/core/boot-phase.js")).bootPhase;
  bootPhase.holdSettle = true;

  await import("../../src/core/admin-attrs.js");
  await import("../../src/core/persist.js");
  snapshot = await import("../../src/core/snapshot.js");
  save = await import("../../src/core/save.js");
  warning = await import("../../src/core/unsaved-warning.js");
  ({ style } = await import("../../src/lib/style.js"));
  window.clay.hasUnsavedChanges = warning.hasUnsavedChanges;
});

test("a page that never writes an owned style never requests the stripper", async () => {
  await sleep(50);

  expect(requested).toEqual([]);
  expect(save.baselineSettled()).toBe(false);
  expect(snapshot.captureForDirtyCheck()).toBe(save.getLastSavedDirty());
  expect(window.clay.hasUnsavedChanges()).toBe(false);
  expect(warn()).toBe(false);
  expect(posts).toEqual([]);
});

test("a style written at boot is clean after the baseline settles", async () => {
  expect(save.baselineSettled()).toBe(false);

  const tag = document.querySelector('style[data-name="saved"]');
  expect(style("saved", ".item { color: blue; }")).toBe(tag);
  expect(style("/app.css?v=2#fresh")).toBe(document.querySelector("link"));

  // The stripper is loading, and until it lands the stored baselines still carry the
  // tag: the page really does compare dirty. The warning is quiet anyway.
  expect(snapshot.captureForDirtyCheck()).not.toBe(save.getLastSavedDirty());
  await until(() => requested.length === 1);
  expect(snapshot.captureForDirtyCheck()).not.toBe(save.getLastSavedDirty());
  expect(window.clay.hasUnsavedChanges()).toBe(false);
  expect(warn()).toBe(false);

  releaseStripper();
  await save.styleAdoptionsSettled();
  expect(snapshot.captureForDirtyCheck()).toBe(save.getLastSavedDirty());
  expect(window.clay.hasUnsavedChanges()).toBe(false);

  save.releaseBootSettle();
  await until(() => save.baselineSettled());
  expect(snapshot.captureForDirtyCheck()).toBe(save.getLastSavedDirty());
  expect(warn()).toBe(false);
  expect(posts).toEqual([]);
});

test("a save right after a style write stores the stripped comparison", async () => {
  const tag = document.querySelector('style[data-name="saved"]');
  expect(style("saved", ".item { color: green; }")).toBe(tag);
  document.getElementById("content").textContent = "An edit after the style write";
  const saved = save.savePage();

  const result = await saved;
  expect(result.msgType).toBe("success");
  expect(posts.length).toBe(1);
  expect(posts[0]).toMatch(/color: green/);
  expect(posts[0]).toMatch(/An edit after the style write/);
  expect(save.getLastSavedDirty()).not.toMatch(/color: green|app\.css/);
  expect(save.getLastSavedDirty()).toMatch(/An edit after the style write/);
  expect(window.clay.hasUnsavedChanges()).toBe(false);
  expect(warn()).toBe(false);
});
