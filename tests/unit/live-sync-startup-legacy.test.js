/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * The old host: a response that names no version.
 *
 * Without a stamp on the navigation there is no provenance to compare the file
 * against, and no client-side way to reconstruct one: both hosts answer discovery
 * by reading the file again, which is a later moment than the response this page
 * is holding. So the startup check does not run at all here \u2014 the transport is
 * built without it \u2014 and the first subscription stays what it was before the
 * check existed: a subscription and nothing more.
 *
 * Explicit resync, the pre-existing recovery path, is untouched by that: it asks
 * for the document because the server said replay could not fix this page, and it
 * still does.
 *
 * The stamp is read when host-attrs.js is first evaluated, so a suite about its
 * absence needs a registry of its own; the stamped cases are in
 * live-sync-startup-version.test.js.
 */

let sourceInstances;

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    sourceInstances.push(this);
  }
  close() {}
}

let LiveSync;
let gate;
let etag;
let resetHostMeta;

let metaCalls;
let docResponder;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const response = (status, text) => ({
  ok: status < 400,
  status,
  statusText: String(status),
  text: async () => text,
});

const served = (body) =>
  `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;

const doc = (body) => Promise.resolve(response(200, served(body)));

const docFetches = () =>
  global.fetch.mock.calls.filter(([url]) => !String(url).includes("/_/meta")).length;

function installFetch() {
  resetHostMeta();
  metaCalls = 0;
  global.fetch = jest.fn((url) =>
    String(url).includes("/_/meta")
      ? (metaCalls++,
        Promise.resolve(
          response(
            200,
            JSON.stringify({
              spec: 1,
              extensions: ["conditional"],
              // Discovery claims a version even though the response named none.
              document: { etag: "disk-B" },
            })
          )
        ))
      : docResponder()
  );
}

async function started(lane = "live") {
  const sync = new LiveSync();
  sync.lane = lane;
  sync._requestFrame = () => null;
  sync.start("index.html");
  await sync._ready;
  return { sync, sse: sourceInstances.at(-1) };
}

beforeAll(async () => {
  window.clayEditMode = true;
  sourceInstances = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  window.scrollTo = () => {};

  const liveSyncModule = await import("../../src/sync/live-sync.js");
  ({ LiveSync } = liveSyncModule);
  liveSyncModule.liveSync.stop();

  gate = await import("../../src/lib/dirty-gate.js");
  etag = await import("../../src/core/etag.js");
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(async () => {
  sourceInstances = [];
  document.body.innerHTML = "";
  await tick();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  etag.recordEtag(null);
});

test("the served stamp is captured as absent on this host", async () => {
  const { servedDocumentEtag } = await import("../../src/core/host-attrs.js");
  expect(servedDocumentEtag).toBe(null);
});

test.each(["live", "saved"])(
  "a first subscription asks nothing extra, even when discovery reports a version (%s lane)",
  async (lane) => {
    document.body.innerHTML =
      '<div id="app"><p id="static">From the file</p></div>';
    await tick();
    const rendered = document.createElement("p");
    rendered.id = "rendered";
    rendered.textContent = "Rendered by a script at load";
    document.getElementById("app").appendChild(rendered);
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    installFetch();
    docResponder = () => doc('<div id="app"></div>');

    const applied = jest.fn();
    document.addEventListener("clay:sync-applied", applied);
    const { sync, sse } = await started(lane);
    try {
      sse.onopen();
      await tick();
      await sync._runPending();

      expect(metaCalls).toBe(1);
      expect(docFetches()).toBe(0);
      expect(sync._pendingExternal).toBeNull();
      expect(applied).not.toHaveBeenCalled();
      expect(document.getElementById("rendered")).toBe(rendered);
      expect(etag.lastSeenEtag()).toBe(null);
      expect(etag.representedEtag()).toBe(null);
    } finally {
      document.removeEventListener("clay:sync-applied", applied);
      sync.stop();
    }
  }
);

test("an explicit resync still fetches and applies the served document", async () => {
  document.body.innerHTML = '<p id="startup-value">Before resync</p>';
  await tick();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
  installFetch();
  docResponder = () => doc('<p id="startup-value">After resync</p>');

  const applied = jest.fn();
  document.addEventListener("clay:sync-applied", applied);
  const { sync, sse } = await started("live");
  try {
    sse.dispatchEvent(
      new MessageEvent("cursor", { data: JSON.stringify({ seq: 12, resync: true }) })
    );
    await tick();
    expect(docFetches()).toBe(1);
    expect(sync._pendingExternal).toMatchObject({ seq: 12, etag: null });

    await sync._runPending();
    expect(document.querySelector("#startup-value").textContent).toBe("After resync");
    expect(applied).toHaveBeenCalledTimes(1);
  } finally {
    document.removeEventListener("clay:sync-applied", applied);
    sync.stop();
  }
});
