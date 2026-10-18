// Real plugin "a", real rooms. a: frame 1 (+1) lands w/o echo, frame 2 busy -> out at e1:0.
// Save 1 (accepted) -> disk. Then variants before save 2.
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = process.env.H ?? new URL("../../../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = process.env.C ?? new URL("../../../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive, stampOf } = await import(`${H}/live-data-ops.js`);
const variant = process.argv[2] ?? "plain";
const rooms = createRooms({ newEpoch: () => "e1" });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0, m: 0, items:["a","b","c"] })}</script>`;
const room = rooms.open("doc", document.documentElement.outerHTML);
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
if (variant === "list") s.delete(["items",0]); else s.add("n", 10);
const h1 = cap();
const t1 = tagOf(h1);
rooms.fileWritten("doc", h1);
const afterSave1 = JSON.stringify(room.stores.get("s").value);
// The peer accepts A's capture and writes a new capture which descends from it.
const { execFileSync } = await import('node:child_process');
const peerHtml = execFileSync(process.execPath, ['--import', new URL('../../env-dom.js', import.meta.url).pathname, new URL('./peer-capture.mjs', import.meta.url).pathname, h1], {encoding:'utf8'});
const peerBy = tagOf(peerHtml).by;
if (variant === 'confirmed-early') confirmSaved(h1);
rooms.fileWritten('doc', peerHtml);
receiveFrame(peerHtml);
if (variant === "twice") receiveFrame(peerHtml);
await tick();
console.log(JSON.stringify({afterPeer:s.toJSON(), roomAfterPeer:room.stores.get('s').value, ownCapture:t1, peerBy}));
confirmSaved(h1);
await tick();
const h2 = cap();
const t2 = tagOf(h2);
rooms.fileWritten("doc", h2);
console.log(JSON.stringify({ variant, mode, save1: t1, afterSave1, save2: t2, room: room.stores.get("s").value, expected: { n: variant === "list" ? 1 : 11, m: 1, items:variant === "list" ? ["b","c"] : ["a","b","c"], peer:true } }));
if (variant === 'list' ? JSON.stringify(room.stores.get('s').value.items) !== '["b","c"]' : room.stores.get('s').value.n !== 11) throw new Error('Descendant replayed captured local ops');
process.exit(0);
