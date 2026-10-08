import { captureForSave } from "../../src/core/snapshot.js";

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = `
    <ul sortable>
      <li class="item sortable-chosen sortable-ghost" draggable="false" style="">A<a draggable="false">link</a><span style=""></span></li>
      <li class="sortable-drag">B</li>
    </ul>
    <p class="sortable-ghost" draggable="false">outside</p>`;
  const sortable = await import("../../src/plugins/sortable.js");
  await sortable.ready;
}, 15000);

test("a save with no press leaves an authored draggable and empty style alone", () => {
  const saved = new DOMParser().parseFromString(captureForSave({ emitForSync: false }), "text/html");

  const [first, second] = saved.querySelectorAll("ul[sortable] > li");
  expect(first.getAttribute("class")).toBe("item");
  expect(second.hasAttribute("class")).toBe(false);

  expect(first.querySelector("a").getAttribute("draggable")).toBe("false");
  expect(first.querySelector("span").getAttribute("style")).toBe("");

  const outside = saved.querySelector("p");
  expect(outside.getAttribute("class")).toBe("sortable-ghost");
  expect(outside.getAttribute("draggable")).toBe("false");

  const live = document.querySelector("ul[sortable] > li");
  expect(live.getAttribute("class")).toBe("item sortable-chosen sortable-ghost");
});

test("a save mid-drag puts back what Sortable changed on press", async () => {
  const item = document.querySelector("ul[sortable] > li");
  item.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  item.setAttribute("draggable", "true");
  item.setAttribute("style", "height: 40px;");
  const link = item.querySelector("a");
  link.setAttribute("draggable", "true");

  const saved = new DOMParser().parseFromString(captureForSave({ emitForSync: false }), "text/html");
  const [first] = saved.querySelectorAll("ul[sortable] > li");
  expect(first.getAttribute("draggable")).toBe("false");
  expect(first.getAttribute("style")).toBe("");
  expect(first.querySelector("a").getAttribute("draggable")).toBe("false");

  item.dispatchEvent(new Event("pointerup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(item.getAttribute("draggable")).toBe("false");
  expect(item.getAttribute("style")).toBe("");
  expect(item.querySelector("a").getAttribute("draggable")).toBe("false");
});
