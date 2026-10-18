import { jest } from "@jest/globals";
import { createStore } from "../../src/live/store.js";
import { createFastLane, RETRY_MS, STATE_TIMEOUT_MS } from "../../src/live/fast-lane.js";
import { fetchLiveState } from "../../src/live/server-lane.js";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const roomState = (value) => ({ epoch: "e1", seq: 0, writer: null, stores: { s: { value, last: 0, landed: 0 } } });

function tab(fetchState) {
  const store = createStore({ name: "s", value: { n: 0 } });
  const entries = new Map([["s", { store }]]);
  let handlers;
  const transport = {
    start(h) {
      handlers = h;
      return () => {};
    },
    send: async () => ({ status: 200, body: { seq: 1, epoch: "e1" } }),
    fetchState,
  };
  const lane = createFastLane({ transport, entries });
  lane.start();
  handlers.open({ clientId: "c", lane: "live" });
  return { store, lane };
}

test("a state read that never answers is aborted and made again, and its late answer is ignored", async () => {
  const reads = [];
  const t = tab((id, since, options) => new Promise((resolve) => reads.push({ resolve, signal: options.signal })));
  await jest.advanceTimersByTimeAsync(0);
  expect(reads).toHaveLength(1);
  expect(reads[0].signal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(STATE_TIMEOUT_MS);
  expect(reads[0].signal.aborted).toBe(true);
  expect(t.lane.status.synced).toBe(false);
  await jest.advanceTimersByTimeAsync(RETRY_MS);
  expect(reads).toHaveLength(2);
  reads[1].resolve(roomState({ n: 7 }));
  await jest.advanceTimersByTimeAsync(0);
  expect(t.store.value).toEqual({ n: 7 });
  expect(t.lane.status.synced).toBe(true);
  reads[0].resolve(roomState({ n: 99 }));
  await jest.advanceTimersByTimeAsync(0);
  expect(t.store.value).toEqual({ n: 7 });
  t.lane.stop();
});

test("an answered read leaves no deadline timer behind", async () => {
  const t = tab(async () => roomState({ n: 3 }));
  await jest.advanceTimersByTimeAsync(0);
  expect(t.store.value).toEqual({ n: 3 });
  expect(jest.getTimerCount()).toBe(0);
  t.lane.stop();
});

test("a stopped lane abandons the read it is waiting for", async () => {
  const t = tab(() => new Promise(() => {}));
  await jest.advanceTimersByTimeAsync(0);
  t.lane.stop();
  expect(jest.getTimerCount()).toBe(0);
});

test("the host transport hands the abort signal to fetch", async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(init.signal);
    return { ok: true, status: 200, json: async () => roomState({ n: 1 }) };
  };
  const controller = new AbortController();
  const state = await fetchLiveState("c", null, { signal: controller.signal });
  expect(state.epoch).toBe("e1");
  expect(seen).toEqual([controller.signal]);
});
