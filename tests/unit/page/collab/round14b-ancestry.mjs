import assert from "node:assert/strict";
// Real plugin, file mode (no live-data host). The tag is a v2 capture loaded at reload.
// Each cycle: type, N comparison captures (as autosave/dirty checks do), then a save that is confirmed.
window.clayEditMode = true;
for (const k of ["Event", "CustomEvent", "EventTarget"]) globalThis[k] = window[k];
const C = new URL("../../../../src", import.meta.url).pathname;
const H = new URL("../../../../../hyperclay/server-lib", import.meta.url).pathname;
const { serializeLive, stampOf } = await import(`${H}/live-data-ops.js`);
const { parseBy } = await import(`${C}/live/provenance.js`);
const text = serializeLive({ n: 0 });
document.body.innerHTML = `<script type="application/json" merge="s" clay="live" live-at="${stampOf("e1", 0, text)}" live-by="v2|x:1||peerSave:1">${text}</script>`;
globalThis.fetch = async (url) => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
console.warn = () => {};
const { live, confirmSaved } = await import(`${C}/plugins/live.js`);
const snapshot = await import(`${C}/core/snapshot.js`);
const perCycle = Number(process.argv[2] ?? 1);
const s = live("s");
for (let i = 0; i < 20; i++) await Promise.resolve();
const tagOf = (html) => new DOMParser().parseFromString(html, "text/html").querySelector('script[merge="s"]');
let firstStrip = null;
for (let i = 1; i <= 400; i++) {
  s.add("n", 1);
  for (let k = 0; k < perCycle; k++) { s.add("n", 0); snapshot.captureForComparison({ flushUndo: false }); s.add("n", 1); }
  const html = snapshot.captureForSaveAndComparison({ flushUndo: false }).forSave;
  const t = tagOf(html);
  const by = t.getAttribute("live-by");
  if (by === null && firstStrip === null) { firstStrip = i; console.log("stamps stripped at save", i, "at=", t.getAttribute("live-at")); }
  if (i === 5 || i === 50 || i === 120) console.log("save", i, "by length", by?.length, "ranges in ancestors", by ? parseBy(by).ancestors.reduce((n, [, r]) => n + r.length, 0) : null);
  confirmSaved(html);
  assert.equal(parseBy(by).capture[1], i);
}
console.log("perCycle", perCycle, "firstStrip", firstStrip);

assert.equal(firstStrip, null);
process.exit(0);
