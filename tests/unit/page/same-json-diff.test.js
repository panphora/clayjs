// sameJson agrees with hashOf(a) === hashOf(b) on random JSON pairs, most of
// them equal, reordered, or one small change apart.
import { hashOf } from "../../../src/page/replay.js";
import { sameJson } from "../../../src/page/binding.js";

test.each([1, 2, 3, 4])("sameJson agrees with the hash compare, seed %i", (s) => {
  let seed = s;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const leaf = () => pick([null, true, false, 0, 1, -1, 2.5, "", "a", "b", "<", "a<b", "é", "\n", "w", "1"]);
  const gen = (d) => {
    const r = rnd();
    if (d > 3 || r < 0.4) return leaf();
    if (r < 0.7) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(d + 1));
    const o = {};
    for (let i = Math.floor(rnd() * 4); i > 0; i--) o[pick(["a", "b", "c", "m", "w", "t", "1", "x"])] = gen(d + 1);
    return o;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const reorder = (v) => {
    if (Array.isArray(v)) return v.map(reorder);
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).reverse()) o[k] = reorder(v[k]); return o; }
    return v;
  };
  const tweak = (v) => {
    if (Array.isArray(v)) {
      const r = rnd();
      if (!v.length || r < 0.2) return [...v, gen(2)];
      if (r < 0.4) return v.slice(1);
      const i = Math.floor(rnd() * v.length);
      return v.map((x, j) => (j === i ? tweak(x) : x));
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v), r = rnd();
      if (!keys.length || r < 0.25) return { ...v, [pick(["a", "b", "z", "w"])]: gen(2) };
      const k = pick(keys);
      if (r < 0.45) { const o = { ...v }; delete o[k]; return o; }
      return { ...v, [k]: tweak(v[k]) };
    }
    return pick([leaf(), [], {}, gen(2)]);
  };
  let n = 0, eq = 0, bad = 0;
  for (let i = 0; i < Number(process.env.PAIRS || 20000); i++) {
    const a = { c: "x", ...(rnd() < 0.5 ? {} : { w: gen(1) }), v: gen(0) };
    const r = rnd();
    const b = r < 0.35 ? reorder(clone(a)) : r < 0.45 ? { ...clone(a), w: gen(1) } : r < 0.9 ? tweak(clone(a)) : { c: "x", v: gen(0) };
    const want = hashOf(a) === hashOf(b), got = sameJson(a, b);
    n++; if (want) eq++;
    if (want !== got) { bad++; if (bad < 4) console.log("MISMATCH", JSON.stringify(a), JSON.stringify(b), want, got); }
  }

  console.log(JSON.stringify({ seed: s, pairs: n, equal: eq, mismatches: bad }));
  expect(bad).toBe(0);
}, 600_000);
