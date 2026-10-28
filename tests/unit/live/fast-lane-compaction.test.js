import { readFileSync } from "node:fs";
import * as Y from "../../../src/vendor/yjs.vendor.js";
import { createRooms, ROOM_ERROR_STATUS } from "../../../src/server/rooms/index.js";
import { buildCandidate } from "../../../src/server/rooms/page-compaction.js";
import { createStore } from "../../../src/live/store.js";
import { cloneJson } from "../../../src/live/ops.js";
import { createFastLane, RETRY_MS } from "../../../src/live/fast-lane.js";
import { fetchLiveState } from "../../../src/live/server-lane.js";

const TEMPLATE = new URL("../../fixtures/ypage-template.html", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let clients = 900;
const insert = (text, client = (clients += 1)) => {
  const d = new Y.Doc();
  d.clientID = client;
  d.getText("flow").insert(0, text);
  const encoded = Y.toBase64(Y.encodeStateAsUpdateV2(d));
  d.destroy();
  return encoded;
};
const setOp = (key, value) => ({ op: "set", path: ["y", key], value });

const open = (rooms) => rooms.open("doc", readFileSync(TEMPLATE, "utf8"), { nodeId: 1 });

const answerOf = (body) =>
  body.error ? { status: ROOM_ERROR_STATUS[body.error] ?? 409, body: { code: body.error } } : { status: 200, body };

// A transport over the real room, shaped like the host: a read declares the
// capability the way the query parameter does, a send applies the frame.
function tab(rooms, room, { declare = 1, strip = false } = {}) {
  const page = createStore({ name: "page", value: cloneJson(room.stores.get("page").value) });
  const entries = new Map([["page", { store: page }]]);
  const events = [];
  const sends = [];
  let handlers;
  const transport = {
    start(h) {
      handlers = h;
      return () => {};
    },
    fetchState: async (clientId, since) => cloneJson(rooms.state(room, clientId, since ?? null, { compaction: declare })),
    send: async (clientId, frame) => {
      const sent = strip ? Object.fromEntries(Object.entries(frame).filter(([key]) => key !== "compaction")) : frame;
      const answer = answerOf(rooms.apply(room, clientId, sent));
      sends.push({ at: Date.now(), frame: cloneJson(frame), sent: cloneJson(sent), answer });
      return answer;
    },
  };
  const lane = createFastLane({ entries, transport });
  page.onLocal((ops) => lane.local("page", ops, page.mark));
  page.onDelivery((event) => events.push(event));
  return { page, lane, handlers: () => handlers, events, sends };
}

const join = async (t) => {
  t.lane.start();
  t.handlers().open({ clientId: "a" });
  await sleep(20);
  expect(t.lane.status.synced).toBe(true);
};

// The compactor runs in a worker; these tests drive a job by hand so its timing
// is theirs. Same calls the compactor makes: begin, build, commit, broadcast.
const compact = (rooms, room, options = {}) => {
  const begun = rooms.beginCompaction(room, options);
  expect(begun).not.toBeNull();
  const answer = rooms.commitCompaction(begun.token, buildCandidate({ kind: begun.kind, sources: begun.sources }));
  expect(answer.refused).toBeUndefined();
  return answer;
};

test("a checkpoint-required frame is retried as soon as the compactor's frame arrives", async () => {
  const rooms = createRooms({ compaction: true });
  const room = open(rooms);
  let n = 0;
  for (let i = 1; i <= 32; i += 4) {
    const ops = [];
    for (let j = 0; j < 4; j++) ops.push(setOp(`u2-a-${(i + j).toString(36)}`, insert(`fill ${i + j}`)));
    expect(rooms.apply(room, "b", { name: "page", n: ++n, epoch: room.epoch, pageGeneration: room.pageTransition.id, compaction: 1, ops }).ops).toHaveLength(4);
  }

  const t = tab(rooms, room);
  await join(t);
  expect(t.page.handle.status.mode).toBe("fast");

  const refusedAt = Date.now();
  t.page.handle.set(["y", "u1-a-new"], insert("new text"));
  await sleep(80);
  const refused = t.sends.filter((s) => s.answer.status === 503);
  expect(refused).toHaveLength(1);
  expect(refused[0].frame.compaction).toBe(1);
  expect(refused[0].answer.body.code).toBe("checkpoint-required");
  expect(t.events.filter((e) => e.phase === "retry").map((e) => e.code)).toEqual(["checkpoint-required"]);
  expect(Object.hasOwn(room.stores.get("page").value.y, "u1-a-new")).toBe(false);

  const frame = cloneJson(compact(rooms, room));
  expect(frame.from).toBe("compactor");
  const frameAt = Date.now();
  t.handlers().frame(frame);
  await sleep(250);

  const retried = t.sends.filter((s) => s.frame.n === refused[0].frame.n && s.answer.status === 200);
  expect(retried).toHaveLength(1);
  expect(retried[0].frame.ops).toEqual(refused[0].frame.ops);
  // After the compactor's frame, and well before the backoff a 503 starts.
  expect(retried[0].at).toBeGreaterThanOrEqual(frameAt);
  expect(retried[0].at - frameAt).toBeLessThan(RETRY_MS / 2);
  expect(retried[0].at - refusedAt).toBeLessThan(RETRY_MS);
  expect(typeof room.stores.get("page").value.y["u1-a-new"]).toBe("string");
  expect(t.events.some((e) => e.phase === "landed" && e.n === refused[0].frame.n)).toBe(true);

  t.lane.stop();
});

test("a page-full refusal reaches onDelivery as refused with that code", async () => {
  const rooms = createRooms({ compaction: { activeBytes: 4096 } });
  const room = open(rooms);
  expect(compact(rooms, room, { overflow: true }).kind).toBe("full");

  const t = tab(rooms, room);
  await join(t);
  const before = Object.keys(room.stores.get("page").value.y);

  t.page.handle.set(["y", "u1-a-big"], insert("x".repeat(6000)));
  await sleep(80);

  const refused = t.events.filter((event) => event.phase === "refused");
  expect(refused).toHaveLength(1);
  expect(refused[0].code).toBe("page-full");
  expect(Object.keys(room.stores.get("page").value.y)).toEqual(before);

  t.lane.stop();
});

test("a lane that does not declare the capability gets no page store and stays at save speed", async () => {
  const rooms = createRooms({ compaction: true });
  const room = open(rooms);
  expect(rooms.state(room, "a", null, { compaction: 1 }).stores.page.compaction).toEqual({ v: 1, loose: 32, activeBytes: 3840 * 1024 });
  expect(rooms.state(room, "a", null, { compaction: 0 }).stores.page).toBeUndefined();

  const t = tab(rooms, room, { declare: 0 });
  await join(t);
  expect(t.page.handle.status.mode).toBe("file");
  expect(t.sends).toHaveLength(0);

  t.page.handle.set(["y", "u1-a-old"], insert("old client"));
  await sleep(80);
  expect(t.sends).toHaveLength(0);
  expect(Object.hasOwn(room.stores.get("page").value.y, "u1-a-old")).toBe(false);

  t.lane.stop();
});

test("a page frame without the marker gets 404 and the store leaves the room", async () => {
  const rooms = createRooms({ compaction: true });
  const room = open(rooms);
  const t = tab(rooms, room, { strip: true });
  await join(t);
  expect(t.page.handle.status.mode).toBe("fast");

  t.page.handle.set(["y", "u1-a-new"], insert("marked frame"));
  await sleep(80);

  expect(t.sends).toHaveLength(1);
  expect(t.sends[0].frame.compaction).toBe(1);
  expect(t.sends[0].sent.compaction).toBeUndefined();
  expect(t.sends[0].answer).toEqual({ status: 404, body: { code: "page-upgrade" } });
  expect(t.events.filter((event) => event.phase === "left").map((event) => event.code)).toEqual(["no-store"]);
  expect(t.page.handle.status.mode).toBe("file");
  expect(Object.hasOwn(room.stores.get("page").value.y, "u1-a-new")).toBe(false);

  t.lane.stop();
});

test("a state read declares the compaction capability", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ epoch: "e1", seq: 0, writer: null, stores: {} }) };
  };
  const state = await fetchLiveState("a", null, {});
  expect(state.epoch).toBe("e1");
  const query = new URL(urls[0]).searchParams;
  expect(query.get("compaction")).toBe("1");
  expect(query.get("client-id")).toBe("a");
});
