// Scenario: the page says why it cannot be edited.
//
// The console line in host-attrs.js reaches a developer. Somebody editing a document in
// a desktop app has no console open and is holding a different question: why can I not
// edit this any more. This notice answers it on the page.

import { jest } from "@jest/globals";

const bar = () => document.querySelector("[data-clay-stale-host]");

test("a stale host gets a notice naming the fix", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");
  jest.spyOn(console, "warn").mockImplementation(() => {});

  await import("../../src/core/stale-host-notice.js");

  expect(bar()).not.toBeNull();
  expect(bar().textContent).toContain("out of date");
  expect(bar().textContent).toContain("1.9.0");
});

// The bar is injected, so it exists in no document on disk. All three markers matter on
// a page that CAN save: it must never be written into a save, never wake the watcher,
// and never ride out in a snapshot to another person's browser.
test("the notice is marked so it can never reach disk or a peer", async () => {
  document.documentElement.setAttribute("htmlclaytoken", "tok-old");
  jest.spyOn(console, "warn").mockImplementation(() => {});

  await import("../../src/core/stale-host-notice.js");

  const marker = bar().getAttribute("clay");
  expect(marker).toContain("no-save");
  expect(marker).toContain("no-watch");
  expect(marker).toContain("no-snapshot");
});
