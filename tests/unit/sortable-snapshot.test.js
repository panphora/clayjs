import { captureForSave } from "../../src/core/snapshot.js";

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = `
    <ul sortable>
      <li class="item sortable-chosen sortable-ghost" draggable="false" style="">A</li>
      <li class="sortable-drag">B</li>
    </ul>
    <p class="sortable-ghost" draggable="false">outside</p>`;
  const sortable = await import("../../src/plugins/sortable.js");
  await sortable.ready;
}, 15000);

test("a save mid-drag writes no Sortable residue into the snapshot", () => {
  const saved = new DOMParser().parseFromString(captureForSave({ emitForSync: false }), "text/html");

  const [first, second] = saved.querySelectorAll("ul[sortable] > li");
  expect(first.getAttribute("class")).toBe("item");
  expect(first.hasAttribute("draggable")).toBe(false);
  expect(first.hasAttribute("style")).toBe(false);
  expect(second.hasAttribute("class")).toBe(false);

  const outside = saved.querySelector("p");
  expect(outside.getAttribute("class")).toBe("sortable-ghost");
  expect(outside.getAttribute("draggable")).toBe("false");

  const live = document.querySelector("ul[sortable] > li");
  expect(live.getAttribute("class")).toBe("item sortable-chosen sortable-ghost");
});
