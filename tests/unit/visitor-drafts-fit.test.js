/**
 * A draft the page has outgrown in shape: rules that name a new field inside a row,
 * rules that name the same fields in another order, and a value the page can no
 * longer hold. The draft is checked against a copy of the document first, so what the
 * page shows is never a half-applied record.
 */
import { jest } from "@jest/globals";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "fit-slot-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const ROWS = "#rows > li[item]:not([cms-template])";
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

const rulesWith = (rowFields) => JSON.stringify({ title: "#title@value", size: "#size@value", rows: [ROWS, rowFields] });

function setPage(rules) {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${rules}</script>`;
  document.body.innerHTML =
    '<input id="title" value="owner title">' +
    '<select id="size"><option value="small">Small</option><option value="large">Large</option></select>' +
    `<ul id="rows">${SEED}${row("r1", "First")}</ul>`;
}

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

function visibleRows() {
  return [...document.querySelectorAll("#rows > li[item]:not([cms-template])")].map((li) => [li.dataset.id, li.textContent]);
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("a draft whose rows predate a new nested rule field restores fully and is not parked", () => {
  setPage(rulesWith({ id: "@data-id", name: ".n", color: "@data-color" }));
  const storage = fakeStorage({ [KEY]: record({ title: "draft title", size: "large", rows: [{ id: "r2", name: "Second" }] }) });
  const store = createStore({ doc: document, storage });

  expect(store.restore()).toEqual({
    restored: true,
    hadDraft: true,
    data: { title: "draft title", size: "large", rows: [{ id: "r2", name: "Second" }] },
  });
  expect(document.getElementById("title").value).toBe("draft title");
  expect(document.getElementById("size").value).toBe("large");
  expect(visibleRows()).toEqual([["r2", "Second"]]);
  expect(storage.keys()).toEqual([KEY]);
});

test("a draft restores fully when the rules name the same row fields in another order", () => {
  setPage(rulesWith({ name: ".n", id: "@data-id" }));
  const storage = fakeStorage({ [KEY]: record({ title: "draft title", size: "large", rows: [{ id: "r2", name: "Second" }] }) });
  const store = createStore({ doc: document, storage });

  expect(store.restore()).toEqual({
    restored: true,
    hadDraft: true,
    data: { title: "draft title", size: "large", rows: [{ id: "r2", name: "Second" }] },
  });
  expect(visibleRows()).toEqual([["r2", "Second"]]);
  expect(storage.keys()).toEqual([KEY]);
});

test("a value that no longer reads back is dropped, the rest restores, and the original is kept aside", () => {
  setPage(rulesWith({ id: "@data-id", name: ".n" }));
  const raw = record({ title: "draft title", size: "gone", rows: [{ id: "r2", name: "Second" }] });
  const storage = fakeStorage({ [KEY]: raw });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({
    restored: true,
    hadDraft: true,
    parked: true,
    blocked: false,
    partial: true,
    data: { title: "draft title", rows: [{ id: "r2", name: "Second" }] },
  });
  expect(document.getElementById("title").value).toBe("draft title");
  expect(visibleRows()).toEqual([["r2", "Second"]]);
  // The value the page can no longer hold never reaches the live page.
  expect(document.getElementById("size").value).toBe("small");
  expect(storage.getItem(KEY)).toBe(raw);
  expect(storage.getItem(KEY + ":unreadable:" + SAVED_AT)).toBe(raw);
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: part of this browser's saved copy no longer fits the page; the original was kept under",
    KEY + ":unreadable:" + SAVED_AT
  );

  const again = createStore({ doc: document, storage, now: () => new Date("2026-10-16T12:00:00.000Z") });
  expect(again.restore()).toMatchObject({ restored: true, partial: true, parked: true, data: { title: "draft title", rows: [{ id: "r2", name: "Second" }] } });
  expect(storage.keys().filter((name) => name.includes(":unreadable:"))).toHaveLength(1);
});
