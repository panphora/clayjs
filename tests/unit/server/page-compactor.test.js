/**
 * @jest-environment node
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createRooms, COMPACTION, createPageCompactor } from "../../../src/server/rooms/index.js";

const doc = (...parts) => `<!doctype html><html><body>${parts.join("")}</body></html>`;
const pageTag = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;

let clients = 100;
const insert = (text, client = (clients += 1)) => {
  const d = new Y.Doc();
  d.clientID = client;
  d.getText("flow").insert(0, text);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(d));
  d.destroy();
  return encoded;
};

let keys = 0;
const nextKey = () => `u1-a-${(++keys).toString(36)}`;
const setOp = (key, value) => ({ op: "set", path: ["y", key], value });
const seed = (text = "seed") => insert(text, 900);
const html = ({ g = 0, text = "seed" } = {}) => doc(pageTag({ v: 1, g, y: { seed: seed(text) } }));

const clock = () => {
  const state = { now: 1_000_000, epoch: 0 };
  return {
    state,
    rooms: (options = {}) => createRooms({ now: () => state.now, newEpoch: () => `e${++state.epoch}`, ...options }),
  };
};

const open = (rooms) => rooms.open("/p.html", html(), { nodeId: "n1" });

const frame = (room, n, ops, over = {}) => ({
  name: "page",
  epoch: room.epoch,
  n,
  pageGeneration: room.pageTransition.id,
  compaction: 1,
  ops,
  ...over,
});

const send = (rooms, room, n, pairs, over = {}) =>
  rooms.apply(room, "a", frame(room, n, pairs.map(([key, value]) => setOp(key, value)), over));

const fill = (rooms, room, count, start = 1) => {
  let n = start;
  let left = count;
  while (left > 0) {
    const take = Math.min(4, left);
    const pairs = [];
    for (let i = 0; i < take; i++) pairs.push([nextKey(), insert(`batched ${left}-${i}`)]);
    expect(send(rooms, room, n++, pairs).ops).toHaveLength(take);
    left -= take;
  }
  return n;
};

const overBound = (rooms, room, n) => {
  const keys = Object.keys(room.stores.get("page").value.y);
  const answer = send(rooms, room, n, [[nextKey(), insert("over the bound")]]);
  expect(answer.error).toBe("checkpoint-required");
  return keys;
};

const compactors = [];
const compactorOf = (options) => {
  const compactor = createPageCompactor(options);
  compactors.push(compactor);
  return compactor;
};

afterEach(async () => {
  await Promise.all(compactors.splice(0).map((compactor) => compactor.close()));
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

const until = async (predicate, label) => {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
};

// A real worker whose messages the test delivers by hand, so a job can be held open.
const heldWorker = () => {
  const state = { message: null, handler: null, reached: null };
  const reached = new Promise((resolve) => { state.reached = resolve; });
  class Held extends Worker {
    on(type, handler) {
      if (type !== "message") return super.on(type, handler);
      return super.on("message", (message) => {
        state.handler = handler;
        state.message = message;
        state.reached();
      });
    }
  }
  return { Held, state, reached };
};

class Silent {
  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    this.sent = [];
    this.terminated = 0;
    Silent.instances.push(this);
  }
  static instances = [];
  unref() {}
  on(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
    return this;
  }
  postMessage(message) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated += 1;
    return Promise.resolve(0);
  }
}

class Failing extends Silent {
  postMessage(message) {
    super.postMessage(message);
    queueMicrotask(() => {
      for (const handler of this.listeners.get("message") ?? []) handler({ id: message.id, failure: "invalid-update" });
    });
  }
}

const timerQueue = () => {
  const entries = [];
  return {
    entries,
    setTimer: (fn, ms) => {
      const entry = { fn, ms };
      entries.push(entry);
      return entry;
    },
    clearTimer: (entry) => {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
    },
  };
};

test("a due room's job runs in the worker, commits, and onCommit hears the answer", async () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const next = fill(rooms, room, COMPACTION.loose);
  const commits = [];
  let answer = null;
  const committed = new Promise((resolve) => { answer = resolve; });
  const compactor = compactorOf({
    rooms,
    onCommit: (target, result) => { commits.push([target, result]); answer(result); },
  });

  const before = overBound(rooms, room, next);
  const result = await committed;

  expect(commits).toHaveLength(1);
  expect(commits[0][0]).toBe(room);
  expect(result.from).toBe("compactor");
  expect(result.kind).toBe("tail");
  expect(typeof result.seq).toBe("number");
  expect(Array.isArray(result.ops)).toBe(true);
  expect(result.ops.filter((op) => op.op === "del").every((op) => before.includes(op.path[1]))).toBe(true);
  expect(room.compaction.job).toBeNull();
  expect(compactor.running).toBe(false);
  expect(Object.keys(room.stores.get("page").value.y).filter((key) => key.startsWith("t"))).toHaveLength(1);
  await compactor.close();
});

test("a room reset while the job runs refuses the commit and changes nothing", async () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const next = fill(rooms, room, COMPACTION.loose);

  const asked = [];
  const commit = rooms.commitCompaction;
  rooms.commitCompaction = (token, result) => {
    const answer = commit(token, result);
    asked.push(answer);
    return answer;
  };
  const commits = [];
  const { Held, state, reached } = heldWorker();
  const compactor = compactorOf({ rooms, onCommit: (target, result) => commits.push(result), WorkerClass: Held });

  expect(send(rooms, room, next, [[nextKey(), insert("over the bound")]]).error).toBe("checkpoint-required");
  await reached;
  expect(room.compaction.job).not.toBeNull();

  const reset = rooms.reset("/p.html", html({ g: 5 }), { nodeId: "n1" });
  const snapshot = JSON.stringify({ value: reset.stores.get("page").value, seq: reset.seq, log: reset.stores.get("page").log });
  state.handler(state.message);
  await flush();

  expect(asked).toEqual([{ refused: "stale-token" }]);
  expect(commits).toEqual([]);
  expect(JSON.stringify({ value: reset.stores.get("page").value, seq: reset.seq, log: reset.stores.get("page").log })).toBe(snapshot);
  expect(reset.compaction.failed).toBeNull();
  await compactor.close();
});

test("a worker that never answers times out, abandons the job and retries after 1, 5 and 30 s", async () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const next = fill(rooms, room, COMPACTION.loose);
  const used = rooms.used();
  Silent.instances = [];
  const timers = timerQueue();
  const compactor = compactorOf({
    rooms,
    WorkerClass: Silent,
    timeoutMs: 30000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  expect(send(rooms, room, next, [[nextKey(), insert("over the bound")]]).error).toBe("checkpoint-required");
  await flush();
  expect(room.compaction.job).not.toBeNull();
  expect(room.compaction.fence).toBe(1);
  expect(Silent.instances).toHaveLength(1);
  expect(Silent.instances[0].sent).toHaveLength(1);
  expect(Silent.instances[0].sent[0].sources.length).toBeGreaterThan(1);
  expect(timers.entries.map((entry) => entry.ms)).toEqual([30000]);

  const fence = room.compaction.fence;
  const waits = [1000, 5000, 30000];
  for (let attempt = 0; attempt < waits.length; attempt++) {
    const wait = waits[attempt];
    timers.entries.shift().fn();
    expect(room.compaction.job).toBeNull();
    expect(rooms.used()).toBe(used);
    expect(timers.entries.map((entry) => entry.ms)).toEqual([wait]);

    timers.entries.shift().fn();
    await flush();
    expect(room.compaction.job).not.toBeNull();
    expect(room.compaction.fence).toBe(fence + attempt + 1);
    expect(timers.entries.map((entry) => entry.ms)).toEqual([30000]);
  }
  expect(Silent.instances).toHaveLength(4);
  expect(Silent.instances[0].terminated).toBe(1);

  timers.entries.shift().fn();
  expect(room.compaction.job).toBeNull();
  expect(room.compaction.failed).toMatchObject({ reason: "crashed" });
  expect(rooms.used()).toBe(used);

  await compactor.close();
});

test("a failure result marks the room failed, and the next admission gets compaction-failed", async () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const next = fill(rooms, room, COMPACTION.loose);
  const commits = [];
  const compactor = compactorOf({ rooms, WorkerClass: Failing, onCommit: (target, result) => commits.push(result) });

  expect(send(rooms, room, next, [[nextKey(), insert("over the bound")]]).error).toBe("checkpoint-required");
  await flush();
  await flush();

  expect(room.compaction.failed).toMatchObject({ reason: "invalid-update" });
  expect(commits).toEqual([]);
  expect(room.compaction.job).toBeNull();

  const snapshot = JSON.stringify({ value: room.stores.get("page").value, seq: room.seq });
  const refused = send(rooms, room, next + 1, [[nextKey(), insert("after the failure")]]);
  expect(refused.error).toBe("compaction-failed");
  expect(JSON.stringify({ value: room.stores.get("page").value, seq: room.seq })).toBe(snapshot);
  expect(rooms.beginCompaction(room)).toBeNull();
  await compactor.close();
});

test("close ends the worker, and the room's held job is released with it", async () => {
  const c = clock();
  const rooms = c.rooms({ compaction: true });
  const room = open(rooms);
  const next = fill(rooms, room, COMPACTION.loose);
  const used = rooms.used();
  const { Held, reached } = heldWorker();
  const timers = timerQueue();
  const compactor = compactorOf({ rooms, WorkerClass: Held, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  expect(send(rooms, room, next, [[nextKey(), insert("over the bound")]]).error).toBe("checkpoint-required");
  await reached;
  expect(room.compaction.job).not.toBeNull();
  expect(compactor.running).toBe(true);

  await compactor.close();
  await until(() => room.compaction.job === null, "the exited worker's job to be abandoned");
  expect(rooms.used()).toBe(used);
  await flush();
  expect(room.compaction.job).toBeNull();
});

const builtEntry = fileURLToPath(new URL("../../../dist/server/rooms.cjs", import.meta.url));
const hasBuilt = existsSync(builtEntry);
const buildTest = hasBuilt ? test : test.skip;

const workerJob = `
  const arg = JSON.parse(process.argv[1]);
  const { createRooms, createPageCompactor } = require(arg.entry);
  const rooms = createRooms({ compaction: true });
  const room = rooms.open("/p.html", arg.html, { nodeId: "n1" });
  const frame = (n, ops) => ({ name: "page", epoch: room.epoch, n, pageGeneration: room.pageTransition.id, compaction: 1, ops });
  let n = 1;
  for (let i = 0; i < arg.values.length; i += 4) {
    const ops = arg.values.slice(i, i + 4).map((value, j) => ({ op: "set", path: ["y", "u1-a-" + (i + j).toString(36)], value }));
    const answer = rooms.apply(room, "a", frame(n++, ops));
    if (!answer.ops || answer.ops.length !== ops.length) throw new Error("the room refused a frame: " + JSON.stringify(answer));
  }
  let committed = null;
  const compactor = createPageCompactor({ rooms, onCommit: (target, answer) => { committed = answer; } });
  const refused = rooms.apply(room, "a", frame(n, [{ op: "set", path: ["y", "u1-a-over"], value: arg.values[0] }]));
  if (refused.error !== "checkpoint-required") throw new Error("expected checkpoint-required, got " + JSON.stringify(refused));
  const deadline = Date.now() + 15000;
  const settle = async () => {
    while (!committed) {
      if (Date.now() > deadline) throw new Error("the bundled worker never committed");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const keys = Object.keys(room.stores.get("page").value.y);
    console.log(JSON.stringify({ from: committed.from, seq: committed.seq, kind: committed.kind, ops: committed.ops.length,
      tails: keys.filter((key) => key.startsWith("t")), loose: room.compaction.retired.size, job: room.compaction.job }));
    await compactor.close();
  };
  settle().catch((error) => { console.error(error); process.exit(1); });
`;

buildTest(hasBuilt
  ? "the built rooms entry's compactor runs one job end to end in its bundled worker"
  : "the built rooms entry's compactor runs one job end to end in its bundled worker (skipped: no dist/server/rooms.cjs; run node build.js)", () => {
  const values = Array.from({ length: COMPACTION.loose }, (_, i) => insert(`batched ${i}`));
  const run = spawnSync(process.execPath, ["-e", workerJob, JSON.stringify({ entry: builtEntry, html: html(), values })],
    { encoding: "utf8", timeout: 30000 });
  expect(run.status).toBe(0);
  expect(run.stderr).not.toMatch(/Yjs was already imported/);

  const result = JSON.parse(run.stdout);
  expect(result.from).toBe("compactor");
  expect(result.seq).toBeGreaterThan(0);
  expect(result.kind).toBe("tail");
  expect(result.ops).toBeGreaterThan(COMPACTION.loose);
  expect(result.tails).toHaveLength(1);
  expect(result.loose).toBe(COMPACTION.loose);
  expect(result.job).toBeNull();
});
