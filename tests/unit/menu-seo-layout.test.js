import { jest } from "@jest/globals";
import { applyHead } from "../../src/plugins/menu/seo-head.js";
import postcss from "postcss";

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

// Scenario: the panel is a full-width region at the top of the body that pushes the page
// down, with its fields in two columns, a More disclosure, character counters and a link
// preview card beside them. These cases pin that layout and the things it moved.

test("the panel is a full-width region at the top of the body", async () => {
  await boot();
  await openSheet();

  expect(document.body.firstElementChild).toBe(sheetRoot());
  expect(document.getElementById("clay-seo-style").textContent).not.toContain("position: fixed");
});

test("the fields sit in the approved order, with the rest inside More", async () => {
  await boot();
  await openSheet();

  const form = document.querySelector(".clay-seo-fields");
  const more = document.querySelector("details.clay-seo-more");
  const keys = (scope) => [...scope.querySelectorAll("[data-key]")].map((el) => el.dataset.key);

  expect(keys(form).filter((key) => !more.contains(fieldOf(key)))).toEqual([
    "title",
    "description",
    "ogTitle",
    "ogDescription",
    "ogImage",
  ]);
  expect(keys(more)).toEqual(["canonical", "lang", "ogImageAlt", "siteName", "twitterSite", "index", "follow"]);
});

test("the title counter reads the trimmed length and marks overflow", async () => {
  await boot();
  await openSheet();
  const count = () => fieldWrap("title").querySelector(".clay-seo-count");

  setValue("title", "x".repeat(61));
  expect(count().textContent).toBe("61 / 60");
  expect(count().hasAttribute("data-over")).toBe(true);

  setValue("title", "x".repeat(10));
  expect(count().textContent).toBe("10 / 60");
  expect(count().hasAttribute("data-over")).toBe(false);
});

test("a problem in a field inside More opens the disclosure", async () => {
  await boot();
  await openSheet();
  const more = document.querySelector("details.clay-seo-more");

  expect(more.open).toBe(false);
  setValue("canonical", "http://localhost/x");
  buttonOf("apply").click();
  await settle();

  expect(more.open).toBe(true);
  const error = fieldWrap("canonical").querySelector(".clay-seo-error");
  expect(error.hidden).toBe(false);
});

test("the panel publishes its height while it is open", async () => {
  await boot();
  await openSheet();

  const vars = document.getElementById("clay-seo-vars");
  expect(vars).not.toBeNull();
  expect(vars.getAttribute("clay")).toBe("editor-ui");
  expect(vars.textContent).toContain("--clay-seo-height");

  buttonOf("cancel").click();

  expect(document.getElementById("clay-seo-vars")).toBeNull();
});

test("Escape closes the panel and gives focus back", async () => {
  await boot();
  const opener = document.createElement("button");
  opener.textContent = "opener";
  document.body.append(opener);
  opener.focus();

  await openSheet();
  expect(document.activeElement).toBe(fieldOf("title"));

  fieldOf("title").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await settle();

  expect(sheetRoot()).toBeNull();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

test("Tab is not trapped in the panel", async () => {
  await boot();
  await openSheet();

  const done = buttonOf("apply");
  done.focus();
  const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  done.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(false);
});

test("the link preview follows the image", async () => {
  await boot();
  await openSheet();
  const image = () => document.querySelector(".clay-og-image");
  const head = () => document.querySelector(".clay-seo-preview-head span");

  expect(image().hidden).toBe(true);
  expect(head().textContent).toBe("Summary card");

  setValue("ogImage", "https://example.com/a.png");
  expect(image().hidden).toBe(false);
  expect(head().textContent).toBe("Large image card \u00b7 1.91:1");

  setValue("ogImage", "");
  expect(image().hidden).toBe(true);
  expect(head().textContent).toBe("Summary card");
});

const styleCss = (id) => document.getElementById(id).textContent;
const styleRoot = (id) => postcss.parse(styleCss(id));
const ruleFor = (root, selector) =>
  root.nodes.find((node) => node.type === "rule" && node.selector === selector);
const declOf = (rule, prop) =>
  rule.nodes.find((node) => node.type === "decl" && node.prop === prop);

test("a multiline preview description survives opening and Done", async () => {
  await boot();
  document.head.insertAdjacentHTML(
    "beforeend",
    '<meta property="og:description" content="First line&#10;Second line">',
  );
  await openSheet();

  const field = fieldOf("ogDescription");
  expect(field.tagName).toBe("TEXTAREA");
  expect(field.value).toBe("First line\nSecond line");

  buttonOf("apply").click();
  await settle();

  expect(sheetRoot()).toBeNull();
  const meta = document.querySelector('meta[property="og:description"]');
  expect(meta.getAttribute("content")).toBe("First line\nSecond line");
});

test("the panel's stylesheet parses and the image rule is not inside the container query", async () => {
  await boot();
  await openSheet();

  const rule = ruleFor(styleRoot("clay-seo-style"), ".clay-og-image img");
  expect(rule).toBeDefined();
  expect(rule.parent.type).toBe("root");
});

test("the menu stylesheet hides the panel's hidden controls", async () => {
  await boot();
  await openSheet();

  const rule = postcss
    .parse(styleCss("clay-menu-style"))
    .nodes.find((node) => node.type === "rule" && node.selectors.includes(".clay-seo [hidden]"));
  expect(rule).toBeDefined();
  const display = declOf(rule, "display");
  expect(display.value).toBe("none");
  expect(display.important).toBe(true);
});

test("the panel sits above the dock and scrolls when tall", async () => {
  await boot();
  await openSheet();

  const rule = ruleFor(styleRoot("clay-seo-style"), ".clay-seo");
  expect(Number(declOf(rule, "z-index").value)).toBeGreaterThan(2147482000);
  expect(declOf(rule, "overflow-y").value).toBe("auto");
  expect(declOf(rule, "max-height")).toBeDefined();
});
