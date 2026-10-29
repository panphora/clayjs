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

test("owner list uses available people and accepts typed names", async () => {
  globalThis.clay = { people: { available: async () => [{ id: "person-1", name: "Maya" }] } };
  const view = fresh();
  view.dom.querySelector('[data-check="owner"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  view.dom.querySelector('[data-check="owner-option"]').click();
  expect(view.state.doc.child(0).attrs.owner).toBe("Maya");
  view.dom.querySelector('[data-check="owner"]').click();
  const input = view.dom.querySelector('input[aria-label="Owner name"]');
  input.value = "Nia";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(view.state.doc.child(0).attrs.owner).toBe("Nia");
  view.dom.querySelector('[data-check="owner"]').click();
  view.dom.querySelector('[data-check="clear-owner"]').click();
  expect(view.state.doc.child(0).attrs.owner).toBeNull();
});

test("date can be set and cleared, with one undo step per change", () => {
  const view = fresh();
  view.dom.querySelector('[data-check="date"]').click();
  const input = view.dom.querySelector('input[type="date"]');
  input.value = "2026-10-26";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(view.state.doc.child(0).attrs.due).toBe("2026-10-26");
  expect(view.dom.querySelector('[data-check="date"]').getAttribute("aria-label")).toBe("Due date: Oct 26");
  let undone;
  history.undo(view.state, (tr) => { undone = view.state.apply(tr); });
  expect(undone.doc.child(0).attrs.due).toBeNull();
  view.dom.querySelector('[data-check="date"]').click();
  view.dom.querySelector('[data-check="clear-date"]').click();
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
