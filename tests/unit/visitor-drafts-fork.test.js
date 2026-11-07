/**
 * Two tabs write the draft a few milliseconds apart, and one tab's read of the slot
 * does not yet show the other's write (a browser's storage is not consistent across
 * tabs at that scale). Its record is built on the same parent as the other tab's and
 * overwrites it. The tab whose work was dropped finds out from the storage event and
 * writes both back, merged from the parent they share. A record built on this tab's own
 * write saw it, so a row it removed stays removed.
 */
import { jest } from "@jest/globals";
import { createStore, draftKey } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "fork-1";
const KEY = draftKey(SLOT, "/");
const ROWS = "#rows > li[item]:not([cms-template])";
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const RULES = JSON.stringify({ title: "#title@value", rows: [ROWS, { id: "@data-id", name: ".n" }] });
const rulesTag = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

// One tab's view of the shared storage, which can be held at an earlier moment.
function viewOf(storage) {
  let held = null;
  return {
    ...storage,
    getItem: (name) => (held && name in held ? held[name] : storage.getItem(name)),
    hold() { held = { [KEY]: storage.getItem(KEY) }; },
    release() { held = null; },
  };
}

function openTab(doc, storage) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = rulesTag;
  doc.body.innerHTML = `<input id="title" value="owner title"><ul id="rows">${SEED}${row("r1", "One")}</ul>`;
  const store = createStore({ doc, storage });
  expect(store.restore()).toEqual({ restored: false, hadDraft: false });
  return { doc, store };
}

const htmlOf = (doc) => `<!DOCTYPE html><html><head>${rulesTag}</head><body>` +
  `<input id="title" value="${doc.getElementById("title").value}">` +
  `<ul id="rows">${SEED}${[...doc.querySelectorAll(ROWS)].map((li) => row(li.dataset.id, li.querySelector(".n").textContent)).join("")}</ul>` +
  `</body></html>`;

function addRow(doc, id, name) {
  const li = doc.createElement("li");
  li.setAttribute("item", "");
  li.dataset.id = id;
  li.innerHTML = `<span class="n">${name}</span>`;
  doc.querySelector("#rows").insertBefore(li, doc.querySelector(ROWS));
}

const save = (tab) => tab.store.write(htmlOf(tab.doc));
const storedIds = (storage) => JSON.parse(storage.getItem(KEY)).data.rows.map((r) => r.id).sort();
const pageIds = (doc) => [...doc.querySelectorAll(ROWS)].map((li) => li.dataset.id).sort();
const asTab = (tab) => { window.clay = { getHTML: () => htmlOf(tab.doc) }; };

// B saves a new row; A, whose read still shows the slot before B's write, saves its own
// new row over it.
function blindOverwrite() {
  const storage = fakeStorage();
  const viewA = viewOf(storage);
  const a = openTab(document, viewA);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage);

  viewA.hold();
  addRow(b.doc, "rb", "B wrote this");
  save(b);
  addRow(a.doc, "ra", "A wrote this");
  save(a);
  viewA.release();

  expect(storedIds(storage)).toEqual(["r1", "ra"]);
  return { storage, a, b };
}

afterEach(() => {
  jest.restoreAllMocks();
  delete window.clay;
});

test("a tab whose write another tab never saw writes both rows back when it hears of the overwrite", () => {
  const { storage, a, b } = blindOverwrite();

  asTab(b);
  expect(b.store.adoptExternal()).toBe(true);
  expect(storedIds(storage)).toEqual(["r1", "ra", "rb"]);
  expect(pageIds(b.doc)).toEqual(["r1", "ra", "rb"]);

  // The other tab takes the repaired record as it is and writes nothing back.
  asTab(a);
  const repaired = storage.getItem(KEY);
  expect(a.store.adoptExternal()).toBe(true);
  expect(storage.getItem(KEY)).toBe(repaired);
  expect(pageIds(a.doc)).toEqual(["r1", "ra", "rb"]);
});

test("a tab with an edit of its own keeps its earlier row through its next save", () => {
  const { storage, b } = blindOverwrite();

  b.doc.getElementById("title").value = "B title";
  asTab(b);
  expect(b.store.adoptExternal()).toBe(false);
  save(b);

  expect(storedIds(storage)).toEqual(["r1", "ra", "rb"]);
  expect(JSON.parse(storage.getItem(KEY)).data.title).toBe("B title");
});

test("a row another tab removed after it saw this tab's write stays removed", () => {
  const storage = fakeStorage();
  const a = openTab(document, storage);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage);

  addRow(b.doc, "rb", "B wrote this");
  save(b);
  asTab(a);
  expect(a.store.adoptExternal()).toBe(true);
  expect(pageIds(a.doc)).toEqual(["r1", "rb"]);

  a.doc.querySelector('[data-id="rb"]').remove();
  save(a);

  asTab(b);
  expect(b.store.adoptExternal()).toBe(true);
  expect(storedIds(storage)).toEqual(["r1"]);
  expect(pageIds(b.doc)).toEqual(["r1"]);
});

// A tab opened on a slot that already holds a record.
function joinTab(storage) {
  const doc = document.implementation.createHTMLDocument("tab");
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = rulesTag;
  doc.body.innerHTML = `<input id="title" value="owner title"><ul id="rows">${SEED}${row("r1", "One")}</ul>`;
  const store = createStore({ doc, storage });
  store.restore();
  return { doc, store };
}

const adoptAs = (tab) => { asTab(tab); return tab.store.adoptExternal(); };

test("three tabs that each wrote a row unseen all end with every row, and stop writing", () => {
  const storage = fakeStorage();
  const seed = joinTab(storage);
  seed.doc.getElementById("title").value = "seeded";
  save(seed);
  const views = [viewOf(storage), viewOf(storage), viewOf(storage)];
  const tabs = views.map((view) => joinTab(view));
  for (const view of views) view.hold();
  tabs.forEach((tab, i) => { addRow(tab.doc, `t${i}`, `Tab ${i}`); save(tab); });
  for (const view of views) view.release();
  expect(storedIds(storage)).toEqual(["r1", "t2"]);

  adoptAs(tabs[0]);
  adoptAs(tabs[1]);
  adoptAs(tabs[2]);
  expect(storedIds(storage)).toEqual(["r1", "t0", "t1", "t2"]);
  const settled = storage.getItem(KEY);
  for (const tab of tabs) {
    adoptAs(tab);
    expect(pageIds(tab.doc)).toEqual(["r1", "t0", "t1", "t2"]);
  }
  expect(storage.getItem(KEY)).toBe(settled);
});

test("a tab whose write was dropped finds out even after the other tab has saved again", () => {
  const { storage, a, b } = blindOverwrite();
  addRow(a.doc, "ra2", "A wrote this too");
  save(a);
  expect(storedIds(storage)).toEqual(["r1", "ra", "ra2"]);

  expect(adoptAs(b)).toBe(true);
  expect(storedIds(storage)).toEqual(["r1", "ra", "ra2", "rb"]);
  expect(pageIds(b.doc)).toEqual(["r1", "ra", "ra2", "rb"]);
});

test("a record built on one from a runtime that kept no ids is taken as it is, so a deletion made there stays", () => {
  const storage = fakeStorage();
  const a = openTab(document, storage);
  addRow(a.doc, "ra", "A wrote this");
  save(a);
  const legacy = JSON.parse(storage.getItem(KEY));
  delete legacy.id;
  delete legacy.ancestry;
  legacy.data.title = "edited by an older tab";
  storage.setItem(KEY, JSON.stringify(legacy));

  const c = joinTab(storage);
  c.doc.querySelector('[data-id="ra"]').remove();
  save(c);
  expect(storedIds(storage)).toEqual(["r1"]);

  adoptAs(a);
  expect(storedIds(storage)).toEqual(["r1"]);
  expect(pageIds(a.doc)).toEqual(["r1"]);
});

test("after Start over in another tab, a tab's earlier rows do not come back into the new draft", () => {
  const storage = fakeStorage();
  const a = openTab(document, storage);
  addRow(a.doc, "ra", "A wrote this before Start over");
  save(a);

  joinTab(storage).store.clear();
  const c = joinTab(storage);
  expect(pageIds(c.doc)).toEqual(["r1"]);
  addRow(c.doc, "rc", "C wrote this after");
  save(c);

  expect(adoptAs(a)).toBe(true);
  expect(storedIds(storage)).toEqual(["r1", "rc"]);
  expect(pageIds(a.doc)).toEqual(["r1", "rc"]);
});
