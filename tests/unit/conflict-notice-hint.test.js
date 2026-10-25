import { jest } from "@jest/globals";

/**
 * The notice's shell asks the recovery store one question on every edit boot: is
 * anything stored for review? The answer is one small count key in this document's
 * own storage, so the shell reads it there and fetches the recovery module only when
 * the key says yes. A boot with nothing stored imports no recovery code at all, and a
 * boot that holds a conflict a reload left behind asks for the notice it can draw.
 *
 * Both modules below are stubs: the store counts its own imports, and the notice
 * counts the starts it was handed.
 */

const loads = [];
let recoveryImports = 0;
let pending = 0;

await jest.unstable_mockModule("../../src/core/conflict-notice-ui.js", () => {
  const record = { starts: [] };
  loads.push(record);
  return { start: (trigger) => record.starts.push(trigger) };
});

await jest.unstable_mockModule("../../src/recovery/conflicts.js", () => {
  recoveryImports++;
  return {
    pendingConflicts: () => pending,
    listConflicts: async () => ({ ok: true, records: [] }),
    dismissConflicts: () => {},
  };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

let storage;

async function boot() {
  jest.resetModules();
  const at = loads.length;
  await import("../../src/core/conflict-notice.js");
  await tick();
  await tick();
  return () => loads.slice(at);
}

beforeAll(async () => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  ({ storage } = await import("../../src/lib/doc-storage.js"));
});

beforeEach(() => {
  window.clay = { conflicts: { size: 0, list: () => [], get: () => null } };
  storage.local.remove("conflicts");
  pending = 0;
  recoveryImports = 0;
});

afterEach(async () => {
  // Leave the shell of this test loaded, so its listeners never reach the next one.
  document.dispatchEvent(new CustomEvent("clay:save-conflict", { detail: { changedBy: "another-tab" } }));
  await tick();
  await tick();
  loads.length = 0;
});

test("a boot with no hint imports no recovery module and draws nothing", async () => {
  const loaded = await boot();

  expect(storage.local.get("conflicts")).toBeUndefined();
  expect(recoveryImports).toBe(0);
  expect(loaded()).toEqual([]);
});

test("a boot whose hint has conflicts imports the store and asks for the notice", async () => {
  storage.local.set("conflicts", { count: 2, at: Date.now() });
  pending = 2;

  const loaded = await boot();

  expect(recoveryImports).toBe(1);
  expect(loaded()).toHaveLength(1);
  // No event to hand over: the notice draws the stored conflicts itself.
  expect(loaded()[0].starts).toEqual([null]);
});

test("a hint the store has already emptied imports the store but draws nothing", async () => {
  storage.local.set("conflicts", { count: 1, at: Date.now() });
  pending = 0;

  const loaded = await boot();
  await tick();

  expect(recoveryImports).toBe(1);
  expect(loaded()).toEqual([]);
});
