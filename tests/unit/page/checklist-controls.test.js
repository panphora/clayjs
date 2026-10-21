import { editor, key, select } from "./view-helpers.js";
import { history } from "../../../src/vendor/prosemirror.vendor.js";

const fresh = () => editor([
  ["check", "list_item", "Do it", { kind: "check" }],
  ["plain", "list_item", "Ordinary", { kind: "bullet" }],
]);
afterEach(() => { delete globalThis.clay; });

test("only checklist items have owner and date chips", () => {
  const view = fresh();
  expect(view.dom.querySelectorAll(".page-check-controls")).toHaveLength(1);
  expect([...view.dom.querySelectorAll(".page-check-chip")].map((button) => button.textContent)).toEqual(["Assign", "Date"]);
  expect([...view.dom.querySelectorAll(".page-check-chip")].every((button) => button.tagName === "BUTTON")).toBe(true);
});

test("owner list uses available people and accepts typed names", async () => {
  globalThis.clay = { people: { available: async () => [{ id: "person-1", name: "Maya" }] } };
  const view = fresh();
  view.dom.querySelector('[data-check="owner"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  view.dom.querySelector('[role="option"]').click();
  expect(view.state.doc.child(0).attrs.owner).toBe("Maya");
  view.dom.querySelector('[data-check="owner"]').click();
  const input = view.dom.querySelector('input[aria-label="Owner name"]');
  input.value = "Nia";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  view.dom.querySelector('[data-check="owner-typed"]').click();
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
  expect(view.dom.querySelector('[data-check="date"]').getAttribute("aria-label")).toBe("Due Oct 26");
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
