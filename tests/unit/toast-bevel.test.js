import { jest } from "@jest/globals";
import toast, { toastPersistent } from "../../src/ui/toast.js";
import { TOKENS, FONT_SANS, GLYPHS } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

const stack = () => document.querySelector("[data-clay-toasts]");
const toasts = () => [...document.querySelectorAll("[data-clay-toast]")];
// Behaviour controls find a toast by either marker, so they pass on the class-based
// toasts this replaces and keep passing after: timing and dismissal must not move.
const anyToasts = () => [...document.querySelectorAll("[data-clay-toast], .toast")];
const parsedGlyph = (markup) => {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.firstElementChild;
};

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("hostile-proof: the stack and every toast part are runtime-only, class-free, !important and resolved", () => {
  const calls = capture(() => {
    toast("Saved");
    toastPersistent("Couldn't save", "error");
  });
  expect(expectHostileProof(stack())).toBeGreaterThanOrEqual(8);
  expectCallsResolved(calls, stack());
  for (const el of [stack(), ...toasts()]) expect(el.style.item(0)).toBe("all");
  expect(document.head.querySelector("style")).toBeNull();
});

test("tone: the inline-start edge and the icon follow the type, unknown types fall back", () => {
  const edge = {};
  for (const type of ["success", "error", "warning", "info"]) {
    const calls = capture(() => toast(type, type));
    const el = toasts().at(-1);
    expect(el.getAttribute("data-clay-toast")).toBe(type);
    edge[type] = last(calls, el, "border-inline-start");
  }
  expect(edge).toEqual({
    success: `3px solid ${TOKENS.teal}`,
    error: `3px solid ${TOKENS.ox}`,
    warning: `3px solid ${TOKENS.brass}`,
    info: `3px solid ${TOKENS.brass}`,
  });
  toast("odd", "nonsense");
  expect(toasts().at(-1).getAttribute("data-clay-toast")).toBe("success");
  toastPersistent("odd too", "nonsense");
  expect(toasts().at(-1).getAttribute("data-clay-toast")).toBe("warning");
});

test("icons: each tone and the close use the generated Bevel glyph", () => {
  const expected = {
    success: GLYPHS.toastSuccess,
    error: GLYPHS.toastWarning,
    warning: GLYPHS.toastWarning,
    info: GLYPHS.toastInfo,
  };
  for (const [type, markup] of Object.entries(expected)) {
    toast(type, type);
    const actual = toasts().at(-1).querySelector("svg");
    const source = parsedGlyph(markup);
    expect(actual.getAttribute("viewBox")).toBe(source.getAttribute("viewBox"));
    expect(actual.querySelector("path").getAttribute("d")).toBe(source.querySelector("path").getAttribute("d"));
    expect([actual.getAttribute("width"), actual.getAttribute("height"), actual.getAttribute("aria-hidden")])
      .toEqual(["16", "16", "true"]);
  }

  toastPersistent("Offline", "warning");
  const actual = toasts().at(-1).querySelector("button svg");
  const source = parsedGlyph(GLYPHS.toastClose);
  expect(actual.getAttribute("viewBox")).toBe(source.getAttribute("viewBox"));
  expect(actual.querySelector("path").getAttribute("d")).toBe(source.querySelector("path").getAttribute("d"));
  expect([actual.getAttribute("width"), actual.getAttribute("height"), actual.getAttribute("aria-hidden")])
    .toEqual(["14", "14", "true"]);
});

test("material: a Bevel surface, the message in the system font as text", () => {
  const calls = capture(() => toast('a<img src=x onerror="window.__toastPwned=1">b', "warning"));
  const el = toasts()[0];
  expect(last(calls, el, "background")).toBe(TOKENS.surface);
  expect(el.querySelector("img")).toBeNull();
  expect(window.__toastPwned).toBeUndefined();
  const text = [...el.querySelectorAll("span")].find((s) => s.textContent.includes("onerror"));
  expect(text.style.getPropertyValue("font")).toContain(FONT_SANS);
});

test("timing: in after 10 ms, out at 6600 ms, with !important opacity", () => {
  toast("Saved");
  const el = toasts()[0];
  expect(el.style.opacity).toBe("0");
  jest.advanceTimersByTime(9);
  expect(el.style.opacity).toBe("0");
  jest.advanceTimersByTime(1);
  expect(el.style.opacity).toBe("1");
  expect(el.style.getPropertyPriority("opacity")).toBe("important");
  expect(el.style.getPropertyPriority("transform")).toBe("important");
  jest.advanceTimersByTime(6589);
  expect(el.style.opacity).toBe("1");
  jest.advanceTimersByTime(1);
  expect(el.style.opacity).toBe("0");
});

test("control: a toast stays 7099 ms and is gone at 7100 ms", () => {
  toast("Saved");
  const el = anyToasts()[0];
  jest.advanceTimersByTime(7099);
  expect(el.isConnected).toBe(true);
  jest.advanceTimersByTime(1);
  expect(el.isConnected).toBe(false);
});

test("control: a toast dismisses on click, a persistent one only through its close button", () => {
  toast("Saved");
  toastPersistent("Offline, not saved");
  jest.advanceTimersByTime(10);
  const [plain, sticky] = anyToasts();

  plain.click();
  sticky.click();
  jest.advanceTimersByTime(500);
  expect(plain.isConnected).toBe(false);
  expect(sticky.isConnected).toBe(true);

  const close = sticky.querySelector("button");
  expect(close.getAttribute("aria-label")).toBe("Dismiss");
  close.click();
  jest.advanceTimersByTime(500);
  expect(sticky.isConnected).toBe(false);
});

test("control: the same persistent message replaces the one on screen, and never times out", () => {
  toastPersistent("Couldn't save", "error");
  const first = anyToasts()[0];
  toastPersistent("Couldn't save", "error");
  jest.advanceTimersByTime(500);
  expect(first.isConnected).toBe(false);
  expect(anyToasts()).toHaveLength(1);
  jest.advanceTimersByTime(60000);
  expect(anyToasts()).toHaveLength(1);
});

test("scheme: a toast takes the page's declared scheme", () => {
  document.documentElement.style.colorScheme = "dark";
  toast("Saved");
  expect(toasts()[0].style.getPropertyValue("color-scheme")).toBe("dark");
});

test("control: closing a persistent toast never takes a newer one's place in the map", () => {
  toastPersistent("Offline, not saved");
  jest.advanceTimersByTime(10);
  anyToasts()[0].querySelector("button").click();
  jest.advanceTimersByTime(100);
  toastPersistent("Offline, not saved");
  jest.advanceTimersByTime(500);
  toastPersistent("Offline, not saved");
  jest.advanceTimersByTime(500);
  expect(anyToasts()).toHaveLength(1);
});

test("reduced motion: a toast moves without a transition", () => {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} });
  try {
    const calls = capture(() => toast("Saved"));
    expect(last(calls, toasts()[0], "transition")).toBe("none");
  } finally {
    window.matchMedia = original;
  }
});
