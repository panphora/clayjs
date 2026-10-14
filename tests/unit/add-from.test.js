import { jest } from "@jest/globals";
import { addFrom, newId } from "../../src/attrs/add-from.js";

beforeEach(() => {
  document.body.innerHTML = `
    <ul id="tasks"><li data-id="t-1"><span contenteditable="plaintext-only">Write the brief</span></li></ul>
    <button type="button" add-from="#task-tpl" add-to="#tasks">Add task</button>
    <button type="button" id="bad" add-from="#missing" add-to="#tasks">Broken</button>
    <template id="task-tpl"><li><span class="grip">↕</span> <span contenteditable="plaintext-only">New task</span></li></template>`;
});

test("a click appends a clone of the template with a fresh data-id", () => {
  document.querySelector("[add-from='#task-tpl']").click();
  const items = document.querySelectorAll("#tasks > li");
  expect(items.length).toBe(2);
  const added = items[1];
  expect(added.querySelector("[contenteditable]").textContent).toBe("New task");
  expect(added.getAttribute("data-id")).toMatch(/^[a-z0-9]{6,}$/);
  expect(document.getElementById("task-tpl").content.firstElementChild.hasAttribute("data-id")).toBe(false);
});

test("each click mints a different id", () => {
  const button = document.querySelector("[add-from='#task-tpl']");
  button.click();
  button.click();
  const ids = [...document.querySelectorAll("#tasks > li")].map((li) => li.getAttribute("data-id"));
  expect(new Set(ids).size).toBe(3);
});

test("the new item's editable field is focused with its text selected", () => {
  document.querySelector("[add-from='#task-tpl']").click();
  const field = document.querySelector("#tasks > li:last-child [contenteditable]");
  expect(document.activeElement).toBe(field);
  expect(window.getSelection().toString()).toBe("New task");
});

test("a template that already carries a data-id keeps it", () => {
  document.getElementById("task-tpl").content.firstElementChild.setAttribute("data-id", "fixed");
  const item = addFrom(document.querySelector("[add-from='#task-tpl']"));
  expect(item.getAttribute("data-id")).toBe("fixed");
});

test("a missing template warns and adds nothing", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  document.getElementById("bad").click();
  expect(document.querySelectorAll("#tasks > li").length).toBe(1);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("an invalid selector warns instead of throwing", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const trigger = document.createElement("button");
  trigger.setAttribute("add-from", "#[bad");
  trigger.setAttribute("add-to", "#tasks");
  expect(addFrom(trigger)).toBe(null);
  warn.mockRestore();
});

test("newId uses only lowercase letters and digits", () => {
  expect(newId()).toMatch(/^[a-z0-9]+$/);
});
