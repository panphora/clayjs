import { loadExample, click, flushMicrotasks, peer, saves, tick } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);

beforeAll(async () => {
  clay = await loadExample("skeleton.html");
}, 15000);

test("opening the page writes nothing and derived text renders in chrome", () => {
  expect(clay.hasUnsavedChanges()).toBe(false);
  expect($("#summary").textContent).toBe("1 of 2 read");
});

test("the saved file holds the record, inert, and none of the chrome", () => {
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html");
  expect(saved.querySelector("#summary")).toBeNull();
  expect(saved.querySelector("#view-state")).toBeNull();
  expect(saved.querySelectorAll("#app [contenteditable]").length).toBe(0);
  expect(saved.querySelector('[data-id="r-sicp"] input').hasAttribute("disabled")).toBe(true);
  expect(saved.documentElement.hasAttribute("editmode")).toBe(false);
});

test("filtering is tab-local", async () => {
  const filter = $("#filter");
  filter.value = "mythical";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
  expect($("#view-state").textContent).toContain('[data-id="r-sicp"]');
  expect(clay.hasUnsavedChanges()).toBe(false);
  filter.value = "";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
});

test("checking a box persists, and undo keeps the screen and the file in step", async () => {
  const box = $('[data-id="r-sicp"] input');
  click(box);
  box.dispatchEvent(new Event("change", { bubbles: true }));
  await tick(600);
  expect(box.hasAttribute("checked")).toBe(true);
  expect($("#summary").textContent).toBe("2 of 2 read");
  clay.undo.undo();
  await flushMicrotasks();
  expect(box.hasAttribute("checked")).toBe(false);
  expect(box.checked).toBe(false);
});

test("Add mints a unique id and saves", async () => {
  click($('[data-action="add"]'));
  click($('[data-action="add"]'));
  await flushMicrotasks();
  const ids = [...document.querySelectorAll("#items > li")].map((li) => li.dataset.id);
  expect(ids.length).toBe(4);
  expect(new Set(ids).size).toBe(4);
  const result = await clay.save();
  expect(result.ok).toBe(true);
  expect(saves.at(-1)).toContain(`data-id="${ids[3]}"`);
});

test("a peer's edit merges in beside an unsaved local edit", async () => {
  const p = await peer();
  $('[data-id="r-mmm"] .title').textContent = "The Mythical Man-Month (local)";
  await flushMicrotasks();
  await p.apply(p.base.replace("Structure and Interpretation", "SICP: Structure and Interpretation"));
  expect($('[data-id="r-sicp"] .title').textContent).toContain("SICP:");
  expect($('[data-id="r-mmm"] .title').textContent).toContain("(local)");
  p.stop();
});

test("Sortable residue on a record never reaches the saved file", () => {
  const li = document.querySelector('#items > [data-id="r-mmm"]');
  li.setAttribute("draggable", "false");
  li.setAttribute("style", "");
  li.classList.add("sortable-chosen");
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html").querySelector('[data-id="r-mmm"]');
  expect(saved.hasAttribute("draggable")).toBe(false);
  expect(saved.hasAttribute("style")).toBe(false);
  expect(saved.hasAttribute("class")).toBe(false);
  li.removeAttribute("draggable");
  li.removeAttribute("style");
  li.removeAttribute("class");
});

test("zz no uncaught errors while the page runs", async () => {
  await tick(200);
  expect(window.__guideErrors).toEqual([]);
});
