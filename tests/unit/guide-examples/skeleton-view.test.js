import { loadExample, click, flushMicrotasks } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);

beforeAll(async () => {
  clay = await loadExample("skeleton.html", { editMode: false });
}, 15000);

test("a viewer gets inert text, disabled boxes and no edit actions", async () => {
  expect(clay.isEditMode).toBe(false);
  expect($('[data-id="r-mmm"] .title').hasAttribute("contenteditable")).toBe(false);
  expect($('[data-id="r-mmm"] input').disabled).toBe(true);
  click($('[data-action="add"]'));
  await flushMicrotasks();
  expect(document.querySelectorAll("#items > li").length).toBe(2);
  expect($("#summary").textContent).toBe("1 of 2 read");
});
