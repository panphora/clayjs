/**
 * Two tabs on one slot. Two stores with their own documents and one shared storage:
 * what a save does when the other tab wrote in between, what a late storage event
 * does after this tab has already saved, and what adopting a record refreshes.
 */
import { jest } from "@jest/globals";
import { bootDraftTab, DRAFT, settle } from "./helpers/visitor-drafts-tab.js";
import { createStore, draftKey } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "merge-slot-1";
const KEY = draftKey(SLOT, "/");
const SAVED_AT = "2026-10-15T12:00:00.000Z";

const RULES = JSON.stringify({
  title: "#title@value",
  note: "#note@value",
  rows: ["#rows > li[item]:not([cms-template])", { id: "@data-id", name: ".n" }],
});
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

// Another tab's record: the same rows and note, its own title.
const OTHER = {
  v: 1,
  savedAt: "2026-10-15T01:00:00.000Z",
  data: { title: "from the other tab", note: "typed note", rows: [{ id: "r2", name: "Second" }] },
};

const bodyHTML = ({ title, note }) =>
  `<input id="title" value="${title}"><input id="note" value="${note}"><ul id="rows">${SEED}${row("r2", "Second")}</ul>`;

const pageHTML = (values) => `<!DOCTYPE html><html><head>${RULES_TAG}</head><body>${bodyHTML(values)}</body></html>`;

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

function openTab(doc, storage) {
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = RULES_TAG;
  doc.body.innerHTML = bodyHTML({ title: "owner title", note: "owner note" });
  return { doc, store: createStore({ doc, storage, now: () => new Date(SAVED_AT) }) };
}

test("two tabs that edited different fields keep both edits when both save", () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify(DRAFT) });
  const a = openTab(document, storage);
  const b = openTab(document.implementation.createHTMLDocument("tab b"), storage);

  expect(a.store.restore().restored).toBe(true);
  expect(b.store.restore().restored).toBe(true);

  a.doc.getElementById("title").value = "A's title";
  b.doc.getElementById("note").value = "B's note";

  a.store.write(pageHTML({ title: "A's title", note: "typed note" }));
  b.store.write(pageHTML({ title: "draft title", note: "B's note" }));

  expect(JSON.parse(storage.getItem(KEY)).data).toEqual({
    title: "A's title",
    note: "B's note",
    rows: [{ id: "r2", name: "Second" }],
  });
  expect(b.doc.getElementById("title").value).toBe("A's title");
  expect(b.doc.getElementById("note").value).toBe("B's note");
});

test("a late storage event cannot replay another tab's older record over this tab's own save", async () => {
  const { clay, key } = await bootDraftTab({ slot: "tabs-stale-event-1", draft: DRAFT });

  const note = document.getElementById("note");
  note.value = "my own note";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  await clay.save();
  const stored = localStorage.getItem(key);
  expect(JSON.parse(stored).data.note).toBe("my own note");

  window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(OTHER) }));

  expect(document.getElementById("title").textContent).toBe("draft title");
  expect(document.getElementById("note").value).toBe("my own note");
  expect(localStorage.getItem(key)).toBe(stored);
});

test("adopting another tab's draft refreshes the page's computed values", async () => {
  const { key } = await bootDraftTab({ slot: "tabs-refresh-1", draft: DRAFT });

  const refresh = jest.fn();
  window.Sap = { refresh };
  try {
    localStorage.setItem(key, JSON.stringify(OTHER));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: JSON.stringify(OTHER) }));

    expect(document.getElementById("title").textContent).toBe("from the other tab");
    expect(refresh).toHaveBeenCalled();
  } finally {
    delete window.Sap;
  }
});
