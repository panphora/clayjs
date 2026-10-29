import { jest } from "@jest/globals";

// Scenario: the host names the pages a person may open for this document in the
// `document.actions` block of `GET /_/meta`. The menu shows each one as a link that
// opens in a new tab, in the section where it belongs, and offers nothing the host
// did not name. Only http(s) URLs survive discovery.

const SLOT = "/notes.html";
const BODY = '<div id="content">start</div>';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

const notFound = () => ({
  ok: false,
  status: 404,
  statusText: "Not Found",
  headers: { get: () => null },
  text: async () => "",
  json: async () => ({}),
});

function metaResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const metaDocument = (documentBlock) => ({ spec: 2, extensions: [], document: documentBlock });

const fetchSomewhere = (url) => (typeof url === "string" ? url : String((url && url.href) || url));

// `meta` is the whole discovery body; a falsy one is a 404 for every route.
function metaFetch(meta) {
  return jest.fn(async (url, options) => {
    const href = fetchSomewhere(url);
    if (meta && href.includes("/_/meta")) return metaResponse(meta);
    return notFound();
  });
}

async function boot({ meta = null, plugins = "menu", edit = false } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  clearRoot();
  window.history.replaceState({}, "", edit ? `${SLOT}?editmode=true` : SLOT);
  document.head.innerHTML = "";
  document.body.innerHTML = BODY;
  window.fetch = metaFetch(meta);
  window.clay = {};
  const params = new URLSearchParams(`plugins=${plugins}&exclude=richclay,source`);
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, params, resolve));
  await flush();
  await flush();
}

const listOf = () => document.querySelector(".clay-menu-list");
const gooOf = () => document.querySelector(".clay-menu-goo");
const buttonOf = (id) => document.querySelector(`[role="menuitem"][data-menu-id="${id}"]`);
const ids = () => [...listOf().querySelectorAll('[role="menuitem"]')].map((el) => el.dataset.menuId);
const indexOf = (id) => ids().indexOf(id);

function key(el, name) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

const ALL_ACTIONS = {
  codeEditor: { href: "/_/edit/notes.html" },
  versions: { href: "/_/versions/notes.html" },
  duplicate: { href: "/_/copy/notes.html" },
};

test("all three host links render as new-tab anchors in their sections", async () => {
  await boot({ meta: metaDocument({ actions: ALL_ACTIONS }) });

  const code = buttonOf("clay.code");
  const duplicate = buttonOf("clay.duplicate");
  const versions = buttonOf("clay.versions");

  for (const link of [code, duplicate, versions]) {
    expect(link).not.toBeNull();
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("role")).toBe("menuitem");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  }

  expect(code.getAttribute("href")).toBe(new URL("/_/edit/notes.html", location.origin).href);
  expect(duplicate.getAttribute("href")).toBe(new URL("/_/copy/notes.html", location.origin).href);
  expect(versions.getAttribute("href")).toBe(new URL("/_/versions/notes.html", location.origin).href);

  expect(code.textContent).toBe("Open the code editor");
  expect(duplicate.textContent).toBe("Duplicate as a new page");
  expect(versions.textContent).toBe("Version history\u2026");

  expect(indexOf("clay.code")).toBeGreaterThan(-1);
  expect(indexOf("clay.code")).toBeLessThan(indexOf("seo"));
  expect(indexOf("clay.duplicate")).toBe(indexOf("clay.download") - 1);
  expect(indexOf("clay.versions")).toBe(indexOf("clay.hide") - 1);
});

test("only the actions the host named appear", async () => {
  await boot({ meta: metaDocument({ actions: { duplicate: { href: "/_/copy/x.html" } } }) });

  expect(buttonOf("clay.duplicate")).not.toBeNull();
  expect(buttonOf("clay.code")).toBeNull();
  expect(buttonOf("clay.versions")).toBeNull();
});

test("no actions block and a 404 both mean no links", async () => {
  await boot({ meta: metaDocument({}) });
  expect(buttonOf("clay.code")).toBeNull();
  expect(buttonOf("clay.duplicate")).toBeNull();
  expect(buttonOf("clay.versions")).toBeNull();
  expect(listOf()).not.toBeNull();

  await boot();
  expect(buttonOf("clay.code")).toBeNull();
  expect(buttonOf("clay.duplicate")).toBeNull();
  expect(buttonOf("clay.versions")).toBeNull();
  expect(listOf()).not.toBeNull();
});

test("unsafe or malformed hrefs are dropped", async () => {
  await boot({
    meta: metaDocument({
      actions: {
        codeEditor: { href: "javascript:alert(1)" },
        versions: { href: 42 },
        duplicate: { href: "data:text/html,x" },
      },
    }),
  });

  expect(buttonOf("clay.code")).toBeNull();
  expect(buttonOf("clay.versions")).toBeNull();
  expect(buttonOf("clay.duplicate")).toBeNull();
});

test("an absolute cross-origin https href is kept exactly", async () => {
  const href = "https://hyperclay.com/_/dashboard/site/9/versions";
  await boot({ meta: metaDocument({ actions: { versions: { href } } }) });

  const versions = buttonOf("clay.versions");
  expect(versions).not.toBeNull();
  expect(versions.getAttribute("href")).toBe(href);
});

test("the code editor link is reachable from the keyboard", async () => {
  await boot({ meta: metaDocument({ actions: ALL_ACTIONS }) });

  const goo = gooOf();
  goo.focus();
  key(goo, "Enter");
  expect(listOf().hidden).toBe(false);

  const code = buttonOf("clay.code");
  key(document.activeElement, "ArrowUp");
  expect(document.activeElement).not.toBe(code);
  key(document.activeElement, "ArrowDown");
  expect(document.activeElement).toBe(code);
  expect(document.activeElement.tagName).toBe("A");
});

test("hostActions() keeps only the valid hrefs", async () => {
  jest.resetModules();
  const meta = metaDocument({
    actions: {
      codeEditor: { href: "javascript:alert(1)" },
      versions: { href: 42 },
      duplicate: { href: "/_/copy/ok.html" },
    },
  });
  window.fetch = metaFetch(meta);

  const { hostActions } = await import("../../src/core/host-meta.js");
  const actions = await hostActions();

  expect(actions).toEqual({ duplicate: new URL("/_/copy/ok.html", location.origin).href });
});
