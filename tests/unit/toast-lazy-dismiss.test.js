/**
 * A dismiss before any toast has been shown fetches nothing: a page leaves edit
 * mode without downloading the toast stack, and its module-level listeners stay out.
 */
import { jest } from "@jest/globals";

let imports = 0;
jest.unstable_mockModule("../../src/ui/toast.js", () => {
  imports += 1;
  return { default: () => {}, toastPersistent: () => {}, dismissPersistent: jest.fn() };
});

const lazy = await import("../../src/ui/toast-lazy.js");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a dismiss with nothing shown fetches nothing, and one after a toast reaches the stack", async () => {
  lazy.dismissPersistent("Nothing was shown");
  await flush();
  expect(imports).toBe(0);

  lazy.toastPersistent("Shown", "warning");
  lazy.dismissPersistent("Shown");
  await flush();
  const toast = await import("../../src/ui/toast.js");
  expect(imports).toBe(1);
  expect(toast.dismissPersistent).toHaveBeenCalledWith("Shown");
});
