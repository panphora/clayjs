// The S1 text rows as data, and their runner. A "tab" row runs on the room
// double with real stores and fast lanes (tab.js); a "core" row feeds writes
// straight to the replay (src/page/replay.js). Every row states its expected
// text and its expected notices: a notice no entry in `notices` matches fails
// the row, and so does an entry no notice matches.
//   import { ROWS, runRow } from "./rows.js"
//   node --import ./env.js tests/unit/page/collab/text/rows.js [id ...]
import { Sim, createRoom } from "../room-double.js";
import { makeTab } from "./tab.js";
import { createReplay, step, join, LIMITS } from "../../../../../src/page/replay.js";

const clone = (v) => JSON.parse(JSON.stringify(v));

export const P = "The quick brown fox jumps over the lazy dog.";
const words = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, "0")}`);
const spaced = (list) => list.map((w) => " " + w).join("");

// Writes for core rows: one splice of `before`, made by tab a at release seq k.
const ins = (a, k, before, at, t, m = null) => ({ t: "p", c: before.slice(0, at) + t + before.slice(at), ...(m && { m }), w: { a, e: "e1", k, s: [[at, at, "", before.length]] } });
const del = (a, k, before, from, to) => ({ t: "p", c: before.slice(0, from) + before.slice(to), w: { a, e: "e1", k, s: [[from, to, before.slice(from, to), before.length]] } });
const marked = (c, ranges) => { const m = new Array(c.length).fill(""); for (const [text, key] of ranges) { const i = c.indexOf(text); for (let j = i; j < i + text.length; j++) m[j] = key; } return m; };
const typing = (n) => () => {
  const out = [];
  let c = "a";
  for (let i = 1; i <= n; i++) { out.push(["step", ins("b", i - 1, c, c.length, "x"), i]); c += "x"; }
  return out;
};

// Script actions for tab rows, each at a simulated ms:
//   { tab, caret, type, cps, key }  type at the caret (number, "end" = before the
//                                   final period, { after }, { before }); cps 0 = one write
//   { tab, replace, text, key }     replace a word or [from, to] of the view, one write
//   { tab, format, key }            set one mark key on a word or [from, to]
//   { tab, split }                  Enter: the tail goes to a new block (kept in `tails`)
//   { tab, remove } { tab, compose } { tab, undo }  undo deletes this tab's own text
//   { offline } { online } { checkpoint } { restart } { inject }  inject: a stale repair from client z
//   { view: { tab, text } }         what that tab shows then
export const ROWS = [
  { id: "2", source: "opus 3.3 row 2", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: { after: "quick" }, type: " red" },
    { at: 1000, tab: "b", caret: { after: "quick" }, type: " blue" },
  ], expect: { text: ["The quick red blue brown fox jumps over the lazy dog.", "The quick blue red brown fox jumps over the lazy dog."], notices: [] } },
  { id: "3", source: "opus 3.3 row 3", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", replace: "quick", text: "fast" },
    { at: 1000, tab: "b", replace: "lazy", text: "sleepy" },
  ], expect: { text: "The fast brown fox jumps over the sleepy dog.", notices: [] } },
  { id: "3b", source: "opus 3.3 row 3b", tabs: ["a", "b"], policy: "two replacements of one word are both kept, side by side, with no notice (round 1 kept the later one and put the other in a notice)", script: [
    { at: 1000, tab: "a", replace: "quick", text: "fast" },
    { at: 1000, tab: "b", replace: "quick", text: "slow" },
  ], expect: { text: "The fastslow brown fox jumps over the lazy dog.", notices: [] } },
  { id: "4", source: "opus 3.3 row 4", tabs: ["a", "b"], policy: "text typed in the tail after a split lands at the end of the first half, where the typist's caret now is", script: [
    { at: 1000, tab: "b", caret: 20, type: "red ", cps: 6 },
    { at: 1300, tab: "a", split: 15 },
  ], expect: { text: "The quick brownd ", tail: { a: " fox rejumps over the lazy dog." }, notices: [] } },
  { id: "5", source: "opus 3.3 row 5", tabs: ["a", "b"], policy: "a deleted block stays deleted; a tab that edited it keeps its text in a removed notice, with Restore", script: [
    { at: 1000, tab: "b", caret: "end", type: " again", cps: 6 },
    { at: 1300, tab: "a", remove: true },
  ], expect: { text: null, notices: [{ kind: "removed", tab: "b", includes: "lazy dog ag" }, { kind: "removed" }] } },
  { id: "8", source: "opus 3.3 row 8", tabs: ["a", "b"], script: [
    { at: 1000, tab: "b", compose: true },
    { at: 1000, tab: "b", caret: "end", type: " かな" },
    { at: 1100, tab: "a", caret: { after: "quick" }, type: " red" },
    { at: 1700, view: { tab: "b", text: "The quick brown fox jumps over the lazy dog かな." } },
    { at: 2000, tab: "b", compose: false },
  ], expect: { text: "The quick red brown fox jumps over the lazy dog かな.", notices: [] } },
  { id: "9", source: "opus 3.3 row 9", tabs: ["a", "b"], policy: "a refused frame: the editor returns to the agreed value and the refused text is kept in a notice", refuse: { tab: "a", from: 900, to: 1200, status: 413 }, never: [{ tab: "b", includes: "big" }], script: [
    { at: 1000, tab: "a", caret: { after: "quick" }, type: " big", cps: 0 },
  ], expect: { text: P, notices: [{ kind: "refused", tab: "a", includes: "big" }] } },
  { id: "9b", source: "opus 3.3 row 9b", tabs: ["a", "b", "c"], person: "p1", script: [
    { at: 1000, tab: "a", caret: { after: "quick" }, type: spaced(words("a", 24)), cps: 20 },
    { at: 1000, tab: "b", caret: { after: "over" }, type: spaced(words("b", 24)), cps: 20 },
    { at: 1000, tab: "c", caret: "end", type: spaced(words("c", 24)), cps: 20 },
  ], expect: { words: { a: words("a", 24), b: words("b", 24), c: words("c", 24) }, notices: [], check: ({ room }) => (room.limited > 0 ? null : "no frame was refused for rate") } },
  { id: "10", source: "opus 3.3 row 10", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: { after: "quick" }, type: " red" },
    { at: 2000, checkpoint: true },
    { at: 2500, tab: "b", caret: "end", type: " again" },
    { at: 2500, tab: "a", caret: { after: "brown" }, type: " big" },
    { at: 4000, restart: true },
  ], expect: { text: "The quick red brown big fox jumps over the lazy dog again.", notices: [] } },
  { id: "10b", source: "opus 3.3 row 10, typing through the loss", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: { after: "quick" }, type: " red" },
    { at: 2000, checkpoint: true },
    { at: 3000, tab: "b", caret: "end", type: " again and again" },
    { at: 3000, tab: "a", caret: { after: "brown" }, type: " big and bold" },
    { at: 4000, restart: true },
  ], expect: { text: "The quick red brown big and bold fox jumps over the lazy dog again and again.", notices: [] } },
  { id: "11", source: "opus 3.3 row 11", tabs: ["a", "b"], until: 45000, script: [
    { at: 900, offline: "b" },
    { at: 1000, tab: "b", caret: "end", type: " again" },
    { at: 1000, tab: "a", caret: { after: "quick" }, type: " red" },
    { at: 5000, tab: "a", replace: "over", text: "a" },
    { at: 31000, online: "b" },
  ], expect: { text: "The quick red brown fox jumps a the lazy dog again.", notices: [] } },
  { id: "12", source: "opus 3.3 row 12", tabs: ["a", "b", "c"], script: [
    { at: 1000, tab: "a", caret: "end", type: " one two" },
    { at: 1000, tab: "b", caret: "end", type: " three four" },
    { at: 1000, tab: "c", caret: "end", type: " five six" },
  ], expect: { words: { a: ["one", "two"], b: ["three", "four"], c: ["five", "six"] }, notices: [] } },

  { id: "cat", source: "Astra: cat", text: "cat", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: 3, type: "s" },
    { at: 1010, tab: "b", caret: 1, type: "h" },
  ], expect: { text: "chats", notices: [] } },
  { id: "cat-r", source: "Astra: cat, other order", text: "cat", tabs: ["a", "b"], script: [
    { at: 1000, tab: "b", caret: 1, type: "h" },
    { at: 1010, tab: "a", caret: 3, type: "s" },
  ], expect: { text: "chats", notices: [] } },
  { id: "hello", source: "Astra: Hello world, two inserts at 6", text: "Hello world", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: 6, type: "A ", cps: 0 },
    { at: 1010, tab: "b", caret: 6, type: "B ", cps: 0 },
  ], expect: { text: "Hello A B world", notices: [] } },
  { id: "hello-r", source: "Astra: Hello world, other order", text: "Hello world", tabs: ["a", "b"], script: [
    { at: 1000, tab: "b", caret: 6, type: "B ", cps: 0 },
    { at: 1010, tab: "a", caret: 6, type: "A ", cps: 0 },
  ], expect: { text: "Hello A B world", notices: [] } },
  { id: "friday", source: "Astra: We ship Friday, then A undoes", text: "We ship Friday.", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: { before: "Friday" }, type: "early ", cps: 0 },
    { at: 1000, tab: "b", caret: "end", type: ", together", cps: 0 },
    { at: 1800, view: { tab: "a", text: "We ship early Friday, together." } },
    { at: 2000, tab: "a", undo: true },
  ], expect: { text: "We ship Friday, together.", notices: [] } },
  { id: "aaaa", source: "Astra: aaaa, disjoint deletes", text: "aaaa", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", replace: [0, 1], text: "" },
    { at: 1010, tab: "b", replace: [3, 4], text: "" },
  ], expect: { text: "aa", notices: [] } },
  { id: "aaaa-r", source: "Astra: aaaa, other order", text: "aaaa", tabs: ["a", "b"], script: [
    { at: 1000, tab: "b", replace: [3, 4], text: "" },
    { at: 1010, tab: "a", replace: [0, 1], text: "" },
  ], expect: { text: "aa", notices: [] } },
  { id: "abcd", source: "Astra: abcd, delete bc while X goes in", text: "abcd", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", replace: [1, 3], text: "" },
    { at: 1010, tab: "b", caret: 2, type: "X" },
  ], expect: { text: "aXd", notices: [] } },
  { id: "abcd-r", source: "Astra: abcd, other order", text: "abcd", tabs: ["a", "b"], script: [
    { at: 1000, tab: "b", caret: 2, type: "X" },
    { at: 1010, tab: "a", replace: [1, 3], text: "" },
  ], expect: { text: "aXd", notices: [] } },
  { id: "resurrect", source: "Astra: resurrection after a checkpoint and a restart", tabs: ["a", "b"], until: 20000, policy: "the tombstone holds across the checkpoint and the restart; the offline tab's text is kept in a removed notice", script: [
    { at: 900, offline: "b" },
    { at: 1000, tab: "b", caret: "end", type: " again" },
    { at: 1500, tab: "a", remove: true },
    { at: 2500, checkpoint: true },
    { at: 3000, restart: true },
    { at: 5000, online: "b" },
  ], expect: { text: null, notices: [{ kind: "removed", tab: "b", includes: "again" }, { kind: "removed" }] } },
  { id: "resurrect-whole", source: "Astra: resurrection by a write with no author (a data API set or an old client), then by a stale heal", tabs: ["a", "b"], policy: "a write with no author under a tombstone is deleted again by any tab; it has no author to tell, so there is no notice", script: [
    { at: 1000, tab: "a", remove: true },
    { at: 2000, checkpoint: true },
    { at: 3000, restart: true },
    { at: 5000, inject: { t: "p", c: "The quick brown fox, from an old client." } },
    { at: 6000, inject: { t: "p", c: "A heal from a tab that missed the delete.", w: { a: "z", h: 9, s: [], u: [] } } },
  ], expect: { text: null, notices: [{ kind: "removed", includes: "missed the delete" }] } },
  { id: "stale-repair", source: "Astra: repair window, a stale repair no tab can place", tabs: ["a", "b"], limits: { logEntries: 16 }, script: [
    { at: 1000, tab: "a", caret: { after: "quick" }, type: " red and fast" },
    { at: 1000, tab: "b", caret: "end", type: " again and again" },
    { at: 5000, inject: { t: "p", c: "STALE", w: { a: "z", g: 1 } } },
  ], expect: { text: "The quick red and fast brown fox jumps over the lazy dog again and again.", notices: [], check: ({ tabs }) => ([...tabs.values()].every((t) => t.r.stats.refused >= 1) ? null : "a tab took the stale repair") } },

  { id: "marks-beside", source: "marks: bold, typing beside it", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", format: "brown", key: "b" },
    { at: 1000, tab: "b", caret: { after: "brown" }, type: "ish" },
  ], expect: { text: "The quick brownish fox jumps over the lazy dog.", marks: [["brown", "b"], ["ish", ""]], notices: [] } },
  { id: "marks-inside", source: "marks: a link, typing inside it", tabs: ["a", "b"], policy: "text typed inside a range a peer formats keeps the typist's marks when it lands after the format (here: the link splits around -ish), and takes the format when it lands first", script: [
    { at: 1000, tab: "a", format: "quick brown", key: "a:https://x.test" },
    { at: 1000, tab: "b", caret: { after: "quick" }, type: "-ish" },
  ], expect: { text: "The quick-ish brown fox jumps over the lazy dog.", marks: [["quick", "a:https://x.test"], ["brown", "a:https://x.test"]], notices: [] } },
  { id: "marks-code", source: "marks: code typed by one tab, italic by the other", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", caret: { after: "fox" }, type: " x()", key: "code" },
    { at: 1000, tab: "b", format: "jumps", key: "i" },
  ], expect: { text: "The quick brown fox x() jumps over the lazy dog.", marks: [["x()", "code"], ["jumps", "i"]], notices: [] } },
  { id: "marks-emoji", source: "marks: a bold emoji, typing on both sides", text: "I 😀 you.", tabs: ["a", "b"], script: [
    { at: 1000, tab: "a", format: "😀", key: "b" },
    { at: 1000, tab: "b", caret: { after: "😀" }, type: " 🎉日本" },
    { at: 1000, tab: "a", caret: 2, type: "👍" },
  ], expect: { text: "I 👍😀 🎉日本 you.", marks: [["😀", "b"], ["👍", ""], [" 🎉日本", ""]], notices: [] } },

  { id: "core-aaaa", kind: "core", source: "Astra: aaaa through the fallback (a tab that joined with no history)", policy: "a replay with no history before a write places its delete by a diff; when that may hit the wrong character it says so in an inexact notice, and the writer's repair then brings it to the agreed text", seed: "aaaa", me: "c", steps: [
    ["join", { t: "p", c: "aaa" }, 1],
    ["step", del("b", 0, "aaaa", 3, 4), 2],
    ["expect", "aaa"],
    ["step", { t: "p", c: "aa", w: { a: "a", e: "e1", g: 2 } }, 3],
  ], expect: { text: "aa", notices: [{ kind: "inexact", includes: "a" }] } },
  { id: "core-window", kind: "core", source: "Astra: repair through seq 0 after 513 inserts, divergent", seed: "a", steps: () => [...typing(513)(), ["step", { t: "p", c: "A", w: { a: "a", e: "e1", g: 0 } }, 514]],
    expect: { text: "A" + "x".repeat(513), notices: [], check: (r) => (r.stats.rewinds === 1 ? null : `rewinds ${r.stats.rewinds}`) } },
  { id: "core-window-agreed", kind: "core", source: "Astra: repair through seq 0 after 513 inserts, agreed", seed: "a", steps: () => [...typing(513)(), ["step", { t: "p", c: "a", w: { a: "a", e: "e1", g: 0 } }, 514]],
    expect: { text: "a" + "x".repeat(513), notices: [], check: (r) => (r.stats.agreed === 1 ? null : "not agreed") } },
  { id: "core-window-uncovered", kind: "core", source: "Astra: repair through seq 0 after 1,100 inserts (past the window)", seed: "a", steps: () => [...typing(1100)(), ["step", { t: "p", c: "A", w: { a: "a", e: "e1", g: 0 } }, 1101]],
    expect: { text: "a" + "x".repeat(1100), notices: [], check: (r) => (r.stats.refused === 1 && r.behind ? null : "not refused") } },
  { id: "core-emoji-merge", kind: "core", source: "marks: a bold emoji through merge3Text", policy: "two writes that changed the same range, one from before the replay's history, merge by merge3Text; the later write's side wins and the other is kept in a notice", seq: 10,
    seed: { t: "p", c: "Hi 😀 there", m: marked("Hi 😀 there", [["😀", "b"]]) },
    steps: [
      ["step", ins("b", 10, "Hi 😀 there", 8, "X", marked("Hi 😀 thXere", [["😀", "b"]])), 11],
      ["step", { t: "p", c: "Hi 😀 world", m: marked("Hi 😀 world", [["😀", "b"], ["world", "i"]]), w: { a: "a", e: "e1", k: 5, s: [[6, 11, "there", 11]] } }, 12],
    ], expect: { text: "Hi 😀 world", marks: [["😀", "b"], ["world", "i"]], notices: [{ kind: "merge", includes: "X" }], check: (r) => (r.stats.merge === 1 ? null : "merge3 did not run") } },
];

const resolveCaret = (view, c) => {
  if (typeof c === "number") return c;
  if (c === "end" || c === undefined) return view.endsWith(".") ? view.length - 1 : view.length;
  if (c.after !== undefined) return view.indexOf(c.after) + c.after.length;
  return view.indexOf(c.before);
};
const rangeOf = (view, x) => (Array.isArray(x) ? x : [view.indexOf(x), view.indexOf(x) + x.length]);

function checkResult(row, { final, marks, notices }, problems) {
  const e = row.expect;
  if (e.text === null && final !== null) problems.push(`expected no block, got ${JSON.stringify(final)}`);
  if (typeof e.text === "string" && final !== e.text) problems.push(`text ${JSON.stringify(final)}`);
  if (Array.isArray(e.text) && !e.text.includes(final)) problems.push(`text ${JSON.stringify(final)}`);
  for (const [id, list] of Object.entries(e.words ?? {})) {
    let last = -1;
    for (const w of list) {
      const at = (final ?? "").indexOf(w);
      if (at < 0) problems.push(`${w} lost`);
      else if ((final ?? "").indexOf(w, at + 1) >= 0) problems.push(`${w} twice`);
      else if (at < last) problems.push(`${w} out of order`);
      last = Math.max(last, at);
    }
  }
  for (const [text, key] of e.marks ?? []) {
    const i = (final ?? "").indexOf(text);
    if (i < 0 || !marks) { problems.push(`marks: ${text} missing`); continue; }
    for (let j = i; j < i + text.length; j++) if ((marks[j] ?? "") !== key) { problems.push(`marks: ${text} has ${JSON.stringify(marks.slice(i, i + text.length))}`); break; }
  }
  const match = (n, x) => n.kind === x.kind && (x.includes === undefined || (n.lost ?? "").includes(x.includes)) && (!x.tab || n.tab === x.tab);
  for (const x of e.notices) if (!notices.some((n) => match(n, x))) problems.push(`missing notice ${JSON.stringify(x)}`);
  for (const n of notices) if (!e.notices.some((x) => match(n, x))) problems.push(`unexpected notice ${n.tab ? n.tab + " " : ""}${n.kind}: ${JSON.stringify(n.lost)}`);
}

async function runTab(row) {
  const sim = new Sim(row.seed ?? 1);
  const initial = { blocks: { p: { t: "p", c: row.text ?? P } }, deleted: {} };
  const rf = row.refuse;
  const refuse = rf ? (id) => (id === rf.tab && sim.t >= rf.from && sim.t <= rf.to ? { status: rf.status, body: { code: rf.status === 413 ? "too-large" : "refused" } } : null) : () => null;
  const room = createRoom(sim, { page: initial }, { latency: () => 40, answerLatency: () => 40, refuse });
  const tabs = new Map((row.tabs ?? ["a", "b"]).map((id) => [id, makeTab(sim, room, id, clone(initial), { person: row.person ?? id })]));
  for (const t of tabs.values()) t.start();
  const problems = [];
  const tails = {};
  let file = clone(initial);
  let z = null, zn = 0;
  for (const n of row.never ?? []) {
    const t = tabs.get(n.tab);
    t.store.onRebase(() => queueMicrotask(() => { if (t.view && t.view.includes(n.includes) && !problems.includes(`${n.tab} showed ${n.includes}`)) problems.push(`${n.tab} showed ${n.includes}`); }));
  }
  const undo = (t) => {
    if (t.view !== (t.r.S ? t.r.S.c : null)) { problems.push(`undo at ${sim.t}: ${t.id} has text in flight`); return; }
    const prov = t.r.prov;
    for (let i = prov.length - 1; i >= 0; i--) {
      if (prov[i].a !== t.id) continue;
      let j = i;
      while (j - 1 >= 0 && prov[j - 1].a === t.id) j--;
      t.replace(j, i + 1, "");
      i = j;
    }
  };
  const act = (a, t) => {
    if (a.replace !== undefined) { const [f, e] = rangeOf(t.view, a.replace); t.replace(f, e, a.text ?? "", a.key ?? ""); }
    else if (a.format !== undefined) { const [f, e] = rangeOf(t.view, a.format); t.format(f, e, a.key); }
    else if (a.split !== undefined) { tails[a.tab] = t.view.slice(a.split); t.replace(a.split, t.view.length, ""); }
    else if (a.remove) t.remove();
    else if (a.compose !== undefined) t.compose(a.compose);
    else if (a.undo) undo(t);
    else if (a.offline) room.close(a.offline);
    else if (a.online) room.open(a.online);
    else if (a.checkpoint) { file = clone(room.stores.get("page").value); room.land("page", room.seq); }
    else if (a.restart) room.restart({ page: file });
    else if (a.inject) {
      if (!z) { z = room.transport("z"); z.start({ open() {}, close() {}, frame() {}, writer() {} }); room.open("z"); }
      const value = a.inject.w ? { ...a.inject, w: { ...a.inject.w, e: room.epoch } } : a.inject;
      z.send("z", { name: "page", n: ++zn, epoch: room.epoch, ops: [{ op: "set", path: ["blocks", "p"], value }] });
    } else if (a.view) {
      const v = tabs.get(a.view.tab).view;
      if (v !== a.view.text) problems.push(`at ${a.at} ${a.view.tab} shows ${JSON.stringify(v)}`);
    }
  };
  for (const a of row.script) {
    const t = a.tab ? tabs.get(a.tab) : null;
    if (a.type === undefined) { sim.at(a.at, () => act(a, t)); continue; }
    const cps = a.cps ?? 8;
    if (!cps) { sim.at(a.at, () => { t.caret = resolveCaret(t.view, a.caret); t.type(a.type, a.key ?? ""); }); continue; }
    [...a.type].forEach((ch, i) => sim.at(a.at + (i * 1000) / cps, () => { if (i === 0) t.caret = resolveCaret(t.view, a.caret); t.type(ch, a.key ?? ""); }));
  }
  await sim.run(row.until ?? Math.max(...row.script.map((a) => a.at)) + 15000);
  await sim.idle(5000);

  const v = room.stores.get("page").value;
  const raw = (v.blocks && v.blocks.p) || null;
  const live = raw && !(v.deleted && v.deleted.p);
  const final = live ? raw.c : null;
  const marks = live ? raw.m ?? new Array(raw.c.length).fill("") : null;
  const views = [...tabs.values()].map((t) => t.view);
  if (row.expect.text === null && raw) problems.push(`the room still holds a block under the tombstone: ${JSON.stringify(raw.c)}`);
  for (const t of tabs.values()) {
    if (t.view !== final) problems.push(`${t.id} shows ${JSON.stringify(t.view)}`);
    else if (final !== null && JSON.stringify(t.marks) !== JSON.stringify(marks)) problems.push(`${t.id} marks differ`);
  }
  for (const [id, tail] of Object.entries(row.expect.tail ?? {})) if (tails[id] !== tail) problems.push(`tail ${JSON.stringify(tails[id])}`);
  const notices = [...tabs.values()].flatMap((t) => t.allNotices().map((n) => ({ ...n, tab: t.id })));
  checkResult(row, { final, marks, notices }, problems);
  const extra = row.expect.check?.({ room, tabs, sim });
  if (extra) problems.push(extra);
  return { final, views, notices, problems };
}

function runCore(row) {
  const seed = typeof row.seed === "string" ? { t: "p", c: row.seed } : row.seed;
  const r = createReplay(seed, { seq: row.seq ?? 0, epoch: "e1", me: row.me ?? "c" });
  const problems = [];
  for (const [op, ...args] of typeof row.steps === "function" ? row.steps() : row.steps) {
    if (op === "step") step(r, args[0], args[1]);
    else if (op === "join") join(r, args[0], args[1], args[2] ?? {});
    else if (op === "expect" && (r.S ? r.S.c : null) !== args[0]) problems.push(`midway ${JSON.stringify(r.S && r.S.c)}`);
  }
  const final = r.S ? r.S.c : null;
  checkResult(row, { final, marks: r.marks, notices: r.conflicts }, problems);
  const extra = row.expect.check?.(r);
  if (extra) problems.push(extra);
  return { final, views: [final], notices: r.conflicts, problems };
}

export async function runRow(row) {
  const saved = { ...LIMITS };
  Object.assign(LIMITS, row.limits ?? {});
  try {
    const out = row.kind === "core" ? runCore(row) : await runTab(row);
    return { id: row.id, source: row.source, policy: row.policy ?? null, pass: out.problems.length === 0, ...out };
  } finally {
    Object.assign(LIMITS, saved);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const show = (s) => (s === null ? "(no block)" : s.length > 70 ? s.slice(0, 33) + "…" + s.slice(-33) : s);
  let failed = 0;
  for (const row of ROWS.filter((x) => !only.length || only.includes(x.id))) {
    const out = await runRow(row);
    if (!out.pass) failed++;
    const kinds = [...new Set(out.notices.map((n) => `${n.kind}: ${JSON.stringify(n.lost)}`))];
    console.log(`${out.pass ? "pass" : "FAIL"}  ${row.id.padEnd(22)} ${JSON.stringify(show(out.final))}${kinds.length ? "\n      notices: " + kinds.join(" | ").slice(0, 300) : ""}${out.policy ? "\n      policy: " + out.policy : ""}${out.problems.length ? "\n      " + out.problems.join("\n      ") : ""}`);
  }
  console.log(`\n${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
