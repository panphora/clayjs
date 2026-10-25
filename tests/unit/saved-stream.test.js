/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";

/**
 * The receive-only saved transport (Document 06 Step 1).
 *
 * A reader follows saved files: a startup GET, full frames and repair GETs, and
 * nothing else. No POST, no PATCH, no live relay, no page store, no merge engine.
 * The transport owns a represented receipt — `{ bytes, etag, seq }` — and moves it
 * only when `onSnapshot` says the whole candidate applied.
 *
 * This file covers the application path: wire selection, full and duplicate frames,
 * legacy frames without a sequence, malformed input, external-change variants,
 * refused applies, the startup GET and stop. Repair ordering lives in
 * saved-stream-repair.test.js.
 */

const PAGE = "http://localhost/index.html";

let sources;
let fetchCalls;
let metaAnswer;
let docResponder;

class FakeEventSource extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.closed = false;
    sources.push(this);
  }
  close() {
    this.closed = true;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  await tick();
  await tick();
};

const response = (status, text) => ({ ok: status < 400, status, text: async () => text });

const served = (stamp, body) =>
  `<!DOCTYPE html><html${stamp ? ` documentetag="${stamp}"` : ""}><head></head><body>${body}</body></html>`;

const docResponse = (stamp, body) => () => Promise.resolve(response(200, served(stamp, body)));

const cursorEvent = (data) => new MessageEvent("cursor", { data: JSON.stringify(data) });
const frame = (data) => ({ data: JSON.stringify(data) });

const docCalls = () => fetchCalls.filter((call) => !call.url.includes("/_/meta"));

function installFetch() {
  fetchCalls = [];
  global.fetch = jest.fn((url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    if (String(url).includes("/_/meta")) {
      return Promise.resolve(response(200, JSON.stringify(metaAnswer)));
    }
    return docResponder();
  });
}

let createSavedStream;
let resetHostMeta;

beforeAll(async () => {
  sources = [];
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
  ({ createSavedStream } = await import("../../src/sync/saved-stream.js"));
  ({ resetHostMeta } = await import("../../src/core/host-meta.js"));
});

beforeEach(() => {
  sources = [];
  metaAnswer = { spec: 1, extensions: ["sync"] };
  docResponder = docResponse("disk-C", '<p id="v">C</p>');
  document.head.innerHTML = "";
  resetHostMeta();
  installFetch();
});

afterEach(() => {
  delete global.fetch;
  delete global.SharedWorker;
});

async function startTransport({
  documentURL = "/index.html",
  servedEtag = null,
  represented = null,
  onSnapshot,
} = {}) {
  const snapshots = [];
  const statuses = [];
  const handle = createSavedStream({
    documentURL,
    servedEtag,
    represented,
    onSnapshot:
      onSnapshot ||
      ((candidate) => {
        snapshots.push(candidate);
        return true;
      }),
    onStatus: (status) => statuses.push(status),
  });
  handle.start();
  await handle.ready;
  return { handle, snapshots, statuses, source: sources.at(-1) };
}

test("a host announcing sync gets the spec wire on the saved lane", async () => {
  const { handle, source } = await startTransport();

  const url = new URL(source.url);
  expect(url.origin).toBe("http://localhost");
  expect(url.pathname).toBe("/_/sync");
  expect(url.searchParams.get("lane")).toBe("saved");
  expect(url.searchParams.get("document-url")).toBe(PAGE);
  expect(url.searchParams.get("resume-id")).toMatch(/^[A-Za-z0-9._~-]+$/);
  // The tab's own sender id: the value the host knows this connection by.
  expect(url.searchParams.get("client-id")).toBeTruthy();

  handle.stop();
});

test("a host that does not announce sync gets the legacy wire on the saved lane", async () => {
  metaAnswer = { spec: 1, extensions: ["upload"] };
  const { handle, source } = await startTransport();

  const url = new URL(source.url);
  expect(url.origin).toBe("http://localhost");
  expect(url.pathname).toBe("/_/live-sync/stream");
  expect(url.searchParams.get("lane")).toBe("saved");
  expect(url.searchParams.get("page-url")).toBe(PAGE);

  handle.stop();
});

test.each([
  ["spec", { spec: 1, extensions: ["sync"] }],
  ["legacy", { spec: 1, extensions: ["upload"] }],
])("a hostile base element cannot move the %s stream or its repair GET off the page origin", async (name, meta) => {
  metaAnswer = meta;
  document.head.insertAdjacentHTML("beforeend", '<base href="http://evil.test/elsewhere/">');
  expect(document.baseURI).toContain("evil.test");

  const { handle, source } = await startTransport({ servedEtag: "disk-A" });
  expect(new URL(source.url).origin).toBe("http://localhost");

  // The stamped response's startup check is the one request this run makes.
  source.onopen();
  await settle();

  expect(docCalls()).toHaveLength(1);
  expect(docCalls()[0].url).toBe(PAGE);
  for (const call of fetchCalls) expect(call.url).not.toContain("evil.test");

  handle.stop();
});

test("a full frame with a newer sequence applies and advances the receipt", async () => {
  const represented = Object.freeze({ bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 });
  const { handle, snapshots, statuses, source } = await startTransport({ represented, servedEtag: "disk-A" });
  source.onopen();

  const bytes = served("disk-B", '<p id="v">B</p>');
  source.onmessage(frame({ seq: 4, html: bytes, etag: "disk-B" }));

  expect(snapshots).toEqual([{ bytes, etag: "disk-B", seq: 4 }]);
  expect(handle.represented).toEqual({ bytes, etag: "disk-B", seq: 4 });
  expect(statuses.at(-1)).toEqual({ state: "applied", seq: 4, etag: "disk-B" });

  handle.stop();
});

test("a duplicate or older stamped frame is ignored without moving the receipt", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const { handle, snapshots, source } = await startTransport({ represented, servedEtag: "disk-A" });
  source.onopen();

  const bytes = served("disk-B", '<p id="v">B</p>');
  source.onmessage(frame({ seq: 4, html: bytes, etag: "disk-B" }));
  source.onmessage(frame({ seq: 4, html: bytes, etag: "disk-B" }));
  source.onmessage(frame({ seq: 2, html: served("disk-Z", "<p>z</p>"), etag: "disk-Z" }));

  expect(snapshots).toHaveLength(1);
  expect(handle.represented).toEqual({ bytes, etag: "disk-B", seq: 4 });

  handle.stop();
});

test("an unstamped legacy frame is processed in arrival order and keeps sequence null", async () => {
  metaAnswer = { spec: 1, extensions: ["upload"] };
  const represented = { bytes: served(null, "<p>legacy-A</p>"), etag: null, seq: null };
  const { handle, snapshots, source } = await startTransport({ represented });
  source.onopen();

  source.onmessage(frame({ html: served(null, "<p>legacy-B</p>") }));
  source.onmessage(frame({ html: served(null, "<p>legacy-C</p>") }));

  expect(snapshots.map((candidate) => candidate.bytes)).toEqual([
    served(null, "<p>legacy-B</p>"),
    served(null, "<p>legacy-C</p>"),
  ]);
  // The stream named no sequence, so neither does the receipt.
  expect(handle.represented).toEqual({ bytes: served(null, "<p>legacy-C</p>"), etag: null, seq: null });

  handle.stop();
});

test("a bad JSON frame keeps the article and the receipt and reports a recoverable status", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const { handle, snapshots, statuses, source } = await startTransport({ represented });
  source.onopen();

  source.onmessage({ data: "{not json" });
  expect(statuses.at(-1)).toEqual({ state: "recoverable", reason: "bad-json" });
  expect(snapshots).toHaveLength(0);
  expect(handle.represented).toEqual(represented);
  expect(docCalls()).toHaveLength(0);

  handle.stop();
});

test("a frame that carries neither body nor stamp keeps the article and the receipt", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const { handle, snapshots, source } = await startTransport({ represented });
  source.onopen();

  source.onmessage(frame({ seq: 4, sender: "peer" }));

  expect(snapshots).toHaveLength(0);
  expect(handle.represented).toEqual(represented);

  handle.stop();
});

test("a refused apply keeps the receipt and a later valid frame still applies", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const snapshots = [];
  const statuses = [];
  const handle = createSavedStream({
    documentURL: "/index.html",
    servedEtag: "disk-A",
    represented,
    // An apply that cannot complete: the transport must not claim it.
    onSnapshot: (candidate) => {
      snapshots.push(candidate);
      return candidate.seq !== 4;
    },
    onStatus: (status) => statuses.push(status),
  });
  handle.start();
  await handle.ready;
  const source = sources.at(-1);
  source.onopen();

  source.onmessage(frame({ seq: 4, html: served("disk-B", "<p>B</p>"), etag: "disk-B" }));

  expect(snapshots).toHaveLength(1);
  expect(handle.represented).toEqual(represented);
  expect(statuses.at(-1)).toEqual({ state: "recoverable", reason: "refused", seq: 4, etag: "disk-B" });

  const bytes = served("disk-C", "<p>C</p>");
  source.onmessage(frame({ seq: 5, html: bytes, etag: "disk-C" }));
  expect(handle.represented).toEqual({ bytes, etag: "disk-C", seq: 5 });

  handle.stop();
});

test("an external-change notification carrying HTML is a disk candidate with its own stamp", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const { handle, snapshots, source } = await startTransport({ represented });
  source.onopen();

  const bytes = served("disk-D", '<p id="v">D</p>');
  source.onmessage(
    frame({ type: "notification", seq: 4, data: { kind: "external-change", html: bytes, etag: "disk-D" } })
  );

  expect(snapshots).toEqual([{ bytes, etag: "disk-D", seq: 4 }]);
  expect(handle.represented.etag).toBe("disk-D");
  expect(docCalls()).toHaveLength(0);

  handle.stop();
});

test.each([
  [
    "an external-change notification with no HTML",
    { type: "notification", seq: 4, data: { kind: "external-change" } },
  ],
  [
    "the fixed legacy disk message",
    { type: "notification", seq: 4, msg: "index.html changed on disk outside this tab" },
  ],
  ["an ETag notice with no document", { seq: 4, etag: "disk-C" }],
])("%s refetches the served file without moving the receipt", async (name, payload) => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const { handle, snapshots, source } = await startTransport({ represented });
  source.onopen();

  source.onmessage(frame(payload));

  // The notice itself never names the bytes this page holds.
  expect(handle.represented).toEqual(represented);
  expect(docCalls()).toHaveLength(1);
  const [call] = docCalls();
  expect(call.url).toBe(PAGE);
  expect(call.init.cache).toBe("no-store");
  expect(call.init.signal).toBeInstanceOf(AbortSignal);

  await settle();
  expect(snapshots).toEqual([{ bytes: served("disk-C", '<p id="v">C</p>'), etag: "disk-C", seq: 4 }]);
  expect(handle.represented.etag).toBe("disk-C");

  handle.stop();
});

test("identical bytes with a newer stamp advance the receipt without a second body", async () => {
  const bytes = served("disk-A", '<p id="v">A</p>');
  const represented = { bytes, etag: null, seq: 3 };
  const { handle, snapshots, source } = await startTransport({ represented });
  source.onopen();

  source.onmessage(frame({ seq: 4, html: bytes, etag: "disk-A" }));

  expect(snapshots).toEqual([{ bytes, etag: "disk-A", seq: 4 }]);
  expect(handle.represented).toEqual({ bytes, etag: "disk-A", seq: 4 });

  handle.stop();
});

test("the startup check fetches the served file and an unchanged body still fixes the exact receipt", async () => {
  const bytes = served("disk-A", '<p id="v">A</p>');
  const represented = { bytes, etag: null, seq: null };
  docResponder = docResponse("disk-A", '<p id="v">A</p>');
  const { handle, snapshots, source, statuses } = await startTransport({ represented, servedEtag: "disk-A" });
  source.onopen();

  // A stamped response makes the first subscription ask the version question.
  expect(statuses[0]).toEqual({ state: "open", seq: null, etag: null });
  await settle();

  expect(docCalls()).toHaveLength(1);
  expect(snapshots).toEqual([{ bytes, etag: "disk-A", seq: null }]);
  expect(handle.represented).toEqual({ bytes, etag: "disk-A", seq: null });

  handle.stop();
});

test("the startup check applies a file that changed between the response and the first subscription", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: null };
  docResponder = docResponse("disk-B", '<p id="v">B</p>');
  const { handle, snapshots, source } = await startTransport({ represented, servedEtag: "disk-A" });
  source.onopen();
  await settle();

  expect(snapshots).toEqual([{ bytes: served("disk-B", '<p id="v">B</p>'), etag: "disk-B", seq: null }]);

  handle.stop();
});

test("a reader with no represented bytes asks for the file on an unstamped host", async () => {
  metaAnswer = { spec: 1, extensions: ["upload"] };
  docResponder = docResponse(null, '<p id="v">legacy</p>');
  const { handle, snapshots, source } = await startTransport();
  source.onopen();
  await settle();

  expect(docCalls()).toHaveLength(1);
  expect(snapshots).toEqual([{ bytes: served(null, '<p id="v">legacy</p>'), etag: null, seq: null }]);
  expect(handle.represented.etag).toBe(null);

  handle.stop();
});

test("a host that served no stamp asks no version question", async () => {
  metaAnswer = { spec: 1, extensions: ["upload"] };
  const represented = { bytes: served(null, '<p id="v">A</p>'), etag: null, seq: null };
  const { handle, source } = await startTransport({ represented });
  source.onopen();
  await settle();

  expect(docCalls()).toHaveLength(0);
  handle.stop();
});

test("the transport never writes: no POST, no PATCH, no live relay", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  const { handle, source } = await startTransport({ represented, servedEtag: "disk-A" });
  source.onopen();

  source.onmessage(frame({ seq: 4, html: served("disk-B", '<p id="v">B</p>'), etag: "disk-B" }));
  source.dispatchEvent(cursorEvent({ seq: 9, resync: true }));
  await settle();
  source.onmessage(frame({ type: "notification", seq: 10, msg: "index.html changed on disk outside this tab" }));
  await settle();

  expect(docCalls().length).toBeGreaterThan(0);
  for (const call of docCalls()) {
    expect(call.url).toBe(PAGE);
    expect(call.init.method === undefined || call.init.method === "GET").toBe(true);
  }
  for (const call of fetchCalls) {
    expect(call.url.endsWith("/_/sync") && call.init.method === "POST").toBe(false);
    expect(call.url.endsWith("/_/live-sync/save")).toBe(false);
  }

  handle.stop();
});

test("stop closes the stream, is idempotent and never calls back again", async () => {
  const represented = { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 };
  let release;
  docResponder = () => new Promise((resolve) => { release = resolve; });
  const { handle, snapshots, statuses, source } = await startTransport({ represented });
  source.onopen();
  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await tick();
  const signal = docCalls()[0].init.signal;

  handle.stop();
  const after = { snapshots: snapshots.length, statuses: statuses.length };

  expect(source.closed).toBe(true);
  expect(signal.aborted).toBe(true);

  handle.stop();
  source.onmessage?.(frame({ seq: 8, html: served("disk-B", "<p>B</p>"), etag: "disk-B" }));
  source.dispatchEvent(cursorEvent({ seq: 9, resync: true }));
  release(response(200, served("disk-D", "<p>D</p>")));
  await settle();

  expect(snapshots).toHaveLength(after.snapshots);
  expect(statuses).toHaveLength(after.statuses);
  expect(docCalls()).toHaveLength(1);
});

test("the transport imports neither the save lane, the live lane, the snapshot pipeline, the merge engine nor the editor", () => {
  const specifiers = (source) =>
    [...source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]).sort();

  const entry = new URL("../../src/sync/saved-stream.js", import.meta.url);
  expect(specifiers(readFileSync(entry, "utf8"))).toEqual(["./stream.js", "./wire-profile.js"]);

  // The whole static closure, not just the first hop: a reader that pulled in the
  // save lane, the live lane, a store, the merge engine or the editor would show
  // up here even if the transport itself never named it.
  const seen = new Set();
  const walk = (file) => {
    const href = file.href;
    if (seen.has(href)) return;
    seen.add(href);
    for (const specifier of specifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) walk(new URL(specifier, file));
    }
  };
  walk(entry);

  const paths = [...seen].map((href) => new URL(href).pathname);
  expect(paths.length).toBeGreaterThan(2);
  for (const path of paths) {
    expect(path).not.toMatch(/live-sync\.js|\/save\.js|\/live\.js|\/snapshot\.js|merge-engine|\/page\/|\/plugins\//);
  }
});
