/**
 * The intro and a [persist] textarea bound by a text rule. persist keeps a typed
 * textarea's value in a data-value attribute, so the page's api data does not change
 * while the visitor types. The intro no longer reacts to the app being used: it goes
 * only when the visitor closes it or scrolls past it, so typing here leaves it mounted.
 */
import { jest } from "@jest/globals";
import { draftKey } from "../../src/plugins/visitor-drafts/store.js";

const PARAMS = "plugins=visitor-drafts&exclude=richclay,source";
const RULES = '{"title":"#title","entry":"#entry"}';
const INTRO = "<template visitor-intro><p>Track your week.</p></template>";

const keyFor = (slot) => draftKey(slot);
const uiKeyFor = (slot) => draftKey(slot) + ":ui";

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

async function bootPage({ slot }) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState({}, "", "/notes.html");
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = '<h1 id="title">owner title</h1><textarea id="entry" persist></textarea>' + INTRO;
  localStorage.clear();
  window.clay = {};
  let settleReady;
  window.clay.ready = new Promise((resolve) => { settleReady = resolve; });
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(PARAMS), (clay) => { settleReady(clay); resolve(clay); }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { clay: window.clay, key: keyFor(slot), uiKey: uiKeyFor(slot) };
}

function intro() {
  return document.querySelector(".clay-intro");
}

test("typing into a persist textarea bound by a text rule leaves the intro mounted", async () => {
  const { key, uiKey } = await bootPage({ slot: "intro-persist-1" });

  expect(intro()).not.toBeNull();
  expect(localStorage.getItem(uiKey)).toBeNull();

  const entry = document.getElementById("entry");
  entry.focus();
  entry.value = "typed into the textarea";
  entry.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(intro()).not.toBeNull();
  expect(JSON.parse(localStorage.getItem(uiKey)).intro.done).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
});
