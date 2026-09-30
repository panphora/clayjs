import { jest } from "@jest/globals";
import { capture, last } from "./helpers/injected-ui.js";

// When the chip shows and goes: saving stays until the save finishes, a finished state
// stays 2200 ms, and a reader who asked for reduced motion gets no fade.

const chip = () => document.querySelector("[data-clay-indicator]");
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
  jest.advanceTimersByTime(60000);
  expect(chip().style.opacity).toBe("1");
});

test("a finished state shows for 2200 ms, then fades", async () => {
  await load();
  fire("saved");
  jest.advanceTimersByTime(2199);
  expect(chip().style.opacity).toBe("1");
  jest.advanceTimersByTime(1);
  expect(chip().style.opacity).toBe("0");
});

test("reduced motion: no fade transition", async () => {
  let calls = [];
  await load({ reduced: true });
  calls = capture(() => fire("saved"));
  expect(last(calls, chip(), "transition")).toBe("none");
});
