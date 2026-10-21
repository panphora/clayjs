import { dueLabel, dueState, placeAfter, todayKey } from "../../../src/page/board-view.js";
import { editor } from "./view-helpers.js";
import { COLUMNS, CARDS, clone, tick, open, nodeBoard, stored, lanes, control as find, keyOn, deliver, settled } from "./board-helpers.js";

const control = (tab, key) => find(tab.root(), key);

test("the board renders its columns in order, each card with its owner and due date, and a count per column", () => {
  const tab = open();
  expect(lanes(tab)).toEqual(["To do: Sample inbox, Invite flow", "In progress: ", "Done: Pricing page"]);
  expect([...tab.root().querySelectorAll(".page-board-count")].map((count) => count.getAttribute("aria-label"))).toEqual(["2 cards", "0 cards", "1 card"]);
  const first = control(tab, "card:a");
  expect(first.tagName).toBe("BUTTON");
  expect(first.getAttribute("aria-haspopup")).toBe("dialog");
  expect(first.querySelector(".page-board-owner-name").textContent).toBe("Maya");
  expect(first.querySelector(".page-board-face").textContent).toBe("M");
  expect(first.querySelector(".page-board-due").dataset.due).toBe("overdue");
  expect(first.querySelector(".page-board-due").textContent).toBe("Due Jan 2, 2020, overdue");
  expect(control(tab, "card:b").querySelector(".page-board-meta")).toBeNull();
  expect(control(tab, "card:c").querySelector(".page-board-due").dataset.due).toBe("later");
  expect(tab.root().querySelectorAll(".page-board-add")).toHaveLength(3);
  expect(control(tab, "add-column").getAttribute("aria-label")).toBe("Add column");
  expect(tab.root().contentEditable).toBe("false");
});

test("an editor without board commands keeps the plain board section", () => {
  const view = editor([["bd", "board", "", { columns: clone(COLUMNS), cards: clone(CARDS) }]]);
  expect(view.dom.querySelector('section[data-type="board"]')).not.toBeNull();
  expect(view.dom.querySelector(".page-board")).toBeNull();
});

test("the column menu renames, moves and deletes a column, and Restore column brings it back with its cards", async () => {
  const tab = open();
  control(tab, "colmenu:todo").click();
  const menu = tab.root().querySelector(".page-board-menu");
  expect([...menu.querySelectorAll(".page-board-option")].map((item) => `${item.textContent}${item.disabled ? " (off)" : ""}`)).toEqual(["Rename", "Move left (off)", "Move right", "Delete column"]);
  expect(document.activeElement.dataset.focus).toBe("rename:todo");
  keyOn(document.activeElement, "ArrowDown");
  expect(document.activeElement.dataset.focus).toBe("right:todo");
  keyOn(document.activeElement, "Escape");
  expect(tab.root().querySelector(".page-board-menu")).toBeNull();
  expect(document.activeElement.dataset.focus).toBe("colmenu:todo");

  control(tab, "colmenu:todo").click();
  control(tab, "rename:todo").click();
  const input = tab.root().querySelector(".page-board-rename");
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("To do");
  input.value = "Backlog";
  keyOn(input, "Enter");
  expect(nodeBoard(tab).columns.todo.name).toBe("Backlog");
  expect(stored(tab).columns.todo.name).toBe("Backlog");
  expect(document.activeElement.dataset.focus).toBe("colmenu:todo");

  control(tab, "colmenu:todo").click();
  control(tab, "right:todo").click();
  expect(lanes(tab)).toEqual(["In progress: ", "Backlog: Sample inbox, Invite flow", "Done: Pricing page"]);
  expect(document.activeElement.dataset.focus).toBe("colmenu:todo");
  control(tab, "colmenu:todo").click();
  control(tab, "left:todo").click();
  expect(lanes(tab)).toEqual(["Backlog: Sample inbox, Invite flow", "In progress: ", "Done: Pricing page"]);

  control(tab, "colmenu:todo").click();
  control(tab, "delete-column:todo").click();
  expect(lanes(tab)).toEqual(["In progress: ", "Done: Pricing page"]);
  const tray = tab.root().querySelector(".page-board-tray");
  expect(tray.querySelector(".page-board-name").textContent).toBe("Cards from deleted column “Backlog”");
  expect([...tray.querySelectorAll(".page-board-title")].map((title) => title.textContent)).toEqual(["Sample inbox", "Invite flow"]);
  expect(document.activeElement.dataset.focus).toBe("restore:todo");
  expect(tab.view.dom.parentElement.querySelector(".page-live").textContent).toBe("Column deleted. Its cards are under Cards from a deleted column.");
  document.activeElement.click();
  expect(lanes(tab)).toEqual(["Backlog: Sample inbox, Invite flow", "In progress: ", "Done: Pricing page"]);
  expect(tab.root().querySelector(".page-board-tray")).toBeNull();
  expect(document.activeElement.dataset.focus).toBe("colmenu:todo");
  settled(tab);
});

test("an empty rename or Escape leaves the name alone and writes nothing", () => {
  const tab = open();
  control(tab, "colmenu:doing").click();
  control(tab, "rename:doing").click();
  const input = tab.root().querySelector(".page-board-rename");
  input.value = "   ";
  keyOn(input, "Enter");
  control(tab, "colmenu:doing").click();
  control(tab, "rename:doing").click();
  tab.root().querySelector(".page-board-rename").value = "Doing";
  keyOn(tab.root().querySelector(".page-board-rename"), "Escape");
  expect(nodeBoard(tab).columns.doing.name).toBe("In progress");
  expect(tab.updates).toHaveLength(0);
  expect(document.activeElement.dataset.focus).toBe("colmenu:doing");
});

test("Add card creates cards at the end of the column and stays open for the next one; blur with text adds the last", async () => {
  const tab = open();
  control(tab, "add:doing").click();
  const input = tab.root().querySelector(".page-board-new");
  expect(document.activeElement).toBe(input);
  input.value = "Activation dashboard";
  keyOn(input, "Enter");
  expect(lanes(tab)[1]).toBe("In progress: Activation dashboard");
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("");
  input.value = "Invite copy";
  keyOn(input, "Enter");
  input.value = "Pricing FAQ";
  input.blur();
  await tick();
  expect(lanes(tab)[1]).toBe("In progress: Activation dashboard, Invite copy, Pricing FAQ");
  expect(tab.root().querySelector(".page-board-new")).toBeNull();
  control(tab, "add:doing").click();
  keyOn(tab.root().querySelector(".page-board-new"), "Escape");
  expect(document.activeElement.dataset.focus).toBe("add:doing");
  expect(Object.values(stored(tab).cards).filter((card) => card.col === "doing").map((card) => card.title)).toEqual(["Activation dashboard", "Invite copy", "Pricing FAQ"]);
  settled(tab);
});

test("Add column creates a named column after the last one and moves focus to its Add card", () => {
  const tab = open();
  control(tab, "add-column").click();
  const input = tab.root().querySelector(".page-board-rename");
  expect(document.activeElement).toBe(input);
  input.value = "Blocked";
  keyOn(input, "Enter");
  expect(lanes(tab)).toEqual(["To do: Sample inbox, Invite flow", "In progress: ", "Done: Pricing page", "Blocked: "]);
  const id = Object.keys(nodeBoard(tab).columns)[3];
  expect(document.activeElement.dataset.focus).toBe(`add:${id}`);
  settled(tab);
});

test("a card from a deleted column moves to a column with its own Move to column control", () => {
  const tab = open();
  tab.binding.board.removeColumn("bd", "todo");
  const select = control(tab, "move:b");
  expect(select.getAttribute("aria-label")).toBe("Move Invite flow to column");
  expect([...select.options].map((option) => option.textContent)).toEqual(["Move to column", "In progress", "Done"]);
  select.value = "done";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  expect(lanes(tab)).toEqual(["In progress: ", "Done: Pricing page, Invite flow"]);
  expect(document.activeElement.dataset.focus).toBe("card:b");
  expect([...tab.root().querySelectorAll(".page-board-tray .page-board-title")].map((title) => title.textContent)).toEqual(["Sample inbox"]);
  settled(tab);
});

test("each control is one Undo step, and Mod-z on a board control undoes", () => {
  const tab = open();
  const start = nodeBoard(tab);
  control(tab, "add:doing").click();
  const input = tab.root().querySelector(".page-board-new");
  input.value = "One";
  keyOn(input, "Enter");
  input.value = "Two";
  keyOn(input, "Enter");
  keyOn(input, "Escape");
  control(tab, "colmenu:done").click();
  control(tab, "left:done").click();
  expect(lanes(tab)).toEqual(["To do: Sample inbox, Invite flow", "Done: Pricing page", "In progress: One, Two"]);
  expect(keyOn(control(tab, "colmenu:done"), "z", { metaKey: true })).toBe(false);
  expect(lanes(tab)).toEqual(["To do: Sample inbox, Invite flow", "In progress: One, Two", "Done: Pricing page"]);
  expect(tab.binding.undo()).toBe(true);
  expect(lanes(tab)[1]).toBe("In progress: One");
  expect(tab.binding.undo()).toBe(true);
  expect(nodeBoard(tab)).toEqual(start);
  expect(tab.binding.undo()).toBe(false);
  settled(tab);
});

test("a peer's change replaces the board and focus stays on the same card, and a half-typed card title survives", () => {
  const a = open(), b = open();
  control(a, "card:b").focus();
  b.binding.board.editCard("bd", "a", { title: "Sample inbox, first" });
  b.binding.board.moveCard("bd", "b", { columnId: "doing" });
  deliver(b, a);
  expect(lanes(a)).toEqual(["To do: Sample inbox, first", "In progress: Invite flow", "Done: Pricing page"]);
  expect(document.activeElement.dataset.focus).toBe("card:b");
  expect(document.activeElement.closest(".page-board-lane").dataset.col).toBe("doing");
  b.view.dispatch(b.view.state.tr.insertText("Note: ", 1));
  deliver(b, a);
  expect(a.view.state.doc.firstChild.textContent).toBe("Note: Before");
  expect(document.activeElement.dataset.focus).toBe("card:b");

  control(a, "add:done").click();
  const input = a.root().querySelector(".page-board-new");
  input.value = "Ship no";
  input.setSelectionRange(7, 7);
  b.binding.board.renameColumn("bd", "done", "Shipped");
  deliver(b, a);
  expect(lanes(a)[2]).toBe("Shipped: Pricing page");
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("Ship no");
  expect(input.selectionStart).toBe(7);
  settled(a);
});

test("due dates read as today, overdue or later, and the label drops the year only within the year", () => {
  expect(dueState("2026-10-21", "2026-10-21")).toBe("today");
  expect(dueState("2026-10-20", "2026-10-21")).toBe("overdue");
  expect(dueState("2026-10-22", "2026-10-21")).toBe("later");
  expect(dueState("soon", "2026-10-21")).toBe("later");
  expect(dueLabel("2026-10-21", "2026-10-21")).toBe("Today");
  expect(dueLabel("2026-10-24", "2026-10-21")).toBe("Oct 24");
  expect(dueLabel("2027-01-05", "2026-10-21")).toBe("Jan 5, 2027");
  expect(dueLabel("2026-10-22", "2026-10-21", true)).toBe("Thu, Oct 22");
  expect(dueLabel("2026-10-21", "2026-10-21", true)).toBe("Wed, Oct 21");
  expect(todayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  expect([placeAfter(["x", "y", "z"], 0), placeAfter(["x", "y", "z"], 1), placeAfter(["x", "y", "z"], 2)]).toEqual([null, null, "x"]);
});

test("deleted cards are listed behind a toggle and restore in one undo step", () => {
  const tab = open();
  expect(tab.root().querySelector(".page-board-deleted")).toBeNull();
  expect(tab.binding.board.removeCard("bd", "b").status).toBe("removed");
  expect(lanes(tab)).toEqual(["To do: Sample inbox", "In progress: ", "Done: Pricing page"]);
  const toggle = control(tab, "toggle-deleted");
  expect(toggle.textContent).toContain("Deleted cards (1)");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(tab.root().querySelector(".page-board-deleted-list")).toBeNull();
  toggle.click();
  expect(control(tab, "toggle-deleted").getAttribute("aria-expanded")).toBe("true");
  expect([...tab.root().querySelectorAll(".page-board-deleted-item .page-board-title")].map((n) => n.textContent)).toEqual(["Invite flow"]);
  const before = tab.updates.length;
  control(tab, "restore-card:b").click();
  expect(tab.updates.length).toBe(before + 1);
  expect(lanes(tab)).toEqual(["To do: Sample inbox, Invite flow", "In progress: ", "Done: Pricing page"]);
  expect(stored(tab).cards.b.title).toBe("Invite flow");
  expect(document.activeElement.dataset.focus).toBe("card:b");
  expect(tab.root().querySelector(".page-board-deleted")).toBeNull();
  expect(tab.view.dom.parentElement.querySelector(".page-live").textContent).toBe("Card restored");
  tab.binding.undo();
  expect(lanes(tab)).toEqual(["To do: Sample inbox", "In progress: ", "Done: Pricing page"]);
  settled(tab);
});

test("a card a peer deleted can be restored from this tab", () => {
  const a = open(), b = open();
  deliver(a, b); deliver(b, a);
  a.binding.board.removeCard("bd", "c");
  deliver(a, b);
  expect(lanes(b)).toEqual(["To do: Sample inbox, Invite flow", "In progress: ", "Done: "]);
  control(b, "toggle-deleted").click();
  control(b, "restore-card:c").click();
  deliver(b, a);
  expect(lanes(a)).toEqual(["To do: Sample inbox, Invite flow", "In progress: ", "Done: Pricing page"]);
  expect(a.root().querySelector(".page-board-deleted")).toBeNull();
});
