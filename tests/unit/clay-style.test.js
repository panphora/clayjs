/**
 * clay.style(name, css) keeps a style a script owns in the saved file, so the
 * next load paints styled before any script runs, and refreshes it in place on
 * each load, so a page saved by an older script picks up newer CSS.
 *
 * The refresh must never be an edit: no close warning, no autosave. The page
 * boots through the real loader with <html autosave>, and each claim has a
 * control that shows the same check catching an ordinary change.
 */

function closeWouldWarn() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const settle = (ms = 3500) => new Promise((r) => setTimeout(r, ms));
let saves = 0;

beforeAll(async () => {
  window.clayEditMode = true;
  window.clay = {};
  window.fetch = async (url, opts) => {
    if (opts?.method === "POST") {
      saves++;
      return { ok: true, status: 200, text: async () => JSON.stringify({ msg: "Saved", msgType: "success" }) };
    }
    return { ok: false, status: 404, statusText: "Not Found", text: async () => "" };
  };
  document.head.insertAdjacentHTML(
    "beforeend",
    '<style data-name="early" clay="no-dirty">.a { color: red; }</style>' +
      '<style data-name="late" clay="no-dirty">.b { color: red; }</style>' +
      '<link rel="stylesheet" href="/app.css?v=1" clay="no-dirty">'
  );
  document.documentElement.setAttribute("autosave", "");
  document.body.innerHTML = '<div id="content">start</div>';
  document.querySelector('style[data-name="early"]').textContent = ".a { color: blue; }";
  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));
});

test("a saved style refreshed before boot does not count as unsaved", () => {
  expect(closeWouldWarn()).toBe(false);
});

test("clay.style refreshes the saved tag in place, without a warning or an autosave", async () => {
  const saved = document.querySelector('style[data-name="late"]');
  const el = window.clay.style("late", ".b { color: blue; }");
  expect(el).toBe(saved);
  expect(document.querySelectorAll('style[data-name="late"]').length).toBe(1);
  expect(el.textContent).toBe(".b { color: blue; }");
  await settle();
  expect(closeWouldWarn()).toBe(false);
  expect(saves).toBe(0);
});

test("clay.style points the saved link at a new version of the stylesheet, without a warning", () => {
  const link = window.clay.style("/app.css?v=2");
  expect(document.querySelectorAll('link[rel="stylesheet"]').length).toBe(1);
  expect(link.getAttribute("href")).toBe("/app.css?v=2");
  expect(closeWouldWarn()).toBe(false);
});

test("a new name is created as a no-dirty tag that the save carries", async () => {
  const el = window.clay.style("fresh", ".c { color: green; }");
  expect(el.getAttribute("clay")).toBe("no-dirty");
  expect(closeWouldWarn()).toBe(false);
  const { captureForSave } = await import("../../src/core/snapshot.js");
  const html = captureForSave({ emitForSync: false });
  expect(html).toContain(".b { color: blue; }");
  expect(html).toContain(".c { color: green; }");
  expect(html).toContain("/app.css?v=2");
});

test("control: a plain style added after boot does warn", () => {
  const s = document.head.appendChild(document.createElement("style"));
  s.textContent = ".d {}";
  expect(closeWouldWarn()).toBe(true);
  s.remove();
});

test("control: a real edit does autosave", async () => {
  const before = saves;
  document.getElementById("content").textContent = "an edit";
  await settle();
  expect(saves).toBeGreaterThan(before);
});
