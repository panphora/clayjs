/**
 * The demo plugin saves into the visitor's own browser storage, so the close
 * warning stands down whenever it is loaded. Without that, clayjs.com asked
 * "leave without saving?" when a visitor typed into a demo box and then clicked
 * a nav link.
 *
 * The page boots through the real loader, because the gate reads the clay.demo
 * member the loader attaches; a hand-built window.clay would keep this green
 * with that attachment gone.
 */

function closeWouldWarn() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  window.fetch = async () => new Response("", { status: 404 });
  document.body.innerHTML = '<div id="content">start</div>';
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("plugins=demo&exclude=richclay,source"), resolve));
  document.getElementById("content").textContent = "an unsaved edit";
});

test("the loader attaches clay.demo, and an unsaved edit does not warn on close", () => {
  expect(window.clay.demo).toBeTruthy();
  expect(closeWouldWarn()).toBe(false);
});

test("the same edit warns once clay.demo is gone", () => {
  const demo = window.clay.demo;
  delete window.clay.demo;
  try {
    expect(closeWouldWarn()).toBe(true);
  } finally {
    window.clay.demo = demo;
  }
});
