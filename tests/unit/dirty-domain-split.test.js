import { jest } from "@jest/globals";

/**
 * Two comparison domains.
 *
 *   autosave domain — no-trigger-autosave regions stripped. "Should this edit
 *     start a save on its own?" Autosave, the settle guard, live-sync.
 *   dirty domain    — those regions KEPT. "Is there anything here the person
 *     would lose?" An explicit savePage() and the close warning.
 *
 * Before the split there was one domain and it answered the first question, so a
 * page whose only edit was inside a batching region reported "No changes to
 * save" to someone pressing Save, and closed the tab without a word.
 */

let saveMod, snapshotMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
  snapshotMod = await import("../../src/core/snapshot.js");
  await import("../../src/core/unsaved-warning.js");
});

function okFetch() {
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ msg: "Saved" }),
  }));
}

/** Make the current page the saved state, through the real send path. */
async function establishBaseline() {
  okFetch();
  document.getElementById("content").textContent = "baseline-" + Math.random();
  await saveMod.savePage();
  await new Promise((r) => setTimeout(r, 0));
}

function closeWouldWarn() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe.each([
  ["canonical clay token", (id) => `<div id="${id}" clay="no-trigger-autosave">batch</div>`],
  ["bare attribute", (id) => `<div id="${id}" no-trigger-autosave>batch</div>`],
])("a batching region spelled as a %s", (_label, markup) => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="content">start</div>' + markup("batch");
    await establishBaseline();
  });

  test("an edit there is invisible to autosave but visible to an explicit save", async () => {
    const before = snapshotMod.captureForSaveAndComparison({ emitForSync: false });

    document.getElementById("batch").textContent = "churned";

    const after = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(after.forComparison).toBe(before.forComparison);
    expect(after.forDirty).not.toBe(before.forDirty);

    // Autosave stands down...
    const auto = await saveMod.savePageThrottled();
    expect(auto.msgType).toBe("skipped");

    // ...and pressing Save writes it.
    okFetch();
    const manual = await saveMod.savePage();
    expect(manual.ok).toBe(true);
    expect(global.fetch.mock.calls[0][1].body).toContain("churned");
  });

  test("closing the tab on that edit warns", async () => {
    expect(closeWouldWarn()).toBe(false);
    document.getElementById("batch").textContent = "unsaved-work";
    expect(closeWouldWarn()).toBe(true);
  });

  // The split-brain: a predicate that only knows one spelling gives savePage()
  // one domain and the close warning another, so the page both refuses to save
  // and refuses to admit it is dirty.
  test("save and the close warning agree about whether it is dirty", async () => {
    document.getElementById("batch").textContent = "edited";

    okFetch();
    const result = await saveMod.savePage();
    expect(result.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(closeWouldWarn()).toBe(false);
  });
});

// save-ignore is NOT a spelling of no-trigger-autosave, and calling it one gave
// clayjs a durable region that hyper-morph refuses to sync. hyper-morph has always
// defined it as local-instance chrome, and every real use in the wild is a
// generated stylesheet <link>. It maps to no-dirty: still saved, but disposable —
// no autosave, no close warning, and an incoming sync frame may replace it.
describe.each([
  ["canonical clay token", (id) => `<div id="${id}" clay="no-dirty">churn</div>`],
  ["bare attribute", (id) => `<div id="${id}" no-dirty>churn</div>`],
  ["legacy save-ignore", (id) => `<div id="${id}" save-ignore>churn</div>`],
])("a disposable region spelled as a %s", (_label, markup) => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="content">start</div>' + markup("batch");
    await establishBaseline();
  });

  test("its churn is invisible to BOTH domains", () => {
    const before = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    document.getElementById("batch").textContent = "churned";
    const after = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(after.forComparison).toBe(before.forComparison);
    expect(after.forDirty).toBe(before.forDirty);
  });

  test("closing the tab on that churn does not warn", () => {
    expect(closeWouldWarn()).toBe(false);
    document.getElementById("batch").textContent = "churned";
    expect(closeWouldWarn()).toBe(false);
  });

  test("its content is still written when another change causes a save", async () => {
    document.getElementById("batch").textContent = "churned";
    document.getElementById("content").textContent = "real edit";
    okFetch();
    const manual = await saveMod.savePage();
    expect(manual.ok).toBe(true);
    // Disposable is not the same as absent: no-dirty content persists in full,
    // which is the whole difference between it and no-save.
    expect(global.fetch.mock.calls[0][1].body).toContain("churned");
  });
});

describe("a page with no batching region", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="content">start</div><div id="plain">plain</div>';
    await establishBaseline();
  });

  test("has one domain in two variables, so nothing about the split is observable", () => {
    const result = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(result.forDirty).toBe(result.forComparison);

    document.getElementById("plain").textContent = "ordinary edit";
    const edited = snapshotMod.captureForSaveAndComparison({ emitForSync: false });
    expect(edited.forDirty).toBe(edited.forComparison);
  });

  test("an ordinary edit still autosaves", async () => {
    document.getElementById("plain").textContent = "ordinary edit";
    okFetch();
    const auto = await saveMod.savePageThrottled();
    expect(auto.ok).toBe(true);
  });
});

describe("both baselines advance from the same capture", () => {
  beforeEach(async () => {
    document.body.innerHTML =
      '<div id="content">start</div><div id="batch" clay="no-trigger-autosave">batch</div>';
    await establishBaseline();
  });

  test("a batch-only save advances the dirty baseline and leaves the autosave one alone", async () => {
    const autosaveBefore = saveMod.getLastSavedContents();

    document.getElementById("batch").textContent = "batch-only-change";
    okFetch();
    await saveMod.savePage();
    await new Promise((r) => setTimeout(r, 0));

    // The autosave domain never saw the change, so its baseline is unmoved...
    expect(saveMod.getLastSavedContents()).toBe(autosaveBefore);
    // ...while the dirty baseline now carries it, which is what stops the close
    // warning firing about work that has already been written.
    expect(saveMod.getLastSavedDirty()).toContain("batch-only-change");
  });

  test("an edit made while the save is in flight is not recorded as saved", async () => {
    let release;
    const arrived = new Promise((r) => { release = r; });
    global.fetch = jest.fn(() =>
      arrived.then(() => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }))
    );

    document.getElementById("batch").textContent = "sent-batch";
    const saving = saveMod.savePage();

    await Promise.resolve();
    document.getElementById("batch").textContent = "typed-during-save";

    release();
    await saving;
    await new Promise((r) => setTimeout(r, 0));

    expect(saveMod.getLastSavedDirty()).toContain("sent-batch");
    expect(saveMod.getLastSavedDirty()).not.toContain("typed-during-save");
    expect(closeWouldWarn()).toBe(true);
  });
});
