import { jest } from "@jest/globals";

/**
 * The root says, in one attribute, that the page holds work a save has not
 * written: `unsaved="true"`, present exactly while the dirty gate says so.
 * `savestatus` keeps its five values, because saved documents style it and a
 * sixth value would blank their status while unsaved.
 */

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const root = () => document.documentElement;
const unsaved = () => root().getAttribute("unsaved");
const openTag = (html) => {
  const doctype = "<!DOCTYPE html>";
  const start = html.startsWith(doctype) ? doctype.length : 0;
  return html.slice(start, html.indexOf(">", start));
};

function type(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const API_TAG =
  '<script data-rules-name="api" data-rules-version="1" type="application/json">{"title":"h1"}</script>';

const clearCookies = () => {
  document.cookie = "isAdminOfCurrentResource=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

// View mode first: no instance loaded here can ever write the attribute, so the
// listeners it leaves on the document cannot disturb a later phase.
describe("view mode", () => {
  let gate;

  beforeAll(async () => {
    delete window.clayEditMode;
    delete window.__hyperclayEditMode;
    window.clay = {};
    gate = await import("../../src/lib/dirty-gate.js");
  });

  test("a page that cannot save never sets unsaved", async () => {
    document.body.innerHTML = "";
    window.clay.markDirty();
    await tick();

    expect(gate.pageMaybeDirty()).toBe(true);
    expect(unsaved()).toBe(null);
  });
});

describe("draft mode", () => {
  let gate;

  beforeAll(async () => {
    jest.resetModules();
    delete window.clayEditMode;
    delete window.__hyperclayEditMode;
    clearCookies();
    window.history.replaceState({}, "", "/notes.html");
    document.head.innerHTML = API_TAG;
    document.body.innerHTML = '<div id="content"><input type="text"></div>';
    root().setAttribute("visitor-drafts", "draft-slot-1");

    const drafted = await import("../../src/core/draft-mode.js");
    drafted.noteBootParams(new URLSearchParams("plugins=visitor-drafts"));
    gate = await import("../../src/lib/dirty-gate.js");
    await import("../../src/core/edit-mode.js");
  });

  test("it is edit mode, and the root says so with draftmode", () => {
    expect(root().getAttribute("editmode")).toBe("true");
    expect(root().getAttribute("draftmode")).toBe("true");
  });

  test("an unsaved draft raises it before clay:dirty, and a save that accounts for it clears it", async () => {
    const seen = [];
    const onDirty = () => seen.push(unsaved());
    document.addEventListener("clay:dirty", onDirty);
    try {
      type(document.querySelector("input"));
      await tick();
      expect(seen).toEqual(["true"]);
      expect(unsaved()).toBe("true");
    } finally {
      document.removeEventListener("clay:dirty", onDirty);
    }

    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    await tick();
    expect(unsaved()).toBe(null);
  });
});

describe("edit mode", () => {
  let gate;

  beforeAll(async () => {
    jest.resetModules();
    window.clayEditMode = true;
    clearCookies();
    root().removeAttribute("visitor-drafts");
    document.head.innerHTML = "";
    gate = await import("../../src/lib/dirty-gate.js");
  });

  beforeEach(async () => {
    document.body.innerHTML = "";
    await tick();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    await tick();
  });

  test("typing sets unsaved=true before clay:dirty reaches a listener", async () => {
    document.body.innerHTML = '<input type="text">';
    const seen = [];
    const onDirty = () => seen.push(unsaved());
    document.addEventListener("clay:dirty", onDirty);
    try {
      type(document.querySelector("input"));
      await tick();
      expect(seen).toEqual(["true"]);
      expect(unsaved()).toBe("true");
    } finally {
      document.removeEventListener("clay:dirty", onDirty);
    }
  });

  test("a save that accounts for every change removes it", async () => {
    document.body.innerHTML = '<input type="text">';
    type(document.querySelector("input"));
    await tick();
    expect(unsaved()).toBe("true");

    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    await tick();
    expect(unsaved()).toBe(null);
  });

  test("typing during an in-flight save leaves it set after the save lands", async () => {
    document.body.innerHTML = '<input type="text">';
    const input = document.querySelector("input");
    type(input);
    await tick();

    const token = gate.gateCaptureToken();
    type(input); // the keystroke that landed while the save was on the wire
    gate.gateClearIfUnchanged(token);
    await tick();
    expect(unsaved()).toBe("true");

    // The next save, taken after that keystroke, accounts for it.
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    await tick();
    expect(unsaved()).toBe(null);
  });

  test("a page save that writes everything the gate saw takes it off the root", async () => {
    const saveMod = await import("../../src/core/save.js");
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ msg: "Saved" }) }));
    document.body.innerHTML = '<div id="c">start</div>';
    await tick();

    document.getElementById("c").textContent = "changed";
    await tick();
    expect(unsaved()).toBe("true");

    await saveMod.savePage();
    await tick();

    expect(global.fetch).toHaveBeenCalled();
    expect(unsaved()).toBe(null);
  });

  test("the saved bytes read by clay.getHTML() carry no unsaved", async () => {
    const { getPageContents } = await import("../../src/core/snapshot.js");
    document.body.innerHTML = '<div id="c">start</div>';
    type(document.createElement("input"));
    root().setAttribute("unsaved", "true");

    const tag = openTag(getPageContents());
    expect(tag).toMatch(/^<html/i);
    expect(tag).not.toContain("unsaved=");
    // The live page keeps it; only the copy loses it.
    expect(unsaved()).toBe("true");
  });

  test("a sync frame carries no unsaved", async () => {
    const { captureSnapshot, serializeForSync } = await import("../../src/core/snapshot.js");
    document.body.innerHTML = '<div id="c">start</div>';
    root().setAttribute("unsaved", "true");

    const tag = openTag(serializeForSync(captureSnapshot({ flushUndo: false, authored: false })));
    expect(tag).toMatch(/^<html/i);
    expect(tag).not.toContain("unsaved=");
    expect(unsaved()).toBe("true");
  });

  test("writing it marks nothing dirty and reaches no undo step", async () => {
    const Mutation = (await import("../../src/lib/mutation.js")).default;
    const { isTabLocalAttr } = await import("../../src/lib/root-attrs.js");
    document.body.innerHTML = '<p id="p">a</p>';
    await tick();
    gate.gateClearIfUnchanged(gate.gateCaptureToken());
    await tick();

    const records = [];
    const events = [];
    const unsubscribe = Mutation.onAnyChange({ debounce: 0, require: "observed" }, (changes) =>
      records.push(...(changes || []))
    );
    const onEvent = (event) => events.push(event.type);
    document.addEventListener("clay:dirty", onEvent);
    document.addEventListener("clay:clean", onEvent);
    try {
      root().setAttribute("unsaved", "true");
      await tick();
      expect(records).toHaveLength(0);
      expect(events).toEqual([]);
      expect(gate.pageMaybeDirty()).toBe(false);
    } finally {
      unsubscribe();
      document.removeEventListener("clay:dirty", onEvent);
      document.removeEventListener("clay:clean", onEvent);
      root().removeAttribute("unsaved");
    }

    // Undo and the merge both key off this predicate.
    expect(isTabLocalAttr("unsaved", root())).toBe(true);
  });
});
