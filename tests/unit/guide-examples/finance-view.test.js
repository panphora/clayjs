import { loadExample, click, flushMicrotasks, tick } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);

beforeAll(async () => {
  clay = await loadExample("finance.html", { editMode: false });
  await clay.loaded.sap;
  await tick(50);
}, 15000);

test("a viewer gets no save surface and sap still mounts clean", () => {
  expect(clay.isEditMode).toBe(false);
  expect("save" in clay).toBe(false);
  expect(window.Sap.status().ok).toBe(true);
  expect(document.querySelectorAll("[sap-error]").length).toBe(0);
});

test("record fields are inert and inputs are read-only", () => {
  expect($('#t-k1 [bind="memo"]').hasAttribute("contenteditable")).toBe(false);
  expect($('#t-k1 input[bind="amount"]').readOnly).toBe(true);
  expect($('#cat-rent input[bind="budget"]').readOnly).toBe(true);
});

test("edit controls carry show-when and the generated rule hides them", () => {
  expect($('style[data-name="option-visibility"]').textContent).toContain('show-when\\:editmode="true"');
  expect($('[trigger-add="txns"]').getAttribute("show-when:editmode")).toBe("true");
});

test("a viewer can still search and export", async () => {
  const q = $('input[bind="q"]');
  q.value = "concert";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  window.Sap.refresh();
  await flushMicrotasks();
  expect($("#t-k1").hidden).toBe(true);
  expect($("#t-k4").hidden).toBe(false);

  let blob = null;
  URL.createObjectURL = (b) => { blob = b; return "blob:x"; };
  URL.revokeObjectURL = () => {};
  click($('[data-action="export"]'));
  const csv = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(blob); });
  expect(csv.split("\n")[0]).toBe("date,memo,category,amount");
  expect(csv).toContain("2026-10-05,Concert tickets,Fun,72");
});

test("import is an edit action and does nothing for a viewer", () => {
  let opened = false;
  document.getElementById("csv-picker").click = () => { opened = true; };
  click($('[data-action="import"]'));
  expect(opened).toBe(false);
});
