import { jest } from "@jest/globals";

/**
 * Two people move different items in one list. The local move is unsaved, so
 * this tab is dirty and holds [b,c,a,d,e]; the frame holds the other tab's move
 * of `e` to the top, [e,a,b,c,d]. hyper-morph 1.7.0 settles the two disjoint
 * moves into [e,b,c,a,d] with no conflict, so nothing reaches the ledger and the
 * page stays dirty to save the merged order.
 */

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

let LiveSync, save, snapshot, gate, conflicts;

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
  conflicts = (await import("../../src/sync/conflicts.js")).conflicts;
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

const PAGE =
  '<main><ul id="list"><li id="a">A</li><li id="b">B</li><li id="c">C</li><li id="d">D</li><li id="e">E</li></ul></main>';

/** A booted clean tab on `body`, both lanes seeded. */
async function cleanTab(body) {
  document.body.innerHTML = body;
  save.setLastSavedContents(snapshot.captureForComparison());
  save.setUnsavedChanges(false);
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const sync = new LiveSync();
  sync.lane = "live";
  sync._resolveProfile = () => new Promise(() => {});
  sync.start("index.html");
  sync._requestFrame = () => null;
  return sync;
}

/** What another tab running this runtime sends after editing its own DOM. */
function peerEdit(sync, edit) {
  const clone = snapshot.captureSnapshot({ flushUndo: false });
  edit(clone);
  const map = sync.identity.exportMap(clone, snapshot.originalSnapshotNode);
  return [snapshot.serializeForSync(clone), map];
}

const order = () => [...document.querySelectorAll("#list > li")].map((li) => li.id);

test("a dirty tab keeps its own move and the frame's move when the two moved different items", async () => {
  const sync = await cleanTab(PAGE);
  const baseline = save.getLastSavedContents();

  const [frame, map] = peerEdit(sync, (root) => {
    const list = root.querySelector("#list");
    list.insertBefore(list.querySelector("#e"), list.querySelector("#a"));
  });
  const list = document.querySelector("#list");
  list.insertBefore(list.querySelector("#a"), document.querySelector("#d"));
  await Promise.resolve();
  expect(order()).toEqual(["b", "c", "a", "d", "e"]);
  expect(gate.pageMaybeDirty()).toBe(true);

  const reports = [];
  const on = (e) => reports.push(e.detail.report);
  document.addEventListener("clay:sync-applied", on);
  await sync._doApplyUpdate(frame, 1, map, null);
  document.removeEventListener("clay:sync-applied", on);

  expect(order()).toEqual(["e", "b", "c", "a", "d"]);
  expect(reports).toHaveLength(1);
  expect(reports[0].conflicts).toEqual([]);
  expect(conflicts.size).toBe(0);
  expect(gate.pageMaybeDirty()).toBe(true);
  expect(save.getLastSavedContents()).toBe(baseline);
  sync.stop();
});
