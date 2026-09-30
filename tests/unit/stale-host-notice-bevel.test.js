import { jest } from "@jest/globals";
import { capture, captureAsync, expectHostileProof, expectCallsResolved, hostileSheet, last } from "./helpers/injected-ui.js";
import { readFileSync } from "node:fs";
import { TOKENS, FONT_SANS } from "../../src/ui/bevel.js";

/**
 * The stale-host warning is drawn from the generated Bevel subset: every declaration
 * inline and !important, resolved to literal values, on elements a page selector cannot
 * single out. jsdom has no real cascade, so "the page cannot win" is asserted as the
 * contract that makes it true in a browser: all:initial first, !important everywhere,
 * no var() a page rule could redefine, no class or id to aim at.
 */

const bar = () => document.querySelector("[data-clay-stale-host]");

async function load() {
  jest.resetModules();
  document.body.innerHTML = "";
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");
  jest.spyOn(console, "warn").mockImplementation(() => {});
  return captureAsync(async () => (await import("../../src/core/stale-host-notice.js")).whenShown());
}

afterEach(() => {
  document.documentElement.style.colorScheme = "";
});

test("every element is runtime-only, classless, idless and !important", async () => {
  const restore = hostileSheet();
  try {
    const calls = await load();
    expect(bar()).not.toBeNull();
    expect(expectHostileProof(bar())).toBeGreaterThanOrEqual(4);
    expectCallsResolved(calls, bar());
    expect(bar().style.item(0)).toBe("all");
    expect(bar().style.getPropertyValue("all")).toBe("initial");
  } finally {
    restore();
  }
});

test("the surface and type are Bevel's, not the page's or a themeable default", async () => {
  const calls = await load();
  expect(last(calls, bar(), "background")).toBe(TOKENS.surface);
  expect(last(calls, bar(), "color")).toBe(TOKENS.ink);
  expect(last(calls, bar(), "font")).toContain(FONT_SANS);
  expect(bar().textContent).toContain("Update HTML Clay to 1.9.0 or newer.");
});

test("the root carries the page's colour scheme, so dark pages get the dark palette", async () => {
  document.documentElement.style.colorScheme = "dark";
  await load();
  expect(bar().style.getPropertyValue("color-scheme")).toBe("dark");
});

test("Dismiss is a Bevel button that keeps its label and hides the warning", async () => {
  await load();
  const close = bar().querySelector("button");
  expect(close.getAttribute("aria-label")).toBe("Dismiss this message");
  expect(close.firstElementChild.tagName).toBe("SPAN");
  expect(close.textContent).toBe("Dismiss");
  close.click();
  expect(bar().style.display).toBe("none");
  expect(bar().style.getPropertyPriority("display")).toBe("important");
});

test("Dismiss stops following the visual viewport", async () => {
  const vv = new EventTarget();
  Object.assign(vv, { height: window.innerHeight, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  try {
    await load();
    bar().querySelector("button").click();
    const after = capture(() => {
      vv.height = 100;
      vv.dispatchEvent(new Event("resize"));
      vv.dispatchEvent(new Event("scroll"));
    }).filter((call) => call.style === bar().style);
    expect(after).toEqual([]);
  } finally {
    delete window.visualViewport;
  }
});

test("Bevel is not a static import: pages that never show the warning never fetch it", () => {
  const source = readFileSync(new URL("../../src/core/stale-host-notice.js", import.meta.url), "utf8");
  expect(source).not.toMatch(/^import[^\n]*bevel/m);
  expect(source).toMatch(/import\("\.\.\/ui\/bevel-controls\.js"\)/);
});

