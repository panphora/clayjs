import { jest } from "@jest/globals";

/**
 * A disk frame over an unsaved reorder of id-less blocks (hyper-morph item 6,
 * `localDiverged` for a local reorder of unchanged blocks, through LiveSync):
 * the reorder is the tab's unsaved edit, so the merge keeps it, reports the
 * page diverged from the file, and the tab stays dirty with its save baseline
 * where it was. Before item 6 the engine reported no divergence, the gate
 * cleared and the reorder was recorded as saved without reaching disk.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync, save, snapshot, gate;

beforeAll(async () => {
  window.clayEditMode = true;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  const m = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = m);
  m.liveSync.stop();
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
});

beforeEach(async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );
  window.clay = { testMode: true };
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  delete window.clay;
});

test("a disk frame over an unsaved id-less reorder keeps the page dirty and the baselines where they were", async () => {
  document.body.innerHTML = "<h1>Title</h1><main><p>one</p><p>two</p><p>three</p></main>";
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  const baseline = save.getLastSavedContents();
  const disk = sync._diskBase;

  const main = document.querySelector("main");
  main.insertBefore(main.lastElementChild, main.firstElementChild);
  await Promise.resolve();
  expect(gate.pageMaybeDirty()).toBe(true);

  const reports = [];
  const on = (e) => reports.push(e.detail.report);
  document.addEventListener("clay:sync-applied", on);
  await sync._doApplyExternal(disk.replace("<h1>Title</h1>", "<h1>Title v2</h1>"), 50);
  document.removeEventListener("clay:sync-applied", on);

  expect([...main.children].map((p) => p.textContent)).toEqual(["three", "one", "two"]);
  expect(document.querySelector("h1").textContent).toBe("Title v2");
  expect(reports).toHaveLength(1);
  expect(reports[0].localDiverged).toBe(true);
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(save.getLastSavedContents()).toBe(baseline);
  sync.stop();
});
