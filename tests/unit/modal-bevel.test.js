import themodal from "../../src/ui/modal.js";
import { TOKENS } from "../../src/ui/bevel.js";
import { capture, last, expectHostileProof, expectCallsResolved } from "./helpers/injected-ui.js";

const root = () => document.querySelector("[data-clay-modal]");
const dialog = () => root().querySelector('[role="dialog"]');
const yes = () => dialog().querySelector('button[type="submit"]');

function open({ html = '<p data-caller="1">Hi <b>there</b></p>', yesLabel = "Yes", noLabel = "No", closeHtml = "x" } = {}) {
  themodal.html = html;
  themodal.yes = yesLabel;
  themodal.no = noLabel;
  themodal.closeHtml = closeHtml;
  return capture(() => themodal.open());
}

afterEach(() => {
  if (themodal.isShowing) themodal.close();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  document.documentElement.style.colorScheme = "";
});

test("hostile-proof: every chrome element, caller content left out of the check", () => {
  const calls = open();
  const caller = dialog().querySelector('[data-caller="1"]');
  expect(expectHostileProof(root(), { skip: (el) => caller.contains(el) })).toBeGreaterThanOrEqual(10);
  expectCallsResolved(calls, root());
  expect(document.head.querySelector("style")).toBeNull();
  expect(document.querySelector("#micromodal, .micromodal, .micromodal-parent")).toBeNull();
});

test("control: caller markup goes in verbatim and is never styled", () => {
  open();
  const caller = document.querySelector('[role="dialog"] [data-caller="1"]');
  expect(caller.outerHTML).toBe('<p data-caller="1">Hi <b>there</b></p>');
  expect(caller.hasAttribute("style")).toBe(false);
  expect(caller.hasAttribute("clay")).toBe(false);
});

test("html: a node is placed as it is, not serialised", () => {
  const node = document.createElement("section");
  node.textContent = "live";
  let clicked = 0;
  node.addEventListener("click", () => clicked++);
  open({ html: node });
  expect(dialog().contains(node)).toBe(true);
  node.click();
  expect(clicked).toBe(1);
});

test("material: a Bevel panel, a primary yes, a default no", () => {
  const calls = open();
  expect(last(calls, dialog(), "background")).toBe(TOKENS.surface);
  expect(last(calls, yes(), "background")).toBe(TOKENS.ink);
  const no = [...dialog().querySelectorAll('button[type="button"]')].find((b) => !b.hasAttribute("aria-label"));
  expect(last(calls, no, "background")).toBe(TOKENS.face);
});

test("close corner: shown when closeHtml is set, absent when it is empty", () => {
  open({ closeHtml: "x" });
  expect(dialog().querySelector('button[aria-label="Close modal"] svg')).not.toBeNull();
  themodal.close();
  open({ closeHtml: "" });
  expect(dialog().querySelector('button[aria-label="Close modal"]')).toBeNull();
});

test("hidden button: a hover or focus rebuild cannot bring back a button with no label", () => {
  open({ yesLabel: "Go", noLabel: "" });
  const no = [...dialog().querySelectorAll('button[type="button"]')].find((b) => !b.hasAttribute("aria-label"));
  no.dispatchEvent(new MouseEvent("pointerenter"));
  no.dispatchEvent(new FocusEvent("blur"));
  expect(no.hidden).toBe(true);
  expect([no.style.getPropertyValue("display"), no.style.getPropertyPriority("display")]).toEqual(["none", "important"]);
});

test("scheme: the modal takes the page's declared scheme", () => {
  document.documentElement.style.colorScheme = "dark";
  open();
  expect(root().style.getPropertyValue("color-scheme")).toBe("dark");
});
