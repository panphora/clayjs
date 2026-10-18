import assert from "node:assert/strict";
// Real plugin tab "c" (busy: its POSTs are refused so its two adds stay pending), real rooms.
// A peer's frame 1 is in the room. c saves out of the room, the server merges it, the room's state
// reaches c BEFORE the save's confirm (variant "state-first"), or after it ("confirm-first").
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive } = await import(`${H}/live-data-ops.js`);
const variant = process.argv[2] ?? "state-first";
const rooms = createRooms({ newEpoch: () => "e1" });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0 })}</script>`;
const room = rooms.open("doc", document.documentElement.outerHTML);
let busy = false;
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
    if (busy) return { ok: false, status: 503, json: async () => ({ code: "busy" }), headers: { get: (h) => (h.toLowerCase() === "retry-after" ? "600" : null) } };
    const frame = JSON.parse(init.body);
    const result = rooms.apply(room, cid, frame);
    return { ok: true, status: 200, json: async () => ({ seq: result.seq, epoch: result.epoch }), headers: { get: () => null } };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
console.warn = () => {};
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => (ms >= 5000 ? 0 : realSetTimeout(fn, ms, ...a));
const plugin = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const snapshot = await import(`${C}/core/snapshot.js`);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const s = plugin.live("s");
await tick();
bridge.streamOpened({ clientId: "c", lane: "live" });
await tick();
const show = (label) => { const st = plugin.storeOf("s"); console.log(label, JSON.stringify({ mode: s.status.mode, n: st.value.n, auth: st.authoritative.n, pending: st.pendingEntries().map((e) => e.id), seq: plugin.fastLane()?.status?.seq })); };
// a peer's frame lands, c hears it
const r1 = rooms.apply(room, "a", { name: "s", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
bridge.streamEvent("data", { epoch: r1.epoch, seq: r1.seq, name: r1.name, ops: r1.ops, from: "a", n: 1 });
await tick();
busy = true;
for (let i = 0; i < Number(process.env.ADDS ?? 2); i++) { s.add("n", 1); await wait(30); }
await tick();
show("before save");
const html = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
const tag = new DOMParser().parseFromString(html, "text/html").querySelector('script[merge="s"]');
console.log("tag", tag.textContent, tag.getAttribute("live-at"), tag.getAttribute("live-by"));
const written = rooms.fileWritten("doc", html);
console.log("room after fileWritten", JSON.stringify(room.stores.get("s").value), "valueChanged", written?.valueChanged);
const state = () => JSON.parse(JSON.stringify(rooms.state(room, "c")));
if (variant === "lost-answer") {
  bridge.streamEvent("data-state", state()); await tick(); show("after data-state");
  busy = false;
  bridge.streamOpened({ clientId: "c", lane: "live" }); await wait(300); await tick(); show("after rejoin + flush");
  console.log("room", JSON.stringify(room.stores.get("s").value));
} else if (variant === "state-first") {
  bridge.streamEvent("data-state", state()); await tick(); show("after data-state");
  plugin.confirmSaved(html); await tick(); show("after confirm");
} else {
  plugin.confirmSaved(html); await tick(); show("after confirm");
  bridge.streamEvent("data-state", state()); await tick(); show("after data-state");
}
const h2 = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
const t2 = new DOMParser().parseFromString(h2, "text/html").querySelector('script[merge="s"]');
rooms.fileWritten("doc", h2);
console.log("second save (no edits):", t2.textContent, t2.getAttribute("live-by"), "-> room", JSON.stringify(room.stores.get("s").value));
console.log("expected n=" + (1 + Number(process.env.ADDS ?? 2)));
assert.equal(room.stores.get("s").value.n, 1 + Number(process.env.ADDS ?? 2));
assert.equal(s.toJSON().n, 1 + Number(process.env.ADDS ?? 2));
assert.equal(plugin.storeOf("s").pending.length, 0);
process.exit(0);
