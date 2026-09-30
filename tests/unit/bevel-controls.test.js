import { jest } from "@jest/globals";
import {
  bevelButton,
  bevelIconButton,
  bevelSurface,
  bevelText,
  bevelWell,
  setShown,
  RUNTIME_ONLY,
} from "../../src/ui/bevel-controls.js";
import * as bevelControls from "../../src/ui/bevel-controls.js";
import { RULES, TOKENS, SHADOW } from "../../src/ui/bevel.js";

/**
 * These controls ride on inline !important declarations, and hover/press/focus are
 * rebuilt from flags rather than from pseudo-classes, so what a test has to see is the
 * exact set of declarations each state writes.
 *
 * jsdom (cssstyle 2.3) silently drops any value it cannot parse: every light-dark() and
 * color-mix() colour, and the whole `translate` property. A pressed button's border-color
 * and a resting one's both read back as "", which would let the state tests pass without
 * proving anything, and there is no cssText substring to fall back on either -- the
 * declaration is gone, not reformatted. So `capture` records the setProperty calls
 * hostile-css really makes, and the state assertions read the last declaration each state
 * wrote for a property on a given element. Properties jsdom does keep (outline, opacity,
 * cursor, width, box-shadow) are asserted off the element itself as well.
 */

const value = (rules, prop) => rules.find((r) => r.startsWith(`${prop}:`)).slice(prop.length + 1).trim();
const tidy = (text) => text.replace(/\s+/g, " ").trim();

function capture(run) {
  const calls = [];
  const proto = window.CSSStyleDeclaration.prototype;
  const original = proto.setProperty;
  proto.setProperty = function (name, value, priority) {
    calls.push({ style: this, name, value, priority });
    return original.call(this, name, value, priority);
  };
  try {
    run();
  } finally {
    proto.setProperty = original;
  }
  return calls;
}

const last = (calls, el, name) => {
  const hits = calls.filter((call) => call.style === el.style && call.name === name);
  return hits.length ? hits[hits.length - 1].value : null;
};

const press = (el, type, init = {}) => capture(() => el.dispatchEvent(new MouseEvent(type, init)));

test("structure: a real button with a label span, every declaration !important", () => {
  const b = bevelButton("Review");

  expect(b.tagName).toBe("BUTTON");
  expect(b.type).toBe("button");
  expect(b.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
  expect(b.getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(b.childElementCount).toBe(1);
  expect(b.firstChild.tagName).toBe("SPAN");
  expect(b.firstChild.textContent).toBe("Review");

  for (const el of [b, b.firstChild]) {
    expect(el.style.length).toBeGreaterThan(0);
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style.item(i);
      expect(el.style.getPropertyPriority(prop)).toBe("important");
    }
  }

  // jsdom keeps only what it can parse, so the loop above never sees the light-dark()
  // colours; every declaration the control writes, dropped or not, has to be !important.
  const calls = capture(() => bevelButton("Review"));
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) expect(call.priority).toBe("important");
});

test("press: pointerdown flips the bevel and nudges the label, pointerup restores both", () => {
  const b = bevelButton("Review");
  const span = b.firstChild;
  const rest = value(RULES.button, "border-color");
  const pressed = value(RULES.buttonActive, "border-color");
  expect(pressed).not.toBe(rest);

  const down = press(b, "pointerdown");
  expect(last(down, b, "border-color")).toBe(pressed);
  expect(last(down, span, "translate")).toBe(value(RULES.buttonActiveLabel, "translate"));

  const up = press(b, "pointerup");
  expect(last(up, b, "border-color")).toBe(rest);
  expect(last(up, span, "translate")).toBeNull();
  expect(span.style.getPropertyValue("translate")).toBe("");
});

test("keyboard press: space and enter press, keyup restores", () => {
  const b = bevelButton("Review");
  const rest = value(RULES.button, "border-color");

  for (const key of [" ", "Enter"]) {
    const down = capture(() => b.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    expect(last(down, b, "border-color")).toBe(value(RULES.buttonActive, "border-color"));

    const up = capture(() => b.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true })));
    expect(last(up, b, "border-color")).toBe(rest);
  }
});

test("no lingering: hover, press, then leave ends on the rest declarations", () => {
  const b = bevelButton("Review");

  const entered = press(b, "pointerenter");
  expect(last(entered, b, "background")).toBe(value(RULES.buttonHover, "background"));

  const down = press(b, "pointerdown");
  expect(last(down, b, "border-color")).toBe(value(RULES.buttonActive, "border-color"));

  const left = press(b, "pointerleave");
  expect(last(left, b, "background")).toBe(value(RULES.button, "background"));
  expect(last(left, b, "border-color")).toBe(value(RULES.button, "border-color"));
  expect(last(left, b.firstChild, "translate")).toBeNull();
});

test("focus: keyboard modality draws the ring, blur takes it away", () => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  const b = bevelButton("Review");
  b.dispatchEvent(new FocusEvent("focus"));

  expect(b.style.getPropertyValue("outline")).toContain("2px solid");
  expect(tidy(b.style.getPropertyValue("outline"))).toBe(tidy(value(RULES.focus, "outline")));
  expect(b.style.getPropertyValue("outline-offset")).toBe(value(RULES.focus, "outline-offset"));

  b.dispatchEvent(new FocusEvent("blur"));
  expect(["", "none"]).toContain(b.style.getPropertyValue("outline"));

  document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
});

test("primary: ink fills the button", () => {
  let b;
  const calls = capture(() => { b = bevelButton("Accept", { variant: "primary" }); });

  expect(tidy(last(calls, b, "background"))).toBe(tidy(TOKENS.ink));
  expect(tidy(last(calls, b, "color"))).toBe(tidy(TOKENS.ground));
});

test("disabled: aria-disabled, the dimmed face, and a click that does not land", () => {
  const onClick = jest.fn();
  const b = bevelButton("Save", { onClick });

  const off = capture(() => b.setDisabled(true));
  expect(b.getAttribute("aria-disabled")).toBe("true");
  expect(b.isDisabled()).toBe(true);
  expect(last(off, b, "opacity")).toBe(value(RULES.buttonDisabled, "opacity"));
  expect(last(off, b, "cursor")).toBe(value(RULES.buttonDisabled, "cursor"));
  expect(b.style.getPropertyValue("cursor")).toBe("not-allowed");

  const blocked = new MouseEvent("click", { bubbles: true, cancelable: true });
  b.dispatchEvent(blocked);
  expect(onClick).not.toHaveBeenCalled();
  expect(blocked.defaultPrevented).toBe(true);

  b.setDisabled(false);
  expect(b.getAttribute("aria-disabled")).toBeNull();
  expect(b.isDisabled()).toBe(false);
  expect(b.style.getPropertyValue("opacity")).toBe("");

  b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("well and surface: the recess is carved, the surface floats", () => {
  let well;
  const calls = capture(() => { well = bevelWell(); });

  expect(last(calls, well, "border-color")).toBe(value(RULES.recess, "border-color"));
  expect(last(calls, well, "background")).toBe(value(RULES.recess, "background"));
  expect(well.style.getPropertyValue("border")).toBe("2px solid");
  expect(well.getAttribute("clay")).toBe(RUNTIME_ONLY);

  const surface = bevelSurface("div");
  expect(tidy(surface.style.getPropertyValue("box-shadow"))).toBe(tidy(SHADOW));
  expect(surface.getAttribute("clay")).toBe(RUNTIME_ONLY);
});

test("label: setLabel swaps the text and adds no node", () => {
  const b = bevelButton("Review");
  b.setLabel("Saving…");

  expect(b.firstChild.textContent).toBe("Saving…");
  expect(b.textContent).toBe("Saving…");
  expect(b.childElementCount).toBe(1);
});

test("icon button: 26px square through hover and press", () => {
  const b = bevelIconButton("<svg></svg>", { label: "Minimize" });

  expect(b.getAttribute("aria-label")).toBe("Minimize");
  expect(b.title).toBe("Minimize");
  expect(b.firstChild.innerHTML).toContain("<svg");
  expect(b.style.getPropertyValue("width")).toBe("26px");
  expect(b.style.getPropertyValue("height")).toBe("26px");

  press(b, "pointerenter");
  press(b, "pointerdown");

  expect(b.style.getPropertyValue("width")).toBe("26px");
  expect(b.style.getPropertyValue("height")).toBe("26px");
  expect(b.firstChild.style.getPropertyValue("width")).toBe("12px");
});

test("reset: color-scheme and direction are put back right after all:initial", () => {
  let b, surface, well, text;
  const calls = capture(() => {
    b = bevelButton("Review");
    surface = bevelSurface("div");
    well = bevelWell();
    text = bevelText("span", [], "Saving…");
  });

  const mine = (el) => calls.filter((call) => call.style === el.style);
  for (const el of [b, b.firstChild, surface, well, text]) {
    const first = mine(el).slice(0, 3);
    expect(first.map((call) => [call.name, call.value, call.priority])).toEqual([
      ["all", "initial", "important"],
      ["color-scheme", "inherit", "important"],
      ["direction", "ltr", "important"],
    ]);
  }
});

test("well: text inside keeps the bevel font and the ink colour", () => {
  let well;
  const calls = capture(() => { well = bevelWell(); });

  expect(last(calls, well, "font")).toContain("system-ui");
  expect(last(calls, well, "color")).toBe(TOKENS.ink);
});

test("variants: hover and press compose, each variant's own recipes", () => {
  const danger = bevelButton("Delete", { variant: "danger" });
  const hovered = press(danger, "pointerenter");
  expect(last(hovered, danger, "background")).toBe(value(RULES.buttonDangerHover, "background"));

  const primary = bevelButton("Accept", { variant: "primary" });
  press(primary, "pointerenter");
  const down = press(primary, "pointerdown");
  expect(last(down, primary, "background")).toBe(value(RULES.buttonPrimaryHover, "background"));
  expect(last(down, primary, "border-color")).toBe(value(RULES.buttonPrimaryActive, "border-color"));

  const quiet = bevelButton("Hide", { variant: "quiet" });
  press(quiet, "pointerenter");
  const quietDown = press(quiet, "pointerdown");
  expect(last(quietDown, quiet, "border-color")).toBe("transparent");

  const plain = bevelButton("Review");
  press(plain, "pointerenter");
  press(plain, "pointerdown");
  const up = press(plain, "pointerup");
  expect(last(up, plain, "background")).toBe(value(RULES.buttonHover, "background"));
  expect(last(up, plain, "background")).not.toBe(value(RULES.button, "background"));
});

test("right-click: a secondary button never presses the bevel", () => {
  const b = bevelButton("Review");
  const calls = press(b, "pointerdown", { button: 2 });

  expect(last(calls, b, "border-color")).toBeNull();
  expect(calls).toHaveLength(0);
});

test("click: the press an Enter started is cleared when the click lands", () => {
  const b = bevelButton("Review");
  const rest = value(RULES.button, "border-color");

  const down = capture(() => b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(last(down, b, "border-color")).toBe(value(RULES.buttonActive, "border-color"));

  const calls = capture(() => b.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(last(calls, b, "border-color")).toBe(rest);
});

test("focus ring: keyboard use after pointer focus still draws it", () => {
  document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  const b = bevelButton("Review");

  b.dispatchEvent(new FocusEvent("focus"));
  expect(b.style.getPropertyValue("outline")).not.toContain("2px solid");

  const calls = capture(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
  expect(b.style.getPropertyValue("outline")).toContain("2px solid");
  expect(tidy(last(calls, b, "outline"))).toBe(tidy(value(RULES.focus, "outline")));

  b.dispatchEvent(new FocusEvent("blur"));
});

test("icon: the glyph is pinned against a page that resets and repaints", () => {
  let b;
  const calls = capture(() => {
    b = bevelIconButton('<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 9.5h7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>', { label: "Minimize" });
  });
  const svg = b.firstChild.firstElementChild;
  const path = svg.firstElementChild;

  expect(svg.getAttribute("clay")).toBe(RUNTIME_ONLY);
  expect(svg.style.getPropertyValue("width")).toBe("12px");
  expect(svg.style.getPropertyPriority("width")).toBe("important");
  expect(svg.style.getPropertyValue("display")).toBe("block");

  expect(last(calls, path, "stroke")).toBe("currentColor");
  expect(last(calls, path, "fill")).toBe("none");
  expect(last(calls, path, "stroke-width")).toBe("1.8");
  for (const call of calls.filter((call) => call.style === path.style)) {
    expect(call.priority).toBe("important");
  }
});

test("exports: set and style are not re-exported", () => {
  expect(bevelControls.set).toBeUndefined();
  expect(bevelControls.style).toBeUndefined();
});

test("pin: a pinned declaration outlives hover, press, focus and blur rebuilds", () => {
  const b = bevelButton("Go", { extra: ["position:fixed"] });
  document.body.append(b);
  b.pin({ left: "40px", top: "12px" });
  setShown(b, false, "inline-flex");
  for (const type of ["pointerenter", "pointerdown", "pointerup", "pointerleave"]) b.dispatchEvent(new MouseEvent(type));
  b.focus();
  b.blur();
  expect(b.hidden).toBe(true);
  for (const [prop, want] of [["left", "40px"], ["top", "12px"], ["display", "none"], ["position", "fixed"]]) {
    expect([prop, b.style.getPropertyValue(prop), b.style.getPropertyPriority(prop)]).toEqual([prop, want, "important"]);
  }
  setShown(b, true, "inline-flex");
  b.dispatchEvent(new MouseEvent("pointerenter"));
  expect(b.hidden).toBe(false);
  expect(b.style.getPropertyValue("display")).toBe("inline-flex");
  expect(b.style.getPropertyValue("left")).toBe("40px");
  b.remove();
});

test("setShown: a plain element gets the attribute and an !important display", () => {
  const el = document.createElement("div");
  setShown(el, false);
  expect([el.hidden, el.style.getPropertyValue("display"), el.style.getPropertyPriority("display")]).toEqual([true, "none", "important"]);
  setShown(el, true, "flex");
  expect([el.hidden, el.style.getPropertyValue("display"), el.style.getPropertyPriority("display")]).toEqual([false, "flex", "important"]);
});

test("pageScheme: the page's declared scheme wins, otherwise the reader's preference", () => {
  document.documentElement.style.colorScheme = "dark";
  expect(bevelControls.pageScheme()).toBe("dark");
  document.documentElement.style.colorScheme = "light";
  expect(bevelControls.pageScheme()).toBe("light");
  document.documentElement.style.colorScheme = "light dark";
  expect(bevelControls.pageScheme()).toBe("light dark");
  document.documentElement.style.colorScheme = "";
  expect(bevelControls.pageScheme()).toBe("light dark");
});
