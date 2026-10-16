/**
 * A draft the page can hold only in part. The compatible keys reach the page, the
 * original record stays in the slot where the visitor's whole draft still is, and a
 * second load of the same outgrown page keeps one parked copy rather than piling up
 * another. A later page that can hold the value again restores everything.
 */
import { jest } from "@jest/globals";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "partial-restore-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";
const LATER_AT = "2026-10-16T12:00:00.000Z";
const PARKED = KEY + ":unreadable:" + SAVED_AT;

const RULES = JSON.stringify({
  title: "#title@value",
  size: "#size@value",
  rows: ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n" }],
});
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

function setPage(sizes) {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML =
    '<input id="title" value="owner title">' +
    `<select id="size">${sizes.map((size) => `<option value="${size}">${size}</option>`).join("")}</select>` +
    `<ul id="rows">${SEED}${row("r1", "First")}</ul>`;
}

const record = (data) => JSON.stringify({ v: 1, savedAt: SAVED_AT, data });
const DATA = { title: "Visitor title", size: "gone", rows: [{ id: "r1", name: "First" }] };
const FITTED = { title: "Visitor title", rows: [{ id: "r1", name: "First" }] };

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

const parkedCopies = (storage) => storage.keys().filter((name) => name.includes(":unreadable:"));

afterEach(() => {
  jest.restoreAllMocks();
});

test("a partial restore leaves the slot holding the original record and a second load adds no new parked copy", () => {
  setPage(["small", "large"]);
  const raw = record(DATA);
  const storage = fakeStorage({ [KEY]: raw });
  jest.spyOn(console, "warn").mockImplementation(() => {});

  const first = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });
  expect(first.restore()).toEqual({ restored: true, hadDraft: true, data: FITTED, partial: true, parked: true, blocked: false });
  expect(storage.getItem(KEY)).toBe(raw);

  const second = createStore({ doc: document, storage, now: () => new Date(LATER_AT) });
  expect(second.restore()).toMatchObject({ restored: true, hadDraft: true, data: FITTED, partial: true, parked: true, blocked: false });
  expect(storage.getItem(KEY)).toBe(raw);
  expect(parkedCopies(storage)).toEqual([PARKED]);

  setPage(["small", "large", "gone"]);
  const third = createStore({ doc: document, storage, now: () => new Date(LATER_AT) });
  expect(third.restore()).toEqual({ restored: true, hadDraft: true, data: DATA });
  expect(document.getElementById("size").value).toBe("gone");
  expect(parkedCopies(storage)).toEqual([PARKED]);
});
