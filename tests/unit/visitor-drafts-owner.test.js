/**
 * The owner half of visitor-drafts: an owner editing the original, not a visitor
 * keeping a draft. The loader resolves plugins/visitor-drafts-owner.js there, so
 * the page gets the owner chip and an inert `clay.visitorDrafts` without the draft
 * store, the prompt or the intro. The chip mounts on the same condition as before
 * (owner, edit mode, no save token) and the missing-slot warning is the same line.
 */
import { jest } from "@jest/globals";

const PARAMS = "plugins=visitor-drafts&exclude=richclay,source";
const RULES = '{"title":"#title","note":"#note@value"}';

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setOwnerCookie() {
  document.cookie = "isAdminOfCurrentResource=true; path=/";
}

function setPage({ slot, rules = true, attrs = {} }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (slot) root.setAttribute("visitor-drafts", slot);
  for (const [name, value] of Object.entries(attrs)) root.setAttribute(name, value);
  document.head.innerHTML = rules
    ? `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`
    : "";
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">';
  localStorage.clear();
}

// jsdom has no Response, so a mock built from one throws the moment it is called.
function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

async function bootPage({ slot, params = PARAMS, owner = false, url = "/notes.html?editmode=true", rules = true, attrs = {} } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", url);
  setPage({ slot, rules, attrs });
  window.clay = {};
  window.scrollTo = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return { clay: window.clay };
}

function ownerChip() {
  return document.querySelector(".clay-owner");
}

afterEach(() => {
  jest.restoreAllMocks();
  clearCookies();
});

test("an owner editing the original gets the chip and nothing else the drafts UI draws", async () => {
  const { clay } = await bootPage({ slot: "owner-chip-1", owner: true });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(true);
  expect(ownerChip()).not.toBeNull();
  expect(ownerChip().querySelector(".clay-owner__lead").textContent)
    .toBe("You're editing the original. Visitors get these changes.");
  expect(document.querySelector(".hcp")).toBeNull();
  expect(document.querySelector(".clay-intro")).toBeNull();
});

test("the chip stays away for a page that is not the owner's, or that carries a save token", async () => {
  await bootPage({ slot: "owner-chip-2" });
  expect(ownerChip()).toBeNull();

  await bootPage({ slot: "owner-chip-3", owner: true, attrs: { savetoken: "token-1" } });
  expect(ownerChip()).toBeNull();
});

test("a page missing the slot or the rules tag still warns instead of drawing a chip", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

  await bootPage({ slot: null, owner: true });
  expect(warn).toHaveBeenCalledWith('visitor-drafts: this page keeps no draft (missing a visitor-drafts="<slot>" attribute on <html>)');
  expect(ownerChip()).toBeNull();

  warn.mockClear();
  await bootPage({ slot: "owner-chip-4", owner: true, rules: false });
  expect(warn).toHaveBeenCalledWith('visitor-drafts: this page keeps no draft (missing a <script data-rules-name~="api"> rules tag)');
  expect(ownerChip()).toBeNull();
});

test("clay.visitorDrafts is the same inert member a non-draft page has always had", async () => {
  const { clay } = await bootPage({ slot: "owner-chip-5", owner: true });

  expect(clay.visitorDrafts.active).toBe(false);
  expect(clay.visitorDrafts.slot).toBe(null);
  expect(clay.visitorDrafts.key).toBe(null);
  expect(clay.visitorDrafts.hasDraft()).toBe(false);
  expect(clay.visitorDrafts.restored()).toBe(null);
  expect(clay.visitorDrafts.saveNow()).toBe(false);
  expect(clay.visitorDrafts.reset()).toBe(false);
  expect(clay.visitorDrafts.onRestore(() => {})).toBe(false);
  expect(clay.visitorDrafts.downloadUrl()).toBe("/_/download?as=htmlclay");
  expect(clay.visitorDrafts.source).toBe(null);
  expect(clay.plugins).toContain("visitor-drafts");
});
