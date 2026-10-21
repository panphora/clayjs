import { open, nodeBoard, lanes, control, deliver, settled } from "./board-helpers.js";

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const index = (node, selector) => [...node.parentElement.closest(".page-board-lanes, .page-board-cards").querySelectorAll(selector)].indexOf(node);
const layout = (node) => {
  if (node.classList.contains("page-board-scroll")) return box(0, 80, 1200, 520);
  if (node.matches(".page-board-lane[data-col]")) return box(20 + index(node, ".page-board-lane[data-col]") * 290, 80, 274, 520);
  if (node.matches(".page-board-lane .page-board-card[data-card]")) return box(20 + index(node.closest(".page-board-lane"), ".page-board-lane[data-col]") * 290, 140 + index(node, ".page-board-card[data-card]") * 60, 274, 50);
  if (node.matches(".page-board-tray .page-board-card[data-card]")) return box(20, 20, 220, 40);
  return box(0, 0, 0, 0);
};
const original = Element.prototype.getBoundingClientRect;
beforeAll(() => { Element.prototype.getBoundingClientRect = function () { return layout(this); }; });
afterAll(() => { Element.prototype.getBoundingClientRect = original; });

const pointer = (target, type, x, y, { kind = "mouse", button = 0 } = {}) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  Object.defineProperties(event, { pointerId: { value: 7 }, pointerType: { value: kind } });
  target.dispatchEvent(event);
  return event;
};
const card = (tab, id) => control(tab.root(), `card:${id}`);
const head = (tab, col) => [...tab.root().querySelectorAll(".page-board-head")].find((node) => node.dataset.col === col);
const drag = (tab, from, path) => {
  pointer(from, "pointerdown", ...path[0]);
  for (const point of path.slice(1)) pointer(tab.root(), "pointermove", ...point);
};
const drop = (tab, x, y) => pointer(tab.root(), "pointerup", x, y);
const live = (tab) => tab.view.dom.parentElement.querySelector(".page-live").textContent;
const dropLine = (tab) => {
  const line = tab.root().querySelector(".page-board-drop");
  if (!line) return null;
  const lane = line.closest(".page-board-lane");
  return lane ? `${lane.dataset.col} after ${line.previousElementSibling?.querySelector(".page-board-card")?.dataset.card ?? "start"}` : `column after ${line.previousElementSibling?.dataset.col ?? "start"}`;
};
const clean = (tab) => {
  expect(tab.root().querySelector(".page-board-ghost, .page-board-drop, .is-drag-source")).toBeNull();
  expect(tab.root().classList.contains("is-dragging")).toBe(false);
};

test("dragging a card shows a ghost and a drop line, and dropping moves it with moveCard in one Undo step", () => {
  const tab = open();
  drag(tab, card(tab, "a"), [[100, 160], [102, 161]]);
  expect(tab.root().querySelector(".page-board-ghost")).toBeNull();
  pointer(tab.root(), "pointermove", 650, 200);
  const ghost = tab.root().querySelector(".page-board-ghost");
  expect(ghost.textContent).toContain("Sample inbox");
  expect(ghost.getAttribute("aria-hidden")).toBe("true");
  expect(ghost.hasAttribute("data-focus")).toBe(false);
  expect(ghost.style.transform).toBe("translate(570px, 180px)");
  expect(card(tab, "a").classList.contains("is-drag-source")).toBe(true);
  expect(tab.root().classList.contains("is-dragging")).toBe(true);
  expect(dropLine(tab)).toBe("done after c");
  pointer(tab.root(), "pointermove", 650, 150);
  expect(dropLine(tab)).toBe("done after start");
  pointer(tab.root(), "pointermove", 650, 230);
  drop(tab, 650, 230);
  card(tab, "a").click();
  expect(lanes(tab)).toEqual(["To do: Invite flow", "In progress: ", "Done: Pricing page, Sample inbox"]);
  expect(tab.view.dom.parentElement.querySelector(".page-board-panel")).toBeNull();
  expect(document.activeElement).toBe(card(tab, "a"));
  expect(live(tab)).toBe("Moved card to Done");
  expect(tab.updates).toHaveLength(1);
  clean(tab);
  expect(tab.binding.undo()).toBe(true);
  expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow");
  settled(tab);
});

test("a card dragged above its neighbour reorders the column; a drop back in place writes nothing", () => {
  const tab = open();
  drag(tab, card(tab, "b"), [[100, 220], [100, 150]]);
  expect(dropLine(tab)).toBe("todo after start");
  drop(tab, 100, 150);
  expect(lanes(tab)[0]).toBe("To do: Invite flow, Sample inbox");
  drag(tab, card(tab, "b"), [[100, 160], [100, 180]]);
  expect(dropLine(tab)).toBe("todo after start");
  drop(tab, 100, 180);
  expect(lanes(tab)[0]).toBe("To do: Invite flow, Sample inbox");
  expect(tab.updates).toHaveLength(1);
  clean(tab);
});

test("a press without movement stays a click, and touch never starts a drag", () => {
  const tab = open();
  drag(tab, card(tab, "a"), [[100, 160], [102, 162]]);
  drop(tab, 102, 162);
  card(tab, "a").click();
  expect(tab.view.dom.parentElement.querySelector(".page-board-panel")).not.toBeNull();
  tab.view.dom.parentElement.querySelector(".page-board-close").click();
  pointer(card(tab, "b"), "pointerdown", 100, 220, { kind: "touch" });
  pointer(tab.root(), "pointermove", 650, 200, { kind: "touch" });
  pointer(tab.root(), "pointerup", 650, 200, { kind: "touch" });
  expect(tab.root().querySelector(".page-board-ghost")).toBeNull();
  expect(tab.updates).toHaveLength(0);
});

test("dragging a column by its head reorders the columns with moveColumn; the menu button does not drag", () => {
  const tab = open();
  drag(tab, head(tab, "todo").querySelector(".page-board-name"), [[100, 95], [900, 95]]);
  expect(dropLine(tab)).toBe("column after done");
  expect(tab.root().querySelector(".page-board-ghost").classList.contains("page-board-lane")).toBe(true);
  drop(tab, 900, 95);
  expect(lanes(tab)).toEqual(["In progress: ", "Done: Pricing page", "To do: Sample inbox, Invite flow"]);
  expect(live(tab)).toBe("Moved column");
  clean(tab);
  drag(tab, control(tab.root(), "colmenu:doing"), [[250, 95], [900, 95]]);
  expect(tab.root().querySelector(".page-board-ghost")).toBeNull();
  drop(tab, 900, 95);
  expect(tab.updates).toHaveLength(1);
  expect(tab.binding.undo()).toBe(true);
  expect(lanes(tab).map((lane) => lane.split(":")[0])).toEqual(["To do", "In progress", "Done"]);
});

test("Escape or a drop outside the board cancels the drag and changes nothing", () => {
  const tab = open();
  drag(tab, card(tab, "a"), [[100, 160], [650, 200]]);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  expect(live(tab)).toBe("Move cancelled");
  clean(tab);
  drop(tab, 650, 200);
  drag(tab, card(tab, "a"), [[100, 160], [650, 900]]);
  expect(dropLine(tab)).toBeNull();
  drop(tab, 650, 900);
  expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow");
  expect(tab.updates).toHaveLength(0);
  clean(tab);
});

test("a refused move re-renders the board and leaves the card where it was", () => {
  const tab = open();
  const calls = [];
  const moveCard = tab.binding.board.moveCard;
  tab.binding.board.moveCard = (...args) => { calls.push(args); return { status: "refused", code: "missing-destination" }; };
  try {
    const before = card(tab, "a");
    drag(tab, before, [[100, 160], [650, 200]]);
    drop(tab, 650, 200);
    expect(calls).toEqual([["bd", "a", { columnId: "done", afterId: "c" }]]);
    expect(before.isConnected).toBe(false);
    expect(lanes(tab)[0]).toBe("To do: Sample inbox, Invite flow");
    clean(tab);
  } finally {
    tab.binding.board.moveCard = moveCard;
  }
  tab.view.setProps({ editable: () => false });
  drag(tab, card(tab, "a"), [[100, 160], [650, 200]]);
  expect(tab.root().querySelector(".page-board-ghost")).toBeNull();
  drop(tab, 650, 200);
  expect(tab.updates).toHaveLength(0);
});

test("a peer's change mid-drag re-targets the drop on the new layout, and the drag ends if the card goes away", () => {
  const a = open(), b = open();
  drag(a, card(a, "a"), [[100, 160], [650, 200]]);
  expect(dropLine(a)).toBe("done after c");
  b.binding.board.moveCard("bd", "b", { columnId: "done", afterId: null });
  deliver(b, a);
  expect(lanes(a)[2]).toBe("Done: Invite flow, Pricing page");
  expect(card(a, "a").classList.contains("is-drag-source")).toBe(true);
  expect(dropLine(a)).toBe("done after b");
  drop(a, 650, 200);
  expect(lanes(a)[2]).toBe("Done: Invite flow, Sample inbox, Pricing page");
  clean(a);

  drag(a, card(a, "c"), [[600, 260], [100, 150]]);
  expect(dropLine(a)).toBe("todo after start");
  deliver(a, b);
  b.binding.board.removeCard("bd", "c");
  deliver(b, a);
  expect(live(a)).toBe("Move cancelled");
  clean(a);
  drop(a, 100, 150);
  expect(nodeBoard(a).cards.c).toBeUndefined();
  expect(a.updates).toHaveLength(1);
  settled(a);
});

test("a card from a deleted column can be dragged into a column", () => {
  const tab = open();
  tab.binding.board.removeColumn("bd", "todo");
  drag(tab, card(tab, "b"), [[40, 30], [100, 150]]);
  expect(dropLine(tab)).toBe("doing after start");
  drop(tab, 100, 150);
  expect(lanes(tab)).toEqual(["In progress: Invite flow", "Done: Pricing page"]);
  expect([...tab.root().querySelectorAll(".page-board-tray .page-board-title")].map((title) => title.textContent)).toEqual(["Sample inbox"]);
  settled(tab);
});
