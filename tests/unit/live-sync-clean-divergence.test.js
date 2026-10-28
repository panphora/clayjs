import { jest } from "@jest/globals";

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
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, text: async () => "" }));
  const module = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = module);
  module.liveSync.stop();
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  gate = await import("../../src/lib/dirty-gate.js");
});

test("a clean tab marks a diverged merge dirty so its convergence save is admitted", async () => {
  document.body.innerHTML = '<main>\n<article data-id="a">Original</article>\n<article data-id="b">Other</article>\n</main>';
  const frameRoot = snapshot.captureSnapshot({ flushUndo: false });
  frameRoot.querySelector('[data-id="a"]').textContent = "Peer kept writing";
  const frame = snapshot.serializeForSync(frameRoot);
  document.querySelector('[data-id="a"]').remove();
  const baseline = snapshot.captureForComparisonAndDirty();
  save.setLastSavedBaselines(baseline.forComparison, baseline.forDirty);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  const reports = [];
  const onApplied = event => reports.push(event.detail.report);
  document.addEventListener("clay:sync-applied", onApplied);
  try {
    expect(gate.pageMaybeDirty()).toBe(false);
    await sync._doApplyUpdate(frame, 1, null, null);
    expect(reports).toHaveLength(1);
    expect(document.querySelector('[data-id="a"]').textContent).toBe("Peer kept writing");
    expect(reports[0].localDiverged).toBe(true);
    expect(gate.pageMaybeDirty()).toBe(true);
    expect(global.fetch.mock.calls.filter(([url]) => String(url).includes('/_/save'))).toHaveLength(0);

    global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: 'Saved' }) }));
    expect((await save.savePageThrottled()).ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(save.getLastSavedDirty()).toBe(snapshot.captureForDirtyCheck());
    expect(gate.pageMaybeDirty()).toBe(false);
  } finally {
    document.removeEventListener("clay:sync-applied", onApplied);
    sync.stop();
  }
});
