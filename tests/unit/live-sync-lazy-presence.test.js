import { jest } from "@jest/globals";

/**
 * A reader of a synced document downloads no presence code until a roster frame
 * arrives. `sync/presence.js` and `sync/editing-marker.js` are dynamic imports
 * live-sync starts on the first `presence` SSE frame; a frame that lands while
 * the download is in flight waits in the queue and is applied when it lands, in
 * the order the server sent them.
 *
 * The two modules are held behind a deferred promise the test settles by hand,
 * and they hand back the real singletons once it settles, so the roster below is
 * a real roster.
 */

const realPresence = await import("../../src/sync/presence.js");
const realMarker = await import("../../src/sync/editing-marker.js");

const loads = { presence: 0, marker: 0 };
const gates = { presence: null, marker: null };

const deferred = () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  return { ready, release };
};

gates.presence = deferred();
gates.marker = deferred();

jest.unstable_mockModule("../../src/sync/presence.js", () => {
  loads.presence += 1;
  return gates.presence.ready.then(() => realPresence);
});

jest.unstable_mockModule("../../src/sync/editing-marker.js", () => {
  loads.marker += 1;
  return gates.marker.ready.then(() => realMarker);
});

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
  }
  close() {}
}

const META = { spec: 1, extensions: ["sync", "presence"], document: null };

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

let LiveSync;
let rosterUpdates;
let markerUpdates;

const rosterOf = (people) => ({ people, anonymous: 0 });

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

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  rosterUpdates = jest.spyOn(realPresence.presence, "update");
  markerUpdates = jest.spyOn(realMarker.editingMarker, "update");
});

beforeEach(() => {
  rosterUpdates.mockClear();
  markerUpdates.mockClear();
  document.body.innerHTML = "";
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

const frame = (source, data) =>
  source.dispatchEvent(new MessageEvent("presence", { data: JSON.stringify(data) }));

test("a view-mode boot imports no presence code before the first roster frame", async () => {
  const sync = await startedReader();

  expect(loads).toEqual({ presence: 0, marker: 0 });
  expect(rosterUpdates).not.toHaveBeenCalled();
  expect(markerUpdates).not.toHaveBeenCalled();
  expect(realPresence.presence.roster).toEqual({ people: [], anonymous: 0 });

  sync.stop();
});

test("a frame that arrives during the download is applied, in order, once it lands", async () => {
  const sync = await startedReader();
  const source = sync.sse;

  const first = rosterOf([{ id: "p_ada", name: "Ada Lovelace", you: false }, { id: "p_me", name: "Grace Hopper", you: true }]);
  const second = rosterOf([{ id: "p_ada", name: "Ada Lovelace", you: false }]);

  frame(source, first);
  frame(source, second);

  // The download starts on the first frame, so the frames above queue behind it.
  await until(() => loads.presence === 1 && loads.marker === 1);
  expect(rosterUpdates).not.toHaveBeenCalled();
  expect(markerUpdates).not.toHaveBeenCalled();
  expect(realPresence.presence.roster).toEqual({ people: [], anonymous: 0 });

  gates.presence.release();
  gates.marker.release();
  await until(() => rosterUpdates.mock.calls.length === 2);

  expect(rosterUpdates.mock.calls.map(([data]) => data)).toEqual([first, second]);
  expect(markerUpdates.mock.calls.map(([data]) => data)).toEqual([first, second]);
  expect(realPresence.presence.roster.people.map((person) => person.id)).toEqual(["p_ada"]);

  sync.stop();
});

test("after the download a frame is applied straight away", async () => {
  const sync = await startedReader();
  const later = rosterOf([{ id: "p_ada", name: "Ada Lovelace", you: true }]);

  frame(sync.sse, later);
  await until(() => rosterUpdates.mock.calls.length === 1);

  expect(rosterUpdates.mock.calls[0][0]).toEqual(later);
  expect(markerUpdates.mock.calls[0][0]).toEqual(later);

  sync.stop();
});
