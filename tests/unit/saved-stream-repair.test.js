/**
 * @jest-environment jsdom
 */
import { jest } from "@jest/globals";

/**
 * Repair ordering for the receive-only saved transport (Document 06 Step 1).
 *
 * A cursor is a stream watermark, not the version of a fetched body. So:
 *
 *   - a resync or reconnect refetches the served file, and the cursor becomes a
 *     covered replay floor rather than an ordering of saved versions;
 *   - a GET invalidated by something arriving while it was in flight is discarded
 *     and reissued at the latest watermark, at most three immediate attempts, after
 *     which the repair waits for the next reconnect instead of pretending success;
 *   - while a fetched body's version is unconfirmed by any frame, a differing frame
 *     refetches instead of overwriting bytes that may already be newer; a frame that
 *     names the body's own stamp establishes the match and direct application resumes;
 *   - an unstamped legacy host keeps that conservative GET path, which may fetch
 *     more often and never shows an older file;
 *   - a failed GET advances nothing, so a later valid replay is still applied;
 *   - stop aborts the GET and invalidates its continuation; a restart is a new
 *     generation whose stream never inherits the old one.
 */

let sources;
let fetchCalls;
let metaAnswer;
let docSequencer;

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
    return docSequencer();
  });
}

function deferredDoc() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, release: (stamp, body) => resolve(response(200, served(stamp, body))) };
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
  docSequencer = docResponse("disk-C", '<p id="v">C</p>');
  resetHostMeta();
  installFetch();
});

afterEach(() => {
  delete global.fetch;
});

async function startTransport({ servedEtag = null, represented } = {}) {
  const snapshots = [];
  const statuses = [];
  const handle = createSavedStream({
    documentURL: "/index.html",
    servedEtag,
    represented: represented || { bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 },
    onSnapshot: (candidate) => {
      snapshots.push(candidate);
      return true;
    },
    onStatus: (status) => statuses.push(status),
  });
  handle.start();
  await handle.ready;
  const source = sources.at(-1);
  source.onopen();
  return { handle, snapshots, statuses, source };
}

test("a resync refetches the served file and the cursor becomes a covered replay floor", async () => {
  const { handle, snapshots, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await settle();

  expect(docCalls()).toHaveLength(1);
  expect(snapshots).toEqual([{ bytes: served("disk-C", '<p id="v">C</p>'), etag: "disk-C", seq: 7 }]);

  // A replay queued behind that repair carries an older sequence: the floor covers it.
  source.onmessage(frame({ seq: 6, html: served("disk-B", '<p id="v">B</p>'), etag: "disk-B" }));
  expect(snapshots).toHaveLength(1);
  expect(handle.represented.seq).toBe(7);

  handle.stop();
});

test("a cursor jump without resync is bookkeeping only and infers no missing frame", async () => {
  const { handle, snapshots, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 40, resync: false }));
  await settle();

  expect(docCalls()).toHaveLength(0);
  expect(snapshots).toHaveLength(0);
  expect(handle.represented.seq).toBe(3);

  // The accepted floor, not the transport watermark, decides what still applies.
  const bytes = served("disk-B", '<p id="v">B</p>');
  source.onmessage(frame({ seq: 41, html: bytes, etag: "disk-B" }));
  expect(snapshots).toEqual([{ bytes, etag: "disk-B", seq: 41 }]);

  handle.stop();
});

test("a failed repair keeps the receipt and never makes later valid replay ineligible", async () => {
  docSequencer = () => Promise.resolve(response(500, ""));
  const { handle, snapshots, statuses, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await settle();

  expect(snapshots).toHaveLength(0);
  expect(handle.represented).toEqual({ bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 });
  expect(statuses.at(-1)).toEqual({ state: "recoverable", reason: "repair-failed", seq: 7 });

  const bytes = served("disk-B", '<p id="v">B</p>');
  source.onmessage(frame({ seq: 4, html: bytes, etag: "disk-B" }));
  expect(snapshots).toEqual([{ bytes, etag: "disk-B", seq: 4 }]);

  handle.stop();
});

test("a slow repair followed by a frame is discarded and reissued at the latest watermark", async () => {
  const first = deferredDoc();
  docSequencer = () => first.promise;
  const { handle, snapshots, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await tick();
  expect(docCalls()).toHaveLength(1);

  const frameBytes = served("disk-E", '<p id="v">E</p>');
  source.onmessage(frame({ seq: 9, html: frameBytes, etag: "disk-E" }));
  expect(snapshots).toEqual([{ bytes: frameBytes, etag: "disk-E", seq: 9 }]);

  docSequencer = docResponse("disk-F", '<p id="v">F</p>');
  first.release("disk-C", '<p id="v">C</p>');
  await settle();

  // The stale response never overwrote the newer frame; the reissue asked from
  // the latest watermark, and its body covers that floor.
  expect(docCalls()).toHaveLength(2);
  expect(snapshots.at(-1)).toEqual({ bytes: served("disk-F", '<p id="v">F</p>'), etag: "disk-F", seq: 9 });

  handle.stop();
});

test("a repair superseded three times waits for the next reconnect instead of claiming success", async () => {
  const queue = [];
  docSequencer = () => {
    const next = deferredDoc();
    queue.push(next);
    return next.promise;
  };
  const { handle, snapshots, statuses, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await tick();

  let seq = 10;
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(docCalls()).toHaveLength(attempt + 1);
    source.onmessage(frame({ seq: ++seq, html: served(`disk-${seq}`, `<p>${seq}</p>`), etag: `disk-${seq}` }));
    queue.at(-1).release("disk-stale", "<p>stale</p>");
    await settle();
  }

  expect(docCalls()).toHaveLength(3);
  expect(statuses.at(-1)).toEqual({ state: "recoverable", reason: "repair-superseded", seq });
  expect(snapshots.map((candidate) => candidate.etag)).toEqual(["disk-11", "disk-12", "disk-13"]);

  // Recovery, not another immediate attempt: the next open runs the pending repair.
  docSequencer = docResponse("disk-14", "<p>14</p>");
  source.onopen();
  await settle();

  expect(docCalls()).toHaveLength(4);
  expect(snapshots.at(-1)).toEqual({ bytes: served("disk-14", "<p>14</p>"), etag: "disk-14", seq });

  handle.stop();
});

test("a queued replay does not overwrite a newer repair, and a matching stamp resumes direct application", async () => {
  const { handle, snapshots, source } = await startTransport();

  source.onmessage(frame({ seq: 4, html: served("disk-B", '<p id="v">B</p>'), etag: "disk-B" }));
  expect(snapshots).toHaveLength(1);

  source.dispatchEvent(cursorEvent({ seq: 8, resync: true }));
  await settle();
  expect(snapshots.at(-1)).toEqual({ bytes: served("disk-C", '<p id="v">C</p>'), etag: "disk-C", seq: 8 });

  // An older version arrives late, with a higher sequence. It must not replace the
  // newer fetched bytes; it invalidates into another GET instead.
  docSequencer = docResponse("disk-D", '<p id="v">D</p>');
  source.onmessage(frame({ seq: 9, html: served("disk-B", '<p id="v">B</p>'), etag: "disk-B" }));
  expect(snapshots.map((candidate) => candidate.etag)).toEqual(["disk-B", "disk-C"]);
  await settle();
  expect(docCalls()).toHaveLength(2);
  expect(snapshots.at(-1)).toEqual({ bytes: served("disk-D", '<p id="v">D</p>'), etag: "disk-D", seq: 9 });

  // A frame naming the fetched body's own stamp proves the stream is at that
  // version, so direct application resumes with no further GET.
  const bytes = served("disk-D", '<p id="v">D again</p>');
  source.onmessage(frame({ seq: 10, html: bytes, etag: "disk-D" }));
  await settle();

  expect(docCalls()).toHaveLength(2);
  expect(snapshots.at(-1)).toEqual({ bytes, etag: "disk-D", seq: 10 });

  handle.stop();
});

test("an unstamped legacy host keeps the conservative GET path after a repair", async () => {
  metaAnswer = { spec: 1, extensions: ["upload"] };
  const { handle, snapshots, source } = await startTransport({
    servedEtag: null,
    represented: { bytes: served(null, '<p id="v">A</p>'), etag: null, seq: null },
  });

  source.onmessage(frame({ html: served(null, '<p id="v">B</p>') }));
  expect(snapshots).toHaveLength(1);

  docSequencer = docResponse(null, '<p id="v">C</p>');
  source.dispatchEvent(cursorEvent({ seq: 5, resync: true }));
  await settle();
  expect(snapshots).toHaveLength(2);

  // With no stamp there is nothing that can confirm the fetched version, so a
  // differing frame refetches rather than trusting itself over the file.
  source.onmessage(frame({ html: served(null, '<p id="v">D</p>') }));
  expect(snapshots).toHaveLength(2);
  await settle();
  expect(docCalls()).toHaveLength(2);
  expect(snapshots.at(-1).etag).toBe(null);

  handle.stop();
});

test("a duplicate delivery after a repair is ignored without reapplying", async () => {
  const { handle, snapshots, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await settle();
  expect(snapshots).toHaveLength(1);

  const bytes = served("disk-C", '<p id="v">C</p>');
  source.onmessage(frame({ seq: 7, html: bytes, etag: "disk-C" }));
  source.onmessage(frame({ seq: 7, html: bytes, etag: "disk-C" }));
  expect(snapshots).toHaveLength(1);
  expect(handle.represented.seq).toBe(7);

  handle.stop();
});

test("stop aborts an outstanding repair and its continuation stays inert", async () => {
  const first = deferredDoc();
  docSequencer = () => first.promise;
  const { handle, snapshots, statuses, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await tick();
  const signal = docCalls()[0].init.signal;
  const before = { snapshots: snapshots.length, statuses: statuses.length };

  handle.stop();
  expect(signal.aborted).toBe(true);

  first.release("disk-C", '<p id="v">C</p>');
  await settle();

  expect(snapshots).toHaveLength(before.snapshots);
  expect(statuses).toHaveLength(before.statuses);
  expect(handle.represented).toEqual({ bytes: served("disk-A", '<p id="v">A</p>'), etag: "disk-A", seq: 3 });
});

test("a restart is a new generation: fresh stream, fresh resume id, inert old continuations", async () => {
  const { handle, snapshots, source } = await startTransport();
  const firstURL = source.url;

  handle.start();
  await handle.ready;

  const restarted = sources.at(-1);
  expect(restarted).not.toBe(source);
  expect(source.closed).toBe(true);
  expect(new URL(restarted.url).searchParams.get("resume-id")).not.toBe(
    new URL(firstURL).searchParams.get("resume-id")
  );
  expect(sources).toHaveLength(2);

  const bytes = served("disk-B", '<p id="v">B</p>');
  restarted.onmessage(frame({ seq: 4, html: bytes, etag: "disk-B" }));
  expect(snapshots).toEqual([{ bytes, etag: "disk-B", seq: 4 }]);

  handle.stop();
  expect(restarted.closed).toBe(true);
});
