import { $$ } from "./helpers/editor-ui.js";

const toasts = () => $$('[data-clay-toast="warning"]', "toasts");
const notice = (detail) => document.dispatchEvent(new CustomEvent("clay:live-notice", { detail }));

beforeAll(async () => {
  window.clayEditMode = true;
  await import("../../src/ui/index.js");
});

test("a save that ended without an answer stays up as a toast with the edits it held", () => {
  const message = 'A save of "s" ended without an answer, so these edits were not sent again: n + 1; n + 1. Check the value, and redo any if missing.';
  notice({ name: "s", code: "save-uncertain", ops: [{ op: "add", path: ["n"], n: 1 }, { op: "add", path: ["n"], n: 1 }], message });

  expect(toasts()).toHaveLength(1);
  expect(toasts()[0].textContent).toContain("n + 1; n + 1");
  expect(toasts()[0].querySelector("button")).not.toBeNull();
});

test("other live notices are not toasts", () => {
  const before = toasts().length;
  notice({ name: "s", code: "provenance-unsupported", message: "The host does not keep provenance" });

  expect(toasts()).toHaveLength(before);
});
