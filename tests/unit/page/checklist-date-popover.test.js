import { jest } from "@jest/globals";
import { editor } from "./view-helpers.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";

const fresh = (attrs = {}) => editor([["check", "list_item", "Do it", { kind: "check", ...attrs }]]);
const open = (view) => {
  const tag = view.dom.querySelector('[data-check="date"]');
  tag.click();
  return { tag, panel: document.querySelector(".page-check-date") };
};
const quick = (panel) => [...panel.querySelectorAll('[data-check="date-quick"]')];
const days = (panel) => [...panel.querySelectorAll('[data-check="date-day"]')];
const monthLabel = (panel) => panel.querySelector(".page-check-cal-month").textContent;
const press = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

beforeEach(() => { jest.useFakeTimers({ now: new Date(2026, 9, 29) }); });
afterEach(() => { jest.useRealTimers(); });

test("the quick rows write today, tomorrow and next week", () => {
  const view = fresh();
  const { panel } = open(view);
  expect(panel.getAttribute("role")).toBe("dialog");
  expect(panel.getAttribute("aria-label")).toBe("Due date");
  expect(quick(panel).map((row) => row.querySelector(".page-check-quick-label").textContent)).toEqual(["Today", "Tomorrow", "Next week"]);
  expect(quick(panel).map((row) => row.querySelector(".page-check-quick-meta").textContent)).toEqual(["Thu, Oct 29", "Fri, Oct 30", "Thu, Nov 5"]);
  expect(quick(panel).every((row) => row.tagName === "BUTTON" && row.querySelector("svg") !== null)).toBe(true);
  const expected = ["2026-10-29", "2026-10-30", "2026-11-05"];
  expected.forEach((due, i) => {
    quick(open(view).panel)[i].click();
    expect(view.state.doc.child(0).attrs.due).toBe(due);
    expect(document.querySelector(".page-check-date")).toBeNull();
  });
});

test("the calendar opens on this month, steps to the next, and a day writes its date", () => {
  const view = fresh();
  const { panel } = open(view);
  expect(monthLabel(panel)).toBe("October 2026");
  expect([...panel.querySelectorAll(".page-check-cal-dow")].map((head) => head.textContent)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
  expect(days(panel)).toHaveLength(35);
  expect(days(panel).filter((day) => day.dataset.outside === "true").length).toBe(4);
  const today = days(panel).find((day) => day.dataset.today === "true");
  expect(today.getAttribute("aria-label")).toBe("Thursday, October 29, 2026");
  expect(document.activeElement).toBe(today);
  expect(panel.querySelector('[aria-label="Previous month"]')).not.toBeNull();
  panel.querySelector('[aria-label="Next month"]').click();
  expect(monthLabel(panel)).toBe("November 2026");
  const target = days(panel).find((day) => day.getAttribute("aria-label") === "Wednesday, November 4, 2026");
  target.click();
  expect(view.state.doc.child(0).attrs.due).toBe("2026-11-04");
  expect(document.querySelector(".page-check-date")).toBeNull();
});

test("the calendar opens on the item's own month and marks its day as picked", () => {
  const view = fresh({ due: "2026-11-04" });
  const { panel } = open(view);
  expect(monthLabel(panel)).toBe("November 2026");
  const picked = days(panel).find((day) => day.getAttribute("aria-pressed") === "true");
  expect(picked.getAttribute("aria-label")).toBe("Wednesday, November 4, 2026");
  expect(document.activeElement).toBe(picked);
});

test("Clear date is disabled without a date and writes null when there is one, in one undo step", () => {
  const empty = fresh();
  const first = open(empty).panel.querySelector('[data-check="clear-date"]');
  expect(first.disabled).toBe(true);
  press(document.querySelector(".page-check-date"), "Escape");

  const view = fresh({ due: "2026-11-04" });
  const { panel } = open(view);
  const clear = panel.querySelector('[data-check="clear-date"]');
  expect(clear.disabled).toBe(false);
  expect(clear.textContent).toBe("Clear date");
  expect(clear.querySelector("svg")).not.toBeNull();
  clear.click();
  expect(view.state.doc.child(0).attrs.due).toBeNull();
  expect(document.querySelector(".page-check-date")).toBeNull();
  let undone;
  history.undo(view.state, (tr) => { undone = view.state.apply(tr); });
  expect(undone.doc.child(0).attrs.due).toBe("2026-11-04");
});

test("Escape closes the panel and returns focus to the tag", () => {
  const view = fresh();
  const { tag, panel } = open(view);
  expect(tag.getAttribute("aria-expanded")).toBe("true");
  press(panel.querySelector('[data-check="date-day"]'), "Escape");
  expect(document.querySelector(".page-check-date")).toBeNull();
  expect(tag.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(tag);
});

test("arrow keys move by a day or a week, crossing months, and Enter picks the focused day", () => {
  const view = fresh({ due: "2026-10-31" });
  const { panel } = open(view);
  const focused = () => document.activeElement;
  expect(focused().getAttribute("aria-label")).toBe("Saturday, October 31, 2026");
  press(focused(), "ArrowRight");
  expect(monthLabel(panel)).toBe("November 2026");
  expect(focused().getAttribute("aria-label")).toBe("Sunday, November 1, 2026");
  press(focused(), "ArrowDown");
  expect(focused().getAttribute("aria-label")).toBe("Sunday, November 8, 2026");
  press(focused(), "ArrowUp");
  press(focused(), "ArrowLeft");
  expect(monthLabel(panel)).toBe("October 2026");
  expect(focused().getAttribute("aria-label")).toBe("Saturday, October 31, 2026");
  press(focused(), "ArrowDown");
  press(focused(), "Enter");
  expect(view.state.doc.child(0).attrs.due).toBe("2026-11-07");
});
