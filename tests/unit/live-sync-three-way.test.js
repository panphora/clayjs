import { jest } from "@jest/globals";

/**
 * Live sync on hyper-morph's three-way merge, pinned at the ClayJS layer:
 *
 *   - a dirty tab keeps its edits and takes the frame's, and the applied event
 *     carries the merge report;
 *   - a moved element keeps its live node;
 *   - two edits in one paragraph both land once, with no duplicated text, also
 *     when one side added formatting;
 *   - a merge that kept nothing local clears the dirty gate;
 *   - the convergence save runs on autosave pages only;
 *   - start() seeds the merge base on a clean page, and not on a dirty one;
 *   - the disk lane activates the incoming document for edit mode;
 *   - synthetic ids round-trip from one tab's exported map into another's store.
 *
 * jsdom ships no EventSource; the fake must be installed before importing
 * live-sync.js (its singleton auto-starts, and this file runs in edit mode).
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync;
let snapshot;
let gate;
let save;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
  save = await import("../../src/core/save.js");
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  document.documentElement.removeAttribute("autosave");
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
  document.documentElement.removeAttribute("autosave");
});

function makeSync() {
  const sync = new LiveSync();
  sync.lane = "live";
  sync._requestFrame = () => null;
  return sync;
}

function captureFrame() {
  return snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));
}

function onApplied() {
  const seen = [];
  const handler = (e) => seen.push(e.detail);
  document.addEventListener("clay:sync-applied", handler);
  seen.stop = () => document.removeEventListener("clay:sync-applied", handler);
  return seen;
}

async function settle(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

test("dirty tab, disjoint edits: both survive and the applied event carries the report", async () => {
  const sync = makeSync();
  await settle('<section data-id="a"><p>a0</p></section><section data-id="b"><p>b0</p></section>');
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace("b0", "b-peer");

  document.querySelector('[data-id="a"] p').textContent = "a-local";
  await Promise.resolve();

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 5, null);
  seen.stop();

  expect(document.querySelector('[data-id="a"] p').textContent).toBe("a-local");
  expect(document.querySelector('[data-id="b"] p').textContent).toBe("b-peer");
  expect(seen).toHaveLength(1);
  expect(seen[0].report.localDiverged).toBe(true);
  expect(seen[0].report.conflicts).toEqual([]);
  expect(gate.pageMaybeDirty()).toBe(true);
  sync.stop();
});

test("a moved card keeps its live node", async () => {
  const sync = makeSync();
  await settle(
    '<ul><li data-id="one">one</li><li data-id="two">two</li><li data-id="three">three</li></ul>'
  );
  sync.lastHtml = captureFrame();
  const three = document.querySelector('[data-id="three"]');
  const frame = sync.lastHtml.replace(
    '<li data-id="one">one</li><li data-id="two">two</li><li data-id="three">three</li>',
    '<li data-id="three">three</li><li data-id="one">one</li><li data-id="two">two</li>'
  );

  await sync._doApplyUpdate(frame, 6, null);

  const ids = [...document.querySelectorAll("li")].map((li) => li.dataset.id);
  expect(ids).toEqual(["three", "one", "two"]);
  expect(document.querySelector('[data-id="three"]')).toBe(three);
  sync.stop();
});

test("typing and a peer edit in the same paragraph both land once", async () => {
  const sync = makeSync();
  await settle('<p data-id="p" contenteditable="true">The quick brown fox jumps.</p>');
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace("brown fox", "brown dog");

  document.querySelector('[data-id="p"]').textContent = "The very quick brown fox jumps.";
  await Promise.resolve();

  await sync._doApplyUpdate(frame, 7, null);

  expect(document.querySelector('[data-id="p"]').textContent).toBe(
    "The very quick brown dog jumps."
  );
  sync.stop();
});

test("bolding a word while a peer edits the same paragraph keeps both, with no duplicated text", async () => {
  const sync = makeSync();
  await settle('<p data-id="p" contenteditable="true">The quick brown fox jumps.</p>');
  sync.lastHtml = captureFrame();
  const frame = sync.lastHtml.replace("brown fox", "brown dog");

  document.querySelector('[data-id="p"]').innerHTML = "The quick <b>brown</b> fox jumps.";
  await Promise.resolve();

  await sync._doApplyUpdate(frame, 11, null);

  const p = document.querySelector('[data-id="p"]');
  expect(p.textContent).toBe("The quick brown dog jumps.");
  expect(p.querySelector("b").textContent).toBe("brown");
  sync.stop();
});

test("a merge that kept nothing local clears the dirty gate", async () => {
  const sync = makeSync();
  await settle('<section data-id="a"><p>a0</p></section>');
  sync.lastHtml = captureFrame();

  // The peer made the very same edit this tab made.
  document.querySelector('[data-id="a"] p').textContent = "a1";
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);
  const frame = sync.lastHtml.replace("a0", "a1");

  const seen = onApplied();
  await sync._doApplyUpdate(frame, 8, null);
  seen.stop();

  expect(seen[0].report.localDiverged).toBe(false);
  expect(gate.pageMaybeDirty()).toBe(false);
  sync.stop();
});

describe("the convergence save after a diverged merge", () => {
  async function divergedMerge() {
    window.clay = { testMode: true };
    const sync = makeSync();
    await settle('<section data-id="a"><p>a0</p></section><section data-id="b"><p>b0</p></section>');
    sync.lastHtml = captureFrame();
    const frame = sync.lastHtml.replace("b0", "b-peer");
    document.querySelector('[data-id="a"] p').textContent = "a-local";
    await Promise.resolve();
    await sync._doApplyUpdate(frame, 9, null);
    await new Promise((r) => setTimeout(r, 20));
    sync.stop();
  }

  test("runs on an autosave page", async () => {
    const autosaveState = await import("../../src/lib/autosave-state.js");
    autosaveState.setAutosaveActive(true);
    await divergedMerge();
    expect(save.getLastSavedContents()).toContain("a-local");
    expect(save.getLastSavedContents()).toContain("b-peer");
    autosaveState.setAutosaveActive(false);
  });

  test("never runs on a manual-save page", async () => {
    await divergedMerge();
    expect(save.getLastSavedContents()).not.toContain("a-local");
    expect(save.getLastSavedContents()).not.toContain("b-peer");
    expect(gate.pageMaybeDirty()).toBe(true);
  });
});

describe("start() seeds the merge base", () => {
  test("from the page as served when it is clean", async () => {
    const sync = makeSync();
    await settle('<section data-id="a"><p>a0</p></section>');
    const served = captureFrame();

    sync.start("index.html");

    expect(sync.lastHtml).toBe(served);
    expect(sync._diskBase).toContain("a0");
    sync.stop();
  });

  test("not when the page is already dirty", async () => {
    const sync = makeSync();
    await settle('<section data-id="a"><p>a0</p></section>');
    document.querySelector('[data-id="a"] p').textContent = "a-local";
    await Promise.resolve();

    sync.start("index.html");

    expect(sync.lastHtml).toBeNull();
    expect(sync._diskBase).toBeNull();
    sync.stop();
  });
});

test("disk lane: a dirty tab keeps its edit and the incoming content arrives activated", async () => {
  const sync = makeSync();
  await settle('<section data-id="a"><p>a0</p></section>');
  sync._diskBase = snapshot.captureForSaveAndComparison({ emitForSync: false }).forSave;

  document.querySelector('[data-id="a"] p').textContent = "a-local";
  await Promise.resolve();

  await sync._doApplyExternal(
    '<!DOCTYPE html><html><head></head><body><section data-id="a"><p>a0</p></section>' +
      '<div data-id="ed" editmode:contenteditable inert-contenteditable="true">x</div></body></html>',
    50
  );

  expect(document.querySelector('[data-id="a"] p').textContent).toBe("a-local");
  const ed = document.querySelector('[data-id="ed"]');
  expect(ed.getAttribute("contenteditable")).toBe("true");
  expect(ed.hasAttribute("inert-contenteditable")).toBe(false);
  sync.stop();
});

test("synthetic ids round-trip from one tab's map into another tab's store", async () => {
  const sender = makeSync();
  const receiver = makeSync();
  await settle("<ul><li>x</li><li>x</li></ul>");
  receiver.lastHtml = captureFrame();

  const clone = snapshot.captureSnapshot({ flushUndo: false });
  const frame = snapshot.serializeForSync(clone);
  const map = sender.identity.exportMap(clone, snapshot.originalSnapshotNode);
  const [first, second] = document.querySelectorAll("li");
  const firstId = sender.identity.idOf(first);
  const secondId = sender.identity.idOf(second);
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);

  await receiver._doApplyUpdate(frame, 10, map);

  expect(receiver.identity.idOf(first)).toBe(firstId);
  expect(receiver.identity.idOf(second)).toBe(secondId);
  sender.stop();
  receiver.stop();
});
