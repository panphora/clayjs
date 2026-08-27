import { captureForSave } from "../../src/core/snapshot.js";

// The clay- prefixed spellings exist for a page whose own component already owns the
// bare name. They are not documented, but they are load-bearing once a saved document
// hardcodes one: nothing can reach that file to change it, so a spelling that quietly
// stops working is a document that quietly stops saving.

beforeAll(async () => {
  document.body.innerHTML = '<input clay-persist name="who" value="">';
  await import("../../src/core/persist.js");
});

test("a [clay-persist] input's live value lands in the save snapshot", () => {
  const input = document.querySelector("input[clay-persist]");
  input.value = "typed-value";

  expect(captureForSave({ emitForSync: false })).toContain('value="typed-value"');
});
