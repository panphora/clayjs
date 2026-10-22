import { COLUMNS, CARDS, clone, tick, open, nodeBoard, stored, lanes, control, keyOn, deliver, settled } from "./board-helpers.js";
import { seedValue } from "../../../src/page/ybind/index.js";

afterEach(() => { delete globalThis.clay; });

const panelOf = (tab) => tab.view.dom.parentElement.querySelector(".page-board-panel");
const card = (tab, id) => control(tab.root(), `card:${id}`);
const inPanel = (tab, key) => control(panelOf(tab), key);
const type = (input, text) => {
  for (let i = 1; i <= text.length; i++) {
    input.value = text.slice(0, i);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
};
const choose = (select, value) => {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

test("clicking a card opens the side panel with every field, and Escape closes it back onto the card", () => {
  const tab = open();
  card(tab, "a").click();
  const panel = panelOf(tab);
  expect(panel.getAttribute("role")).toBe("dialog");
  expect(panel.getAttribute("aria-modal")).toBe("false");
  expect(panel.parentElement).toBe(tab.view.dom.parentElement);
  expect(tab.view.dom.parentElement.classList.contains("has-board-panel")).toBe(true);
  expect(card(tab, "a").getAttribute("aria-expanded")).toBe("true");
  const title = inPanel(tab, "title");
  expect(document.activeElement).toBe(title);
  expect(title.value).toBe("Sample inbox");
  expect(title.getAttribute("aria-label")).toBe("Card title");
  const column = inPanel(tab, "column");
  expect(column.value).toBe("todo");
  expect([...column.options].map((option) => option.textContent)).toEqual(["To do", "In progress", "Done"]);
  expect([...panel.querySelectorAll(".page-board-person")].map((chip) => `${chip.textContent}:${chip.getAttribute("aria-pressed")}`)).toEqual(["No owner:false"]);
  expect(inPanel(tab, "owner-name").value).toBe("Maya");
  expect(inPanel(tab, "due").getAttribute("aria-label")).toBe("Due Thu, Jan 2, 2020, overdue");
  expect(inPanel(tab, "due").querySelector(".page-board-due-note").textContent).toBe("Overdue");
  expect(inPanel(tab, "up").disabled).toBe(true);
  expect(inPanel(tab, "down").disabled).toBe(false);
  expect(inPanel(tab, "close").getAttribute("aria-keyshortcuts")).toBe("Escape");
  keyOn(title, "Escape");
  expect(panelOf(tab)).toBeNull();
  expect(tab.view.dom.parentElement.classList.contains("has-board-panel")).toBe(false);
  expect(card(tab, "a").getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(card(tab, "a"));
  expect(tab.updates).toHaveLength(0);
});

test("on a narrow screen the panel is a modal sheet that keeps Tab inside it", () => {
  window.matchMedia = (query) => ({ matches: query === "(max-width: 1039.98px)" });
  try {
    const tab = open();
    card(tab, "a").click();
    expect(panelOf(tab).getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(inPanel(tab, "close"));
    const title = inPanel(tab, "title"), last = inPanel(tab, "delete");
    expect(keyOn(title, "Tab", { shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);
    expect(keyOn(last, "Tab")).toBe(false);
    expect(document.activeElement).toBe(title);
    expect(keyOn(inPanel(tab, "down"), "Tab")).toBe(true);
    tab.view.dom.parentElement.querySelector(".page-board-scrim").click();
    expect(panelOf(tab)).toBeNull();
    expect(tab.updates).toHaveLength(0);
  } finally {
    delete window.matchMedia;
  }
});

test("the title commits on blur, on Enter and on closing the panel, never per keystroke, one Undo step each", async () => {
  const tab = open();
  card(tab, "b").click();
  const title = inPanel(tab, "title");
  type(title, "Invite flow v2");
  expect(tab.updates).toHaveLength(0);
  expect(nodeBoard(tab).cards.b.title).toBe("Invite flow");
  title.blur();
  await tick();
  expect(tab.updates).toHaveLength(1);
  expect(stored(tab).cards.b.title).toBe("Invite flow v2");
  expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow v2");

  title.focus();
  type(title, "Invite flow v3");
  keyOn(title, "Enter");
  expect(stored(tab).cards.b.title).toBe("Invite flow v3");
  expect(document.activeElement).toBe(title);

  type(title, "Invite flow v4");
  inPanel(tab, "close").click();
  expect(panelOf(tab)).toBeNull();
  expect(stored(tab).cards.b.title).toBe("Invite flow v4");
  expect(tab.updates).toHaveLength(3);
  await tick();
  expect(tab.updates).toHaveLength(3);

  for (const title of ["Invite flow v3", "Invite flow v2", "Invite flow"]) {
    expect(tab.binding.undo()).toBe(true);
    expect(nodeBoard(tab).cards.b.title).toBe(title);
  }
  settled(tab);
});

test("owner chips come from the people on the host, with No owner and a typed name", async () => {
  globalThis.clay = { people: { available: async () => [{ id: "person-maya", name: "Maya" }, { id: "person-sam", name: "Sam" }] } };
  const tab = open();
  card(tab, "b").click();
  await tick();
  const chips = () => [...panelOf(tab).querySelectorAll(".page-board-person")].map((chip) => `${chip.textContent}:${chip.getAttribute("aria-pressed")}`);
  expect(chips()).toEqual(["MMaya:false", "SSam:false", "No owner:true"]);
  inPanel(tab, "owner:person-sam").focus();
  inPanel(tab, "owner:person-sam").click();
  expect(stored(tab).cards.b.owner).toBe("Sam");
  expect(chips()).toEqual(["MMaya:false", "SSam:true", "No owner:false"]);
  expect(inPanel(tab, "owner-name").value).toBe("Sam");
  expect(document.activeElement).toBe(inPanel(tab, "owner:person-sam"));
  expect(card(tab, "b").querySelector(".page-board-owner-name").textContent).toBe("Sam");

  const typed = inPanel(tab, "owner-name");
  typed.focus();
  type(typed, "Nia");
  expect(stored(tab).cards.b.owner).toBe("Sam");
  keyOn(typed, "Enter");
  expect(stored(tab).cards.b.owner).toBe("Nia");
  expect(chips()).toEqual(["MMaya:false", "SSam:false", "No owner:false"]);
  expect(document.activeElement).toBe(inPanel(tab, "owner-name"));

  inPanel(tab, "owner-none").click();
  expect(stored(tab).cards.b.owner).toBeUndefined();
  expect(inPanel(tab, "owner-name").value).toBe("");
  expect(tab.updates).toHaveLength(3);
  settled(tab);
});

test("the due date opens a date field that commits on Enter or blur, Escape keeps the date, and an empty date clears it", async () => {
  const tab = open();
  card(tab, "b").click();
  expect(inPanel(tab, "due").getAttribute("aria-label")).toBe("Set due date");
  inPanel(tab, "due").click();
  let input = inPanel(tab, "due-input");
  expect(input.type).toBe("date");
  expect(document.activeElement).toBe(input);
  input.value = "2026-10-26";
  keyOn(input, "Enter");
  expect(stored(tab).cards.b.due).toBe("2026-10-26");
  expect(document.activeElement).toBe(inPanel(tab, "due"));
  expect(card(tab, "b").querySelector(".page-board-due")).not.toBeNull();

  inPanel(tab, "due").click();
  input = inPanel(tab, "due-input");
  input.value = "2026-11-02";
  keyOn(input, "Escape");
  expect(panelOf(tab)).not.toBeNull();
  expect(stored(tab).cards.b.due).toBe("2026-10-26");

  inPanel(tab, "due").click();
  input = inPanel(tab, "due-input");
  input.value = "";
  input.blur();
  await tick();
  expect(stored(tab).cards.b.due).toBeUndefined();
  expect(inPanel(tab, "due").getAttribute("aria-label")).toBe("Set due date");
  expect(tab.updates).toHaveLength(2);
  settled(tab);
});

test("Column, Move up, Move down and Delete card each run one command, keep focus, and undo in one step", () => {
  const tab = open();
  card(tab, "a").click();
  inPanel(tab, "down").focus();
  inPanel(tab, "down").click();
  expect(lanes(tab)[0]).toBe("To do: Invite flow, Sample inbox");
  expect(inPanel(tab, "down").disabled).toBe(true);
  expect(document.activeElement).toBe(inPanel(tab, "up"));
  inPanel(tab, "up").click();
  expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow");

  inPanel(tab, "column").focus();
  choose(inPanel(tab, "column"), "done");
  expect(lanes(tab)).toEqual(["To do: Invite flow", "In progress: ", "Done: Pricing page, Sample inbox"]);
  expect(document.activeElement).toBe(inPanel(tab, "column"));
  expect(inPanel(tab, "column").value).toBe("done");
  expect(card(tab, "a").getAttribute("aria-expanded")).toBe("true");
  expect(tab.binding.undo()).toBe(true);
  expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow");
  expect(inPanel(tab, "column").value).toBe("todo");

  inPanel(tab, "delete").click();
  expect(panelOf(tab)).toBeNull();
  expect(lanes(tab)[0]).toBe("To do: Invite flow");
  expect(document.activeElement).toBe(card(tab, "b"));
  expect(tab.view.dom.parentElement.querySelector(".page-live").textContent).toBe("Card deleted");
  expect(tab.binding.board.removed("bd").cards.a.title).toBe("Sample inbox");
  expect(keyOn(card(tab, "b"), "z", { ctrlKey: true })).toBe(false);
  expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow");
  settled(tab);
});

test("a peer moves a card while this tab types another card's title; the typing survives and both changes land", async () => {
  const a = open(), b = open();
  card(a, "a").click();
  const title = inPanel(a, "title");
  type(title, "Sample inbox before invites");
  b.binding.board.moveCard("bd", "b", { columnId: "doing" });
  b.binding.board.editCard("bd", "a", { due: "2999-10-30" });
  deliver(b, a);
  expect(lanes(a)).toEqual(["To do: Sample inbox", "In progress: Invite flow", "Done: Pricing page"]);
  expect(inPanel(a, "title")).toBe(title);
  expect(document.activeElement).toBe(title);
  expect(title.value).toBe("Sample inbox before invites");
  expect(inPanel(a, "due").getAttribute("aria-label")).toBe("Due Wed, Oct 30, 2999");
  expect(inPanel(a, "down").disabled).toBe(true);
  expect(a.updates).toHaveLength(0);
  title.blur();
  await tick();
  deliver(a, b);
  deliver(b, a);
  for (const tab of [a, b]) {
    expect(nodeBoard(tab).cards.a).toEqual({ ...CARDS.a, title: "Sample inbox before invites", due: "2999-10-30" });
    expect(nodeBoard(tab).cards.b.col).toBe("doing");
    settled(tab);
  }
});

test("the panel closes when its card goes away, from a peer's delete or an Undo", () => {
  const a = open(), b = open();
  card(a, "c").click();
  b.binding.board.removeCard("bd", "c");
  deliver(b, a);
  expect(panelOf(a)).toBeNull();
  expect(document.activeElement.dataset.focus).toBe("add:done");

  const made = a.binding.board.createCard("bd", { columnId: "doing", title: "Fresh" });
  card(a, made.id).click();
  expect(panelOf(a)).not.toBeNull();
  keyOn(inPanel(a, "close"), "z", { metaKey: true });
  expect(panelOf(a)).toBeNull();
  expect(nodeBoard(a).cards[made.id]).toBeUndefined();
  settled(a);
});

test("opening another card commits the first card's typing and moves the panel", () => {
  const tab = open();
  card(tab, "a").click();
  type(inPanel(tab, "title"), "Renamed");
  card(tab, "c").click();
  expect(stored(tab).cards.a.title).toBe("Renamed");
  expect(inPanel(tab, "title").value).toBe("Pricing page");
  expect(card(tab, "a").getAttribute("aria-expanded")).toBe("false");
  expect(card(tab, "c").getAttribute("aria-expanded")).toBe("true");
  expect(tab.view.dom.parentElement.querySelectorAll(".page-board-panel")).toHaveLength(1);
  expect(tab.updates).toHaveLength(1);
});

test("a normalized owner commit leaves the field clean and a peer's later owner survives this tab's close", async () => {
  const a = open(), b = open();
  card(a, "b").click();
  const owner = inPanel(a, "owner-name");
  owner.focus();
  owner.value = "Sam ";
  owner.blur();
  await tick();
  expect(stored(a).cards.b.owner).toBe("Sam");
  expect(inPanel(a, "owner-name").value).toBe("Sam");
  deliver(a, b);
  b.binding.board.editCard("bd", "b", { owner: "Lee" });
  deliver(b, a);
  expect(inPanel(a, "owner-name").value).toBe("Lee");
  expect(stored(a).cards.b.owner).toBe("Lee");
  inPanel(a, "close").click();
  deliver(a, b);
  for (const tab of [a, b]) expect(stored(tab).cards.b.owner).toBe("Lee");
  settled(a);
  settled(b);
});

test("a normalized title commit leaves the field clean and a peer's later title survives this tab's close", async () => {
  const a = open(), b = open();
  card(a, "a").click();
  const title = inPanel(a, "title");
  title.focus();
  title.value = "Invite\nflow";
  title.blur();
  await tick();
  expect(stored(a).cards.a.title).toBe("Invite flow");
  expect(inPanel(a, "title").value).toBe("Invite flow");
  deliver(a, b);
  b.binding.board.editCard("bd", "a", { title: "Peer title" });
  deliver(b, a);
  expect(inPanel(a, "title").value).toBe("Peer title");
  expect(stored(a).cards.a.title).toBe("Peer title");
  inPanel(a, "close").click();
  deliver(a, b);
  for (const tab of [a, b]) expect(stored(tab).cards.a.title).toBe("Peer title");
  settled(a);
  settled(b);
});

test("closing the panel after an Undo does not re-apply the undone owner", async () => {
  const tab = open();
  card(tab, "b").click();
  const owner = inPanel(tab, "owner-name");
  owner.focus();
  owner.value = "Sam ";
  owner.blur();
  await tick();
  expect(stored(tab).cards.b.owner).toBe("Sam");
  expect(tab.binding.undo()).toBe(true);
  expect(stored(tab).cards.b.owner).toBeUndefined();
  inPanel(tab, "close").click();
  expect(stored(tab).cards.b.owner).toBeUndefined();
  settled(tab);
});

test("Move down keeps focus on Move down when it stays enabled", () => {
  const cards = {
    c1: { pos: "1", col: "todo", title: "One" },
    c2: { pos: "2", col: "todo", title: "Two" },
    c3: { pos: "3", col: "todo", title: "Three" },
    c4: { pos: "4", col: "todo", title: "Four" },
  };
  const value = seedValue([{ id: "bd", t: "board", attrs: { columns: clone(COLUMNS), cards } }]);
  const tab = open(value);
  card(tab, "c2").click();
  inPanel(tab, "down").focus();
  inPanel(tab, "down").click();
  expect(lanes(tab)[0]).toBe("To do: One, Three, Two, Four");
  expect(document.activeElement.dataset.focus).toBe("down");
  settled(tab);
});

test("clicking Move down while the title is dirty commits the title and moves the card", () => {
  const tab = open();
  card(tab, "a").click();
  const title = inPanel(tab, "title");
  title.focus();
  title.value = "Renamed";
  inPanel(tab, "down").click();
  expect(stored(tab).cards.a.title).toBe("Renamed");
  expect(lanes(tab)[0]).toBe("To do: Invite flow, Renamed");
  settled(tab);
});

test("an owner chip click wins over typed owner text and a later close does not overwrite it", async () => {
  globalThis.clay = { people: { available: async () => [{ id: "person-sam", name: "Sam" }, { id: "person-lee", name: "Lee" }] } };
  const tab = open();
  card(tab, "b").click();
  await tick();
  const owner = inPanel(tab, "owner-name");
  owner.focus();
  owner.value = "Typed name";
  panelOf(tab).querySelector('[data-owner="Lee"]').click();
  expect(stored(tab).cards.b.owner).toBe("Lee");
  expect(inPanel(tab, "owner-name").value).toBe("Lee");
  inPanel(tab, "close").click();
  expect(stored(tab).cards.b.owner).toBe("Lee");
  settled(tab);
});

test("Enter during IME composition writes nothing from the new-card input or the panel title", () => {
  const cardTab = open();
  control(cardTab.root(), "add:todo").click();
  const input = control(cardTab.root(), "new:todo");
  input.value = "Half typed";
  keyOn(input, "Enter", { isComposing: true });
  expect(cardTab.updates).toHaveLength(0);
  expect(control(cardTab.root(), "new:todo")).toBe(input);
  expect(input.value).toBe("Half typed");

  const panelTab = open();
  card(panelTab, "a").click();
  const title = inPanel(panelTab, "title");
  title.value = "Composed";
  keyOn(title, "Enter", { isComposing: true });
  expect(panelTab.updates).toHaveLength(0);
  expect(stored(panelTab).cards.a.title).toBe("Sample inbox");
});
