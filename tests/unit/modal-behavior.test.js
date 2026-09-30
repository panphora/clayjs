import { jest } from "@jest/globals";
import themodal from "../../src/ui/modal.js";

/**
 * Behaviour controls for the modal shell. They find its parts by role, type and label,
 * never by class, so they pass on the MicroModal markup this shell replaces and keep
 * passing after it moves onto Bevel: the look may change, none of this may.
 */

const root = () => document.querySelector("[data-clay-modal], .micromodal-parent");
const dialog = () => document.querySelector('[role="dialog"]');
const overlay = () => dialog().parentElement;
const yes = () => dialog().querySelector('button[type="submit"]');
const close = () => dialog().querySelector('button[aria-label="Close"]');
const no = () => [...dialog().querySelectorAll('button[type="button"]')].find((b) => b !== close());
const shown = (el) => !el.hidden && !el.classList.contains("micromodal__hide");

function open({ html = "<p>Body</p>", yesLabel = "Yes", noLabel = "No" } = {}) {
  const calls = { yes: 0, no: 0, open: 0 };
  themodal.html = html;
  themodal.yes = yesLabel;
  themodal.no = noLabel;
  themodal.closeHtml = "x";
  themodal.onYes(() => { calls.yes++; });
  themodal.onNo = () => { calls.no++; };
  themodal.onOpen(() => { calls.open++; });
  themodal.open();
  return calls;
}

afterEach(() => {
  if (themodal.isShowing) themodal.close();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

test("open: caller markup lands in the dialog, labels on the buttons, onOpen once", () => {
  const calls = open({ html: '<p data-caller="1">Hello <b>there</b></p>' });
  expect(dialog().querySelector('[data-caller="1"]').innerHTML).toBe("Hello <b>there</b>");
  expect(yes().textContent).toBe("Yes");
  expect(no().textContent).toBe("No");
  expect(calls.open).toBe(1);
  expect(themodal.isShowing).toBe(true);
  expect(root().getAttribute("clay")).toContain("no-save");
});

test("yes: submit runs onYes, closes, and never runs onNo", () => {
  const calls = open();
  yes().click();
  expect(calls).toEqual({ yes: 1, no: 0, open: 1 });
  expect(root()).toBeNull();
  expect(themodal.isShowing).toBe(false);
});

test("yes: a callback returning false or throwing keeps the modal open", () => {
  themodal.html = "<p>x</p>";
  themodal.yes = "Go";
  let attempts = 0;
  themodal.onYes(() => { attempts++; if (attempts === 1) return false; if (attempts === 2) throw new Error("nope"); });
  themodal.open();
  yes().click();
  expect(root()).not.toBeNull();
  yes().click();
  expect(root()).not.toBeNull();
  yes().click();
  expect(root()).toBeNull();
  expect(attempts).toBe(3);
});

test("no, close and Escape each dismiss once through onNo", () => {
  let calls = open();
  no().click();
  expect(calls.no).toBe(1);
  expect(root()).toBeNull();

  calls = open();
  close().click();
  expect(calls.no).toBe(1);
  expect(root()).toBeNull();

  calls = open();
  document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
  expect(calls.no).toBe(1);
  expect(root()).toBeNull();
});

test("backdrop: a press that starts on the backdrop closes, one that starts inside does not", () => {
  let calls = open();
  dialog().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  overlay().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls.no).toBe(0);
  expect(root()).not.toBeNull();

  overlay().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  overlay().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(calls.no).toBe(1);
  expect(root()).toBeNull();
});

test("singleton: a second open dismisses the first and leaves one modal", () => {
  const first = open({ html: "<p>one</p>" });
  const second = open({ html: "<p>two</p>" });
  expect(first.no).toBe(1);
  expect(second.no).toBe(0);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(dialog().textContent).toContain("two");
});

test("reset: every setter returns to its default after a close", () => {
  themodal.zIndex = "250";
  themodal.title = "Title";
  themodal.width = "440px";
  open();
  expect(overlay().style.zIndex).toBe("250");
  themodal.close();
  expect([themodal.html, themodal.yes, themodal.no, themodal.closeHtml, themodal.zIndex, themodal.title, themodal.width]).toEqual(["", "", "", "", "100", "", ""]);
  expect([themodal.disableScroll, themodal.disableFocus]).toEqual([true, false]);
});

test("scroll: the body stops scrolling while open and scrolls again after", () => {
  open();
  expect(document.body.style.overflow).toBe("hidden");
  themodal.close();
  expect(document.body.style.overflow).toBe("");
});

test("focus: the first field in the content takes focus, unless disableFocus", () => {
  open({ html: '<input value="abc">' });
  expect(document.activeElement).toBe(dialog().querySelector("input"));
  themodal.close();

  themodal.disableFocus = true;
  open({ html: '<input value="abc">' });
  expect(document.activeElement).not.toBe(dialog().querySelector("input"));
});

test("buttons: an empty label hides its button, both empty hides the row", () => {
  open({ yesLabel: "Go", noLabel: "" });
  expect(shown(yes())).toBe(true);
  expect(shown(no())).toBe(false);
  themodal.close();
  open({ yesLabel: "", noLabel: "" });
  expect(shown(yes())).toBe(false);
  expect(shown(no())).toBe(false);
  expect(shown(yes().parentElement)).toBe(false);
});

test("morph removal: close() after the DOM was yanked still settles and cleans up", () => {
  const calls = open();
  root().remove();
  themodal.close();
  expect(calls.no).toBe(1);
  const next = open();
  next;
  document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
  expect(next.no).toBe(1);
  expect(calls.no).toBe(1);
});
