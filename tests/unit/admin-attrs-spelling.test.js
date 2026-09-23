/**
 * @jest-environment jsdom
 */

/**
 * clay's edit-mode transforms put the author's attributes back on save. A save that
 * copies the author's bytes wherever the page did not change shows every rewrite here
 * as a diff in a file nobody edited.
 */

let snapshot;

beforeAll(async () => {
  document.body.innerHTML = `
    <button id="empty" editmode:onclick inert-onclick="">a</button>
    <button id="none" editmode:onclick>b</button>
    <button id="set" editmode:onclick inert-onclick="go()">c</button>
    <div id="upper" editmode:contenteditable inert-contenteditable="FALSE">d</div>
    <div id="upper-true" editmode:contenteditable inert-contenteditable="TRUE">e</div>
    <input id="dis" viewmode:disabled disabled="disabled">
    <input id="ro" viewmode:readonly readonly>`;
  snapshot = await import("../../src/core/snapshot.js");
  const onclick = await import("../../src/core/admin-onclick.js");
  const editable = await import("../../src/core/admin-contenteditable.js");
  const inputs = await import("../../src/core/admin-inputs.js");
  onclick.disableOnClickBeforeSave();
  editable.disableContentEditableBeforeSave();
  inputs.disableAdminInputsBeforeSave();
  onclick.enableOnClick();
  editable.enableContentEditable();
  inputs.enableAdminInputs();
});

const raw = () => snapshot.captureForSave({ emitForSync: false });
const saved = () => new DOMParser().parseFromString(raw(), "text/html");

test("an inert-onclick is saved as written, never as the string null", () => {
  const d = saved();
  expect(d.getElementById("empty").getAttribute("inert-onclick")).toBe("");
  expect(d.getElementById("none").hasAttribute("inert-onclick")).toBe(false);
  expect(d.getElementById("set").getAttribute("inert-onclick")).toBe("go()");
});

test("contenteditable keywords match case-insensitively and keep the author's case", () => {
  expect(document.getElementById("upper").getAttribute("contenteditable")).toBe("FALSE");
  const d = saved();
  expect(d.getElementById("upper").getAttribute("inert-contenteditable")).toBe("FALSE");
  expect(d.getElementById("upper-true").getAttribute("inert-contenteditable")).toBe("TRUE");
});

test("disabled and readonly go back with the author's spelling", () => {
  expect(document.getElementById("dis").hasAttribute("disabled")).toBe(false);   // edit mode removed it
  expect(raw()).toContain('disabled="disabled"');
  expect(saved().getElementById("ro").getAttribute("readonly")).toBe("");
});
