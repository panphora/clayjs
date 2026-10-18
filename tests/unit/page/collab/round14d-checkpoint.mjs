import assert from "node:assert/strict";
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive, stampOf } = await import(`${H}/live-data-ops.js`);
const rooms = createRooms({ newEpoch: () => "e1" });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive(process.argv[2] === "list" ? { n: 0, items: ["a", "b", "c"] } : { n: 0 })}</script>`;
const room = rooms.open("doc", document.documentElement.outerHTML);
let busy = false;
let blockState = false;
let finishFirstSave;
let saveCalls = 0;
let savedHtml;
const saveReply = () => ({ok:true,status:200,text:async()=>JSON.stringify({msg:"Saved",msgType:"success"})});
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data", "live-provenance"] }) };
  if (u.pathname === "/_/save") {
    saveCalls++;
    savedHtml = init.body;
    rooms.fileWritten("doc", savedHtml);
    if (saveCalls === 1) return new Promise((resolve) => { finishFirstSave = () => resolve(saveReply()); });
    return saveReply();
  }
  if (u.pathname === "/_/sync/data") {
    const cid = u.searchParams.get("client-id");
    if ((init.method || "GET") === "GET") {
      if (blockState) return new Promise(() => {});
      const raw = u.searchParams.get("since");
      const since = raw ? { epoch: raw.slice(0, raw.lastIndexOf(":")), seq: Number(raw.slice(raw.lastIndexOf(":") + 1)) } : null;
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(rooms.state(room, cid, since))) };
    }
    if (busy) return { ok: false, status: 503, json: async () => ({ code: "busy" }), headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "600" : null) } };
    const frame = JSON.parse(init.body);
    const result = rooms.apply(room, cid, frame);
    return { ok: true, status: 200, json: async () => ({ seq: result.seq, epoch: result.epoch }), headers: { get: () => null } };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
console.warn = () => {};
const plugin = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const { savePageForce } = await import(`${C}/core/save.js`);
const { isSaveInProgress } = await import(`${C}/core/save-core.js`);
const snapshot = await import(`${C}/core/snapshot.js`);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const s = plugin.live("s");
await tick();
bridge.streamOpened({ clientId: "c", lane: "live" });
await tick();
const show = (label) => { const st = plugin.storeOf("s"); console.log(label, JSON.stringify({ mode: s.status.mode, n: st.value.n, auth: st.authoritative.n, pending: st.pendingEntries().map((e) => e.id), seq: plugin.fastLane()?.status?.seq })); };
const r1 = rooms.apply(room, "a", { name: "s", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
bridge.streamEvent("data", { epoch: r1.epoch, seq: r1.seq, name: r1.name, ops: r1.ops, from: "a", n: 1 });
await tick();
busy = true;
if (process.argv[2] === "list") { s.add("n", 1); await wait(60); s.delete(["items", 0]); }
else for (let i = 0; i < 2; i++) { s.add("n", 1); await wait(30); }
await tick();
show("before save");
blockState = process.argv[2] !== "state-first";
const notices = [];
document.addEventListener("clay:live-notice", (event) => notices.push(event.detail));
const ownSave = savePageForce();
await tick();
assert.equal(isSaveInProgress(), true);
assert.equal(saveCalls, 1);
assert.equal(room.stores.get("s").value.n, process.argv[2] === "list" ? 2 : 3);
console.log("first save reached room; HTTP answer held", JSON.stringify({room:room.stores.get("s").value,inProgress:isSaveInProgress()}));
bridge.streamEvent("data-state", JSON.parse(JSON.stringify(rooms.state(room,"c"))));
await tick();
if (process.argv[2] === "confirm-first") { finishFirstSave(); await ownSave; }
const checkpointText = serializeLive(room.stores.get("s").value);
const checkpoint = `<script type="application/json" merge="s" clay="live" live-at="${stampOf(room.epoch, room.seq, checkpointText)}">${checkpointText}</script>`;
rooms.fileWritten("doc", checkpoint);
plugin.receiveFrame(checkpoint);
show("after peer fast checkpoint");
if (process.argv[2] !== "confirm-first") { finishFirstSave(); await ownSave; }
show("after successful actual save response");
const second = await savePageForce();
console.log("second real save", JSON.stringify({result:second,room:room.stores.get("s").value,local:s.toJSON(),notices,saveCalls,inProgress:isSaveInProgress()}));
const expected = process.argv[2] === "list" ? {n:2,items:["b","c"]} : {n:3};
assert.deepEqual(room.stores.get("s").value, expected);
assert.deepEqual(s.toJSON(), expected);
assert.deepEqual(notices, []);
assert.deepEqual(plugin.storeOf("s").pending, []);
process.exit(0);
