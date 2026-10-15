/**
 * A save that carried a script-set [persist] value the control's attributes do not
 * hold leaves the file different from those attributes. Setting the control back
 * to its attribute value is then an unsaved change, and the gate must say so.
 */

let gate;

beforeAll(async () => {
  window.clayEditMode = true;
  gate = await import("../../src/lib/dirty-gate.js");
});

beforeEach(async () => {
  document.body.innerHTML = "";
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
});

async function settleRecords() {
  await Promise.resolve();
  gate.gateClearIfUnchanged(gate.gateCaptureToken());
}

test.each([
  ["input", '<input persist type="text" value="initial">', (el) => { el.value = "programmatic"; }, (el) => { el.value = "initial"; }],
  ["textarea", "<textarea persist>initial</textarea>", (el) => { el.value = "programmatic"; }, (el) => { el.value = "initial"; }],
  ["checkbox", '<input persist type="checkbox">', (el) => { el.checked = true; }, (el) => { el.checked = false; }],
  ["select", "<select persist><option>a</option><option>b</option></select>", (el) => { el.value = "b"; }, (el) => { el.value = "a"; }],
])("%s: a script write back to the attribute value after a save stays dirty", async (_kind, markup, setByScript, setBack) => {
  document.body.innerHTML = markup;
  await settleRecords();
  const el = document.body.firstElementChild;
  expect(gate.pageMaybeDirty()).toBe(false);

  setByScript(el);
  expect(gate.pageMaybeDirty()).toBe(true);
  gate.gateClearIfUnchanged(gate.gateCaptureToken()); // the save that wrote the script's value
  expect(gate.pageMaybeDirty()).toBe(false);

  setBack(el);
  expect(gate.pageMaybeDirty()).toBe(true);

  gate.gateClearIfUnchanged(gate.gateCaptureToken()); // the save that wrote it back
  expect(gate.pageMaybeDirty()).toBe(false);
});

test("a saved value the attributes also hold leaves the probe as it was", async () => {
  document.body.innerHTML = '<input persist type="text" value="initial">';
  await settleRecords();
  const el = document.querySelector("input");
  el.value = "typed";
  el.setAttribute("value", "typed");
  await settleRecords(); // the save
  expect(gate.pageMaybeDirty()).toBe(false);
  el.value = "initial";
  expect(gate.pageMaybeDirty()).toBe(true);
  el.value = "typed";
  expect(gate.pageMaybeDirty()).toBe(false);
});
