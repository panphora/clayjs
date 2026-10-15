import { captureForSave } from "../../src/core/snapshot.js";

// A [persist] dropdown with an excluded option must save the options the person
// picked, not the ones at the same positions in the live list.

beforeAll(async () => {
  document.body.innerHTML = `
    <select persist id="one"><option editor-ui>Pick</option><option>A</option><option>B</option></select>
    <select persist id="mid"><option>A</option><option editor-ui>Tools</option><option>B</option><option>C</option></select>
    <select persist multiple id="many"><option>X</option><option editor-ui>Tools</option><option>Y</option><option>Z</option></select>
    <select persist id="plain"><option>P</option><option>Q</option></select>`;
  await import("../../src/core/persist.js"); // registers the onSnapshot finalize hook
});

function savedSelected(html, id) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.getElementById(id).options).filter((o) => o.hasAttribute("selected")).map((o) => o.textContent);
}

test("each select saves exactly the options picked on the page", () => {
  document.getElementById("one").value = "A";
  document.getElementById("mid").value = "C";
  const many = document.getElementById("many");
  many.options[0].selected = true;
  many.options[3].selected = true;
  document.getElementById("plain").value = "Q";

  const html = captureForSave({ emitForSync: false });

  expect(html).not.toContain("Pick");
  expect(html).not.toContain("Tools");
  expect(savedSelected(html, "one")).toEqual(["A"]);
  expect(savedSelected(html, "mid")).toEqual(["C"]);
  expect(savedSelected(html, "many")).toEqual(["X", "Z"]);
  expect(savedSelected(html, "plain")).toEqual(["Q"]);
});

test("picking the second option of the first select saves it, not its neighbour", () => {
  document.getElementById("one").value = "B";
  const html = captureForSave({ emitForSync: false });
  expect(savedSelected(html, "one")).toEqual(["B"]);
});
