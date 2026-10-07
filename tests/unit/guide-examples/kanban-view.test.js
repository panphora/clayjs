import { loadExample, click, flushMicrotasks } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);

beforeAll(async () => {
  clay = await loadExample("kanban.html", { editMode: false });
}, 15000);

test("a viewer gets no save surface and no edit plugins", () => {
  expect(clay.isEditMode).toBe(false);
  expect("save" in clay).toBe(false);
  expect(clay.undo).toBeUndefined();
  expect(clay.RichClay).toBeUndefined();
});

test("record text is inert and controls are disabled", () => {
  expect($('[data-id="c-brief"] h3').hasAttribute("contenteditable")).toBe(false);
  expect($('[data-id="i-brief-1"] input').disabled).toBe(true);
});

test("edit controls carry show-when and the generated rule hides them", () => {
  const rule = $('style[data-name="option-visibility"]').textContent;
  expect(rule).toContain('show-when\\:editmode="true"');
  expect(document.documentElement.getAttribute("editmode")).toBe("false");
});

test("a viewer can still open a card and filter", async () => {
  click($('[data-id="c-pricing"] h3'));
  await flushMicrotasks();
  expect(location.hash).toBe("#card=c-pricing");
  expect($("#view-state").textContent).toContain('[data-id="c-pricing"]');
});

test("edit actions do nothing for a viewer", async () => {
  const before = document.querySelectorAll(".card").length;
  click($('[data-id="col-todo"] .add-card'));
  await flushMicrotasks();
  expect(document.querySelectorAll(".card").length).toBe(before);
});
