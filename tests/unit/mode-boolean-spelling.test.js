/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

jest.setTimeout(120000);

/**
 * D2: a controlled boolean attribute the author spelled non-empty stays dirty after the
 * first save of a session.
 *
 * The save bytes come from the clone the provenance map was recorded for, so
 * `viewmode:disabled="" disabled="disabled"` is written back as the author spelled it.
 * The comparison and dirty baselines come from a clone OF that clone, and while it had no
 * provenance the restore transform answered `null` there and spelled the attribute `""`.
 * The baseline then said the page had changed the moment the save was accepted, so every
 * later dirty check was true: `hasUnsavedChanges()` warned on a saved page and the exit
 * was refused `save-failed`.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flush = async () => {
  for (let i = 0; i < 20; i++) await sleep(0);
};

const until = async (predicate, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await sleep(5);
  return predicate();
};

function okResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    text: async () => JSON.stringify({ msg: "Saved" }),
  };
}

function notFound() {
  return { ok: false, status: 404, statusText: "Not Found", headers: { get: () => null }, text: async () => "" };
}

// The bytes every file write carried, in the order they went out. Only `/_/save` is a file
// write; the page data lane posts elsewhere and is not a second save.
let written = [];

async function bootPage(body) {
  jest.resetModules();
  written = [];
  globalThis.fetch = window.fetch = jest.fn(async (url, options = {}) => {
    if ((options.method || "GET").toUpperCase() === "POST" && /\/_\/save$/.test(new URL(String(url), window.location.origin).pathname)) {
      written.push(String(options.body ?? ""));
    }
    return (options.method || "GET").toUpperCase() === "POST" ? okResponse() : notFound();
  });

  delete window.clayEditMode;
  delete window.__hyperclayEditMode;
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "isAdminOfCurrentResource=true; path=/";
  window.history.replaceState({}, "", "/notes.html");
  sessionStorage.clear();
  localStorage.clear();
  window.scrollTo = () => {};

  const root = document.documentElement;
  for (const name of Array.from(root.attributes, (attribute) => attribute.name)) root.removeAttribute(name);
  root.setAttribute("clay-mode-switch", "live");
  document.head.innerHTML = "<title>Notes</title>";
  // clays the page out of the way of this test: richclay would mount its own regions and
  // source would map the file, and neither is what a boolean attribute's spelling depends on.
  document.body.innerHTML = body;
  window.clay = {};

  const { boot } = await import("../../src/loader.js");
  await new Promise((resolve) => boot(null, new URLSearchParams("exclude=richclay,source"), resolve));

  const save = await import("../../src/core/save.js");
  await until(() => save.baselineSettled());
  await flush();
  return window.clay;
}

const enter = async (clay) => {
  const result = await clay.setMode("edit");
  expect(result).toEqual({ ok: true, mode: "edit", changed: true });
  await flush();
};

const leave = async (clay) => {
  const result = await clay.setMode("view");
  expect(result).toEqual({ ok: true, mode: "view", changed: true });
  await flush();
};

const type = async (text) => {
  document.getElementById("content").textContent = text;
  await flush();
};

// The author's own spelling of the boolean, beside the viewmode: marker that makes clay
// take the attribute over while the page is being edited.
const page = (authored) => `
  <main>
    <div id="content" editmode:contenteditable>start</div>
    <p><input id="field" viewmode:${authored.split("=")[0]} value="v" ${authored}></p>
  </main>`;

const CASES = ['disabled="disabled"', 'readonly="readonly"', 'disabled=""'];

test.each(CASES)("a boolean spelled %s is saved as written and leaves the page clean", async (authored) => {
  const name = authored.split("=")[0];
  const clay = await bootPage(page(authored));
  const warning = await import("../../src/core/unsaved-warning.js");
  try {
    await enter(clay);
    expect(document.getElementById("field").hasAttribute(name)).toBe(false);

    await type("typed once");
    expect(await until(() => warning.hasUnsavedChanges())).toBe(true);

    await leave(clay);

    // One write, carrying the author's own spelling of the boolean.
    expect(written).toHaveLength(1);
    expect(written[0]).toContain(authored);

    // The page the host now holds is the page on screen: nothing is left owing.
    expect(warning.hasUnsavedChanges()).toBe(false);

    // A second cycle with no edit writes nothing at all.
    await enter(clay);
    expect(warning.hasUnsavedChanges()).toBe(false);
    await leave(clay);
    expect(written).toHaveLength(1);
  } finally {
    if (clay.mode === "edit") await leave(clay);
  }
});
