import { jest } from "@jest/globals";
import { draftKey } from "../../src/plugins/visitor-drafts/store.js";

const API_TAG = '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';
const BASE_PARAMS = "plugins=visitor-drafts&exclude=richclay,source";

function clearCookies() {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
}

function setOwnerCookie() {
  document.cookie = "isAdminOfCurrentResource=true; path=/";
}

function setPage({ slot, apiTag = true, api = null, attrs = {} } = {}) {
  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  if (slot !== undefined) root.setAttribute("visitor-drafts", slot);
  for (const [name, value] of Object.entries(attrs)) root.setAttribute(name, value);
  document.head.innerHTML = api ?? (apiTag ? API_TAG : "");
  document.body.innerHTML = '<div id="content">start</div>';
}

async function bootPage({
  params = BASE_PARAMS,
  slot = "draft-slot-1",
  apiTag = true,
  api = null,
  attrs = {},
  owner = false,
  url = "/notes.html",
} = {}) {
  jest.resetModules();
  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  clearCookies();
  if (owner) setOwnerCookie();
  window.history.replaceState({}, "", url);
  setPage({ slot, apiTag, api, attrs });
  window.clay = {};
  const fetchMock = jest.fn(async () => new Response("", { status: 404 }));
  window.fetch = fetchMock;
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams(params), resolve));
  return { clay: window.clay, fetchMock };
}

test("a page that opts in puts an ordinary visitor in draft mode", async () => {
  const { clay } = await bootPage();

  expect(clay.isEditMode).toBe(true);
  expect(clay.isDraftMode).toBe(true);
  expect(clay.isOwner).toBe(false);
  expect(clay.visitorDrafts.active).toBe(true);
  expect(document.documentElement.getAttribute("editmode")).toBe("true");
  expect(document.documentElement.getAttribute("draftmode")).toBe("true");
});

test("the owner cookie does not take a visitor-drafts page out of draft mode", async () => {
  const { clay } = await bootPage({ owner: true });

  expect(clay.isOwner).toBe(true);
  expect(clay.isEditMode).toBe(true);
  expect(clay.isDraftMode).toBe(true);
});

test("?editmode=true without the owner cookie stays in draft mode", async () => {
  const { clay } = await bootPage({ url: "/notes.html?editmode=true" });

  expect(clay.isDraftMode).toBe(true);
  expect(clay.isEditMode).toBe(true);
});

test("?editmode=true with the owner cookie is edit mode, not draft", async () => {
  const { clay } = await bootPage({ url: "/notes.html?editmode=true", owner: true });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(true);
  expect(clay.visitorDrafts.active).toBe(false);
});

test("?editmode=false is view mode, not draft", async () => {
  const visitor = await bootPage({ url: "/notes.html?editmode=false" });
  expect(visitor.clay.isDraftMode).toBe(false);
  expect(visitor.clay.isEditMode).toBe(false);

  const owner = await bootPage({ url: "/notes.html?editmode=false", owner: true });
  expect(owner.clay.isDraftMode).toBe(false);
  expect(owner.clay.isEditMode).toBe(false);
});

test("a save token on the root outranks draft mode", async () => {
  const { clay } = await bootPage({ attrs: { savetoken: "t" } });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(false);
});

test("a page that does not ask for the plugin keeps today's ladder", async () => {
  const { clay } = await bootPage({ params: "exclude=richclay,source" });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(false);
  expect(document.documentElement.getAttribute("draftmode")).toBeNull();
});

test("exclude=visitor-drafts turns draft mode off", async () => {
  const { clay } = await bootPage({ params: "plugins=visitor-drafts&exclude=visitor-drafts" });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(false);
});

test("an invalid slot is not a draft page", async () => {
  const { clay } = await bootPage({ slot: "a b" });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(false);
});

test("a page with no api rules tag is not a draft page", async () => {
  const { clay } = await bootPage({ apiTag: false });

  expect(clay.isDraftMode).toBe(false);
  expect(clay.isEditMode).toBe(false);
});

test("a rules tag this version cannot read is not a draft page", async () => {
  const warns = [];
  const spy = jest.spyOn(console, "warn").mockImplementation((line) => warns.push(String(line)));
  try {
    const newer = await bootPage({
      api: '<script data-rules-name="api" data-rules-version="2" type="application/json">{"title":"h1"}</script>',
    });
    expect(newer.clay.isDraftMode).toBe(false);
    expect(newer.clay.isEditMode).toBe(false);
    expect(newer.clay.visitorDrafts.active).toBe(false);
    expect(newer.clay.save).toBeUndefined();
    expect(document.documentElement.getAttribute("draftmode")).toBeNull();
    expect(localStorage.getItem(draftKey("draft-slot-1"))).toBeNull();

    const broken = await bootPage({
      api: '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"</script>',
    });
    expect(broken.clay.isDraftMode).toBe(false);
    expect(broken.clay.isEditMode).toBe(false);
    expect(broken.clay.visitorDrafts.active).toBe(false);
  } finally {
    spy.mockRestore();
  }

  expect(warns).toHaveLength(2);
  expect(warns[0]).toContain('data-rules-version="2"');
  expect(warns[1]).toContain("readable JSON");
});

test("a file: page is not a draft page", async () => {
  const realLocation = window.location;
  Object.defineProperty(window, "location", {
    value: { href: "file:///tmp/exported-app.html", protocol: "file:", search: "", pathname: "/tmp/exported-app.html", hostname: "", origin: "null" },
    configurable: true,
  });
  try {
    const { clay } = await bootPage();

    expect(clay.isDraftMode).toBe(false);
    expect(clay.isEditMode).toBe(false);
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }
});

test("toggleEditMode in draft mode goes to ?editmode=true", async () => {
  const { clay } = await bootPage();
  const realLocation = window.location;
  const fake = { href: "http://localhost/notes.html", search: "", protocol: "http:", pathname: "/notes.html", hostname: "localhost", origin: "http://localhost" };
  Object.defineProperty(window, "location", { value: fake, configurable: true });
  try {
    clay.toggleEditMode();
  } finally {
    Object.defineProperty(window, "location", { value: realLocation, configurable: true });
  }

  expect(fake.href).toBe("http://localhost/notes.html?editmode=true");
});

test("draft mode never fetches: replacePageWith and the page-data lane refuse first", async () => {
  const { fetchMock } = await bootPage();

  const save = await import("../../src/core/save.js");
  const saveCore = await import("../../src/core/save-core.js");
  const pageData = await import("../../src/core/page-data.js");

  await save.replacePageWith("/other.html");
  await expect(saveCore.replacePageWith("/other.html")).resolves.toBe(false);
  await expect(pageData.readData()).rejects.toMatchObject({ code: "DataUnavailableInDraft" });
  await expect(pageData.writeData({ title: "draft" })).rejects.toMatchObject({ code: "DataUnavailableInDraft" });

  expect(fetchMock).not.toHaveBeenCalled();
});
