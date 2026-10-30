/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/notes.html"}
 */
import { jest } from "@jest/globals";
import { seedValue } from "../../../src/page/ybind/seed.js";
import { renderFromTags } from "../../../src/page/save-projection.js";

/**
 * A document's settings belong to the document: the checklist's assignee and due tags
 * show unless the page's own live store says otherwise, a document that never touched
 * a switch opens no store, and a switch written here or by a peer takes effect at once.
 */

const BLOCKS = [
  { id: "h", t: "heading", text: "Notes" },
  { id: "c", t: "list_item", text: "Do it", attrs: { kind: "check" } },
];
const SETTINGS_SEL = 'script[type="application/json"][merge="page.settings"][clay~="live"]';
const clone = (v) => JSON.parse(JSON.stringify(v));

const pageHtml = (value = seedValue(BLOCKS)) => {
  const { html, rev } = renderFromTags([JSON.stringify(value)]);
  return `<article data-page="1" data-rev="${rev}">${html}</article>`;
};
const settingsTag = (value) =>
  `<script type="application/json" merge="page.settings" clay="live">${JSON.stringify(value)}</script>`;

let current = null;

async function load({ head = "" } = {}) {
  jest.resetModules();
  window.clayEditMode = true;
  document.documentElement.removeAttribute("documentetag");
  document.head.innerHTML = head;
  document.body.innerHTML = pageHtml();

  const extensions = ["page"];
  const opens = [];
  const peers = [];

  await jest.unstable_mockModule("../../../src/core/host-meta.js", () => ({
    hostMeta: async () => ({ spec: 1, extensions, document: { etag: "stamp-1" } }),
    hostSupports: async (name) => extensions.includes(name),
    hostMetaOutcome: () => "ok",
    querySaveOutcome: () => null,
    resetHostMeta: () => ({}),
  }));

  await jest.unstable_mockModule("../../../src/live/local-lane.js", () => ({
    localLaneSupported: () => false,
    localTransport: () => ({}),
  }));

  const { live } = await import("../../../src/plugins/live.js");
  // The settings store stands in for the room's: it keeps its value in place and tells
  // its listeners, the way the live store does for a local write and for a peer's.
  window.clay = {
    live: (name) => {
      if (name !== "page.settings") return live(name);
      opens.push(name);
      const tag = document.querySelector(SETTINGS_SEL);
      const state = tag ? clone(JSON.parse(tag.textContent)) : {};
      const listeners = new Set();
      const tell = (source) => { for (const fn of [...listeners]) fn({ source }); };
      const handle = {
        name,
        ready: null,
        get data() { return state; },
        status: { mode: "fast" },
        set(path, value) {
          state[Array.isArray(path) ? path[0] : String(path).split(".")[0]] = value;
          tell("local");
        },
        on(type, fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      };
      handle.ready = Promise.resolve(handle);
      peers.push({ handle, change: (value) => { Object.assign(state, clone(value)); tell("remote"); } });
      return handle;
    },
  };

  const { page } = await import("../../../src/plugins/page.js");
  current = page;
  return { page, opens, peers };
}

afterEach(() => {
  try { current?.dispose(); } catch {}
  current = null;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete globalThis.clay;
});

test("a document with no settings tag boots with no settings store and no hiding attributes", async () => {
  const { page, opens } = await load();
  await page.ready;

  expect(page.view).toBeTruthy();
  expect(opens).toHaveLength(0);
  expect(document.querySelector(SETTINGS_SEL)).toBeNull();
  expect(page.view.dom.hasAttribute("data-assignees")).toBe(false);
  expect(page.view.dom.hasAttribute("data-dates")).toBe(false);
  expect(page.settings.read()).toEqual({ assignees: true, dates: true });
});

test("a settings tag read at boot hides the tag it turned off and leaves the other shown", async () => {
  const { page, opens } = await load({ head: settingsTag({ assignees: false }) });
  await page.ready;

  expect(opens).toHaveLength(1);
  expect(page.view.dom.dataset.assignees).toBe("false");
  expect(page.view.dom.hasAttribute("data-dates")).toBe(false);
  expect(page.settings.read()).toEqual({ assignees: false, dates: true });
});

test("a switch writes the document's store, applies here at once, and follows a peer's change", async () => {
  const { page, opens, peers } = await load();
  await page.ready;
  expect(opens).toHaveLength(0);

  await page.settings.set("dates", false);
  expect(document.querySelector(SETTINGS_SEL)).toBeTruthy();
  expect(opens).toHaveLength(1);
  expect(peers[0].handle.data).toEqual({ dates: false });
  expect(page.view.dom.dataset.dates).toBe("false");
  expect(page.view.dom.hasAttribute("data-assignees")).toBe(false);

  peers[0].change({ dates: true });
  expect(page.view.dom.hasAttribute("data-dates")).toBe(false);
  expect(page.settings.read()).toEqual({ assignees: true, dates: true });
});

test("a tab opened before any setting existed follows the first one a peer writes", async () => {
  const { page, opens } = await load();
  await page.ready;
  expect(opens).toHaveLength(0);

  document.head.insertAdjacentHTML("beforeend", settingsTag({ dates: false }));
  document.dispatchEvent(new CustomEvent("clay:sync-applied", { detail: { html: document.documentElement.outerHTML } }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(opens).toEqual(["page.settings"]);
  expect(page.view.dom.dataset.dates).toBe("false");
  expect(page.settings.read()).toEqual({ assignees: true, dates: false });
});

test("a setting that is not one of the two switches is refused and writes nothing", async () => {
  const { page, opens } = await load();
  await page.ready;

  await expect(page.settings.set("other", false)).rejects.toThrow(TypeError);
  expect(opens).toHaveLength(0);
  expect(document.querySelector(SETTINGS_SEL)).toBeNull();
});

test("the editor's stylesheet hides the tags a document switched off", async () => {
  const { PAGE_EDITOR_CSS } = await import("../../../src/page/editor.js");
  expect(PAGE_EDITOR_CSS).toContain('[data-assignees="false"] .page-check-chip[data-check="owner"], [data-dates="false"] .page-check-chip[data-check="date"] { display: none; }');
  expect(PAGE_EDITOR_CSS).toContain('[data-assignees="false"][data-dates="false"] .page-check-controls { display: none; }');
});
