/**
 * The whole draft loop through the real loader: restore before clay.ready, a save
 * that reaches the slot and not the host, the close warning's predicate, the
 * owner's two lanes, and the flush when the tab goes away.
 */
import { jest } from "@jest/globals";

const PARAMS = "plugins=visitor-drafts,undo&exclude=richclay";
const ALL_PLUGINS = "plugins=visitor-drafts,undo,sync,upload,cms,people,wire,live&exclude=richclay";

const RULES = '{"title":"#title","note":"#note@value","rows":["#rows > li[item]:not([cms-template])",{"id":"@data-id","name":".n"}]}';
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

const DRAFT = { v: 1, savedAt: "2026-10-15T00:00:00.000Z", data: { title: "draft title", note: "typed note", rows: [{ id: "r2", name: "Second" }] } };

const keyFor = (slot) => "clay:visitor-drafts:" + slot;

// Every boot gets its own slot: the plugin's flush listeners outlive the module
// registry, so two boots on one slot would let a stale store write for the boot
// under test and hide a missing listener.
function setPage({ slot, rows = row("r1", "First"), draft = null }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = `<h1 id="title">owner title</h1><input id="note" persist value="owner note"><ul id="rows">${SEED}${rows}</ul>`;
  localStorage.clear();
  if (draft) localStorage.setItem(keyFor(slot), JSON.stringify(draft));
}

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setOwnerCookie() {
  document.cookie = "isAdminOfCurrentResource=true; path=/";
}

function visibleRows() {
  return [...document.querySelectorAll("#rows > li[item]:not([cms-template])")].map((li) => [li.dataset.id, li.textContent]);
}

const WATCHED = ["clay:drafts-restored", "clay:drafts-saved", "clay:drafts-store-failed", "clay:save-saved", "clay:save-error"];

// The shape save-core reads: ok/status/statusText and text(). jsdom has no
// Response, so a mock built from one throws the moment it is called.
function jsonResponse(body = { msg: "Saved", msgType: "success" }, status = 200) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, statusText: status === 200 ? "OK" : "Error", text: async () => text };
}

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

async function bootPage({ slot, params = PARAMS, owner = false, url = "/notes.html", draft = null, rows, fetchMock } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", url);
  setPage({ slot, rows, draft });
  window.clay = {};
  const mock = fetchMock || jest.fn(async () => notFound());
  window.fetch = mock;
  global.fetch = mock;
  const events = [];
  for (const name of WATCHED) document.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return {
    clay: window.clay,
    key: keyFor(slot),
    fetchMock: mock,
    events,
    count: (name) => events.filter((event) => event.name === name).length,
  };
}

test("an edit is flushed on hide, and only when the tab is actually hidden", async () => {
  // The first boot in this file: a later boot's store shares the document's
  // clay:dirty/clay:drafts-saved events, so a flush test has to own the document.
  const { clay, key } = await bootPage({ slot: "boot-flush-1" });

  const note = document.getElementById("note");
  note.value = "first keystroke";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0)); // the dirty gate announces on a microtask
  expect(localStorage.getItem(key)).toBeNull();

  document.dispatchEvent(new Event("visibilitychange"));
  expect(localStorage.getItem(key)).toBeNull();

  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  try {
    document.dispatchEvent(new Event("visibilitychange"));
    expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("first keystroke");

    await clay.save();
    note.value = "second keystroke";
    note.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("first keystroke");

    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem(key)).data.note).toBe("second keystroke");
  } finally {
    delete document.visibilityState;
  }
  expect(clay.visitorDrafts.hasDraft()).toBe(true);
});

test("a stored draft is applied before clay.ready, and undo has no step to take back", async () => {
  const { clay, key, events, count } = await bootPage({ slot: "boot-restore-1", draft: DRAFT });

  expect(clay.isDraftMode).toBe(true);
  expect(clay.visitorDrafts.active).toBe(true);
  expect(clay.visitorDrafts.key).toBe(key);
  expect(clay.visitorDrafts.hasDraft()).toBe(true);
  expect(clay.visitorDrafts.restored()).toEqual({ restored: true, hadDraft: true, parked: false });
  expect(document.getElementById("title").textContent).toBe("draft title");
  expect(document.getElementById("note").value).toBe("typed note");
  expect(visibleRows()).toEqual([["r2", "Second"]]);
  expect(count("clay:drafts-restored")).toBe(1);
  expect(events.find((event) => event.name === "clay:drafts-restored").detail).toEqual({ restored: true, hadDraft: true, parked: false });
  expect(clay.undo.canUndo).toBe(false);
});

test("a typed edit saves into the slot and never reaches the host", async () => {
  const { clay, key, fetchMock } = await bootPage({ slot: "boot-save-1" });

  expect(fetchMock.mock.calls.length).toBe(0);

  const note = document.getElementById("note");
  note.value = "typed by visitor";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  const result = await clay.save();

  expect(result).toMatchObject({ ok: true, msg: "Saved in this browser" });
  const record = JSON.parse(localStorage.getItem(key));
  expect(record.v).toBe(1);
  expect(Number.isNaN(Date.parse(record.savedAt))).toBe(false);
  expect(record.data).toEqual({ title: "owner title", note: "typed by visitor", rows: [{ id: "r1", name: "First" }] });
  expect(fetchMock.mock.calls.length).toBe(0);
});

test("a draft edit is not unsaved work, but a failed browser write is", async () => {
  const { clay } = await bootPage({ slot: "boot-unsaved-1" });

  document.getElementById("title").textContent = "edited by a visitor";
  expect(clay.hasUnsavedChanges()).toBe(false);

  const draftMode = await import("../../src/core/draft-mode.js");
  draftMode.setDraftStoreFailed(true);
  try {
    expect(clay.hasUnsavedChanges()).toBe(true);
  } finally {
    draftMode.setDraftStoreFailed(false);
  }
  expect(clay.hasUnsavedChanges()).toBe(false);
});

test("the owner without ?editmode gets the same private draft", async () => {
  const { clay } = await bootPage({ slot: "boot-owner-1", owner: true, draft: DRAFT });

  expect(clay.isOwner).toBe(true);
  expect(clay.isDraftMode).toBe(true);
  expect(clay.visitorDrafts.restored()).toEqual({ restored: true, hadDraft: true, parked: false });
  expect(document.getElementById("title").textContent).toBe("draft title");
  expect(document.getElementById("note").value).toBe("typed note");
  expect(visibleRows()).toEqual([["r2", "Second"]]);
});

test("the owner with ?editmode=true saves to the host, not to the slot", async () => {
  // `source` is default-on in edit mode and fetches its own map, so it is excluded
  // here: this case is about which lane a save takes.
  const fetchMock = jest.fn(async (url) => (String(url).includes("/_/save") ? jsonResponse() : notFound()));
  const { clay, key } = await bootPage({ slot: "boot-owner-edit-1", url: "/notes.html?editmode=true", owner: true, params: PARAMS + ",source", fetchMock });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.visitorDrafts.active).toBe(false);
  expect(clay.visitorDrafts.saveNow()).toBe(false);

  document.getElementById("title").textContent = "owner edit";
  const result = await clay.save();

  expect(result).toMatchObject({ ok: true, msg: "Saved" });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/_/save"))).toBe(true);
  expect(localStorage.getItem(key)).toBeNull();
});

test("every save entry point in draft mode stays off the host", async () => {
  const xhrOpen = jest.spyOn(window.XMLHttpRequest.prototype, "open").mockImplementation(() => {});
  const eventSources = [];
  const hadEventSource = "EventSource" in window;
  const realEventSource = window.EventSource;
  window.EventSource = class { constructor(url) { eventSources.push(String(url)); } addEventListener() {} close() {} };

  try {
    const { clay, key, fetchMock, count } = await bootPage({ slot: "boot-privacy-1", params: ALL_PLUGINS });

    expect(clay.isDraftMode).toBe(true);
    expect(clay.conflicts).toBeUndefined();
    expect(clay.upload).toBeUndefined();
    expect(clay.live).toBeUndefined();
    expect(clay.cms).toBeUndefined();
    expect(clay.people).toBeUndefined();
    expect(clay.wire).toBeUndefined();

    document.getElementById("title").textContent = "typed in draft mode";
    const saved = await clay.save();
    expect(saved).toMatchObject({ ok: true, msg: "Saved in this browser" });
    await clay.save.force();
    expect(clay.visitorDrafts.saveNow()).toBe(true);

    expect(count("clay:drafts-saved")).toBe(3);
    expect(JSON.parse(localStorage.getItem(key)).data.title).toBe("typed in draft mode");
    expect(fetchMock.mock.calls).toEqual([]);
    expect(xhrOpen.mock.calls).toEqual([]);
    expect(eventSources).toEqual([]);
  } finally {
    xhrOpen.mockRestore();
    if (hadEventSource) window.EventSource = realEventSource;
    else delete window.EventSource;
  }
});

test("editOriginal and backToDraft move the editmode param both ways", async () => {
  const { clay } = await bootPage({ slot: "boot-edit-original-1", draft: DRAFT });
  const realLocation = window.location;
  const fake = { href: "http://localhost/notes.html", search: "", protocol: "http:", pathname: "/notes.html", hostname: "localhost", origin: "http://localhost" };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  try {
    clay.visitorDrafts.editOriginal();
    expect(fake.href).toBe("http://localhost/notes.html?editmode=true");
    fake.href = "http://localhost/notes.html?editmode=true&other=1";
    clay.visitorDrafts.backToDraft();
    expect(fake.href).toBe("http://localhost/notes.html?other=1");
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }
});

test("a storage that refuses the write makes the close warning warn before any autosave ran", async () => {
  const { clay, key } = await bootPage({ slot: "boot-unsaved-2" });

  const realSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name, value) {
    if (String(name) === key) throw new Error("QuotaExceededError");
    return realSetItem.call(this, name, value);
  };
  try {
    const note = document.getElementById("note");
    note.value = "typed but never stored";
    note.dispatchEvent(new Event("input", { bubbles: true }));

    expect(clay.hasUnsavedChanges()).toBe(true);
    expect(localStorage.getItem(key)).toBeNull();
  } finally {
    Storage.prototype.setItem = realSetItem;
  }
});

test("the owner editing the original can go back to their draft", async () => {
  const { clay } = await bootPage({ slot: "boot-owner-edit-2", owner: true, url: "/notes.html?editmode=true" });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.visitorDrafts.active).toBe(false);

  const realLocation = window.location;
  const fake = {
    href: "http://localhost/notes.html?editmode=true&other=1",
    search: "?editmode=true&other=1",
    protocol: "http:",
    pathname: "/notes.html",
    hostname: "localhost",
    origin: "http://localhost",
  };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  try {
    expect(clay.visitorDrafts.backToDraft()).toBe(true);
    expect(fake.href).toBe("http://localhost/notes.html?other=1");
    expect(clay.visitorDrafts.editOriginal()).toBe(true);
    expect(fake.href).toBe("http://localhost/notes.html?other=1&editmode=true");
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }
});
