import { jest } from "@jest/globals";
import { applyHead } from "../../src/plugins/menu/seo-head.js";

// Scenario: "SEO settings…" in claygoo slides a sheet down from the top that edits
// the document's head fields and writes them only on Apply. Opening and cancelling
// write nothing, and nothing of the sheet ever reaches the saved file. Every case
// boots through the real loader, because that is where the menu item, `clay.undo`,
// `clay.unsent` and `clay.getHTML` come from.

const SLOT = "/notes.html";
const HEAD = '<title>Start title</title><meta name="description" content="Start description">';
const BODY = '<div id="content">start</div>';
const DOCUMENT_BODY = '<article data-page><h1>Heading title</h1><p>start</p></article>';
const REOPEN_KEY = "clay:doc:/notes.html:reopen-seo";

const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

function response({ ok = true, status = 200, body = "", headers = {} } = {}) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body || "{}"),
  };
}

async function boot({
  edit = true,
  plugins = "menu,undo",
  upload = null,
  extensions = ["upload"],
  robots = null,
  reopen = false,
  body = BODY,
} = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  if (reopen) sessionStorage.setItem(REOPEN_KEY, "true");
  document.head.innerHTML = HEAD;
  document.body.innerHTML = body;
  window.fetch = async (input, options = {}) => {
    const method = (options && options.method) || "GET";
    if (method === "HEAD") return response({ headers: { "x-robots-tag": robots } });
    if (String(input).includes("/_/meta")) {
      return response({ body: JSON.stringify({ spec: 1, extensions, document: { upload: { maxBytes: 10000000 } } }) });
    }
    return response({ ok: false, status: 404 });
  };
  window.clay = {};
  if (upload) window.clay.upload = upload;
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await settle();
}

const sheetRoot = () => document.querySelector(".clay-seo");
const fieldOf = (key) => document.querySelector(`.clay-seo [data-key="${key}"]`);
const fieldWrap = (key) => fieldOf(key).closest(".clay-seo-field");
const buttonOf = (name) => document.querySelector(`.clay-seo-${name}`);

function setValue(key, value) {
  const input = fieldOf(key);
  if (input.type === "checkbox") input.checked = value;
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function openSheet() {
  document.querySelector(".clay-menu-goo").click();
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((button) => button.dataset.menuId === "seo");
  expect(item).toBeDefined();
  item.click();
  await settle();
}

test("the menu carries the SEO item, and opening then cancelling writes nothing", async () => {
  await boot();
  const before = window.clay.getHTML();

  await openSheet();

  const root = sheetRoot();
  expect(root).not.toBeNull();
  expect(root.getAttribute("clay")).toBe("editor-ui");
  expect(root.getAttribute("role")).toBe("region");
  expect(root.getAttribute("aria-labelledby")).toBe("clay-seo-heading");
  expect(document.getElementById("clay-seo-heading").textContent).toBe("SEO and social sharing");
  expect(document.getElementById("clay-seo-style").getAttribute("clay")).toBe("editor-ui");
  expect(document.activeElement).toBe(fieldOf("title"));
  expect(fieldOf("description").value).toBe("Start description");

  buttonOf("cancel").click();

  expect(sheetRoot()).toBeNull();
  expect(window.clay.getHTML()).toBe(before);
});

test("Apply writes only the changed fields as one undo step", async () => {
  await boot();
  await openSheet();
  const entries = window.clay.undo.history.length;

  setValue("description", "A new description");
  buttonOf("apply").click();
  await settle();

  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("A new description");
  expect(document.querySelector("title").textContent).toBe("Start title");
  expect(sheetRoot()).toBeNull();
  expect(window.clay.undo.history.length).toBe(entries + 1);
  expect(window.clay.undo.history.at(-1).label).toBe("SEO settings");
  expect(window.clay.getHTML()).toContain("A new description");
});

test("an invalid URL blocks Apply and the head keeps its own values", async () => {
  await boot();
  const before = window.clay.getHTML();
  await openSheet();

  setValue("canonical", "javascript:alert(1)");
  buttonOf("apply").click();
  await settle();

  expect(sheetRoot()).not.toBeNull();
  const error = fieldWrap("canonical").querySelector(".clay-seo-error");
  expect(error.hidden).toBe(false);
  expect(error.textContent).toContain("http:");
  expect(window.clay.getHTML()).toBe(before);

  setValue("canonical", "http://localhost/notes.html");
  buttonOf("apply").click();
  await settle();
  expect(sheetRoot()).not.toBeNull();
  expect(fieldWrap("canonical").querySelector(".clay-seo-error").textContent).toContain("localhost");
  expect(window.clay.getHTML()).toBe(before);
});

test("view mode is read-only, and the Edit button asks for edit mode and sets the reopen flag", async () => {
  await boot({ edit: false });
  await openSheet();

  expect(fieldOf("title").readOnly).toBe(true);
  expect(fieldOf("index").disabled).toBe(true);
  expect(buttonOf("apply").hidden).toBe(false);
  expect(buttonOf("cancel").hidden).toBe(true);

  setValue("title", "A write that must not happen");
  buttonOf("apply").click();
  await settle();

  expect(sheetRoot()).toBeNull();
  expect(document.querySelector("title").textContent).toBe("Start title");
  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("Start description");

  await openSheet();
  const editButton = buttonOf("edit");
  expect(editButton.hidden).toBe(false);
  expect(editButton.textContent).toBe("Edit these settings");

  const setMode = jest.spyOn(window.clay, "setMode").mockResolvedValue({ ok: true, mode: "edit", changed: true, reloading: true });
  editButton.click();
  await settle();

  expect(setMode).toHaveBeenCalledTimes(1);
  expect(setMode).toHaveBeenCalledWith("edit");
  expect(window.clay.storage.session.get("reopen-seo")).toBe(true);
});

test("a reload that asked to reopen the sheet brings it back once and clears the flag", async () => {
  await boot({ reopen: true, edit: false });

  expect(sheetRoot()).not.toBeNull();
  expect(window.clay.storage.session.get("reopen-seo")).toBeUndefined();
});

test("a peer change to the same field shows the conflict choice and Apply waits for it", async () => {
  await boot();
  await openSheet();

  setValue("description", "mine");
  applyHead(document, { description: "theirs" });
  buttonOf("apply").click();
  await settle();

  expect(sheetRoot()).not.toBeNull();
  const conflict = fieldWrap("description").querySelector(".clay-seo-conflict");
  expect(conflict.hidden).toBe(false);
  expect(conflict.textContent).toContain("Changed elsewhere: theirs");
  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("theirs");

  conflict.querySelector(".clay-seo-mine-button").click();
  buttonOf("apply").click();
  await settle();

  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("mine");
  expect(sheetRoot()).toBeNull();
});

test("an upload that resolves after the sheet closed writes nothing", async () => {
  let resolveUpload;
  const upload = jest.fn(() => new Promise((resolve) => { resolveUpload = resolve; }));
  await boot({ upload });
  const before = window.clay.getHTML();
  await openSheet();

  const uploadButton = buttonOf("upload-button");
  expect(uploadButton.hidden).toBe(false);
  const fileInput = document.querySelector(".clay-seo-file");
  Object.defineProperty(fileInput, "files", { value: [new File(["x"], "shot.png", { type: "image/png" })], configurable: true });
  fileInput.dispatchEvent(new Event("change"));
  await settle();
  expect(upload).toHaveBeenCalledTimes(1);

  buttonOf("cancel").click();
  resolveUpload({ ok: true, uploads: [{ url: "https://cdn.example.com/shot.png" }] });
  await settle();

  expect(sheetRoot()).toBeNull();
  expect(window.clay.getHTML()).toBe(before);
  expect(document.querySelector('meta[property="og:image"]')).toBeNull();
});

test("nothing of the sheet reaches clay.getHTML(), and fields go unsent when the plugin is loaded", async () => {
  await boot({ plugins: "menu,undo,unsent" });
  await openSheet();

  expect(fieldOf("title").getAttribute("unsent")).toBe("seo-title");
  expect(fieldOf("description").getAttribute("unsent")).toBe("seo-description");
  setValue("title", "Typed but not applied");

  const html = window.clay.getHTML();

  expect(html).not.toContain("clay-seo");
  expect(html).not.toContain("SEO settings");
  expect(html).not.toContain("seo-title");
  expect(html).toContain("<title>Start title</title>");
});

test("the hosted robots note appears when a HEAD of the page says noindex", async () => {
  await boot({ robots: "noindex, nofollow" });
  await openSheet();

  const note = [...document.querySelectorAll(".clay-seo-note")].find((el) => !el.hidden && el.textContent.includes("hidden from search engines"));
  expect(note).toBeDefined();
});

test("a Document's title change writes the marker in the same undo step", async () => {
  await boot({ body: DOCUMENT_BODY });
  await openSheet();
  const entries = window.clay.undo.history.length;

  setValue("title", "The person's title");
  buttonOf("apply").click();
  await settle();

  expect(document.querySelector("title").textContent).toBe("The person's title");
  const marker = document.querySelector('meta[name="clay-seo-title-mode"]');
  expect(marker).not.toBeNull();
  expect(marker.getAttribute("content")).toBe("custom");
  expect(window.clay.undo.history.length).toBe(entries + 1);
  expect(window.clay.undo.history.at(-1).label).toBe("SEO settings");
  expect(window.clay.getHTML()).toContain("clay-seo-title-mode");
});

test("the first-heading link shows only with the marker and Apply takes the title back", async () => {
  await boot({ body: DOCUMENT_BODY });
  await openSheet();
  const link = () => document.querySelector(".clay-seo-derived");
  expect(link()).not.toBeNull();
  expect(link().hidden).toBe(true);

  buttonOf("cancel").click();
  applyHead(document, { title: "The person's title", titleMode: "custom" });
  await openSheet();

  expect(link().hidden).toBe(false);
  expect(link().textContent).toBe("Use the first heading");
  link().click();
  await settle();

  expect(fieldOf("title").value).toBe("Heading title");
  expect(document.querySelector("title").textContent).toBe("The person's title");

  buttonOf("apply").click();
  await settle();

  expect(document.querySelector("title").textContent).toBe("Heading title");
  expect(document.querySelector('meta[name="clay-seo-title-mode"]')).toBeNull();
});

test("a page that is not a Document gets no marker and no first-heading link", async () => {
  await boot();
  await openSheet();

  expect(document.querySelector(".clay-seo-derived").hidden).toBe(true);

  setValue("title", "The person's title");
  buttonOf("apply").click();
  await settle();

  expect(document.querySelector("title").textContent).toBe("The person's title");
  expect(document.querySelector('meta[name="clay-seo-title-mode"]')).toBeNull();
});

const undoButton = () =>
  [...document.querySelectorAll("[data-clay-toast]")]
    .flatMap((toast) => [...toast.querySelectorAll("button")])
    .find((button) => button.textContent.trim() === "Undo");

test("without clay.undo Apply offers an Undo toast that puts the head back and saves", async () => {
  await boot({ plugins: "menu" });
  expect(window.clay.undo?.commit).toBeUndefined();
  expect(window.clay.toastPersistent).toBeUndefined();
  await openSheet();

  setValue("title", "A new title");
  setValue("description", "A new description");
  setValue("ogTitle", "A new card title");
  buttonOf("apply").click();
  await settle();

  expect(document.querySelector("title").textContent).toBe("A new title");
  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("A new description");
  expect(document.querySelector('meta[property="og:title"]').getAttribute("content")).toBe("A new card title");
  const toast = document.querySelector('[data-clay-toast="success"]');
  expect(toast).not.toBeNull();
  expect(toast.textContent).toContain("SEO settings applied");
  const undo = undoButton();
  expect(undo).toBeDefined();

  const saves = [];
  const save = window.clay.save;
  window.clay.save = (...args) => { saves.push(args); return save(...args); };

  undo.click();
  await settle();

  expect(document.querySelector("title").textContent).toBe("Start title");
  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("Start description");
  expect(document.querySelector('meta[property="og:title"]')).toBeNull();
  expect(saves).toHaveLength(1);
});

test("with clay.undo Apply goes through commit and offers no Undo toast", async () => {
  await boot({ plugins: "menu" });
  const commit = jest.fn((label, fn) => fn());
  window.clay.undo = { commit };
  window.clay.toastPersistent = jest.fn();
  await openSheet();

  setValue("description", "A new description");
  buttonOf("apply").click();
  await settle();

  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0]).toBe("SEO settings");
  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("A new description");
  expect(document.querySelector("[data-clay-toast]")).toBeNull();
  expect(window.clay.toastPersistent).not.toHaveBeenCalled();
});
