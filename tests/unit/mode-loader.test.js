/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

/**
 * The loader's half of a live switch: what it starts, once, and what it refuses to start
 * after the session it was planned for has gone.
 *
 * The loader no longer leans on a target's import side effects. It imports a managed
 * module and then calls that module's own install, in wave order, so there is one module
 * cache entry and one installation behind it — a second entry, or a live switch, asks for
 * the installation the page already has.
 *
 * The other half is the late tail. Sortable and source are edit-only and load after ready.
 * When the page leaves edit while they are still in flight, importing them would start an
 * editor in a view, so the loader drops them: no member, no announcement, no second
 * module instance next time. The menu is not edit-only and still loads.
 *
 * The modules' own decisions are here too: which requested edit module this release can
 * start and take back, and which authored resource makes a live entry impossible.
 */

const FIXTURE = `
  <article id="doc">
    <h1 id="title" editmode:contenteditable inert-contenteditable="plaintext-only">Authored title</h1>
  </article>
  <ul id="tasks"><li data-id="t-1">one</li></ul>
  <button id="add" type="button" add-from="#task-tpl" add-to="#tasks">Add task</button>
  <template id="task-tpl"><li><span class="label" editmode:contenteditable inert-contenteditable="plaintext-only">New</span></li></template>
  <input id="who" persist value="">
`;

let latePlugin;

jest.unstable_mockModule("../../src/plugins/sortable.js", () => ({
  default: () => {},
  init: () => {},
  ready: latePlugin?.ready,
  makeSortable: () => {},
}));

const imported = [];

jest.unstable_mockModule("../../src/plugins/source.js", () => {
  imported.push("source");
  return { default: () => {}, source: { marked: true } };
});

jest.unstable_mockModule("../../src/plugins/menu.js", () => ({ menu: { drawn: true } }));

async function waitFor(predicate) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("timed out waiting for the loader");
}

async function boot(params) {
  jest.resetModules();
  imported.length = 0;
  document.documentElement.innerHTML = "<head><title>Document</title></head><body></body>";
  document.body.innerHTML = FIXTURE;
  window.clay = {};
  window.clayEditMode = true;
  delete window.__hyperclayEditMode;
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    redirected: false,
    type: "basic",
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => "<!DOCTYPE html><html><head><title>Document</title></head><body></body></html>",
  }));
  const events = [];
  document.addEventListener("clay:ready", () => events.push("clay:ready"));
  document.addEventListener("clay:plugin-ready", (event) => events.push(event.detail.plugin));
  const { boot: bootLoader } = await import("../../src/loader.js");
  await bootLoader("https://clayjs.com/v1", new URLSearchParams(params), () => {});
  const facts = await import("../../src/core/is-edit-mode.js");
  return { events, facts };
}

afterEach(() => {
  delete window.clay;
  delete window.clayEditMode;
  jest.restoreAllMocks();
});

test("an initial legacy boot starts each managed target, and starts it once", async () => {
  await boot("exclude=richclay");

  // The control sweep is the loader's install, not the module's own evaluation.
  expect(document.getElementById("title").getAttribute("contenteditable")).toBe("plaintext-only");

  // One click listener means one item per click; a second installation would add two.
  document.getElementById("add").click();
  expect(document.querySelectorAll("#tasks > li").length).toBe(2);

  // And the one persist installation is in front of the capture.
  const { captureForSave } = await import("../../src/core/snapshot.js");
  const input = document.getElementById("who");
  input.value = "typed-value";
  expect(captureForSave({ emitForSync: false })).toContain('value="typed-value"');
});

test("the late tail drops the edit-only plugins once the page has left edit", async () => {
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  latePlugin = { ready, makeSortable: () => {} };

  const { events, facts } = await boot("exclude=richclay&plugins=menu,sortable");

  // The switch, as the controller commits it: the page is a view now, and the sortable
  // vendor fetch it asked for is still in flight.
  facts.commitModeFacts({ mode: "view", isEditMode: false });
  resolveReady();
  await waitFor(() => events.includes("menu"));

  expect(events).toEqual(["clay:ready", "menu"]);
  expect(imported).toEqual([]);
  expect(window.clay.source).toBeUndefined();
});

test("a requested edit module with no adapter is unsupported, never assumed supported", async () => {
  const { ADAPTERS, supports, unsupported } = await import("../../src/core/mode-resources.js");
  const { CORE_WAVES, PLUGIN_PATHS, MODULES } = await import("../../src/loader-logic.js");

  const inventory = [
    ...CORE_WAVES.always,
    ...CORE_WAVES.editOnly,
    ...Object.values(PLUGIN_PATHS).flatMap((spec) => [spec.path, spec.ownerPath]).filter(Boolean),
  ];

  // Every adapter names a path the loader can actually resolve.
  for (const path of ADAPTERS) {
    expect(inventory).toContain(path);
    expect(typeof MODULES[path]).toBe("function");
  }

  expect(supports("core/admin-attrs.js")).toBe(true);
  expect(supports("plugins/sortable.js")).toBe(false);
  expect(unsupported(inventory)).toEqual(
    inventory.filter((path) => !supports(path))
  );
  expect(unsupported(inventory)).toContain("core/save.js");
});

test("a served editmode:resource script takes the reload path, a style does not", async () => {
  const { requiresReload, resourceSupport } = await import("../../src/core/mode-resources.js");

  document.body.innerHTML = '<script editmode:resource>window.ran = 1</script>';
  expect(resourceSupport().reversible).toBe(false);
  expect(requiresReload([])).toBe(true);

  document.body.innerHTML = '<style id="s" editmode:resource>.x{color:red}</style><link id="l" editmode:resource rel="stylesheet" href="/x.css">';
  expect(resourceSupport().reversible).toBe(true);
  expect(requiresReload([])).toBe(false);
});

test("the resource adapter refuses a script document and flips a reversible one back", async () => {
  const { resourcesParticipant } = await import("../../src/core/mode-resources.js");

  document.body.innerHTML = '<script editmode:resource>window.ran = 1</script>';
  expect(() => resourcesParticipant().prepare()).toThrow(/cannot be re-run/);

  document.body.innerHTML = '<style id="s" type="inert/" editmode:resource>.x{color:red}</style>';
  const lease = resourcesParticipant().prepare();
  lease.enable();
  expect(document.getElementById("s").hasAttribute("type")).toBe(false);

  lease.dispose();
  expect(document.querySelector("style").getAttribute("type")).toBe("inert/");
});
