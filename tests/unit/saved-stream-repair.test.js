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
 *     and reissued at the latest watermark, but only twice: a steady writer makes
 *     every read overlap a frame, so the third body is applied instead of dropped;
 *   - while a fetched body's version is unconfirmed by any frame, a frame carrying
 *     another stamp refetches instead of overwriting bytes that may already be
 *     newer; a frame that names the body's own stamp establishes the match and
 *     direct application resumes;
 *   - a host that stamps neither the frame nor the response is ordered by the
 *     stream's sequence alone, so its frames apply directly and never rewind;
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

test("a repair superseded twice applies the next body instead of discarding it again", async () => {
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
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(docCalls()).toHaveLength(attempt + 1);
    source.onmessage(frame({ seq: ++seq, html: served(`disk-${seq}`, `<p>${seq}</p>`), etag: `disk-${seq}` }));
    queue.at(-1).release("disk-stale", "<p>stale</p>");
    await settle();
  }

  // Two bodies in a row were discarded because a frame landed while each was read.
  // A steady writer never lets one arrive over an idle stream, so the third body is
  // applied at the latest watermark instead of being dropped.
  expect(docCalls()).toHaveLength(3);
  source.onmessage(frame({ seq: ++seq, html: served(`disk-${seq}`, `<p>${seq}</p>`), etag: `disk-${seq}` }));
  queue.at(-1).release("disk-stale", "<p>stale</p>");
  await settle();

  expect(docCalls()).toHaveLength(3);
  expect(snapshots.map((candidate) => candidate.etag)).toEqual(["disk-11", "disk-12", "disk-13", "disk-stale"]);
  expect(snapshots.at(-1)).toEqual({ bytes: served("disk-stale", "<p>stale</p>"), etag: "disk-stale", seq: 13 });
  expect(statuses.filter((status) => status.reason === "repair-superseded")).toHaveLength(0);

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

test("an unstamped host applies its frames straight from the stream after a repair", async () => {
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

  // No host stamps a saved frame, so there is no identity to confirm and the
  // sequence alone orders it: a differing frame applies with no further GET.
  const newer = served(null, '<p id="v">D</p>');
  source.onmessage(frame({ seq: 6, html: newer }));
  expect(snapshots).toHaveLength(3);
  expect(snapshots.at(-1)).toEqual({ bytes: newer, etag: null, seq: 6 });
  await settle();
  expect(docCalls()).toHaveLength(1);

  // The repair body stays the floor: an older sequence never rewinds the article.
  source.onmessage(frame({ seq: 4, html: served(null, '<p id="v">Z</p>') }));
  await settle();
  expect(snapshots).toHaveLength(3);
  expect(handle.represented.bytes).toBe(newer);

  handle.stop();
});

test("a steady writer saving every 50 ms is shown while 120 ms GETs keep being superseded", async () => {
  const disk = { current: served(null, "<p>0</p>") };
  docSequencer = () =>
    new Promise((resolve) => {
      const body = disk.current;
      setTimeout(() => resolve(response(200, body)), 120);
    });
  const { handle, snapshots, statuses, source } = await startTransport({
    servedEtag: null,
    represented: { bytes: served(null, "<p>0</p>"), etag: null, seq: 0 },
  });

  source.dispatchEvent(cursorEvent({ seq: 0, resync: true }));

  const written = [];
  let seq = 0;
  const write = () => {
    seq += 1;
    disk.current = served(null, `<p>${seq}</p>`);
    written.push(disk.current);
    return disk.current;
  };
  const writer = setInterval(() => {
    const bytes = write();
    source.onmessage(frame({ seq, html: bytes }));
  }, 50);

  await new Promise((resolve) => setTimeout(resolve, 420));
  clearInterval(writer);

  // Every save reaches the article, in order, even though each read was invalidated
  // by a frame that landed while it was in flight.
  const applied = snapshots.map((candidate) => candidate.bytes);
  for (const bytes of written) expect(applied).toContain(bytes);
  expect(snapshots.at(-1).bytes).toBe(written.at(-1));
  expect(docCalls().length).toBeLessThanOrEqual(3);
  expect(statuses.filter((status) => status.reason === "repair-superseded")).toHaveLength(0);

  // Once the churn is over the reader is at the stream's position again: the next
  // save applies straight from the stream, with no GET.
  const reads = docCalls().length;
  const last = write();
  source.onmessage(frame({ seq, html: last }));
  await settle();
  expect(handle.represented).toEqual({ bytes: last, etag: null, seq });
  expect(docCalls()).toHaveLength(reads);

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

test("a document's own stamp names it even when the server adds an HTTP ETag of its own", async () => {
  docSequencer = () => Promise.resolve({
    ...response(200, served("disk-C", '<p id="v">C</p>')),
    headers: { get: (name) => (name.toLowerCase() === "etag" ? 'W/"12b4e-express"' : null) },
  });
  const { handle, snapshots, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await settle();

  expect(snapshots.at(-1).etag).toBe("disk-C");
  handle.stop();
});

test("a weak HTTP ETag never names a document that carries no stamp of its own", async () => {
  docSequencer = () => Promise.resolve({
    ...response(200, '<!doctype html><html><body><p id="v">C</p></body></html>'),
    headers: { get: (name) => (name.toLowerCase() === "etag" ? 'W/"12b4e-express"' : null) },
  });
  const { handle, snapshots, source } = await startTransport();

  source.dispatchEvent(cursorEvent({ seq: 7, resync: true }));
  await settle();

  expect(snapshots.map((s) => s.etag)).not.toContain('W/"12b4e-express"');
  handle.stop();
});
