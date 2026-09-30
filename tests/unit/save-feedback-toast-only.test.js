// clay-ui on a page with no indicator plugin: nothing else reports the save, so the
// automatic "Saved" toast stays. The page carrying both is covered in
// save-feedback.test.js.

const toasts = (type) => [...document.querySelectorAll(type ? `[data-clay-toast="${type}"]` : "[data-clay-toast]")];
const fire = (state, detail) => document.dispatchEvent(new CustomEvent("clay:save-" + state, { detail }));

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/ui/index.js");
});

test("saved: with no chip on the page the toast is the only feedback", () => {
  fire("saved", { msg: "Saved" });

  const success = toasts("success");
  expect(success).toHaveLength(1);
  expect(success[0].textContent).toContain("Saved");
});

test("a warning on a successful save is a toast here too", () => {
  fire("saved", { msg: "Saved, but one image was too large", msgType: "warning" });

  const warning = toasts("warning");
  expect(warning).toHaveLength(1);
  expect(warning[0].textContent).toContain("Saved, but one image was too large");
});
