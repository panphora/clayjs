// An open composition (an IME) holds only its own block (round 10, rule 2): a
// peer's edit to another block lands while it is open; a peer's edit to the
// composing block waits for compositionend, then lands with the composed text
// kept. jsdom composition events; the real-IME check is S5.
import { jest } from "@jest/globals";
import { Sim, createRoom } from "./room-double.js";
import { engine, find } from "./blocks/editor-tab.js";
import { state as pmState } from "../../../../src/vendor/prosemirror.vendor.js";
import { pendingIds } from "../../../../src/lib/unsaved-state.js";

let warn;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());
const copy = (v) => JSON.parse(JSON.stringify(v));
const init = () => ({ blocks: { p: { t: "paragraph", pos: "M", c: "Start." }, q: { t: "paragraph", pos: "V", c: "Other." } }, deleted: {} });
const caretAt = (t, id, off) => {
  const ed = t.editor, f = find(ed.state.doc, id);
  ed.dispatch(ed.state.tr.setSelection(pmState.TextSelection.create(ed.state.doc, f.pos + 1 + off)));
};
const textOf = (t, id) => find(t.editor.state.doc, id)?.node.textContent ?? null;

function setup() {
  const sim = new Sim(3);
  const room = createRoom(sim, { page: init() }, { latency: () => 60, answerLatency: () => 60 });
  const a = engine.makeTab(sim, room, "a", init()), b = engine.makeTab(sim, room, "b", init());
  a.start(); b.start();
  return { sim, room, a, b, done: () => { for (const t of [a, b]) { t.binding.dispose(); t.editor.destroy(); t.lane.stop(); } } };
}

test("rule 2: a peer's edit to another block lands while a composition is open", async () => {
  const { sim, a, b, done } = setup();
  await sim.run(500);
  let pDom = null;
  sim.at(600, () => { caretAt(a, "p", 6); a.compose(true); a.input(" 日本"); pDom = a.editor.dom.children[0].firstChild; });
  sim.at(700, () => { caretAt(b, "q", 6); b.input(" peer"); });
  await sim.run(2000);
  // ProseMirror redrew only q: the composing paragraph keeps its DOM text node.
  const during = { q: textOf(a, "q"), p: textOf(a, "p"), held: pendingIds().includes("page:held"), head: a.editor.state.selection.head, sameNode: a.editor.dom.children[0].firstChild === pDom && pDom.nodeValue === "Start. 日本", composing: a.editor.composing };
  sim.at(2100, () => a.compose(false));
  await sim.run(5000);
  await sim.idle(2000);
  const after = { a: [textOf(a, "p"), textOf(a, "q")], b: [textOf(b, "p"), textOf(b, "q")], held: pendingIds().includes("page:held") };
  done();
  expect(during).toEqual({ q: "Other. peer", p: "Start. 日本", held: true, head: 1 + 9, sameNode: true, composing: true });
  expect(after).toEqual({ a: ["Start. 日本", "Other. peer"], b: ["Start. 日本", "Other. peer"], held: false });
});

test("rule 2: a peer's edit to the composing block waits for compositionend, then lands with the composed text kept", async () => {
  const { sim, a, b, done } = setup();
  await sim.run(500);
  sim.at(600, () => { caretAt(a, "p", 6); a.compose(true); a.input(" 日"); });
  sim.at(700, () => { caretAt(b, "p", 0); b.input("Peer: "); });
  sim.at(900, () => a.input("本"));
  await sim.run(2000);
  const during = textOf(a, "p");
  sim.at(2100, () => a.compose(false));
  await sim.run(5000);
  await sim.idle(2000);
  const after = { a: textOf(a, "p"), b: textOf(b, "p"), notices: [...a.allNotices(), ...b.allNotices()].length };
  done();
  expect(during).toBe("Start. 日本");
  expect(after).toEqual({ a: "Peer: Start. 日本", b: "Peer: Start. 日本", notices: 0 });
});

test("rule 2: a composition that moves to another block holds the page", async () => {
  const { sim, a, b, done } = setup();
  await sim.run(500);
  sim.at(600, () => { caretAt(a, "p", 6); a.compose(true); caretAt(a, "q", 6); });
  sim.at(700, () => { caretAt(b, "p", 0); b.input("Peer: "); });
  await sim.run(2000);
  const during = textOf(a, "p");
  sim.at(2100, () => a.compose(false));
  await sim.run(5000);
  const after = textOf(a, "p");
  done();
  expect({ during, after }).toEqual({ during: "Start.", after: "Peer: Start." });
});

// jsdom gives the editor no focus, so ProseMirror never writes the DOM
// selection here: the DOM caret is S5's check.
test("rule 2: a peer's edit above the composing block shifts it without touching its DOM text", async () => {
  const { sim, a, b, done } = setup();
  await sim.run(500);
  let qDom = null;
  sim.at(600, () => { caretAt(a, "q", 6); a.compose(true); a.input(" 日本"); qDom = a.editor.dom.children[1].firstChild; });
  sim.at(700, () => { caretAt(b, "p", 0); b.input("Peer: "); });
  await sim.run(2000);
  const during = { p: textOf(a, "p"), q: textOf(a, "q"), sameNode: a.editor.dom.children[1].firstChild === qDom, head: a.editor.state.selection.head };
  sim.at(2100, () => a.compose(false));
  await sim.run(5000);
  const after = [textOf(b, "p"), textOf(b, "q")];
  done();
  expect(during).toEqual({ p: "Peer: Start.", q: "Other. 日本", sameNode: true, head: 14 + 1 + 9 });
  expect(after).toEqual(["Peer: Start.", "Other. 日本"]);
});
