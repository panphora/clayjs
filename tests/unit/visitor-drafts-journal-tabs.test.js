/**
 * Two tabs on one Journal: each tab's save merges the other tab's record row by
 * row, so an entry added or trashed in one tab survives a save in the other, and
 * only a change no row merge can make sense of is a conflict this tab wins.
 */
import { jest } from "@jest/globals";
import { createStore, draftKey, merge3 } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "field-pad-v1";
const KEY = draftKey(SLOT, "/");
const SAVED_AT = "2026-10-29T12:00:00.000Z";

const RULES = '{"entries":["#entries > article.entry",{"id":"@data-id","date":"@data-date","created":"@data-created","updated":"@data-updated","body":".entry-body@textContent","deletedAt":"@data-deleted-at","pinned":"@data-pinned"}]}';
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const SEED = '<article class="entry" cms-template data-id="" data-date=""><p class="entry-body"></p></article>';

const entry = (id, body, deletedAt = "") =>
  `<article class="entry" data-id="${id}" data-date="2026-10-14"${deletedAt ? ` data-deleted-at="${deletedAt}"` : ""}><p class="entry-body">${body}</p></article>`;
const body = (entries) => `<div id="entries">${SEED}${entries.join("")}</div>`;
const pageHTML = (entries) => `<!DOCTYPE html><html><head>${RULES_TAG}</head><body>${body(entries)}</body></html>`;

const TWO = [entry("e1", "First entry"), entry("e2", "Second entry")];

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

function openTab(doc, storage, entries = TWO) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = RULES_TAG;
  doc.body.innerHTML = body(entries);
  return { doc, store: createStore({ doc, storage, now: () => new Date(SAVED_AT) }) };
}

const entriesOf = (raw) => JSON.parse(raw).data.entries;

function twoTabs(entries = TWO) {
  const storage = fakeStorage();
  openTab(document, storage, entries).store.write(pageHTML(entries));
  const a = openTab(document.implementation.createHTMLDocument("tab a"), storage, entries);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage, entries);
  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);
  return { storage, a, b };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test("two tabs that each add an entry both keep it, in both tabs", () => {
  const { storage, a, b } = twoTabs();

  a.store.write(pageHTML([entry("a1", "Added in tab a"), ...TWO]));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  b.store.write(pageHTML([entry("b1", "Added in tab b"), ...TWO]));

  const stored = entriesOf(storage.getItem(KEY)).map((row) => row.id);
  expect(stored).toEqual(expect.arrayContaining(["a1", "b1", "e1", "e2"]));
  expect(stored).toHaveLength(4);
  expect(storage.getItem(KEY + ":conflict")).toBe(null);
  expect(entriesOf(storage.getItem(KEY)).map((row) => row.body)).toEqual(
    expect.arrayContaining(["Added in tab a", "Added in tab b"])
  );

  const third = openTab(document.implementation.createHTMLDocument("third tab"), storage);
  expect(third.store.restore().restored).toBe(true);
  expect([...third.doc.querySelectorAll("#entries > article.entry:not([cms-template])")].map((el) => el.dataset.id)).toEqual(
    expect.arrayContaining(["a1", "b1", "e1", "e2"])
  );
});

test("one tab trashes an entry while the other edits a different one, and both survive", () => {
  const { storage, a, b } = twoTabs();

  a.store.write(pageHTML([entry("e1", "First entry", "2026-10-29T11:00:00.000Z"), TWO[1]]));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  b.store.write(pageHTML([TWO[0], entry("e2", "Second entry, edited")]));

  expect(storage.getItem(KEY + ":conflict")).toBe(null);
  expect(entriesOf(storage.getItem(KEY))).toEqual([
    expect.objectContaining({ id: "e1", deletedAt: "2026-10-29T11:00:00.000Z" }),
    expect.objectContaining({ id: "e2", body: "Second entry, edited" }),
  ]);
});

test("one tab empties the trash on a row the other edits, and the other record is kept aside", () => {
  const { storage, a, b } = twoTabs([TWO[0], entry("e2", "Second entry", "2026-10-29T11:00:00.000Z")]);

  a.store.write(pageHTML([TWO[0]]));
  const otherRaw = storage.getItem(KEY);
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  b.store.write(pageHTML([TWO[0], entry("e2", "Second entry, edited")]));

  expect(entriesOf(storage.getItem(KEY)).map((row) => row.id)).toEqual(["e1", "e2"]);
  expect(entriesOf(storage.getItem(KEY))[1].body).toBe("Second entry, edited");
  expect(storage.getItem(KEY + ":conflict")).toBe(otherRaw);
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: another tab changed the same thing; its copy was kept under",
    KEY + ":conflict"
  );
});

test("both tabs edit the same entry's body, and that is a conflict as today", () => {
  const { storage, a, b } = twoTabs();

  a.store.write(pageHTML([entry("e1", "Body from tab a"), TWO[1]]));
  const otherRaw = storage.getItem(KEY);
  jest.spyOn(console, "warn").mockImplementation(() => {});

  b.store.write(pageHTML([entry("e1", "Body from tab b"), TWO[1]]));

  expect(entriesOf(storage.getItem(KEY))[0].body).toBe("Body from tab b");
  expect(storage.getItem(KEY + ":conflict")).toBe(otherRaw);
});

test("a card added to a different list in each tab is kept in its own list", () => {
  const card = (id) => ({ id, title: id });
  const lists = (todo, doing) => [{ id: "todo", cards: todo }, { id: "doing", cards: doing }];
  const base = { lists: lists([card("c1")], []) };
  const mine = { lists: lists([card("c1")], [card("c2")]) };
  const theirs = { lists: lists([card("c1"), card("c3")], []) };

  expect(merge3(base, mine, theirs)).toEqual({
    value: { lists: lists([card("c1"), card("c3")], [card("c2")]) },
    conflict: false,
  });
});
