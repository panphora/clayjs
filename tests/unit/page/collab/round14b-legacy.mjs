import assert from "node:assert/strict";
// New plugin tab "a": frame 1 (+1) lands, echo unseen; frame 2 busy -> out at e1:0.
// A peer (old or new format) saves an out-of-room capture stamped e1:S that holds a's landed frame, and a receives it, then saves.
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive, stampOf } = await import(`${H}/live-data-ops.js`);
const variant = process.argv[2] ?? "legacy";
const rooms = createRooms({ newEpoch: () => "e1" });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0 })}</script>`;
const room = rooms.open("doc", document.documentElement.outerHTML);
let posts = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data", "live-provenance"] }) };
  if (u.pathname === "/_/sync/data") {
    const cid = u.searchParams.get("client-id");
    if ((init.method || "GET") === "GET") {
      const raw = u.searchParams.get("since");
      const since = raw ? { epoch: raw.slice(0, raw.lastIndexOf(":")), seq: Number(raw.slice(raw.lastIndexOf(":") + 1)) } : null;
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(rooms.state(room, cid, since))) };
    }
    const frame = JSON.parse(init.body);
    posts++;
    if (posts === 2) return { ok: false, status: 503, json: async () => ({ code: "busy" }), headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "600" : null) } };
    const result = rooms.apply(room, cid, frame);
    return { ok: true, status: 200, json: async () => ({ seq: result.seq, epoch: result.epoch }), headers: { get: () => null } };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
console.warn = () => {};
const { live, receiveFrame } = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const snapshot = await import(`${C}/core/snapshot.js`);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const s = live("s");
await tick();
bridge.streamOpened({ clientId: "a", lane: "live" });
await tick();
s.add("n", 1); await wait(60);
s.set("flag", true); await wait(60); await tick();
const mode = s.status.mode;
const roomBefore = JSON.stringify(room.stores.get("s").value);
const oValue = { n: 1, o: "peer" };
const oText = serializeLive(oValue);
const by = variant === "legacy" ? "o:1" : variant === "v2" ? "v2|||saveO:1" : null;
const oHtml = `<html><head></head><body><script type="application/json" merge="s" clay="live" live-at="${stampOf("e1", 1, oText)}"${by ? ` live-by="${by}"` : ""}>${oText}</script></body></html>`;
rooms.fileWritten("doc", oHtml);
const afterO = JSON.stringify(room.stores.get("s").value);
receiveFrame(oHtml);
await tick();
const inMemory = JSON.stringify(s.value);
const aHtml = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
const t = new DOMParser().parseFromString(aHtml, "text/html").querySelector('script[merge="s"]');
rooms.fileWritten("doc", aHtml);
console.log(JSON.stringify({ variant, mode, roomBefore, afterO, inMemory, aTag: { text: t.textContent, at: t.getAttribute("live-at"), by: t.getAttribute("live-by") }, room: room.stores.get("s").value, expected: { n: 1, o: "peer", flag: true } }));
assert.deepEqual(room.stores.get("s").value, { n: 1, o: "peer", flag: true });
process.exit(0);
