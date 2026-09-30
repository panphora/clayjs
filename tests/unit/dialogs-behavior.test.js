import { jest } from "@jest/globals";

const copied = [];
jest.unstable_mockModule("../../src/utils/copy-to-clipboard.js", () => ({ default: (text) => { copied.push(text); } }));

const { ask, consent, tell, snippet } = await import("../../src/ui/dialogs.js");
const { default: themodal } = await import("../../src/ui/modal.js");

// Behaviour controls for ask, confirm, tell and snippet. They find parts by role, type
// and label, never by class, so they pass on the MicroModal markup and keep passing
// after the dialogs move onto Bevel.
const dialog = () => document.querySelector('[role="dialog"]');
const submit = () => dialog().querySelector('button[type="submit"]');
const closeButton = () => dialog().querySelector('button[aria-label="Close modal"]');
const anyToast = () => document.querySelector("[data-clay-toast], .toast");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  copied.length = 0;
  document.body.innerHTML = "";
});

afterEach(() => {
  if (themodal.isShowing) themodal.close();
});

test("ask resolves with the typed value, an empty field keeps it open", async () => {
  const result = ask("Name?", null, "");
  const input = dialog().querySelector("input");
  submit().click();
  expect(dialog()).not.toBeNull();
  input.value = "Ada";
  submit().click();
  await expect(result).resolves.toBe("Ada");
  expect(dialog()).toBeNull();
});

test("a throwing callback keeps the dialog open and says why", async () => {
  let calls = 0;
  consent("Delete?", () => { calls++; if (calls === 1) throw new Error("Type the name first"); });
  submit().click();
  expect(dialog()).not.toBeNull();
  expect(anyToast().textContent).toContain("Type the name first");
  submit().click();
  await settle();
  expect(dialog()).toBeNull();
});

test("close rejects consent and tell, resolves snippet", async () => {
  const c = consent("Sure?");
  closeButton().click();
  await expect(c).rejects.toBeUndefined();

  const t = tell("Heads up", "one", "two");
  closeButton().click();
  await expect(t).rejects.toBeUndefined();

  const s = snippet("Embed", "code");
  closeButton().click();
  await expect(s).resolves.toBeUndefined();
});

test("data-copy buttons in caller content copy, and so does snippet's copy button", async () => {
  consent("Share", null, '<button type="button" data-copy="https://x.test">Copy link</button>');
  await settle();
  dialog().querySelector("[data-copy]").click();
  expect(copied).toEqual(["https://x.test"]);
  themodal.close();

  snippet("Embed", "the code");
  await settle();
  const copyButton = [...dialog().querySelectorAll("button")].find((b) => b.textContent.trim() === "copy");
  copyButton.click();
  expect(copied).toEqual(["https://x.test", "the code"]);
});
