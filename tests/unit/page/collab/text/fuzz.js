// The S1 text fuzz: tabs type words (ASCII, emoji and CJK), delete runs of
// words, drop offline and lose the room, on the room double. Every metric
// counts whole words and their order.
//   import { scenario, SUITES } from "./fuzz.js"
//   node --import ./env.js tests/unit/page/collab/text/fuzz.js [suite] [seeds]
import { Sim, createRoom } from "../room-double.js";
import { makeTab } from "./tab.js";

const clone = (v) => JSON.parse(JSON.stringify(v));

// Zero-padded, so no word is a prefix of another (a01 and a10, never a1 and a10).
const pad = (i) => String(i).padStart(2, "0");
const WORD = { a: (i) => `a${pad(i)}`, b: (i) => `b${pad(i)}😀`, c: (i) => `c${pad(i)}日本` };
export const TEXT = "The quick brown fox jumps over the lazy dog.";
const end = (v) => v.length - 1;
const mid = (v) => v.indexOf(" over");
const start = (v) => v.indexOf(" quick");

/**
 * @param {object} o
 * @param {string[]} o.tabs                tab ids, from "a", "b", "c"
 * @param {Function[]} o.carets            where each tab starts typing, from its view
 * @param {string[]} [o.deleters]          tabs that delete runs of 1 to 3 words instead of typing
 * @param {"offline"|"loss"} [o.chaos]     three offline spells of 2 to 10 s, or one room loss
 * @param {number} o.seed
 * @returns {Promise<{converged, lost, dup, garbled, misordered, silentLost, inNotice, frames, repairs, heals, lostSeconds, final, views, gone}>}
 */
export async function scenario({ tabs: ids, carets, deleters = [], chaos = null, seed, words = 12, cps = 7, latency = [20, 120], hook = null }) {
  const sim = new Sim(seed);
  const initial = { blocks: { p: { t: "p", c: TEXT } }, deleted: {} };
  const lat = () => latency[0] + sim.rand() * (latency[1] - latency[0]);
  const room = createRoom(sim, { page: initial }, { latency: lat, answerLatency: lat });
  const tabs = ids.map((id) => makeTab(sim, room, id, clone(initial)));
  tabs.forEach((t, i) => { t.caret = carets[i](t.view); t.start(); });
  hook?.({ sim, room, tabs });
  await sim.run(500);
  const typed = new Map();
  const deleted = [];
  // Which typed words a delete cut, exactly: the deleter's view is S (it acts
  // only with nothing in flight), each character of S names the write that
  // typed it (provenance: writer and seq), and each seq names the characters
  // the typist sent in that frame. A word's leading space belongs to no word.
  const cutWords = new Set();
  const typedChars = new Map(), opChar = new Map(), frameOps = new Map();
  for (const t of tabs) {
    typedChars.set(t.id, []);
    opChar.set(t.id, new Map());
    frameOps.set(t.id, new Map());
    t.store.onDelivery((ev) => {
      if ((ev.phase !== "landed" && ev.phase !== "echoed") || !Number.isInteger(ev.seq)) return;
      const ops = frameOps.get(t.id), seen = new Set([...ops.values()].flat());
      for (const id of opChar.get(t.id).keys()) if (id <= ev.through && !seen.has(id)) (ops.get(ev.seq) ?? ops.set(ev.seq, []).get(ev.seq)).push(id);
    });
  }
  const cutAt = (t, from, to) => {
    const S = t.r.S, prov = t.r.prov;
    deleted.push(...t.view.slice(from, to).split(/[\s.]+/).filter(Boolean));
    let i = from;
    while (i < to) {
      const pv = prov[i];
      let j = i + 1;
      while (j < to && prov[j].a === pv.a && prov[j].q === pv.q) j++;
      if (typedChars.has(pv.a)) {
        const chars = typedChars.get(pv.a), ids = frameOps.get(pv.a).get(pv.q) ?? [];
        const ords = ids.map((id) => opChar.get(pv.a).get(id));
        const sent = ords.map((o) => chars[o].ch).join("");
        const at = sent.indexOf(S.c.slice(i, j));
        if (at >= 0) for (const o of ords.slice(at, at + (j - i))) if (chars[o].word) cutWords.add(chars[o].word);
      }
      i = j;
    }
  };
  for (const t of tabs) {
    if (deleters.includes(t.id)) {
      for (let at = 900 + sim.rand() * 500; at < 9000; at += 800 + sim.rand() * 1200) {
        const n = 1 + Math.floor(sim.rand() * 3), pick = sim.rand();
        sim.at(at, () => {
          if (t.view === null || t.store.pending.length || !t.r.S || t.view !== t.r.S.c) return;
          const spans = [...t.view.matchAll(/ [^ .]+/g)];
          if (!spans.length) return;
          const i = Math.floor(pick * spans.length), j = Math.min(spans.length, i + n);
          const from = spans[i].index, to = spans[j - 1].index + spans[j - 1][0].length;
          cutAt(t, from, to);
          t.replace(from, to, "");
        });
      }
      continue;
    }
    const list = Array.from({ length: words }, (_, i) => WORD[t.id](i));
    typed.set(t.id, list);
    let at = 600 + sim.rand() * 200;
    for (const w of list) {
      for (const ch of " " + w) {
        const ord = typedChars.get(t.id).push({ ch, word: ch === " " ? null : w }) - 1;
        sim.at(at, () => { t.type(ch); opChar.get(t.id).set(t.store.mark, ord); });
        at += (1000 / cps) * (0.6 + sim.rand() * 0.8);
      }
      if (sim.rand() < 0.3) at += 400 + sim.rand() * 600;
    }
  }
  if (chaos === "offline") {
    for (let k = 0; k < 3; k++) {
      const t = tabs[Math.floor(sim.rand() * tabs.length)];
      const at = 1500 + sim.rand() * 6000, len = 2000 + sim.rand() * 8000;
      sim.at(at, () => { if (room.clients.get(t.id)?.connected) room.close(t.id); });
      sim.at(at + len, () => { if (!room.clients.get(t.id)?.connected) room.open(t.id); });
    }
  }
  if (chaos === "loss") {
    let file = clone(initial);
    for (let t = 8000; t < 30000; t += 8000) sim.at(t, () => { file = clone(room.stores.get("page").value); room.land("page", room.seq); });
    sim.at(3000 + sim.rand() * 8000, () => room.restart({ page: file }));
  }
  await sim.run(60000);
  await sim.idle(5000);

  const block = room.stores.get("page").value.blocks.p;
  const final = block && !room.stores.get("page").value.deleted?.p ? block.c : null;
  const converged = tabs.every((t) => t.view === final);
  const text = final ?? "";
  const notices = JSON.stringify(tabs.flatMap((t) => t.allNotices()));
  const count = (w) => { let n = 0; for (let i = text.indexOf(w); i >= 0; i = text.indexOf(w, i + w.length)) n++; return n; };
  // A word a deleter removed, whole or in part, as it saw it (a token it deleted
  // can hold two words glued where a peer deleted the space between them).
  const touched = (w) => cutWords.has(w);
  let lost = 0, dup = 0, inNotice = 0, misordered = 0;
  const gone = [], lostSeconds = {};
  for (const [id, list] of typed) {
    let last = -1;
    lostSeconds[id] = 0;
    for (const w of list) {
      const n = count(w);
      if (n === 0) {
        if (touched(w)) continue;
        lost++;
        lostSeconds[id] += (w.length + 1) / cps;
        if (notices.includes(w)) inNotice++;
        else gone.push(w);
        continue;
      }
      if (n > 1) dup++;
      const at = text.indexOf(w);
      if (at < last) misordered++;
      last = Math.max(last, at);
    }
  }
  // Garbled: a token that is not whole words, glued or not, plus what is left
  // of words a deleter cut.
  const vocab = [...[...typed.values()].flat(), ...TEXT.split(/[\s.]+/).filter(Boolean)];
  const pieces = new Set(vocab);
  for (const w of vocab) if (touched(w)) for (let i = 1; i < w.length; i++) { pieces.add(w.slice(0, i)); pieces.add(w.slice(i)); }
  const explained = (t) => { const ok = [true]; for (let i = 1; i <= t.length; i++) { ok[i] = false; for (let j = 0; j < i && !ok[i]; j++) ok[i] = ok[j] && pieces.has(t.slice(j, i)); } return ok[t.length]; };
  const garbled = text.split(/[\s.]+/).filter((t) => t && !explained(t)).length;
  return {
    converged, lost, dup, garbled, misordered, silentLost: lost - inNotice, inNotice,
    frames: room.frames, repairs: tabs.reduce((n, t) => n + t.repairs, 0), heals: tabs.reduce((n, t) => n + t.heals, 0),
    lostSeconds, final, views: tabs.map((t) => t.view), gone, deleted, cut: [...cutWords],
    stats: tabs.map((t) => t.r.stats),
  };
}

export const SUITES = {
  steady: {
    "2 tabs, different spots": { tabs: ["a", "b"], carets: [mid, end] },
    "2 tabs, same spot": { tabs: ["a", "b"], carets: [end, end] },
    "3 tabs, different spots": { tabs: ["a", "b", "c"], carets: [start, mid, end] },
    "3 tabs, same spot": { tabs: ["a", "b", "c"], carets: [end, end, end] },
  },
  deletes: {
    "2 type, 1 deletes runs": { tabs: ["a", "b", "c"], carets: [end, mid, end], deleters: ["c"] },
    "1 types, 2 delete runs": { tabs: ["a", "b", "c"], carets: [mid, end, end], deleters: ["b", "c"] },
    "2 type, 1 deletes, offline spells": { tabs: ["a", "b", "c"], carets: [end, mid, end], deleters: ["c"], chaos: "offline" },
  },
  chaos: {
    "2 tabs, same spot, offline spells": { tabs: ["a", "b"], carets: [end, end], chaos: "offline" },
    "3 tabs, different spots, offline spells": { tabs: ["a", "b", "c"], carets: [start, mid, end], chaos: "offline" },
    "2 tabs, same spot, room loss": { tabs: ["a", "b"], carets: [end, end], chaos: "loss" },
    "3 tabs, different spots, room loss": { tabs: ["a", "b", "c"], carets: [start, mid, end], chaos: "loss" },
  },
};

export async function runSuite(name, seeds, onExample = () => {}) {
  const rows = [];
  for (const [label, sc] of Object.entries(SUITES[name])) {
    const agg = { converged: 0, lost: 0, silentLost: 0, inNotice: 0, garbled: 0, dup: 0, misordered: 0, frames: 0, repairs: 0, heals: 0, maxLostSeconds: 0 };
    for (let s = 1; s <= seeds; s++) {
      const out = await scenario({ ...sc, seed: s * 7919 });
      agg.converged += out.converged ? 1 : 0;
      for (const k of ["lost", "silentLost", "inNotice", "garbled", "dup", "misordered", "frames", "repairs", "heals"]) agg[k] += out[k];
      agg.maxLostSeconds = Math.max(agg.maxLostSeconds, ...Object.values(out.lostSeconds));
      if (!out.converged || out.silentLost || out.garbled || out.dup || out.misordered) onExample(label, s * 7919, out);
    }
    rows.push({ scenario: label, converged: `${agg.converged}/${seeds}`, lost: agg.lost, silentLost: agg.silentLost, inNotice: agg.inNotice, garbled: agg.garbled, dup: agg.dup, misordered: agg.misordered, framesPerRun: Math.round(agg.frames / seeds), repairsPerRun: +(agg.repairs / seeds).toFixed(1), heals: agg.heals, maxLostSecondsPerTab: +agg.maxLostSeconds.toFixed(2) });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv[2] && process.argv[2] !== "all" ? [process.argv[2]] : Object.keys(SUITES);
  const seeds = Number(process.argv[3] || 40);
  for (const name of names) {
    const rows = await runSuite(name, seeds, (label, seed, out) => {
      if (process.env.SHOW) console.log("EXAMPLE", label, seed, JSON.stringify({ final: out.final, views: out.views, gone: out.gone, converged: out.converged }));
    });
    console.log(`\n## ${name}, ${seeds} seeds`);
    console.table(rows);
  }
}
