import assert from "node:assert/strict";

window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive } = await import(`${H}/live-data-ops.js`);
const rooms = createRooms({ newEpoch: () => "e1" });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0 })}</script>`;
const room = rooms.open("doc", document.documentElement.outerHTML);
let busy = false;
let saveCalls = 0;
let finishFirstSave;
const saveReply = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved", msgType: "success" }) });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data", "live-provenance"] }) };
  if (u.pathname === "/_/save") {
    saveCalls++;
    rooms.fileWritten("doc", init.body);
    if (saveCalls === 1) return new Promise((resolve) => { finishFirstSave = () => resolve(saveReply()); });
    return saveReply();
  }
  if (u.pathname === "/_/sync/data") {
    const cid = u.searchParams.get("client-id");
    if ((init.method || "GET") === "GET") {
      const raw = u.searchParams.get("since");
      const since = raw ? { epoch: raw.slice(0, raw.lastIndexOf(":")), seq: Number(raw.slice(raw.lastIndexOf(":") + 1)) } : null;
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(rooms.state(room, cid, since))) };
    }
    if (busy) return { ok: false, status: 503, json: async () => ({ code: "busy" }), headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "600" : null) } };
    const result = rooms.apply(room, cid, JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ seq: result.seq, epoch: result.epoch }), headers: { get: () => null } };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
console.warn = () => {};
let captureMap;
const nativeSet = Map.prototype.set;
Map.prototype.set = function (key, value) {
  if (value && Array.isArray(value.capture) && Array.isArray(value.ids)) captureMap = this;
  return nativeSet.call(this, key, value);
};
const plugin = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const { savePageForce } = await import(`${C}/core/save.js`);
const { isSaveInProgress } = await import(`${C}/core/save-core.js`);
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 5));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const s = plugin.live("s");
await tick();
bridge.streamOpened({ clientId: "c", lane: "live" });
await tick();
const first = rooms.apply(room, "a", { name: "s", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
bridge.streamEvent("data", { epoch: first.epoch, seq: first.seq, name: first.name, ops: first.ops, from: "a", n: 1 });
await tick();
busy = true;
for (let i = 0; i < 2; i++) {
  s.add("n", 1);
  await wait(30);
}
await tick();
const ownSave = savePageForce();
await tick();
assert.equal(isSaveInProgress(), true);
assert.equal(room.stores.get("s").value.n, 3);
finishFirstSave();
await ownSave;
for (let i = 1; i < 400; i++) {
  s.add("n", 1);
  const result = await savePageForce();
  assert.equal(result.ok, true);
}
Map.prototype.set = nativeSet;
assert.equal(plugin.storeOf("s").pending.length, 0);
assert.equal(room.stores.get("s").value.n, 402);
assert.equal(captureMap.size, 0);
process.exit(0);
