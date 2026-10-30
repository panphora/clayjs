import { jest } from "@jest/globals";
import { $, active } from "./helpers/editor-ui.js";

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

const listOf = () => $(".clay-menu-list", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const buttonOf = (id) => $(`[role="menuitem"][data-menu-id="${id}"]`, "menu");
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
  expect(indexOf("clay.versions")).toBeGreaterThan(indexOf("clay.download"));
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
  key(active(), "ArrowUp");
  expect(active()).not.toBe(code);
  key(active(), "ArrowDown");
  expect(active()).toBe(code);
  expect(active().tagName).toBe("A");
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

  expect(actions).toEqual({ duplicate: { href: new URL("/_/copy/ok.html", location.origin).href } });
});

test("hostActions() keeps a same-origin post and drops one elsewhere", async () => {
  jest.resetModules();
  const meta = metaDocument({
    actions: {
      reveal: { post: "/_/reveal/tok" },
      export: { post: "https://elsewhere.example/_/export" },
      versions: { post: "javascript:void 0" },
    },
  });
  window.fetch = metaFetch(meta);

  const { hostActions } = await import("../../src/core/host-meta.js");
  const actions = await hostActions();

  expect(actions).toEqual({ reveal: { post: new URL("/_/reveal/tok", location.origin).href } });
});

test("a host action the host does itself is a button that posts, opens what it answers, and says why it could not", async () => {
  const meta = metaDocument({
    actions: {
      reveal: { post: "/_/reveal/tok" },
      duplicate: { post: "/_/duplicate/tok" },
      export: { post: "/_/export/tok" },
    },
  });
  await boot({ meta });
  const posts = [];
  window.fetch = jest.fn(async (url, options = {}) => {
    const href = fetchSomewhere(url);
    if (href.includes("/_/meta")) return metaResponse(meta);
    if (options.method === "POST") {
      posts.push({ href, documentUrl: options.headers?.["Document-URL"] });
      if (href.endsWith("/_/duplicate/tok")) return metaResponse({ ok: true, href: "http://localhost/notes-copy.html" });
      if (href.endsWith("/_/export/tok")) return { ...metaResponse({ ok: false, message: "The Downloads folder is missing." }), ok: false, status: 500 };
      return metaResponse({ ok: true });
    }
    return notFound();
  });
  const opened = jest.spyOn(window, "open").mockImplementation(() => null);

  gooOf().click();
  for (const id of ["clay.reveal", "clay.duplicate", "clay.export"]) {
    expect(buttonOf(id)).not.toBeNull();
    expect(buttonOf(id).tagName).toBe("BUTTON");
  }
  expect(indexOf("clay.download")).toBeLessThan(indexOf("clay.export"));
  expect(indexOf("clay.export")).toBeLessThan(indexOf("clay.reveal"));

  buttonOf("clay.reveal").click();
  await flush();
  expect(posts.at(-1)).toEqual({ href: new URL("/_/reveal/tok", location.origin).href, documentUrl: location.href });

  gooOf().click();
  buttonOf("clay.duplicate").click();
  await flush();
  expect(opened).toHaveBeenCalledWith("http://localhost/notes-copy.html", "_blank", "noopener");

  gooOf().click();
  buttonOf("clay.export").click();
  await flush();
  expect($(".clay-menu-note", "menu").textContent).toBe("The Downloads folder is missing.");
  opened.mockRestore();
});
