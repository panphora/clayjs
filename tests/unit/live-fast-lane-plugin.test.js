import { jest } from "@jest/globals";

/**
 * The plugin starts the fast lane on a live-data host, takes the room's state
 * when the live-lane stream opens, posts local ops, and checkpoints in fast mode
 * only as the writer and only after a change.
 */

const changed = jest.fn();
let deps;
await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: (d) => {
    deps = d;
    return { changed, flush: jest.fn(), deadline: null };
  },
}));
await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async (name) => name === "live-data",
  hostMeta: async () => ({ spec: 1, extensions: ["live-data"], document: null }),
}));

window.clayEditMode = true;
const requests = [];
let room = { epoch: "e1", seq: 0, writer: null, stores: { g: { value: { s: 0 }, ephemeral: false } } };
global.fetch = jest.fn(async (url, init = {}) => {
  requests.push({ url: String(url), init });
  if ((init.method || "GET") === "GET") return { ok: true, status: 200, json: async () => room };
  return { ok: true, status: 200, json: async () => ({ seq: 1, epoch: "e1" }), headers: { get: () => null } };
});

const { live, fastLane, storeOf, confirmSaved } = await import("../../src/plugins/live.js");
const bridge = await import("../../src/live/stream-bridge.js");
const snapshot = await import("../../src/core/snapshot.js");

const flushAsync = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test("the lane opens every live tag on the page, not only the one code asked for", async () => {
  document.body.innerHTML =
    '<script type="application/json" merge="g" clay="live">{"s":0}</script>' +
    '<script type="application/json" merge="other" clay="live">{"t":0}</script>';
  live("g");
  await flushAsync();
  expect(storeOf("other")).not.toBeNull();
});

test("joins the room, posts ops, and checkpoints only as the writer after a change", async () => {
  document.body.innerHTML = '<script type="application/json" merge="g" clay="live">{"s":0}</script>';
  const g = live("g");
  await flushAsync();
  expect(fastLane()).not.toBeNull();

  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  expect(g.status.mode).toBe("fast");
  expect(requests.some((r) => new URL(r.url).pathname === "/_/sync/data" && (r.init.method || "GET") === "GET")).toBe(true);
  expect(deps.needsSave()).toBe(false);

  g.add("s", 1);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await flushAsync();
  const post = requests.find((r) => r.init.method === "POST");
  expect(new URL(post.url).searchParams.get("client-id")).toBe("tab-1");
  expect(JSON.parse(post.init.body)).toEqual({ name: "g", n: 1, ops: [{ op: "add", path: ["s"], n: 1 }], epoch: "e1" });

  bridge.streamEvent("data", { epoch: "e1", seq: 1, name: "g", ops: [{ op: "add", path: ["s"], n: 1 }], from: "tab-1", n: 1 });
  expect(g.toJSON()).toEqual({ s: 1 });
  expect(deps.needsSave()).toBe(false);

  bridge.streamEvent("data-writer", { epoch: "e1", writer: "tab-1" });
  expect(fastLane().isWriter()).toBe(true);
  expect(deps.needsSave()).toBe(true);
  expect(changed).toHaveBeenCalled();

  const body = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  expect(body).toContain('{"s":1}');
  confirmSaved(body);
  expect(deps.needsSave()).toBe(false);
});
