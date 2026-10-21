import { jest } from "@jest/globals";
import { execFileSync } from "node:child_process";
import * as Y from "../../../../src/vendor/yjs.vendor.js";
import { createStore } from "../../../../src/live/store.js";
import { registerUnsavedState, pendingIds, hasUnsavedState, flushUnsaved } from "../../../../src/lib/unsaved-state.js";
import { createYPageBinding, seedValue, LOCAL, docFromValue, yValueOf } from "../../../../src/page/ybind/index.js";

let opened;
beforeEach(() => { jest.useFakeTimers(); opened = []; });
afterEach(() => {
  for (const { binding } of opened) { binding.dispose(); binding.ydoc.destroy(); }
  jest.useRealTimers();
});
const open = (options = {}) => {
  const store = createStore({ name: "page", value: seedValue([{ id: "p", text: "First" }]) });
  const binding = createYPageBinding({ store, ...options });
  const result = { store, binding };
  opened.push(result);
  return result;
};
const edit = (binding, text = "!") => binding.ydoc.transact(() => binding.pd.flow.insert(binding.pd.flow.length, text), LOCAL);
const echo = (store) => store.rebase(JSON.parse(JSON.stringify(store.value)), { source: "remote", confirmed: store.pending.length });

test("optional host hooks leave a clean lab binding quiet", async () => {
  const { store, binding } = open();
  expect(pendingIds()).toEqual([]);
  await expect(binding.flush()).resolves.toEqual({ ok: true });
  expect(store.pending).toEqual([]);
  expect(binding.provider.stats.offered).toBe(0);
});

test("local edits, undo and redo request a checkpoint after their updates reach the store", () => {
  const observations = [];
  let store;
  const opened = open({ registerUnsavedState, checkpointWithin: (ms) => observations.push([ms, store.pending.length]) });
  store = opened.store;
  const { binding } = opened;
  expect(observations).toEqual([]);
  edit(binding);
  expect(pendingIds()).toEqual(["page:live"]);
  expect(binding.undo()).toBe(true);
  expect(binding.redo()).toBe(true);
  expect(observations).toHaveLength(3);
  expect(observations.every(([ms, pending]) => ms === 1500 && pending > 0)).toBe(true);
});

test("a file acknowledgment wakes flush without emitting a content change", async () => {
  const checkpoint = jest.fn(async () => ({ ok: true }));
  const within = jest.fn();
  const { store, binding } = open({ requestCheckpoint: checkpoint, checkpointWithin: within, registerUnsavedState });
  edit(binding);
  const change = jest.fn();
  const off = store.handle.on("change", change);
  const flushed = binding.flush({ timeoutMs: 1000 });
  expect(checkpoint).not.toHaveBeenCalled();
  expect(within).toHaveBeenLastCalledWith(0);
  store.confirm(store.mark);
  await expect(flushed).resolves.toEqual({ ok: true });
  expect(checkpoint).toHaveBeenCalledTimes(1);
  expect(checkpoint).toHaveBeenCalledWith({ timeoutMs: 1000 });
  expect(change).not.toHaveBeenCalled();
  expect(pendingIds()).toEqual([]);
  off();
});

test("a room acknowledgment wakes flush and gives the checkpoint only the remaining deadline", async () => {
  const checkpoint = jest.fn(async () => ({ ok: true }));
  const { store, binding } = open({ requestCheckpoint: checkpoint });
  edit(binding);
  const flushed = binding.flush({ timeoutMs: 1000 });
  await jest.advanceTimersByTimeAsync(125);
  expect(checkpoint).not.toHaveBeenCalled();
  echo(store);
  await expect(flushed).resolves.toEqual({ ok: true });
  expect(checkpoint).toHaveBeenCalledWith({ timeoutMs: 875 });
});

test("reconciliation restores a dropped local update before flush can report success", async () => {
  const checkpoint = jest.fn(async () => ({ ok: true }));
  const { store, binding } = open({ requestCheckpoint: checkpoint });
  const original = JSON.parse(JSON.stringify(store.value));
  edit(binding);
  store.rebase(original, { source: "state", drop: [1, store.mark] });
  expect(store.pending).toEqual([]);
  const flushed = binding.flush();
  expect(store.pending.length).toBeGreaterThan(0);
  expect(checkpoint).not.toHaveBeenCalled();
  store.confirm(store.mark);
  await expect(flushed).resolves.toEqual({ ok: true });
  expect(binding.doc().textContent).toBe("First!");
});

test("the unsaved registry flushes a dropped update before deferred reconciliation", async () => {
  const { store, binding } = open({ registerUnsavedState, checkpointWithin: () => {} });
  const original = JSON.parse(JSON.stringify(store.value));
  edit(binding);
  store.rebase(original, { source: "state", drop: [1, store.mark] });
  expect(store.pending).toEqual([]);
  expect(binding.provider.reconcilePending).toBe(true);
  expect(hasUnsavedState()).toBe(true);
  const flushed = flushUnsaved();
  await Promise.resolve();
  expect(binding.provider.stats.offered).toBe(1);
  expect(binding.provider.reconcilePending).toBe(false);
  expect(store.pending.length).toBeGreaterThan(0);
  store.confirm(store.mark);
  await expect(flushed).resolves.toEqual({ ok: true, pending: [] });
  expect(binding.doc().textContent).toBe("First!");
});

test("a waiting flush does not duplicate a multipart local update", async () => {
  const run = async (waiting) => {
    const ydoc = new Y.Doc();
    ydoc.clientID = 5;
    const { store, binding } = open({ ydoc, checkpointWithin: () => {} });
    edit(binding);
    const flushed = waiting ? binding.flush() : null;
    edit(binding, "0123456789abcdef".repeat(3750));
    await Promise.resolve();
    const result = {
      keys: Object.keys(store.value.y).sort(),
      bytes: Object.values(store.value.y).reduce((total, part) => total + part.length, 0),
      offered: binding.provider.stats.offered,
    };
    if (flushed) {
      binding.dispose();
      await flushed;
    }
    return result;
  };
  const withoutFlush = await run(false);
  const duringFlush = await run(true);
  expect(withoutFlush.keys.some((key) => /\.\d+\.\d+$/.test(key))).toBe(true);
  expect(duringFlush).toEqual(withoutFlush);
  expect(duringFlush.offered).toBe(0);
});

test("remote updates do not request a local checkpoint or become unsaved work", () => {
  const checkpointWithin = jest.fn();
  const { store, binding } = open({ checkpointWithin, registerUnsavedState });
  const peer = docFromValue(store.value);
  peer.getText("flow").insert(peer.getText("flow").length, " peer");
  store.rebase(yValueOf(peer), { source: "remote" });
  peer.destroy();
  expect(binding.doc().textContent).toBe("First peer");
  expect(checkpointWithin).not.toHaveBeenCalled();
  expect(pendingIds()).toEqual([]);
});

test("a pending timeout preserves work and a later flush can succeed", async () => {
  const checkpoint = jest.fn(async () => ({ ok: true }));
  const { store, binding } = open({ requestCheckpoint: checkpoint, registerUnsavedState });
  edit(binding);
  const pending = JSON.parse(JSON.stringify(store.pending));
  const first = binding.flush({ timeoutMs: 50 });
  await jest.advanceTimersByTimeAsync(50);
  await expect(first).resolves.toEqual({ ok: false, code: "timeout" });
  expect(store.pending).toEqual(pending);
  expect(pendingIds()).toEqual(["page:live"]);
  expect(checkpoint).not.toHaveBeenCalled();
  const second = binding.flush();
  echo(store);
  await expect(second).resolves.toEqual({ ok: true });
});

test("a checkpoint that never answers is bounded by the same deadline", async () => {
  const checkpoint = jest.fn(() => new Promise(() => {}));
  const { binding } = open({ requestCheckpoint: checkpoint });
  const flushed = binding.flush({ timeoutMs: 50 });
  await jest.advanceTimersByTimeAsync(50);
  expect(checkpoint).toHaveBeenCalledTimes(1);
  await expect(flushed).resolves.toEqual({ ok: false, code: "timeout" });
});

test("checkpoint refusal and rejection are returned to the caller", async () => {
  const checkpoint = jest.fn().mockResolvedValueOnce({ ok: false, code: "offline" }).mockRejectedValueOnce(new Error("offline"));
  const { binding } = open({ requestCheckpoint: checkpoint });
  await expect(binding.flush()).resolves.toEqual({ ok: false, code: "offline" });
  await expect(binding.flush()).resolves.toEqual({ ok: false, code: "checkpoint-failed", message: "offline" });
});

test("concurrent flushes have independent deadlines", async () => {
  const { store, binding } = open();
  edit(binding);
  const short = binding.flush({ timeoutMs: 50 });
  const long = binding.flush({ timeoutMs: 500 });
  await jest.advanceTimersByTimeAsync(100);
  store.confirm(store.mark);
  await expect(short).resolves.toEqual({ ok: false, code: "timeout" });
  await expect(long).resolves.toEqual({ ok: true });
});

test("the injected unsaved registry can flush the binding", async () => {
  const { store, binding } = open({ registerUnsavedState });
  edit(binding);
  const flushed = flushUnsaved();
  await Promise.resolve();
  store.confirm(store.mark);
  await expect(flushed).resolves.toEqual({ ok: true, pending: [] });
});

test("disposal resolves waiters, unregisters and prevents a queued checkpoint", async () => {
  const checkpoint = jest.fn(async () => ({ ok: true }));
  const within = jest.fn();
  const { store, binding } = open({ requestCheckpoint: checkpoint, checkpointWithin: within, registerUnsavedState });
  const flushed = binding.flush();
  binding.dispose();
  await expect(flushed).resolves.toEqual({ ok: false, code: "disposed" });
  await expect(binding.flush()).resolves.toEqual({ ok: false, code: "disposed" });
  edit(binding);
  store.confirm(store.mark);
  expect(checkpoint).not.toHaveBeenCalled();
  expect(within).not.toHaveBeenCalled();
  expect(pendingIds()).toEqual([]);
});

test("default lifecycle runs in plain Node without a host or DOM", () => {
  const bindingUrl = new URL("../../../../src/page/ybind/index.js", import.meta.url).href;
  const storeUrl = new URL("../../../../src/live/store.js", import.meta.url).href;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
    import { createYPageBinding, seedValue } from ${JSON.stringify(bindingUrl)};
    import { createStore } from ${JSON.stringify(storeUrl)};
    if (typeof window !== "undefined" || typeof document !== "undefined") throw new Error("Unexpected DOM");
    const store = createStore({ name: "page", value: seedValue([{id:"p",text:"First"}]) });
    const binding = createYPageBinding({ store });
    process.stdout.write(JSON.stringify(await binding.flush()));
    binding.dispose(); binding.ydoc.destroy();
  `], { encoding: "utf8" });
  expect(JSON.parse(output)).toEqual({ ok: true });
});
