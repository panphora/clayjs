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
const afterLoss = (id, source, act, text, only = null) => ({
  id, source, text: "Start.", tabs: ["a", "b"], only,
  script: [
    { at: 600, tab: "a", caret: 6, type: typed, cps: 0 },
    { at: 1900, checkpoint: true },
    { at: 2000, restart: true },
    ...act,
  ],
  expect: { text, notices: [] },
});

const ROWS = [
  afterLoss("own backspace of the last word", "Opus 3", [{ at: 2600, tab: "a", replace: " jumps", text: "" }], "Start. The quick brown fox"),
  afterLoss("own Enter mid-paragraph", "Opus 3", [{ at: 2600, tab: "a", split: 16 }], "Start. The quick"),
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

// Two room losses 1 s apart while three tabs type, each typed character a code
// point typed once, so a character's text is its identity. A tab's heal check
// (its notices carry no seq) may name only characters the text lacks. In the
// binding, the heal a tab sends after a loss once took the ids of the joined
// text instead of the healed text, so its own heal came back without ids and
// the check named text that was there.
describe.each(all.map((e) => [e.name, e]))("heal check notices only absent text, %s engine", (_name, engine) => {
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
    const named = tabs.flatMap((t) => t.allNotices().filter((x) => x.kind === "heal" && x.seq === undefined).map((x) => x.lost)).join("");
    const kept = [...new Set(named)].filter((ch) => ch.trim() && final.includes(ch));
    for (const t of tabs) { if (t.binding) { t.binding.dispose(); t.editor.destroy(); } t.lane.stop(); }
    expect(kept).toEqual([]);
  }, 60_000);
});
