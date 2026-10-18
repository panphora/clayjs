import { jest } from "@jest/globals";
import { mergeFile } from "./page/collab/file-merge.js";
import { LIMITS } from "./page/collab/room-double.js";
import { applyOp, cloneJson, serializeLive, stampOf, textHash } from "../../src/live/ops.js";

/**
 * Round 11 review, Opus 1: tab a's store left the room while one of its frames
 * had landed without its echo, and a peer's save (stamped after that frame)
 * reaches it before a saves. The incoming value holds that frame: its ops leave
 * pending, and a's save stamps the incoming position with its own live-by, so
 * the host's merge counts nothing twice. The real plugin, store, lane and
 * server transport, against a room with the host's frame and merge rules
 * (file-merge.js). Each case runs in a fresh module registry.
 */

await jest.unstable_mockModule("../../src/live/checkpoint.js", () => ({
  CHECKPOINT_MS: 8000,
  RETRY_MS: 1000,
  createCheckpoints: () => ({ changed() {}, soon() {}, within() {}, flush() {}, flushing: false, deadline: null }),
}));
await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostSupports: async (ext) => ext === "live-data",
  hostMeta: async () => ({ spec: 1, extensions: ["live-data"], document: null }),
}));

window.clayEditMode = true;
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 5));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeRoom(name, value) {
  const room = { epoch: "e1", seq: 0, writer: null, lastN: new Map(), stores: new Map() };
  room.stores.set(name, { value: cloneJson(value), bytes: serializeLive(value).length, from: null, last: 0, landed: 0, floor: 0, log: [], logBytes: 0, inFile: new Set() });
  room.apply = (cid, frame) => {
    const store = room.stores.get(frame.name);
    const key = frame.name + "\n" + cid;
    const last = room.lastN.get(key);
    if (last && frame.n <= last.n) return { duplicate: true, seq: last.seq, epoch: room.epoch };
    let v = store.value;
    for (const op of frame.ops) v = applyOp(v, op);
    store.value = v;
    room.seq += 1;
    store.last = room.seq;
    store.log.push({ seq: room.seq, ops: frame.ops, bytes: JSON.stringify(frame.ops).length, from: cid, n: frame.n });
    store.logBytes += JSON.stringify(frame.ops).length;
    room.lastN.set(key, { n: frame.n, seq: room.seq });
    room.writer ??= cid;
    return { seq: room.seq, epoch: room.epoch };
  };
  room.state = (cid) => ({
    epoch: room.epoch, seq: room.seq, writer: room.writer,
    stores: Object.fromEntries([...room.stores].map(([n, s]) => [n, { value: cloneJson(s.value), ephemeral: false, last: s.last, landed: s.landed, floor: s.floor, seen: { [cid]: room.lastN.get(n + "\n" + cid)?.n ?? 0 } }])),
  });
  return room;
}

const tagOf = (html, name) => new DOMParser().parseFromString(html, "text/html").querySelector(`script[merge="${name}"]`);
const fileOf = (html, name) => {
  const t = tagOf(html, name);
  const at = t.getAttribute("live-at");
  const by = t.getAttribute("live-by");
  const m = at && /^(.+):(\d+):([0-9a-f]{8})$/.exec(at);
  const b = by && /^(.+):(\d+)$/.exec(by);
  return { value: JSON.parse(t.textContent), at: m ? { epoch: m[1], seq: Number(m[2]), hash: m[3] } : null, by: b ? { client: b[1], n: Number(b[2]) } : null };
};

// a's first change lands at seq 1 without its event; its second is answered
// 503 busy, so the store leaves the room at e1:0. Then (peer) the writer b's
// checkpoint, stamped e1:1, reaches a; then a saves.
async function run(initial, first, second, { peer = true, after = null } = {}) {
  jest.resetModules();
  const name = "s";
  const room = makeRoom(name, initial);
  document.body.innerHTML = `<script type="application/json" merge="${name}" clay="live">${serializeLive(initial)}</script>`;
  let posts = 0;
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname !== "/_/sync/data") return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    const cid = u.searchParams.get("client-id");
    if ((init.method || "GET") === "GET") return { ok: true, status: 200, json: async () => room.state(cid) };
    const frame = JSON.parse(init.body);
    if (++posts === 2) return { ok: false, status: 503, json: async () => ({ code: "busy" }), headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "60" : null) } };
    const result = room.apply(cid, frame);
    return { ok: true, status: 200, json: async () => result, headers: { get: () => null } };
  });
  console.warn = () => {};
  const { live, receiveFrame } = await import("../../src/plugins/live.js");
  const bridge = await import("../../src/live/stream-bridge.js");
  const snapshot = await import("../../src/core/snapshot.js");
  const s = live(name);
  await tick();
  bridge.streamOpened({ clientId: "a", lane: "live" });
  await tick();
  first(s);
  await wait(60);
  second(s);
  await wait(60);
  await tick();
  const mode = s.status.mode;
  if (peer) {
    const v = cloneJson(room.stores.get(name).value);
    const text = serializeLive(v);
    const bHtml = `<html><head></head><body><script type="application/json" merge="${name}" clay="live" live-at="${stampOf("e1", room.seq, text)}">${text}</script></body></html>`;
    mergeFile(room, name, fileOf(bHtml, name), { limits: LIMITS });
    receiveFrame(bHtml);
    await tick();
  }
  const aHtml = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  const file = fileOf(aHtml, name);
  mergeFile(room, name, file, { limits: LIMITS });
  if (after) return after({ s, room, aHtml, snapshot, name });
  return { mode, file: { liveAt: tagOf(aHtml, name).getAttribute("live-at"), by: file.by, value: file.value }, room: room.stores.get(name).value };
}

for (const peer of [true, false]) {
  const label = peer ? "Opus 1: a peer's save received while out" : "control, no peer save";
  test(`${label}: a counter add that landed without its echo counts once`, async () => {
    const out = await run({ n: 0 }, (s) => s.add("n", 1), (s) => s.set("flag", true), { peer });
    expect(out.mode).toBe("file");
    expect(out.file.by).toEqual({ client: "a", n: 2 });
    expect(out.file.liveAt.startsWith(peer ? "e1:1:" : "e1:0:")).toBe(true);
    expect(out.room).toEqual({ n: 1, flag: true });
  });

  test(`${label}: a list delete that landed without its echo deletes one item`, async () => {
    const out = await run({ items: ["a", "b", "c"] }, (s) => s.delete(["items", 0]), (s) => s.set("flag", true), { peer });
    expect(out.file.by).toEqual({ client: "a", n: 2 });
    expect(out.room).toEqual({ items: ["b", "c"], flag: true });
  });

  test(`${label}: page text (whole-block sets) keeps each word once`, async () => {
    const block = (c) => ({ t: "paragraph", pos: "M", c });
    const out = await run({ blocks: { p: block("Start.") }, deleted: {} }, (s) => s.set(["blocks", "p"], block("Start. one")), (s) => s.set(["blocks", "p"], block("Start. one two")), { peer });
    expect(out.room.blocks.p.c).toBe("Start. one two");
  });
}

// Round 11 review, Astra 3: two captures while out must not both claim the
// same frames with a stamp. After a save made out of the room is accepted,
// the store descends from the file: the next capture carries no stamp and no
// live-by, and the host replays only what the file lacks (its inFile).
test("Astra 3: a second save while still out has no stamp; the host keeps its newer value and a peer's write", async () => {
  const out = await run({ x: 0 }, (s) => s.set("x", 1), (s) => s.set("x", 2), {
    peer: false,
    after: async ({ s, room, aHtml, snapshot, name }) => {
      const { confirmSaved } = await import("../../src/plugins/live.js");
      room.apply("b", { name, n: 1, ops: [{ op: "set", path: ["y"], value: 7 }] });
      confirmSaved(aHtml);
      s.set("x", 3);
      const second = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
      const t = tagOf(second, name);
      mergeFile(room, name, fileOf(second, name), { limits: LIMITS });
      return { at: t.getAttribute("live-at"), by: t.getAttribute("live-by"), room: room.stores.get(name).value };
    },
  });
  expect(out).toEqual({ at: null, by: null, room: { x: 3, y: 7 } });
});
