/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

const changed = jest.fn();
await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: () => ({ changed, soon: jest.fn(), flush: jest.fn(), within: jest.fn(), flushing: false, deadline: null }),
}));

let release;
const gate = new Promise((r) => { release = r; });
await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async (name) => { await gate; return name === "live-data" || name === "live-provenance"; },
  hostMeta: async () => ({ spec: 1, extensions: ["live-data", "live-provenance"], document: null }),
  hostMetaOutcome: () => null,
  hostVersions: async () => null,
  querySaveOutcome: null,
  resetHostMeta: () => {},
}));

const streams = [];
global.fetch = jest.fn(async (url, init = {}) => {
  streams.push(String(url) + " " + (init.method || "GET"));
  return { ok: true, status: 200, json: async () => ({}), headers: { get: () => null } };
});
global.EventSource = class { constructor(u) { streams.push("EventSource " + u); this.readyState = 0; } close() { streams.push("EventSource closed"); } addEventListener() {} };

const live = await import("../../src/plugins/live.js");
const facts = await import("../../src/core/is-edit-mode.js");
const flushAsync = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test("an entry refused before the host answers starts no lane when the answer arrives", async () => {
  facts.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
  document.body.innerHTML = `<script type="application/json" merge="g" clay="live">{"s":0}</script>`;
  live.live("g");
  const lease = live.liveWriterParticipant().prepare({ generation: 1 });
  expect(live.fastLane()).toBeNull();
  // The entry is refused (another participant failed): the controller disposes in reverse.
  lease.dispose();
  expect(live.fastLane()).toBeNull();
  release();
  await flushAsync();
  await new Promise((r) => setTimeout(r, 50));
  expect(live.fastLane()).toBeNull();
});
