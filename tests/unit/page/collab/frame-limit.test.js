// 64 KB frames: a block write carries the block's whole value, so the frame
// bounds a paragraph. A 40 KB paragraph edits like any other; a write past the
// frame is undone in the tab and its text goes in a refused notice.
import { jest } from "@jest/globals";
import { Sim, createRoom, LIMITS } from "./room-double.js";
import { engine, find } from "./blocks/editor-tab.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";

const filler = (n) => { let s = ""; for (let i = 0; s.length < n; i++) s += `w${i} `; return s.slice(0, n); };

async function tabs(text) {
  const sim = new Sim(), initial = engine.initial(text);
  const room = createRoom(sim, { page: initial });
  const list = ["a", "b"].map((id) => engine.makeTab(sim, room, id, JSON.parse(JSON.stringify(initial))));
  for (const t of list) t.start();
  await sim.run(500);
  const roomText = () => room.stores.get("page").value.blocks.p.c;
  const done = () => { for (const t of list) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } };
  return { sim, list, roomText, done };
}

test("a 40 KB paragraph edits from two tabs, with no notice", async () => {
  const text = filler(40000);
  const { sim, list: [a, b], roomText, done } = await tabs(text);
  sim.at(600, () => a.replace(20000, 20000, " alpha"));
  sim.at(620, () => b.replace(10, 10, " beta"));
  await sim.run(8000);
  const room = roomText();
  const notices = [a, b].flatMap((t) => t.allNotices());
  done();
  expect(room.length).toBe(40011);
  expect(room).toContain(" alpha");
  expect(room).toContain(" beta");
  expect([a.view, b.view]).toEqual([room, room]);
  expect(notices).toEqual([]);
});

test("typing into a 70 KB paragraph is undone, and the typed text is in a refused notice", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const text = filler(70000);
  const { sim, list: [a, b], roomText, done } = await tabs(text);
  sim.at(600, () => a.replace(100, 100, " delta"));
  await sim.run(8000);
  const room = roomText();
  const notices = a.allNotices();
  done();
  warn.mockRestore();
  expect(room).toBe(text);
  expect([a.view, b.view]).toEqual([text, text]);
  expect(notices.map((n) => [n.kind, n.lost])).toEqual([["refused", " delta"]]);
});

test("pasting 70 KB over a short paragraph is undone, and the paste is in a refused notice", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const big = filler(70000);
  const { sim, list: [a], roomText, done } = await tabs("A short paragraph.");
  sim.at(600, () => a.replace(0, 18, big));
  await sim.run(8000);
  const room = roomText();
  const notices = a.allNotices();
  done();
  warn.mockRestore();
  expect(room).toBe("A short paragraph.");
  expect(notices.map((n) => [n.kind, n.lost])).toEqual([["refused", big]]);
});

const clone = (v) => JSON.parse(JSON.stringify(v));
const caretAtEnd = (tab, id) => {
  const f = find(tab.editor.state.doc, id);
  tab.editor.dispatch(tab.editor.state.tr.setSelection(pmState.TextSelection.create(tab.editor.state.doc, f.pos + 1 + f.node.content.size)));
};

test("Opus 2: against a host still on 16 KB, keystrokes packed into one frame it answers 413 land in smaller frames, with no notice", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const was = LIMITS.bodyBytes;
  LIMITS.bodyBytes = 16 * 1024;
  try {
    const sim = new Sim(4), initial = engine.initial(filler(6000));
    const room = createRoom(sim, { page: initial }, { latency: () => 60, answerLatency: () => 120 });
    const a = engine.makeTab(sim, room, "a", clone(initial));
    a.start();
    await sim.run(500);
    a.caret = 3000;
    "hello".split("").forEach((ch, i) => sim.at(600 + i * 15, () => a.type(ch)));
    await sim.run(10000);
    const text = room.stores.get("page").value.blocks.p.c;
    const notices = a.allNotices();
    a.binding.dispose(); a.editor.destroy(); a.lane.stop();
    expect(room.refused.length).toBeGreaterThan(0);
    expect(text).toContain("hello");
    expect(a.view).toBe(text);
    expect(notices).toEqual([]);
  } finally {
    LIMITS.bodyBytes = was;
    warn.mockRestore();
  }
});

test("Opus 6, Astra 4: an op too large for a frame raises a refused notice for its own block only, not for a landed write still waiting for its echo", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const sim = new Sim();
  const initial = { blocks: { p: { t: "paragraph", pos: "M", c: "Short." }, q: { t: "paragraph", pos: "V", c: filler(70000) } }, deleted: {} };
  const room = createRoom(sim, { page: initial }, { latency: () => 400, answerLatency: () => 40 });
  const a = engine.makeTab(sim, room, "a", clone(initial));
  a.start();
  await sim.run(500);
  sim.at(600, () => a.replace(6, 6, " alpha"));
  sim.at(700, () => {
    const q = find(a.editor.state.doc, "q");
    a.editor.dispatch(a.editor.state.tr.setSelection(pmState.TextSelection.create(a.editor.state.doc, q.pos + 1)));
    a.input("delta ");
  });
  const shown = [];
  for (let t = 650; t <= 3000; t += 25) sim.at(t, () => shown.push(a.blocks().find(([id]) => id === "p")[1]));
  await sim.run(6000);
  const notices = a.allNotices().map((n) => [n.kind, n.id, n.lost]);
  const roomP = room.stores.get("page").value.blocks.p.c;
  a.binding.dispose(); a.editor.destroy(); a.lane.stop();
  warn.mockRestore();
  expect(roomP).toBe("Short. alpha");
  expect(notices).toEqual([["refused", "q", "delta "]]);
  expect(shown.filter((c) => c !== "Short. alpha")).toEqual([]);
});

test("Opus 7: a write queued behind an op too large for a frame is sent at once", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const sim = new Sim(3);
  const initial = { blocks: { p: { t: "paragraph", pos: "M", c: "Short paragraph." }, q: { t: "paragraph", pos: "V", c: "Other block" } }, deleted: {} };
  const room = createRoom(sim, { page: initial });
  const a = engine.makeTab(sim, room, "a", clone(initial));
  a.start();
  await sim.run(500);
  sim.at(600, () => {
    a.replace(0, 16, "w ".repeat(36000));
    caretAtEnd(a, "q");
    a.input(" typed");
  });
  await sim.run(2000);
  const q = room.stores.get("page").value.blocks.q.c;
  const pending = a.store.pending.length;
  a.binding.dispose(); a.editor.destroy(); a.lane.stop();
  warn.mockRestore();
  expect(q).toBe("Other block typed");
  expect(pending).toBe(0);
});
