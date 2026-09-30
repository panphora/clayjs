import { jest } from "@jest/globals";
import { captureAsync, expectHostileProof, expectCallsResolved, hostileSheet, last } from "./helpers/injected-ui.js";
import { TOKENS, FONT_MONO } from "../../src/ui/bevel.js";

/**
 * The avatar stack on the generated Bevel subset. Material and type change: square
 * faces, mono initials, Bevel surface and tip. Meaning does not: every participant
 * keeps the colour its pseudonym picks, solid still means canEdit.
 */

const ADA = { id: "p_9f3c21ab7e", name: "Ada Lovelace", canEdit: true, you: false };
const GRACE = { id: "p_4d81e0075c", name: "Grace Hopper", canEdit: false, you: true };
const ROSTER = { people: [ADA, GRACE], anonymous: 3 };

const stack = () => document.querySelector("[data-clay-presence]");
const avatars = () => [...document.querySelectorAll("[data-clay-presence-avatar]")];
const tip = () => document.querySelector("[data-clay-presence-tip]");
const chip = () => document.querySelector("[data-clay-presence-count]");

async function load() {
  jest.resetModules();
  document.body.innerHTML = "";
  global.fetch = jest.fn(async () => ({
    ok: true,
    text: async () => JSON.stringify({ spec: 1, extensions: ["sync", "presence"], document: null }),
  }));
  const { presence } = await import("../../src/sync/presence.js");
  return presence;
}

afterEach(() => {
  document.documentElement.style.colorScheme = "";
});

test("every element is runtime-only, classless, idless, !important and resolved", async () => {
  const restore = hostileSheet();
  try {
    const presence = await load();
    const calls = await captureAsync(() => presence.update(ROSTER));
    avatars()[0].dispatchEvent(new MouseEvent("mouseenter"));
    expect(expectHostileProof(stack())).toBe(6);
    expectCallsResolved(calls, stack());
    for (const el of [stack(), ...stack().querySelectorAll("*")]) {
      expect(el.style.getPropertyValue("all")).toBe("initial");
    }
  } finally {
    restore();
  }
});

test("faces are square and the initials are Bevel mono", async () => {
  const presence = await load();
  await presence.update(ROSTER);
  for (const face of avatars()) {
    expect(face.style.getPropertyValue("border-radius")).toBe("0");
    expect(face.style.getPropertyValue("font")).toContain(FONT_MONO);
  }
});

test("the count chip and the tip wear Bevel surface and ink", async () => {
  const presence = await load();
  const calls = await captureAsync(() => presence.update(ROSTER));
  expect(last(calls, chip(), "background")).toBe(TOKENS.surface);
  expect(last(calls, chip(), "color")).toBe(TOKENS.muted);
  expect(last(calls, tip(), "background")).toBe(TOKENS.ink);
  expect(last(calls, tip(), "color")).toBe(TOKENS.ground);
  expect(chip().textContent).toBe("+3 viewing");
});

test("the stack follows the page's colour scheme, and a later frame picks up a change", async () => {
  document.documentElement.style.colorScheme = "dark";
  const presence = await load();
  await presence.update(ROSTER);
  expect(stack().style.getPropertyValue("color-scheme")).toBe("dark");
  document.documentElement.style.colorScheme = "light";
  await presence.update(ROSTER);
  expect(stack().style.getPropertyValue("color-scheme")).toBe("light");
});

test("a participant keeps the colour its pseudonym picks, and solid still means canEdit", async () => {
  const presence = await load();
  await presence.update({ people: [ADA, { ...ADA, canEdit: false }], anonymous: 0 });
  const [solid, hollow] = avatars();
  const colour = solid.style.getPropertyValue("background-color");
  expect(colour).toMatch(/^rgb\(/);
  expect(hollow.style.getPropertyValue("color")).toBe(colour);
});

test("only the faces take a pointer: the corner, the row, the count and the tip let clicks through", async () => {
  const presence = await load();
  const calls = await captureAsync(() => presence.update(ROSTER));
  const row = avatars()[0].parentElement;
  for (const el of [stack(), row, chip(), tip()]) expect(last(calls, el, "pointer-events")).toBe("none");
  for (const face of avatars()) expect(last(calls, face, "pointer-events")).toBe("auto");
});

test("hiding the corner keeps display:none !important", async () => {
  const presence = await load();
  await presence.update(ROSTER);
  presence.hide();
  expect(stack().style.display).toBe("none");
  expect(stack().style.getPropertyPriority("display")).toBe("important");
});
