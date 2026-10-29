/**
 * The visitor-drafts store on its own, with a fake storage: the record shape, what
 * restore does to the page (including a record the page has outgrown), the parking
 * of anything unreadable, and the storage failures the save lane reports as 507.
 */
import { jest } from "@jest/globals";
import { extractData } from "../../src/vendor/hyper-html-api-data.vendor.js";
import { draftStoreFailed } from "../../src/core/draft-mode.js";
import { createStore, draftKey, safeStorage } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "store-slot-1";
const KEY = draftKey(SLOT, "/");
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const RULES = '{"title":"#title@value","note":"#note@value","rows":["#rows > li[item]:not([cms-template])",{"id":"@data-id","name":".n"}]}';
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

function pageBody(rows = row("r1", "First")) {
  return `<input id="title" value="owner title"><input id="note" value="owner note"><ul id="rows">${SEED}${rows}</ul>`;
}

function setPage(rows) {
  document.documentElement.setAttribute("visitor-drafts", SLOT);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = pageBody(rows);
}

function savedPage({ title = "typed title", note = "typed note", rows = row("r1", "First") + row("r2", "Second") } = {}) {
  return `<!DOCTYPE html><html><head><script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script></head><body><input id="title" value="${title}"><input id="note" value="${note}"><ul id="rows">${SEED}${rows}</ul></body></html>`;
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

function collect(name) {
  const seen = [];
  const listener = (event) => seen.push(event.detail);
  document.addEventListener(name, listener);
  return { seen, stop: () => document.removeEventListener(name, listener) };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("write() stores the extracted api data as { v, savedAt, data }", () => {
  setPage();
  const storage = fakeStorage();
  const saved = collect("clay:drafts-saved");
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.slot).toBe(SLOT);
  expect(store.key).toBe(KEY);

  const html = savedPage();
  const data = store.write(html);

  const stored = JSON.parse(storage.getItem(KEY));
  expect(stored.v).toBe(1);
  expect(stored.savedAt).toBe(SAVED_AT);
  expect(stored.data).toEqual({
    title: "typed title",
    note: "typed note",
    rows: [{ id: "r1", name: "First" }, { id: "r2", name: "Second" }],
  });
  expect(stored.data).toEqual(extractData(new DOMParser().parseFromString(html, "text/html"), store.rules));
  expect(data).toEqual(stored.data);
  expect(saved.seen).toEqual([{ data: stored.data }]);
  saved.stop();
});

test("restore() puts the stored record back on the page, growing and shrinking a list", () => {
  setPage(row("r1", "First"));
  const storage = fakeStorage({
    [KEY]: record({
      title: "draft title",
      note: "draft note",
      rows: [{ id: "r1", name: "First" }, { id: "r2", name: "Second" }],
    }),
  });
  const store = createStore({ doc: document, storage });

  const grown = store.restore();

  expect(grown).toEqual({
    restored: true,
    hadDraft: true,
    data: {
      title: "draft title",
      note: "draft note",
      rows: [{ id: "r1", name: "First" }, { id: "r2", name: "Second" }],
    },
  });
  expect(document.getElementById("title").value).toBe("draft title");
  expect(document.getElementById("note").value).toBe("draft note");
  expect(visibleRows()).toEqual([["r1", "First"], ["r2", "Second"]]);
  expect(document.querySelectorAll("#rows > [cms-template]").length).toBe(1);

  setPage(row("r1", "First") + row("r2", "Second") + row("r3", "Third"));
  storage.setItem(KEY, record({ title: "later title", note: "later note", rows: [{ id: "r9", name: "Only" }] }));

  const shrunk = createStore({ doc: document, storage }).restore();

  expect(shrunk.restored).toBe(true);
  expect(document.getElementById("title").value).toBe("later title");
  expect(visibleRows()).toEqual([["r9", "Only"]]);
});

test("restore() drops an unknown top-level key and keeps the rest", () => {
  setPage();
  const storage = fakeStorage({
    [KEY]: record({ title: "kept title", note: "kept note", bogus: { deep: true } }),
  });
  const store = createStore({ doc: document, storage });

  const result = store.restore();

  expect(result.restored).toBe(true);
  expect(result.data).toEqual({ title: "kept title", note: "kept note" });
  expect(document.getElementById("title").value).toBe("kept title");
  expect(document.getElementById("note").value).toBe("kept note");
  expect(storage.getItem(KEY)).not.toBeNull();
  expect(storage.keys()).toEqual([KEY]);
});

test("an unreadable record is parked under a side key and the owner's content stays", () => {
  const unreadable = ["{not json", JSON.stringify({ v: 1, savedAt: SAVED_AT }), JSON.stringify({ v: 1, savedAt: SAVED_AT, data: ["not", "an", "object"] })];

  for (const raw of unreadable) {
    setPage();
    const storage = fakeStorage({ [KEY]: raw });
    const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

    expect(store.restore()).toEqual({ restored: false, hadDraft: true, parked: true });
    expect(storage.getItem(KEY)).toBeNull();
    expect(storage.keys()).toEqual([KEY + ":unreadable:" + SAVED_AT]);
    expect(storage.getItem(KEY + ":unreadable:" + SAVED_AT)).toBe(raw);
    expect(document.getElementById("title").value).toBe("owner title");
    expect(visibleRows()).toEqual([["r1", "First"]]);
  }
});

test("a record that no longer fits the page is parked with a warning, not applied", () => {
  setPage();
  const storage = fakeStorage({
    [KEY]: record({ rows: "not a list" }),
  });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({ restored: false, hadDraft: true, parked: true });
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: this browser's saved copy no longer fits the page; it was kept under",
    KEY + ":unreadable:" + SAVED_AT
  );
  expect(storage.getItem(KEY)).toBeNull();
  expect(document.getElementById("title").value).toBe("owner title");
});

test("a storage that refuses the write reports a draft-storage failure and clears it on the next good write", () => {
  setPage();
  const html = savedPage();
  const refused = collect("clay:drafts-store-failed");
  const storage = fakeStorage();
  const quota = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => {} };

  const blocked = createStore({ doc: document, storage: quota, now: () => new Date(SAVED_AT) });
  let thrown = null;
  try { blocked.write(html); } catch (error) { thrown = error; }

  expect(thrown).not.toBeNull();
  expect(thrown.code).toBe("draft-storage");
  expect(thrown.message).toBe("Couldn't save in this browser. Storage is full or turned off.");
  expect(draftStoreFailed()).toBe(true);
  expect(refused.seen.length).toBe(1);
  expect(refused.seen[0].error.message).toBe("QuotaExceededError");

  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });
  store.write(html);

  expect(draftStoreFailed()).toBe(false);
  expect(JSON.parse(storage.getItem(KEY)).data.title).toBe("typed title");
  refused.stop();
});

test("a browser with no usable storage fails the write and restores nothing", () => {
  setPage();
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("storage is blocked"); });
  const refused = collect("clay:drafts-store-failed");

  expect(safeStorage()).toBeNull();

  const store = createStore({ doc: document, now: () => new Date(SAVED_AT) });
  let thrown = null;
  try { store.write(savedPage()); } catch (error) { thrown = error; }

  expect(thrown.code).toBe("draft-storage");
  expect(draftStoreFailed()).toBe(true);
  expect(refused.seen.length).toBe(1);
  expect(store.restore()).toEqual({ restored: false, hadDraft: false });
  expect(document.getElementById("title").value).toBe("owner title");
  expect(warn).not.toHaveBeenCalled();
  refused.stop();
});

test("a copy that cannot be parked blocks the store instead of letting a save overwrite it", () => {
  setPage();
  const raw = record({ rows: "not a list" });
  const storage = fakeStorage({ [KEY]: raw });
  const setItem = storage.setItem;
  storage.setItem = (name, value) => {
    if (String(name).includes(":unreadable:")) throw new Error("QuotaExceededError");
    setItem(name, value);
  };
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const refused = collect("clay:drafts-store-failed");
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({ restored: false, hadDraft: true, parked: false, blocked: true });
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: this browser's saved copy no longer fits the page, and there is no room to keep it aside; nothing will be saved over it"
  );

  let thrown = null;
  try { store.write(savedPage()); } catch (error) { thrown = error; }

  expect(thrown).not.toBeNull();
  expect(thrown.code).toBe("draft-storage");
  expect(thrown.message).toBe("Couldn't save in this browser. Storage is full or turned off.");
  expect(draftStoreFailed()).toBe(true);
  expect(refused.seen.length).toBe(1);
  expect(storage.getItem(KEY)).toBe(raw);
  expect(storage.keys()).toEqual([KEY]);
  expect(document.getElementById("title").value).toBe("owner title");
  refused.stop();
});

test("a record without a version marker, or with an unsupported one, is parked and not applied", () => {
  const unreadable = [
    JSON.stringify({ data: { title: "no version", note: "no version" } }),
    JSON.stringify({ v: 999, data: { title: "from the future", note: "from the future" } }),
  ];

  for (const raw of unreadable) {
    setPage();
    const storage = fakeStorage({ [KEY]: raw });
    const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

    expect(store.restore()).toEqual({ restored: false, hadDraft: true, parked: true });
    expect(storage.getItem(KEY)).toBeNull();
    expect(storage.getItem(KEY + ":unreadable:" + SAVED_AT)).toBe(raw);
    expect(document.getElementById("title").value).toBe("owner title");
    expect(visibleRows()).toEqual([["r1", "First"]]);
  }
});

test("a field inside a row that the rules no longer name is dropped and the rest restores", () => {
  setPage();
  const storage = fakeStorage({
    [KEY]: record({
      title: "kept title",
      note: "kept note",
      rows: [{ id: "r1", name: "First", color: "red" }, { id: "r2", name: "Second", color: "blue" }],
    }),
  });
  const store = createStore({ doc: document, storage });

  const result = store.restore();

  expect(result.restored).toBe(true);
  expect(result.data).toEqual({
    title: "kept title",
    note: "kept note",
    rows: [{ id: "r1", name: "First" }, { id: "r2", name: "Second" }],
  });
  expect(document.getElementById("title").value).toBe("kept title");
  expect(visibleRows()).toEqual([["r1", "First"], ["r2", "Second"]]);
  expect(storage.getItem(KEY)).not.toBeNull();
});

test("a key that cannot be applied is dropped and the rest of the draft restores", () => {
  setPage();
  const raw = record({ title: "draft title", rows: "not a list" });
  const storage = fakeStorage({ [KEY]: raw });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const store = createStore({ doc: document, storage, now: () => new Date(SAVED_AT) });

  expect(store.restore()).toEqual({ restored: true, hadDraft: true, data: { title: "draft title" }, partial: true, parked: true, blocked: false });
  expect(document.getElementById("title").value).toBe("draft title");
  expect(visibleRows()).toEqual([["r1", "First"]]);
  expect(storage.getItem(KEY)).toBe(raw);
  expect(storage.getItem(KEY + ":unreadable:" + SAVED_AT)).toBe(raw);
});
