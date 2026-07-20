import { jest } from "@jest/globals";

// The server can answer a successful save with msgType 'warning' (htmlclay does
// this when an outside process changed the file since the server last wrote it).
// Core threads msg + msgType onto the public clay:save-saved event and renders
// nothing itself — rendering is the optional UI module's job.

let saveMod;

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = '<div id="content">start</div>';
  saveMod = await import("../../src/core/save.js");
});

function respondWith(body) {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => body }));
}

async function saveAndCaptureDetail(text) {
  document.getElementById("content").textContent = text;
  const seen = [];
  const onSaved = (e) => seen.push(e.detail);
  document.addEventListener("clay:save-saved", onSaved);
  await saveMod.savePage();
  document.removeEventListener("clay:save-saved", onSaved);
  return seen;
}

test("warning msgType from the server reaches the clay:save-saved detail", async () => {
  respondWith({ msg: "Saved, but the file changed on disk", msgType: "warning" });

  const seen = await saveAndCaptureDetail("changed-warning");

  expect(seen).toHaveLength(1);
  expect(seen[0].msg).toBe("Saved, but the file changed on disk");
  expect(seen[0].msgType).toBe("warning");
});

test("success msgType reaches the clay:save-saved detail", async () => {
  respondWith({ msg: "Saved", msgType: "success" });

  const seen = await saveAndCaptureDetail("changed-success-detail");

  expect(seen[0]).toMatchObject({ msg: "Saved", msgType: "success" });
});

test("msgType is empty when the server sends none", async () => {
  respondWith({ msg: "Saved" });

  const seen = await saveAndCaptureDetail("changed-no-msgtype");

  expect(seen[0].msg).toBe("Saved");
  expect(seen[0].msgType).toBe("");
});

test("core alone renders no toast — a warning save leaves the DOM untouched", async () => {
  respondWith({ msg: "Saved, but the file changed on disk", msgType: "warning" });

  await saveAndCaptureDetail("changed-no-ui-module");

  expect(document.querySelector(".toast-container")).toBeNull();
  expect(document.querySelector(".toast")).toBeNull();
  expect(document.body.textContent).not.toContain("changed on disk");
});
