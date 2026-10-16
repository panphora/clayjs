/**
 * The slot of a page whose unreadable copy could not be parked. Nothing of the record
 * fits, so the page keeps its own content and the store blocks every save; once there
 * is room, the first save keeps the original aside and writes this tab's work. The
 * record is the page's own, so its stale rows are never merged back over the page's
 * rows, and the page's own title is never dropped, as if another tab had saved it.
 */
import { jest } from "@jest/globals";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";
import { draftStoreFailed, setDraftStoreFailed } from "../../src/core/draft-mode.js";

const SLOT = "refused-park-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";
const PARKED_KEY = KEY + ":unreadable:" + SAVED_AT;

const RULES = JSON.stringify({
  title: "#title@value",
  note: "#note@value",
  rows: ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n" }],
});
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

function record(data) {
  return JSON.stringify({ v: 1, savedAt: SAVED_AT, data });
}

function savedPage({ title, note, rows }) {
  return `<!DOCTYPE html><html><head>${RULES_TAG}</head><body><input id="title" value="${title}"><input id="note" value="${note}"><ul id="rows">${SEED}${rows}</ul></body></html>`;
}

function setPage() {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = RULES_TAG;
  document.body.innerHTML = `<input id="title" value="owner title"><input id="note" value="owner note"><ul id="rows">${SEED}${row("r1", "First")}</ul>`;
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
  setDraftStoreFailed(false);
});

test("the first save after room appears keeps the unfit record aside instead of merging it back", () => {
  setPage();
  const raw = record({ rows: "old incompatible schema" });
  const storage = fakeStorage({ [KEY]: raw });
  let refuse = true;
  const setItem = storage.setItem;
  storage.setItem = (name, value) => {
    if (refuse && String(name).includes(":unreadable:")) throw new Error("QuotaExceededError");
    setItem(name, value);
  };
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({ restored: false, hadDraft: true, parked: false, blocked: true });
  expect(document.getElementById("title").value).toBe("owner title");
  expect(document.getElementById("note").value).toBe("owner note");
  expect(visibleRows()).toEqual([["r1", "First"]]);
  expect(storage.getItem(KEY)).toBe(raw);

  refuse = false;
  const data = store.write(savedPage({ title: "owner title", note: "Visitor note", rows: row("r1", "First") }));

  expect(data).toEqual({ title: "owner title", note: "Visitor note", rows: [{ id: "r1", name: "First" }] });
  expect(storage.getItem(PARKED_KEY)).toBe(raw);
  expect(JSON.parse(storage.getItem(KEY)).data).toEqual(data);
  expect(storage.keys()).toEqual([KEY, PARKED_KEY]);
  expect(draftStoreFailed()).toBe(false);
});
