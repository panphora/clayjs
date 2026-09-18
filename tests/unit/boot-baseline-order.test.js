import { resolveModules, MODULES } from "../../src/loader-logic.js";

/**
 * save.js takes its immediate boot baseline while it evaluates. A core module
 * loaded after it that registers a snapshot transform changes every later
 * capture but not that baseline, so the page read as dirty with no edit at all
 * until the settled capture replaced it, up to three seconds later, or for good
 * when the module arrived after that. On clayjs.com an empty [persist] input
 * gained value="" in every capture, and a plain nav click raised the close
 * warning.
 *
 * Everything is read synchronously the moment the core wave has loaded, because
 * the settled capture would otherwise repair the baseline and hide the bug.
 */

let statusAtBoot, baselineAtBoot, warnedAtBoot;

function closeWouldWarn() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeAll(async () => {
  window.clayEditMode = true;
  document.body.innerHTML = `
    <input id="title" persist placeholder="title">
    <input id="admin" viewmode:disabled>
    <p>content</p>`;
  const { core } = resolveModules(new URLSearchParams(), true);
  const loaded = {};
  for (const path of core) loaded[path] = await MODULES[path]();
  statusAtBoot = document.documentElement.getAttribute("savestatus");
  baselineAtBoot = loaded["core/save.js"].getLastSavedDirty();
  warnedAtBoot = closeWouldWarn();
});

test("the checks below ran before the settled capture", () => {
  expect(statusAtBoot).toBeNull();
});

test("the boot baseline is taken with every core snapshot transform registered", () => {
  expect(baselineAtBoot).toMatch(/<input id="title"[^>]*\svalue=""/);
  expect(baselineAtBoot).toMatch(/<input id="admin"[^>]*\sdisabled=""/);
});

test("an untouched page does not warn on close before the baseline settles", () => {
  expect(warnedAtBoot).toBe(false);
});
