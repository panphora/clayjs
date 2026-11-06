import { jest } from "@jest/globals";
import { hostOf, $, $$ } from "./helpers/editor-ui.js";

// Scenario: a draft visitor with no account gets the same claygoo menu an owner sees,
// in the document's slot, holding only "Download a copy" and whatever the document adds.
// It makes no host request and loads no owner code, and its download flushes the draft
// first so the file it gives holds the latest text.

const SLOT = "/notes.html";
const RULES =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const BODY = '<div id="slot"><div clay-menu-slot></div></div><h1 id="title">start</h1>';
const NO_SLOT_BODY = '<h1 id="title">start</h1>';

const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function clearRoot() {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
}

async function boot({ draft = true, body = BODY, params } = {}) {
  jest.resetModules();
  sessionStorage.clear();
  localStorage.clear();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  clearRoot();
  if (draft) document.documentElement.setAttribute("visitor-drafts", "draft-slot-1");
  window.history.replaceState({}, "", SLOT);
  document.head.innerHTML = draft ? RULES : "";
  document.body.innerHTML = body;
  const fetchMock = jest.fn(async () => ({
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: { get: () => null },
    text: async () => "",
    json: async () => ({}),
  }));
  window.fetch = fetchMock;
  window.clay = {};
  const named =
    params ??
    (draft ? "plugins=visitor-drafts,visitor-menu&exclude=richclay,source" : "plugins=visitor-menu&exclude=richclay,source");
  const ready = [];
  document.addEventListener("clay:menu-ready", () => ready.push(true));
  const { boot: run } = await import("../../src/loader.js");
  await new Promise((resolve) => run(null, new URLSearchParams(named), resolve));
  await flush();
  return { fetchMock, ready };
}

const listOf = () => $(".clay-menu-list", "menu");
const gooOf = () => $(".clay-menu-goo", "menu");
const itemIds = () => $$("[data-menu-id]", "menu").map((el) => el.dataset.menuId);

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

test("mounts inside the document's slot and hands the page clay.menu and clay:menu-ready", async () => {
  const { ready } = await boot();

  const host = hostOf("menu");
  expect(host).not.toBeNull();
  expect(host.parentElement.hasAttribute("clay-menu-slot")).toBe(true);
  expect(window.clay.menu.embedded).toBe(true);
  expect(ready.length).toBe(1);
  expect(typeof window.clay.menu.addItem).toBe("function");
  expect(typeof window.clay.menu.removeItem).toBe("function");
  expect(window.clay.menu.button).toBe(gooOf());
});

test("makes no host request", async () => {
  const { fetchMock } = await boot();

  expect(hostOf("menu")).not.toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/_/"))).toEqual([]);
});

test("mounts on the body when the document has no slot", async () => {
  await boot({ body: NO_SLOT_BODY });

  const host = hostOf("menu");
  expect(host).not.toBeNull();
  expect(host.parentElement).toBe(document.body);
  expect(window.clay.menu.embedded).toBe(false);
});

test("mounts nothing outside a draft", async () => {
  await boot({ draft: false });

  expect(window.clay.isDraftMode).toBe(false);
  await import("../../src/plugins/visitor-menu.js");
  await flush();

  expect(hostOf("menu")).toBeNull();
  expect(window.clay.menu).toBeUndefined();
});

test("the list holds Download a copy and nothing the owner menu carries", async () => {
  await boot();

  click(gooOf());
  expect(listOf().hidden).toBe(false);

  expect(itemIds()).toEqual(["clay.download"]);
  for (const id of ["clay.mode", "seo", "clay.people", "clay.versions", "clay.variants.keep"]) {
    expect(listOf().querySelector(`[data-menu-id="${id}"]`)).toBeNull();
  }
});

test("with storage refusing, the download flushes first and gives a file with the latest text", async () => {
  const { ready } = await boot();
  expect(ready.length).toBe(1);

  const title = document.getElementById("title");
  title.textContent = "text typed just now";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();

  const realSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function () {
    throw new Error("QuotaExceededError");
  };
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const blobs = [];
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return "blob:clay-test";
  };
  URL.revokeObjectURL = () => {};

  const order = [];
  const clicked = [];
  const onStoreFailed = () => order.push("store-failed");
  // The prompt's own handler runs on its shadow root, so this listener is on the
  // bubble phase: by the time it sees the link click, the prompt has had its say.
  const onClick = (event) => {
    const target = event.composedPath()[0];
    const link = target && target.closest ? target.closest("a") : null;
    if (!link) return;
    order.push("link-click");
    clicked.push({ href: link.getAttribute("href") || "", prevented: event.defaultPrevented });
    event.preventDefault();
  };
  document.addEventListener("clay:drafts-store-failed", onStoreFailed);
  document.addEventListener("click", onClick);

  try {
    click(gooOf());
    click(listOf().querySelector('[data-menu-id="clay.download"]'));
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order[0]).toBe("store-failed");
    expect(order).toContain("link-click");
    expect(order.indexOf("store-failed")).toBeLessThan(order.indexOf("link-click"));

    const prompt = hostOf("download-prompt").shadowRoot.getElementById("hcp");
    expect(prompt.getAttribute("data-hcp-reason")).toBe("error");

    const record = clicked.find((entry) => entry.href.includes("/_/download"));
    expect(record).toBeDefined();
    expect(record.prevented).toBe(true);

    expect(clicked.some((entry) => entry.href.startsWith("blob:"))).toBe(true);
    expect(blobs.length).toBe(1);
    const file = await readBlob(blobs[0]);
    expect(file).toContain("text typed just now");
  } finally {
    document.removeEventListener("clay:drafts-store-failed", onStoreFailed);
    document.removeEventListener("click", onClick);
    Storage.prototype.setItem = realSetItem;
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
  }
});
