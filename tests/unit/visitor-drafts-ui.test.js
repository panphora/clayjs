/**
 * The runtime chrome the visitor-drafts plugin puts on a free app in draft mode:
 * the download prompt, its per-slot memory, and the ?src= channel that rides
 * along in the download link. Everything here is thrown away on reload and never
 * reaches the document.
 */
import { jest } from "@jest/globals";

const PARAMS = "plugins=visitor-drafts&exclude=richclay,source";
const RULES = '{"title":"#title","note":"#note@value"}';

const keyFor = (slot) => "clay:visitor-drafts:" + slot + ":ui";

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setOwnerCookie() {
  document.cookie = "isAdminOfCurrentResource=true; path=/";
}

function setPage({ slot, keepStorage = false }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (slot) root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>`;
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">';
  if (!keepStorage) localStorage.clear();
}

// jsdom has no Response, so a mock built from one throws the moment it is called.
function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

async function bootPage({ slot, params = PARAMS, owner = false, url = "/notes.html", keepStorage = false } = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", url);
  setPage({ slot, keepStorage });
  window.clay = {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return { clay: window.clay, fetchMock, key: keyFor(slot) };
}

function prompt() {
  return document.querySelector(".hcp");
}

function linkHref() {
  return prompt().querySelector("[data-hcp-link]").getAttribute("href");
}

test("draft mode mounts one prompt whose link points at this page's download", async () => {
  await bootPage({ slot: "ui-prompt-1", url: "/" });
  expect(document.querySelectorAll(".hcp").length).toBe(1);
  expect(prompt().tagName).toBe("ASIDE");
  expect(prompt().getAttribute("clay")).toBe("editor-ui");
  expect(prompt().hasAttribute("sap-ignore")).toBe(true);
  expect(linkHref()).toBe("/_/download?as=htmlclay");
  expect(document.getElementById("hcp-style").getAttribute("clay")).toBe("editor-ui");
  expect(document.querySelector("head link[clay='editor-ui']").getAttribute("href")).toContain("fonts.googleapis.com/css2");

  const forms = [
    ["/kanban", "/_/download/kanban.html?as=htmlclay"],
    ["/kanban.html", "/_/download/kanban.html?as=htmlclay"],
    ["/apps/kanban.html", "/_/download/apps/kanban.html?as=htmlclay"],
    ["/apps/kanban/", "/_/download/apps/kanban.html?as=htmlclay"],
  ];
  for (const [path, expected] of forms) {
    await bootPage({ slot: "ui-prompt-" + path.replace(/\W/g, "-"), url: path });
    expect(document.querySelectorAll(".hcp").length).toBe(1);
    expect(linkHref()).toBe(expected);
  }
});

test("the first ?src= for a slot is kept and never replaced", async () => {
  const first = await bootPage({ slot: "ui-src-1", url: "/kanban.html?src=bsky" });
  expect(linkHref()).toBe("/_/download/kanban.html?as=htmlclay&src=bsky");
  expect(first.clay.visitorDrafts.source).toBe("bsky");
  expect(first.clay.visitorDrafts.downloadUrl()).toBe("/_/download/kanban.html?as=htmlclay&src=bsky");
  expect(JSON.parse(localStorage.getItem(keyFor("ui-src-1"))).src).toBe("bsky");

  const second = await bootPage({ slot: "ui-src-1", url: "/kanban.html", keepStorage: true });
  expect(second.clay.visitorDrafts.source).toBe("bsky");
  expect(linkHref()).toBe("/_/download/kanban.html?as=htmlclay&src=bsky");

  const third = await bootPage({ slot: "ui-src-1", url: "/kanban.html?src=x", keepStorage: true });
  expect(third.clay.visitorDrafts.source).toBe("bsky");
  expect(linkHref()).toBe("/_/download/kanban.html?as=htmlclay&src=bsky");

  const invalid = await bootPage({ slot: "ui-src-2", url: "/kanban.html?src=%3Cb%3E" });
  expect(invalid.clay.visitorDrafts.source).toBe(null);
  expect(linkHref()).toBe("/_/download/kanban.html?as=htmlclay");
  expect(localStorage.getItem(keyFor("ui-src-2"))).toBeNull();
});

test("a page that is not in draft mode gets no prompt", async () => {
  await bootPage({ slot: "ui-off-1", owner: true, url: "/notes.html?editmode=true" });
  expect(prompt()).toBeNull();
  expect(document.querySelectorAll("[clay='editor-ui']").length).toBe(0);

  await bootPage({ slot: "ui-off-2", params: "plugins=undo&exclude=richclay,source" });
  expect(prompt()).toBeNull();
});

test("a failed browser write puts the prompt in its error card, and dismiss only minimizes", async () => {
  const { key } = await bootPage({ slot: "ui-error-1" });
  const aside = prompt();
  expect(aside.getAttribute("data-hcp-state")).toBe("tab");

  document.dispatchEvent(new CustomEvent("clay:drafts-store-failed", { detail: { error: new Error("full") } }));
  expect(aside.getAttribute("data-hcp-state")).toBe("card");
  expect(aside.getAttribute("data-hcp-reason")).toBe("error");
  expect(aside.querySelector('.hcp-title [data-hcp-for="error"]').textContent).toBe("Your work isn't being saved in this browser.");
  expect(aside.querySelector('.hcp-body [data-hcp-for="error"]').textContent).toBe("Storage is full or turned off here. Download the file to keep what you've done.");

  aside.querySelector('.hcp-quiet[data-hcp="dismiss"]').click();
  expect(aside.getAttribute("data-hcp-state")).toBe("mini");
  expect(JSON.parse(localStorage.getItem(key)).prompt.dismissed).toBeUndefined();

  document.dispatchEvent(new CustomEvent("clay:drafts-saved", { detail: {} }));
  expect(aside.getAttribute("data-hcp-reason")).toBe("use");
});
