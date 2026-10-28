import { jest } from "@jest/globals";
import { TOKENS, FONT_SANS } from "../../src/ui/bevel.js";
import { captureAsync, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

let calls;

// The drawing is a module the first save state fetches, so a reading waits for it.
const drawn = async () => {
  await import("../../src/plugins/indicator-chip.js");
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

beforeAll(async () => {
  window.clayEditMode = true;
  document.documentElement.style.colorScheme = "dark";
  calls = await captureAsync(async () => {
    await import("../../src/plugins/indicator.js");
    document.dispatchEvent(new CustomEvent("clay:save-saving"));
    await drawn();
  });
});

const fire = (state) => captureAsync(async () => {
  document.dispatchEvent(new CustomEvent("clay:save-" + state));
  await drawn();
});
const chip = () => document.querySelector("[data-clay-indicator]");

test("hostile-proof: runtime-only, no class or id, every declaration !important and resolved", () => {
  expect(expectHostileProof(chip())).toBe(1);
  expectCallsResolved(calls, chip());
  expect(chip().style.item(0)).toBe("all");
});

test("material: a Bevel surface in the system font, square, in the page's scheme", () => {
  expect(last(calls, chip(), "background")).toBe(TOKENS.surface);
  expect(last(calls, chip(), "color")).toBe(TOKENS.ink);
  expect(chip().style.getPropertyValue("font")).toContain(FONT_SANS);
  expect(chip().style.getPropertyValue("border-radius")).toBe("");
  expect(chip().style.getPropertyValue("color-scheme")).toBe("dark");
});

test("alarm: error and offline wear the ox tone, saved goes back to the surface", async () => {
  const error = await fire("error");
  expect(last(error, chip(), "background")).toBe(TOKENS["ox-soft"]);
  expect(last(error, chip(), "color")).toBe(TOKENS.ox);
  const offline = await fire("offline");
  expect(last(offline, chip(), "color")).toBe(TOKENS.ox);
  const saved = await fire("saved");
  expect(last(saved, chip(), "background")).toBe(TOKENS.surface);
  expect(last(saved, chip(), "color")).toBe(TOKENS.ink);
});

test("fade: opacity writes are !important, so a page rule cannot pin the chip visible", async () => {
  jest.useFakeTimers();
  await fire("saved");
  expect(chip().style.getPropertyPriority("opacity")).toBe("important");
  expect(chip().style.opacity).toBe("1");
  jest.advanceTimersByTime(2200);
  expect(chip().style.opacity).toBe("0");
  expect(chip().style.getPropertyPriority("opacity")).toBe("important");
  jest.useRealTimers();
});
