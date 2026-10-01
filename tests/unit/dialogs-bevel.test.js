import { TOKENS, FONT_MONO } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

import { ask, consent, tell, snippet } from "../../src/ui/dialogs.js";
import themodal from "../../src/ui/modal.js";

const dialog = () => document.querySelector('[role="dialog"]');
const submit = () => dialog().querySelector('button[type="submit"]');
const close = () => dialog().querySelector('button[aria-label="Close"]');

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  if (themodal.isShowing) themodal.close();
});

test("ask: title, Bevel input and the close are hostile-proof; the prompt markup is the caller's", () => {
  let result;
  const calls = capture(() => { result = ask('Rename <b data-caller="1">this</b>?', null, "old"); });
  result.catch(() => {});
  const root = document.querySelector("[data-clay-modal]");
  const caller = dialog().querySelector('[data-caller="1"]');
  expect(expectHostileProof(root, { skip: (el) => el === caller })).toBeGreaterThanOrEqual(12);
  expectCallsResolved(calls, root);
  expect(caller.hasAttribute("style")).toBe(false);
  const input = dialog().querySelector("input");
  expect(last(calls, input, "background")).toBe(TOKENS.ground);
  expect([input.required, input.getAttribute("value"), document.activeElement]).toEqual([true, "old", input]);
  const x = close().querySelector("svg");
  const ink = calls.filter((call) => call.style === x.style && call.name === "color");
  expect(ink.map((call) => [call.value, call.priority])).toEqual([["inherit", "important"]]);
  expect(x.querySelector("path").style.getPropertyValue("fill")).toBe("currentColor");
  expect(x.getAttribute("class")).toBeNull();
  expect(x.querySelector("path").style.getPropertyPriority("fill")).toBe("important");
  expect(document.querySelector('[class*="micromodal"]')).toBeNull();
});

test("tell: the title and each paragraph in Bevel type, paragraphs as caller markup", () => {
  const calls = capture(() => { tell("Heads up", 'first <i data-caller="p">one</i>', "second").catch(() => {}); });
  const root = document.querySelector("[data-clay-modal]");
  const caller = dialog().querySelector('[data-caller="p"]');
  expect(expectHostileProof(root, { skip: (el) => el === caller })).toBeGreaterThanOrEqual(10);
  expectCallsResolved(calls, root);
  expect(dialog().textContent).toContain("Heads up");
  expect(caller.outerHTML).toBe('<i data-caller="p">one</i>');
});

test("snippet: the code sits in a mono well, copy is a Bevel button, no confirm button", () => {
  const calls = capture(() => { snippet("Embed", "the code"); });
  const root = document.querySelector("[data-clay-modal]");
  expect(expectHostileProof(root)).toBeGreaterThanOrEqual(10);
  expectCallsResolved(calls, root);
  const pre = dialog().querySelector("pre");
  expect(pre.textContent).toBe("the code");
  expect(pre.style.getPropertyValue("font")).toContain(FONT_MONO);
  expect(submit().hidden).toBe(true);
});

test("confirm opens with the primary button focused, so Enter confirms", () => {
  consent("Delete it?");

  expect(document.activeElement).toBe(submit());
  expect(document.activeElement.textContent).toBe("Confirm");
});

test("a title-only dialog has no doubled rule and is named by its title", () => {
  consent("Delete it?");

  const footer = dialog().lastElementChild;
  expect([footer.style.getPropertyValue("border-top"), footer.style.getPropertyPriority("border-top")]).toEqual(["0", "important"]);
  expect(dialog().getAttribute("aria-label")).toBe("Delete it?");
});

test("confirm: the prompt is the panel's title, an empty body is hidden, Cancel then Confirm", async () => {
  const result = consent("Delete it?");
  const panel = dialog();
  const heading = panel.querySelector('[role="heading"]');
  expect(heading.textContent).toBe("Delete it?");

  const body = heading.parentElement.nextElementSibling;
  expect([body.hidden, body.style.getPropertyValue("display")]).toEqual([true, "none"]);

  const footer = panel.lastElementChild;
  expect([...footer.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Cancel", "Confirm"]);

  footer.querySelector("button").click();
  await expect(result).rejects.toBeUndefined();
  expect(dialog()).toBeNull();
});
