// sizeChange against a recount: after every op the tracked byte count equals the
// UTF-8 length of serializeLive(value), and undoTracked brings the exact text
// back. Nested lists and objects, adds, deletes, whole-value sets, escapes and
// odd keys. Round 7 review, Opus test gap (only top-level set and del were
// covered).
import { applyTracked, cloneJson, serializeLive, sizeChange, undoTracked, validateOp } from "../../src/live/ops.js";

const encoder = new TextEncoder();
const bytes = (v) => encoder.encode(serializeLive(v)).length;

function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

const KEYS = ["a", "b", "10", "0", "__proto__x", "toJSON", "", "<k>", "é"];
const LEAVES = [0, -1.5, 12345, true, false, null, "", "x", "< >", "\"q\"", "é😀", "\ud800"];

function randomValue(r, depth) {
  const k = r();
  if (depth > 2 || k < 0.5) return LEAVES[Math.floor(r() * LEAVES.length)];
  if (k < 0.75) return Array.from({ length: Math.floor(r() * 3) }, () => randomValue(r, depth + 1));
  const o = {};
  for (let i = Math.floor(r() * 3); i > 0; i--) o[KEYS[Math.floor(r() * KEYS.length)]] = randomValue(r, depth + 1);
  return o;
}

function randomPath(r, root) {
  const path = [];
  let at = root;
  while (at !== null && typeof at === "object" && r() < 0.7) {
    const keys = Array.isArray(at) ? at.map((_, i) => i) : Object.keys(at);
    if (Array.isArray(at) && r() < 0.3) { path.push(at.length); return path; }
    if (!keys.length || r() < 0.25) { path.push(Array.isArray(at) ? at.length : KEYS[Math.floor(r() * KEYS.length)]); return path; }
    const key = keys[Math.floor(r() * keys.length)];
    path.push(key);
    at = at[key];
  }
  return path.length ? path : [KEYS[Math.floor(r() * KEYS.length)]];
}

test("tracked bytes equal a recount after every op, and undo restores the text, over 20,000 random ops", () => {
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed);
    let value = { a: [1, { b: "two" }], b: {} };
    let b = bytes(value);
    for (let i = 0; i < 500; i++) {
      const k = r();
      const raw = k < 0.55 ? { op: "set", path: randomPath(r, value), value: randomValue(r, 0) } : k < 0.85 ? { op: "del", path: randomPath(r, value) } : { op: "add", path: randomPath(r, value), n: 3 };
      let op;
      try { op = validateOp(raw); } catch { continue; }
      const text = serializeLive(value);
      let rec;
      try { rec = applyTracked(value, op); } catch { expect(serializeLive(value)).toBe(text); continue; }
      if (!rec) continue;
      b += sizeChange(rec, bytes, b);
      value = rec.root;
      expect(b).toBe(bytes(value));
      checked++;
      if (r() < 0.1) {
        value = undoTracked(rec) ?? value;
        expect(serializeLive(value)).toBe(text);
        b = bytes(value);
      }
      value = cloneJson(value);
    }
  }
  expect(checked).toBeGreaterThan(10000);
});
