/**
 * @jest-environment jsdom
 */

/**
 * A move through ClayJS's sortable is one undo entry, in both recording modes.
 *
 * A drag and `clay.sortable.move` both end in the same `onEnd`/`finishMove` report.
 * That report is what history records: the item leaving its source slot and arriving in
 * its destination slot, as one entry the engine replays as a move, so undo puts the card
 * back and redo moves it again. What the vendor writes around the gesture — the
 * `draggable` and `style` attributes it puts on the item it holds and takes back after —
 * is runtime bookkeeping and never an entry of its own, and a move that the merged
 * document no longer matches is announced instead of guessed.
 *
 * The modules are the real ones: the sortable plugin with its vendored Sortable, and the
 * vendored undo engine the plugin starts.
 */

const FIXTURE = `
  <div id="board">
    <ul id="a" sortable="cards" sortable-label="To do" onsorted="window.notified.push('onsorted')">
      <li id="a1">A1</li>
      <li id="a2" style="color: red;">A2</li>
      <li id="a3">A3</li>
      <li id="a4" cms-template></li>
    </ul>
    <ul id="b" sortable="cards" onsorted="window.notified.push('onsorted')">
      <li id="b1">B1</li>
      <li id="b2">B2</li>
    </ul>
  </div>
`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const el = (id) => document.getElementById(id);
const ids = (container) => [...container.children].map((child) => child.id);
const labels = () => undo.history.map((entry) => entry.label);
const text = (node) => node.firstChild.data;

const setText = (node, value) => {
  if (node.firstChild && node.firstChild.nodeType === 3) node.firstChild.data = value;
  else node.textContent = value;
};

// A write somebody else made: it changes the document, and it is not this page's edit.
const peerWrite = (write) => {
  undo.pause();
  try { write(); } finally { undo.resume() }
};

let sortable;
let undoPlugin;
let undo;
const undoLeases = [];
const sortableLeases = [];
const unavailable = [];
const seen = [];

const enter = async ({ recording } = {}) => {
  const history = await undoPlugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true });
  history.enable();
  undoLeases.push(history);
  if (recording) undo.setRecording(recording);
  const drag = await sortable.sortableParticipant().prepare({ generation: 1, isCurrent: () => true });
  drag.enable();
  sortableLeases.push(drag);
};

// The press, the vendor's own writes during it, the release, and the drop: the order the
// vendor drives. The hold opens at the release, before the drop's own DOM write, so the
// gesture's writes reach neither the idle batch nor the command's capture.
const drag = async (item, to, before = null, { during = null, cancel = false } = {}) => {
  const from = item.parentElement;
  const oldIndex = [...from.children].indexOf(item);
  item.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  item.setAttribute("draggable", "false");
  item.setAttribute("style", "opacity: 0.4;");
  await settle();
  // The vendor's start: the press has moved past its threshold, so this is a drag and
  // not a click. A click never reaches it.
  window.Sortable.get(from).options.onStart({ item, from, to: from, oldIndex });
  if (during) during();
  if (cancel) {
    item.dispatchEvent(new window.Event("pointercancel", { bubbles: true }));
    await settle();
    return null;
  }
  item.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
  to.insertBefore(item, before);
  const newIndex = [...to.children].indexOf(item);
  window.Sortable.get(from).options.onEnd({ item, from, to, oldIndex, newIndex });
  await settle();
  await settle();
  undo.flush();
  return { item, from, to, oldIndex, newIndex };
};

beforeAll(async () => {
  window.clayEditMode = true;
  window.notified = [];
  document.addEventListener("clay:undo-unavailable", (event) => unavailable.push(event.detail));
  document.addEventListener("clay:sorted", (event) => seen.push(event.detail));
  sortable = await import("../../src/plugins/sortable.js");
  undoPlugin = await import("../../src/plugins/undo.js");
  undo = undoPlugin.undo;
  window.clay = { undo };
  // The page each module wired when it evaluated is not this suite's: every case enters
  // its own session over the fixture it just set, the way a boot and a switch do.
  (await sortable.ready)?.dispose();
  (await undoPlugin.ready)?.dispose();
});

afterAll(() => {
  window.clay = undefined;
  delete window.clayEditMode;
});

beforeEach(() => {
  // A new page starts in the default mode; a mode a case picked is that page's own.
  undo.setRecording("automatic");
  document.body.innerHTML = FIXTURE;
  window.notified = [];
  unavailable.length = 0;
  seen.length = 0;
});

afterEach(() => {
  while (sortableLeases.length) sortableLeases.pop().dispose();
  while (undoLeases.length) undoLeases.pop().dispose();
});

test("a drag is one entry in automatic mode, and its vendor writes are not another", async () => {
  await enter();

  await drag(el("a2"), el("b"), el("b1"));

  expect(labels()).toEqual(["To do"]);
  expect(ids(el("a"))).toEqual(["a1", "a3", "a4"]);
  expect(ids(el("b"))).toEqual(["a2", "b1", "b2"]);
  // The attributes the vendor wrote are back as the document had them, and the entry
  // never held them.
  expect(el("a2").getAttribute("style")).toBe("color: red;");
  expect(el("a2").hasAttribute("draggable")).toBe(false);
  // The author's handler and the public event still run, in their order, once.
  expect(window.notified).toEqual(["onsorted"]);
  expect(seen).toHaveLength(1);
});

test("a long drag whose item the vendor moves during dragover is still one entry in automatic mode", async () => {
  await enter();

  await drag(el("a2"), el("b"), el("b1"), {
    during: () => {
      el("b").insertBefore(el("a2"), el("b2"));
      el("a").appendChild(el("a2"));
      el("b").appendChild(el("a2"));
    },
  });
  await settle();
  undo.flush();

  expect(labels()).toEqual(["To do"]);
  expect(undo.undo()).toMatchObject({ ok: true });
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
});

test("a drag is one entry in commands mode, and undo puts the card back and redo moves it again", async () => {
  await enter({ recording: "commands" });

  await drag(el("a2"), el("b"), el("b1"));

  expect(labels()).toEqual(["To do"]);
  expect(undo.history[0].label).toBe("To do");

  expect(undo.undo()).toMatchObject({ ok: true, label: "To do", direction: "undo" });
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(ids(el("b"))).toEqual(["b1", "b2"]);

  expect(undo.redo()).toMatchObject({ ok: true, direction: "redo" });
  expect(ids(el("a"))).toEqual(["a1", "a3", "a4"]);
  expect(ids(el("b"))).toEqual(["a2", "b1", "b2"]);
});

test("a same-position drop and a cancelled drag make no entry", async () => {
  await enter();

  await drag(el("a2"), el("a"), el("a2"));
  expect(labels()).toEqual([]);

  await drag(el("a2"), el("b"), el("b1"), { cancel: true });
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(ids(el("b"))).toEqual(["b1", "b2"]);
  expect(labels()).toEqual([]);
  // A drop still notifies its author once, as it always has: it just is not a move.
  expect(window.notified).toEqual(["onsorted"]);
  expect(seen).toHaveLength(1);
});

test("a peer insert into the source list during the gesture makes no entry and says so", async () => {
  await enter();

  await drag(el("a2"), el("b"), el("b1"), {
    during: () => peerWrite(() => {
      const card = document.createElement("li");
      card.id = "a9";
      card.textContent = "A9";
      el("a").insertBefore(card, el("a1"));
    }),
  });

  expect(labels()).toEqual([]);
  expect(unavailable).toEqual([{ label: "To do", code: "conflicted" }]);
  // The card stays where the merged document put it; nothing is moved back.
  expect(ids(el("a"))).toEqual(["a9", "a1", "a3", "a4"]);
  expect(ids(el("b"))).toEqual(["a2", "b1", "b2"]);
});

test("a peer text edit on another card during the gesture still records the move", async () => {
  await enter({ recording: "commands" });

  await drag(el("a2"), el("b"), el("b1"), {
    during: () => peerWrite(() => setText(el("a1"), "edited by peer")),
  });

  expect(labels()).toEqual(["To do"]);
  expect(undo.undo().ok).toBe(true);
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(text(el("a1"))).toBe("edited by peer");
  expect(unavailable).toEqual([]);
});

test("an unrelated local edit during the gesture keeps its own entry, in order", async () => {
  await enter();

  await drag(el("a2"), el("b"), el("b1"), {
    during: () => setText(el("a3"), "local note"),
  });

  expect(labels()).toEqual(["Edit", "To do"]);
  expect(undo.undo().ok).toBe(true);
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(undo.undo().ok).toBe(true);
  expect(text(el("a3"))).toBe("A3");
});

test("clay.sortable.move makes one entry through the same report", async () => {
  await enter({ recording: "commands" });

  expect(sortable.move(el("a2"), el("b"), el("b1"))).toMatchObject({ ok: true, moved: true });
  await settle();
  undo.flush();

  expect(labels()).toEqual(["To do"]);
  expect(undo.undo().ok).toBe(true);
  expect(ids(el("a"))).toEqual(["a1", "a2", "a3", "a4"]);
  expect(ids(el("b"))).toEqual(["b1", "b2"]);
  expect(window.notified).toEqual(["onsorted"]);
});

test("a move inside one list records the reorder, and a container without a label says Move", async () => {
  await enter({ recording: "commands" });

  expect(sortable.move(el("b1"), el("b"), null)).toMatchObject({ ok: true, moved: true });
  await settle();
  undo.flush();

  expect(labels()).toEqual(["Move"]);
  expect(ids(el("b"))).toEqual(["b2", "b1"]);
  expect(undo.undo().ok).toBe(true);
  expect(ids(el("b"))).toEqual(["b1", "b2"]);
});
