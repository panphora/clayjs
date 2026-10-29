import { jest } from "@jest/globals";
import { captureAsync, last } from "./helpers/injected-ui.js";

// When the chip shows and goes: saving stays until the save finishes, a finished state
// stays 2200 ms, and a reader who asked for reduced motion gets no fade.

const chip = () => document.querySelector("[data-clay-indicator]");
// The drawing is a module the first save state fetches, so a reading waits for it.
const drawn = async () => {
  await import("../../src/plugins/indicator-chip.js");
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
const fire = (state) => document.dispatchEvent(new CustomEvent("clay:save-" + state));

async function load({ reduced = false } = {}) {
  jest.resetModules();
  document.body.innerHTML = "";
  window.clayEditMode = true;
  window.matchMedia = (query) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} });
  await import("../../src/plugins/indicator.js");
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  delete window.clayEditMode;
});

test("saving stays on screen for as long as the save takes", async () => {
  await load();
  fire("saving");
  await drawn();
  jest.advanceTimersByTime(60000);
  expect(chip().style.opacity).toBe("1");
});

test("a finished state shows for 2200 ms, then fades", async () => {
  await load();
  fire("saved");
  await drawn();
  jest.advanceTimersByTime(2199);
  expect(chip().style.opacity).toBe("1");
  jest.advanceTimersByTime(1);
  expect(chip().style.opacity).toBe("0");
});

test("reduced motion: no fade transition", async () => {
  let calls = [];
  await load({ reduced: true });
  calls = await captureAsync(async () => {
    fire("saved");
    await drawn();
  });
  expect(last(calls, chip(), "transition")).toBe("none");
});

test("an indicator imported during a transition arms nothing", async () => {
  // A late import lands while the committed mode is still the one being left, so its
  // own start would be a chip no exit holds a lease over.
  jest.resetModules();
  document.body.innerHTML = "";
  window.clayEditMode = true;
  const mode = await import("../../src/core/is-edit-mode.js");
  const { saveFeedback } = await import("../../src/core/save-feedback.js");
  mode.commitModeFacts({ mode: "edit", isEditMode: true, phase: "leaving" });

  const added = [];
  const realAdd = document.addEventListener;
  document.addEventListener = function (type, ...rest) {
    added.push(type);
    return realAdd.call(this, type, ...rest);
  };
  try {
    await import("../../src/plugins/indicator.js");
  } finally {
    document.addEventListener = realAdd;
  }

  expect(saveFeedback.chip).toBe(false);
  expect(added).not.toContain("clay:save-saved");
});
