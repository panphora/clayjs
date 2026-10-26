/**
 * @jest-environment jsdom
 */

/**
 * A click inside a sortable item is an edit like any other.
 *
 * The press that starts a drag and the press that is only a click begin the same way,
 * and the sortable plugin hands the gesture's exclusion to the engine when the pointer
 * comes up. Only a press that became a drag may hold it: a click that writes — a delete
 * button, or a handler that brackets its work with `clay.undo.commit` — has to reach
 * history, and undo has to put it back.
 */

const FIXTURE = `
  <main>
    <ul id="list" sortable>
      <li id="a">Alpha <button id="del-a">x</button></li>
      <li id="b">Beta</li>
    </ul>
    <p id="outside"><button id="del-out">x</button><span id="o">Outside</span></p>
  </main>
`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const el = (id) => document.getElementById(id);
const labels = () => undo.history.map((entry) => entry.label);

let sortable;
let undoPlugin;
let undo;
const undoLeases = [];
const sortableLeases = [];

const enter = async () => {
  const history = await undoPlugin.undoParticipant().prepare({ generation: 1, isCurrent: () => true });
  history.enable();
  undoLeases.push(history);
  const drag = await sortable.sortableParticipant().prepare({ generation: 1, isCurrent: () => true });
  drag.enable();
  sortableLeases.push(drag);
};

// The press a click makes: down, up, and the click itself.
const press = (button) => {
  button.dispatchEvent(new window.Event("pointerdown", { bubbles: true, composed: true }));
  button.dispatchEvent(new window.Event("pointerup", { bubbles: true, composed: true }));
  button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
};

beforeAll(async () => {
  window.clayEditMode = true;
  sortable = await import("../../src/plugins/sortable.js");
  undoPlugin = await import("../../src/plugins/undo.js");
  undo = undoPlugin.undo;
  window.clay = { undo };
  (await sortable.ready)?.dispose();
  (await undoPlugin.ready)?.dispose();
});

afterAll(() => {
  window.clay = undefined;
  delete window.clayEditMode;
});

beforeEach(() => {
  document.body.innerHTML = FIXTURE;
});

afterEach(() => {
  while (sortableLeases.length) sortableLeases.pop().dispose();
  while (undoLeases.length) undoLeases.pop().dispose();
});

const cases = [
  { where: "outside a sortable list", victim: "o", button: "del-out", commit: false },
  { where: "inside a sortable item", victim: "a", button: "del-a", commit: false },
  { where: "inside a sortable item, inside clay.undo.commit", victim: "a", button: "del-a", commit: true },
];

for (const { where, victim: victimId, button: buttonId, commit } of cases) {
  test(`a delete button ${where} records one entry and undo puts it back`, async () => {
    await enter();
    const victim = el(victimId);
    const button = el(buttonId);
    button.addEventListener("click", () => {
      if (commit) undo.commit("Delete", () => victim.remove());
      else victim.remove();
    });

    press(button);
    await settle();
    await settle();
    undo.flush();

    expect(labels()).toEqual([commit ? "Delete" : "Edit"]);
    expect(undo.undo().ok).toBe(true);
    expect(document.getElementById(victimId)).toBe(victim);
    expect(victim.isConnected).toBe(true);
  });
}
