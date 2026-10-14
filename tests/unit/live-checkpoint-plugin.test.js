import { jest } from "@jest/globals";

/**
 * The live plugin drives the checkpoint clock: a saved store's local change
 * starts it, a never-saved store's does not, unsaved means pending ops, and
 * hiding the tab flushes.
 */

const changed = jest.fn();
const flush = jest.fn();
let deps;

await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: (d) => {
    deps = d;
    return { changed, soon: jest.fn(), flush, flushing: false, deadline: null };
  },
}));

window.clayEditMode = true;
const { live, receiveFrame } = await import("../../src/plugins/live.js");

const tag = (name, json, clay = "live") => `<script type="application/json" merge="${name}" clay="${clay}">${json}</script>`;

beforeEach(() => {
  changed.mockClear();
  flush.mockClear();
});

test("a saved store's local change starts the clock, and pending ops count as unsaved", () => {
  document.body.innerHTML = tag("c1", '{"s":0}');
  const game = live("c1");
  expect(deps.needsSave()).toBe(false);
  game.add("s", 1);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(deps.needsSave()).toBe(true);
});

test("a never-saved store's change does not start the clock or count as unsaved", () => {
  document.body.innerHTML = tag("c2", "{}", "live ephemeral");
  live("c2").set("x", 1);
  expect(changed).not.toHaveBeenCalled();
});

test("a remote value alone starts nothing", () => {
  document.body.innerHTML = tag("c3", '{"s":0}');
  live("c3");
  receiveFrame(`<!DOCTYPE html><html><body>${tag("c3", '{"s":9}')}</body></html>`);
  expect(changed).not.toHaveBeenCalled();
});

test("hiding the tab and pagehide flush", () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("pagehide"));
  expect(flush).toHaveBeenCalledTimes(2);
});
