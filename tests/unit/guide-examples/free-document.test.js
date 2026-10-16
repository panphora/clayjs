/**
 * The guide's free-document example (section 14), through the real loader.
 *
 * The whole promise of a free document is here: a visitor gets the editing UI,
 * their work lands in their own browser under the page's slot, nothing is sent
 * to the host, and the next load of the same file shows the work back with the
 * app's own computed values following it.
 */
import { jest } from "@jest/globals";
import { loadExample, saves, tick } from "./helpers.js";

const SLOT = "reading-list-v1";
const KEY = "clay:visitor-drafts:" + SLOT;

const books = () => [...document.querySelectorAll("#books > li[item]:not([cms-template])")];
const titles = () => books().map((li) => li.querySelector(".title").textContent.trim());
const paint = (name) => document.querySelector(`[calc\\:${name}]`).textContent.trim();

let clay;

beforeAll(async () => {
  window.scrollBy = () => {};
  localStorage.clear();
  clay = await loadExample("free-reading-list.html", { draft: true });
  await clay.loaded.sap;
  await tick(50);
}, 15000);

test("opens in draft mode, in the page's flow, with nothing stored yet", () => {
  expect(clay.isDraftMode).toBe(true);
  expect(clay.isEditMode).toBe(true);
  expect(clay.visitorDrafts.active).toBe(true);
  expect(clay.visitorDrafts.slot).toBe(SLOT);
  expect(clay.visitorDrafts.key).toBe(KEY);
  expect(clay.visitorDrafts.restored()).toEqual({ restored: false, hadDraft: false, parked: false });
  expect(localStorage.getItem(KEY)).toBeNull();

  const intro = document.body.firstElementChild;
  expect(intro.className).toBe("clay-intro");
  expect(intro.textContent).toContain("A reading list that lives in your browser.");

  expect(titles()).toEqual([
    "The Mythical Man-Month",
    "Structure and Interpretation of Computer Programs",
  ]);
  expect(paint("read")).toBe("1");
  expect(paint("total")).toBe("2");

  expect(window.Sap.status().ok).toBe(true);
  expect(document.querySelectorAll("[sap-error]").length).toBe(0);
});

test("editing a title and adding a book write the slot, and the host is never asked to save", async () => {
  const first = books()[0].querySelector(".title");
  first.textContent = "The Mythical Man-Month, second edition";
  first.dispatchEvent(new Event("input", { bubbles: true }));

  document.querySelector('[trigger-add="books"]').click();
  await tick(20);
  expect(books().length).toBe(3);

  const result = await clay.save();
  expect(result.ok).toBe(true);
  expect(result.msg).toBe("Saved in this browser");

  const record = JSON.parse(localStorage.getItem(KEY));
  expect(record.v).toBe(1);
  expect(typeof record.savedAt).toBe("string");
  expect(record.data.goal).toBe("24");
  expect(record.data.books.length).toBe(3);
  expect(record.data.books[0].title).toBe("The Mythical Man-Month, second edition");
  expect(record.data.books[2].id).toBeTruthy();
  expect(record.data.books.map((b) => b.status)).toEqual(["read", "reading", "reading"]);

  expect(saves).toEqual([]);
});

test("a fresh load of the same file shows the draft, and sapjs paints the restored counts", async () => {
  jest.resetModules();
  const reloaded = await loadExample("free-reading-list.html", { draft: true });
  await reloaded.loaded.sap;
  window.Sap.refresh();
  await tick(50);

  expect(reloaded.isDraftMode).toBe(true);
  expect(reloaded.visitorDrafts.restored()).toEqual({ restored: true, hadDraft: true, parked: false });
  expect(books().length).toBe(3);
  expect(titles()[0]).toBe("The Mythical Man-Month, second edition");
  expect(paint("read")).toBe("1");
  expect(paint("total")).toBe("3");
  expect(window.Sap.status().ok).toBe(true);

  expect(saves).toEqual([]);
});

test("zz no uncaught errors while the page runs", () => {
  expect(window.__guideErrors).toEqual([]);
});
