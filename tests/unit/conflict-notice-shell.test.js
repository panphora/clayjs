import { jest } from "@jest/globals";

/**
 * The notice is 6.8 KB Brotli and most edit boots have nothing for it to show, so a
 * shell stands in for it (core/conflict-notice.js) and fetches it on the first event
 * that can create something to show, handing that event over. These tests watch the
 * fetch itself: the notice is a stub here, counting the loads and recording the event
 * each one was handed.
 *
 * Every test gets a fresh module registry, and the one before it is left loaded, so a
 * shell from an earlier test cannot answer for the one under test.
 */

const loads = [];
let fail = false;

await jest.unstable_mockModule("../../src/core/conflict-notice-ui.js", () => {
  if (fail) throw new Error("that did not download");
  const record = { starts: [] };
  loads.push(record);
  return { start: (trigger) => record.starts.push(trigger) };
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const event = (type, detail) => new CustomEvent(type, { detail });

let conflicts;

// Imported, not awaited for anything else: on DOM ready the shell looks at the ledger
// and either loads at once or arms for an event.
async function boot() {
  jest.resetModules();
  const at = loads.length;
  await import("../../src/core/conflict-notice.js");
  await tick();
  return () => loads.slice(at);
}

beforeAll(() => {
  window.clayEditMode = true;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
});

beforeEach(() => {
  conflicts = { size: 0, list: () => [], get: () => null };
  window.clay = { conflicts };
});

afterEach(async () => {
  fail = false;
  // Leave the shell of this test loaded, so nothing it was listening for reaches the
  // next one.
  document.dispatchEvent(event("clay:save-conflict", { changedBy: "another-tab" }));
  await tick();
  await tick();
  loads.length = 0;
});

test("a page with nothing to show downloads nothing, whatever else happens", async () => {
  const loaded = await boot();

  document.dispatchEvent(event("clay:save-saved"));
  document.dispatchEvent(event("clay:unsaved-state-changed"));
  document.dispatchEvent(event("clay:sync-applied"));
  document.dispatchEvent(event("clay:save-conflict-resolved"));
  // A ledger change with nothing in the ledger is not something to show.
  document.dispatchEvent(event("clay:sync-conflicts-changed", { open: [] }));
  await tick();

  expect(loaded()).toEqual([]);
});

test("the first refusal downloads it and hands it that refusal", async () => {
  const loaded = await boot();
  const refused = event("clay:save-conflict", { changedBy: "another-agent", etag: "E7" });

  document.dispatchEvent(refused);
  await tick();

  const [record] = loaded();
  expect(record.starts).toEqual([refused]);
  expect(record.starts[0].detail).toEqual({ changedBy: "another-agent", etag: "E7" });

  // From here the notice holds its own listeners; the shell asks for nothing more.
  document.dispatchEvent(event("clay:save-conflict", { changedBy: "another-tab" }));
  await tick();
  expect(loaded()).toHaveLength(1);
});

test("a ledger change with entries downloads it and hands it that change", async () => {
  const loaded = await boot();
  conflicts.size = 2;
  const changed = event("clay:sync-conflicts-changed", { added: [{ id: "a" }] });

  document.dispatchEvent(changed);
  await tick();

  const [record] = loaded();
  expect(record.starts).toEqual([changed]);
});

test("a page that boots holding edits downloads it at once, with no event to hand over", async () => {
  conflicts.size = 1;

  const loaded = await boot();

  expect(loaded()).toHaveLength(1);
  expect(loaded()[0].starts).toEqual([null]);
});

test("a download that fails says so once and the next refusal tries again", async () => {
  const loaded = await boot();
  const logged = jest.spyOn(console, "error").mockImplementation(() => {});
  conflicts.size = 3;

  fail = true;
  document.dispatchEvent(event("clay:sync-conflicts-changed", { added: [{ id: "a" }] }));
  await tick();
  await tick();

  expect(logged).toHaveBeenCalledTimes(1);
  expect(loaded()).toEqual([]);

  fail = false;
  const refused = event("clay:save-conflict", { changedBy: "another-tab" });
  document.dispatchEvent(refused);
  await tick();

  expect(loaded()[0].starts).toEqual([refused]);
  expect(logged).toHaveBeenCalledTimes(1);
  logged.mockRestore();
});
