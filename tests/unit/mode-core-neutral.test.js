/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * Step 17b-3b: the neutral core modules a live entry imports while the page is still in
 * view. They have no session state. Each installs its page-lifetime machinery once, and
 * that machinery has to act only under the committed mode or under write admission:
 *
 *   - `[add-from]` adds an item only when the lifecycle admits the write, so a click
 *     after an exit adds nothing;
 *   - `[persist]` mirrors a control into its attributes only in edit, so a reader typing
 *     after an exit writes nothing;
 *   - `save-freeze` installs its capture transforms at import, whatever the mode, so a
 *     view-time import still freezes the next save;
 *   - the Cmd/Ctrl+S listener outlives its session and reads the mode when the key lands,
 *     so after an exit the browser's own Save works.
 *
 * The modules are the real ones, imported in view exactly as a live entry imports them,
 * and the mode is committed the way the controller commits it. Every refusal below has
 * its positive control in the same file: the same click, the same keystroke and the same
 * save capture, in edit.
 */

const FIXTURE = `
  <article id="doc">
    <h1 id="title" editmode:contenteditable inert-contenteditable="plaintext-only">Authored title</h1>
  </article>
  <div id="frozen" save-freeze><span class="initial">initial</span></div>
  <ul id="tasks"><li data-id="t-1">one</li></ul>
  <button id="add" type="button" add-from="#task-tpl" add-to="#tasks">Add task</button>
  <template id="task-tpl">
    <li><span class="label" contenteditable="plaintext-only">New</span></li>
  </template>
  <input id="who" persist value="">
`;

let mode;
let editMode;
let snapshot;
let persist;
let addFrom;
let save;

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const items = () => document.querySelectorAll("#tasks > li");

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// The two facts the controller commits, in its own order: the mode first, then idle.
function enterEdit() {
  mode.commitModeFacts({ mode: "edit", isEditMode: true, phase: "idle" });
}

function leaveEdit() {
  mode.commitModeFacts({ phase: "leaving" });
  mode.commitModeFacts({ mode: "view", isEditMode: false, phase: "idle" });
}

function chord(keyCode, options = {}) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    keyCode,
    ...options,
  });
  document.dispatchEvent(event);
  return event;
}

beforeAll(async () => {
  // A view boot: no mode, no save token, no `clayEditMode`. The body carries the authored
  // form before any edit-only module is evaluated, as a served page does.
  document.body.innerHTML = FIXTURE;

  mode = await import("../../src/core/is-edit-mode.js");
  editMode = await import("../../src/core/edit-mode.js");
  snapshot = await import("../../src/core/snapshot.js");
  await import("../../src/core/preserve-authored.js");
  persist = await import("../../src/core/persist.js");
  addFrom = await import("../../src/attrs/add-from.js");
  // Imported while the committed mode is view, which is the whole point of the step.
  await import("../../src/attrs/save-freeze.js");
  save = await import("../../src/core/save.js");

  window.clay = window.clay || {};
  window.clay.modeLifecycle = editMode.modeLifecycle;

  globalThis.fetch = window.fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  }));
});

test("a save-freeze region imported in view still freezes the next save", () => {
  expect(mode.isEditMode).toBe(false);

  const frozen = document.getElementById("frozen");
  frozen.innerHTML = '<span class="runtime">runtime</span>';

  const forSave = snapshot.captureForSave({ emitForSync: false });

  expect(forSave).toContain("initial");
  expect(forSave).not.toContain("runtime");
});

test("in view an add-from click adds nothing and persist typing writes no attribute", () => {
  const who = document.getElementById("who");

  click(document.getElementById("add"));
  type(who, "alpha");

  expect(items().length).toBe(1);
  expect(who.getAttribute("value")).toBe("");
});

test("the same click and the same keystroke add and persist once the mode has committed", async () => {
  enterEdit();
  expect(window.clay.modeLifecycle.canWrite()).toBe(true);

  click(document.getElementById("add"));
  const added = items()[items().length - 1];
  expect(items().length).toBe(2);
  expect(added.getAttribute("data-id")).toMatch(/^[a-z0-9]{6,}$/);
  expect(document.activeElement).toBe(added.querySelector(".label"));

  type(document.getElementById("who"), "beta");
  expect(document.getElementById("who").getAttribute("value")).toBe("beta");

  // A second activation would have added the item twice.
  expect(addFrom.install()).toBe(addFrom.install());
  expect(persist.install()).toBe(persist.install());
  await flush();
});

test("a later edit save freezes the region, though the module was imported in view", () => {
  enterEdit();

  const frozen = document.getElementById("frozen");
  frozen.innerHTML = '<span class="runtime">typed over</span>';

  const forSave = snapshot.captureForSave({ emitForSync: false });

  expect(forSave).toContain("initial");
  expect(forSave).not.toContain("typed over");

  leaveEdit();
});

test("after an exit the live machinery changes nothing, and the positive control is the same event in edit", async () => {
  // The session a live entry opens, prepared in view and enabled after the commit.
  const lease = save.modeParticipant().prepare({ initial: false });
  enterEdit();
  lease.enable();

  const inEdit = chord(83, { ctrlKey: true });
  expect(inEdit.defaultPrevented).toBe(true);
  await flush();

  leaveEdit();
  expect(window.clay.modeLifecycle.canWrite()).toBe(false);

  const who = document.getElementById("who");
  const before = items().length;
  click(document.getElementById("add"));
  type(who, "gamma");
  expect(items().length).toBe(before);
  expect(who.getAttribute("value")).toBe("beta");

  // The listener outlived its session, so the mode has to be read when the key lands.
  const afterExit = chord(83, { ctrlKey: true });
  expect(afterExit.defaultPrevented).toBe(false);

  lease.dispose();
  await flush();
});
