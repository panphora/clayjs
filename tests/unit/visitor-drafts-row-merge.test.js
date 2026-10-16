/**
 * Two tabs on one slot, one list of rows. Each tab's save merges the other tab's
 * record row by row, so edits to different rows both survive; when both tabs
 * changed the same row's same field, this tab's value is stored and the other
 * tab's whole record is kept under a `:conflict:` key.
 */
import { jest } from "@jest/globals";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "row-merge-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const RULES = JSON.stringify({
  title: "#title@value",
  rows: ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n" }],
});
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

const START = { title: "owner title", rows: [{ id: "r1", name: "One" }, { id: "r2", name: "Two" }] };
const draftRecord = (data) => JSON.stringify({ v: 1, savedAt: "2026-10-15T01:00:00.000Z", data });

const bodyHTML = (rows) => `<input id="title" value="owner title"><ul id="rows">${SEED}${rows}</ul>`;
const pageHTML = (rows) => `<!DOCTYPE html><html><head>${RULES_TAG}</head><body>${bodyHTML(rows)}</body></html>`;

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

function openTab(doc, storage) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = RULES_TAG;
  doc.body.innerHTML = bodyHTML(row("r1", "One") + row("r2", "Two"));
  return { doc, store: createStore({ doc, storage, now: () => new Date(SAVED_AT) }) };
}

const visibleRows = (doc) =>
  [...doc.querySelectorAll("#rows > li[item]:not([cms-template])")].map((li) => [li.dataset.id, li.textContent]);

const storageWithDraft = () => fakeStorage({ [KEY]: draftRecord(START) });

afterEach(() => {
  jest.restoreAllMocks();
});

test("two tabs that edited the same list keep this tab's list and the other tab's record aside", () => {
  const storage = storageWithDraft();
  const a = openTab(document, storage);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage);
  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);

  a.doc.querySelector('[data-id="r1"] .n').textContent = "A first row";
  b.doc.querySelector('[data-id="r2"] .n').textContent = "B second row";

  a.store.write(pageHTML(row("r1", "A first row") + row("r2", "Two")));
  const otherRaw = storage.getItem(KEY);
  jest.spyOn(console, "warn").mockImplementation(() => {});
  b.store.write(pageHTML(row("r1", "One") + row("r2", "B second row")));

  expect(JSON.parse(storage.getItem(KEY)).data.rows).toEqual([{ id: "r1", name: "One" }, { id: "r2", name: "B second row" }]);
  expect(storage.getItem(KEY + ":conflict")).toBe(otherRaw);
  expect(visibleRows(b.doc)).toEqual([["r1", "One"], ["r2", "B second row"]]);
});

test("a row field both tabs changed keeps this tab's value and keeps the other tab's record aside", () => {
  const storage = storageWithDraft();
  const a = openTab(document, storage);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage);
  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);

  a.doc.querySelector('[data-id="r1"] .n').textContent = "A row";
  b.doc.querySelector('[data-id="r1"] .n').textContent = "B row";

  a.store.write(pageHTML(row("r1", "A row") + row("r2", "Two")));
  const otherRaw = storage.getItem(KEY);

  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  b.store.write(pageHTML(row("r1", "B row") + row("r2", "Two")));

  expect(JSON.parse(storage.getItem(KEY)).data.rows).toEqual([{ id: "r1", name: "B row" }, { id: "r2", name: "Two" }]);
  expect(storage.getItem(KEY + ":conflict")).toBe(otherRaw);
  expect(visibleRows(b.doc)).toEqual([["r1", "B row"], ["r2", "Two"]]);
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: another tab changed the same thing; its copy was kept under",
    KEY + ":conflict"
  );
});

test("a save that would replace another tab's change does not happen when there is no room to keep it aside", () => {
  const storage = storageWithDraft();
  const a = openTab(document, storage);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage);
  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);

  a.store.write(pageHTML(row("r1", "A row") + row("r2", "Two")));
  const otherRaw = storage.getItem(KEY);
  const setItem = storage.setItem;
  storage.setItem = (name, value) => {
    if (String(name).endsWith(":conflict")) throw new Error("QuotaExceededError");
    setItem(name, value);
  };

  expect(() => b.store.write(pageHTML(row("r1", "B row") + row("r2", "Two")))).toThrow("Couldn't save in this browser. Storage is full or turned off.");
  expect(storage.getItem(KEY)).toBe(otherRaw);
});
