import { jest } from "@jest/globals";
import { PART_NAMES, STATES, TOKEN_PROPS, _resetTheme, contrast, parseColor, resolveTheme, theme, validValue } from "../../src/ui/theme.js";

beforeEach(() => {
  _resetTheme();
  delete window.clayTheme;
  delete window.clay;
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
  document.body.innerHTML = "";
});

test("with no configuration the theme is the page's own font and palette", () => {
  document.body.style.fontFamily = "Inter, sans-serif";

  const resolved = resolveTheme();

  expect(resolved.bevel).toBe(false);
  expect(resolved.scheme).toBe("light dark");
  expect(resolved.tokens.font).toBe(getComputedStyle(document.body).fontFamily);
  expect(resolved.tokens.font).toBe("Inter, sans-serif");
  expect(resolved.parts).toEqual({});
});

test("window.clayTheme = false before first use gives the exact Bevel look", () => {
  window.clayTheme = false;

  expect(resolveTheme().bevel).toBe(true);
  expect(window.clay.theme()).toBe(false);
});

test("a preloaded accent token resolves, and accentText is picked for contrast", () => {
  document.body.style.backgroundColor = "#fefefd";
  document.body.style.color = "#263d4e";
  window.clayTheme = { tokens: { accent: "#7356ba" } };

  const { tokens } = resolveTheme();

  expect(tokens.accent).toBe("#7356ba");
  // The page's own surface wins over its text colour on that purple.
  expect(tokens.accentText).toBe(tokens.surface);
  expect(parseColor(tokens.accentText)).toEqual([254, 254, 253, 1]);
  expect(contrast(parseColor(tokens.accent), parseColor(tokens.accentText)))
    .toBeGreaterThan(contrast(parseColor(tokens.accent), parseColor(tokens.text)));
});

test("a dark page with no accent gets its own ink as the primary colour", () => {
  document.body.style.backgroundColor = "rgb(29, 33, 28)";
  document.body.style.color = "rgb(232, 228, 216)";

  const { tokens } = resolveTheme();

  expect(tokens.accent).toBe("rgb(232, 228, 216)");
  expect(tokens.accentText).toBe("rgb(29, 33, 28)");
});

test("an accent the page names still wins over its ink", () => {
  document.body.style.backgroundColor = "rgb(29, 33, 28)";
  document.body.style.color = "rgb(232, 228, 216)";
  theme({ tokens: { accent: "#7356ba" } });

  expect(resolveTheme().tokens.accent).toBe("#7356ba");
});

test("a page with no readable pair gets no accent either", () => {
  document.body.style.backgroundImage = "url(photo.png)";
  document.body.style.color = "#263d4e";
  document.documentElement.style.backgroundColor = "#f8fafc";

  expect(resolveTheme().tokens.accent).toBeUndefined();
});

test("an invalid preloaded theme warns once and falls back to the default", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    window.clayTheme = { tokens: { nope: "x" } };

    expect(resolveTheme().bevel).toBe(false);
    resolveTheme();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ignoring window.clayTheme");
    expect(warn.mock.calls[0][0]).toContain('unknown token "nope"');
    expect(typeof window.clay.theme).toBe("function");
  } finally {
    warn.mockRestore();
  }
});

test("clay.theme replaces, restores, and hands back a copy", () => {
  document.body.style.backgroundColor = "#fefefd";
  document.body.style.color = "#263d4e";
  theme({ tokens: { accent: "#111111" } });
  expect(resolveTheme().tokens.accent).toBe("#111111");

  const clay = window.clay;

  const snapshot = clay.theme();
  snapshot.tokens.accent = "#222222";
  snapshot.parts["people.choice"] = { base: { color: "#222222" } };
  expect(resolveTheme().tokens.accent).toBe("#111111");
  expect(resolveTheme().parts).toEqual({});

  clay.theme(null);
  expect(clay.theme()).toEqual({ auto: true, colorScheme: "page", tokens: {}, parts: {} });
  expect(resolveTheme().tokens.accent).toBe("rgb(38, 61, 78)");

  clay.theme(false);
  expect(resolveTheme().bevel).toBe(true);
  expect(clay.theme()).toBe(false);
});

const REJECTED = [
  ["an unknown option", { nope: true }, /unknown option "nope"/],
  ["an unknown token", { tokens: { nope: "x" } }, /unknown token "nope"/],
  ["an unknown part", { parts: { "people.someSelector": { base: {} } } }, /unknown part "people\.someSelector"/],
  ["an unknown state", { parts: { "people.choice": { clicked: {} } } }, /unknown state "clicked"/],
  ["a value carrying a semicolon", { tokens: { text: "red; color: blue" } }, /not a valid color value/],
  ["a value carrying !important", { tokens: { text: "red !important" } }, /not a valid color value/],
  ["a custom property in parts", { parts: { "people.choice": { base: { "--x": "1" } } } }, /is not a CSS property name/],
];

test.each(REJECTED)("clay.theme rejects %s and keeps the previous theme", (_label, options, message) => {
  document.body.style.backgroundColor = "#fefefd";
  document.body.style.color = "#263d4e";
  theme({ tokens: { accent: "#111111" } });
  const clay = window.clay;

  expect(() => clay.theme(options)).toThrow(TypeError);
  expect(() => clay.theme(options)).toThrow(message);
  expect(resolveTheme().tokens.accent).toBe("#111111");
});

test("validValue rejects what the browser cannot parse", () => {
  globalThis.CSS = { supports: () => false };
  try {
    expect(validValue("background-color", "#7356ba")).toBe(false);
    expect(() => theme({ tokens: { accent: "#7356ba" } })).toThrow(TypeError);
  } finally {
    delete globalThis.CSS;
  }
});

test("an explicit token beats --clay-ui-text, which beats the sample", () => {
  document.body.style.setProperty("--clay-ui-text", "#111111");
  document.body.style.color = "#263d4e";

  expect(getComputedStyle(document.body).getPropertyValue("--clay-ui-text")).toBe("#111111");
  expect(resolveTheme().tokens.text).toBe("#111111");

  theme({ tokens: { text: "#222222" } });
  expect(resolveTheme().tokens.text).toBe("#222222");
});

test("auto:false skips the sample but still reads --clay-ui-*", () => {
  document.body.style.setProperty("--clay-ui-text", "#111111");
  document.body.style.backgroundColor = "#fefefd";
  document.body.style.fontFamily = "Inter, sans-serif";

  theme({ auto: false });
  const { tokens } = resolveTheme();

  expect(tokens.text).toBe("#111111");
  expect(tokens.background).toBeUndefined();
  expect(tokens.font).toBeUndefined();
});

test("a transparent body takes its palette from the root", () => {
  document.body.style.backgroundColor = "transparent";
  document.body.style.color = "#263d4e";
  document.documentElement.style.backgroundColor = "#f8fafc";

  const { tokens } = resolveTheme();

  expect(tokens.background).toBe("rgb(248, 250, 252)");
  expect(tokens.surface).toBe("rgb(248, 250, 252)");
  expect(tokens.text).toBe("rgb(38, 61, 78)");
});

test("a translucent body background gives no palette at all", () => {
  document.body.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
  document.body.style.color = "#263d4e";
  document.documentElement.style.backgroundColor = "#f8fafc";

  const { tokens } = resolveTheme();

  expect(tokens.background).toBeUndefined();
  expect(tokens.surface).toBeUndefined();
  expect(tokens.text).toBeUndefined();
});

test("an image-backed body background gives no palette at all", () => {
  document.body.style.backgroundImage = "url(photo.png)";
  document.body.style.color = "#263d4e";
  document.documentElement.style.backgroundColor = "#f8fafc";

  const { tokens } = resolveTheme();

  expect(tokens.background).toBeUndefined();
  expect(tokens.surface).toBeUndefined();
  expect(tokens.text).toBeUndefined();
});

test("a dark body whose text colour is unreadable gives no palette", () => {
  document.body.style.backgroundColor = "#0f172a";
  document.body.style.color = "rgb(0, 0, 0)";

  const dark = resolveTheme().tokens;
  expect(dark.background).toBeUndefined();
  expect(dark.surface).toBeUndefined();
  expect(dark.text).toBeUndefined();

  document.body.style.backgroundColor = "#ffffff";
  document.body.style.color = "#222222";

  const light = resolveTheme().tokens;
  expect(light.surface).toBe("rgb(255, 255, 255)");
  expect(light.text).toBe("rgb(34, 34, 34)");
});

test("a background colour this code cannot read gives no palette, even from the root", () => {
  const original = window.getComputedStyle;
  const white = { backgroundColor: "rgb(255, 255, 255)", backgroundImage: "none", color: "rgb(34, 34, 34)", fontFamily: "Inter, sans-serif", colorScheme: "", getPropertyValue: () => "" };
  window.getComputedStyle = (el) => ({
    ...white,
    backgroundColor: el === document.body ? "oklch(0.2 0.03 260)" : "rgb(255, 255, 255)",
  });
  try {
    const { tokens } = resolveTheme();
    expect(tokens.background).toBeUndefined();
    expect(tokens.surface).toBeUndefined();
    expect(tokens.text).toBeUndefined();
  } finally {
    window.getComputedStyle = original;
  }
});

test("a font list of browser defaults is no font at all", () => {
  for (const font of ['"Times New Roman"', "serif", "-webkit-standard"]) {
    document.body.style.fontFamily = font;
    expect(resolveTheme().tokens.font).toBeUndefined();
  }

  document.body.style.fontFamily = "Inter, sans-serif";
  expect(resolveTheme().tokens.font).toBe("Inter, sans-serif");
});

test("the page scheme follows a meta tag or the sampled surface", () => {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "color-scheme");
  meta.setAttribute("content", "dark");
  document.head.append(meta);
  expect(resolveTheme().scheme).toBe("dark");
  meta.remove();

  document.body.style.backgroundColor = "#0f172a";
  document.body.style.color = "#f8fafc";
  expect(resolveTheme().scheme).toBe("dark");

  document.body.style.backgroundColor = "#ffffff";
  document.body.style.color = "#222222";
  expect(resolveTheme().scheme).toBe("light");
});

test("spacing is one length, and 0 is stored as 0px", () => {
  const original = globalThis.CSS;
  globalThis.CSS = { supports: (prop, value) => !(prop === "outline-offset" && /\s/.test(value.trim())) };
  try {
    theme();
    const clay = window.clay;

    expect(TOKEN_PROPS.spacing).toBe("outline-offset");
    expect(() => clay.theme({ tokens: { spacing: "10px 20px" } })).toThrow(TypeError);
    expect(resolveTheme().tokens.spacing).toBeUndefined();

    clay.theme({ tokens: { spacing: "22px" } });
    expect(resolveTheme().tokens.spacing).toBe("22px");

    clay.theme({ tokens: { spacing: "0" } });
    expect(resolveTheme().tokens.spacing).toBe("0px");

    document.body.style.setProperty("--clay-ui-spacing", "0");
    clay.theme(null);
    expect(resolveTheme().tokens.spacing).toBe("0px");
    document.body.style.removeProperty("--clay-ui-spacing");
  } finally {
    if (original === undefined) delete globalThis.CSS;
    else globalThis.CSS = original;
  }
});

test("derived tokens are color-mix strings, and an explicit border wins", () => {
  theme({ tokens: { text: "#263d4e", surface: "#fefefd" } });

  const { tokens } = resolveTheme();
  expect(tokens.mutedText).toBe("color-mix(in srgb, #263d4e 70%, #fefefd)");
  expect(tokens.border).toBe("color-mix(in srgb, #263d4e 18%, #fefefd)");
  expect(tokens.overlay).toBe("color-mix(in srgb, #263d4e 20%, transparent)");

  theme({ tokens: { text: "#263d4e", surface: "#fefefd", border: "#eeeeee" } });
  expect(resolveTheme().tokens.border).toBe("#eeeeee");
});

test("colorScheme 'page' follows the root, and an unset root is light dark", () => {
  expect(resolveTheme().scheme).toBe("light dark");

  document.documentElement.style.colorScheme = "dark";
  expect(resolveTheme().scheme).toBe("dark");

  theme({ colorScheme: "light" });
  expect(resolveTheme().scheme).toBe("light");
});

test("PART_NAMES carries every part the controls can style", () => {
  expect(PART_NAMES.size).toBe(12 + 3 * 18 + 3 + 9 + 6 + 4 * 23);
  expect(PART_NAMES.has("people.choice")).toBe(true);
  expect(PART_NAMES.has("staleHost.previewRing")).toBe(true);
  expect(PART_NAMES.has("crop.handle.se")).toBe(true);
  expect(PART_NAMES.has("people.someSelector")).toBe(false);
  expect(TOKEN_PROPS.radius).toBe("border-radius");
  expect(STATES).toEqual(["base", "hover", "active", "focus", "disabled"]);
});

test("importing the ui entry attaches clay.theme", async () => {
  await import("../../src/ui/index.js");

  expect(typeof window.clay.theme).toBe("function");
  expect(window.clay.theme()).toEqual({ auto: true, colorScheme: "page", tokens: {}, parts: {} });
});
