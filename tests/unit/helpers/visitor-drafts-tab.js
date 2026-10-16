/**
 * One tab of a free app in draft mode, booted through the real loader.
 *
 * A test file gets one document, and the plugin's pagehide/visibilitychange
 * listeners outlive the module registry, so a second boot in the same file shares
 * the document with the first. The tab that has to be provably untouched therefore
 * boots in its own file; a file that only boots once gets the same helper.
 */
import { jest } from "@jest/globals";

const PARAMS = "plugins=visitor-drafts,undo&exclude=richclay";
const RULES = '{"title":"#title","note":"#note@value","rows":["#rows > li[item]:not([cms-template])",{"id":"@data-id","name":".n"}]}';
const SEED = '<li item cms-template data-id=""><span class="n"></span></li>';
const row = (id, name) => `<li item data-id="${id}"><span class="n">${name}</span></li>`;

const WATCHED = ["clay:drafts-restored", "clay:drafts-saved", "clay:drafts-store-failed"];

export const DRAFT = { v: 1, savedAt: "2026-10-15T00:00:00.000Z", data: { title: "draft title", note: "typed note", rows: [{ id: "r2", name: "Second" }] } };

const keyFor = (slot) => "clay:visitor-drafts:" + slot;

export const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

export function visibleRows() {
  return [...document.querySelectorAll("#rows > li[item]:not([cms-template])")].map((li) => [li.dataset.id, li.textContent]);
}

// jsdom has no Response, so a mock built from one throws the moment it is called.
function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

function setPage({ slot, draft }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = `<h1 id="title">owner title</h1><input id="note" persist value="owner note"><ul id="rows">${SEED}${row("r1", "First")}</ul>`;
  localStorage.clear();
  if (draft) localStorage.setItem(keyFor(slot), JSON.stringify(draft));
}

export async function bootDraftTab({ slot, draft = null } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", "/notes.html");
  setPage({ slot, draft });
  window.clay = {};
  // The entry scripts (entries/clay.js, src/standalone.js) mint clay.ready before
  // boot and hand its resolver to boot(); the plugin settles its save baseline on
  // that promise, so a page booted without one would flush on every hide.
  let settleReady;
  window.clay.ready = new Promise((resolve) => { settleReady = resolve; });
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const events = [];
  for (const name of WATCHED) document.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
  const { boot } = await import("../../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(PARAMS), (clay) => { settleReady(clay); resolve(clay); }));
  await settle();
  return { clay: window.clay, key: keyFor(slot), events };
}
