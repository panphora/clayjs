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

// Round 11 review, Opus 5: while a composes in p, b's move of q comes with b's
// binding re-keying p to keep its order. a held p's half and applied q's, so a
// showed [q, p] while the room and b had [p, q]. Now no block moves on a's page
// until compositionend; then it shows the room's order.
const order = (t) => { const o = []; t.editor.state.doc.forEach((n) => o.push(n.attrs.id)); return o; };
const roomOrder = (room) => Object.entries(room.stores.get("page").value.blocks).sort(([i, x], [j, y]) => (x.pos < y.pos ? -1 : x.pos > y.pos ? 1 : i < j ? -1 : 1)).map(([id]) => id);
for (const [label, move] of [
  ["Opus 5: q's pos changed so it sorts first (b re-keys p)", (b) => { const f = find(b.editor.state.doc, "q"); b.editor.dispatch(b.editor.state.tr.setNodeMarkup(f.pos, null, { ...f.node.attrs, pos: "A" })); }],
  ["a real move: b drags q above p", (b) => { const ed = b.editor, f = find(ed.state.doc, "q"); const node = f.node; const tr = ed.state.tr.delete(f.pos, f.pos + node.nodeSize); tr.insert(0, node); ed.dispatch(tr); }],
]) {
  test(`${label}: no block moves on the page during a composition; after it, the room's order`, async () => {
    const { sim, room, a, b, done } = setup();
    await sim.run(500);
    let pEl = null;
    sim.at(600, () => { caretAt(a, "p", 6); a.compose(true); a.input(" 日本"); pEl = a.editor.dom.children[0]; });
    sim.at(700, () => move(b));
    await sim.run(2000);
    const during = { a: order(a), composing: a.editor.composing, sameElement: a.editor.dom.children[0] === pEl && pEl.isConnected };
    sim.at(2100, () => a.compose(false));
    await sim.run(5000);
    await sim.idle(2000);
    const after = { a: order(a), b: order(b), room: roomOrder(room), text: textOf(a, "p") };
    done();
    expect(during).toEqual({ a: ["p", "q"], composing: true, sameElement: true });
    expect(after.a).toEqual(after.room);
    expect(after.b).toEqual(after.room);
    expect(after.text).toBe("Start. 日本");
    if (label.startsWith("a real move")) expect(after.room).toEqual(["q", "p"]);
  });
}

for (const release of ['watchdog', 'transaction', 'release']) {
  test(`Astra 5 composition-no-end: real mousedown releases the move via ${release}`, async () => {
    const { sim, room, a, b, done } = setup();
    await sim.run(500);
    caretAt(a, 'p', 6);
    a.compose(true);
    a.input(' 日本');
    const pElement = a.editor.dom.children[0];
    const f = find(b.editor.state.doc, 'q');
    b.editor.dispatch(b.editor.state.tr.delete(f.pos, f.pos + f.node.nodeSize).insert(0, f.node));
    await sim.run(2000);
    expect(order(a)).toEqual(['p', 'q']);
    expect(a.editor.dom.children[0]).toBe(pElement);
    a.editor.posAtCoords = () => null;
    a.editor.dom.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    expect(a.editor.composing).toBe(false);
    if (release === 'transaction') a.editor.dispatch(a.editor.state.tr.setMeta('probe', true));
    if (release === 'release') a.binding.writerChanged();
    await sim.run(release === 'watchdog' ? 6000 : 2100);
    expect(order(a)).toEqual(roomOrder(room));
    expect(order(a)).toEqual(['q', 'p']);
    expect(textOf(a, 'p')).toBe('Start. 日本');
    expect(pendingIds().includes('page:held')).toBe(false);
    expect([...a.allNotices(), ...b.allNotices()]).toEqual([]);
    done();
  });
}

test('the watchdog never releases an editor that is still composing', async () => {
  const { sim, a, b, done } = setup();
  await sim.run(500);
  caretAt(a, 'p', 6);
  a.compose(true);
  const f = find(b.editor.state.doc, 'q');
  b.editor.dispatch(b.editor.state.tr.delete(f.pos, f.pos + f.node.nodeSize).insert(0, f.node));
  await sim.run(16000);
  expect(a.editor.composing).toBe(true);
  expect(order(a)).toEqual(['p', 'q']);
  expect(pendingIds().includes('page:held')).toBe(true);
  done();
});
