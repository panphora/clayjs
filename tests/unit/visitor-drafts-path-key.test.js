/**
 * A draft belongs to one document: the slot and the document's path. A draft saved
 * under the slot alone is copied into the path's key once, behind a marker, and the
 * old key is never written or removed again; a path that already has its own draft
 * keeps it, and a visitor who writes while the copy runs keeps what they typed.
 */
import { jest } from "@jest/globals";
import { adoptLegacy, createStore, draftKey, draftPath, legacyKey } from "../../src/plugins/visitor-drafts/store.js";

const SLOT = "path-key-1";
const PATH = "/journal.html";
const FROM = legacyKey(SLOT);
const TO = draftKey(SLOT, PATH);
const MARKER = TO + ":legacy";
const UI = FROM + ":ui";

const record = (savedAt, data) => JSON.stringify({ v: 1, savedAt, data });
const OLD = record("2026-10-15T01:00:00.000Z", { title: "old title" });
const NEWER = record("2026-10-16T01:00:00.000Z", { title: "newer old title" });
const SCOPED = record("2026-10-17T01:00:00.000Z", { title: "this document" });
const TYPED = record("2026-10-18T01:00:00.000Z", { title: "typed during the copy" });
const stampOf = (raw) => JSON.parse(raw).savedAt;

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (name) => (map.has(name) ? map.get(name) : null),
    setItem: (name, value) => { map.set(name, String(value)); },
    removeItem: (name) => { map.delete(name); },
    keys: () => [...map.keys()],
  };
}

const keys = (storage) => storage.keys().sort();

afterEach(() => {
  jest.restoreAllMocks();
});

test("the document path is the one the hosts resolve", () => {
  const table = [
    ["/journal.html", "/journal.html"],
    ["/journal.html/", "/journal.html"],
    ["/journal.html/settings/deep", "/journal.html"],
    ["//journal.html", "/journal.html"],
    ["/notes/journal.htmlclay", "/notes/journal.htmlclay"],
    ["/", "/"],
    ["/index.html", "/"],
    ["/pricing", "/"],
  ];
  for (const [pathname, expected] of table) expect([pathname, draftPath(pathname)]).toEqual([pathname, expected]);
});

test("the key names the slot and the path, and the old key keeps its name", () => {
  expect(draftKey(SLOT, "/journal.html")).toBe("clay:visitor-drafts:path-key-1@/journal.html");
  expect(draftKey(SLOT, "/")).toBe("clay:visitor-drafts:path-key-1@/");
  expect(legacyKey(SLOT)).toBe("clay:visitor-drafts:path-key-1");
});

test("no old draft means nothing to copy and no key written", () => {
  const storage = fakeStorage();

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("none");
  expect(keys(storage)).toEqual([]);
});

test("an old draft with no path key is copied with its UI memory, and the old value is left byte-identical", () => {
  const storage = fakeStorage({ [FROM]: OLD, [UI]: JSON.stringify({ v: 1, prompt: {}, intro: { done: "closed" }, src: null }) });

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("copied");

  expect(storage.getItem(TO)).toBe(OLD);
  expect(storage.getItem(TO + ":ui")).toBe(storage.getItem(UI));
  expect(storage.getItem(MARKER)).toBe(stampOf(OLD));
  expect(storage.getItem(FROM)).toBe(OLD);
  expect(keys(storage)).toEqual([FROM, MARKER, TO, TO + ":ui", UI].sort());
});

test("the marker means a moved draft is not copied again, even after a reset removed the path key", () => {
  const storage = fakeStorage({ [FROM]: OLD, [MARKER]: stampOf(OLD) });

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("none");

  expect(storage.getItem(TO)).toBeNull();
  expect(storage.getItem(FROM)).toBe(OLD);
  expect(keys(storage)).toEqual([FROM, MARKER]);
});

test("a tab still on the old runtime that wrote again is caught up on the next load", () => {
  const unchanged = fakeStorage({ [FROM]: NEWER, [MARKER]: stampOf(OLD), [TO]: OLD });
  expect(adoptLegacy(SLOT, { path: PATH, storage: unchanged })).toBe("copied");
  expect(unchanged.getItem(TO)).toBe(NEWER);
  expect(unchanged.getItem(FROM)).toBe(NEWER);

  const reset = fakeStorage({ [FROM]: NEWER, [MARKER]: stampOf(OLD) });
  expect(adoptLegacy(SLOT, { path: PATH, storage: reset })).toBe("copied");
  expect(reset.getItem(TO)).toBe(NEWER);
  expect(reset.getItem(FROM)).toBe(NEWER);
});

test("a newer old-key record does not replace a path key this document wrote since the copy", () => {
  const storage = fakeStorage({ [FROM]: NEWER, [MARKER]: stampOf(OLD), [TO]: SCOPED });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("copied");

  expect(storage.getItem(TO)).toBe(SCOPED);
  expect(storage.getItem(TO + ":conflict")).toBe(NEWER);
  expect(storage.getItem(MARKER)).toBe(stampOf(NEWER));
  expect(storage.getItem(FROM)).toBe(NEWER);
  expect(warn).toHaveBeenCalledWith(
    "visitor-drafts: an older tab changed this draft after it moved; its copy was kept under",
    TO + ":conflict"
  );
});

test("a path that already has its own scoped draft never takes the old slot-only draft over it", () => {
  const storage = fakeStorage({ [FROM]: OLD, [TO]: SCOPED });
  jest.spyOn(console, "warn").mockImplementation(() => {});

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("copied");

  expect(storage.getItem(TO)).toBe(SCOPED);
  expect(storage.getItem(TO + ":conflict")).toBe(OLD);
  expect(storage.getItem(FROM)).toBe(OLD);
});

test("a visitor who wrote while the copy ran keeps what they typed", () => {
  const storage = fakeStorage({ [FROM]: OLD, [UI]: JSON.stringify({ v: 1, prompt: {}, intro: { done: "closed" }, src: null }) });
  const getItem = storage.getItem;
  let reads = 0;
  storage.getItem = (name) => {
    if (name === TO && ++reads === 2) storage.setItem(TO, TYPED);
    return getItem(name);
  };

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("none");

  expect(storage.getItem(TO)).toBe(TYPED);
  expect(storage.getItem(MARKER)).toBeNull();
  expect(storage.getItem(FROM)).toBe(OLD);
});

test("a copy that does not fit reports failure and leaves the old draft to read", () => {
  const storage = fakeStorage({ [FROM]: OLD });
  storage.setItem = () => { throw new Error("QuotaExceededError"); };

  expect(adoptLegacy(SLOT, { path: PATH, storage })).toBe("failed");
  expect(storage.getItem(FROM)).toBe(OLD);
});

const RULES = JSON.stringify({ title: "#title@value", note: "#note@value" });
const RULES_TAG = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
const pageHTML = (title, note) => `<!DOCTYPE html><html><head>${RULES_TAG}</head><body><input id="title" value="${title}"><input id="note" value="${note}"></body></html>`;

function openDoc(name, storage, path) {
  const doc = document.implementation.createHTMLDocument(name);
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = RULES_TAG;
  doc.body.innerHTML = '<input id="title" value="owner title"><input id="note" value="owner note">';
  return { doc, store: createStore({ doc, storage, path }) };
}

test("two documents on one storage and slot never write each other's key", () => {
  const storage = fakeStorage();
  const a = openDoc("a", storage, "/a.html");
  const b = openDoc("b", storage, "/b.html");
  a.store.restore();
  b.store.restore();

  a.store.write(pageHTML("A title", "A note"));
  b.store.write(pageHTML("B title", "B note"));

  expect(JSON.parse(storage.getItem(draftKey(SLOT, "/a.html"))).data).toEqual({ title: "A title", note: "A note" });
  expect(JSON.parse(storage.getItem(draftKey(SLOT, "/b.html"))).data).toEqual({ title: "B title", note: "B note" });
  expect(storage.getItem(legacyKey(SLOT))).toBeNull();
  expect(keys(storage)).toEqual([draftKey(SLOT, "/a.html"), draftKey(SLOT, "/b.html")].sort());
});

test("a draft that could not be copied still restores from the old key, and the first save reports the storage failure", () => {
  const storage = fakeStorage({ [FROM]: OLD });
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  const doc = document.implementation.createHTMLDocument("full");
  doc.documentElement.setAttribute("visitor-drafts", SLOT);
  doc.head.innerHTML = RULES_TAG;
  doc.body.innerHTML = '<input id="title" value="owner title"><input id="note" value="owner note">';
  const failures = [];
  doc.addEventListener("clay:drafts-store-failed", () => failures.push(true));

  const moved = adoptLegacy(SLOT, { path: PATH, storage });
  expect(moved).toBe("failed");
  const store = createStore({ doc, storage, path: PATH, fallback: moved === "failed" ? legacyKey(SLOT) : null });

  expect(store.restore().restored).toBe(true);
  expect(doc.getElementById("title").value).toBe("old title");
  expect(() => store.write(pageHTML("typed title", "typed note"))).toThrow("Couldn't save in this browser. Storage is full or turned off.");
  expect(failures).toEqual([true]);
  expect(storage.getItem(FROM)).toBe(OLD);
});

const BOOT_PARAMS = "plugins=visitor-drafts,undo&exclude=richclay";
const BOOT_RULES = '{"title":"#title","note":"#note@value"}';
const INTRO = "<template visitor-intro><p>Track your week.</p></template>";
const URL_PATH = "/journal.html";
const OLD_DRAFT = record("2026-10-15T00:00:00.000Z", { title: "draft title", note: "typed note" });
const OLD_UI = JSON.stringify({ v: 1, prompt: {}, intro: { done: "closed" }, src: null });

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

const intro = () => document.querySelector(".clay-intro");

async function bootPage({ slot, oldDraft = null, oldUi = null, fresh = true } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", URL_PATH);
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${BOOT_RULES}</script>`;
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">' + INTRO;
  if (fresh) localStorage.clear();
  if (oldDraft) localStorage.setItem(legacyKey(slot), oldDraft);
  if (oldUi) localStorage.setItem(legacyKey(slot) + ":ui", oldUi);
  window.clay = {};
  let settleReady;
  window.clay.ready = new Promise((resolve) => { settleReady = resolve; });
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(BOOT_PARAMS), (clay) => { settleReady(clay); resolve(clay); }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { clay: window.clay };
}

test("an old draft is restored on boot, with no intro, and the next save writes only the path key", async () => {
  const { clay } = await bootPage({ slot: "path-key-boot-1", oldDraft: OLD_DRAFT, oldUi: OLD_UI });

  expect(clay.isDraftMode).toBe(true);
  expect(clay.visitorDrafts.key).toBe(draftKey("path-key-boot-1", URL_PATH));
  expect(clay.visitorDrafts.hasDraft()).toBe(true);
  expect(document.getElementById("title").textContent).toBe("draft title");
  expect(document.getElementById("note").value).toBe("typed note");
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(draftKey("path-key-boot-1", URL_PATH) + ":ui")).intro.done).toBe("closed");

  const note = document.getElementById("note");
  note.value = "typed after the move";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  const result = await clay.save();

  expect(result).toMatchObject({ ok: true, msg: "Saved in this browser" });
  expect(JSON.parse(localStorage.getItem(draftKey("path-key-boot-1", URL_PATH))).data.note).toBe("typed after the move");
  expect(localStorage.getItem(legacyKey("path-key-boot-1"))).toBe(OLD_DRAFT);
  expect(localStorage.getItem(draftKey("path-key-boot-1", URL_PATH) + ":conflict")).toBeNull();
});

test("a reset after the move removes the path key and leaves the marker, so the old draft does not come back", async () => {
  const slot = "path-key-boot-2";
  const { clay } = await bootPage({ slot, oldDraft: OLD_DRAFT });

  expect(document.getElementById("title").textContent).toBe("draft title");

  const realLocation = window.location;
  const fake = { href: "http://localhost" + URL_PATH, reload: () => {} };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  try {
    expect(clay.visitorDrafts.reset()).toBe(true);
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }

  expect(localStorage.getItem(draftKey(slot, URL_PATH))).toBeNull();
  expect(localStorage.getItem(draftKey(slot, URL_PATH) + ":legacy")).toBe(JSON.parse(OLD_DRAFT).savedAt);
  expect(localStorage.getItem(legacyKey(slot))).toBe(OLD_DRAFT);

  const again = await bootPage({ slot, oldDraft: OLD_DRAFT, fresh: false });

  expect(again.clay.visitorDrafts.hasDraft()).toBe(false);
  expect(document.getElementById("title").textContent).toBe("owner title");
  expect(document.getElementById("note").value).toBe("owner note");
  expect(localStorage.getItem(draftKey(slot, URL_PATH))).toBeNull();
});
