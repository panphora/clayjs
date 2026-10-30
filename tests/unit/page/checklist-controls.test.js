import { jest } from "@jest/globals";
import { editor, key, select } from "./view-helpers.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";
import { decorations } from "../../../src/page/features/checklist.js";

const fresh = () => editor([
  ["check", "list_item", "Do it", { kind: "check" }],
  ["plain", "list_item", "Ordinary", { kind: "bullet" }],
]);
const dayKey = (offset) => {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};
const tags = (view) => [...view.dom.querySelectorAll(".page-check-chip")];
afterEach(() => { delete globalThis.clay; });

test("only checklist items have owner and date tags", () => {
  const view = fresh();
  expect(view.dom.querySelectorAll(".page-check-controls")).toHaveLength(1);
  expect(tags(view).map((button) => button.textContent)).toEqual(["Unassigned", "No date"]);
  expect(tags(view).every((button) => button.tagName === "BUTTON")).toBe(true);
});

test("an item with no owner and no date carries both tags, unfilled and always drawn", () => {
  const view = fresh();
  const [owner, date] = tags(view);
  expect(tags(view).map((button) => button.textContent)).toEqual(["Unassigned", "No date"]);
  expect(tags(view).every((button) => button.querySelector("svg") !== null)).toBe(true);
  expect(tags(view).every((button) => button.dataset.filled === "false")).toBe(true);
  expect(tags(view).every((button) => button.getAttribute("aria-expanded") === "false")).toBe(true);
  expect(owner.getAttribute("aria-label")).toBe("Assignee: Unassigned");
  expect(date.getAttribute("aria-label")).toBe("Due date: No date");
  expect(date.hasAttribute("data-overdue")).toBe(false);
});

test("a past date is overdue with a clock, today reads Today, tomorrow reads Tomorrow", () => {
  const view = editor([
    ["late", "list_item", "Late", { kind: "check", due: dayKey(-1) }],
    ["now", "list_item", "Now", { kind: "check", due: dayKey(0) }],
    ["next", "list_item", "Next", { kind: "check", due: dayKey(1) }],
    ["done", "list_item", "Done", { kind: "check", due: dayKey(-1), checked: true }],
  ]);
  const [late, now, next, done] = [...view.dom.querySelectorAll('[data-check="date"]')];
  expect(late.dataset.overdue).toBe("true");
  expect(late.dataset.filled).toBe("true");
  expect(late.querySelector("svg").innerHTML).toContain('r="5.5"');
  expect(late.textContent).not.toBe("Today");
  expect(now.textContent).toBe("Today");
  expect(now.hasAttribute("data-overdue")).toBe(false);
  expect(now.querySelector("svg").innerHTML).toContain('width="11"');
  expect(next.textContent).toBe("Tomorrow");
  expect(done.hasAttribute("data-overdue")).toBe(false);
});

test("an empty check item shows the To do placeholder", () => {
  const view = editor([["empty", "list_item", "", { kind: "check" }]]);
  const li = view.dom.querySelector('.page-li[data-kind="check"]');
  expect(li.getAttribute("data-placeholder")).toBe("To do");
  expect(li.classList.contains("page-check-placeholder")).toBe(true);
});

test("the tags widget leaves a click on the line itself to the editor", () => {
  const view = editor([["empty", "list_item", "", { kind: "check" }]]);
  const li = view.dom.querySelector('.page-li[data-kind="check"]');
  const box = view.dom.querySelector(".page-check-controls");
  const widget = decorations(view.state).find().find((decoration) => decoration.type.spec.stopEvent);
  expect(widget.type.spec.stopEvent({ target: li })).toBe(false);
  expect(widget.type.spec.stopEvent({ target: box })).toBe(false);
  expect(widget.type.spec.stopEvent({ target: box.querySelector('[data-check="owner"]') })).toBe(true);
});

test("the tags widget sits before the caret, so typing in an empty item stays in it", () => {
  const view = editor([["empty", "list_item", "", { kind: "check" }]]);
  const widget = decorations(view.state).find().find((decoration) => decoration.type.spec.stopEvent);
  expect(widget.type.spec.side).toBe(-1);
});

test("a document open across midnight redraws Today, Tomorrow and overdue on its next update", () => {
  jest.useFakeTimers({ now: new Date(2026, 9, 29, 23, 50) });
  try {
    const view = editor([
      ["a", "list_item", "A", { kind: "check", due: "2026-10-29" }],
      ["b", "list_item", "B", { kind: "check", due: "2026-10-30" }],
    ]);
    const labels = () => [...view.dom.querySelectorAll('[data-check="date"]')].map((chip) => chip.textContent);
    expect(labels()).toEqual(["Today", "Tomorrow"]);
    jest.setSystemTime(new Date(2026, 9, 30, 9, 0));
    view.dispatch(view.state.tr.setMeta("addToHistory", false));
    expect(labels()[1]).toBe("Today");
    expect(view.dom.querySelector('[data-check="date"]').dataset.overdue).toBe("true");
  } finally {
    jest.useRealTimers();
  }
});

const owned = () => editor([
  ["a", "list_item", "A", { kind: "check", owner: "Maya" }],
  ["b", "list_item", "B", { kind: "check", owner: "Maya" }],
  ["c", "list_item", "C", { kind: "check", owner: "Ben" }],
]);
const openOwner = (view, item) => {
  const tag = view.dom.querySelector(`.page-check-controls[data-item="${item}"] [data-check="owner"]`);
  tag.click();
  return { tag, panel: document.querySelector(".page-check-owner") };
};
const people = (panel) => [...panel.querySelectorAll('[data-check="owner-option"]')];
const typing = (input, text) => {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const press = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

test("the assignee panel lists the document's people with their counts", () => {
  const view = owned();
  const { tag, panel } = openOwner(view, "a");
  expect(tag.getAttribute("aria-expanded")).toBe("true");
  expect(panel.getAttribute("role")).toBe("dialog");
  expect(panel.getAttribute("aria-label")).toBe("Assignee");
  const input = panel.querySelector("input");
  expect(input.getAttribute("placeholder")).toBe("Find or type a name");
  expect(input.getAttribute("aria-label")).toBe("Find or type a name");
  expect(document.activeElement).toBe(input);
  expect(panel.querySelector(".page-check-subhead").textContent).toBe("People in this document");
  expect(people(panel).map((row) => row.querySelector(".page-check-person-name").textContent)).toEqual(["Ben", "Maya"]);
  expect(people(panel).map((row) => row.querySelector(".page-check-person-meta").textContent)).toEqual(["1 item", "2 items"]);
  expect(people(panel).map((row) => row.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  expect(people(panel)[0].querySelector(".page-board-face").textContent).toBe("B");
  expect(people(panel)[1].querySelector("svg")).not.toBeNull();
  press(input, "Escape");
});

test("typing a new name and pressing Enter assigns it in one undo step", () => {
  const view = owned();
  const { panel } = openOwner(view, "a");
  const input = panel.querySelector("input");
  typing(input, "Ro");
  expect(people(panel)).toHaveLength(0);
  const add = panel.querySelector('[data-check="owner-new"]');
  expect(add.textContent).toContain("Assign to Ro");
  expect(add.querySelector(".page-check-person-meta").textContent).toBe("New");
  press(input, "Enter");
  expect(view.state.doc.child(0).attrs.owner).toBe("Ro");
  expect(document.querySelector(".page-check-owner")).toBeNull();
  let undone;
  history.undo(view.state, (tr) => { undone = view.state.apply(tr); });
  expect(undone.doc.child(0).attrs.owner).toBe("Maya");
});

test("Remove assignee is disabled without an owner and clears one when there is an owner", () => {
  const view = editor([
    ["a", "list_item", "A", { kind: "check" }],
    ["b", "list_item", "B", { kind: "check", owner: "Maya" }],
  ]);
  const first = openOwner(view, "a");
  expect(first.panel.querySelector('[data-check="clear-owner"]').disabled).toBe(true);
  press(first.panel.querySelector("input"), "Escape");
  const second = openOwner(view, "b");
  const clear = second.panel.querySelector('[data-check="clear-owner"]');
  expect(clear.disabled).toBe(false);
  expect(clear.textContent).toBe("Remove assignee");
  expect(clear.querySelector("svg")).not.toBeNull();
  clear.click();
  expect(view.state.doc.child(1).attrs.owner).toBeNull();
  expect(document.querySelector(".page-check-owner")).toBeNull();
});

test("Escape closes the assignee panel and returns focus to the tag", () => {
  const view = owned();
  const { tag, panel } = openOwner(view, "a");
  press(panel, "Escape");
  expect(document.querySelector(".page-check-owner")).toBeNull();
  expect(tag.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(tag);
});

test("date can be set and cleared, with one undo step per change", () => {
  const view = fresh();
  view.dom.querySelector('[data-check="date"]').click();
  document.querySelector('.page-check-date [data-check="date-quick"]').click();
  expect(view.state.doc.child(0).attrs.due).toBe(dayKey(0));
  expect(view.dom.querySelector('[data-check="date"]').getAttribute("aria-label")).toBe("Due date: Today");
  let undone;
  history.undo(view.state, (tr) => { undone = view.state.apply(tr); });
  expect(undone.doc.child(0).attrs.due).toBeNull();
  view.dom.querySelector('[data-check="date"]').click();
  document.querySelector('.page-check-date [data-check="clear-date"]').click();
  expect(view.state.doc.child(0).attrs.due).toBeNull();
});

test("keyboard shortcuts focus both controls from the item text", () => {
  const view = fresh();
  select(view, 2);
  expect(key(view, "o", { metaKey: true, shiftKey: true })).toBe(true);
  expect(document.activeElement.dataset.check).toBe("owner");
  view.focus();
  expect(key(view, "d", { metaKey: true, shiftKey: true })).toBe(true);
  expect(document.activeElement.dataset.check).toBe("date");
});

test("a control the document switched off has no shortcut", () => {
  const view = fresh();
  select(view, 2);
  view.focus();
  view.dom.setAttribute("data-assignees", "false");
  expect(key(view, "o", { metaKey: true, shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(view.dom);
  view.dom.removeAttribute("data-assignees");
  view.dom.setAttribute("data-dates", "false");
  expect(key(view, "d", { metaKey: true, shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(view.dom);
});
