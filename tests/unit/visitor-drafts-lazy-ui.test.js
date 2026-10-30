/**
 * The chrome a draft boot draws, now that its pieces arrive as their own imports:
 * the prompt and its stylesheet for a visitor, the owner chip as well for an owner,
 * and the prompt's style in the document before the prompt element is. What each of
 * those costs a boot is the static graph's question
 * (tests/unit/build/visitor-drafts-lazy-ui.test.js); this file asks what a person
 * ends up looking at.
 */
import { jest } from "@jest/globals";
import { $, hostOf, sheetText } from "./helpers/editor-ui.js";

const PARAMS = "plugins=visitor-drafts&exclude=richclay,source";
const RULES = '{"title":"#title","note":"#note@value"}';

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setOwnerCookie() {
  document.cookie = "isAdminOfCurrentResource=true; path=/";
}

function setPage({ slot }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">';
  localStorage.clear();
}

// jsdom has no Response, so a mock built from one throws the moment it is called.
function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

async function bootPage({ slot, owner = false, onPromptInsert = null } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", "/notes.html");
  setPage({ slot });
  window.clay = {};
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;

  const insertBefore = document.body.insertBefore;
  document.body.insertBefore = function (node, before) {
    if (onPromptInsert && node.matches?.('clay-editor-ui[data-clay-ui="download-prompt"]')) onPromptInsert(node);
    return insertBefore.call(this, node, before);
  };
  try {
    const { boot } = await import("../../src/loader.js");
    await new Promise((resolve) => boot(null, new URLSearchParams(PARAMS), resolve));
  } finally {
    document.body.insertBefore = insertBefore;
  }
  return { clay: window.clay };
}

const prompt = () => $("#hcp", "download-prompt");
const chip = () => $(".clay-owner", "owner");

afterEach(() => {
  clearCookies();
});

test("a visitor's draft boot mounts the prompt and draws no owner chip", async () => {
  const { clay } = await bootPage({ slot: "lazy-visitor-1" });

  expect(clay.isDraftMode).toBe(true);
  expect(prompt()).not.toBeNull();
  expect(hostOf("owner")).toBeNull();
});

test("an owner's draft boot gets the chip", async () => {
  const { clay } = await bootPage({ slot: "lazy-owner-1", owner: true });

  expect(clay.isDraftMode).toBe(true);
  expect(prompt()).not.toBeNull();
  expect(chip()).not.toBeNull();
  expect(chip().querySelector(".clay-owner__lead").textContent)
    .toBe("You're seeing a private draft, like a visitor.");
});

test("the prompt's stylesheet is in the document before the prompt element", async () => {
  let sheetAtInsert = null;
  await bootPage({
    slot: "lazy-style-1",
    onPromptInsert: (host) => { sheetAtInsert = Array.from(host.shadowRoot.querySelectorAll("style"), (style) => style.textContent).join("\n"); },
  });

  expect(sheetAtInsert).toContain(".hcp-card");
  expect(sheetText("download-prompt")).toContain(".hcp-card");
  expect(hostOf("download-prompt").getAttribute("clay")).toBe("editor-ui");
});
