import { loadExample, click, flushMicrotasks, peer, saves, tick } from "./helpers.js";

let clay;
const $ = (s) => document.querySelector(s);
const card = (id) => $(`.card[data-id="${id}"]`);

beforeAll(async () => {
  clay = await loadExample("kanban.html");
}, 15000);

test("opening the page writes nothing", () => {
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("derived values render into chrome", () => {
  expect(card("c-brief").querySelector(".progress").textContent).toBe("1/2 done");
  expect($('[data-id="col-todo"] .count').textContent).toBe("2");
  expect($("#chrome #filter")).not.toBeNull();
});

test("the saved file holds the record and none of the chrome", () => {
  const html = clay.getHTML();
  expect(html).toContain('data-id="c-brief"');
  expect(html).toContain('inert-contenteditable="plaintext-only"');
  expect(html).not.toContain('id="chrome"');
  expect(html).not.toContain('class="progress"');
  expect(html).not.toContain('class="count"');
  expect(html).not.toContain("data-richclay-active");
  const saved = new DOMParser().parseFromString(html, "text/html");
  expect(saved.querySelectorAll("#board [contenteditable]").length).toBe(0);
  expect(saved.querySelectorAll("#board [inert-contenteditable]").length).toBeGreaterThan(5);
  expect(html).toMatch(/data-id="i-brief-2"><input type="checkbox" persist="?"? viewmode:disabled="?"? disabled/);
  expect(html).not.toMatch(/<html[^>]*editmode=/);
});

test("titles are editable in edit mode", () => {
  expect(card("c-brief").querySelector("h3").getAttribute("contenteditable")).toBe("plaintext-only");
  expect(card("c-brief").querySelector(".checklist input").disabled).toBe(false);
});

test("opening a card and filtering are tab-local", async () => {
  location.hash = "card=c-brief";
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await flushMicrotasks();
  expect($("#view-state").textContent).toContain('[data-id="c-brief"]');
  const filter = $("#filter");
  filter.value = "pricing";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
  await flushMicrotasks();
  expect($("#view-state").textContent).toContain(".card:not(");
  expect(clay.hasUnsavedChanges()).toBe(false);
  filter.value = "";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
  click($("#chrome .backdrop"));
  await flushMicrotasks();
  expect($("#view-state").textContent).toBe("");
});

test("the filter matches record text, not the progress badge", async () => {
  expect($('[data-id="c-brief"] .progress').textContent).toMatch(/done/);
  const filter = $("#filter");
  filter.value = "done";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
  await flushMicrotasks();
  expect($("#view-state").textContent).not.toContain('[data-id="c-brief"]');
  filter.value = "";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
  await flushMicrotasks();
});

test("Add card mints a unique id, logs activity, and saves", async () => {
  click($('[data-id="col-todo"] .add-card'));
  await flushMicrotasks();
  const cards = [...document.querySelectorAll('[data-id="col-todo"] .card')];
  const added = cards[cards.length - 1];
  expect(added.dataset.id).toMatch(/^c-[a-z0-9]+$/);
  const ids = [...document.querySelectorAll("[data-id]")].map((el) => el.dataset.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(added.querySelector(".activity li").textContent).toBe("Created");
  expect(added.querySelector("h3").getAttribute("contenteditable")).toBe("plaintext-only");
  expect(clay.hasUnsavedChanges()).toBe(true);
  const result = await clay.save();
  expect(result.ok).toBe(true);
  expect(saves.at(-1)).toContain(`data-id="${added.dataset.id}"`);
  expect(saves.at(-1)).not.toContain('class="progress"');
  expect($('[data-id="col-todo"] .count').textContent).toBe("3");
});

test("checking an item updates progress, and undo restores what shows", async () => {
  const box = card("c-brief").querySelector('[data-id="i-brief-2"] input');
  box.click();
  await flushMicrotasks();
  expect(box.hasAttribute("checked")).toBe(true);
  expect(card("c-brief").querySelector(".progress").textContent).toBe("2/2 done");
  clay.undo.flush();
  clay.undo.undo();
  await flushMicrotasks();
  expect(box.hasAttribute("checked")).toBe(false);
  expect(box.checked).toBe(false);
  expect(card("c-brief").querySelector(".progress").textContent).toBe("1/2 done");
});

test("a peer edit merges with an unsaved local edit and re-renders", async () => {
  await clay.save();
  const p = await peer();
  card("c-site").querySelector("h3").textContent = "Landing page v2";
  await flushMicrotasks();
  const frame = p.base
    .replace("Decide pricing", "Decide pricing tiers")
    .replace(/(data-id="i-brief-2"><input[^>]*?)>/, '$1 checked="">');
  expect(frame).not.toBe(p.base);
  await p.apply(frame);
  expect(card("c-pricing").querySelector("h3").textContent).toBe("Decide pricing tiers");
  expect(card("c-site").querySelector("h3").textContent).toBe("Landing page v2");
  const box = card("c-brief").querySelector('[data-id="i-brief-2"] input');
  expect(box.checked).toBe(true);
  expect(card("c-brief").querySelector(".progress").textContent).toBe("2/2 done");
  expect(card("c-brief").querySelectorAll(".progress").length).toBe(1);
  p.stop();
});

test("a card deleted by a peer while open closes the detail view", async () => {
  location.hash = "card=c-pricing";
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await flushMicrotasks();
  await clay.save();
  const p = await peer();
  const doc = new DOMParser().parseFromString(p.base, "text/html");
  doc.querySelector('[data-id="c-pricing"]').remove();
  await p.apply("<!DOCTYPE html>" + doc.documentElement.outerHTML);
  await tick(10);
  expect(card("c-pricing")).toBeNull();
  expect(location.hash).toBe("");
  p.stop();
});

test("zz no uncaught errors while the page runs", async () => {
  await tick(200);
  expect(window.__guideErrors).toEqual([]);
});
