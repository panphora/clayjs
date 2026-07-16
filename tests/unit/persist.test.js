import { captureForSave } from "../../src/core/snapshot.js";

beforeAll(async () => {
  document.body.innerHTML = '<input persist name="who" value="">';
  await import("../../src/core/persist.js"); // registers the onSnapshot finalize hook
});

test("a [persist] input's live value lands as an attribute in the save snapshot", () => {
  const input = document.querySelector('input[persist]');
  input.value = "typed-value";

  const forSave = captureForSave({ emitForSync: false });
  expect(forSave).toContain('value="typed-value"');
});
