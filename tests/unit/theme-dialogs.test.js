import { jest } from "@jest/globals";

import { _resetTheme, parseColor, resolveTheme, theme } from "../../src/ui/theme.js";
import { pageScheme } from "../../src/ui/bevel-controls.js";
import { bevelDialog } from "../../src/ui/bevel-dialog.js";
import { FONT_MONO, RULES, TOKENS } from "../../src/ui/bevel.js";
import { capture, last } from "./helpers/injected-ui.js";

const { ask, consent, tell, snippet } = await import("../../src/ui/dialogs.js");
const { default: themodal } = await import("../../src/ui/modal.js");

// A page theme in Kanban's own colours: Work Sans, blue-grey ink, near-white paper,
// a purple accent, 7px radii, 22px spacing and 36px controls.
const KANBAN = {
  colorScheme: "light",
  tokens: {
    font: "'Work Sans', sans-serif", text: "#263d4e", mutedText: "#536988",
    surface: "#fefefd", background: "#f2f6fa", border: "#e0e7ee",
    accent: "#7356ba", accentText: "#ffffff", radius: "7px",
    spacing: "22px", buttonHeight: "36px",
  },
  parts: {
    "dialog.title": { base: { "font-size": "20px" } },
    "people.title": { base: { "font-size": "21px" } },
    "dialog.close": { hover: { background: "#e9eef4" } },
  },
};

const dialog = () => document.querySelector('[role="dialog"]');
const root = () => document.querySelector("[data-clay-modal]");
const submit = () => dialog().querySelector('button[type="submit"]');
const heading = () => dialog().querySelector('[role="heading"]');
const closeButton = () => dialog().querySelector('button[aria-label="Close"]');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const shown = (el, prop) => parseColor(el.style.getPropertyValue(prop));
const pointer = (el, type) => capture(() => el.dispatchEvent(new MouseEvent(type)));

beforeEach(() => {
  _resetTheme();
  delete window.clayTheme;
  delete window.clay;
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
  document.body.innerHTML = "";
});

afterEach(() => {
  if (themodal.isShowing) themodal.close();
});

test("a themed dialog takes the page's font, colours and spacing", () => {
  theme(KANBAN);
  ask("Name?").catch(() => {});

  expect(root().getAttribute("data-clay-ui")).toBe("modal");
  expect(root().style.getPropertyValue("color-scheme")).toBe("light");
  expect(shown(dialog(), "background")).toEqual(parseColor(KANBAN.tokens.surface));
  expect(heading().style.getPropertyValue("font-family")).toContain("Work Sans");
  expect(heading().style.getPropertyValue("font-size")).toBe("20px");

  const yes = submit();
  expect(shown(yes, "background")).toEqual(parseColor(KANBAN.tokens.accent));
  expect(yes.style.getPropertyValue("min-height")).toBe(KANBAN.tokens.buttonHeight);
  const input = dialog().querySelector("input");
  expect(shown(input, "border-color")).toEqual(parseColor(KANBAN.tokens.accent));
  input.blur();
  expect(shown(input, "border-color")).toEqual(parseColor(KANBAN.tokens.border));
  expect(yes.parentElement.style.getPropertyValue("gap")).toBe("calc(22px / 2)");
});

test("clay.theme(false) keeps the exact Bevel look", () => {
  theme(false);
  ask("Name?").catch(() => {});

  expect(root().getAttribute("data-clay-ui")).toBeNull();
  expect(root().querySelectorAll("[data-clay-part]").length).toBe(0);
  expect(root().style.getPropertyValue("color-scheme")).toBe(pageScheme());
  expect(heading().style.getPropertyValue("font")).toContain("Georgia");
});

test("the close control rebuilds from its own states, themed and unthemed", () => {
  theme(KANBAN);
  ask("Name?").catch(() => {});

  const close = closeButton();
  const hover = pointer(close, "pointerenter");
  expect(last(hover, close, "background")).toBe(KANBAN.parts["dialog.close"].hover.background);

  const leave = pointer(close, "pointerleave");
  expect(last(leave, close, "background")).toBe(KANBAN.tokens.surface);

  const focus = capture(() => close.dispatchEvent(new FocusEvent("focus")));
  expect(last(focus, close, "outline")).toBe(`2px solid ${KANBAN.tokens.accent}`);

  themodal.close();
  theme(false);
  ask("Name?").catch(() => {});
  const plain = closeButton();
  const plainHover = pointer(plain, "pointerenter");
  expect(last(plainHover, plain, "background")).toBe(RULES.dialogCloseHover[0].slice("background:".length));
});

test("a dialog keeps the theme it opened with", () => {
  theme(KANBAN);
  tell("A").catch(() => {});

  theme(false);
  const yes = submit();
  const hover = pointer(yes, "pointerenter");
  expect(last(hover, yes, "background")).toContain(KANBAN.tokens.accent);

  themodal.close();
  let next;
  const calls = capture(() => { next = tell("B"); });
  next.catch(() => {});
  expect(root().getAttribute("data-clay-ui")).toBeNull();
  expect(last(calls, dialog(), "background")).toBe(TOKENS.surface);
});

test("caller markup goes in untouched and takes no theme declarations", () => {
  theme(KANBAN);
  tell("T", '<span class="mine" style="color: red">x</span>').catch(() => {});

  const mine = dialog().querySelector("span.mine");
  expect(mine.getAttribute("style")).toBe("color: red");
  expect(mine.hasAttribute("data-clay-part")).toBe(false);
  expect(mine.parentElement.getAttribute("data-clay-part")).toBe("text");
});

test("snippet keeps its mono code well and takes the text colour", () => {
  theme(KANBAN);
  snippet("Embed", "the code");

  const pre = dialog().querySelector("pre");
  expect(pre.style.getPropertyValue("font")).toContain(FONT_MONO);
  expect(pre.style.getPropertyValue("font")).not.toContain("Work Sans");
  expect(shown(pre, "color")).toEqual(parseColor(KANBAN.tokens.text));
  expect(shown(pre.parentElement, "background")).toEqual(parseColor(KANBAN.tokens.background));
});

test("a font reaches the heading unless the theme sets headingFont", () => {
  document.body.style.fontFamily = "Georgia";
  theme({ tokens: { font: "Arial" } });
  ask("Name?").catch(() => {});

  expect(resolveTheme().tokens.headingFont).toBeUndefined();
  expect(heading().style.getPropertyValue("font-family")).toBe("Arial");
});

test("an untitled closable dialog pads its body on all four sides", () => {
  theme({ tokens: { spacing: "22px" } });

  let shell;
  const calls = capture(() => { shell = bevelDialog({ closable: true, titled: false, theme: resolveTheme() }); });

  expect(last(calls, shell.body, "padding")).toBe("22px calc(22px + 62px) 22px 22px");
});

test("the close control takes its own pressed and icon states", () => {
  theme({
    parts: {
      "dialog.close": { base: { opacity: ".9" }, active: { opacity: ".2" } },
      "dialog.closeIcon": { hover: { opacity: ".3" } },
    },
  });
  ask("Name?").catch(() => {});

  const close = closeButton();
  const icon = close.firstElementChild;

  const down = pointer(close, "pointerdown");
  expect(last(down, close, "opacity")).toBe(".2");
  const up = pointer(close, "pointerup");
  expect(last(up, close, "opacity")).toBe(".9");

  const over = pointer(close, "pointerenter");
  expect(last(over, icon, "opacity")).toBe(".3");
  const leave = pointer(close, "pointerleave");
  expect(last(leave, icon, "opacity")).toBe("1");
});

test("shared part names reach ClayJS's own text, wells and icons", () => {
  theme({
    parts: {
      text: { base: { "letter-spacing": "1px" } },
      well: { base: { "letter-spacing": "2px" } },
      icon: { base: { opacity: ".5" } },
    },
  });

  tell("T", "one").catch(() => {});
  expect(dialog().querySelector('[data-clay-part="text"]').style.getPropertyValue("letter-spacing")).toBe("1px");

  themodal.close();
  snippet("Embed", "the code");
  expect(dialog().querySelector('[data-clay-part~="well"]').style.getPropertyValue("letter-spacing")).toBe("2px");
  expect(closeButton().firstElementChild.style.getPropertyValue("opacity")).toBe("0.5");
});

test("clay.modal has no public theme setter, so a stray one cannot break the next open", async () => {
  await import("../../src/ui/index.js");
  const modal = window.clay.modal;

  expect("theme" in modal).toBe(false);

  modal.theme = { tokens: { accent: "red" } };
  modal.html = "x";
  modal.open();
  expect(root().getAttribute("data-clay-ui")).toBe("modal");

  modal.html = "y";
  modal.open();
  expect(root().getAttribute("data-clay-ui")).toBe("modal");

  modal.theme = true;
  modal.html = "z";
  modal.open();
  expect(root().getAttribute("data-clay-ui")).toBe("modal");
});

test("behaviour is unchanged under a theme", async () => {
  theme(KANBAN);

  const answered = ask("Name?");
  dialog().querySelector("input").value = "Ada";
  submit().click();
  await expect(answered).resolves.toBe("Ada");

  const escaped = ask("Name?");
  document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
  await expect(escaped).rejects.toBeUndefined();

  const confirmed = consent("Delete it?");
  submit().click();
  await expect(confirmed).resolves.toBeUndefined();
});

test("the people name prompt takes the page theme with people's overrides on top", async () => {
  jest.resetModules();
  window.clayTheme = KANBAN;
  window.clay = { isEditMode: true };
  window.localStorage.clear();
  global.fetch = jest.fn(async () => ({ ok: false, status: 404 }));

  const mod = await import("../../src/plugins/people.js");
  await mod.ready;
  mod.people.add({ id: "AAAAAAAAAAAAAAAAAAAAAA", name: "Ada Chen" });

  const li = document.createElement("li");
  document.body.append(li);
  const pending = mod.author(li);
  await settle();

  expect(root().getAttribute("data-clay-ui")).toBe("people");
  expect(heading().style.getPropertyValue("font-size")).toBe("21px");
  const choice = [...dialog().querySelectorAll("button")].find((b) => b.textContent === "Ada Chen");
  expect(choice.getAttribute("data-clay-part")).toContain("people.choice");

  [...dialog().querySelectorAll("button")].find((b) => b.textContent === "Cancel").click();
  await expect(pending).resolves.toBeNull();
});

test("a shared part name reaches the people prompt's muted hint", async () => {
  jest.resetModules();
  window.clayTheme = { parts: { mutedText: { base: { "letter-spacing": "9px" } } } };
  window.clay = { isEditMode: true };
  window.localStorage.clear();
  global.fetch = jest.fn(async () => ({ ok: false, status: 404 }));

  const mod = await import("../../src/plugins/people.js");
  await mod.ready;
  mod.people.add({ id: "BBBBBBBBBBBBBBBBBBBBBB", name: "Ada Chen" });

  const li = document.createElement("li");
  document.body.append(li);
  const pending = mod.author(li);
  await settle();

  const hint = dialog().querySelector('[data-clay-part~="people.hint"]');
  expect(hint.getAttribute("data-clay-part")).toContain("mutedText");
  expect(hint.style.getPropertyValue("letter-spacing")).toBe("9px");

  [...dialog().querySelectorAll("button")].find((b) => b.textContent === "Cancel").click();
  await expect(pending).resolves.toBeNull();
});

// The people test leaves a plugin instance watching document.body, so the file ends
// with an empty one: the environment's teardown removes body's children, and a
// registry still there would wake every observer with no document left to read.
afterAll(async () => {
  document.body.innerHTML = "";
  await new Promise((resolve) => setTimeout(resolve, 0));
});
