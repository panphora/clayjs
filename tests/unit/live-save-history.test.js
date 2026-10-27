/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/page.html"}
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";

/**
 * C2b/C3: an uncertain captured save is settled by durable history, and a fresh
 * room read is required before newer edits may be saved. The host answers here
 * from the recorded responses of the accepted hyperclay test
 * (`tests/fixtures/save-history/`), not from a mock that decides anything.
 *
 * The harness is the real plugin: real store, real FastLane, real snapshot and
 * save lane, with one fetch router answering discovery, the historical
 * `/_/meta` query, the document save and the lane's room reads and frames. The
 * 45-second window and its 0/10/30-second rounds run in real time, with every
 * delay of five seconds or more divided by SCALE so the whole matrix takes
 * milliseconds. Each timing assertion records the scaled times it observed, so
 * 10,000 ms is ~100 ms and the 45-second deadline is ~450 ms.
 */

let checkpointDeps = null;
await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: (deps) => {
    checkpointDeps = deps;
    return { changed: jest.fn(), soon: jest.fn(), flush: jest.fn(), flushing: false, deadline: null };
  },
}));

// Edit mode is decided once, when the core modules load.
window.clayEditMode = true;

// jsdom has no SubtleCrypto. The host proves a save by the SHA-256 of the exact
// body it stored, so the harness supplies Node's WebCrypto before the plugin
// loads; the unavailable-WebCrypto case is covered by the coordinator's own
// tests.
const { webcrypto } = await import("node:crypto");
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true, writable: true });
if (window !== globalThis) Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true, writable: true });

const { applyOps, stampOf } = await import("../../src/live/ops.js");

const HOST = ["live-data", "live-provenance", "save-history", "conditional"];

// ---------------------------------------------------------------------------
// The recorded hosted answers.
//
// One file per case the accepted hosted test proves, holding the status, the
// relevant headers and contract fields from the committed hyperclay
// implementation. Dynamic metadata fields are placeholders or omitted. Nothing
// here decides whether a save landed: the router
// serves these bytes, and the only substitution is the identity the committed
// host itself echoes back (server-lib/state-actions.js:3606 and
// server-lib/document-save.js:157 answer with the request's own Save-ID and the
// hash of the body they just read).
// ---------------------------------------------------------------------------

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/save-history/${name}.json`, import.meta.url), "utf8"));

const FIXTURES = {
  applied: fixture("applied"),
  appliedAfterRestore: fixture("applied-after-restore"),
  unknown: fixture("unknown"),
  alreadyApplied: fixture("already-applied"),
  reused: fixture("reused"),
};

// ---------------------------------------------------------------------------
// The host: one router for everything this tab asks it.
// ---------------------------------------------------------------------------

const calls = { saves: [], queries: [], reads: [], posts: [], meta: 0, historyAnswers: [] };
let saveAnswer = () => ({ status: 200, body: { msg: "Saved", etag: "stored-1" } });
let saveGate = null;
// Which recorded answer this host serves, and whether it echoes the attempt's own
// identity back the way the committed implementation does.
let historyFixture = FIXTURES.applied;
let historyForId = null;
let historyEcho = true;
let saveFixture = null;
let saveEcho = true;
let historyGate = null;
let postGate = null;
let readAnswer = null;
let room = null;
let epochCount = 0;

const roomStore = (value) => ({ value: clone(value), ephemeral: false, last: 0, landed: 0, saved: [] });

const newRoom = (stores) => {
  room = { epoch: `e${++epochCount}`, seq: 0, writer: "tab-1", provenanceVersion: 2, receiptGeneration: 0, stores };
  return room;
};

const answer = (status, body, headers = {}) => ({
  ok: status < 400,
  status,
  statusText: "",
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
  text: async () => (body === null ? "" : JSON.stringify(body)),
  json: async () => body ?? {},
});

// The recorded response verbatim, with only the identity the committed host
// echoes back replaced by this attempt's. A null `echo` serves the recorded bytes
// untouched, which is the mismatching-answer case.
const recorded = (record, echo) => {
  const body = clone(record.response.body);
  if (echo && body.document?.saveOutcome) {
    body.document.saveOutcome = { ...body.document.saveOutcome, saveId: echo.saveId, requestHash: echo.requestHash };
  }
  if (echo && body.saveOutcome) {
    body.saveOutcome = { ...body.saveOutcome, saveId: echo.saveId, requestHash: echo.requestHash };
  }
  return answer(record.response.status, body, record.response.headers);
};

global.fetch = jest.fn(async (url, init = {}) => {
  const target = new URL(String(url), "https://example.com/page.html");
  const headers = init.headers ?? {};
  const method = init.method ?? "GET";
  if (target.pathname === "/_/meta") {
    if (headers["Save-ID"]) {
      const request = { saveId: headers["Save-ID"], requestHash: headers["Save-Request-Hash"] };
      calls.queries.push({ at: Date.now(), ...request });
      if (historyGate) await historyGate;
      const record = historyForId?.get(request.saveId) ?? historyFixture;
      const served = recorded(record, historyEcho ? request : null);
      calls.historyAnswers.push({ case: record.case, status: served.status, body: await served.json() });
      return served;
    }
    calls.meta += 1;
    return answer(200, { spec: 1, extensions: HOST, document: { etag: "base-1", saveId: null } });
  }
  if (target.pathname === "/_/save") {
    const call = { at: Date.now(), body: init.body, headers, url: target.href };
    calls.saves.push(call);
    if (saveGate) await saveGate;
    if (saveFixture) {
      const echo = saveEcho ? { saveId: headers["Save-ID"], requestHash: await sha256Hex(init.body) } : null;
      call.answeredAt = Date.now();
      return recorded(saveFixture, echo);
    }
    const answerFor = await saveAnswer(calls.saves.length, init);
    call.answeredAt = Date.now();
    return answer(answerFor.status ?? 200, answerFor.body === undefined ? { msg: "Saved" } : answerFor.body, answerFor.headers ?? {});
  }
  if (target.pathname === "/_/sync/data") {
    if (method === "GET") {
      calls.reads.push({ at: Date.now(), since: target.searchParams.get("since") });
      if (readAnswer) return readAnswer();
      return answer(200, clone(room));
    }
    const frame = JSON.parse(init.body);
    calls.posts.push({ at: Date.now(), frame });
    if (postGate) await postGate;
    const entry = room?.stores?.[frame.name];
    if (entry) {
      entry.value = applyOps(clone(entry.value), frame.ops);
      entry.saved.push([frame.n, frame.n]);
    }
    room.seq += 1;
    return answer(200, { seq: room.seq, epoch: room.epoch });
  }
  return answer(404, null);
});


// The plugin asks the save module whether the load-time baseline has settled;
// this harness is not a boot, so that one question is answered here and every
// other part of the save module stays the real one.
const realSave = await import("../../src/core/save.js");
await jest.unstable_mockModule("../../src/core/save.js", () => ({ ...realSave, baselineSettled: () => true }));

const SCALE = 100;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms >= 5000 ? Math.round(ms / SCALE) : ms, ...args);

const clone = (value) => JSON.parse(JSON.stringify(value));

const { live, storeOf, fastLane, receiveFrame, sendingCapture } = await import("../../src/plugins/live.js");
const bridge = await import("../../src/live/stream-bridge.js");
const snapshot = await import("../../src/core/snapshot.js");
const { saveCapturedHtml } = await import("../../src/core/save-core.js");
const { savePageForce } = await import("../../src/core/save.js");
const { sha256Hex, RECOVERY_WINDOW_MS, RECOVERY_ROUNDS_MS } = await import("../../src/live/save-history.js");

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const flushAsync = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tag = (name, json, at) => `<script type="application/json" merge="${name}" clay="live"${at ? ` live-at="${at}"` : ""}>${json}</script>`;
const tagOf = (html, name) => {
  const element = new DOMParser().parseFromString(html, "text/html").querySelector(`script[merge="${name}"]`);
  return element && { text: element.textContent, at: element.getAttribute("live-at"), by: element.getAttribute("live-by") };
};

const notices = [];
document.addEventListener("clay:live-notice", (event) => notices.push(event.detail));

// The room moves: a new epoch, this tab as its writer, these stores.
const joinRoom = async (stores) => {
  newRoom(stores);
  bridge.streamEvent("data-state", clone(room));
  await flushAsync();
};

// One tab with one live store at save speed: the room holds `g` and not this
// store, so the store stays in file mode until a state carries it.
const tab = async (name, json = '{"n":0}', at = null) => {
  document.body.innerHTML = tag("g", '{"s":0}') + tag(name, json, at);
  const store = live(name);
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  await joinRoom({ g: roomStore({ s: 0 }) });
  return store;
};

// One captured save, held on the wire until the test answers it.
const sendCapture = async () => {
  const capture = snapshot.captureForSaveAndComparison({ flushUndo: false });
  let release;
  saveGate = new Promise((resolve) => {
    release = resolve;
  });
  const saving = saveCapturedHtml(capture.forSave, capture.captureId);
  await flushAsync();
  return {
    capture,
    body: capture.forSave,
    sentId: () => calls.saves.at(-1).headers["Save-ID"],
    answer: async (result) => {
      if (result !== undefined) saveAnswer = () => result;
      saveGate = null;
      release();
      return saving;
    },
  };
};

const lostAnswer = (save) => save.answer({ status: 502, body: null });

const sendingIds = (name) => sendingCapture().qualified.get(name) ?? null;

const pendingIds = (name) => storeOf(name).pendingEntries().map((entry) => entry.id);
const posted = (name) => calls.posts.filter((post) => post.frame.name === name);

const refusal = () => {
  try {
    snapshot.captureForSaveAndComparison({ flushUndo: false });
    return null;
  } catch (err) {
    return err.code ?? err.message;
  }
};

// Wait for the lookup to have asked the host at least n times.
const untilQuery = async (n = 1) => {
  for (let i = 0; i < 100 && calls.queries.length < n; i += 1) await wait(2);
  return calls.queries.length;
};

// Wait for the lane to have framed at least n operations of a store.
const untilPosted = async (name, n = 1) => {
  for (let i = 0; i < 100 && posted(name).length < n; i += 1) await wait(2);
  return posted(name).length;
};

// Wait for the fresh read to be applied: the barrier clears only when a state
// that passed the lane's read barrier was taken.
const untilTaken = async () => {
  for (let i = 0; i < 100 && refusal() !== null; i += 1) await wait(2);
  return refusal();
};

const untilNotice = async (code) => {
  for (let i = 0; i < 100 && !notices.some((notice) => notice.code === code); i += 1) await wait(10);
  return notices.filter((notice) => notice.code === code).length;
};

const until = async (check, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await wait(10);
};

// Hold the next room read open until the test releases it.
const gateRead = (state = null) => {
  let release = null;
  readAnswer = () => {
    readAnswer = null;
    return new Promise((resolve) => {
      release = () => resolve(answer(200, clone(state ?? room)));
    });
  };
  return () => release?.();
};

beforeEach(() => {
  calls.saves.length = 0;
  calls.queries.length = 0;
  calls.reads.length = 0;
  calls.posts.length = 0;
  calls.meta = 0;
  calls.historyAnswers.length = 0;
  notices.length = 0;
  saveAnswer = () => ({ status: 200, body: { msg: "Saved", etag: "stored-1" } });
  saveGate = null;
  historyFixture = FIXTURES.applied;
  historyForId = null;
  historyEcho = true;
  saveFixture = null;
  saveEcho = true;
  historyGate = null;
  postGate = null;
  readAnswer = null;
  room = null;
});

afterAll(() => {
  globalThis.setTimeout = realSetTimeout;
});

// ---------------------------------------------------------------------------
// The recorded hosted answers
// ---------------------------------------------------------------------------

test("every recorded hosted answer carries the deterministic identities the accepted test used", async () => {
  for (const record of [FIXTURES.applied, FIXTURES.appliedAfterRestore, FIXTURES.unknown]) {
    // The request hash is the accepted test's own sha256 of its NEXT body, the
    // request carries it, and the body the host writes answers with it unchanged.
    expect(await sha256Hex(record.inputs.NEXT)).toBe(record.inputs.NEXT_HASH);
    expect(record.request.headers["Save-Request-Hash"]).toBe(record.inputs.NEXT_HASH);
    expect(record.response.body.document.saveOutcome.requestHash).toBe(record.inputs.NEXT_HASH);
    expect(record.request.headers["Save-ID"]).toBe(record.response.body.document.saveOutcome.saveId);
    expect(record.response.status).toBe(200);
    expect(record.response.headers["cache-control"]).toBe("private, no-store");
    expect(record.response.body.spec).toBe(1);
    expect(record.response.body.extensions).toContain("save-history");
    // The current ETag describes the bytes on disk, not the attempt the row proves.
    expect(record.response.body.document.etag).toBe(
      record.case === "applied-after-restore" ? record.inputs.CURRENT_ETAG : record.inputs.NEXT_ETAG,
    );
  }
  expect(FIXTURES.applied.response.body.document.saveId).toBe("attempt-1");
  expect(FIXTURES.applied.response.body.document.saveOutcome.status).toBe("applied");
  expect(FIXTURES.unknown.response.body.document.saveOutcome.status).toBe("unknown");
  // The restore moved the bytes, so the current receipt is gone while the row stays.
  expect(FIXTURES.appliedAfterRestore.response.body.document.saveId).toBeUndefined();
  expect(FIXTURES.appliedAfterRestore.response.body.document.saveOutcome.status).toBe("applied");

  // The two duplicate answers: the identical attempt carries the positive outcome
  // and no stamp, the reused id carries no outcome at all.
  expect(FIXTURES.alreadyApplied.response.status).toBe(409);
  expect(FIXTURES.alreadyApplied.response.body).toEqual({
    msg: "This save already happened. Refresh to see the current content.",
    msgType: "error",
    code: "save-already-applied",
    saveOutcome: { saveId: "attempt-1", requestHash: FIXTURES.alreadyApplied.inputs.NEXT_HASH, status: "applied" },
  });
  expect(FIXTURES.alreadyApplied.response.body.etag).toBeUndefined();
  expect(FIXTURES.reused.response.status).toBe(409);
  expect(FIXTURES.reused.response.body).toEqual({
    msg: "That save id was already used for a different change.",
    msgType: "error",
    code: "save-id-reused",
  });
  expect(FIXTURES.reused.response.body.saveOutcome).toBeUndefined();
});

// ---------------------------------------------------------------------------
// The B matrix
// ---------------------------------------------------------------------------

test("a proof before the first epoch arms the barrier, and only the read that follows clears it", async () => {
  const name = "hist_noepoch";
  document.body.innerHTML = tag("g", '{"s":0}') + tag(name, '{"n":0}');
  const s = live(name);
  await flushAsync();
  await wait(0);
  expect(fastLane().status.epoch).toBeNull();
  s.add("n", 1);
  const save = await sendCapture();
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  await untilQuery(1);
  expect(pendingIds(name)).toEqual([]);
  expect(refusal()).toBe("save-history-refresh-required");

  // A state that arrives before any read this lane made is not the fresh one.
  const release = gateRead();
  room = newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });
  bridge.streamEvent("data-state", clone(room));
  await wait(10);
  expect(s.status.mode).toBe("file");
  expect(refusal()).toBe("save-history-refresh-required");

  // The first connection reads the room, and that state clears the barrier.
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  release();
  await wait(120);
  expect(s.status.mode).toBe("fast");
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(refusal()).toBeNull();
});

test("a counter saved once after a lost response, a later writer and a room restart", async () => {
  const name = "hist_counter";
  const s = await tab(name);
  s.add("n", 1);
  await flushAsync();
  expect(pendingIds(name)).toEqual([1]);

  const save = await sendCapture();
  expect(tagOf(save.body, name)).toEqual({ text: '{"n":1}', at: null, by: null });
  // A later writer's file is what the room restarted with, before any answer.
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });
  const readsBefore = calls.reads.length;
  const result = await lostAnswer(save);
  const settledAt = calls.saves.at(-1).answeredAt;
  expect(result.ok).toBe(false);
  expect(result.msgType).toBe("error");
  expect(result.saveOutcome).toBeNull();

  // The lookup asks about the exact body's one hash and the ID that carried it.
  expect(await untilQuery(1)).toBe(1);
  expect(calls.queries[0].saveId).toBe(save.sentId());
  expect(calls.queries[0].requestHash).toBe(await sha256Hex(save.body));
  expect(calls.queries[0].requestHash).toMatch(/^[0-9a-f]{64}$/);
  expect(sendingIds(name)).toEqual([1]);

  // The served answer is the recorded hosted body, unchanged except for the
  // identity the host echoes back into saveOutcome.
  expect(calls.historyAnswers).toHaveLength(1);
  expect(calls.historyAnswers[0].case).toBe("applied");
  expect(calls.historyAnswers[0].status).toBe(200);
  expect(calls.historyAnswers[0].body).toEqual({
    ...FIXTURES.applied.response.body,
    document: {
      ...FIXTURES.applied.response.body.document,
      saveOutcome: {
        ...FIXTURES.applied.response.body.document.saveOutcome,
        saveId: save.sentId(),
        requestHash: calls.queries[0].requestHash,
      },
    },
  });

  expect(await untilTaken()).toBeNull();

  // Exactly one save, one historical GET, one fresh room read of the restarted
  // room, and no frame: recovery replays nothing.
  expect(calls.saves).toHaveLength(1);
  expect(calls.queries).toHaveLength(1);
  expect(calls.reads.length - readsBefore).toBe(1);
  expect(posted(name)).toHaveLength(0);
  // The first round is due at 0 ms, before round 1, and the one fresh read follows the proof.
  expect(calls.queries[0].at - settledAt).toBeLessThan(RECOVERY_ROUNDS_MS[1] / SCALE);
  expect(calls.reads.at(-1).at).toBeGreaterThanOrEqual(calls.queries[0].at);
  console.log("counter case (ms after settlement):", JSON.stringify({
    saves: calls.saves.length,
    historicalGets: calls.queries.length,
    freshReads: calls.reads.length - readsBefore,
    frames: posted(name).length,
    query: calls.queries[0].at - settledAt,
    read: calls.reads.at(-1).at - settledAt,
  }));

  // The restarted room is authority; the captured ID retired once and nothing else.
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(pendingIds(name)).toEqual([]);
  expect(sendingIds(name)).toEqual([1]);
  expect(s.status.mode).toBe("fast");
  expect(notices).toEqual([]);
});

test("a list insert saved once after a lost response", async () => {
  const name = "hist_list";
  const s = await tab(name, '{"a":[]}');
  s.update((data) => data.a.push("a"));
  await flushAsync();
  expect(pendingIds(name)).toEqual([1]);

  const save = await sendCapture();
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ a: ["a"] }) });
  const readsBefore = calls.reads.length;
  const result = await lostAnswer(save);
  const settledAt = calls.saves.at(-1).answeredAt;
  expect(result.ok).toBe(false);
  expect(await untilQuery(1)).toBe(1);
  expect(calls.historyAnswers[0].case).toBe("applied");
  expect(calls.historyAnswers[0].body.document.saveOutcome.saveId).toBe(save.sentId());
  expect(calls.historyAnswers[0].body.document.saveOutcome.requestHash).toBe(await sha256Hex(save.body));
  expect(calls.queries[0].requestHash).toMatch(/^[0-9a-f]{64}$/);
  expect(sendingIds(name)).toEqual([1]);

  expect(await untilTaken()).toBeNull();

  // Exactly one insertion: one save, one historical GET, one restarted-room read,
  // and no frame, so the single `a` can never be doubled.
  expect(calls.saves).toHaveLength(1);
  expect(calls.queries).toHaveLength(1);
  expect(calls.reads.length - readsBefore).toBe(1);
  expect(posted(name)).toHaveLength(0);
  expect(calls.queries[0].at - settledAt).toBeLessThan(RECOVERY_ROUNDS_MS[1] / SCALE);
  expect(calls.reads.at(-1).at).toBeGreaterThanOrEqual(calls.queries[0].at);
  console.log("list case (ms after settlement):", JSON.stringify({
    saves: calls.saves.length,
    historicalGets: calls.queries.length,
    freshReads: calls.reads.length - readsBefore,
    frames: posted(name).length,
    query: calls.queries[0].at - settledAt,
    read: calls.reads.at(-1).at - settledAt,
  }));

  expect(s.toJSON()).toEqual({ a: ["a"] });
  expect(pendingIds(name)).toEqual([]);
  expect(sendingIds(name)).toEqual([1]);
});

test("a Restore keeps the current 0 and only the captured ID retires", async () => {
  const name = "hist_restore";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  expect(pendingIds(name)).toEqual([1]);

  // The person puts it back while the answer is missing: a newer operation, not
  // a cancellation of the save that may have landed.
  s.set(["n"], 0);
  await flushAsync();
  expect(pendingIds(name)).toEqual([1, 2]);

  // The file the lost save wrote is what authority holds now.
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });

  expect(await untilTaken()).toBeNull();

  // Authority holds 1; the restore still shows 0, and the old body is not the
  // baseline this tab saves from.
  expect(s.toJSON()).toEqual({ n: 0 });
  expect(pendingIds(name)).toEqual([2]);
  expect(sendingIds(name)).toEqual([1]);
  expect(calls.saves).toHaveLength(1);
  expect(calls.saves[0].body).toContain('"n":1');
});

test("a later Restore keeps the restored value instead of adopting the earlier body", async () => {
  const name = "hist_restore_late";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  // The room the lost save wrote, restarted before any answer.
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });
  // Hold the fresh read open, so the barrier is still owed when the restore lands.
  const release = gateRead();
  historyFixture = FIXTURES.appliedAfterRestore;
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  expect(await untilQuery(1)).toBe(1);

  // The recorded answer is the accepted test's post-restore lookup: the current
  // ETag is the restored bytes' and no receipt is present, while the row still
  // proves the earlier attempt.
  expect(calls.historyAnswers[0].case).toBe("applied-after-restore");
  expect(calls.historyAnswers[0].body.document.etag).toBe(FIXTURES.appliedAfterRestore.inputs.CURRENT_ETAG);
  expect(calls.historyAnswers[0].body.document.saveId).toBeUndefined();
  expect(calls.historyAnswers[0].body.document.saveOutcome.status).toBe("applied");
  expect(pendingIds(name)).toEqual([]);
  expect(refusal()).toBe("save-history-refresh-required");

  // The person restores the value while the fresh read is still owed.
  s.set(["n"], 0);
  await flushAsync();
  expect(pendingIds(name)).toEqual([2]);

  release();
  expect(await untilTaken()).toBeNull();

  // The restored 0 stands: the earlier body is not adopted as this tab's value,
  // the captured attempt is never sent again, and no frame replays it.
  expect(s.toJSON()).toEqual({ n: 0 });
  expect(pendingIds(name)).toEqual([2]);
  expect(sendingIds(name)).toEqual([1]);
  expect(calls.saves).toHaveLength(1);
  expect(calls.saves[0].body).toContain('"n":1');
  expect(calls.queries).toHaveLength(1);
  // The newer edit goes to the room once, as its own operation, after the fresh
  // read: the earlier body is never sent again and never becomes the value.
  expect(await untilPosted(name)).toBe(1);
  expect(posted(name)[0].frame.ops).toEqual([{ op: "set", path: ["n"], value: 0 }]);
  expect(posted(name)[0].at).toBeGreaterThanOrEqual(calls.reads.at(-1).at);
  console.log("later Restore case:", JSON.stringify({
    saves: calls.saves.length,
    historicalGets: calls.queries.length,
    frames: posted(name).length,
    retired: [1],
    retained: pendingIds(name),
  }));
  // The only notices are the refusals this test itself asked for.
  expect(notices.filter((notice) => notice.code !== "save-history-pending")).toEqual([]);
});

test("a newer local operation and a peer edit survive the proof", async () => {
  const name = "hist_newer";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  // The room holds the file the lost save wrote, an unrelated peer edit, and no
  // trace of the newer local operation.
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1, m: 0, peer: 1 }) });
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);

  // B, made while the answer is missing, and an unrelated peer edit.
  s.add("m", 1);
  await flushAsync();
  expect(pendingIds(name)).toEqual([1, 2]);

  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([2]);
  expect(s.toJSON()).toEqual({ n: 1, m: 1, peer: 1 });
  await wait(120);
  expect(posted(name)).toHaveLength(1);
  expect(posted(name)[0].frame.ops).toEqual([{ op: "add", path: ["m"], n: 1 }]);
});

test("an inverse operation made during uncertainty survives proof with peer edits", async () => {
  const name = "hist_inverse";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1, peer: 7 }) });
  let releaseHistory;
  historyGate = new Promise((resolve) => { releaseHistory = resolve; });
  await lostAnswer(save);
  expect(await untilQuery(1)).toBe(1);

  s.add("n", -1);
  expect(pendingIds(name)).toEqual([1, 2]);
  releaseHistory();
  historyGate = null;
  expect(await untilTaken()).toBeNull();

  expect(pendingIds(name)).toEqual([2]);
  expect(s.toJSON()).toEqual({ n: 0, peer: 7 });
  expect(await untilPosted(name)).toBe(1);
  expect(posted(name)[0].frame.ops).toEqual([{ op: "add", path: ["n"], n: -1 }]);
  expect(calls.saves).toHaveLength(1);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toEqual([]);
});

test("a capture whose store has no live-by still binds its exact IDs", async () => {
  const name = "hist_noliveby";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });
  expect(tagOf(save.body, name).by).toBeNull();
  expect(tagOf(save.body, name).at).toBeNull();

  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  expect(await untilQuery(1)).toBe(1);
  expect(calls.queries[0].requestHash).toBe(await sha256Hex(save.body));

  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([]);
  expect(s.toJSON()).toEqual({ n: 1 });
});

test("a stamped file-mode capture reaches historical proof", async () => {
  const name = "hist_stamped";
  const original = '{"n":0}';
  const s = await tab(name, original, stampOf("e0", 3, original));
  s.add("n", 1);
  const save = await sendCapture();
  expect(tagOf(save.body, name).at).not.toBeNull();
  expect(tagOf(save.body, name).by).not.toBeNull();
  expect(sendingIds(name)).toEqual([1]);

  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });
  await lostAnswer(save);
  expect(await untilQuery(1)).toBe(1);
  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([]);
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(calls.saves).toHaveLength(1);
});

test("an authored handler that changes the captured tag excludes the store from history", async () => {
  const name = "hist_authored";
  const s = await tab(name);
  s.add("n", 1);
  document
    .querySelector(`script[merge="${name}"]`)
    .setAttribute("onbeforesave", "this.textContent = JSON.stringify({n: 9})");

  const save = await sendCapture();
  expect(tagOf(save.body, name).text).toBe('{"n":9}');
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);

  await wait(60);
  // Nothing to ask about: the body no longer holds what the capture pinned.
  expect(calls.queries).toEqual([]);
  expect(pendingIds(name)).toEqual([]);
  expect(notices.filter((notice) => notice.name === name).map((notice) => notice.code)).toEqual(["save-uncertain"]);
});

test("a newer unsent capture while another is on the wire is not the one that settles", async () => {
  const name = "hist_unsent";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1, m: 0 }) });
  expect(calls.saves).toHaveLength(1);

  s.add("m", 1);
  const second = snapshot.captureForSaveAndComparison({ flushUndo: false });
  expect(second.captureId).not.toBe(save.capture.captureId);

  let openPost;
  postGate = new Promise((resolve) => { openPost = resolve; });
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  expect(await untilQuery(1)).toBe(1);
  expect(calls.queries[0].saveId).toBe(save.sentId());
  expect(sendingIds(name)).toEqual([1]);

  expect(await untilTaken()).toBeNull();

  // Only the wire capture's operation retired; the newer one is still pending.
  expect(pendingIds(name)).toEqual([2]);
  expect(s.toJSON()).toEqual({ n: 1, m: 1 });
  expect(calls.saves).toHaveLength(1);
  postGate = null;
  openPost();
  await untilPosted(name, 1);
  expect(posted(name)[0].frame.ops).toEqual([{ op: "add", path: ["m"], n: 1 }]);
});

test("both IDs of one logical save are asked about, and either positive settles once", async () => {
  const name = "hist_retry";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  const firstId = save.sentId();

  // A 412 naming this tab's own id: the late-duplicate recovery mints a second
  // ID and sends the same body again, and that second answer is lost.
  saveAnswer = (count, init) =>
    count === 1
      ? { status: 412, body: { msg: "conflict", code: "conflict", saveId: init.headers["Save-ID"], etag: "peer-1" } }
      : { status: 502, body: null };
  // Only the second attempt may have landed, so only its answer is positive.
  historyForId = new Map([[firstId, FIXTURES.unknown]]);
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });
  const result = await save.answer();
  expect(result.ok).toBe(false);
  expect(calls.saves).toHaveLength(2);
  const ids = calls.saves.map((call) => call.headers["Save-ID"]);
  expect(new Set(ids).size).toBe(2);
  expect(calls.saves[0].body).toBe(calls.saves[1].body);
  expect(firstId).toBe(ids[0]);

  await wait(60);
  expect(calls.queries.map((query) => query.saveId).slice(0, 2)).toEqual(ids);
  expect(new Set(calls.queries.map((query) => query.requestHash))).toEqual(new Set([await sha256Hex(save.body)]));
  // The first attempt is answered from the recorded unknown row, the second from
  // the recorded applied one.
  expect(calls.historyAnswers.slice(0, 2).map((answer) => answer.case)).toEqual(["unknown", "applied"]);
  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([]);
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(calls.saves).toHaveLength(2);
});

test("a matching 409 saveOutcome proves the attempt with no GET at all", async () => {
  const name = "hist_409";
  const s = await tab(name);
  s.add("n", 1);
  saveFixture = FIXTURES.alreadyApplied;
  const save = await sendCapture();
  const sentId = save.sentId();
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) });

  const result = await save.answer();
  expect(result.ok).toBe(false);
  expect(result.code).toBe("save-already-applied");
  expect(result.status).toBe(409);
  expect(result.saveOutcome).toEqual({ saveId: sentId, requestHash: await sha256Hex(save.body), status: "applied" });

  await wait(60);
  expect(calls.queries).toEqual([]);
  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([]);
  expect(posted(name)).toEqual([]);
  expect(calls.saves).toHaveLength(1);
  expect(s.toJSON()).toEqual({ n: 1 });
});

test("a reused save id with a different body is refused and settles nothing", async () => {
  const name = "hist_reused";
  const s = await tab(name);
  s.add("n", 1);
  // The recorded 409 for an id this document already recorded against other bytes.
  saveFixture = FIXTURES.reused;
  const save = await sendCapture();
  const sentId = save.sentId();

  const result = await save.answer();
  expect(result.ok).toBe(false);
  expect(result.code).toBe("save-id-reused");
  expect(result.status).toBe(409);
  // No outcome at all, so nothing here can be read as proof the attempt landed.
  expect(result.saveOutcome).toBeNull();

  await wait(60);
  // A pre-commit refusal is not a historical question: no query, nothing retired,
  // the edit still pending and unsent.
  expect(calls.queries).toEqual([]);
  expect(calls.historyAnswers).toEqual([]);
  expect(pendingIds(name)).toEqual([1]);
  expect(sendingIds(name)).toEqual([1]);
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(calls.saves).toHaveLength(1);
  expect(calls.saves[0].headers["Save-ID"]).toBe(sentId);
  expect(posted(name)).toEqual([]);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toEqual([]);
});

test("a mismatching 409 saveOutcome settles nothing and the window runs on", async () => {
  const name = "hist_409bad";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  const sentId = save.sentId();

  // The recorded answers served untouched: the duplicate's id and hash belong to
  // the accepted test's attempt, and every follow-up lookup is answered with the
  // recorded applied row for that same other attempt. Neither identity nor hash
  // matches this one, so nothing here can settle it.
  saveFixture = FIXTURES.alreadyApplied;
  saveEcho = false;
  historyFixture = FIXTURES.applied;
  historyEcho = false;
  const result = await save.answer();
  expect(result.ok).toBe(false);
  expect(result.code).toBe("save-already-applied");
  expect(result.saveOutcome).toEqual(FIXTURES.alreadyApplied.response.body.saveOutcome);
  expect(result.saveOutcome.saveId).not.toBe(sentId);
  await wait(40);
  expect(calls.queries.length).toBeGreaterThanOrEqual(1);
  expect(calls.queries[0].saveId).toBe(sentId);
  expect(calls.queries[0].requestHash).toBe(await sha256Hex(save.body));
  expect(calls.historyAnswers[0].case).toBe("applied");
  expect(calls.historyAnswers[0].body).toEqual(FIXTURES.applied.response.body);
  expect(calls.historyAnswers[0].body.document.saveOutcome.saveId).not.toBe(sentId);
  expect(calls.historyAnswers[0].body.document.saveOutcome.requestHash).not.toBe(calls.queries[0].requestHash);
  expect(pendingIds(name)).toEqual([1]);

  // The window still ends at its original deadline, with the one uncertainty.
  await wait(500);
  expect(calls.queries).toHaveLength(3);
  expect(pendingIds(name)).toEqual([]);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toHaveLength(1);
});

test("unknown answers run the whole six-query window and then the existing uncertainty", async () => {
  const name = "hist_unknown";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  saveAnswer = (count, init) =>
    count === 1
      ? { status: 412, body: { msg: "conflict", code: "conflict", saveId: init.headers["Save-ID"], etag: "peer-1" } }
      : { status: 502, body: null };
  historyFixture = FIXTURES.unknown;
  const result = await save.answer();
  expect(result.ok).toBe(false);
  const ids = calls.saves.map((call) => call.headers["Save-ID"]);
  expect(ids).toHaveLength(2);

  // Round 0 runs as the last answer lands; later rounds are timed from it.
  await until(() => calls.queries.length >= 6);
  await wait(150);
  expect(calls.queries[0].at - calls.saves.at(-1).answeredAt).toBeLessThan(RECOVERY_ROUNDS_MS[1] / SCALE);
  const times = calls.queries.map((query) => query.at - calls.queries[0].at);
  expect(calls.queries).toHaveLength(6);
  expect(new Set(calls.historyAnswers.map((answer) => answer.case))).toEqual(new Set(["unknown"]));
  expect(calls.queries.map((query) => query.saveId)).toEqual([ids[0], ids[1], ids[0], ids[1], ids[0], ids[1]]);
  expect(times[2]).toBeGreaterThanOrEqual(70);
  expect(times[2]).toBeLessThan(170);
  expect(times[4]).toBeGreaterThanOrEqual(240);
  expect(times[4]).toBeLessThan(400);
  expect(Math.max(...times)).toBeLessThan(450);
  console.log("six-query window (ms from the first lookup):", times.join(", "));

  await wait(200);
  expect(calls.queries).toHaveLength(6);
  expect(pendingIds(name)).toEqual([]);
  expect(posted(name)).toEqual([]);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toHaveLength(1);
});

test("while the lookup is open a state cannot give the operations up, and a save is refused", async () => {
  const name = "hist_hold";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  historyGate = new Promise(() => {});
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  expect(await untilQuery(1)).toBe(1);
  expect(pendingIds(name)).toEqual([1]);

  expect(() => receiveFrame(tag(name, '{"n":0}'))).not.toThrow();
  expect(pendingIds(name)).toEqual([1]);

  // A state that cannot show the captured frame, while the answer is still open.
  bridge.streamEvent("data-state", clone(newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) })));
  await flushAsync();
  expect(pendingIds(name)).toEqual([1]);
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(notices).toEqual([]);
  expect(checkpointDeps.blocked()).toBe(true);
  expect(refusal()).toBe("save-history-pending");

  const before = calls.saves.length;
  // The capture is refused before any request: the same shape a host-refused
  // capture gets, with no ok and the refusal's own message.
  const refused = await savePageForce();
  expect(refused.msgType).toBe("error");
  expect(refused.msg).toContain("must be checked");
  expect(calls.saves).toHaveLength(before);
  // One notice for each refused capture: the direct one above, and this save.
  expect(notices.filter((notice) => notice.code === "save-history-pending")).toHaveLength(2);

  // The answer arrives: the captured ID retires and the fresh read is required.
  historyFixture = FIXTURES.applied;
  historyGate = null;
  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([]);
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(checkpointDeps.blocked()).toBe(false);
});

test("a read begun before the proof cannot clear the barrier, and neither can an unsolicited frame", async () => {
  const name = "hist_stale";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();

  // A read that began before the proof holds a value that is no longer authority.
  const release = gateRead({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 99 }) });
  fastLane().refresh();
  await flushAsync();
  expect(calls.reads.length).toBeGreaterThan(0);
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 7 }) });

  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  expect(await untilQuery(1)).toBe(1);

  // That read cannot clear the barrier (99 is not authority), and saved HTML is
  // not the fresh read either. The store holds the proven saved value meanwhile.
  expect(s.toJSON()).toEqual({ n: 1 });
  receiveFrame(tag(name, '{"n": 5}', "e1:1:abcdef"), 1);
  await flushAsync();
  expect(s.toJSON()).toEqual({ n: 1 });
  expect(refusal()).toBe("save-history-refresh-required");

  // The read that follows the proof is the one that counts.
  release();
  expect(await untilTaken()).toBeNull();
  expect(s.toJSON()).toEqual({ n: 7 });
  expect(pendingIds(name)).toEqual([]);
});

test("a refused fresh read keeps the barrier, reports it once, and a later read clears it", async () => {
  const name = "hist_busy";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  // The room has no capacity for this document now.
  readAnswer = () => answer(503, { code: "busy" }, { "retry-after": "0" });
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  await untilQuery(1);
  await wait(60);
  expect(pendingIds(name)).toEqual([]);
  expect(refusal()).toBe("save-history-refresh-required");
  expect(s.status.mode).toBe("file");

  await untilNotice("save-history-refresh-required");
  expect(notices.filter((notice) => notice.code === "save-history-refresh-required")).toHaveLength(1);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toEqual([]);

  // The room answers again: the read clears the barrier, and only newer edits go.
  let openPost;
  postGate = new Promise((resolve) => { openPost = resolve; });
  readAnswer = null;
  s.add("m", 1);
  expect(refusal()).toBe("save-history-refresh-required");
  bridge.streamEvent("data-state", clone(newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1 }) })));
  expect(await untilTaken()).toBeNull();
  expect(s.status.mode).toBe("fast");
  expect(pendingIds(name)).toEqual([2]);
  expect(s.toJSON()).toEqual({ n: 1, m: 1 });
  postGate = null;
  openPost();
  await untilPosted(name, 1);
  expect(posted(name)).toHaveLength(1);
  expect(calls.saves).toHaveLength(1);
});

test("a fresh read whose room does not hold the store leaves the file as its authority", async () => {
  const name = "hist_absent";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  // The host left this store out of the room (its capacity), so no room read can ever carry it.
  newRoom({ g: roomStore({ s: 0 }) });
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  await untilQuery(1);
  await wait(120);
  expect(pendingIds(name)).toEqual([]);
  expect(refusal()).toBeNull();
  expect(s.status.mode).toBe("file");
  await wait(400);
  expect(notices.filter((notice) => notice.code === "save-history-refresh-required")).toEqual([]);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toEqual([]);

  // A newer edit saves through the file again, and the proven edit is not sent twice.
  s.add("m", 1);
  expect(pendingIds(name)).toEqual([2]);
  const saved = await savePageForce();
  expect(saved.code).not.toBe("save-history-refresh-required");
  expect(calls.saves).toHaveLength(2);
  expect(JSON.parse(tagOf(calls.saves[1].body, name).text)).toEqual({ n: 1, m: 1 });
  expect(posted(name)).toEqual([]);
});

test("a later save while the fresh read is refused requests one more read and reports refresh required", async () => {
  const name = "hist_explicit";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  readAnswer = () => answer(503, { code: "busy" }, { "retry-after": "0" });
  await lostAnswer(save);
  await untilQuery(1);
  await wait(120);
  expect(refusal()).toBe("save-history-refresh-required");
  s.add("m", 1);
  expect(pendingIds(name)).toEqual([2]);

  readAnswer = null;
  newRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 1, m: 0 }) });
  const readsBefore = calls.reads.length;
  const refused = await savePageForce();
  expect(refused.code).toBe("save-history-refresh-required");
  expect(calls.reads.length).toBe(readsBefore + 1);
  expect(calls.saves).toHaveLength(1);

  expect(await untilTaken()).toBeNull();
  expect(pendingIds(name)).toEqual([2]);
  expect(s.toJSON()).toEqual({ n: 1, m: 1 });
  expect(await untilPosted(name)).toBe(1);
  expect(posted(name)[0].frame.ops).toEqual([{ op: "add", path: ["m"], n: 1 }]);
});

test("a fast-mode capture has no file-mode ID to settle", async () => {
  const name = "hist_fast";
  document.body.innerHTML = tag("g", '{"s":0}') + tag(name, '{"n":0}');
  const s = live(name);
  await flushAsync();
  bridge.streamOpened({ clientId: "tab-1", lane: "live" });
  await flushAsync();
  await joinRoom({ g: roomStore({ s: 0 }), [name]: roomStore({ n: 0 }) });
  expect(s.status.mode).toBe("fast");
  s.add("n", 1);
  await flushAsync();

  const save = await sendCapture();
  expect(tagOf(save.body, name).text).toBe('{"n":0}');
  const result = await lostAnswer(save);
  expect(result.ok).toBe(false);
  await wait(60);
  expect(calls.queries).toEqual([]);
  expect(pendingIds(name)).toEqual([1]);
  expect(notices).toEqual([]);
  expect(refusal()).toBeNull();
  expect(calls.saves).toHaveLength(1);
});

test("a lane that stops mid-lookup gives nothing up early and does not restart the deadline", async () => {
  const name = "hist_stopped";
  const s = await tab(name);
  s.add("n", 1);
  const save = await sendCapture();
  historyFixture = FIXTURES.unknown;
  saveAnswer = (count, init) =>
    count === 1
      ? { status: 412, body: { msg: "conflict", code: "conflict", saveId: init.headers["Save-ID"], etag: "peer-1" } }
      : { status: 502, body: null };
  const result = await save.answer();
  expect(result.ok).toBe(false);
  await untilQuery(1);

  fastLane().stop();
  await flushAsync();
  expect(fastLane().status.stopped).toBe(true);
  expect(pendingIds(name)).toEqual([1]);
  expect(notices).toEqual([]);

  await until(() => pendingIds(name).length === 0 && notices.some((notice) => notice.code === "save-uncertain"));
  const times = calls.queries.map((query) => query.at);
  expect(calls.queries).toHaveLength(6);
  expect(Math.max(...times) - times[0]).toBeLessThan(RECOVERY_WINDOW_MS / SCALE);
  expect(pendingIds(name)).toEqual([]);
  expect(posted(name)).toEqual([]);
  expect(notices.filter((notice) => notice.code === "save-uncertain")).toHaveLength(1);
  console.log("stopped-lane window (ms from the first lookup):", times.map((at) => at - times[0]).join(", "));
});
