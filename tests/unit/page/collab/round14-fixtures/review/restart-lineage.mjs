// Real plugin "a", real rooms. a: frame 1 (+1) lands w/o echo, frame 2 busy -> out at e1:0.
// Save 1 (accepted) -> disk. Then variants before save 2.
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = process.env.H ?? new URL("../../../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = process.env.C ?? new URL("../../../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive, stampOf } = await import(`${H}/live-data-ops.js`);
const variant = process.argv[2] ?? "plain";
const rooms = createRooms({ newEpoch: (() => { let i = 0; return () => `e${++i}`; })() });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0, m: 0 })}</script>`;
let room = rooms.open("doc", document.documentElement.outerHTML);
let posts = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data"] }) };
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
const { live, receiveFrame, confirmSaved } = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const snapshot = await import(`${C}/core/snapshot.js`);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const s = live("s");
await tick();
bridge.streamOpened({ clientId: "a", lane: "live" });
await tick();
s.add("n", 1); await wait(60);
s.add("m", 1); await wait(60); await tick();
const mode = s.status.mode;
const cap = () => snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
const tagOf = (html) => { const t = new DOMParser().parseFromString(html, "text/html").querySelector('script[merge="s"]'); return { text: t.textContent, at: t.getAttribute("live-at"), by: t.getAttribute("live-by") }; };
const h1 = cap();
const t1 = tagOf(h1);
rooms.fileWritten("doc", h1);
const afterSave1 = JSON.stringify(room.stores.get("s").value);
if (variant === "unconfirmed") {
  // answer lost: no confirmSaved
} else {
  confirmSaved(h1);
}
await tick();
if(variant !== "no-restart") { rooms.drop("doc"); room = rooms.open("doc", h1); }
if (variant === "peer-frame") rooms.apply(room, "b", { name: "s", n: 1, ops: [{ op: "add", path: ["n"], n: 100 }] });
s.set("m", 5);
const h2 = cap();
const t2 = tagOf(h2);
rooms.fileWritten("doc", h2);
console.log(JSON.stringify({ variant, mode, save1: t1, afterSave1, save2: t2, room: room.stores.get("s").value, expected: { n: 1, m: 5 } }));
confirmSaved(h2);
s.set("m", 9);
const h3 = cap();
rooms.fileWritten("doc", h3);
console.log(JSON.stringify({third: tagOf(h3), epoch: room.epoch, expected: {n:1,m:9}, actual: room.stores.get("s").value}));
if (room.stores.get('s').value.m !== 9) throw new Error('Expected room m:9');
process.exit(0);
