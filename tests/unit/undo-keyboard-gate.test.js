/**
 * @jest-environment jsdom
 */
import Mutation from "../../src/lib/mutation.js";

const FIXTURE = `<p id="article">authored</p><p id="note">authored note</p>`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const note = () => document.getElementById("note");
const setText = (el, value) => { if (el.firstChild && el.firstChild.nodeType === 3) el.firstChild.data = value; else el.textContent = value; };

let plugin, undo;
beforeAll(async () => {
  window.clay = { Mutation };
  plugin = await import("../../src/plugins/undo.js");
  undo = plugin.undo;
  window.clay.undo = undo;
});

test("a keyboard undo during a paused gate marks the page dirty, so the apply never takes it as saved", async () => {
  document.body.innerHTML = FIXTURE;
  await settle();
  const gate = await import("../../src/lib/dirty-gate.js");
  const lease = await plugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true });
  lease.enable();
  undo.setRecording("commands");
  undo.command("Local edit", () => setText(note(), "local note"));
  await settle();
  const token = gate.gateCaptureToken();
  gate.pauseGate();
  try {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    const after = gate.gateCaptureToken();
    expect(after.gen).not.toBe(token.gen);
  } finally {
    gate.resumeGate();
  }
  lease.dispose();
});

test("a facade undo during a paused gate marks the page dirty", async () => {
  document.body.innerHTML = FIXTURE;
  await settle();
  const gate = await import("../../src/lib/dirty-gate.js");
  const lease = await plugin.undoParticipant().prepare({ generation: 2, isCurrent: () => true });
  lease.enable();
  undo.setRecording("commands");
  undo.command("Local edit", () => setText(note(), "local note"));
  await settle();
  const token = gate.gateCaptureToken();
  gate.pauseGate();
  try {
    undo.undo();
    const after = gate.gateCaptureToken();
    expect(after.gen).not.toBe(token.gen);
  } finally {
    gate.resumeGate();
  }
  lease.dispose();
});
