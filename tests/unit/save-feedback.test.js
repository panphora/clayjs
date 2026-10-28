import { jest } from "@jest/globals";

// A page carrying both the indicator plugin and clay-ui: the chip owns saving and saved,
// the toasts own a save that failed or went offline. clay-ui alone, with no chip to
// report a plain save, is covered in save-feedback-toast-only.test.js: one loaded copy
// of clay-ui per file, because every copy keeps its own listeners on the document.

const chip = () => document.querySelector("[data-clay-indicator]");
const toasts = (type) => [...document.querySelectorAll(type ? `[data-clay-toast="${type}"]` : "[data-clay-toast]")];
const fire = (state, detail) => document.dispatchEvent(new CustomEvent("clay:save-" + state, { detail }));
// The drawing is a module the first save state fetches, so a reading waits for it.
const drawn = async () => {
  await import("../../src/plugins/indicator-chip.js");
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/plugins/indicator.js"); // onDomReady => init runs (jsdom is 'complete')
  await import("../../src/ui/index.js");
});

test("saved: the chip reports it and no toast repeats it", async () => {
  fire("saved");
  await drawn();

  expect(chip()).not.toBeNull();
  expect(chip().textContent).toBe("Saved");
  expect(toasts()).toEqual([]);
});

test("error: the toast reports it and the chip stays out of the way", async () => {
  fire("error");
  await drawn();

  const error = toasts("error");
  expect(error).toHaveLength(1);
  expect(error[0].textContent).toContain("Couldn't save");
  expect(chip().style.opacity).toBe("0");
});

test("the next save dismisses the error toast", async () => {
  jest.useFakeTimers();
  try {
    fire("saved");
    await drawn();
    expect(toasts("error")).toHaveLength(1);

    jest.advanceTimersByTime(500);
    expect(toasts("error")).toHaveLength(0);
  } finally {
    jest.useRealTimers();
  }
});

test("a warning on a successful save is a toast even with the chip on the page", async () => {
  fire("saved", { msg: "Saved, but one image was too large", msgType: "warning" });
  await drawn();

  const warning = toasts("warning");
  expect(warning).toHaveLength(1);
  expect(warning[0].textContent).toContain("Saved, but one image was too large");
});

test("a failed save clears the hidden chip's text", async () => {
  fire("saving");
  await drawn();
  expect(chip().textContent).toBe("Saving\u2026");

  fire("error");
  await drawn();
  expect(chip().textContent).toBe("");
  expect(document.querySelector("[data-clay-toasts]").getAttribute("aria-live")).toBe("polite");
});

test("clay.saveToast shows Saved as a toast with the host's message, not on the chip", async () => {
  window.clay.saveToast = true;

  fire("saving");
  fire("saved", { msg: "Saved in your browser", msgType: "success" });
  await drawn();

  expect(toasts().some((t) => t.textContent.includes("Saved in your browser"))).toBe(true);
  expect(chip().textContent).toBe("");
  expect(chip().style.opacity).toBe("0");

  window.clay.saveToast = false;
});

test("with clay.saveToast on, the chip still shows Saving…", async () => {
  window.clay.saveToast = true;

  fire("saving");
  await drawn();

  expect(chip().textContent).toBe("Saving\u2026");
  expect(chip().style.opacity).toBe("1");

  window.clay.saveToast = false;
});

test("clay.saveToast reads back what was set", () => {
  window.clay.saveToast = 1;
  expect(window.clay.saveToast).toBe(true);

  window.clay.saveToast = false;
  expect(window.clay.saveToast).toBe(false);
});
