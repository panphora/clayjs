/**
 * A tab that restored a draft and was never touched, whose hide follows another
 * tab's newer save. The flush runs the merge, finds the stored record already holds
 * what this tab would write, and leaves the stored string alone: a record is only
 * rewritten when something about it changed.
 *
 * The other tab is a second store on this document, the way a second boot in one
 * file shares it, so its save is also what this tab is showing when it hides.
 */
import { bootDraftTab, DRAFT, visibleRows } from "./helpers/visitor-drafts-tab.js";
import { createStore } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "untouched-flush-1";
const SAVED_AT = "2026-10-15T12:00:00.000Z";
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

const pageHTML = ({ title, rows }) =>
  `<!DOCTYPE html><html><head>${document.querySelector('[data-rules-name="api"]').outerHTML}</head>` +
  `<body><h1 id="title">${title}</h1><input id="note" persist value="${DRAFT.data.note}">` +
  `<ul id="rows">${SEED}${rows}</ul></body></html>`;

test("an untouched tab's pagehide after another tab's newer save leaves the record alone", async () => {
  const { key } = await bootDraftTab({ slot: SLOT, draft: DRAFT });
  expect(document.getElementById("title").textContent).toBe("draft title");

  const other = createStore({ doc: document, storage: localStorage, now: () => new Date(SAVED_AT) });
  expect(other.restore().restored).toBe(true);
  document.getElementById("title").textContent = "other title";
  other.write(pageHTML({ title: "other title", rows: row("r2", "Second") }));

  const stored = localStorage.getItem(key);
  expect(JSON.parse(stored).data.title).toBe("other title");

  window.dispatchEvent(new Event("pagehide"));

  expect(localStorage.getItem(key)).toBe(stored);
  expect(document.getElementById("title").textContent).toBe("other title");
  expect(document.getElementById("note").value).toBe(DRAFT.data.note);
  expect(visibleRows()).toEqual([["r2", "Second"]]);
});
