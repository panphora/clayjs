/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * Startup provenance: the first subscription checks the file against the version
 * this page was served, and merges only when the two differ.
 *
 * The response that delivered this page is the only thing that says which version
 * its bytes came from. Discovery answers about whatever is on disk when the ANSWER
 * is built, which is a later moment than the navigation, and the first
 * subscription happens after both. So a stamped navigation is compared against a
 * GET of the served document:
 *
 *   - the same version is not a change, and the page keeps everything it holds,
 *     including nodes a script rendered into it after load, with no apply event
 *     and no discovery refresh;
 *   - a different version is the update this page missed in the gap, and it
 *     merges exactly as any other disk change would, taking its stamp from the
 *     body that applied rather than from discovery;
 *   - a body that names no version, or a page that was served without one, keeps
 *     the pre-1.9.0 behavior: nothing applies and nothing is cleared.
 *
 * The root stamp is read once, when host-attrs.js is first evaluated, so this
 * suite sets it before the import below. The no-stamp host needs the opposite
 * module registry and lives in live-sync-startup-legacy.test.js.
 */

const BOOT = "boot-A";

let sourceInstances;
let workerInstances;

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    sourceInstances.push(this);
  }
  close() {}
}

class FakeWorker {
  constructor(url, name) {
    this.url = url;
    this.name = name;
    this.messages = [];
    this.port = {
      start: jest.fn(),
      close: jest.fn(),
      postMessage: (message) => this.messages.push(message),
    };
    workerInstances.push(this);
  }
  send(message) {
    this.port.onmessage?.({ data: { v: 1, ...message } });
  }
}

let LiveSync;
let gate;
let etag;
let resetHostMeta;

let metaCalls;
let metaAnswer;
let docResponder;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const diskMeta = (etagValue, extensions = ["conditional"]) => ({
  spec: 1,
  extensions,
  document: etagValue ? { etag: etagValue } : null,
});

const response = (status, text) => ({
  ok: status < 400,
  status,
  statusText: String(status),
  text: async () => text,
});

// A served document: the host builds the response from one read of the file and
// names that read's version on the root. A null stamp is a host that names none.
const served = (stamp, body) => {
  const attr = stamp ? ` documentetag="${stamp}"` : "";
  return `<!DOCTYPE html><html${attr}><head></head><body>${body}</body></html>`;
};

const doc = (stamp, body) => Promise.resolve(response(200, served(stamp, body)));

function deferredDoc() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release: (stamp, body) => release(response(200, served(stamp, body))) };
}

function installFetch() {
  resetHostMeta();
  metaCalls = 0;
  global.fetch = jest.fn((url) =>
    String(url).includes("/_/meta")
      ? (metaCalls++, Promise.resolve(response(200, JSON.stringify(metaAnswer))))
      : docResponder(docFetches() - 1)
  );
}

const docFetches = () => global.fetch.mock.calls.filter(([url]) => !String(url).includes("/_/meta")).length;

// The file's own bytes, as the page loaded them: what a later disk frame has to
// be compared against.
async function boot(body) {
  document.body.innerHTML = body;
  await tick();
}

function clearGate() {
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

function resetStamps() {
  etag.recordEtag(BOOT);
}

// The runtime-rendered node a page's own script added after the response arrived:
// it is in the DOM and not in the file, and only a real reload would lose it.
function renderAtRuntime(parentId, id, text) {
  const node = document.createElement("p");
  node.id = id;
  node.textContent = text;
  document.getElementById(parentId).appendChild(node);
  return node;
}

async function started(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  // The frame is driven by hand so a slot can be inspected between steps; left
  // live, the rAF drain races these tests' ticks and empties it mid-assertion.
  sync._requestFrame = () => null;
  sync.start("index.html");
  await sync._ready;
  return { sync, sse: sourceInstances.at(-1) };
}

async function startedShared(lane = "live") {
  global.SharedWorker = FakeWorker;
  try {
    const sync = new LiveSync();
    sync.lane = lane;
    sync._requestFrame = () => null;
    sync.start("index.html");
    await sync._ready;
    return { sync, worker: workerInstances.at(-1) };
  } finally {
    delete global.SharedWorker;
  }
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.documentElement.setAttribute("documentetag", BOOT);
  sourceInstances = [];
  workerInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop(); // the singleton auto-started on import

  gate = await import("../../src/lib/dirty-gate.js");
  etag = await import("../../src/core/etag.js");
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(async () => {
  sourceInstances = [];
  workerInstances = [];
  metaCalls = 0;
  metaAnswer = diskMeta("disk-B");
  docResponder = () => doc("disk-B", "<p>disk</p>");
  document.body.innerHTML = "";
  await tick();
  clearGate();
  resetStamps();
  delete global.SharedWorker;
});

afterEach(() => {
  delete global.SharedWorker;
});

test.each(["live", "saved"])(
  "a change made between the page load and the first subscription merges once (%s lane)",
  async (lane) => {
    await boot('<p id="startup-value">Before subscription</p>');
    clearGate();
    installFetch();
    // Discovery already answers disk-B. That answer describes a later moment than
    // this page's response, so it may not speak for this page.
    metaAnswer = diskMeta("disk-B");
    docResponder = () => doc("disk-B", '<p id="startup-value">Changed before subscription</p>');
    const applied = [];
    const onApplied = (event) => applied.push(event.detail);
    document.addEventListener("clay:sync-applied", onApplied);
    // How a page that reloads itself on an applied change would notice one. A
    // changed file is worth its reload; the same file, checked from a fresh page,
    // is not (that is the unchanged case below, whose boot version is the one on
    // disk).
    const reloads = jest.fn();
    const onReload = () => reloads();
    document.addEventListener("clay:sync-applied", onReload);

    const { sync, sse } = await started(lane);
    try {
      expect(metaCalls).toBe(1);
      expect(etag.lastSeenEtag()).toBe(BOOT);
      expect(etag.representedEtag()).toBe(BOOT);
      // The subscription is the only thing that starts the check: nothing fetches
      // the document at boot.
      expect(docFetches()).toBe(0);

      sse.onopen();
      await tick();
      expect(sync._pendingExternal).toMatchObject({ etag: "disk-B" });

      await sync._runPending();

      expect(document.querySelector("#startup-value").textContent).toBe(
        "Changed before subscription"
      );
      expect(applied).toHaveLength(1);
      expect(applied[0].source).toBe("disk");
      expect(applied[0].etag).toBe("disk-B");
      // The version came from the body that applied, and the stamp this tab
      // records is that one: no discovery refresh was needed for it.
      expect(etag.lastSeenEtag()).toBe("disk-B");
      expect(etag.representedEtag()).toBe("disk-B");
      expect(metaCalls).toBe(1);
      expect(docFetches()).toBe(1);
      // The response metadata is immutable and belongs to the root it arrived on:
      // a later version in the DOM never rewrites it.
      expect(document.documentElement.getAttribute("documentetag")).toBe(BOOT);
      expect(reloads).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("clay:sync-applied", onApplied);
      document.removeEventListener("clay:sync-applied", onReload);
      sync.stop();
    }
  }
);

test.each(["live", "saved"])(
  "an unchanged file leaves the page, its rendered nodes and its reload listeners alone (%s lane)",
  async (lane) => {
    await boot('<div id="app"><p id="static">From the file</p></div>');
    const fileNode = document.querySelector("#static");
    // What the page's own script added at load: nothing on disk has it, and only a
    // reload would lose it.
    const rendered = renderAtRuntime("app", "rendered", "Rendered by a script at load");
    clearGate();
    installFetch();
    metaAnswer = diskMeta(BOOT);
    docResponder = () => doc(BOOT, '<div id="app"><p id="static">From the file</p></div>');

    // How a page that reloads itself on an applied change would notice one.
    const reloads = jest.fn();
    const onApplied = () => reloads();
    document.addEventListener("clay:sync-applied", onApplied);

    const { sync, sse } = await started(lane);
    try {
      sse.onopen();
      await tick();
      await sync._runPending();

      // The check ran and answered, and the answer was "nothing to do".
      expect(docFetches()).toBe(1);
      expect(sync._pendingExternal).toBeNull();
      expect(document.getElementById("rendered")).toBe(rendered);
      expect(document.querySelector("#static")).toBe(fileNode);
      expect(reloads).not.toHaveBeenCalled();
      expect(etag.lastSeenEtag()).toBe(BOOT);
      expect(etag.representedEtag()).toBe(BOOT);
      expect(metaCalls).toBe(1);
    } finally {
      document.removeEventListener("clay:sync-applied", onApplied);
      sync.stop();
    }
  }
);

test("the applied stamp comes from the body, not from a later discovery answer", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  docResponder = () => doc("disk-B", '<p id="startup-value">B from disk</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    // A hypothetical later discovery would answer disk-C. If the apply reseeded
    // from discovery, that is the version this tab would end up claiming.
    metaAnswer = diskMeta("disk-C");
    await sync._runPending();
    await tick();

    expect(metaCalls).toBe(1);
    expect(docFetches()).toBe(1);
    expect(applied).toHaveBeenCalledTimes(1);
    expect(etag.lastSeenEtag()).toBe("disk-B");
    expect(etag.representedEtag()).toBe("disk-B");
    expect(document.querySelector("#startup-value").textContent).toBe("B from disk");
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("an own save accepted during the startup GET makes the late answer a no-op", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  const first = deferredDoc();
  docResponder = (index) =>
    index === 0 ? first.promise : doc("save-C", '<p id="startup-value">C from this tab</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    expect(docFetches()).toBe(1);

    // This tab's own save is accepted while B is still on the wire: the epoch
    // moves and the response records the version those bytes landed under.
    sync._saveEpoch++;
    etag.recordEtag("save-C");

    first.release("disk-B", '<p id="startup-value">B from disk</p>');
    await tick();
    // B was never queued: the page it described is not the page that asked.
    expect(sync._pendingExternal).toBeNull();

    await wait(30);
    expect(docFetches()).toBe(2);
    await sync._runPending();
    expect(sync._pendingExternal).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    expect(document.querySelector("#startup-value").textContent).toBe("A");
    expect(etag.lastSeenEtag()).toBe("save-C");
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("a startup body already queued is dropped when an own save lands before the frame", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  docResponder = (index) =>
    index === 0
      ? doc("disk-B", '<p id="startup-value">B from disk</p>')
      : doc("save-C", '<p id="startup-value">C from this tab</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    expect(sync._pendingExternal).toMatchObject({ html: served("disk-B", '<p id="startup-value">B from disk</p>') });

    // The save is accepted before the queued body gets its frame.
    sync._saveEpoch++;
    etag.recordEtag("save-C");
    await sync._runPending();

    expect(applied).not.toHaveBeenCalled();
    expect(sync._pendingExternal).toBeNull();
    expect(document.querySelector("#startup-value").textContent).toBe("A");

    // The re-ask finds the version this tab already holds, so it changes nothing.
    await wait(30);
    expect(docFetches()).toBe(2);
    await sync._runPending();
    expect(sync._pendingExternal).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    expect(etag.lastSeenEtag()).toBe("save-C");
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("a peer frame the check is waiting for drains first, and the body is judged again", async () => {
  await boot('<p id="value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  docResponder = () => doc("disk-B", '<p id="value">B from disk</p>');
  const peerHtml = '<p id="value">C from a peer</p>';

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    // The check answered with a body, and it is sitting in its slot undrained.
    expect(sync._pendingExternal).toMatchObject({ etag: "disk-B" });

    // A peer save's relay lands in the same window. Its seq is a subscription
    // cursor rather than a content version, so there is no order to compare: the
    // frame has to land before the check can mean anything.
    sse.onmessage({
      data: JSON.stringify({ seq: 9, html: peerHtml, sender: "peer", etag: "peer-C" }),
    });
    expect(sync._pendingHtml).toBe(peerHtml);

    await sync._runPending();
    expect(document.querySelector("#value").textContent).toBe("C from a peer");
    expect(etag.representedEtag()).toBe("peer-C");
    // The body for the older version was neither applied nor allowed to displace
    // the frame: it is still waiting its turn.
    expect(sync._pendingExternal).not.toBeNull();

    await sync._runPending();
    expect(sync._pendingExternal).toBeNull();
    expect(document.querySelector("#value").textContent).toBe("C from a peer");

    // The fresh check now sees a page that is no longer the one that asked, and
    // the disk version it finds is neither of the two the page has held.
    await wait(30);
    expect(docFetches()).toBe(2);
    await sync._runPending();
    expect(document.querySelector("#value").textContent).toBe("B from disk");
  } finally {
    sync.stop();
  }
});

test("a save accepted while the startup morph is waiting keeps its own stamp", async () => {
  await boot('<p data-id="p" contenteditable="true">a0</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  // The body carries an external script, so its merge is still awaiting resources
  // when the save lands: the frame's apply has already rewritten the DOM, which is
  // the window this case is about.
  docResponder = () =>
    doc(
      "disk-B",
      '<p data-id="p" contenteditable="true">a1</p><script src="/startup-version-wait.js"></script>'
    );

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    expect(sync._pendingExternal).not.toBeNull();

    const applying = sync._runPending();
    await tick();
    // The morph has run and the apply is still waiting on the frame's script:
    // that gap is the window the case is about.
    expect(document.querySelector('[data-id="p"]').textContent).toBe("a1");
    expect(sync.isPaused).toBe(true);

    etag.recordEtag("save-C");
    document.dispatchEvent(new CustomEvent("clay:save-saved", { detail: { msg: "Saved" } }));

    document
      .querySelector('script[src="/startup-version-wait.js"]')
      .dispatchEvent(new Event("load"));
    await applying;

    // The save is newer than the frame that was still settling, so the frame's
    // older stamp may not take its place.
    expect(etag.lastSeenEtag()).toBe("save-C");
    expect(etag.representedEtag()).toBe("save-C");
  } finally {
    sync.stop();
  }
});

test("a dirty page holds the startup check instead of applying what it fetched", async () => {
  await boot('<p id="value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  docResponder = () => doc("disk-B", '<p id="value">B from disk</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  // Unsaved work on the page before the stream exists: there is no disk baseline
  // to merge a frame against, so the disk lane holds rather than morph.
  document.getElementById("value").textContent = "A edited here";
  await tick();
  const { sync, sse } = await started("live");
  try {
    expect(sync._diskBase).toBe(null);

    sse.onopen();
    await tick();
    expect(sync._pendingExternal).not.toBeNull();

    await sync._runPending();

    expect(document.querySelector("#value").textContent).toBe("A edited here");
    expect(applied).not.toHaveBeenCalled();
    // A startup check has no frame worth re-queueing: the body describes disk as
    // of its GET, so the question is asked again instead of the bytes being held
    // for three seconds and applied over whatever the person is doing.
    expect(sync._holdRetryExt).toBeFalsy();
    expect(sync._startupRetry).toBeTruthy();
    expect(sync._pendingExternal).toBeNull();
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("an ordinary stamped fallback holds on a dirty page instead of asking the version question", async () => {
  await boot('<p id="value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta(BOOT, ["conditional", "sync"]);
  // The subscription's own check finds the version this page holds, which answers
  // it without applying anything, so the notification below stays an ordinary
  // external change.
  docResponder = () => doc(BOOT, '<p id="value">A</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  // Unsaved work before the stream exists: there is no disk baseline to merge a
  // frame against, so the disk lane holds rather than morph.
  document.getElementById("value").textContent = "A edited here";
  await tick();
  const { sync, sse } = await started("live");
  try {
    expect(sync._diskBase).toBe(null);

    sse.onopen();
    await tick();
    await sync._runPending();
    expect(docFetches()).toBe(1);
    expect(sync._pendingExternal).toBeNull();
    expect(etag.representedEtag()).toBe(BOOT);

    // An external change that arrives without a body falls back to a GET, and the
    // response names a version of its own. That stamp describes those bytes; it
    // does not turn this content fetch into a version question.
    docResponder = () => doc("disk-B", '<p id="value">B from disk</p>');
    sse.onmessage({
      data: JSON.stringify({ type: "notification", seq: 11, data: { kind: "external-change" } }),
    });
    await tick();
    expect(docFetches()).toBe(2);
    expect(sync._pendingExternal).toMatchObject({ seq: 11, etag: "disk-B" });
    const versionCheck = sync._pendingExternal.fetchOptions.versionCheck;

    await sync._runPending();

    // Ordinary content keeps the ordinary hold: the bytes wait for a later frame
    // under the epoch they were queued with, and nobody is asked again.
    expect(applied).not.toHaveBeenCalled();
    expect(document.querySelector("#value").textContent).toBe("A edited here");
    expect(sync._pendingExternal).toBeNull();
    expect(sync._holdRetryExt).toBeTruthy();
    expect(sync._startupRetry).toBeFalsy();
    expect(versionCheck).toBe(false);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("a startup answer that names no version applies nothing and clears nothing", async () => {
  await boot('<div id="app"><p id="static">From the file</p></div>');
  const rendered = renderAtRuntime("app", "rendered", "Rendered by a script at load");
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  docResponder = () => doc(null, '<div id="app"></div>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    await sync._runPending();

    expect(docFetches()).toBe(1);
    expect(sync._pendingExternal).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    expect(document.getElementById("rendered")).toBe(rendered);
    expect(document.querySelector("#static")).not.toBeNull();
    expect(etag.lastSeenEtag()).toBe(BOOT);
    expect(etag.representedEtag()).toBe(BOOT);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("an unstamped peer frame drops the version this tab was representing", async () => {
  await boot('<p id="value">A</p>');
  clearGate();
  installFetch();
  // A host that announces no conditional saves: an unstamped live frame is a peer
  // preview rather than a save's relay, and it still applies.
  metaAnswer = diskMeta(BOOT, []);
  await etag.seedEtag();
  expect(etag.conditionalSaves()).toBe(false);

  const { sync } = await started("live");
  try {
    await sync.applyUpdate('<p id="value">C from a peer</p>', 9);
    await sync._runPending();

    expect(document.querySelector("#value").textContent).toBe("C from a peer");
    // The content is nobody's named version, so the tab may not go on claiming
    // the one it was served — but a peer relay is not a save, so the stamp the
    // next save compares with stays where it was.
    expect(etag.representedEtag()).toBe(null);
    expect(etag.lastSeenEtag()).toBe(BOOT);
  } finally {
    sync.stop();
  }
});

test("a shared subscription runs the same check, once, from its cursor", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B", ["sync", "sync-worker"]);
  docResponder = () => doc("disk-B", '<p id="startup-value">B from disk</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, worker } = await startedShared();
  try {
    expect(worker).toBeDefined();
    // Opening the port is not a subscription: the check must still be pending.
    worker.send({ type: "status", state: "open" });
    expect(sync.sse._startup).toBe(true);
    expect(docFetches()).toBe(0);

    worker.send({ type: "cursor", seq: 7, resync: false });
    await tick();
    expect(docFetches()).toBe(1);
    expect(sync.sse._startup).toBe(false);

    await sync._runPending();
    expect(document.querySelector("#startup-value").textContent).toBe("B from disk");
    expect(applied).toHaveBeenCalledTimes(1);

    // One check per subscription, and only the first one: a later cursor on the
    // same stream is a replay position, not another startup.
    worker.send({ type: "cursor", seq: 8, resync: false });
    await tick();
    expect(docFetches()).toBe(1);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("a startup body that lands after a restart is ignored", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B");
  const first = deferredDoc();
  docResponder = (index) =>
    index === 0 ? first.promise : doc("disk-B", '<p id="startup-value">B from disk</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    expect(docFetches()).toBe(1);

    sync.stop();
    sync.start("index.html");
    await sync._ready;

    first.release("disk-B", '<p id="startup-value">B from disk</p>');
    await tick();
    await sync._runPending();

    expect(sync._pendingExternal).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    expect(document.querySelector("#startup-value").textContent).toBe("A");
    expect(docFetches()).toBe(1);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("a real resync arriving with the startup check runs one repair, in repair mode", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B", ["sync", "sync-worker"]);
  docResponder = () => doc("disk-B", '<p id="startup-value">B from disk</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, worker } = await startedShared();
  try {
    worker.send({ type: "status", state: "open" });
    // The worker remembers that this subscription needs a repair, so the first
    // cursor carries both flags at once.
    worker.send({ type: "cursor", seq: 42, resync: true });
    await tick();

    // One fetch, not two: replay loss is the stronger claim, and it is the only
    // one that comes with a baseline to fetch at.
    expect(docFetches()).toBe(1);
    expect(sync._pendingExternal).toMatchObject({
      seq: 42,
      etag: "disk-B",
      fetchOptions: { repair: true, startup: false, attempt: 0 },
    });

    await sync._runPending();
    expect(document.querySelector("#startup-value").textContent).toBe("B from disk");
    expect(applied).toHaveBeenCalledTimes(1);
    expect(etag.representedEtag()).toBe("disk-B");
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("an explicit resync keeps the recovery fallback after a no-op startup check", async () => {
  await boot('<p id="startup-value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta(BOOT);
  // The check finds the version this page already holds, so it does nothing. The
  // repair's own body carries no version — a recovery fetch is not a version
  // comparison — and it applies through the pre-existing fallback.
  docResponder = (index) =>
    index === 0
      ? doc(BOOT, '<p id="startup-value">A</p>')
      : doc(null, '<p id="startup-value">Recovered from disk</p>');

  const { sync, sse } = await started("live");
  try {
    sse.onopen();
    await tick();
    await sync._runPending();
    expect(docFetches()).toBe(1);
    expect(sync._pendingExternal).toBeNull();

    sse.dispatchEvent(
      new MessageEvent("cursor", { data: JSON.stringify({ seq: 12, resync: true }) })
    );
    await tick();
    expect(docFetches()).toBe(2);
    expect(sync._pendingExternal).toMatchObject({
      seq: 12,
      etag: null,
      fetchOptions: { repair: true, startup: false, attempt: 0 },
    });

    await sync._runPending();
    expect(document.querySelector("#startup-value").textContent).toBe("Recovered from disk");
    // No version was named, so none is claimed: the tab holds bytes nobody stamped.
    expect(etag.representedEtag()).toBe(null);
  } finally {
    sync.stop();
  }
});

test.each(["live", "saved"])(
  "an unchanged file stays untouched when the first cursor also asks for a resync (%s lane)",
  async (lane) => {
    await boot('<div id="app"><p id="static">From the file</p></div>');
    const rendered = renderAtRuntime("app", "rendered", "Rendered by a script at load");
    clearGate();
    installFetch();
    metaAnswer = diskMeta(BOOT, ["conditional", "sync", "sync-worker"]);
    // The worker could not replay this subscription, so its first cursor carries
    // both flags. The file has not changed since this page was served, and the
    // response says so.
    docResponder = () => doc(BOOT, '<div id="app"><p id="static">From the file</p></div>');
    const applied = jest.fn();
    document.addEventListener("clay:sync-applied", applied);

    const { sync, worker } = await startedShared(lane);
    try {
      worker.send({ type: "cursor", seq: 30, resync: true });
      await tick();
      await sync._runPending();

      // One fetch answered both questions: the body named the version this page
      // was served, which is the version it holds.
      expect(docFetches()).toBe(1);
      expect(sync._pendingExternal).toBeNull();
      expect(applied).not.toHaveBeenCalled();
      expect(document.getElementById("rendered")).toBe(rendered);
      expect(document.querySelector("#static")).not.toBeNull();
      // Nothing was applied, so nothing may be claimed or cleared.
      expect(etag.representedEtag()).toBe(BOOT);
      expect(etag.lastSeenEtag()).toBe(BOOT);
    } finally {
      document.removeEventListener("clay:sync-applied", applied);
      sync.stop();
    }
  }
);

test.each([false, true])(
  "a first cursor with resync=%s cannot rewind a newer peer save with its delayed answer",
  async (repair) => {
    await boot('<p id="value">A</p>');
    clearGate();
    installFetch();
    metaAnswer = diskMeta("disk-B", ["conditional", "sync", "sync-worker"]);
    const first = deferredDoc();
    // The first GET answers disk-B. Whatever is asked afterwards sees the peer's
    // version, which is what disk holds by then.
    docResponder = (index) =>
      index === 0 ? first.promise : doc("peer-C", '<p id="value">C</p>');
    const applied = jest.fn();
    document.addEventListener("clay:sync-applied", applied);

    const { sync, worker } = await startedShared();
    try {
      worker.send({ type: "cursor", seq: 30, resync: repair });
      await tick();
      // A stamped peer save lands while that GET is still on the wire: a
      // subscription cursor says where the stream is, not what disk holds.
      worker.send({
        type: "frame",
        data: JSON.stringify({
          seq: 31,
          sender: "peer",
          html: '<p id="value">C</p>',
          etag: "peer-C",
        }),
      });
      await sync._runPending();
      expect(document.querySelector("#value").textContent).toBe("C");
      expect(etag.lastSeenEtag()).toBe("peer-C");

      first.release("disk-B", '<p id="value">B</p>');
      await tick();
      await sync._runPending();
      await wait(30);
      await sync._runPending();

      // The body for B describes a moment this page has already left, so it may
      // not be applied over the frame that took it there.
      expect(document.querySelector("#value").textContent).toBe("C");
      expect(etag.lastSeenEtag()).toBe("peer-C");
      expect(etag.representedEtag()).toBe("peer-C");
      // Only the peer frame applied: the delayed body answered nobody.
      expect(applied).toHaveBeenCalledTimes(1);
      // It was not dropped either. The question was asked again, and the fresh
      // answer names the version the tab already holds.
      expect(docFetches()).toBe(2);
    } finally {
      document.removeEventListener("clay:sync-applied", applied);
      sync.stop();
    }
  }
);

test("a queued stamped repair drains behind a newer peer frame and is judged again", async () => {
  await boot('<p id="value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B", ["conditional", "sync", "sync-worker"]);
  docResponder = (index) =>
    index === 0
      ? doc("disk-B", '<p id="value">B from disk</p>')
      : doc("peer-C", '<p id="value">C from a peer</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, worker } = await startedShared();
  try {
    worker.send({ type: "cursor", seq: 30, resync: true });
    await tick();
    // The repair's body is in its slot, undrained, and it names a version.
    expect(sync._pendingExternal).toMatchObject({
      seq: 30,
      etag: "disk-B",
      fetchOptions: { repair: true, startup: false, versionCheck: true },
    });

    // A peer save's relay lands in the same window, newer than that body.
    worker.send({
      type: "frame",
      data: JSON.stringify({
        seq: 31,
        sender: "peer",
        html: '<p id="value">C from a peer</p>',
        etag: "peer-C",
      }),
    });
    await sync._runPending();
    expect(document.querySelector("#value").textContent).toBe("C from a peer");
    // The older body waited its turn rather than being applied over the frame.
    expect(sync._pendingExternal).not.toBeNull();

    // The page moved past what the body describes, so the repair is re-asked
    // instead of applied to a page it no longer answers for.
    await sync._runPending();
    expect(sync._pendingExternal).toBeNull();
    expect(document.querySelector("#value").textContent).toBe("C from a peer");

    await wait(30);
    expect(docFetches()).toBe(2);
    await sync._runPending();
    expect(document.querySelector("#value").textContent).toBe("C from a peer");
    expect(etag.representedEtag()).toBe("peer-C");
    expect(applied).toHaveBeenCalledTimes(1);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("a superseded repair is re-asked at the current watermark and lands once", async () => {
  await boot('<p id="value">A</p>');
  clearGate();
  installFetch();
  metaAnswer = diskMeta("disk-B", ["conditional", "sync", "sync-worker"]);
  // The third GET — the newer external change's own fallback — never answers, so
  // the watermark it advanced to stands while the repair waits in its slot.
  const stalled = deferredDoc();
  docResponder = (index) =>
    index === 0
      ? doc(BOOT, '<p id="value">A</p>')
      : index === 1
        ? doc("disk-B", '<p id="value">B from disk</p>')
        : index === 2
          ? stalled.promise
          : doc("disk-C", '<p id="value">C from disk</p>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    // The subscription's own check finds the version this page holds.
    sse.onopen();
    await tick();
    await sync._runPending();
    expect(docFetches()).toBe(1);

    // The server could not replay this page, so the repair fetches what disk
    // holds and queues it. It has not drained yet.
    sse.dispatchEvent(
      new MessageEvent("cursor", { data: JSON.stringify({ seq: 30, resync: true }) })
    );
    await tick();
    expect(sync._pendingExternal).toMatchObject({
      seq: 30,
      etag: "disk-B",
      fetchOptions: { repair: true, startup: false, versionCheck: true },
    });

    // A newer external change advances the watermark while its own GET is still
    // on the wire, so the queued repair is superseded before it ever drains.
    sync._maybeAcceptExternalChange({
      type: "notification",
      seq: 31,
      data: { kind: "external-change" },
    });
    await tick();
    expect(sync._lastExternalSeq).toBe(31);
    expect(sync._pendingExternal).toMatchObject({ seq: 30 });

    // The drain re-asks the repair rather than dropping it. The seq it carries is
    // a cursor for ordering, so it must be the watermark the page has reached:
    // re-asking at the superseded seq 30 would be rejected by that same change
    // over and over until the retries ran out, and the page would stay stale.
    await sync._runPending();
    expect(sync._pendingExternal).toBeNull();
    await wait(30);
    expect(docFetches()).toBe(4);
    expect(sync._pendingExternal).toMatchObject({
      seq: 31,
      etag: "disk-C",
      fetchOptions: { repair: true, startup: false, versionCheck: true, attempt: 1 },
    });

    await sync._runPending();
    expect(document.querySelector("#value").textContent).toBe("C from disk");
    expect(applied).toHaveBeenCalledTimes(1);
    expect(etag.representedEtag()).toBe("disk-C");
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});

test("an explicit repair whose body names the version the tab holds is a no-op", async () => {
  await boot('<div id="app"><p id="static">From the file</p></div>');
  const rendered = renderAtRuntime("app", "rendered", "Rendered by a script at load");
  clearGate();
  installFetch();
  metaAnswer = diskMeta(BOOT);
  docResponder = () => doc(BOOT, '<div id="app"><p id="static">From the file</p></div>');
  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);

  const { sync, sse } = await started("live");
  try {
    // A real resync with no startup flag: the server says it could not replay
    // this page, and the body it fetches names the version this page holds.
    sse.dispatchEvent(
      new MessageEvent("cursor", { data: JSON.stringify({ seq: 12, resync: true }) })
    );
    await tick();
    expect(docFetches()).toBe(1);

    await sync._runPending();

    expect(sync._pendingExternal).toBeNull();
    expect(applied).not.toHaveBeenCalled();
    expect(document.getElementById("rendered")).toBe(rendered);
    expect(document.querySelector("#static")).not.toBeNull();
    expect(etag.representedEtag()).toBe(BOOT);
    expect(etag.lastSeenEtag()).toBe(BOOT);
    expect(docFetches()).toBe(1);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});
