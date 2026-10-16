/**
 * A tab whose rules lack a key the stored record has, and a tab whose row rules lack
 * a field inside a row. The carried data must not make the tab look edited: it still
 * adopts a later save from another tab, fires no restored event for a carry alone,
 * leaves a slot another tab reset empty, and keeps the row fields it cannot read
 * through its own save.
 */
import { jest } from "@jest/globals";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "carry-adopt-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";
const LATER_AT = "2026-10-15T13:00:00.000Z";

const ROWS = "#rows > li[item]:not([cms-template])";
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name, color) =>
  `<li item data-id="${id}"${color === undefined ? "" : ` data-color="${color}"`}><span class="n">${name}</span></li>`;

const rulesTag = (rules) => `<script type="application/json" data-rules-name="api" data-rules-version="1">${rules}</script>`;
const rulesWith = ({ sub = false, color = false } = {}) =>
  JSON.stringify({
    title: "#title@value",
    note: "#note@value",
    rows: [ROWS, { id: "@data-id", name: ".n", ...(color && { color: "@data-color" }) }],
    ...(sub && { sub: "#sub" }),
  });

const STALE = rulesWith();
const FRESH = rulesWith({ sub: true });
const FRESH_ROWS = rulesWith({ color: true });

function pageHTML(rules, { title, note, rows }) {
  return `<!DOCTYPE html><html><head>${rulesTag(rules)}</head><body>` +
    `<input id="title" value="${title}"><input id="note" value="${note}">` +
    `<ul id="rows">${SEED}${rows}</ul></body></html>`;
}

const liveHTML = (rules) => pageHTML(rules, {
  title: document.getElementById("title").value,
  note: document.getElementById("note").value,
  rows: [...document.querySelectorAll("#rows > li[item]:not([cms-template])")]
    .map((li) => row(li.dataset.id, li.textContent, li.dataset.color))
    .join(""),
});

function record(data, savedAt = SAVED_AT) {
  return JSON.stringify({ v: 1, savedAt, data });
}

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

function openTab(doc, storage, rules) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = rulesTag(rules);
  doc.body.innerHTML = `<input id="title" value="owner title"><input id="note" value="owner note"><ul id="rows">${SEED}${row("r1", "One")}</ul>`;
  return { doc, store: createStore({ doc, storage, now: () => new Date(SAVED_AT) }) };
}

const stored = (storage) => JSON.parse(storage.getItem(KEY)).data;
const CARRY = { title: "Existing draft", note: "Existing note", rows: [{ id: "r1", name: "One" }] };
const SEEDED = record({ ...CARRY, sub: "Visitor subtitle" });

// The older tab's own page, after it restored the record and edited the title: its
// save carries `sub`, which its rules never read.
function openOlderTabAfterItsSave() {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = rulesTag(STALE);
  document.body.innerHTML = `<input id="title" value="owner title"><input id="note" value="owner note"><ul id="rows">${SEED}${row("r1", "One")}</ul>`;
  window.clay = { getHTML: () => liveHTML(STALE) };
  const storage = fakeStorage({ [KEY]: SEEDED });
  const restored = [];
  document.addEventListener("clay:drafts-restored", (event) => restored.push(event.detail));
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({ restored: true, hadDraft: true, data: CARRY });
  document.getElementById("title").value = "Title from the older tab";
  store.write(liveHTML(STALE));

  return { store, storage, restored };
}

afterEach(() => {
  jest.restoreAllMocks();
  delete window.clay;
});

test("a save that carried a key the rules lack keeps the key and fires no restored event", () => {
  const { storage, restored } = openOlderTabAfterItsSave();

  expect(stored(storage)).toEqual({ ...CARRY, title: "Title from the older tab", sub: "Visitor subtitle" });
  expect(restored).toEqual([]);
});

test("a tab whose save carried a key its rules lack still adopts another tab's later save", () => {
  const { store, storage } = openOlderTabAfterItsSave();

  storage.setItem(KEY, record({ ...CARRY, title: "Title from the other tab", sub: "Visitor subtitle" }, LATER_AT));

  expect(store.adoptExternal()).toBe(true);
  expect(document.getElementById("title").value).toBe("Title from the other tab");
});

test("after another tab's reset this tab's next hide writes nothing", () => {
  const { store, storage } = openOlderTabAfterItsSave();

  storage.removeItem(KEY);

  expect(store.flush()).toBe(true);
  expect(storage.getItem(KEY)).toBeNull();
});

test("an older tab that adopts a record with a field inside a row keeps that field through its save", () => {
  const storage = fakeStorage({ [KEY]: record(CARRY) });
  const a = openTab(document, storage, STALE);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage, FRESH_ROWS);
  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);

  b.doc.querySelector('[data-id="r1"]').setAttribute("data-color", "Visitor purple");
  b.store.write(pageHTML(FRESH_ROWS, { title: "Existing draft", note: "Existing note", rows: row("r1", "One", "Visitor purple") }));
  expect(stored(storage).rows).toEqual([{ id: "r1", name: "One", color: "Visitor purple" }]);

  expect(a.store.adoptExternal()).toBe(true);
  a.doc.getElementById("title").value = "Title from the older tab";
  a.store.write(pageHTML(STALE, { title: "Title from the older tab", note: "Existing note", rows: row("r1", "One") }));

  expect(stored(storage)).toEqual({ ...CARRY, title: "Title from the older tab", rows: [{ id: "r1", name: "One", color: "Visitor purple" }] });
});
