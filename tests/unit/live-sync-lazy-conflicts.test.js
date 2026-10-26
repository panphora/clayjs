import { jest } from "@jest/globals";

/**
 * A reader's `clay.conflicts` exists before the ledger does. No merge has happened,
 * so there are no conflicts: the facade answers empty, keeps its identity, and hands
 * anything the page registered to the ledger when it lands. The first merged frame is
 * what downloads `sync/conflicts.js` and its footprints — every merge reads them, a
 * clean one included — so a reader that merges nothing never fetches either.
 *
 * The two modules are held behind a deferred promise the test settles by hand, and
 * they hand back the real modules once it settles, so the ledger below is the real
 * ledger.
 */

const realLedger = await import("../../src/sync/conflicts.js");
const realFootprints = await import("../../src/sync/conflict-footprints.js");

const loads = { ledger: 0, footprints: 0 };

const deferred = () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  return { ready, release };
};

const gates = { ledger: deferred(), footprints: deferred() };

jest.unstable_mockModule("../../src/sync/conflicts.js", () => {
  loads.ledger += 1;
  return gates.ledger.ready.then(() => realLedger);
});

jest.unstable_mockModule("../../src/sync/conflict-footprints.js", () => {
  loads.footprints += 1;
  return gates.footprints.ready.then(() => realFootprints);
});

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const META = { spec: 1, extensions: ["sync"], document: null };
const FIXTURE = '<p data-id="a">budget is fine</p><p data-id="b">b0</p>';
const LOCAL_A = "budget is over by 20 percent";
const REMOTE_A = "budget is approved";

function respond(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status < 400,
    status,
    statusText: String(status),
    text: async () => text,
    json: async () => JSON.parse(text),
  });
}

let liveSyncModule;
let LiveSync;
let conflicts;
let gate;
let snapshot;

beforeAll(async () => {
  window.clayEditMode = false;
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes("/_/meta")) return respond(200, META);
    return respond(404, "");
  });

  liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync, conflicts } = liveSyncModule);
  liveSyncModule.liveSync.stop();
  gate = await import("../../src/lib/dirty-gate.js");
  snapshot = await import("../../src/core/snapshot.js");

  // What the loader publishes: the same object the module exports.
  window.clay = window.clay || {};
  window.clay.conflicts = conflicts;
});

beforeEach(() => {
  document.body.innerHTML = "";
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

afterEach(() => {
  conflicts.acknowledge(conflicts.list().map((record) => record.id), { reason: "accepted" });
});

const turn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await turn(5);
}

async function startedReader() {
  const sync = new LiveSync();
  sync.lane = "saved";
  sync._requestFrame = () => null;
  sync.start("index.html");
  await sync._ready;
  return sync;
}

const captureFrame = () => snapshot.serializeForSync(snapshot.captureSnapshot({ flushUndo: false }));

// What the merge path hands the ledger for a frame that won over this tab's edits.
function loseA() {
  const applyId = realLedger.beginApply({
    source: "peer", seq: 5, etag: null, domain: "sync",
    root: document.documentElement.cloneNode(true),
  });
  return realLedger.completeApply(applyId, [{ kind: "text", local: LOCAL_A, remote: REMOTE_A }], { ticket: 1 });
}

test("a reader boot downloads no conflict code, and clay.conflicts answers empty", async () => {
  const sync = await startedReader();

  expect(loads).toEqual({ ledger: 0, footprints: 0 });
  expect(clay.conflicts).toBe(conflicts);
  expect(clay.conflicts.size).toBe(0);
  expect(clay.conflicts.list()).toEqual([]);
  expect(clay.conflicts.get("nothing")).toBeNull();
  expect(clay.conflicts.recoveryOf("nothing")).toBeNull();
  expect(clay.conflicts.contextFor({}, {})).toBeNull();
  expect(clay.conflicts.hasPendingApply()).toBe(false);
  expect(clay.conflicts.acknowledge([])).toEqual({ removedIds: [], remainingIds: [] });
  expect(clay.conflicts.claim([], { owner: "me" })).toEqual({ release: expect.any(Function) });
  expect(() => clay.conflicts.acknowledge("id")).toThrow(TypeError);
  expect(() => clay.conflicts.claim([])).toThrow(TypeError);
  expect(() => clay.conflicts.registerContext("resolver")).toThrow(TypeError);

  sync.stop();
});

test("the first merged frame downloads the ledger, and a resolver registered before it names the conflict", async () => {
  const sync = await startedReader();
  const facade = clay.conflicts;

  // A resolver the page drops before anything loaded, and one it keeps: only the
  // kept one may reach the ledger.
  const dropped = () => ({ kind: "text", id: "dropped" });
  const kept = () => ({ kind: "text", id: "kept", label: "Budget" });
  clay.conflicts.registerContext(dropped)();
  const off = clay.conflicts.registerContext(kept);
  expect(loads).toEqual({ ledger: 0, footprints: 0 });

  document.body.innerHTML = FIXTURE;
  sync.lastHtml = captureFrame();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  const frame = sync._doApplyUpdate(sync.lastHtml.replace("b0", "b1-peer"), 5, null);

  // The frame merged waits for the download instead of reading a ledger that is
  // not there; the page's own object answers empty until it lands.
  await until(() => loads.ledger === 1);
  expect(clay.conflicts).toBe(facade);
  expect(clay.conflicts.list()).toEqual([]);
  expect(clay.conflicts.size).toBe(0);

  gates.ledger.release();
  gates.footprints.release();
  await frame;

  expect(loads).toEqual({ ledger: 1, footprints: 1 });
  expect(clay.conflicts).toBe(facade);

  const [id] = loseA();
  const record = clay.conflicts.get(id);
  expect(clay.conflicts.size).toBe(1);
  expect(record.context).toEqual({ kind: "text", id: "kept", label: "Budget" });
  expect(clay.conflicts.contextFor(record, {})).toEqual({ kind: "text", id: "kept", label: "Budget" });

  off();
  expect(clay.conflicts.contextFor(record, {})).toBeNull();

  sync.stop();
});

test("a resolver registered after the load goes straight to the ledger, and its unregister takes it off", async () => {
  const sync = await startedReader();
  document.body.innerHTML = FIXTURE;

  const late = () => ({ kind: "text", id: "late" });
  const off = clay.conflicts.registerContext(late);
  const [id] = loseA();
  const record = clay.conflicts.get(id);

  expect(record.context).toEqual({ kind: "text", id: "late" });
  off();
  expect(clay.conflicts.contextFor(record, {})).toBeNull();

  sync.stop();
});
