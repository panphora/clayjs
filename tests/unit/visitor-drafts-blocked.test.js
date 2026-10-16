/**
 * The page that could not keep its unreadable copy aside: a browser with no room for
 * the :unreadable: record leaves the slot alone and fails every save, and the first
 * save after room appears keeps the original aside and goes through.
 */
import { jest } from "@jest/globals";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";
import { draftStoreFailed, setDraftStoreFailed } from "../../src/core/draft-mode.js";

const SLOT = "blocked-slot-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";
const PARKED_KEY = KEY + ":unreadable:" + SAVED_AT;

const RULES = JSON.stringify({
  title: "#title@value",
  rows: ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n" }],
});
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

function record(data, savedAt = SAVED_AT) {
  return JSON.stringify({ v: 1, savedAt, data });
}

function savedPage({ title, rows }) {
  return `<!DOCTYPE html><html><head>${RULES_TAG}</head><body><input id="title" value="${title}"><ul id="rows">${SEED}${rows}</ul></body></html>`;
}

function setPage() {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = RULES_TAG;
  document.body.innerHTML = `<input id="title" value="owner title"><ul id="rows">${SEED}${row("r1", "First")}</ul>`;
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

afterEach(() => {
  jest.restoreAllMocks();
  setDraftStoreFailed(false);
});

test("a save keeps the original aside once there is room, then writes", () => {
  setPage();
  const raw = record({ title: "draft title", rows: "not a list" });
  const storage = fakeStorage({ [KEY]: raw });
  let refuse = true;
  const setItem = storage.setItem;
  storage.setItem = (name, value) => {
    if (refuse && String(name).includes(":unreadable:")) throw new Error("QuotaExceededError");
    setItem(name, value);
  };
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({ restored: false, hadDraft: true, parked: false, blocked: true });
  expect(storage.getItem(KEY)).toBe(raw);
  expect(storage.keys()).toEqual([KEY]);

  refuse = false;
  const data = store.write(savedPage({ title: "typed title", rows: row("r1", "First") + row("r2", "Second") }));

  expect(data).toEqual({ title: "typed title", rows: [{ id: "r1", name: "First" }, { id: "r2", name: "Second" }] });
  expect(storage.getItem(PARKED_KEY)).toBe(raw);
  expect(JSON.parse(storage.getItem(KEY)).data).toEqual(data);
  expect(draftStoreFailed()).toBe(false);
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: part of this browser's saved copy no longer fits the page; the original was kept under",
    PARKED_KEY
  );
});
