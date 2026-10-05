import { jest } from "@jest/globals";
import { TOKENS, SHADOW, FONT_SANS, FONT_MONO } from "../../src/ui/bevel.js";
import { capture, captureAsync, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

/**
 * The ai-edit chrome on Bevel: panel, bar, ring, chip and bubble are drawn on somebody
 * else's page, so each one holds the hostile-CSS contract, takes its material from the
 * generated subset, and shows and hides through an inline !important display that a
 * page rule cannot override. Behaviour lives in ai-edit-plugin.test.js; this file is
 * about how the chrome is built.
 */

const fakeWire = { helpers: jest.fn(), send: jest.fn() };
jest.unstable_mockModule("../../src/plugins/wire.js", () => ({ default: fakeWire, wire: fakeWire }));

window.clayEditMode = true;

const FOCUS_RULE =
  "[editmode\\:contenteditable][contenteditable]:focus {\n      outline: 1px solid #4a4a6a; outline-offset: 4px; border-radius: 2px;\n    }";

const part = (name) => document.querySelector(`[data-clay-ai-edit-part="${name}"]`);
const root = (name) => document.querySelector(`[data-clay-ai-edit="${name}"]`);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

let buildCalls = [];

beforeAll(async () => {
  window.clay = window.clay || {};
  window.clay.save = jest.fn(async () => ({ ok: true, msg: "saved" }));
  fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
  fakeWire.send.mockImplementation(() => ({ id: "h", done: new Promise(() => {}), cancel: jest.fn() }));
  buildCalls = await captureAsync(async () => {
    await import("../../src/plugins/ai-edit.js");
    await flush();
  });
});

beforeEach(() => {
  document.querySelectorAll("[data-edit-id]").forEach((el) => el.remove());
  document.body.insertAdjacentHTML("afterbegin", '<section data-edit-id="hero"><h1>Heading</h1><p>Text</p></section>');
});

afterEach(() => {
  document.documentElement.style.removeProperty("color-scheme");
  // Compose text is a draft now, so a leftover would be restored by the next test.
  if (part("input")) part("input").value = "";
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  if (!root("panel").hidden) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
});

function openOnSection() {
  document.querySelector("[data-edit-id]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

test("every chrome root is hostile-proof, and every declaration it was built with is resolved", () => {
  let checked = 0;
  for (const name of ["panel", "status-bar", "ring", "chip", "bubble"]) {
    expect(root(name)).not.toBeNull();
    checked += expectHostileProof(root(name));
    expectCallsResolved(buildCalls, root(name));
    expect(root(name).style.item(0)).toBe("all");
  }
  expect(checked).toBeGreaterThanOrEqual(12);
});

test("the panel is a Bevel surface holding a Bevel input and Bevel buttons", () => {
  const panel = root("panel");
  expect(last(buildCalls, panel, "background")).toBe(TOKENS.surface);
  expect(last(buildCalls, panel, "color")).toBe(TOKENS.ink);
  expect(last(buildCalls, panel, "font")).toContain(FONT_SANS);

  const input = part("input");
  expect(input.localName).toBe("textarea");
  expect(last(buildCalls, input, "background")).toBe(TOKENS.ground);
  expect(last(buildCalls, input, "border")).toBe(`1px solid ${TOKENS["line-2"]}`);
  expect(input.style.getPropertyValue("resize")).toBe("none");

  expect(panel.style.getPropertyValue("border-radius")).toBe("12px");
  expect(part("pointer")).not.toBeNull();
  // Compose only: Send, and the panel's own note. Stop, Keep, Revert and the reply's
  // warnings belong to the bar now.
  for (const name of ["stop", "keep", "revert", "warnings"]) {
    expect([name, panel.querySelector(`[data-clay-ai-edit-part="${name}"]`)]).toEqual([name, null]);
  }
  expect(last(buildCalls, part("send"), "background")).toBe(TOKENS.ink);
  expect(part("send").localName).toBe("button");
  expect(part("send").firstElementChild.localName).toBe("span");
});

test("ring, chip and bubble keep their shapes, sizes and placement in Bevel material", () => {
  const ring = root("ring");
  expect(last(buildCalls, ring, "border")).toBe(`2px solid ${TOKENS.brass}`);
  expect(ring.style.getPropertyValue("pointer-events")).toBe("none");
  expect(ring.style.getPropertyValue("border-radius")).toBe("0");

  const chip = root("chip");
  const bubble = root("bubble");
  expect(chip.style.getPropertyValue("width")).toBe("26px");
  expect(chip.style.getPropertyValue("height")).toBe("26px");
  expect(bubble.style.getPropertyValue("width")).toBe("40px");
  expect(bubble.style.getPropertyValue("height")).toBe("40px");
  expect(bubble.style.getPropertyValue("position")).toBe("fixed");
  expect(bubble.style.getPropertyValue("right")).toBe("16px");
  expect(bubble.style.getPropertyValue("bottom")).toBe("16px");
  for (const el of [chip, bubble]) {
    expect(el.style.getPropertyValue("border-radius")).toBe("0");
    expect(el.textContent).toBe("AI");
  }
  expect(chip.title).toBe("Comment on this (⌘J)");
  expect(bubble.title).toBe("Comment on the whole page");
});

test("hidden chrome carries display:none !important and shown chrome does not", () => {
  const display = (el) => [el.style.getPropertyValue("display"), el.style.getPropertyPriority("display")];
  expect(root("panel").hidden).toBe(true);
  expect(display(root("panel"))).toEqual(["none", "important"]);
  expect(display(root("chip"))).toEqual(["none", "important"]);
  expect(display(root("ring"))).toEqual(["none", "important"]);
  expect(display(root("status-bar"))).toEqual(["none", "important"]);
  expect(display(root("bubble"))[0]).not.toBe("none");
  for (const name of ["bar-stop", "bar-keep", "bar-revert", "bar-close"]) {
    expect([name, part(name).hidden]).toEqual([name, true]);
    expect([name, ...display(part(name))]).toEqual([name, "none", "important"]);
  }

  openOnSection();
  expect(root("panel").hidden).toBe(false);
  expect(display(root("panel"))).toEqual(["block", "important"]);
  expect(display(root("ring"))).toEqual(["block", "important"]);
  expect(part("send").hidden).toBe(false);
  expect(display(part("send"))).toEqual(["inline-flex", "important"]);
  // Nothing has been sent, so no part of a live edit is on screen.
  expect(display(root("status-bar"))).toEqual(["none", "important"]);

  // A Bevel button repaints its whole inline style on hover, press and focus; the
  // hidden ones must come out of that still hidden.
  for (const name of ["bar-stop", "bar-keep", "bar-revert", "bar-close"]) {
    const el = part(name);
    for (const type of ["pointerenter", "pointerdown", "pointerup", "pointerleave"]) el.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focus"));
    el.dispatchEvent(new FocusEvent("blur"));
    expect([name, ...display(el)]).toEqual([name, "none", "important"]);
  }
});

test("the status bar is a compact fixed Bevel surface with a flexible speaking line", () => {
  const bar = root("status-bar");
  expect(last(buildCalls, bar, "background")).toBe(TOKENS.surface);
  expect(last(buildCalls, bar, "color")).toBe(TOKENS.ink);
  expect(last(buildCalls, bar, "font")).toContain(FONT_SANS);
  expect(last(buildCalls, bar, "box-shadow")).toBe(SHADOW);
  expect(bar.style.getPropertyValue("position")).toBe("fixed");
  expect(bar.style.getPropertyValue("left")).toBe("50%");
  expect(bar.style.getPropertyValue("bottom")).toBe("16px");
  expect(bar.style.getPropertyValue("z-index")).toBe("99999");
  expect(bar.style.getPropertyValue("padding")).toBe("8px 10px");
  expect(last(buildCalls, bar, "width")).toBe("min(35rem, calc(100vw - 32px))");
  expect(last(buildCalls, bar, "transform")).toBe("translateX(-50%)");

  // One row, and the line is the part that gives way, so the controls cannot be pushed
  // off a 375px screen; the full wording stays in the DOM and in the accessible name
  // while the line ellipsises.
  const status = part("bar-status");
  expect(last(buildCalls, status, "flex")).toBe("1");
  expect(status.style.getPropertyValue("min-width")).toBe("0");
  expect(status.style.getPropertyValue("overflow")).toBe("hidden");
  expect(status.style.getPropertyValue("text-overflow")).toBe("ellipsis");
  expect(status.style.getPropertyValue("white-space")).toBe("nowrap");
  expect(last(buildCalls, status, "color")).toBe(TOKENS.muted);
  expect(last(buildCalls, status, "font")).toContain(FONT_MONO);
  expect(status.getAttribute("role")).toBe("status");
  expect(status.getAttribute("aria-live")).toBe("polite");

  expect(last(buildCalls, part("bar-stop"), "background")).toBe(TOKENS.face);
  expect(last(buildCalls, part("bar-keep"), "background")).toBe(TOKENS.ink);
  expect(last(buildCalls, part("bar-revert"), "color")).toBe(TOKENS.brass);
  for (const name of ["bar-stop", "bar-keep", "bar-revert", "bar-close"]) {
    expect([name, part(name).localName]).toEqual([name, "button"]);
    expect([name, last(buildCalls, part(name), "flex")]).toEqual([name, "none"]);
  }
  const close = part("bar-close");
  expect(close.getAttribute("aria-label")).toBe("Dismiss error");
  expect(close.title).toBe("Dismiss error");
  expect(close.querySelector("svg")).not.toBeNull();
});

test("the bar takes the page's scheme when it appears, and Stop takes it away", async () => {
  document.documentElement.style.setProperty("color-scheme", "dark");
  openOnSection();
  part("input").value = "tighten this";
  await captureAsync(async () => {
    part("send").click();
    await flush();
  });
  expect(root("panel").hidden).toBe(true);
  expect(root("status-bar").hidden).toBe(false);
  expect(root("status-bar").style.getPropertyValue("color-scheme")).toBe("dark");
  expect(part("bar-status").textContent).toBe("Sending…");
  expect([part("bar-stop").hidden, part("bar-stop").style.getPropertyValue("display")]).toEqual([false, "inline-flex"]);
  for (const name of ["bar-keep", "bar-revert", "bar-close"]) {
    expect([name, part(name).hidden]).toEqual([name, true]);
  }

  part("bar-stop").click();
  expect(root("status-bar").hidden).toBe(true);
  expect(root("status-bar").style.getPropertyValue("display")).toBe("none");
});

test("a host failure is spoken by the bar in the warning colour, with X to close it", async () => {
  fakeWire.send.mockImplementationOnce(() => ({
    id: "h", done: Promise.resolve({ state: "error", error: "the helper reported an error" }), cancel: jest.fn(),
  }));
  openOnSection();
  part("input").value = "tighten this";
  const calls = await captureAsync(async () => {
    part("send").click();
    await flush();
  });
  const status = part("bar-status");
  expect(root("status-bar").hidden).toBe(false);
  expect(status.textContent).toBe("the helper reported an error");
  expect(status.getAttribute("data-tone")).toBe("warn");
  expect(last(calls, status, "color")).toBe(TOKENS.ox);
  expect([part("bar-close").hidden, part("bar-keep").hidden]).toEqual([false, true]);
});

test("a request too large is the panel's own warning, in the panel's own tone", () => {
  openOnSection();
  const status = part("status");
  part("input").value = "x".repeat(1000 * 1024);
  const calls = capture(() => part("send").click());
  expect(status.getAttribute("data-tone")).toBe("warn");
  expect(last(calls, status, "color")).toBe(TOKENS.ox);
  // Nothing was sent, so the box stays open with its text and no bar appears.
  expect(root("panel").hidden).toBe(false);
  expect(part("input").value.length).toBe(1000 * 1024);
  expect(root("status-bar").hidden).toBe(true);
  expect([part("send").hidden, part("send").style.getPropertyValue("display")]).toEqual([false, "inline-flex"]);
});

test("position writes are !important and geometry is never in the base rules", () => {
  const geometry = ["left", "top", "width", "height"];
  for (const prop of geometry) {
    expect([prop, last(buildCalls, root("ring"), prop)]).toEqual([prop, null]);
  }
  for (const name of ["chip", "panel"]) {
    for (const prop of ["left", "top"]) {
      expect([name, prop, last(buildCalls, root(name), prop)]).toEqual([name, prop, null]);
    }
  }

  openOnSection();
  for (const prop of geometry) {
    expect([prop, root("ring").style.getPropertyPriority(prop)]).toEqual([prop, "important"]);
  }
  for (const prop of ["left", "top"]) {
    expect([prop, root("panel").style.getPropertyPriority(prop)]).toEqual([prop, "important"]);
  }

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  document.querySelector("h1").dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  expect(root("chip").hidden).toBe(false);
  for (const prop of ["left", "top"]) {
    expect([prop, root("chip").style.getPropertyPriority(prop)]).toEqual([prop, "important"]);
  }
});

test("the contenteditable focus rule is still shipped, verbatim, in a runtime-only style", () => {
  const styles = [...document.head.querySelectorAll('style[clay="no-save no-watch no-snapshot"]')];
  const holder = styles.find((s) => s.textContent.includes("[editmode\\:contenteditable][contenteditable]:focus"));
  expect(holder).toBeDefined();
  expect(holder.textContent).toContain(FOCUS_RULE);
});

test("the panel and ring take the page's scheme when the panel opens", () => {
  document.documentElement.style.setProperty("color-scheme", "dark");
  openOnSection();
  expect(root("panel").style.getPropertyValue("color-scheme")).toBe("dark");
  expect(root("ring").style.getPropertyValue("color-scheme")).toBe("dark");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

  document.documentElement.style.setProperty("color-scheme", "light");
  openOnSection();
  expect(root("panel").style.getPropertyValue("color-scheme")).toBe("light");
});

test("the bubble sits just left of the CMS toggle", async () => {
  const toggle = document.createElement("hypercms-toggle");
  toggle.setAttribute("data-hcms-toggle-host", "");
  toggle.getBoundingClientRect = () => ({ left: 800, right: 960, top: 744, bottom: 784, width: 160, height: 40 });
  const innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const innerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 800 });
  document.body.append(toggle);
  try {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const bubble = root("bubble");
    expect(bubble.style.getPropertyValue("right")).toBe("208px");
    expect(bubble.style.getPropertyValue("bottom")).toBe("16px");
    expect(bubble.style.getPropertyPriority("right")).toBe("important");
    expect(bubble.style.getPropertyPriority("bottom")).toBe("important");
  } finally {
    toggle.remove();
    Object.defineProperty(window, "innerWidth", innerWidth);
    Object.defineProperty(window, "innerHeight", innerHeight);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(root("bubble").style.getPropertyValue("right")).toBe("16px");
  expect(root("bubble").style.getPropertyValue("bottom")).toBe("16px");
});

test("a second click keeps a typed comment", () => {
  const bubble = root("bubble");
  bubble.click();
  expect(root("panel").hidden).toBe(false);

  part("input").value = "x";
  bubble.click();

  expect(root("panel").hidden).toBe(false);
  expect(part("input").value).toBe("x");
});

test("a second click on the bubble closes the whole-page panel", () => {
  const bubble = root("bubble");
  bubble.click();
  expect(root("panel").hidden).toBe(false);
  bubble.click();
  expect(root("panel").hidden).toBe(true);
});
