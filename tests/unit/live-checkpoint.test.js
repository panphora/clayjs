import { jest } from "@jest/globals";
import { createCheckpoints, CHECKPOINT_MS, RETRY_MS } from "../../src/live/checkpoint.js";

/**
 * The checkpoint clock: a fixed deadline from the first unsaved change, retries
 * while blocked or skipped, a full interval after a failure, and a flush that
 * saves at once when the tab goes away.
 */

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function setup({ needs = true, blocked = false, result = { ok: true } } = {}) {
  const state = { needs, blocked, result };
  const save = jest.fn(async () => state.result);
  const saveNow = jest.fn();
  const cp = createCheckpoints({ needsSave: () => state.needs, blocked: () => state.blocked, save, saveNow });
  return { state, save, saveNow, cp };
}

async function tick(ms) {
  await jest.advanceTimersByTimeAsync(ms);
}

test("the first change starts a fixed deadline that later changes do not move", async () => {
  const { save, cp } = setup();
  cp.changed();
  await tick(CHECKPOINT_MS - 1000);
  cp.changed();
  cp.changed();
  await tick(999);
  expect(save).not.toHaveBeenCalled();
  await tick(1);
  expect(save).toHaveBeenCalledTimes(1);
});

test("nothing unsaved at the deadline means no save", async () => {
  const { state, save, cp } = setup();
  cp.changed();
  state.needs = false;
  await tick(CHECKPOINT_MS);
  expect(save).not.toHaveBeenCalled();
  expect(cp.deadline).toBeNull();
});

test("while blocked it retries every second, then saves", async () => {
  const { state, save, cp } = setup({ blocked: true });
  cp.changed();
  await tick(CHECKPOINT_MS + RETRY_MS * 3);
  expect(save).not.toHaveBeenCalled();
  state.blocked = false;
  await tick(RETRY_MS);
  expect(save).toHaveBeenCalledTimes(1);
});

test("a skipped save retries in a second; a saved one still unsaved waits a full interval", async () => {
  const { state, save, cp } = setup({ result: { ok: false, msgType: "skipped" } });
  cp.changed();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(1);
  state.result = { ok: true };
  await tick(RETRY_MS);
  expect(save).toHaveBeenCalledTimes(2);
  await tick(CHECKPOINT_MS - 1);
  expect(save).toHaveBeenCalledTimes(2);
  await tick(1);
  expect(save).toHaveBeenCalledTimes(3);
});

test("a failed save waits a full interval before trying again", async () => {
  const { save, cp } = setup({ result: { ok: false, msgType: "error" } });
  cp.changed();
  await tick(CHECKPOINT_MS);
  await tick(RETRY_MS);
  expect(save).toHaveBeenCalledTimes(1);
  await tick(CHECKPOINT_MS - RETRY_MS);
  expect(save).toHaveBeenCalledTimes(2);
});

test("once everything is saved, the next change starts a new clock", async () => {
  const { state, save, cp } = setup();
  cp.changed();
  await tick(CHECKPOINT_MS);
  state.needs = false;
  await tick(CHECKPOINT_MS * 2);
  expect(save).toHaveBeenCalledTimes(1);
  state.needs = true;
  cp.changed();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(2);
});

test("flush saves now and cancels the clock; it does nothing when clean or blocked", async () => {
  const { state, save, saveNow, cp } = setup();
  cp.changed();
  cp.flush();
  state.needs = false;
  await tick(0);
  expect(saveNow).toHaveBeenCalledTimes(1);
  expect(cp.deadline).toBeNull();
  await tick(CHECKPOINT_MS);
  expect(save).not.toHaveBeenCalled();

  state.needs = false;
  cp.flush();
  state.needs = true;
  state.blocked = true;
  cp.flush();
  expect(saveNow).toHaveBeenCalledTimes(1);
});

test("a flush whose save is skipped arms the clock again", async () => {
  const { save, saveNow, cp } = setup();
  saveNow.mockImplementation(async () => ({ ok: false, msgType: "skipped" }));
  cp.changed();
  cp.flush();
  await tick(0);
  expect(cp.deadline).not.toBeNull();
  await tick(RETRY_MS);
  expect(save).toHaveBeenCalledTimes(1);
});

test("soon arms at now", async () => {
  const { save, cp } = setup();
  cp.changed();
  cp.soon();
  await tick(0);
  expect(save).toHaveBeenCalledTimes(1);
  await tick(CHECKPOINT_MS - 1);
  expect(save).toHaveBeenCalledTimes(1);
});

test("soon is a no-op while a save runs", async () => {
  const { save, cp } = setup();
  let resolve;
  save.mockImplementation(() => new Promise((r) => (resolve = r)));
  cp.changed();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(1);
  cp.soon();
  expect(cp.deadline).toBeNull();
  resolve({ ok: true });
  await tick(RETRY_MS);
  expect(save).toHaveBeenCalledTimes(1);
});

test("flushing is true while the hide save runs and false after", async () => {
  const { saveNow, cp } = setup();
  let resolve;
  saveNow.mockImplementation(() => new Promise((r) => (resolve = r)));
  cp.changed();
  cp.flush();
  await tick(0);
  expect(cp.flushing).toBe(true);
  resolve({ ok: true });
  await tick(0);
  expect(cp.flushing).toBe(false);
});

test("a flush whose save throws waits a full interval, then saves", async () => {
  const { save, saveNow, cp } = setup();
  saveNow.mockImplementation(async () => {
    throw new Error("offline");
  });
  cp.changed();
  cp.flush();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(1);
});

test("after a failed save, soon does not save again before the retry time", async () => {
  const { save, cp } = setup({ result: { ok: false, msgType: "error" } });
  cp.changed();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(1);
  const failed = save.mock.calls.length;

  for (let ms = 0; ms < 60000; ms += 100) {
    await tick(100);
    cp.soon();
  }
  expect(save.mock.calls.length - failed).toBeLessThanOrEqual(8);
});

test("within arms a save ms from now when no deadline is set", async () => {
  const { save, cp } = setup();
  cp.within(1500);
  await tick(1499);
  expect(save).not.toHaveBeenCalled();
  await tick(1);
  expect(save).toHaveBeenCalledTimes(1);
});

test("within leaves an earlier deadline alone", async () => {
  const { save, cp } = setup();
  cp.soon();
  const armed = cp.deadline;
  cp.within(1500);
  expect(cp.deadline).toBe(armed);
  await tick(0);
  expect(save).toHaveBeenCalledTimes(1);
});

test("within moves an 8 s deadline earlier to the requested one", async () => {
  const { save, cp } = setup();
  cp.changed();
  cp.within(1500);
  await tick(1500);
  expect(save).toHaveBeenCalledTimes(1);
});

test("after a failed save, within arms no earlier than the retry time", async () => {
  const { save, cp } = setup({ result: { ok: false, msgType: "error" } });
  cp.changed();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(1);
  const armed = cp.deadline;
  cp.within(100);
  expect(cp.deadline).toBe(armed);
  await tick(100);
  expect(save).toHaveBeenCalledTimes(1);
});

test("within is a no-op while a save runs", async () => {
  const { save, cp } = setup();
  let resolve;
  save.mockImplementation(() => new Promise((r) => (resolve = r)));
  cp.changed();
  await tick(CHECKPOINT_MS);
  expect(save).toHaveBeenCalledTimes(1);
  cp.within(1500);
  expect(cp.deadline).toBeNull();
  resolve({ ok: true });
  await tick(0);
});
