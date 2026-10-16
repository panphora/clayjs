/**
 * The runtime chrome the visitor-drafts plugin puts on a free app in draft mode:
 * the download prompt, the intro area, the owner chip, their per-slot memory, and
 * the ?src= channel that rides along in the download link. Everything here is
 * thrown away on reload and never reaches the document.
 */
import { jest } from "@jest/globals";

const PARAMS = "plugins=visitor-drafts&exclude=richclay,source";
const RULES = '{"title":"#title","note":"#note@value"}';
const INTRO = '<template visitor-intro><p>Track your week.</p></template>';

const keyFor = (slot) => "clay:visitor-drafts:" + slot + ":ui";
const draftKeyFor = (slot) => "clay:visitor-drafts:" + slot;

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setOwnerCookie() {
  document.cookie = "isAdminOfCurrentResource=true; path=/";
}

function setPage({ slot, keepStorage = false, head = "", template = "", ui = null, draft = null }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (slot) root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>` + head;
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">' + template;
  if (!keepStorage) localStorage.clear();
  if (ui) localStorage.setItem(keyFor(slot), JSON.stringify(ui));
  if (draft) localStorage.setItem(draftKeyFor(slot), JSON.stringify(draft));
}

// jsdom has no Response, so a mock built from one throws the moment it is called.
function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
}

async function bootPage({
  slot,
  params = PARAMS,
  owner = false,
  url = "/notes.html",
  keepStorage = false,
  head = "",
  template = "",
  ui = null,
  draft = null,
} = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", url);
  setPage({ slot, keepStorage, head, template, ui, draft });
  window.clay = {};
  window.scrollTo = () => {};
  window.scrollBy = () => {};
  const fetchMock = jest.fn(async () => notFound());
  window.fetch = fetchMock;
  global.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return { clay: window.clay, fetchMock, key: keyFor(slot) };
}

function intro() {
  return document.querySelector(".clay-intro");
}

function about() {
  return document.querySelector(".clay-about");
}

function ownerChip() {
  return document.querySelector(".clay-owner");
}

function styleText(id) {
  return document.getElementById(id).textContent;
}

function typeInto(el, value) {
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function submitSignup() {
  document.querySelector(".clay-intro__signup").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
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
  expect(intro()).toBeNull();
  expect([...document.querySelectorAll("[clay='editor-ui']")].map((el) => el.id)).toEqual(["clay-owner-style", "clay-owner"]);

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

test("a template puts the intro at the top of the page, where a save never looks", async () => {
  const { clay } = await bootPage({ slot: "ui-intro-1", template: INTRO });

  expect(intro()).not.toBeNull();
  expect(document.body.firstElementChild).toBe(intro());
  expect(intro().getAttribute("clay")).toBe("editor-ui");
  expect(intro().hasAttribute("sap-ignore")).toBe(true);
  expect(intro().getAttribute("aria-label")).toBe("About This app");
  expect(intro().querySelector(".clay-intro__name").textContent).toBe("This app");
  expect(intro().querySelector(".clay-intro__download").getAttribute("href")).toBe("/_/download/notes.html?as=htmlclay");
  expect(intro().querySelector(".clay-intro__start").textContent).toBe("Start using This app");
  expect(intro().textContent).toContain("Track your week.");
  expect(styleText("clay-intro-style")).toContain("min-height: 100svh");

  const html = clay.getHTML();
  expect(html).not.toContain("clay-intro");
  expect(html).not.toContain("hcp");
  expect(html).toContain("<template visitor-intro=\"\"><p>Track your week.</p></template>");
});

test("a page that locks its own scrolling scrolls while the intro is mounted", async () => {
  const { key } = await bootPage({
    slot: "ui-intro-locked",
    template: INTRO,
    head: "<style>html,body{height:100%}body{overflow:hidden}</style>",
  });

  expect(document.body.firstElementChild).toBe(intro());
  expect(intro().classList.contains("clay-intro--overlay")).toBe(false);
  expect(styleText("clay-intro-style")).toContain(
    "html:has(> body > .clay-intro), body:has(> .clay-intro) { height: auto !important; min-height: 100%; overflow-y: auto !important; }"
  );

  typeInto(document.getElementById("note"), "typed note");
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)).intro.done).toBe("use");
});

test("the intro stands aside for a returning visitor, a deep link and print", async () => {
  await bootPage({ slot: "ui-intro-done", template: INTRO, ui: { v: 1, intro: { done: "button" } } });
  expect(intro()).toBeNull();
  expect(about()).not.toBeNull();

  await bootPage({
    slot: "ui-intro-draft",
    template: INTRO,
    draft: { v: 1, savedAt: "2026-10-15T00:00:00.000Z", data: { title: "draft title", note: "typed note" } },
  });
  expect(intro()).toBeNull();
  expect(about()).not.toBeNull();

  await bootPage({ slot: "ui-intro-hash", template: INTRO, url: "/notes.html#card=c1" });
  expect(intro()).toBeNull();
  expect(about()).toBeNull();

  const original = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query.includes("print"), media: query, addEventListener() {}, removeEventListener() {} });
  try {
    await bootPage({ slot: "ui-intro-print", template: INTRO });
    expect(intro()).toBeNull();
  } finally {
    window.matchMedia = original;
  }

  await bootPage({ slot: "ui-intro-forced", template: INTRO, url: "/notes.html?intro=1", ui: { v: 1, intro: { done: "button" } } });
  expect(intro()).not.toBeNull();
});

test("using the app dismisses the intro, and so does its start button", async () => {
  const used = await bootPage({ slot: "ui-intro-use", template: INTRO });
  typeInto(document.getElementById("note"), "typed note");
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(used.key)).intro.done).toBe("use");
  expect(document.activeElement).toBe(document.getElementById("note"));

  await bootPage({ slot: "ui-intro-button", template: INTRO });
  intro().querySelector(".clay-intro__start").click();
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(keyFor("ui-intro-button"))).intro.done).toBe("button");
  expect(document.activeElement).toBe(document.getElementById("note"));

  await bootPage({ slot: "ui-intro-dirty", template: INTRO });
  document.dispatchEvent(new CustomEvent("clay:dirty"));
  expect(intro()).not.toBeNull();
  const note = document.getElementById("note");
  note.value = "changed by a click";
  note.setAttribute("value", "changed by a click");
  document.dispatchEvent(new CustomEvent("clay:dirty"));
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(keyFor("ui-intro-dirty"))).intro.done).toBe("use");
});

test("the intro's signup posts the address, the app tag and the channel", async () => {
  const first = await bootPage({ slot: "kanban-v1", template: INTRO, url: "/kanban.html?src=bsky" });
  document.getElementById("clay-intro-email").value = "reader@example.com";
  submitSignup();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(first.fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = first.fetchMock.mock.calls[0];
  expect(url).toBe("/_/newsletter/subscribe");
  expect(options.method).toBe("POST");
  expect(options.headers).toEqual({ "Content-Type": "application/json" });
  expect(options.credentials).toBe("same-origin");
  expect(JSON.parse(options.body)).toEqual({
    email: "reader@example.com",
    tags: ["app-kanban"],
    source: "bsky",
    website: "",
  });
  expect(document.querySelector(".clay-intro__msg").textContent).toBe("That didn't go through. Check the address and try again.");

  const second = await bootPage({ slot: "field-pad-v1", template: '<template visitor-intro signup-tag="field-pad"><p>Pad.</p></template>' });
  document.getElementById("clay-intro-email").value = "reader@example.com";
  submitSignup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(JSON.parse(second.fetchMock.mock.calls[0][1].body).tags).toEqual(["app-field-pad"]);
});

test("a returning visitor gets a small About this app control that reopens the intro", async () => {
  await bootPage({ slot: "ui-intro-about", template: INTRO, ui: { v: 1, intro: { done: "button" } } });

  expect(intro()).toBeNull();
  expect(about()).not.toBeNull();
  expect(about().textContent).toBe("About this app");
  expect(about().getAttribute("clay")).toBe("editor-ui");
  expect(about().hasAttribute("sap-ignore")).toBe(true);
  const css = styleText("clay-intro-style");
  expect(css).toContain(".clay-about {");
  expect(css).toContain("position: fixed; top: 12px; right: 12px");
  expect(css).toContain("font-size: 13px");
  expect(css).toContain("@media (pointer: coarse) {");

  about().click();
  expect(about()).toBeNull();
  expect(intro()).not.toBeNull();
  expect(document.body.firstElementChild).toBe(intro());
});

test("the owner sees which lane they are in", async () => {
  await bootPage({ slot: "ui-owner-1", owner: true, url: "/notes.html?editmode=true" });
  expect(ownerChip()).not.toBeNull();
  expect(ownerChip().getAttribute("clay")).toBe("editor-ui");
  expect(ownerChip().hasAttribute("sap-ignore")).toBe(true);
  expect(ownerChip().querySelector(".clay-owner__lead").textContent).toBe("You're editing the original. Visitors get these changes.");
  expect(ownerChip().querySelector(".clay-owner__action").textContent).toBe("Back to my draft");

  await bootPage({ slot: "ui-owner-2", owner: true, template: INTRO });
  expect(ownerChip().querySelector(".clay-owner__lead").textContent).toBe("You're seeing a private draft, like a visitor.");
  expect(ownerChip().querySelector(".clay-owner__action").textContent).toBe("Edit the original");

  await bootPage({ slot: "ui-owner-3", template: INTRO });
  expect(ownerChip()).toBeNull();

  await bootPage({ slot: "ui-owner-4", params: "plugins=undo&exclude=richclay,source", owner: true });
  expect(ownerChip()).toBeNull();
});
