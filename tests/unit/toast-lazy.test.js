/**
 * The toast stack loads on the first toast, not when the editor becomes ready.
 *
 * The real module is held behind a deferred promise the test settles by hand, so
 * the three calls below are made while it is still on its way: they reach it in
 * the order they were made, with their arguments, and it is asked for once.
 */
import { jest } from "@jest/globals";

import { toastStack, $$ } from "./helpers/editor-ui.js";

const actual = await import("../../src/ui/toast.js");

const calls = [];
const releases = [];
let imports = 0;

jest.unstable_mockModule("../../src/ui/toast.js", () => {
  imports += 1;
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  releases.push(release);
  const record = (name) => (...args) => {
    calls.push({ name, args });
    return (name ? actual[name] : actual.default)(...args);
  };
  return ready.then(() => ({
    default: record(null),
    toastPersistent: record("toastPersistent"),
    dismissPersistent: record("dismissPersistent"),
  }));
});

const releaseToasts = () => {
  for (const release of releases.splice(0)) release();
};

const flush = async () => {
  for (let n = 0; n < 50; n++) await Promise.resolve();
};

const stack = () => toastStack();
const toasts = () => $$("[data-clay-toast]", "toasts");

let toast, toastPersistent, dismissPersistent;

beforeAll(async () => {
  ({ default: toast, toastPersistent, dismissPersistent } = await import("../../src/ui/toast-lazy.js"));
});

beforeEach(() => {
  calls.length = 0;
  document.body.innerHTML = "";
});

test("three calls made while it loads reach the real module in order with their arguments, once", async () => {
  toast("Saved");
  toastPersistent("Could not save", "error", { detail: "the host said no" });
  dismissPersistent("Could not save");
  await flush();

  expect(imports).toBe(1);
  expect(calls).toEqual([]);

  releaseToasts();
  await flush();

  expect(calls).toEqual([
    { name: null, args: ["Saved"] },
    { name: "toastPersistent", args: ["Could not save", "error", { detail: "the host said no" }] },
    { name: "dismissPersistent", args: ["Could not save"] },
  ]);
  expect(imports).toBe(1);
  expect(stack()).not.toBeNull();
  expect(toasts().map((el) => el.getAttribute("data-clay-toast"))).toEqual(["success", "error"]);
  expect(toasts().at(-1).textContent).toContain("the host said no");
});

test("a call made after it has arrived shows the toast and fetches nothing again", async () => {
  toast("Again", "info");
  await flush();

  expect(imports).toBe(1);
  expect(calls).toEqual([{ name: null, args: ["Again", "info"] }]);
  expect(toasts()).toHaveLength(1);
  expect(toasts()[0].getAttribute("data-clay-toast")).toBe("info");
  expect(toasts()[0].textContent).toContain("Again");
});
