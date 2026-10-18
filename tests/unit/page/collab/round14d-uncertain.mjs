import assert from "node:assert/strict";
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive } = await import(`${H}/live-data-ops.js`);
const failure = process.argv[2] ?? "bad-gateway";
const rooms = createRooms({ newEpoch: (() => { let i = 0; return () => `e${++i}`; })() });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0 })}</script><script type="application/json" merge="other" clay="live">{"n":0}</script><p id="prose">Original page text</p>`;
let saveCalls = 0;
let room = rooms.open("doc", document.documentElement.outerHTML);
let busy = false, answerSave, capturedHtml;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data", "live-provenance", "conditional"], document: { etag: "base", saveId: null } }) };
  if (u.pathname === "/_/save") {
    saveCalls++;
    capturedHtml = init.body;
    if (failure === "timeout" && saveCalls === 2) return { ok: false, status: 422, text: async () => JSON.stringify({ code: "test-refused", msg: "Refused retry" }) };
    if (saveCalls > 1) {
      rooms.fileWritten("doc", init.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved", msgType: "success" }) };
    }
    return new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      answerSave = () => {
        if (failure === "network") reject(new TypeError("Network connection lost"));
        else if (failure === "bad-gateway") resolve({ ok: false, status: 502, text: async () => JSON.stringify({ code: "test-failure", msg: "Proxy error" }) });
      };
    });
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
const realSetTimeout = globalThis.setTimeout;
let abortSave;
globalThis.setTimeout = (fn, ms, ...a) => {
  if (ms === 12000 && failure === "timeout") abortSave = fn;
  if (ms === 10000) return realSetTimeout(fn, 50, ...a);
  if (ms === 45000) return realSetTimeout(fn, 300, ...a);
  return ms >= 5000 ? 0 : realSetTimeout(fn, ms, ...a);
};
const plugin = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const { savePageForce, baselineSettled } = await import(`${C}/core/save.js`);
const { isSaveInProgress } = await import(`${C}/core/save-core.js`);
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const notices = [];
document.addEventListener("clay:live-notice", (event) => notices.push(event.detail));
const s = plugin.live("s");
const other = plugin.live("other");
await tick();
bridge.streamOpened({ clientId: "c", lane: "live" });
await tick();
for (let i = 0; i < 40 && !baselineSettled(); i++) await wait(100);
assert(baselineSettled());
const r1 = rooms.apply(room, "a", { name: "s", n: 1, ops: [{ op: "add", path: ["n"], n: 1 }] });
bridge.streamEvent("data", { epoch: r1.epoch, seq: r1.seq, name: r1.name, ops: r1.ops, from: "a", n: 1 });
await tick();
busy = true;
for (let i = 0; i < 2; i++) { s.add("n", 1); await wait(30); }
await tick();
if (failure === "timeout") await (await import(`${C}/core/etag.js`)).seedEtag({ fresh: true });
const saving = savePageForce();
await tick();
assert.equal(isSaveInProgress(), true);
const html = capturedHtml;
rooms.fileWritten("doc", html);
rooms.drop("doc");
room = rooms.open("doc", html);
busy = false;
bridge.streamEvent("data-state", JSON.parse(JSON.stringify(rooms.state(room, "c", { epoch: "e1", seq: 1 }))));
await tick();
assert.equal(s.toJSON().n, 3, "a restarted room's value is not shown over the unanswered save's edits");
assert.equal(isSaveInProgress(), true);
if (failure === "timeout") abortSave();
else answerSave();
const result = await saving;
assert.equal(result.ok, false);
await wait(150);
assert.equal(notices.length, 1);
assert.equal(notices[0].code, "save-uncertain");
assert.equal(notices[0].name, "s");
assert.match(notices[0].message, /n \+ 1; n \+ 1/);
assert.deepEqual(notices[0].ops, [{ op: "add", path: ["n"], n: 1 }, { op: "add", path: ["n"], n: 1 }]);
assert.equal(s.toJSON().n, 3);
assert.equal(plugin.storeOf("s").pending.length, 0);
s.add("n", 1);
other.add("n", 7);
document.querySelector("#prose").textContent = "Text typed after the failed save";
const remote = rooms.apply(room, "peer", { name: "other", n: 1, ops: [{ op: "add", path: ["n"], n: 4 }] });
bridge.streamEvent("data", { ...remote, from: "peer", n: 1 });
await wait(100);
const calls = saveCalls;
const later = await savePageForce();
assert.equal(later.ok, true);
assert.equal(saveCalls, calls + 1);
window.dispatchEvent(new Event("pagehide"));
await wait(100);
assert.equal(other.toJSON().n, 11, "the unrelated store takes the peer's add at once");
assert.equal(s.toJSON().n, 4);
assert.equal(room.stores.get("s").value.n, 4);
assert.equal(room.stores.get("other").value.n, 11);
assert(capturedHtml.includes("Text typed after the failed save"));
assert.equal(notices.length, 1);
plugin.fastLane().stop();
process.exit(0);
