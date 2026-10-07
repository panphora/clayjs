import { loadExample, click, flushMicrotasks, tick } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);

beforeAll(async () => {
  clay = await loadExample("writer.html", { editMode: false });
  await tick(50);
}, 15000);

test("viewers get the outline but no gutters, menus or editors", () => {
  expect(document.querySelectorAll(".gutter").length).toBe(0);
  expect([...document.querySelectorAll("#outline a")].map((a) => a.textContent)).toEqual(["Goals", "After launch"]);
  expect($("[data-richclay-active]")).toBeNull();
  expect($('[data-id="t-1"] input').disabled).toBe(true);
  expect($(".page > h1").hasAttribute("contenteditable")).toBe(false);
});

test("typing / or clicking does nothing for a viewer", async () => {
  const before = document.querySelectorAll("#blocks > .block").length;
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "/", bubbles: true }));
  await flushMicrotasks();
  expect($("#menu").hidden).toBe(true);
  expect(document.querySelectorAll("#blocks > .block").length).toBe(before);
  expect(window.__guideErrors).toEqual([]);
});
