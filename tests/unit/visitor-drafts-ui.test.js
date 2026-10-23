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

function setPage({ slot, keepStorage = false, head = "", template = "", ui = null, draft = null, body = "" }) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (slot) root.setAttribute("visitor-drafts", slot);
  document.head.innerHTML = `<script type="application/json" data-rules-name="api" data-rules-version="1">${RULES}</script>` + head;
  document.body.innerHTML = '<h1 id="title">owner title</h1><input id="note" persist value="owner note">' + body + template;
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
  body = "",
} = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", url);
  setPage({ slot, keepStorage, head, template, ui, draft, body });
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

function prompt() {
  return document.querySelector(".hcp");
}

function clickDownload() {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  prompt().querySelector("[data-hcp-link] span").dispatchEvent(event);
  return event;
}

function withDownloadStubs(run) {
  const blobs = [];
  const downloads = [];
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const realClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:clay-test"; };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, download: this.download }); };
  try {
    run();
  } finally {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    HTMLAnchorElement.prototype.click = realClick;
  }
  return { blobs, downloads };
}

function readBlob(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });
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

test("closing the notice keeps a download icon labeled Keep, remembers it, and can reopen the card", async () => {
  const { key, clay } = await bootPage({ slot: "ui-prompt-minimize" });
  const aside = prompt();
  const tab = aside.querySelector("[data-hcp=open]");
  aside.querySelector(".hcp-dock .hcp-x").click();

  expect(aside.hidden).toBe(false);
  expect(aside.getAttribute("data-hcp-state")).toBe("mini");
  expect(tab.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(tab);
  expect(tab.querySelector(".hcp-tab__mini").textContent).toBe("Keep");
  expect(JSON.parse(localStorage.getItem(key)).prompt.shown).toBe(true);
  expect(clay.getHTML()).not.toContain('id="hcp"');

  await bootPage({ slot: "ui-prompt-minimize", keepStorage: true });
  expect(prompt().hidden).toBe(false);
  expect(prompt().getAttribute("data-hcp-state")).toBe("mini");
  prompt().querySelector("[data-hcp=open]").click();
  expect(prompt().getAttribute("data-hcp-state")).toBe("card");
  expect(prompt().querySelector("[data-hcp=open]").getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(prompt().querySelector("[data-hcp-link]"));
  expect(linkHref()).toBe("/_/download/notes.html?as=htmlclay");
  expect(clickDownload().defaultPrevented).toBe(false);
});

test("previously dismissed notices keep a usable icon and storage errors can still open the card", async () => {
  await bootPage({ slot: "ui-prompt-old-dismissal", ui: { v: 1, prompt: { dismissed: true } } });
  expect(prompt().hidden).toBe(false);
  expect(prompt().getAttribute("data-hcp-state")).toBe("mini");
  prompt().querySelector("[data-hcp=open]").click();
  expect(prompt().getAttribute("data-hcp-state")).toBe("card");
  prompt().querySelector(".hcp-card [data-hcp=minimize]").click();
  expect(prompt().getAttribute("data-hcp-state")).toBe("mini");
  document.dispatchEvent(new CustomEvent("clay:drafts-store-failed"));
  expect(prompt().getAttribute("data-hcp-state")).toBe("card");
  expect(prompt().getAttribute("data-hcp-reason")).toBe("error");
});

test("Don't show again stops reminders while preserving the download icon across reloads", async () => {
  const { key } = await bootPage({ slot: "ui-prompt-no-reminders" });
  prompt().querySelector("[data-hcp=open]").click();
  prompt().querySelector(".hcp-quiet[data-hcp=dismiss]").click();
  expect(prompt().hidden).toBe(false);
  expect(prompt().getAttribute("data-hcp-state")).toBe("mini");
  expect(JSON.parse(localStorage.getItem(key)).prompt.dismissed).toBe(true);

  await bootPage({ slot: "ui-prompt-no-reminders", keepStorage: true });
  expect(prompt().hidden).toBe(false);
  expect(prompt().getAttribute("data-hcp-state")).toBe("mini");
  prompt().querySelector("[data-hcp=open]").click();
  expect(prompt().getAttribute("data-hcp-state")).toBe("card");
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
  expect([...document.querySelectorAll("[clay='editor-ui']")].map((el) => el.id)).toEqual(["clay-owner-style", "clay-owner-vars", "clay-owner"]);

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

test("the error card's download carries the live page, not the stale stored draft", async () => {
  const { fetchMock } = await bootPage({ slot: "ui-error-download" });
  const aside = prompt();
  document.dispatchEvent(new CustomEvent("clay:drafts-store-failed", { detail: { error: new Error("full") } }));
  expect(aside.getAttribute("data-hcp-reason")).toBe("error");

  const note = document.getElementById("note");
  note.value = "typed but never stored";
  note.setAttribute("value", "typed but never stored");

  let prevented = null;
  const { blobs, downloads } = withDownloadStubs(() => { prevented = clickDownload().defaultPrevented; });

  expect(prevented).toBe(true);
  expect(downloads).toEqual([{ href: "blob:clay-test", download: "notes.htmlclay" }]);
  expect(blobs).toHaveLength(1);
  expect(blobs[0].type).toBe("text/html");
  expect(await readBlob(blobs[0])).toContain("typed but never stored");
  expect(document.querySelector("a[download]")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the error card names the download after the page, index.htmlclay at the root", async () => {
  await bootPage({ slot: "ui-error-download-root", url: "/" });
  document.dispatchEvent(new CustomEvent("clay:drafts-store-failed", { detail: { error: new Error("full") } }));

  const { downloads } = withDownloadStubs(() => clickDownload());

  expect(downloads).toEqual([{ href: "blob:clay-test", download: "index.htmlclay" }]);
});

test("outside the error state the download link is a plain link to the host", async () => {
  await bootPage({ slot: "ui-link-plain" });
  const href = linkHref();

  const event = clickDownload();

  expect(event.defaultPrevented).toBe(false);
  expect(linkHref()).toBe(href);
  expect(document.querySelector("a[download]")).toBeNull();
});

test("a template puts its own strip at the top of the body with one close button", async () => {
  const { clay } = await bootPage({ slot: "ui-intro-1", template: INTRO });

  const section = intro();
  expect(section).not.toBeNull();
  expect(section.tagName).toBe("SECTION");
  expect(document.body.firstElementChild).toBe(section);
  expect(section.getAttribute("clay")).toBe("editor-ui");
  expect(section.hasAttribute("sap-ignore")).toBe(true);
  expect(section.textContent).toContain("Track your week.");
  expect(section.querySelectorAll(".clay-intro__close").length).toBe(1);

  const html = clay.getHTML();
  expect(html).not.toContain("clay-intro");
  expect(html).not.toContain("hcp");
  expect(html).toContain('<template visitor-intro=""><p>Track your week.</p></template>');
});

test("an empty or whitespace-only template mounts no intro", async () => {
  await bootPage({ slot: "ui-intro-empty", template: "<template visitor-intro></template>" });
  expect(intro()).toBeNull();

  await bootPage({ slot: "ui-intro-blank", template: "<template visitor-intro>   \n  </template>" });
  expect(intro()).toBeNull();
});

test("the close button removes the intro for good and remembers why", async () => {
  const { key } = await bootPage({ slot: "ui-intro-close", template: INTRO });

  intro().querySelector(".clay-intro__close").click();
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)).intro.done).toBe("closed");

  await bootPage({ slot: "ui-intro-close", template: INTRO, keepStorage: true });
  expect(intro()).toBeNull();
});

test("an element marked visitor-intro-dismiss closes the intro the same way", async () => {
  const { key } = await bootPage({
    slot: "ui-intro-dismiss",
    template: '<template visitor-intro><p>Hello.</p><button type="button" visitor-intro-dismiss>No thanks</button></template>',
  });

  intro().querySelector("[visitor-intro-dismiss]").click();
  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)).intro.done).toBe("closed");
});

test("scrolling the intro past the top removes it, and a part-visible one stays", async () => {
  const { key } = await bootPage({ slot: "ui-intro-scroll", template: INTRO });
  const section = intro();
  section.getBoundingClientRect = () => ({ bottom: -1 });
  window.dispatchEvent(new Event("scroll"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  expect(intro()).toBeNull();
  expect(JSON.parse(localStorage.getItem(key)).intro.done).toBe("scrolled");

  await bootPage({ slot: "ui-intro-scroll-kept", template: INTRO });
  const kept = intro();
  kept.getBoundingClientRect = () => ({ bottom: 50 });
  window.dispatchEvent(new Event("scroll"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(intro()).not.toBeNull();
});

test("a page that locks its own scrolling can scroll while the intro is mounted", async () => {
  await bootPage({
    slot: "ui-intro-locked",
    template: INTRO,
    head: "<style>html,body{height:100%}body{overflow:hidden}</style>",
  });

  expect(document.body.firstElementChild).toBe(intro());
  expect(styleText("clay-intro-style")).toContain(
    "html:has(> body > .clay-intro) { height: auto !important; overflow-y: auto !important; }\nbody:has(> .clay-intro) { height: auto !important; overflow: visible !important; }"
  );
});

test("the start link scrolls to the bottom edge of the intro, past a hidden svg", async () => {
  await bootPage({
    slot: "ui-intro-start",
    template: '<template visitor-intro><p>Track your week.</p><a href="#board" visitor-intro-start>Start</a></template>',
    body: "<svg hidden></svg>",
  });
  const section = intro();
  document.getElementById("title").remove();
  document.getElementById("note").remove();
  expect(section.nextElementSibling.tagName).toBe("svg");
  expect(section.nextElementSibling.hasAttribute("hidden")).toBe(true);
  section.getBoundingClientRect = () => ({ bottom: 320, height: 320 });
  const scrollTo = jest.fn();
  window.scrollTo = scrollTo;

  intro().querySelector("[visitor-intro-start]").click();

  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo.mock.calls[0][0]).toEqual({ top: 320, behavior: "smooth" });
  expect(intro()).not.toBeNull();
});

test("the intro stands aside for a returning visitor, a draft and a deep link, and ?intro=1 forces it", async () => {
  await bootPage({ slot: "ui-intro-done", template: INTRO, ui: { v: 1, intro: { done: "closed" } } });
  expect(intro()).toBeNull();

  await bootPage({
    slot: "ui-intro-draft",
    template: INTRO,
    draft: { v: 1, savedAt: "2026-10-15T00:00:00.000Z", data: { title: "draft title", note: "typed note" } },
  });
  expect(intro()).toBeNull();

  await bootPage({ slot: "ui-intro-hash", template: INTRO, url: "/notes.html#card=c1" });
  expect(intro()).toBeNull();

  const original = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query.includes("print"), media: query, addEventListener() {}, removeEventListener() {} });
  try {
    await bootPage({ slot: "ui-intro-print", template: INTRO });
    expect(intro()).toBeNull();
  } finally {
    window.matchMedia = original;
  }

  await bootPage({ slot: "ui-intro-forced", template: INTRO, url: "/notes.html?intro=1", ui: { v: 1, intro: { done: "closed" } } });
  expect(intro()).not.toBeNull();
});

test("no About this app control ever appears, even for a returning visitor", async () => {
  await bootPage({ slot: "ui-intro-no-about", template: INTRO, ui: { v: 1, intro: { done: "closed" } } });

  expect(intro()).toBeNull();
  expect(about()).toBeNull();
  expect(document.getElementById("clay-intro-style")?.textContent || "").not.toContain(".clay-about");
});

test("the download card has no sign-up form, no HTML Clay paragraph and no Not now, and keeps Don't show again", async () => {
  await bootPage({ slot: "kanban-v1", template: INTRO, url: "/kanban.html?src=bsky" });
  const card = prompt().querySelector(".hcp-card");

  expect(card.querySelector("form, input")).toBeNull();
  expect(card.textContent).not.toContain("HTML Clay");
  expect(card.textContent).not.toContain("Not now");
  expect(card.querySelector(".hcp-foot [data-hcp=dismiss]").textContent).toBe("Don\u2019t show again");
});

test("the card's minimize button is a boxed minus and the download controls use bevel's download icon", async () => {
  await bootPage({ slot: "ui-icons" });

  const minimize = prompt().querySelector('.hcp-card .hcp-x[data-hcp="minimize"]');
  expect(minimize.querySelector("path").getAttribute("d")).toBe("M5 12h14");

  const download = "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V32a8,8,0,0,0-16,0v92.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z";
  expect(prompt().querySelector("[data-hcp-link] svg path").getAttribute("d")).toBe(download);
  expect(prompt().querySelector(".hcp-tab svg path").getAttribute("d")).toBe(download);
  expect(prompt().querySelector(".hcp-file svg path").getAttribute("d")).toBe(download);
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
