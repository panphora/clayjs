import { jest } from "@jest/globals";

/**
 * The close warning sees two things: the page's bytes, and work whose owner
 * says it is pending. Some work never reaches the bytes at all (text a live-sync
 * merge replaced, an editor's model ahead of the DOM), so comparing bytes alone
 * would let the tab close over it without a word.
 *
 * The registry answers "is anything pending right now?" with a fresh call per
 * check, which is what keeps a stale flag from outliving its state and a save
 * from clearing it.
 */

let unsaved, saveMod, snapshotMod;

// Every registration a test makes, disposed after it, so one test's pending
// check cannot leak a warning into the next.
let registrations = [];

function register(options) {
  const handle = unsaved.registerUnsavedState(options);
  registrations.push(handle);
  return handle;
}

function closeWouldWarn() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** Make the page's bytes the last save, so only a registered check can warn. */
function bytesMatchLastSave() {
  const current = snapshotMod.captureForDirtyCheck();
  saveMod.setLastSavedBaselines(current, current);
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
  snapshotMod = await import("../../src/core/snapshot.js");
  await import("../../src/core/unsaved-warning.js");
  unsaved = await import("../../src/lib/unsaved-state.js");
});

afterEach(() => {
  for (const handle of registrations) handle.dispose();
  registrations = [];
  delete window.clay?.demo;
});

test("nothing registered and the bytes match: no warning", () => {
  bytesMatchLastSave();
  expect(closeWouldWarn()).toBe(false);
});

test("a pending check warns even though the bytes match", () => {
  register({ id: "review", isPending: () => true });
  bytesMatchLastSave();

  expect(closeWouldWarn()).toBe(true);
});

test("disposing the registration stops the warning again", () => {
  const handle = register({ id: "review", isPending: () => true });
  bytesMatchLastSave();
  expect(closeWouldWarn()).toBe(true);

  handle.dispose();
  expect(closeWouldWarn()).toBe(false);
});

test("a check that throws counts as pending, and says so", () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    register({ id: "broken", isPending: () => { throw new Error("boom"); } });
    bytesMatchLastSave();

    expect(closeWouldWarn()).toBe(true);
    expect(spy).toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test("a pending check warns even on the demo plugin, which bytes alone would excuse", () => {
  register({ id: "review", isPending: () => true });
  window.clay = window.clay || {};
  window.clay.demo = true;

  expect(closeWouldWarn()).toBe(true);
});

test("the demo plugin still stands down for bytes it saves itself", () => {
  bytesMatchLastSave();
  window.clay = window.clay || {};
  window.clay.demo = true;
  document.getElementById("content").textContent = "an edit the demo keeps";

  expect(closeWouldWarn()).toBe(false);
});

test("changed() reports the ids of the checks that are pending", () => {
  let pending = true;
  const changed = [];
  const onChanged = (event) => changed.push(event.detail.pending);
  document.addEventListener("clay:unsaved-state-changed", onChanged);
  try {
    const handle = register({ id: "first", isPending: () => pending });
    register({ id: "second", isPending: () => false });

    handle.changed();
    expect(changed.at(-1)).toEqual(["first"]);

    pending = false;
    handle.changed();
    expect(changed.at(-1)).toEqual([]);
  } finally {
    document.removeEventListener("clay:unsaved-state-changed", onChanged);
  }
});

test("a save does not clear a registered check", async () => {
  register({ id: "review", isPending: () => true });

  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
  await saveMod.savePage();
  await new Promise((r) => setTimeout(r, 0));

  // The save wrote the page's bytes; the registered work is still unreviewed.
  expect(closeWouldWarn()).toBe(true);
});
