/**
 * One copy of the record a save replaced. A list both tabs changed is a conflict this
 * tab wins, and the other tab's whole record goes to one `:conflict` key: written
 * before the replacement, refused loudly when there is no room for it, and replaced
 * rather than piled up by later conflicts. A card moved to a different list in each
 * tab therefore ends up in exactly one list.
 */
import { jest } from "@jest/globals";
import { createStore, draftKey } from "../../src/plugins/visitor-drafts/store.js";
import { draftStoreFailed, setDraftStoreFailed } from "../../src/core/draft-mode.js";

const SLOT = "conflict-copy-1";
const KEY = draftKey(SLOT, "/");
const CONFLICT_KEY = KEY + ":conflict";
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const ROWS = "#rows > li[item]:not([cms-template])";
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;
const RULES = JSON.stringify({ title: "#title@value", rows: [ROWS, { id: "@data-id", name: ".n" }] });

const BOARD = JSON.stringify({
  title: "#title@value",
  lists: ["#board > section[item]:not([cms-template])", {
    id: "@data-id",
    cards: ["ol > li[item]:not([cms-template])", { id: "@data-id", t: ".t" }],
  }],
});

const rulesTag = (rules) => `<script type="application/json" data-rules-name="api" data-rules-version="1">${rules}</script>`;

function rowsBody({ title = "owner title", rows }) {
  return `<input id="title" value="${title}"><ul id="rows">${SEED}${rows}</ul>`;
}

const card = (id, t) => `<li item data-id="${id}"><span class="t">${t}</span></li>`;
const seedCard = '<li item cms-template data-id=""><span class="t"></span></li>';
const list = (id, cards) => `<section item data-id="${id}"><ol>${seedCard}${cards}</ol></section>`;

function boardBody(lists) {
  return `<input id="title" value="Board"><div id="board">` +
    `<section item cms-template data-id=""><ol>${seedCard}</ol></section>` +
    lists.map(({ id, cards }) => list(id, cards.map(({ id: cardId, t }) => card(cardId, t)).join(""))).join("") +
    `</div>`;
}

const rowsPage = (data) => `<!DOCTYPE html><html><head>${rulesTag(RULES)}</head><body>${rowsBody(data)}</body></html>`;
const boardPage = (data) => `<!DOCTYPE html><html><head>${rulesTag(BOARD)}</head><body>${boardBody(data.lists)}</body></html>`;

const START = { title: "owner title", rows: [{ id: "r1", name: "One" }, { id: "r2", name: "Two" }, { id: "r3", name: "Three" }] };
const BOARD_START = {
  title: "Board",
  lists: [
    { id: "L1", cards: [{ id: "c1", t: "one" }, { id: "c2", t: "two" }] },
    { id: "L2", cards: [{ id: "c3", t: "three" }] },
    { id: "L3", cards: [] },
  ],
};

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

function openTab(doc, storage, { rules, body, now = () => new Date(SAVED_AT) }) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = rulesTag(rules);
  doc.body.innerHTML = body;
  return { doc, store: createStore({ doc, storage, now }) };
}

function twoTabs(storage, fixture) {
  const a = openTab(document, storage, fixture);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage, fixture);
  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);
  return { a, b };
}

const stored = (storage) => JSON.parse(storage.getItem(KEY)).data;
const listsOf = (data) => data.lists.map((list) => [list.id, list.cards.map(({ id }) => id)]);

function collect(doc, name) {
  const seen = [];
  const listener = (event) => seen.push(event.detail);
  doc.addEventListener(name, listener);
  return { seen, stop: () => doc.removeEventListener(name, listener) };
}

afterEach(() => {
  jest.restoreAllMocks();
  setDraftStoreFailed(false);
});

test("a conflict copy that cannot be stored throws and leaves the other tab's record", () => {
  const storage = fakeStorage({ [KEY]: record(START) });
  const { a, b } = twoTabs(storage, { rules: RULES, body: rowsBody(START) });

  a.store.write(rowsPage({ title: "A title", rows: row("r1", "One") + row("r2", "Two") + row("r3", "Three") }));
  const otherRaw = storage.getItem(KEY);
  const setItem = storage.setItem;
  storage.setItem = (name, value) => {
    if (String(name).endsWith(":conflict")) throw new Error("QuotaExceededError");
    setItem(name, value);
  };
  const failed = collect(b.doc, "clay:drafts-store-failed");

  expect(() => b.store.write(rowsPage({ title: "B title", rows: row("r1", "One") + row("r2", "Two") + row("r3", "Three") })))
    .toThrow("Couldn't save in this browser. Storage is full or turned off.");

  expect(storage.getItem(KEY)).toBe(otherRaw);
  expect(storage.getItem(CONFLICT_KEY)).toBeNull();
  expect(draftStoreFailed()).toBe(true);
  expect(failed.seen.length).toBe(1);
  expect(failed.seen[0].error.message).toBe("QuotaExceededError");
  failed.stop();
});

test("a card moved to different lists in two tabs is stored in one list and the other tab's record is kept aside", () => {
  const storage = fakeStorage({ [KEY]: record(BOARD_START) });
  const { a, b } = twoTabs(storage, { rules: BOARD, body: boardBody(BOARD_START.lists) });

  a.store.write(boardPage({ ...BOARD_START, lists: [
    { id: "L1", cards: [{ id: "c2", t: "two" }] },
    { id: "L2", cards: [{ id: "c3", t: "three" }, { id: "c1", t: "one" }] },
    { id: "L3", cards: [] },
  ] }));
  const otherRaw = storage.getItem(KEY);
  jest.spyOn(console, "warn").mockImplementation(() => {});

  b.store.write(boardPage({ ...BOARD_START, lists: [
    { id: "L1", cards: [{ id: "c2", t: "two" }] },
    { id: "L2", cards: [{ id: "c3", t: "three" }] },
    { id: "L3", cards: [{ id: "c1", t: "one" }] },
  ] }));

  const data = stored(storage);
  expect(data.lists.flatMap((entry) => entry.cards.filter(({ id }) => id === "c1"))).toHaveLength(1);
  expect(listsOf(data)).toEqual([["L1", ["c2"]], ["L2", ["c3"]], ["L3", ["c1"]]]);
  expect(storage.getItem(CONFLICT_KEY)).toBe(otherRaw);
  expect(listsOf(JSON.parse(otherRaw).data)).toEqual([["L1", ["c2"]], ["L2", ["c3", "c1"]], ["L3", []]]);
});

test("a reorder in one tab and a row edit in the other keep the other tab's order in the copy", () => {
  const storage = fakeStorage({ [KEY]: record(START) });
  const { a, b } = twoTabs(storage, { rules: RULES, body: rowsBody(START) });

  a.store.write(rowsPage({ rows: row("r3", "Three") + row("r1", "One") + row("r2", "Two") }));
  const otherRaw = storage.getItem(KEY);
  jest.spyOn(console, "warn").mockImplementation(() => {});

  b.store.write(rowsPage({ rows: row("r1", "B edited One") + row("r2", "Two") + row("r3", "Three") }));

  expect(stored(storage).rows).toEqual([{ id: "r1", name: "B edited One" }, { id: "r2", name: "Two" }, { id: "r3", name: "Three" }]);
  expect(storage.getItem(CONFLICT_KEY)).toBe(otherRaw);
  expect(JSON.parse(storage.getItem(CONFLICT_KEY)).data.rows.map(({ id }) => id)).toEqual(["r3", "r1", "r2"]);
});

test("ten conflicting saves leave one conflict copy", () => {
  const storage = fakeStorage({ [KEY]: record(START) });
  let minute = 0;
  const now = () => new Date(Date.parse(SAVED_AT) + minute++ * 60000);
  const { a, b } = twoTabs(storage, { rules: RULES, body: rowsBody(START), now });
  jest.spyOn(console, "warn").mockImplementation(() => {});

  for (let round = 0; round < 10; round++) {
    a.store.write(rowsPage({ title: `A title ${round}`, rows: row("r1", "One") + row("r2", "Two") + row("r3", "Three") }));
    b.store.write(rowsPage({ title: `B title ${round}`, rows: row("r1", "One") + row("r2", "Two") + row("r3", "Three") }));
  }

  expect(storage.keys().filter((name) => name.startsWith(KEY + ":conflict"))).toEqual([CONFLICT_KEY]);
  expect(stored(storage).title).toBe("B title 9");
});
