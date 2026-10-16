/**
 * A draft whose rows the visitor reordered, restored on a page whose owner has since
 * added a field inside the row rule. The field the draft lacks takes the page's value
 * for that row id, so the engine pairs the rows by what the visitor saved rather than
 * by position: every row keeps its own color through the restore and the next save.
 */
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "row-complete-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const RULES = JSON.stringify({
  title: "#title@value",
  rows: ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n", color: "@data-color" }],
});
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const SEED = '<li item cms-template data-id="" data-color=""><span class="n"></span></li>';
const row = (id, name, color) => `<li item data-id="${id}" data-color="${color}"><span class="n">${name}</span></li>`;

function setPage() {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = RULES_TAG;
  document.body.innerHTML =
    '<input id="title" value="owner title">' +
    `<ul id="rows">${SEED}${row("r1", "One", "red")}${row("r2", "Two", "blue")}${row("r3", "Three", "green")}</ul>`;
}

function record(data) {
  return JSON.stringify({ v: 1, savedAt: SAVED_AT, data });
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

function colors() {
  return [...document.querySelectorAll("#rows > li[item]:not([cms-template])")].map((li) => [li.dataset.id, li.dataset.color]);
}

test("rows the draft reordered keep their own color when the owner added a row field", () => {
  setPage();
  const storage = fakeStorage({
    [KEY]: record({
      title: "draft title",
      rows: [{ id: "r3", name: "Three" }, { id: "r1", name: "One" }, { id: "r2", name: "Two" }],
    }),
  });
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore().restored).toBe(true);
  expect(colors()).toEqual([["r3", "green"], ["r1", "red"], ["r2", "blue"]]);

  store.write(document.documentElement.outerHTML);

  expect(JSON.parse(storage.getItem(KEY)).data.rows).toEqual([
    { id: "r3", name: "Three", color: "green" },
    { id: "r1", name: "One", color: "red" },
    { id: "r2", name: "Two", color: "blue" },
  ]);
});
