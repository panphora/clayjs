import { jest } from "@jest/globals";

/**
 * The boot mount phase holds save.js's settled baseline until the derive engine
 * has taken its first pass, then releases it on the painted page
 * (loader.js, mountDerivedEngine).
 *
 * A [sap] page that materializes declared state writes to the DOM on its first
 * pass: `state="tab=a"` with no `tab` attribute puts `tab="a"` on the root. That
 * write is saved with the file but is nobody's edit, so the baseline has to be
 * taken after it. While `bootPhase.holdSettle` is true neither the 500 ms quiet
 * settle nor the 3 s max timeout may capture; `releaseBootSettle()` runs the
 * capture at once, and its guard still skips the settled capture when a person
 * edited during the hold.
 *
 * Every test loads fresh modules: the settle is a one-time event per save.js
 * instance, so a scenario that needs an unsettled page cannot share the registry
 * with one that has already waited it out.
 */

let save;
let snapshot;
let Sap;

const PAGE = `<main sap state="tab=a"><p show-when:tab="a">A</p></main>`;

async function load({ hold, body }) {
  jest.resetModules();
  // mutation.js publishes a realm-global hub on window.__clayMutation and every
  // later module instance adopts it, so without this the fresh registry would
  // register on the FIRST test's hub.
  delete window.__clayMutation;
  delete window.clay;
  window.clayEditMode = true;
  window.scrollTo = () => {};
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 500, statusText: "mock", text: async () => "" })
  );

  // Imported before the page exists, so the engine's own DOM-ready mount finds no
  // root: this file mounts by hand, the way the loader's mount phase does.
  Sap = (await import("../../src/vendor/sap-core.vendor.js")).default;
  Sap._reset();

  document.body.innerHTML = body;

  if (hold) {
    const { bootPhase } = await import("../../src/core/boot-phase.js");
    bootPhase.holdSettle = true;
  }
  save = await import("../../src/core/save.js");
  snapshot = await import("../../src/core/snapshot.js");
  const { derived } = await import("../../src/lib/derived.js");
  const Mutation = (await import("../../src/lib/mutation.js")).default;
  window.clay = { ...(window.clay || {}), derived, Mutation };
}

function mount() {
  Sap.mount(document.querySelector("[sap]"));
}

const root = () => document.querySelector("main");

function waitForSettle(timeoutMs = 5000) {
  if (save.baselineSettled()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("save.js never settled")), timeoutMs);
    document.addEventListener(
      "clay:baseline-settled",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("a held baseline settles on the painted page when the mount phase releases it", async () => {
  await load({ hold: true, body: PAGE });
  expect(save.baselineSettled()).toBe(false);
  expect(root().hasAttribute("tab")).toBe(false);

  mount();
  expect(root().getAttribute("tab")).toBe("a");
  // The paint is not the person's work, and the held settle has not absorbed it.
  expect(save.baselineSettled()).toBe(false);
  expect(snapshot.captureForComparison()).not.toBe(save.getLastSavedContents());

  save.releaseBootSettle();

  expect(save.baselineSettled()).toBe(true);
  expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents());
  expect(snapshot.captureForDirtyCheck()).toBe(save.getLastSavedDirty());
});

test("the hold blocks the max timeout until the mount phase releases it", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  await load({ hold: true, body: PAGE });
  expect(save.baselineSettled()).toBe(false);

  jest.advanceTimersByTime(3100);
  expect(save.baselineSettled()).toBe(false);

  save.releaseBootSettle();
  expect(save.baselineSettled()).toBe(true);
});

test("an edit during the hold survives the release", async () => {
  await load({
    hold: true,
    body: `${PAGE}<input id="note" value="one"><p id="text">start</p>`,
  });

  const note = document.getElementById("note");
  note.value = "two";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  document.getElementById("text").textContent = "edited";

  mount();
  save.releaseBootSettle();

  expect(save.baselineSettled()).toBe(true);
  // The settled capture was skipped, so the immediate baseline still stands and
  // the person's edit still reads as unsaved.
  expect(snapshot.captureForComparison()).not.toBe(save.getLastSavedContents());
  expect(snapshot.captureForDirtyCheck()).not.toBe(save.getLastSavedDirty());
});

test("a document transform that throws still mounts the engine and settles the baseline", async () => {
  await load({ hold: true, body: PAGE });
  expect(save.baselineSettled()).toBe(false);

  // A transform runs on every save clone, so the file's painted values cannot be
  // read. The mount phase still mounts and releases: a page whose snapshot hook
  // throws must not be left with a baseline that never settles.
  let thrown = false;
  save.addDocumentTransform(() => {
    if (thrown) return;
    thrown = true;
    throw new Error("transform failed");
  });
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  window.Sap = Sap;

  const { mountDerivedEngine } = await import("../../src/loader.js");
  mountDerivedEngine({ "core/save.js": save });

  expect(errors).toHaveBeenCalled();
  expect(root().getAttribute("tab")).toBe("a");
  expect(save.baselineSettled()).toBe(true);
});

test("a held settle releases itself after ten seconds", async () => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask", "nextTick"] });
  await load({ hold: true, body: PAGE });
  expect(save.baselineSettled()).toBe(false);

  jest.advanceTimersByTime(3000);
  expect(save.baselineSettled()).toBe(false);

  jest.advanceTimersByTime(7000);
  expect(save.baselineSettled()).toBe(true);
});

test("without the hold the settle still happens on its own", async () => {
  await load({ hold: false, body: PAGE });
  expect(save.baselineSettled()).toBe(false);

  await waitForSettle();

  expect(save.baselineSettled()).toBe(true);
  expect(snapshot.captureForComparison()).toBe(save.getLastSavedContents());
});
