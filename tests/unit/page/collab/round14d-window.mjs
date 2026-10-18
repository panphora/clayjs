import assert from "node:assert/strict";
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const C = new URL("../../../../src", import.meta.url).pathname;
const { createRooms } = await import(`${H}/live-data-rooms.js`);
const { serializeLive } = await import(`${H}/live-data-ops.js`);
const failure = "bad-gateway";
const rooms = createRooms({ newEpoch: (() => { let i = 0; return () => `e${++i}`; })() });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live">${serializeLive({ n: 0 })}</script><script type="application/json" merge="other" clay="live">{"n":0}</script><p id="prose">Original page text</p>`;
let saveCalls = 0;
let room = rooms.open("doc", document.documentElement.outerHTML);
let busy = false, answerSave, capturedHtml, blockState = false;
const bodies = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.pathname === "/_/meta") return { ok: true, status: 200, text: async () => JSON.stringify({ spec: 1, extensions: ["live-data", "live-provenance", "conditional"], document: { etag: "base", saveId: null } }) };
  if (u.pathname === "/_/save") {
    saveCalls++;
    capturedHtml = init.body;
    bodies.push(init.body);
    if (saveCalls > 1) {
      rooms.fileWritten("doc", init.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved", msgType: "success" }) };
    }
    return new Promise((resolve) => {
      answerSave = () => {
        resolve({ ok: false, status: 502, text: async () => JSON.stringify({ code: "test-failure", msg: "Proxy error" }) });
      };
    });
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
    const result = rooms.apply(room, cid, JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ seq: result.seq, epoch: result.epoch }), headers: { get: () => null } };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
console.warn = () => {};
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => {
  if (ms === 10000) return realSetTimeout(fn, 50, ...a);
  if (ms === 45000) return realSetTimeout(fn, 300, ...a);
  return ms >= 5000 ? 0 : realSetTimeout(fn, ms, ...a);
};
const plugin = await import(`${C}/plugins/live.js`);
const bridge = await import(`${C}/live/stream-bridge.js`);
const { hasUnsavedChanges } = await import(`${C}/core/unsaved-warning.js`);
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
const saving = savePageForce();
await tick();
assert.equal(isSaveInProgress(), true);
const html = capturedHtml;
rooms.fileWritten("doc", html);
rooms.drop("doc");
room = rooms.open("doc", html);
busy = false;
blockState = true;
bridge.streamEvent("data-state", JSON.parse(JSON.stringify(rooms.state(room, "c", { epoch: "e1", seq: 1 }))));
await tick();
assert.equal(s.toJSON().n, 3);
assert.equal(isSaveInProgress(), true);
answerSave();
const result = await saving;
assert.equal(result.ok, false);
await wait(60);
assert.equal(plugin.storeOf("s").pending.length, 2, "the ops wait for proof while the room cannot be read");
assert.deepEqual(notices, []);
assert.equal(hasUnsavedChanges(), true, "closing the page while the ops wait is warned about");
const firstTag = new DOMParser().parseFromString(html, "text/html").querySelector('script[merge="s"]');
s.add("n", 1);
other.add("n", 7);
document.querySelector("#prose").textContent = "Text typed while the ops wait";
const later = await savePageForce();
assert.equal(later.ok, true);
assert.equal(saveCalls, 2);
const secondTag = new DOMParser().parseFromString(bodies[1], "text/html").querySelector('script[merge="s"]');
assert.equal(secondTag.textContent, firstTag.textContent, "the store is sent again exactly as the unanswered save sent it");
assert.equal(secondTag.getAttribute("live-by"), firstTag.getAttribute("live-by"));
assert.equal(secondTag.getAttribute("live-at"), firstTag.getAttribute("live-at"));
assert(bodies[1].includes("Text typed while the ops wait"));
assert.deepEqual(notices, []);
assert.equal(plugin.storeOf("s").pending.length, 1, "only the edit made since is still pending");
assert.equal(s.toJSON().n, 4);
blockState = false;
await wait(1500);
assert.equal(room.stores.get("s").value.n, 4);
assert.equal(room.stores.get("other").value.n, 7);
assert.equal(s.toJSON().n, 4);
assert.deepEqual(notices, []);
plugin.fastLane().stop();
process.exit(0);
