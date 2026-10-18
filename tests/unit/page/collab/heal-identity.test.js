// The heal notice by identity (src/page/heal-check.js), against the round 7
// review fixtures. Opus 3, 4, 5 and Astra 5, 6, 7: the round 7 rule matched
// words, so it flagged ordinary edits made after a room loss and missed lost
// words that also stand elsewhere in the block.
import { runRow } from "./text/rows.js";
import { engines } from "./engines.js";
import { createReplay } from "../../../../src/page/replay.js";
import { createHealCheck } from "../../../../src/page/heal-check.js";

const all = await engines("blocks,text");

// a types a sentence, the room restarts from the file, and an edit follows
// inside the check window (quiet × 6 = 3 s after the new epoch).
const typed = " The quick brown fox jumps";
const afterLoss = (id, source, act, text, only = null, more = {}) => ({
  id, source, text: "Start.", tabs: ["a", "b"], only,
  script: [
    { at: 600, tab: "a", caret: 6, type: typed, cps: 0 },
    { at: 1900, checkpoint: true },
    { at: 2000, restart: true },
    ...act,
  ],
  expect: { text, notices: [], ...more },
});

// The tail of a split lives on as its own block, in the room and every tab
// (round 8 review: the Enter row checked only the first half).
const tailBlock = (tail) => ({ room, tabs }) => {
  // The text engine has one block: its split only cuts the tail (rows.js).
  if (![...tabs.values()].every((t) => t.blocks)) return null;
  const v = room.stores.get("page").value;
  const live = Object.entries(v.blocks).filter(([id]) => !(v.deleted && v.deleted[id])).map(([, b]) => b.c);
  if (!live.includes(tail)) return `the room has no block ${JSON.stringify(tail)}: ${JSON.stringify(live)}`;
  for (const t of tabs.values()) if (t.blocks && !t.blocks().some(([, c]) => c === tail)) return `${t.id} has no block ${JSON.stringify(tail)}`;
  return null;
};

const ROWS = [
  afterLoss("own backspace of the last word", "Opus 3", [{ at: 2600, tab: "a", replace: " jumps", text: "" }], "Start. The quick brown fox"),
  afterLoss("own Enter mid-paragraph", "Opus 3", [{ at: 2600, tab: "a", split: 16 }], "Start. The quick", null, { tail: { a: " brown fox jumps" }, check: tailBlock(" brown fox jumps") }),
  afterLoss("peer deletes a's word", "Opus 3", [{ at: 2600, tab: "b", replace: " brown", text: "" }], "Start. The quick fox jumps"),
  afterLoss("own edit of a middle word", "Opus 3", [{ at: 2600, tab: "a", caret: { after: "quick" }, type: "est", cps: 0 }], "Start. The quickest brown fox jumps"),
  afterLoss("own undo of the typing", "Opus 3", [{ at: 2600, tab: "a", undo: true }], "Start.", "blocks"),
  afterLoss("own delete, then a second loss", "Opus 3", [{ at: 2600, tab: "a", replace: " brown", text: "" }, { at: 3000, checkpoint: true }, { at: 3100, restart: true }], "Start. The quick fox jumps"),
  {
    id: "typed in the window, deleted, then a second loss", source: "Opus 5", text: "The quick brown fox.", tabs: ["a", "b"],
    script: [
      { at: 990, checkpoint: true },
      { at: 1000, restart: true },
      { at: 1500, tab: "a", caret: { after: "fox" }, type: " hello", cps: 0 },
      { at: 6000, tab: "a", replace: " hello", text: "" },
      { at: 7000, tab: "a", caret: { after: "fox" }, type: " world", cps: 0 },
      { at: 7990, checkpoint: true },
      { at: 8000, restart: true },
    ],
    expect: { text: "The quick brown fox world.", notices: [] },
  },
  {
    id: "deliberate delete after restart", source: "Astra 5", text: "Start.", tabs: ["a"],
    script: [
      { at: 1000, tab: "a", caret: "end", type: " alpha", cps: 0 },
      { at: 2000, restart: true },
      { at: 3000, tab: "a", replace: " alpha", text: "" },
    ],
    expect: { text: "Start.", notices: [] },
  },
  {
    id: "separate words with a matching last character", source: "Astra 6", text: "art cats.", tabs: ["a"],
    script: [
      { at: 1000, tab: "a", caret: "end", type: " x", cps: 0 },
      { at: 2000, restart: true },
      { at: 3000, tab: "a", caret: { after: "art" }, type: "s", cps: 0 },
      { at: 3500, tab: "a", caret: { after: "cats" }, type: "!", cps: 0 },
    ],
    expect: { text: "arts cats! x.", notices: [] },
  },
  {
    id: "brackets around an own word", source: "Astra 7", text: "Start.", tabs: ["a"],
    script: [
      { at: 1000, tab: "a", caret: "end", type: " one two three ", cps: 0 },
      { at: 2000, restart: true },
      { at: 3000, tab: "a", caret: { before: "two" }, type: "(", cps: 0 },
      { at: 3500, tab: "a", caret: { after: "two" }, type: ")", cps: 0 },
    ],
    expect: { text: "Start one (two) three .", notices: [] },
  },
  {
    id: "peer deletes the twin of a's word", source: "identity", text: "the end.", tabs: ["a", "b"],
    script: [
      { at: 600, tab: "a", caret: "end", type: " end", cps: 0 },
      { at: 1900, checkpoint: true },
      { at: 2000, restart: true },
      { at: 2600, tab: "b", replace: [3, 7], text: "" },
    ],
    expect: { text: "the end.", notices: [] },
  },
];

describe.each(all.map((e) => [e.name, e]))("heal notice after a loss, %s engine", (name, engine) => {
  test.each(ROWS.filter((r) => !r.only || r.only === name).map((r) => [`${r.source}: ${r.id}`, r]))("%s", async (_id, row) => {
    const out = await runRow(row, engine);
    expect(out.problems).toEqual([]);
  });
});

// The rule itself, on one replay: a's units carry ids, and a loss that drops
// them gives one notice a run, whatever else the block holds. A join rebuilds
// the units, so the ids cross it by a character alignment, which may keep a
// space next to a lost word instead of the word's own (hence the trims).
function harness(c) {
  const r = createReplay({ t: "p", c }, { me: "a", epoch: "e1" });
  const notices = [];
  const hc = createHealCheck({ r, me: "a", quiet: 500, setTimer: () => 1, clearTimer: () => {}, ready: () => true, notice: (lost) => notices.push(lost) });
  let seq = 0;
  const write = (a, from, to, t) => {
    const before = r.S.c;
    if (a === "a") hc.edit(from, to, t);
    const X = { t: "p", c: before.slice(0, from) + t + before.slice(to), w: { a, e: "e1", k: seq, s: [[from, to, before.slice(from, to), before.length]] } };
    if (a === "a") hc.wrote(X);
    hc.step(X, ++seq);
    hc.released(r.S.c);
  };
  const lose = (c2) => { hc.arm(); hc.join({ t: "p", c: c2 }, seq + 10, { epoch: "e2", since: 0 }); hc.released(r.S.c); hc.check(); };
  return { r, hc, notices, write, lose };
}

test("Opus 4: a lost ' not' gets a notice although 'nothing' stands in the block", () => {
  const h = harness("I do agree.");
  h.write("a", 4, 4, " not");
  h.write("b", 14, 14, ", and nothing else");
  expect(h.r.S.c).toBe("I do not agree, and nothing else.");
  h.lose("I do agree, and nothing else.");
  expect(h.notices.length).toBe(1);
  expect(h.notices[0]).toMatch(/not/);
});

test("Opus 4: a lost middle 'the' gets a notice although 'the' stands elsewhere", () => {
  const h = harness("The fox jumps over lazy dog, the end.");
  h.write("a", 18, 18, " the");
  h.lose("The fox jumps over lazy dog, the end.");
  expect(h.notices.map((t) => t.trim())).toEqual(["the"]);
});

test("Opus 4: a word typed after the loss and lost again gets a notice although it stands elsewhere", () => {
  const h = harness("This is it.");
  h.hc.arm();
  h.write("a", 10, 10, " is");
  h.hc.join({ t: "p", c: "This is it." }, 50, { epoch: "e3", since: 0 });
  h.hc.released(h.r.S.c);
  h.hc.check();
  expect(h.notices).toEqual([" is"]);
});

test("one notice per run typed, and only the part this tab did not delete", () => {
  const h = harness("A. B.");
  h.write("a", 2, 2, " one two");
  h.write("a", 13, 13, " three");
  expect(h.r.S.c).toBe("A. one two B. three");
  h.write("a", 6, 10, "");
  expect(h.r.S.c).toBe("A. one B. three");
  h.lose("A. B.");
  expect(h.notices.map((t) => t.trim())).toEqual(["one", "three"]);
});

test("a peer's delete of a's text is never a loss, and neither is a's own", () => {
  const h = harness("x.");
  h.write("a", 1, 1, " kept gone mine");
  h.write("b", 6, 11, "");
  h.write("a", 6, 11, "");
  expect(h.r.S.c).toBe("x kept.");
  h.lose("x kept.");
  expect(h.notices).toEqual([]);
});

test("a format keeps the ids of the text it covers: not an own delete, so a later loss of it is still noticed", async () => {
  const { Sim, createRoom } = await import("./room-double.js");
  const { engine } = await import("./blocks/editor-tab.js");
  const sim = new Sim(3), initial = engine.initial("Start.");
  const room = createRoom(sim, { page: initial });
  const a = engine.makeTab(sim, room, "a", JSON.parse(JSON.stringify(initial)));
  a.start();
  await sim.run(500);
  a.caret = 6;
  a.type(" alpha");
  await sim.run(2000);
  const heal = a.binding.blocks.get("p").heal;
  const before = heal.ids.view;
  a.format(7, 12, "b");
  await sim.run(4000);
  expect(a.view).toBe("Start. alpha");
  expect(heal.ids.view).toEqual(before);
  expect(heal.ids.agreed).toEqual(before);
  expect(before.filter(Boolean).length).toBe(6);
  heal.arm();
  heal.join({ t: "paragraph", c: "Start." }, 999, { epoch: "lost", since: 0 });
  heal.released("Start.");
  expect(heal.lostRuns()).toEqual([" alpha"]);
  a.binding.dispose(); a.editor.destroy(); a.lane.stop();
});

// Round 8 review, Astra 4: repeated text. This tab types "the " in front of
// "the end."; a room rebuilt from "the end." holds one "the ", and an
// alignment cannot tell which copy it is. Not proven kept, so it gets a notice.
test("Astra 4: a lost copy of repeated text gets a notice", () => {
  const h = harness("the end.");
  h.write("a", 0, 0, "the ");
  expect(h.r.S.c).toBe("the the end.");
  h.lose("the end.");
  expect(h.notices.map((t) => t.trim())).toEqual(["the"]);
});

test("a join that keeps all the text, repeated words included, gives no notice", () => {
  const h = harness("the end.");
  h.write("a", 0, 0, "the ");
  h.lose("the the end.");
  expect(h.notices).toEqual([]);
});

// Round 9 review, Opus 4 and Astra 2: two alignments that agree do not prove
// a match. A unit counts as kept only when every longest alignment keeps it.
const nonSpace = (t) => t.replace(/\s/g, "").length;

test("Opus 4: 'the cat.' → 'the the cat Yes.', room back to 'the cat.': both 'the' and ' Yes' are named", () => {
  for (const at of [0, 4]) {
    const h = harness("the cat.");
    h.write("a", at, at, "the ");
    h.write("a", 11, 11, " Yes");
    expect(h.r.S.c).toBe("the the cat Yes.");
    h.lose("the cat.");
    expect(h.notices.map((t) => t.trim()).sort()).toEqual(["Yes", "the"]);
  }
});

test("Astra 2: 'the end.' with 'the ' typed in front, room back to 'the dog.': 'the' is named", () => {
  const h = harness("the end.");
  h.write("a", 0, 0, "the ");
  h.lose("the dog.");
  expect(h.notices.map((t) => t.trim())).toEqual(["the"]);
});

test("Astra 2: 'aa' → 'aaa', room back to 'ab': the typed 'a' is named", () => {
  const h = harness("aa");
  h.write("a", 0, 0, "a");
  h.lose("ab");
  expect(h.notices).toEqual(["a"]);
});

test("Astra 2: 'go go' → 'go go go', room back to 'go no': the typed 'go ' is named", () => {
  const h = harness("go go");
  h.write("a", 0, 0, "go ");
  h.lose("go no");
  expect(h.notices.map((t) => t.trim())).toEqual(["go"]);
});

test("Opus 4: 'I said no.' → 'I said no, no Bye.', room back to 'I said no.': every lost character is named", () => {
  for (const [at, t] of [[7, "no, "], [9, ", no"], [6, " no,"]]) {
    const h = harness("I said no.");
    h.write("a", at, at, t);
    h.write("a", 13, 13, " Bye");
    expect(h.r.S.c).toBe("I said no, no Bye.");
    h.lose("I said no.");
    expect(nonSpace(h.notices.join(""))).toBe(nonSpace(", no Bye"));
  }
});

test("Opus 4: 'See the cat and the dog.' with ' the' and ' Done' typed, room back: both are named", () => {
  for (const [at, t] of [[3, " the"], [4, "the "], [7, " the"]]) {
    const h = harness("See the cat and the dog.");
    h.write("a", at, at, t);
    h.write("a", 27, 27, " Done");
    expect(h.r.S.c).toBe("See the the cat and the dog Done.");
    h.lose("See the cat and the dog.");
    expect(nonSpace(h.notices.join(""))).toBe(nonSpace(" the Done"));
  }
});

// Opus 4's randomized run: several words typed from a small vocabulary (so
// they repeat what stands), then the room comes back as the text before them.
// Every typed character is lost, and the notices must name at least as many.
test("Opus 4: randomized multi-edit, 20,000 runs: no run names fewer non-space characters than it lost", () => {
  let s = 7;
  const rand = (n) => { s = (s * 1664525 + 1013904223) >>> 0; return s % n; };
  const vocab = ["the", "cat", "no", "a", "dog", "the cat", "no no"];
  let short = 0;
  const bad = [];
  for (let run = 0; run < 20000; run++) {
    const words = Array.from({ length: 2 + rand(4) }, () => vocab[rand(vocab.length)]);
    const base = words.join(" ") + ".";
    const h = harness(base);
    let typed = 0;
    for (let e = 0, edits = 2 + rand(3); e < edits; e++) {
      const c = h.r.S.c;
      const spots = [0];
      for (let i = 0; i < c.length; i++) if (c[i] === " " || c[i] === ".") spots.push(i);
      const at = spots[rand(spots.length)];
      const word = vocab[rand(vocab.length)];
      const t = at === 0 ? word + " " : " " + word;
      h.write("a", at, at, t);
      typed += nonSpace(t);
    }
    h.lose(base);
    if (nonSpace(h.notices.join("")) < typed) { short++; if (bad.length < 3) bad.push({ base, typed: h.r.S.c, notices: h.notices }); }
  }
  expect({ short, bad }).toEqual({ short: 0, bad: [] });
});

// Round 11 review, Astra 2 and Opus 2: past SURE_CELLS, a side no window
// proved sure is not proven kept either, so a lost copy of repeated text far
// from where the check stopped is named, never carried onto another copy.
test("Astra 2: 'the ' × 512 + 'end.' with 'the ' typed in front, room back: 'the' is named (and at 60 KB)", () => {
  for (const reps of [512, 15000]) {
    const base = "the ".repeat(reps) + "end.";
    const h = harness(base);
    h.write("a", 0, 0, "the ");
    h.lose(base);
    expect(h.notices.map((t) => t.trim())).toEqual(["the"]);
  }
});

test("Opus 2: 'ha ' × k with one more 'ha ' typed at 3, room back: it is named at every length", () => {
  for (const reps of [100, 340, 350, 400, 1000, 4000, 20000]) {
    const base = "ha ".repeat(reps) + "end.";
    const h = harness(base);
    h.write("a", 3, 3, "ha ");
    h.lose(base);
    expect([reps, h.notices.map((t) => t.trim())]).toEqual([reps, ["ha"]]);
  }
});

test("Opus 2: '=' × 60000 with '===' typed in the middle, room back: it is named", () => {
  const base = "=".repeat(60000);
  const h = harness(base);
  h.write("a", 30000, 30000, "===");
  h.lose(base);
  expect(h.notices).toEqual(["==="]);
});

// Round 12, decision 5: a notice names the whole word a lost unit is in, with
// the space before it, even when the rest of the word is still there.
test("a word partly lost is named whole, with the space before it", () => {
  const h = harness("x.");
  h.write("a", 1, 1, " hello");
  expect(h.r.S.c).toBe("x hello.");
  h.lose("x hel.");
  expect(h.notices).toEqual([" hello"]);
});

test("a word whose letters all stand gives no notice, and only the lost word of a run is named", () => {
  const h = harness("x.");
  h.write("a", 1, 1, " one dog sun");
  h.lose("x one sun.");
  expect(h.notices.map((t) => t.trim())).toEqual(["dog"]);
});

// Round 8 review, Opus 5: Enter mid-paragraph, then typing into the new block
// within 10 ms, before its first release. Its text is tracked from the first
// keystroke, so a loss that drops the typing gets a notice.
test("Opus 5: text typed into a block this tab just made, before its first release, is tracked", async () => {
  const { Sim, createRoom } = await import("./room-double.js");
  const { engine, find } = await import("./blocks/editor-tab.js");
  const { state: pmState } = await import("../../../../src/vendor/prosemirror.vendor.js");
  const sim = new Sim(3), initial = engine.initial("The quick brown fox jumps");
  const room = createRoom(sim, { page: JSON.parse(JSON.stringify(initial)) }, { latency: () => 60, answerLatency: () => 60 });
  const a = engine.makeTab(sim, room, "a", JSON.parse(JSON.stringify(initial)));
  a.start();
  await sim.run(500);
  let tail;
  sim.at(600, () => { tail = a.split(9); });
  sim.at(610, () => {
    const ed = a.editor;
    const ids = [];
    ed.state.doc.forEach((n) => ids.push(n.attrs.id));
    const b = find(ed.state.doc, ids[1]);
    ed.dispatch(ed.state.tr.setSelection(pmState.TextSelection.create(ed.state.doc, b.pos + b.node.nodeSize - 1)));
    a.input(" more");
  });
  await sim.run(4000);
  const order = [];
  a.editor.state.doc.forEach((n) => order.push([n.attrs.id, n.textContent]));
  const B = a.binding.blocks.get(order[1][0]);
  expect(B.r.S.c).toBe(" brown fox jumps more");
  expect(B.heal.ids.agreed.every(Boolean)).toBe(true);
  B.heal.arm();
  B.heal.join({ t: "paragraph", c: tail }, 999, { epoch: "lost", since: 0 });
  B.heal.released(tail);
  const lost = B.heal.lostRuns();
  a.binding.dispose(); a.editor.destroy(); a.lane.stop();
  expect(lost).toEqual([" more"]);
});

// Round 8 review, Opus 6: a join (Backspace at the start of q) after the last
// checkpoint, then one room loss. The heal carries q's deletion as well as p's
// text, so q never comes back as a duplicate of the joined text.
test("Opus 6: a join across a room loss does not duplicate the joined text", async () => {
  const { Sim, createRoom } = await import("./room-double.js");
  const { engine, find } = await import("./blocks/editor-tab.js");
  const sim = new Sim(3);
  const initial = { blocks: { p: { t: "paragraph", pos: "M", c: "Start." }, q: { t: "paragraph", pos: "V", c: " world" } }, deleted: {} };
  const room = createRoom(sim, { page: JSON.parse(JSON.stringify(initial)) }, { latency: () => 60, answerLatency: () => 60 });
  const a = engine.makeTab(sim, room, "a", JSON.parse(JSON.stringify(initial)));
  const b = engine.makeTab(sim, room, "b", JSON.parse(JSON.stringify(initial)));
  a.start(); b.start();
  await sim.run(500);
  sim.at(1000, () => {
    const ed = a.editor, p = find(ed.state.doc, "p");
    const end = p.pos + p.node.nodeSize - 1;
    ed.dispatch(ed.state.tr.delete(end, end + 2));
  });
  await sim.run(1500);
  sim.at(2000, () => room.restart({ page: JSON.parse(JSON.stringify(initial)) }));
  await sim.run(20000);
  await sim.idle(5000);
  const v = room.stores.get("page").value;
  const out = { a: a.blocks(), b: b.blocks(), room: Object.entries(v.blocks).filter(([id]) => !v.deleted[id]).map(([id, x]) => [id, x.c]) };
  for (const t of [a, b]) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); }
  const one = [["p", "Start. world"]];
  expect(out).toEqual({ a: one, b: one, room: one });
});

// Two room losses 1 s apart while three tabs type, each typed character a code
// point typed once, so a character's text is its identity. A tab's heal check
// (its notices carry no seq) may name only characters the text lacks. In the
// binding, the heal a tab sends after a loss once took the ids of the joined
// text instead of the healed text, so its own heal came back without ids and
// the check named text that was there.
// The seeds whose two losses destroy typed text (ran: the rest lose none), so
// the silent check above has something to catch on every engine.
const LOSES = { blocks: [2, 5, 6], text: [2, 5, 6] };

describe.each(all.map((e) => [e.name, e]))("heal check notices only absent text, and names all of it, %s engine", (_name, engine) => {
  test.each([1, 2, 3, 4, 5, 6])("two losses 1 s apart, seed %i", async (n) => {
    const { Sim, createRoom } = await import("./room-double.js");
    const sim = new Sim(n * 7919);
    const initial = engine.initial("Start.");
    const lat = () => 20 + sim.rand() * 100;
    const room = createRoom(sim, { page: initial }, { latency: lat, answerLatency: lat });
    const tabs = ["a", "b", "c"].map((id) => engine.makeTab(sim, room, id, JSON.parse(JSON.stringify(initial))));
    tabs.forEach((t) => t.start());
    let code = 0x4e00;
    tabs.forEach((t) => {
      let at = 600 + sim.rand() * 200;
      for (let i = 0; i < 48; i++) {
        const ch = (i % 4 === 3) ? " " : String.fromCodePoint(code++);
        sim.at(at, () => { if (t.view !== null) { t.caret = t.view.length - 1; t.type(ch); } });
        at += 90 + sim.rand() * 110;
      }
    });
    let file = JSON.parse(JSON.stringify(initial));
    sim.at(2500, () => { file = JSON.parse(JSON.stringify(room.stores.get("page").value)); room.land("page", room.seq); });
    const t0 = 3000 + sim.rand() * 3000;
    sim.at(t0, () => room.restart({ page: JSON.parse(JSON.stringify(file)) }));
    sim.at(t0 + 1000, () => room.restart({ page: JSON.parse(JSON.stringify(file)) }));
    await sim.run(30000);
    await sim.idle(5000);
    const final = room.stores.get("page").value.blocks.p.c;
    const heals = tabs.flatMap((t) => t.allNotices().filter((x) => x.kind === "heal" && x.seq === undefined).map((x) => x.lost)).join(" ");
    const named = tabs.flatMap((t) => t.allNotices().map((x) => x.lost ?? "")).join("");
    // A notice names whole words (round 12): a word it names that the final
    // text holds whole is a false notice.
    const kept = heals.split(/\s+/).filter((w) => w && [...w].every((ch) => final.includes(ch)));
    // Every typed character the final text lacks is in a notice: with every
    // notice suppressed, this fails on the seeds that lose text (round 8 review).
    const lost = [];
    for (let c = 0x4e00; c < code; c++) { const ch = String.fromCodePoint(c); if (!final.includes(ch)) lost.push(ch); }
    const silent = lost.filter((ch) => !named.includes(ch));
    for (const t of tabs) { if (t.binding) { t.binding.dispose(); t.editor.destroy(); } t.lane.stop(); }
    expect(kept).toEqual([]);
    expect(silent).toEqual([]);
    if (LOSES[_name]?.includes(n)) expect(lost.length).toBeGreaterThan(0);
  }, 60_000);
});
