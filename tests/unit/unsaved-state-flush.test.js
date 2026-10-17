import { jest } from "@jest/globals";

/**
 * flushUnsaved: pending sources that can finish on their own are asked to, and
 * waited for; the ones that cannot stay pending and are reported. A registration
 * without a flush behaves exactly as before.
 */

let unsaved;
const registrations = [];

function register(options) {
  const handle = unsaved.registerUnsavedState(options);
  registrations.push(handle);
  return handle;
}

beforeAll(async () => {
  unsaved = await import("../../src/lib/unsaved-state.js");
});

afterEach(() => {
  for (const handle of registrations) handle.dispose();
  registrations.length = 0;
});

test("flushUnsaved flushes only the pending source", async () => {
  const flushed = [];
  register({ id: "pending", isPending: () => true, flush: async () => { flushed.push("pending"); return { ok: true }; } });
  register({ id: "clean", isPending: () => false, flush: async () => { flushed.push("clean"); return { ok: true }; } });

  const result = await unsaved.flushUnsaved();

  expect(flushed).toEqual(["pending"]);
  expect(result).toEqual({ ok: true, pending: ["pending"] });
});

test("flushUnsaved skips a source with no flush but still lists it as pending", async () => {
  const flushed = [];
  register({ id: "open", isPending: () => true });
  register({ id: "upload", isPending: () => true, flush: async () => { flushed.push("upload"); return { ok: true }; } });

  const result = await unsaved.flushUnsaved();

  expect(flushed).toEqual(["upload"]);
  expect(result).toEqual({ ok: true, pending: ["open", "upload"] });
});

test("flushUnsaved reports not ok when a flush answers { ok: false }", async () => {
  register({ id: "bad", isPending: () => true, flush: async () => ({ ok: false }) });

  await expect(unsaved.flushUnsaved()).resolves.toEqual({ ok: false, pending: ["bad"] });
});

test("flushUnsaved reports not ok when a flush throws", async () => {
  register({ id: "boom", isPending: () => true, flush: async () => { throw new Error("offline"); } });

  await expect(unsaved.flushUnsaved()).resolves.toEqual({ ok: false, pending: ["boom"] });
});

test("a source that is not pending is not flushed", async () => {
  const flush = jest.fn(async () => ({ ok: true }));
  register({ id: "clean", isPending: () => false, flush });

  await expect(unsaved.flushUnsaved()).resolves.toEqual({ ok: true, pending: [] });
  expect(flush).not.toHaveBeenCalled();
});

test("registerUnsavedState without a flush works exactly as before", () => {
  const handle = register({ id: "legacy", isPending: () => true });

  expect(unsaved.hasUnsavedState()).toBe(true);
  expect(unsaved.pendingIds()).toEqual(["legacy"]);
  expect(() => handle.changed()).not.toThrow();
  expect(window.clay.registerUnsavedState).toBe(unsaved.registerUnsavedState);

  handle.dispose();
  expect(unsaved.hasUnsavedState()).toBe(false);
});
