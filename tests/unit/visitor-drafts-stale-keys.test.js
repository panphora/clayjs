/**
 * Two tabs on one slot whose rules differ: the owner added a key that the older
 * tab's rules do not name. The older tab adopts the newer record, edits a field it
 * does know, and saves: the key its rules never read is carried through the save
 * instead of being erased from the stored record.
 */
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "stale-keys-1";
const KEY = "clay:visitor-drafts:" + SLOT;
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const ROWS = ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n" }];
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

const rulesTag = (rules) => `<script type="application/json" data-rules-name="api" data-rules-version="1">${rules}</script>`;
const rulesWith = (extra) => JSON.stringify({ title: "#title@value", note: "#note@value", rows: ROWS, ...extra });

function pageHTML(rules, { title, note, sub, rows }) {
  return `<!DOCTYPE html><html><head>${rulesTag(rules)}</head><body>` +
    `<input id="title" value="${title}"><input id="note" value="${note}">` +
    (sub === undefined ? "" : `<p id="sub" contenteditable>${sub}</p>`) +
    `<ul id="rows">${SEED}${rows}</ul></body></html>`;
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

function openTab(doc, storage, rules, { sub = false } = {}) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = rulesTag(rules);
  doc.body.innerHTML =
    '<input id="title" value="owner title"><input id="note" value="owner note">' +
    (sub ? '<p id="sub" contenteditable>Owner subtitle</p>' : "") +
    `<ul id="rows">${SEED}${row("r1", "First")}</ul>`;
  return { doc, store: createStore({ doc, storage, now: () => new Date(SAVED_AT) }) };
}

test("a tab whose rules lack a stored key keeps that key through its save", () => {
  const staleRules = rulesWith();
  const freshRules = rulesWith({ sub: "#sub" });
  const storage = fakeStorage({
    [KEY]: record({ title: "Existing draft", note: "Existing note", rows: [{ id: "r1", name: "One" }] }),
  });
  const a = openTab(document, storage, staleRules);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage, freshRules, { sub: true });

  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);

  b.doc.getElementById("sub").textContent = "Visitor subtitle";
  b.store.write(pageHTML(freshRules, { title: "Existing draft", note: "Existing note", sub: "Visitor subtitle", rows: row("r1", "One") }));
  expect(JSON.parse(storage.getItem(KEY)).data.sub).toBe("Visitor subtitle");

  expect(a.store.adoptExternal()).toBe(true);
  expect(a.doc.getElementById("title").value).toBe("Existing draft");

  a.doc.getElementById("title").value = "Title from the stale tab";
  a.store.write(pageHTML(staleRules, { title: "Title from the stale tab", note: "Existing note", rows: row("r1", "One") }));

  expect(JSON.parse(storage.getItem(KEY)).data).toEqual({
    title: "Title from the stale tab",
    note: "Existing note",
    rows: [{ id: "r1", name: "One" }],
    sub: "Visitor subtitle",
  });
});
