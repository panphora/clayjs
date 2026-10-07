import { jest } from "@jest/globals";
import { loadExample, click, flushMicrotasks, peer, saves, tick } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);
const block = (id) => $(`.block[data-id="${id}"]`);
const ids = () => [...document.querySelectorAll("#blocks [data-id]")].map((el) => el.dataset.id);

beforeAll(async () => {
  clay = await loadExample("writer.html");
  await tick(300);
}, 15000);

test("opening the page writes nothing", () => {
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("every block gets a runtime gutter, and the list drags by its handle only", () => {
  for (const b of document.querySelectorAll("#blocks > .block")) {
    expect(b.querySelector(':scope > .gutter[clay="editor-ui"] [sortable-handle]')).not.toBeNull();
  }
  expect(window.Sortable.get($("#blocks")).option("handle")).toBe("[sortable-handle]");
});

test("the saved file holds blocks and none of the chrome", () => {
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html");
  expect(saved.querySelectorAll("#blocks > .block").length).toBe(6);
  expect(saved.querySelector(".gutter")).toBeNull();
  expect(saved.querySelector("#chrome")).toBeNull();
  expect(saved.querySelector("[data-richclay-active]")).toBeNull();
  expect(saved.querySelector('[data-id="b-goals"] .body h2').textContent).toBe("Goals");
  expect(saved.querySelector('[data-id="b-goals"] .body').getAttribute("editable")).toBe("toolbar-on-select");
});

test("derived outline and word count", () => {
  expect([...document.querySelectorAll("#outline a")].map((a) => a.textContent)).toEqual(["Goals", "After launch"]);
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html").getElementById("blocks");
  const walker = saved.ownerDocument.createTreeWalker(saved, NodeFilter.SHOW_TEXT);
  let words = 0;
  while (walker.nextNode()) words += walker.currentNode.data.split(/\s+/).filter(Boolean).length;
  expect(saved.querySelector(".gutter")).toBeNull();
  expect($("#status").textContent).toBe(`${words} words`);
});

test("the + menu inserts a block with a fresh id after its block", async () => {
  click(block("b-intro").querySelector('[data-mode="insert"]'));
  expect($("#menu").hidden).toBe(false);
  click($('#menu [data-insert="callout"]'));
  await flushMicrotasks();
  const next = block("b-intro").nextElementSibling;
  expect(next.dataset.type).toBe("callout");
  expect(next.dataset.id).toMatch(/^b-/);
  expect(new Set(ids()).size).toBe(ids().length);
  expect($("#menu").hidden).toBe(true);
  expect(clay.hasUnsavedChanges()).toBe(true);
});

test("a to-do block gets one item, Enter adds the next with its own id", async () => {
  click(block("b-intro").querySelector('[data-mode="insert"]'));
  click($('#menu [data-insert="todo"]'));
  await flushMicrotasks();
  const todo = block("b-intro").nextElementSibling;
  const first = todo.querySelector("li > span");
  first.textContent = "One";
  first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  const items = todo.querySelectorAll("li");
  expect(items.length).toBe(2);
  expect(items[0].dataset.id).not.toBe(items[1].dataset.id);
  expect(items[1].querySelector("span").getAttribute("contenteditable")).toBe("plaintext-only");
});

test("duplicate gives the copy and its items fresh ids and no runtime residue", async () => {
  await flushMicrotasks();
  click(block("b-tasks").querySelector('[data-mode="block"]'));
  click($('#menu [data-block="duplicate"]'));
  await flushMicrotasks();
  const copy = block("b-tasks").nextElementSibling;
  expect(copy.dataset.id).not.toBe("b-tasks");
  expect(copy.querySelectorAll(".gutter").length).toBe(1);
  expect(new Set(ids()).size).toBe(ids().length);
  click(block("b-goals").querySelector('[data-mode="block"]'));
  click($('#menu [data-block="duplicate"]'));
  await tick(300);
  const goalsCopy = block("b-goals").nextElementSibling;
  const saved = new DOMParser().parseFromString(clay.getHTML(), "text/html");
  const savedCopy = saved.querySelector(`[data-id="${goalsCopy.dataset.id}"] .body`);
  expect(savedCopy.getAttribute("editable")).toBe("toolbar-on-select");
  expect(savedCopy.hasAttribute("contenteditable")).toBe(false);
  expect(savedCopy.querySelector("h2").textContent).toBe("Goals");
});

test("an image block embeds when the host stores no files", async () => {
  const picker = $("#image-picker");
  const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
  picker.click = () => {
    Object.defineProperty(picker, "files", { value: [file], configurable: true });
    picker.onchange();
  };
  click(block("b-intro").querySelector('[data-mode="insert"]'));
  click($('#menu [data-insert="image"]'));
  for (let i = 0; i < 50 && !document.querySelector('.block[data-type="image"] img[src]'); i++) await tick(20);
  const img = document.querySelector('.block[data-type="image"] img');
  expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
});

test("a slash command in the first, otherwise empty block inserts at the top", async () => {
  const first = $("#blocks").firstElementChild;
  const next = first.nextElementSibling;
  const para = first.querySelector(".body p");
  first.querySelector(".body").replaceChildren(para);
  para.textContent = "/";
  const range = document.createRange();
  range.selectNodeContents(para);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  para.dispatchEvent(new KeyboardEvent("keyup", { key: "/", bubbles: true }));
  expect($("#menu").hidden).toBe(false);
  click($('#menu [data-insert="divider"]'));
  await flushMicrotasks();
  expect(first.isConnected).toBe(false);
  expect($("#blocks").firstElementChild.dataset.type).toBe("divider");
  expect($("#blocks").firstElementChild.nextElementSibling).toBe(next);
});

test("an upload whose anchor block was deleted meanwhile still lands", async () => {
  const anchor = $("#blocks").firstElementChild;
  const after = anchor.nextElementSibling;
  let finish;
  const upload = jest.spyOn(clay, "upload").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const picker = $("#image-picker");
  picker.click = () => {};
  click(anchor.querySelector('[data-mode="insert"]'));
  click($('#menu [data-insert="image"]'));
  Object.defineProperty(picker, "files", { configurable: true, value: [new File(["x"], "x.png", { type: "image/png" })] });
  const pending = picker.onchange();
  anchor.remove();
  finish({ ok: true, uploads: [{ url: "/uploaded-fixture.png" }] });
  await pending;
  await flushMicrotasks();
  const img = $('img[src="/uploaded-fixture.png"]');
  expect(img).not.toBeNull();
  expect(img.closest(".block").nextElementSibling).toBe(after);
  expect(clay.getHTML()).toContain("/uploaded-fixture.png");
  upload.mockRestore();
});

test("a peer's edit to another block merges while this tab has unsaved edits", async () => {
  await clay.save();
  const p = await peer();
  block("b-next").querySelector(".body p").textContent = "Local change.";
  await flushMicrotasks();
  await p.apply(p.base.replace("Pricing stays at $15 a month", "Pricing stays at $12 a month"));
  expect(block("b-note").textContent).toContain("$12 a month");
  expect(block("b-next").textContent).toContain("Local change.");
  expect(block("b-note").querySelectorAll(".gutter").length).toBe(1);
  p.stop();
});

test("zz no uncaught errors while the page runs", async () => {
  await tick(200);
  expect(window.__guideErrors).toEqual([]);
});
