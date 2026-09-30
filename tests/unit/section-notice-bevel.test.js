import { capture, expectHostileProof, expectCallsResolved, hostileSheet, last } from "./helpers/injected-ui.js";
import { TOKENS, FONT_SANS } from "../../src/ui/bevel.js";
import { SectionNotice } from "../../src/sync/section-notice.js";

/**
 * "<name> changed this section" on the generated Bevel subset. The attribution, the
 * manual dismiss and the conflict notice's precedence are the behaviour that stays;
 * the material is Bevel's and a page stylesheet cannot reach it.
 */

const root = () => document.querySelector("[data-clay-section-notice]");
const dismiss = () => document.querySelector("[data-clay-section-notice-dismiss]");

let notice;

beforeEach(() => {
  document.body.innerHTML = "";
  notice = new SectionNotice();
});

afterEach(() => {
  document.documentElement.style.colorScheme = "";
});

test("every element is runtime-only, classless, idless, !important and resolved", () => {
  const restore = hostileSheet();
  try {
    const calls = capture(() => notice.show("Ada Lovelace"));
    expect(expectHostileProof(root())).toBe(4);
    expectCallsResolved(calls, root());
    expect(root().style.item(0)).toBe("all");
  } finally {
    restore();
  }
});

test("the bar is a Bevel surface in system type", () => {
  const calls = capture(() => notice.show("Ada Lovelace"));
  expect(last(calls, root(), "background")).toBe(TOKENS.surface);
  expect(last(calls, root(), "color")).toBe(TOKENS.ink);
  expect(last(calls, root(), "font")).toContain(FONT_SANS);
  expect(root().textContent).toContain("Ada Lovelace changed this section");
});

test("each showing takes the page's colour scheme as it is then", () => {
  document.documentElement.style.colorScheme = "dark";
  notice.show("Ada Lovelace");
  expect(root().style.getPropertyValue("color-scheme")).toBe("dark");
  document.documentElement.style.colorScheme = "light";
  notice.show("Grace Hopper");
  expect(root().style.getPropertyValue("color-scheme")).toBe("light");
});

test("Dismiss is a Bevel button, and it takes the name off the page", () => {
  notice.show("Ada Lovelace");
  expect(dismiss().firstElementChild.tagName).toBe("SPAN");
  expect(dismiss().textContent).toBe("Dismiss");
  dismiss().click();
  expect(root().style.display).toBe("none");
  expect(root().style.getPropertyPriority("display")).toBe("important");
  expect(document.body.textContent).not.toContain("Ada Lovelace");
});

// Regression control: the conflict notice sits in the same corner and matters more.
test("a showing conflict notice keeps this bar hidden", () => {
  const conflict = document.createElement("div");
  conflict.setAttribute("data-clay-conflict", "");
  conflict.style.display = "flex";
  document.body.appendChild(conflict);
  notice.show("Ada Lovelace");
  expect(root().style.display).toBe("none");
});

// An unnamed frame still moves the baseline, so the next named frame is judged against
// what the page shows now, not against what it showed before somebody nameless edited it.
test("an unnamed change followed by an unrelated named frame stays quiet", () => {
  document.body.innerHTML = "<div contenteditable>before</div>";
  const region = document.body.firstElementChild;
  notice.remember(region);
  region.textContent = "unnamed author changed this";
  notice.applied({});
  expect(root()).toBeNull();
  notice.applied({ by: { name: "Ada Lovelace" } });
  expect(root()).toBeNull();
});
