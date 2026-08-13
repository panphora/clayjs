import { jest } from "@jest/globals";

/**
 * The save baseline is the bytes that were sent, never a later re-read of the page.
 *
 * A post-save re-read used to run one tick after the response landed, to absorb the
 * DOM churn that [onaftersave] handlers cause. It could not tell that churn apart
 * from something the user typed while the request was in flight, so it recorded
 * those keystrokes as saved without ever sending them. The next autosave compared
 * equal and skipped, unsavedChanges went false, and beforeunload stayed quiet.
 */

let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
});

test("an edit made while the save is in flight is not marked as saved", async () => {
  let releaseResponse;
  const responseArrived = new Promise((r) => { releaseResponse = r; });

  global.fetch = jest.fn(() =>
    responseArrived.then(() => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }))
  );

  document.getElementById("content").textContent = "sent-content";
  const saving = saveMod.savePage();

  // The request is on the wire. Type something.
  await Promise.resolve();
  document.getElementById("content").textContent = "typed-during-save";

  releaseResponse();
  await saving;
  // Past the tick the old re-read used to run on.
  await new Promise((r) => setTimeout(r, 0));

  const baseline = saveMod.getLastSavedContents();
  expect(baseline).toContain("sent-content");
  expect(baseline).not.toContain("typed-during-save");
});

test("and the page still knows it is dirty afterwards", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));

  document.getElementById("content").textContent = "second-round";
  await saveMod.savePage();
  await new Promise((r) => setTimeout(r, 0));

  // The mid-flight edit from the previous test was never sent, so a follow-up save
  // must actually go to the wire rather than compare equal and skip.
  expect(global.fetch).toHaveBeenCalled();
  const body = global.fetch.mock.calls[0][1].body;
  expect(body).toContain("second-round");
});
