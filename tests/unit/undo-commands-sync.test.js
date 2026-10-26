/**
 * @jest-environment jsdom
 */

/**
 * Commands mode across ClayJS's asynchronous sync pause.
 *
 * A live-sync apply holds `Mutation.pause()` open across an await, which bridges
 * into `undo.pause()`. Underneath that pause a local command must still be its
 * own one entry, the apply's own writes must never become one, and the entry
 * must survive the apply settling either way.
 */

import Mutation from "../../src/lib/mutation.js";

const FIXTURE = `
  <p id="article">authored</p>
  <p id="note">authored note</p>
`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const article = () => document.getElementById("article");
const note = () => document.getElementById("note");

const setText = (el, value) => {
  if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.data = value;
  else el.textContent = value;
};

let plugin;
let undo;
const leases = [];

const enter = async () => {
  const lease = await plugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();
  leases.push(lease);
  return lease;
};

const labels = () => undo.history.map((entry) => entry.label);

beforeAll(async () => {
  window.clay = { Mutation };
  plugin = await import("../../src/plugins/undo.js");
  undo = plugin.undo;
  window.clay.undo = undo;
});

afterAll(() => {
  window.clay = undefined;
});

beforeEach(async () => {
  // A new page starts in the default mode; a mode a case picked is that page's own.
  undo.setRecording("automatic");
  document.body.innerHTML = FIXTURE;
  await settle();
});

afterEach(() => {
  while (leases.length) leases.pop().dispose();
});

test("in commands mode an unbracketed write makes no history and a clay.undo.command makes exactly one entry", async () => {
  await enter();
  window.clay.undo.setRecording("commands");

  setText(article(), "unbracketed");
  await settle();
  undo.flush();
  expect(undo.canUndo).toBe(false);
  expect(undo.history).toHaveLength(0);

  const receipt = window.clay.undo.command("Type", () => setText(article(), "commanded"));
  expect(receipt).toEqual({ id: expect.any(String), label: "Type" });
  await settle();
  undo.flush();
  expect(labels()).toEqual(["Type"]);
  expect(undo.history[0].id).toBe(receipt.id);

  expect(undo.undo().ok).toBe(true);
  expect(article().textContent).toBe("unbracketed");
});

test("commands mode survives a live exit and re-entry", async () => {
  const first = await enter();
  window.clay.undo.setRecording("commands");

  setText(article(), "unbracketed 1");
  await settle();
  undo.flush();
  expect(labels()).toEqual([]);
  expect(undo.history).toHaveLength(0);

  // Exit takes the session and its history back; entering again starts a new scope
  // over the page as it stands.
  first.dispose();
  await settle();
  await enter();

  setText(article(), "unbracketed 2");
  await settle();
  undo.flush();
  expect(labels()).toEqual([]);
  expect(undo.history).toHaveLength(0);

  const receipt = window.clay.undo.command("Type", () => setText(article(), "commanded"));
  expect(receipt).toEqual({ id: expect.any(String), label: "Type" });
  await settle();
  undo.flush();
  expect(labels()).toEqual(["Type"]);
});

test("a command run while the hub holds a sync pause records one local entry, and it undoes and redoes after the apply resolves", async () => {
  await enter();
  window.clay.undo.setRecording("commands");

  let release;
  const gate = new Promise((resolve) => { release = resolve });
  const apply = (async () => {
    Mutation.pause();
    try {
      setText(article(), "from apply");
      await gate;
      setText(article(), "from apply settled");
    } finally {
      Mutation.resume();
    }
  })();
  await settle();
  expect(undo.isPaused).toBe(true);

  const receipt = undo.command("Local edit", () => setText(note(), "local note"));
  expect(receipt).toEqual({ id: expect.any(String), label: "Local edit" });
  expect(labels()).toEqual(["Local edit"]);
  expect(undo.isPaused).toBe(true);

  release();
  await apply;
  await settle();
  undo.flush();

  expect(labels()).toEqual(["Local edit"]);
  expect(undo.undo().ok).toBe(true);
  expect(note().textContent).toBe("authored note");
  expect(article().textContent).toBe("from apply settled");

  expect(undo.redo().ok).toBe(true);
  expect(note().textContent).toBe("local note");
  expect(article().textContent).toBe("from apply settled");
});

test("a command run while the hub holds a sync pause still undoes and redoes after the apply rejects", async () => {
  await enter();
  window.clay.undo.setRecording("commands");

  let fail;
  const gate = new Promise((resolve, reject) => { fail = reject });
  const apply = (async () => {
    Mutation.pause();
    try {
      setText(article(), "from apply");
      await gate;
    } catch {
      setText(article(), "apply failed");
    } finally {
      Mutation.resume();
    }
  })();
  await settle();
  expect(undo.isPaused).toBe(true);

  expect(undo.command("Local edit", () => setText(note(), "local note")).label).toBe("Local edit");

  fail(new Error("the apply failed"));
  await apply;
  await settle();
  undo.flush();

  expect(labels()).toEqual(["Local edit"]);
  expect(undo.undo().ok).toBe(true);
  expect(note().textContent).toBe("authored note");
  expect(article().textContent).toBe("apply failed");

  expect(undo.redo().ok).toBe(true);
  expect(note().textContent).toBe("local note");
});

test("writes made by the paused apply itself never become an undoable local entry", async () => {
  await enter();
  window.clay.undo.setRecording("commands");

  Mutation.pause();
  setText(article(), "from apply");
  await settle();
  Mutation.resume();
  await settle();
  undo.flush();

  expect(undo.canUndo).toBe(false);
  expect(undo.history).toHaveLength(0);
  expect(article().textContent).toBe("from apply");
});

test("a command made while the gate is paused still advances its capture token, so the page stays unsaved", async () => {
  const gate = await import("../../src/lib/dirty-gate.js");
  await enter();
  window.clay.undo.setRecording("commands");

  const token = gate.gateCaptureToken();
  gate.pauseGate();
  try {
    // The apply's own writes are not edits, but anything authored under the same
    // pause is: neither gate feed sees it, so the mark is the only record of it.
    expect(undo.command("Local edit", () => setText(note(), "local note")).label).toBe("Local edit");
    expect(gate.gateCaptureToken().gen).not.toBe(token.gen);
    expect(gate.pageMaybeDirty()).toBe(true);
  } finally {
    gate.resumeGate();
  }
});

test("undo and redo advance the gate's capture token", async () => {
  const gate = await import("../../src/lib/dirty-gate.js");
  await enter();
  window.clay.undo.setRecording("commands");

  undo.command("Local edit", () => setText(note(), "local note"));
  const before = gate.gateCaptureToken();
  expect(undo.undo().ok).toBe(true);
  const afterUndo = gate.gateCaptureToken();
  expect(afterUndo.gen).not.toBe(before.gen);
  expect(undo.redo().ok).toBe(true);
  expect(gate.gateCaptureToken().gen).not.toBe(afterUndo.gen);
});

test("a successful undo schedules no automatic extra history item", async () => {
  await enter();

  setText(article(), "typed");
  await settle();
  undo.flush();
  expect(labels()).toEqual(["Edit"]);

  expect(undo.undo().ok).toBe(true);
  expect(article().textContent).toBe("authored");
  await settle();
  undo.flush();
  await settle();

  expect(undo.history).toHaveLength(0);
  expect(undo.canUndo).toBe(false);
  expect(undo.canRedo).toBe(true);
});
