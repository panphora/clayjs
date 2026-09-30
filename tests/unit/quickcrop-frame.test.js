import { jest } from "@jest/globals";

// The crop dialog's lifecycle beside themodal: a modal opened on top cancels the crop
// cleanly, the page does not scroll behind it, and Tab stays inside it.

const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  // jsdom has no layout, so offsetParent is always null; the focus rule skips hidden
  // nodes by it, as MicroModal does.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode; } });
});

afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParent);
});

async function openCrop() {
  const { bevelCropAdapter } = await import("../../src/plugins/quickcrop.js");
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const handle = bevelCropAdapter.open({ content: document.createElement("div"), confirmLabel: "Crop", onConfirm, onCancel });
  return { handle, onCancel, root: document.querySelector("[data-clay-modal]") };
}

test("a modal opened on top of a crop cancels the crop and takes its listeners with it", async () => {
  const { onCancel, root } = await openCrop();
  const { default: themodal } = await import("../../src/ui/modal.js");
  themodal.html = "<p>Something else</p>";
  themodal.open();

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(root.isConnected).toBe(false);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  themodal.close();
});

test("the page does not scroll behind the crop, and a lock from underneath survives it", async () => {
  const first = await openCrop();
  expect(document.body.style.overflow).toBe("hidden");
  first.handle.close();
  expect(document.body.style.overflow).toBe("");

  document.body.style.overflow = "hidden";
  const second = await openCrop();
  second.handle.close();
  expect(document.body.style.overflow).toBe("hidden");
});

test("Tab and Shift+Tab stay inside the crop dialog", async () => {
  const { root, handle } = await openCrop();
  const buttons = [...root.querySelectorAll("button")];
  expect(buttons.length).toBeGreaterThanOrEqual(2);

  buttons.at(-1).focus();
  const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(forward);
  expect(forward.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons[0]);

  const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  document.activeElement.dispatchEvent(back);
  expect(back.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons.at(-1));
  handle.close();
});
