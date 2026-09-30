import { TOKENS, FONT_MONO } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

import { ask, tell, snippet } from "../../src/ui/dialogs.js";
import themodal from "../../src/ui/modal.js";

const dialog = () => document.querySelector('[role="dialog"]');
const submit = () => dialog().querySelector('button[type="submit"]');

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  if (themodal.isShowing) themodal.close();
});

test("ask: heading, Bevel input and arrow are hostile-proof; the prompt markup is the caller's", () => {
  let result;
  const calls = capture(() => { result = ask('Rename <b data-caller="1">this</b>?', null, "old"); });
  result.catch(() => {});
  const root = document.querySelector("[data-clay-modal]");
  const caller = dialog().querySelector('[data-caller="1"]');
  expect(expectHostileProof(root, { skip: (el) => el === caller })).toBeGreaterThanOrEqual(12);
  expectCallsResolved(calls, root);
  expect(caller.hasAttribute("style")).toBe(false);
  const input = dialog().querySelector("input");
  expect(last(calls, input, "background")).toBe(TOKENS.surface);
  expect([input.required, input.getAttribute("value"), document.activeElement]).toEqual([true, "old", input]);
  const arrow = submit().querySelector("svg");
  expect(arrow.getAttribute("class")).toBeNull();
  expect(arrow.querySelector("path").style.getPropertyPriority("fill")).toBe("important");
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
