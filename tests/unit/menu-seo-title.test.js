import { jest } from "@jest/globals";
import * as Y from "../../src/vendor/yjs.vendor.js";
import { seedValue } from "../../src/page/ybind/seed.js";
import { docFromValue, enc } from "../../src/page/ybind/provider.js";

// Scenario: "Use the first heading" chooses the same first root H1 the editor and the
// checkpoint derive, an empty one becomes Untitled, and a title the person owns keeps
// its exact text while the page is typed in, here and from a peer.

await jest.unstable_mockModule("../../src/core/host-meta.js", () => ({
  hostMeta: async () => ({ spec: 1, extensions: ["page"], document: null }),
  hostSupports: async (name) => name === "page",
  hostMetaOutcome: () => "ok",
  querySaveOutcome: () => null,
  resetHostMeta: () => {},
}));

await jest.unstable_mockModule("../../src/core/save.js", () => ({
  savePageForce: async () => ({ ok: true, msgType: "success" }),
  savePage: async () => ({ ok: true, msgType: "success" }),
  savePageThrottled: () => {},
  baselineSettled: () => true,
  isSaveConflicted: () => false,
  autosaveIsSuspended: () => false,
  suspendAutosave: () => {},
  resumeAutosave: () => {},
  holdAllSaves: () => {},
  releaseAllSaves: () => {},
  getLastSavedDirty: () => false,
  setLastSavedBaselines: () => {},
  getLastSavedBytes: () => null,
  savesAdmitted: () => true,
}));

await jest.unstable_mockModule("../../src/live/local-lane.js", () => ({
  localLaneSupported: () => false,
  localTransport: () => ({}),
}));

window.clayEditMode = true;

const { live, storeOf } = await import("../../src/plugins/live.js");
window.clay = { live, mode: "edit" };
const { page } = await import("../../src/plugins/page.js");
await import("../../src/plugins/indicator.js");
const projection = await import("../../src/page/save-projection.js");
const { open } = await import("../../src/plugins/menu/seo.js");
const { FIELDS, readHead } = await import("../../src/plugins/menu/seo-head.js");

const clone = (value) => JSON.parse(JSON.stringify(value));
const tagHtml = (value) => `<script type="application/json" merge="page" clay="live">${JSON.stringify(value)}</script>`;
const articleOf = (value) => {
  const { html, rev } = projection.renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  await tick();
  await tick();
};

function setPage(blocks, { custom = null } = {}) {
  const value = seedValue(blocks);
  document.head.innerHTML = tagHtml(value);
  document.body.innerHTML = articleOf(value);
  if (custom !== null) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "clay-seo-title-mode");
    meta.setAttribute("content", "custom");
    document.head.appendChild(meta);
    const title = document.createElement("title");
    title.textContent = custom;
    document.head.appendChild(title);
  }
  if (!storeOf("page")) live("page");
  const store = storeOf("page");
  live("page").update((data) => {
    for (const key of Object.keys(data)) delete data[key];
    Object.assign(data, clone(value));
  });
  store.confirm(store.mark);
  return { value, store };
}

const fieldOf = (key) => document.querySelector(`.clay-seo [data-key="${key}"]`);
const buttonOf = (name) => document.querySelector(`.clay-seo-${name}`);
const markerOf = () => document.querySelector('meta[name="clay-seo-title-mode"]');
const titleText = () => document.querySelector("title")?.textContent ?? null;

function setValue(key, value) {
  const input = fieldOf(key);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function mount(blocks, options) {
  const fixture = setPage(blocks, options);
  await page.install();
  window.clay.page = page;
  await settle();
  return { ...fixture, view: page.view };
}

async function openSheet() {
  open();
  await settle();
}

afterEach(() => {
  document.querySelector(".clay-seo")?.remove();
  page.dispose();
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

test("Use the first heading takes the first root H1, not a nested one, and clears the marker", async () => {
  await mount([
    { id: "t", t: "toggle", text: "Toggle", attrs: { open: true } },
    { id: "n", t: "heading", text: "Nested title", attrs: { level: 1, parent: "t" } },
    { id: "h", t: "heading", text: "Root title", attrs: { level: 1 } },
    { id: "p", t: "paragraph", text: "Body" },
  ], { custom: "My own title" });
  expect(document.querySelector('article[data-page] h1[data-id="n"]')).not.toBeNull();
  expect(titleText()).toBe("My own title");

  await openSheet();
  expect(document.title).toBe("My own title");
  const link = document.querySelector(".clay-seo-derived");
  expect(link.hidden).toBe(false);
  link.click();
  await settle();

  expect(fieldOf("title").value).toBe("Root title");
  expect(titleText()).toBe("My own title");

  buttonOf("apply").click();
  await settle();

  expect(markerOf()).toBeNull();
  expect(titleText()).toBe("Root title");
  expect(document.title).toBe("Root title");
});

test("a Document with no root H1 derives Untitled", async () => {
  await mount([
    { id: "s", t: "heading", text: "Sub head", attrs: { level: 2 } },
    { id: "p", t: "paragraph", text: "Body" },
  ], { custom: "My own title" });

  await openSheet();
  const link = document.querySelector(".clay-seo-derived");
  expect(link.hidden).toBe(false);
  link.click();
  await settle();

  expect(fieldOf("title").value).toBe("Untitled");
  buttonOf("apply").click();
  await settle();

  expect(markerOf()).toBeNull();
  expect(titleText()).toBe("Untitled");
});

test("a custom title survives local and remote typing in an open editor", async () => {
  const { store, view } = await mount([{ id: "h", t: "heading", text: "Root title", attrs: { level: 1 } }]);
  expect(view).toBeTruthy();

  await openSheet();
  setValue("title", "My own title");
  buttonOf("apply").click();
  await settle();
  expect(markerOf().getAttribute("content")).toBe("custom");
  expect(titleText()).toBe("My own title");
  expect(document.title).toBe("My own title");

  view.dispatch(view.state.tr.insertText("!", view.state.doc.content.size - 1));
  await settle();
  expect(view.state.doc.textContent).toBe("Root title!");
  expect(titleText()).toBe("My own title");
  expect(document.title).toBe("My own title");

  const peer = docFromValue(store.value, { strict: true });
  peer.clientID = 900;
  peer.getText("flow").insert(peer.getText("flow").length, " from a peer");
  const encoded = enc(Y.encodeStateAsUpdateV2(peer));
  peer.destroy();
  store.rebase(
    { ...store.value, y: { ...store.value.y, remote: encoded } },
    { source: "remote", frame: { ops: [{ op: "set", path: ["y", "remote"], value: encoded }] } },
  );
  await settle();
  expect(page.view.state.doc.textContent).toBe("Root title! from a peer");
  expect(titleText()).toBe("My own title");
  expect(document.title).toBe("My own title");
});

test("a duplicate earlier non-custom marker does not cancel a later custom one", () => {
  const parsed = (markers, title) => {
    const doc = document.implementation.createHTMLDocument("");
    doc.head.innerHTML = `${markers}<title>${title}</title>`;
    return doc;
  };
  expect(FIELDS.titleMode.read(parsed('<meta name="clay-seo-title-mode" content="derived">', "Mine"))).toBe("derived");
  expect(FIELDS.titleMode.read(parsed('<meta name="clay-seo-title-mode" content="derived"><meta name="clay-seo-title-mode" content="custom">', "Mine"))).toBe("custom");
  expect(FIELDS.titleMode.read(parsed('<meta name="clay-seo-title-mode" content=" custom ">', "Mine"))).toBe("custom");
  expect(readHead(parsed('<meta name="clay-seo-title-mode" content="derived"><meta name="clay-seo-title-mode" content="custom">', "Mine")).values.titleMode).toBe("custom");
  expect(readHead(parsed('<meta name="clay-seo-title-mode" content="custom">', "Mine")).values.title).toBe("Mine");
});
