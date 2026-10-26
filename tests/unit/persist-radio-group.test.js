let enablePersistentFormInputValues;

beforeAll(async () => {
  // Persisted controls settle in the mode that saves them: `persist` mirrors an input
  // into its attributes in edit and writes nothing on a reader's page.
  window.clayEditMode = true;
  ({ default: enablePersistentFormInputValues } = await import("../../src/core/persist.js"));
  enablePersistentFormInputValues();
});

const pick = (el) => {
  el.checked = true;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

test("checking a persisted radio clears its group's checked attributes", () => {
  document.body.innerHTML = '<input id="a" type="radio" name="pick" persist><input id="b" type="radio" name="pick" persist checked>';
  const a = document.getElementById("a");
  const b = document.getElementById("b");
  pick(a);
  expect(a.hasAttribute("checked")).toBe(true);
  expect(b.hasAttribute("checked")).toBe(false);
});

test("the same holds for radios grouped by a form", () => {
  document.body.innerHTML = '<form><input id="a" type="radio" name="pick" persist><input id="b" type="radio" name="pick" persist checked></form>';
  const a = document.getElementById("a");
  const b = document.getElementById("b");
  pick(a);
  expect(a.hasAttribute("checked")).toBe(true);
  expect(b.hasAttribute("checked")).toBe(false);
});

test("a radio with the same name in another form is not touched", () => {
  document.body.innerHTML = '<form id="f1"><input id="a" type="radio" name="pick" persist></form><form id="f2"><input id="b" type="radio" name="pick" persist checked></form>';
  const a = document.getElementById("a");
  const b = document.getElementById("b");
  pick(a);
  expect(a.hasAttribute("checked")).toBe(true);
  expect(b.hasAttribute("checked")).toBe(true);
});
