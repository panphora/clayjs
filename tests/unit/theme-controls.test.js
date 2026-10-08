import {
  bevelBox,
  bevelButton,
  bevelInput,
  bevelSurface,
  bevelText,
  bevelWell,
  paintInput,
} from "../../src/ui/bevel-controls.js";
import { parseColor } from "../../src/ui/theme.js";

const BEVEL = { bevel: true, tokens: {}, parts: {} };
const light = (tokens = {}, parts = {}) => ({ bevel: false, scheme: "light", tokens, parts });
const PAINT = {
  surface: "#fefefd",
  text: "#263d4e",
  border: "#e0e7ee",
  accent: "#7356ba",
  accentText: "#ffffff",
  font: "Inter",
  radius: "7px",
};

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

const trace = (calls, els) => calls.map((call) => [els.indexOf(call.style), call.name, call.value, call.priority]);
const last = (calls, el, name) => {
  const hits = calls.filter((call) => call.style === el.style && call.name === name);
  return hits.length ? hits[hits.length - 1].value : null;
};
const shown = (el, prop) => parseColor(el.style.getPropertyValue(prop));
const pointer = (el, type, init = {}) => capture(() => el.dispatchEvent(new MouseEvent(type, init)));
const focus = (el, type) => capture(() => el.dispatchEvent(new FocusEvent(type)));

function buttonRun(variant, theme) {
  const calls = [];
  let b;
  calls.push(...capture(() => { b = theme === undefined ? bevelButton("Review", { variant }) : bevelButton("Review", { variant, theme }); }));
  for (const type of ["pointerenter", "pointerdown", "pointerup"]) calls.push(...pointer(b, type));
  calls.push(...focus(b, "focus"));
  calls.push(...focus(b, "blur"));
  calls.push(...capture(() => b.setDisabled(true)));
  calls.push(...pointer(b, "pointerenter"));
  calls.push(...pointer(b, "pointerdown"));
  calls.push(...capture(() => b.setDisabled(false)));
  calls.push(...pointer(b, "pointerleave"));
  return { els: [b, b.firstChild], calls };
}

function inputRun(tag, theme) {
  const calls = [];
  let el;
  calls.push(...capture(() => { el = theme === undefined ? bevelInput(tag) : bevelInput(tag, { theme }); }));
  calls.push(...pointer(el, "pointerenter"));
  calls.push(...pointer(el, "pointerleave"));
  calls.push(...focus(el, "focus"));
  calls.push(...focus(el, "blur"));
  return { els: [el], calls };
}

function paintRun(theme) {
  const calls = [];
  let el;
  calls.push(...capture(() => {
    el = document.createElement("input");
    el.type = "text";
    if (theme === undefined) paintInput(el);
    else paintInput(el, { theme });
  }));
  calls.push(...pointer(el, "pointerenter"));
  calls.push(...pointer(el, "pointerleave"));
  calls.push(...focus(el, "focus"));
  calls.push(...focus(el, "blur"));
  return { els: [el], calls };
}

function buildRun(build) {
  const calls = [];
  let el;
  calls.push(...capture(() => { el = build(); }));
  return { els: [el], calls };
}

function withMedia(queries, run) {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({ matches: queries.includes(query), media: query, addEventListener() {}, removeEventListener() {} });
  try {
    run();
  } finally {
    window.matchMedia = original;
  }
}

function sameWrites(builds) {
  const [plain, nothing, bevel] = builds;
  expect(plain.calls.length).toBeGreaterThan(0);
  expect(trace(nothing.calls, nothing.els)).toEqual(trace(plain.calls, plain.els));
  expect(trace(bevel.calls, bevel.els)).toEqual(trace(plain.calls, plain.els));
}

const equivalence = () => {
  for (const variant of ["default", "primary", "quiet", "danger"]) {
    sameWrites([undefined, null, BEVEL].map((theme) => buttonRun(variant, theme)));
  }

  for (const tag of ["input", "textarea"]) {
    sameWrites([undefined, null, BEVEL].map((theme) => inputRun(tag, theme)));
  }

  sameWrites([undefined, null, BEVEL].map((theme) => paintRun(theme)));

  sameWrites([undefined, null, BEVEL].map((theme) => buildRun(() => (
    theme === undefined ? bevelSurface("div", ["display:block"]) : bevelSurface("div", ["display:block"], { theme })
  ))));
  sameWrites([undefined, null, BEVEL].map((theme) => buildRun(() => (
    theme === undefined ? bevelWell(["flex:1 1 auto"]) : bevelWell(["flex:1 1 auto"], { theme })
  ))));
  sameWrites([undefined, null, BEVEL].map((theme) => buildRun(() => (
    theme === undefined ? bevelText("span", ["display:block"], "Saving…") : bevelText("span", ["display:block"], "Saving…", { theme })
  ))));
  sameWrites([undefined, null, BEVEL].map((theme) => buildRun(() => (
    theme === undefined ? bevelBox("div", ["display:block"]) : bevelBox("div", ["display:block"], { theme })
  ))));
};

test("unthemed equivalence: no theme, a null theme and the Bevel theme write the same declarations", () => {
  equivalence();
  withMedia(["(max-width: 760px)", "(pointer: coarse)", "(forced-colors: active)"], equivalence);
});

test("tokens: a themed button paints its rest face, ink, edge, radius and font", () => {
  const b = bevelButton("Review", { theme: light(PAINT) });

  expect(shown(b, "background")).toEqual(parseColor(PAINT.surface));
  expect(shown(b, "color")).toEqual(parseColor(PAINT.text));
  for (const side of ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"]) {
    expect(shown(b, side)).toEqual(parseColor(PAINT.border));
  }
  expect(b.style.getPropertyValue("border-radius")).toBe(PAINT.radius);
  expect(b.style.getPropertyValue("font-family")).toBe(PAINT.font);
});

test("tokens: a primary button takes the accent and the ink that sits on it", () => {
  const b = bevelButton("Accept", { variant: "primary", theme: light(PAINT) });

  expect(shown(b, "background")).toEqual(parseColor(PAINT.accent));
  expect(shown(b, "color")).toEqual(parseColor(PAINT.accentText));
});

test("states: part declarations hold across a repaint into hover and back", () => {
  const theme = light({}, { "button.primary": { base: { background: "#111111" } } });
  const b = bevelButton("Accept", { variant: "primary", theme });

  expect(shown(b, "background")).toEqual(parseColor("#111111"));
  pointer(b, "pointerenter");
  expect(shown(b, "background")).toEqual(parseColor("#111111"));
  pointer(b, "pointerleave");
  expect(shown(b, "background")).toEqual(parseColor("#111111"));

  const rounded = bevelButton("Review", { theme: light({}, { button: { base: { "border-radius": "13px" } } }) });
  expect(rounded.style.getPropertyValue("border-radius")).toBe("13px");
  pointer(rounded, "pointerenter");
  expect(rounded.style.getPropertyValue("border-radius")).toBe("13px");
  pointer(rounded, "pointerleave");
  expect(rounded.style.getPropertyValue("border-radius")).toBe("13px");
});

test("precedence: parts apply name by name, general to specific, base then states", () => {
  const general = light({}, {
    button: { hover: { background: "#aaaaaa" } },
    "button.primary": { base: { background: "#111111" } },
  });
  const b = bevelButton("Accept", { variant: "primary", theme: general });
  pointer(b, "pointerenter");
  expect(shown(b, "background")).toEqual(parseColor("#111111"));

  const specific = light({}, {
    button: { hover: { background: "#aaaaaa" } },
    "button.primary": { base: { background: "#111111" }, hover: { background: "#222222" } },
  });
  const c = bevelButton("Accept", { variant: "primary", theme: specific });
  pointer(c, "pointerenter");
  expect(shown(c, "background")).toEqual(parseColor("#222222"));
});

test("departed state: a hover block's property is gone once the pointer leaves", () => {
  const bare = bevelButton("Review");
  const b = bevelButton("Review", { theme: light({}, { button: { hover: { "outline-offset": "3px" } } }) });

  expect(b.style.getPropertyValue("outline-offset")).toBe(bare.style.getPropertyValue("outline-offset"));
  pointer(b, "pointerenter");
  expect(b.style.getPropertyValue("outline-offset")).toBe("3px");
  pointer(b, "pointerleave");
  expect(b.style.getPropertyValue("outline-offset")).toBe(bare.style.getPropertyValue("outline-offset"));
});

test("disabled: hover and pressed blocks are suppressed, the disabled block applies", () => {
  const theme = light({}, {
    button: {
      hover: { background: "#aaaaaa" },
      active: { background: "#bbbbbb" },
      disabled: { opacity: ".5" },
    },
  });
  const b = bevelButton("Save", { theme });
  b.setDisabled(true);

  const over = pointer(b, "pointerenter");
  expect(over.some((call) => call.style === b.style && call.value === "#aaaaaa")).toBe(false);
  expect(pointer(b, "pointerdown")).toHaveLength(0);
  expect(Number(b.style.getPropertyValue("opacity"))).toBe(0.5);
  expect(shown(b, "background")).not.toEqual(parseColor("#aaaaaa"));

  b.setDisabled(false);
  pointer(b, "pointerenter");
  expect(shown(b, "background")).toEqual(parseColor("#aaaaaa"));
  pointer(b, "pointerdown");
  expect(shown(b, "background")).toEqual(parseColor("#bbbbbb"));
});

test("floor: a keyword height still gets the plain floor, and the theme's size the max() one", () => {
  withMedia(["(max-width: 760px)"], () => {
    let b;
    const calls = capture(() => { b = bevelButton("Go", { theme: light({}, { button: { base: { "min-height": "auto" } } }) }); });
    const written = calls.filter((call) => call.style === b.style && call.name === "min-height").map((call) => call.value);
    expect(written).toContain("auto");
    expect(written.indexOf("auto")).toBeLessThan(written.lastIndexOf("44px"));
    expect(written.slice(-2)).toEqual(["44px", "max(44px, auto)"]);
  });

  withMedia(["(pointer: coarse)"], () => {
    const tall = bevelButton("Go", { theme: light({ buttonHeight: "48px" }) });
    expect(tall.style.getPropertyValue("min-height")).toBe("max(40px, 48px)");

    let input;
    const calls = capture(() => { input = bevelInput("input", { theme: light({}, { input: { base: { "font-size": "14px" } } }) }); });
    const sizes = calls.filter((call) => call.style === input.style && call.name === "font-size").map((call) => call.value);
    expect(sizes.slice(-2)).toEqual(["16px", "max(16px, 14px)"]);
  });
});

test("input: a disabled field takes its disabled part and drops hover", () => {
  const theme = light({}, { input: { hover: { "outline-offset": "3px" }, disabled: { opacity: ".4" } } });
  const el = bevelInput("input", { theme });
  el.disabled = true;

  const over = pointer(el, "pointerenter");
  expect(over.some((call) => call.style === el.style && call.name === "outline-offset")).toBe(false);
  expect(Number(el.style.getPropertyValue("opacity"))).toBe(0.4);

  el.disabled = false;
  const back = pointer(el, "pointerenter");
  expect(last(back, el, "outline-offset")).toBe("3px");
});

test("neutral: hover takes a page background that differs from the surface", () => {
  const b = bevelButton("Review", { theme: light({ surface: "#ffffff", text: "#000000", background: "#ffcc00" }) });
  const over = pointer(b, "pointerenter");
  expect(last(over, b, "background")).toBe("#ffcc00");

  const plain = bevelButton("Review", { theme: light({ surface: "#ffffff" }) });
  const hovered = pointer(plain, "pointerenter");
  expect(last(hovered, plain, "background")).toBe("color-mix(in srgb, #ffffff, currentColor 7%)");
});

test("phone floor: the 44px touch target outlives a themed buttonHeight", () => {
  const original = window.matchMedia;
  const width = (px) => {
    window.matchMedia = (query) => ({ matches: query === "(max-width: 760px)" && px <= 760, media: query, addEventListener() {}, removeEventListener() {} });
  };
  try {
    width(390);
    const short = bevelButton("Continue", { theme: light({ buttonHeight: "32px" }) });
    expect(short.style.getPropertyValue("min-height")).toBe("max(44px, 32px)");
    expect(short.style.getPropertyPriority("min-height")).toBe("important");

    const tall = bevelButton("Continue", { theme: light({ buttonHeight: "52px" }) });
    expect(tall.style.getPropertyValue("min-height")).toBe("max(44px, 52px)");

    width(1280);
    const wide = bevelButton("Continue", { theme: light({ buttonHeight: "32px" }) });
    expect(wide.style.getPropertyValue("min-height")).toBe("32px");
  } finally {
    window.matchMedia = original;
  }
});

test("pin: a pinned declaration survives a themed repaint", () => {
  const b = bevelButton("Go", { theme: light(PAINT, { button: { hover: { background: "#aaaaaa" } } }) });
  b.pin({ display: "none" });

  pointer(b, "pointerenter");
  expect(b.style.getPropertyValue("display")).toBe("none");
  expect(b.style.getPropertyPriority("display")).toBe("important");
  expect(shown(b, "background")).toEqual(parseColor("#aaaaaa"));
});

test("input: a themed textarea keeps its dragged height and takes the accent ring on focus", () => {
  const area = bevelInput("textarea", { rules: ["min-height:3.2em", "resize:vertical"], theme: light(PAINT) });

  expect(shown(area, "background")).toEqual(parseColor(PAINT.surface));
  expect(shown(area, "color")).toEqual(parseColor(PAINT.text));
  area.style.height = "140px";

  const focused = focus(area, "focus");
  expect(last(focused, area, "outline")).toBe(`2px solid ${PAINT.accent}`);
  expect(last(focused, area, "border-color")).toBe(PAINT.accent);
  expect(area.style.getPropertyValue("height")).toBe("140px");

  focus(area, "blur");
  expect(area.style.getPropertyValue("height")).toBe("140px");
  expect(area.style.getPropertyPriority("height")).toBe("important");
});

test("importance: every declaration a themed helper writes is !important", () => {
  const theme = light(PAINT, {
    button: { hover: { background: "#aaaaaa" } },
    "button.primary": { base: { background: "#111111" } },
    input: { hover: { "outline-offset": "2px" } },
  });
  const calls = [];
  let b, area, surface, well, text, box;
  calls.push(...capture(() => {
    b = bevelButton("Accept", { variant: "primary", theme, parts: ["dialog.button"], labelParts: ["dialog.buttonLabel"] });
    area = bevelInput("input", { theme });
    surface = bevelSurface("div", [], { theme, parts: ["dialog.panel"] });
    well = bevelWell([], { theme, parts: ["dialog.well"] });
    text = bevelText("span", [], "Saving…", { theme, parts: ["dialog.hint"] });
    box = bevelBox("div", [], { theme, parts: ["dialog.body"] });
  }));
  calls.push(...pointer(b, "pointerenter"));
  calls.push(...pointer(b, "pointerdown"));
  calls.push(...pointer(area, "pointerenter"));
  calls.push(...focus(area, "focus"));

  expect(calls.length).toBeGreaterThan(0);
  for (const el of [b, b.firstChild, area, surface, well, text, box]) {
    expect(calls.some((call) => call.style === el.style)).toBe(true);
  }
  for (const call of calls) expect([call.name, call.priority]).toEqual([call.name, "important"]);
});

test("data-clay-part: a themed control carries its part names, an unthemed one carries none", () => {
  const b = bevelButton("Accept", { variant: "primary", theme: light(PAINT), parts: ["dialog.button"] });
  expect(b.getAttribute("data-clay-part")).toBe("button button.primary dialog.button");
  expect(b.firstChild.getAttribute("data-clay-part")).toBe("buttonLabel");

  const plain = bevelButton("Accept", { variant: "primary" });
  expect(plain.getAttribute("data-clay-part")).toBeNull();
  expect(plain.firstChild.getAttribute("data-clay-part")).toBeNull();

  const bevel = bevelButton("Accept", { variant: "primary", theme: BEVEL, parts: ["dialog.button"] });
  expect(bevel.getAttribute("data-clay-part")).toBeNull();

  const area = bevelInput("input", { theme: light(PAINT) });
  expect(area.getAttribute("data-clay-part")).toBe("input");
  expect(bevelInput("input").getAttribute("data-clay-part")).toBeNull();

  expect(bevelSurface("div", [], { theme: light(PAINT), parts: ["dialog.panel"] }).getAttribute("data-clay-part")).toBe("dialog.panel");
  expect(bevelWell([], { theme: light(PAINT), parts: ["dialog.well"] }).getAttribute("data-clay-part")).toBe("well dialog.well");
  expect(bevelText("span", [], "x", { theme: light(PAINT), parts: ["dialog.hint"] }).getAttribute("data-clay-part")).toBe("text dialog.hint");
  expect(bevelText("span", [], "x", { theme: light(PAINT), parts: ["dialog.hint"], role: "mutedText" }).getAttribute("data-clay-part")).toBe("mutedText dialog.hint");
  expect(bevelBox("div", [], { theme: light(PAINT), parts: ["dialog.body"], role: "well" }).getAttribute("data-clay-part")).toBe("well dialog.body");
  expect(bevelBox("div", [], { theme: light(PAINT), parts: ["dialog.body"] }).getAttribute("data-clay-part")).toBe("dialog.body");
  expect(bevelSurface("div").getAttribute("data-clay-part")).toBeNull();
});
