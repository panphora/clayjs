import assert from "node:assert/strict";
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive } = await import(`${H}/live-data-ops.js`);
const variant = process.argv[2] ?? "restart";
const rooms = createRooms({ newEpoch: (() => { let i = 0; return () => `e${++i}`; })() });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0 })}</script>`;
let room = rooms.open("doc", document.documentElement.outerHTML);
let busy = false, answerSave;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data", "live-provenance"] }) };
  if (u.pathname === "/_/save") return new Promise((resolve) => { answerSave = () => resolve({ok:true,status:200,text:async()=>JSON.stringify({msg:"Saved",msgType:"success"})}); });
  if (u.pathname === "/_/sync/data") {
    const cid = u.searchParams.get("client-id");
    if ((init.method || "GET") === "GET") {
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
const snapshot = await import(`${C}/core/snapshot.js`);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notices = [];
document.addEventListener("clay:live-notice", (event) => notices.push(event.detail));
const s = plugin.live("s");
await tick();
bridge.streamOpened({ clientId: "c", lane: "live" });
await tick();
const r1 = rooms.apply(room, "a", { name: "s", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
bridge.streamEvent("data", { epoch: r1.epoch, seq: r1.seq, name: r1.name, ops: r1.ops, from: "a", n: 1 });
await tick();
busy = true;
for (let i = 0; i < 2; i++) { s.add("n", 1); await wait(30); }
await tick();
const html = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
const { saveHtml, isSaveInProgress } = await import(`${C}/core/save-core.js`);
const saving = saveHtml(html);
assert.equal(isSaveInProgress(), true);
rooms.fileWritten("doc", html);
if (variant !== "control") { rooms.drop("doc"); room = rooms.open("doc", html); }
const state = () => JSON.parse(JSON.stringify(rooms.state(room, "c")));
busy = false;
bridge.streamEvent("data-state", state());
await tick();
assert.equal(isSaveInProgress(), true);
const during = s.toJSON().n;
s.set("observed", during);
answerSave();
await saving;
await wait(150);
assert.equal(during, 3);
assert.deepEqual(room.stores.get("s").value, { n: 3, observed: 3 });
assert.deepEqual(s.toJSON(), { n: 3, observed: 3 });
assert.equal(s.status.mode, "fast");
assert.deepEqual(notices, []);
plugin.fastLane().stop();
process.exit(0);
