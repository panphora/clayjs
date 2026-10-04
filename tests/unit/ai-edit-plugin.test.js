import { jest } from "@jest/globals";
import Mutation from "../../src/lib/mutation.js";
import * as realVendor from "../../src/vendor/hyper-morph.vendor.js";

/**
 * The ai-edit plugin, driven through a stubbed `clay.wire`.
 *
 * Everything the plugin does with the host goes through the wire module, so that is
 * the seam: the mock records what a request carries and hands back a handle whose
 * `done` this test settles by hand. The plugin's own boot runs at import, and the
 * loader loads it after the page is parsed, so a single instance serves the file:
 * the first section proves it stays dormant when no ready helper is listed, and the
 * rest call the exported `init()` once the stub lists one.
 */

const fakeWire = { helpers: jest.fn(), send: jest.fn() };

jest.unstable_mockModule("../../src/plugins/wire.js", () => ({ default: fakeWire, wire: fakeWire }));

// The vendor publishes `morph` as a non-configurable getter, so the morphs cannot be
// spied on where they are defined. The module is mocked instead, delegating to the
// real engine and recording each call: the Keep flow is only interesting as a
// sequence of morphs around a pause.
const morphCalls = [];
const vendorMock = { ...realVendor };
vendorMock.HyperMorph = { ...realVendor.HyperMorph };
vendorMock.HyperMorph.morph = (...args) => {
  morphCalls.push(args);
  return realVendor.HyperMorph.morph(...args);
};
vendorMock.morph = vendorMock.HyperMorph.morph;
vendorMock.default = vendorMock.HyperMorph;

jest.unstable_mockModule("../../src/vendor/hyper-morph.vendor.js", () => vendorMock);

// Edit mode is read at module evaluation of core/is-edit-mode.js, which the plugin
// pulls in: this has to be set before the import below.
window.clayEditMode = true;

const save = jest.fn();
const order = [];

let handleSeq = 0;

function makeHandle() {
  let settle;
  const done = new Promise((resolve) => { settle = resolve; });
  return { id: "handle-" + (++handleSeq), done, cancel: jest.fn(), settle };
}

const PAGE = '<section data-edit-id="hero"><h1>Old heading</h1><p>Old paragraph</p></section>';

const panel = () => document.querySelector('[data-clay-ai-edit="panel"]');
const textarea = () => panel().querySelector("textarea");
// The panel's own status line: the host's switch being off, and a request too large to
// send. Everything about a live edit is on the bar.
const statusEl = () => panel().querySelector('[data-clay-ai-edit-part="status"]');
const button = (name) => panel().querySelector(`[data-clay-ai-edit-part="${name}"]`);
const bar = () => document.querySelector('[data-clay-ai-edit="status-bar"]');
const barShown = () => !!bar() && !bar().hidden;
const barStatus = () => bar().querySelector('[data-clay-ai-edit-part="bar-status"]');
const barButton = (name) => bar().querySelector(`[data-clay-ai-edit-part="bar-${name}"]`);
const chip = () => document.querySelector('[data-clay-ai-edit="chip"]');
const docBubble = () => document.querySelector('[data-clay-ai-edit="bubble"]');
const heading = () => document.querySelector("h1");

// Every step of a send is a microtask, and the wire's handle settles on its own.
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

let aiEdit = null;
let handle = null;

function mountPage() {
  document.querySelectorAll("[data-edit-id]").forEach(el => el.remove());
  document.body.insertAdjacentHTML("afterbegin", PAGE);
  return document.querySelector("[data-edit-id]");
}

function mountHTML(html) {
  document.querySelectorAll("[data-edit-id]").forEach(el => el.remove());
  document.body.insertAdjacentHTML("afterbegin", html);
  return document.querySelector("[data-edit-id]");
}

function clickSection(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function submit(comment) {
  textarea().value = comment;
  button("send").click();
  await flush();
}

beforeAll(async () => {
  window.clay = window.clay || {};
  window.clay.save = save;
  // No ready ai-edit yet: the plugin's boot has to find nothing and build nothing.
  fakeWire.helpers.mockResolvedValue([{ name: "search", state: "ready" }, { name: "ai-edit", state: "denied" }]);
  ({ aiEdit } = await import("../../src/plugins/ai-edit.js"));
  await flush();
});

test("stays dormant while helpers() lists no ready ai-edit", () => {
  expect(fakeWire.helpers).toHaveBeenCalled();
  expect(chip()).toBeNull();
  expect(panel()).toBeNull();
  expect(docBubble()).toBeNull();
  expect(fakeWire.send).not.toHaveBeenCalled();
});

test("open() with no ai-edit helper on this host returns false and builds nothing", async () => {
  fakeWire.helpers.mockResolvedValue([{ name: "search", state: "ready" }]);
  const target = mountPage();
  expect(await aiEdit.open(target, { prompt: "tighten this" })).toBe(false);
  expect(panel()).toBeNull();
  expect(chip()).toBeNull();
  expect(document.querySelectorAll("[data-clay-ai-edit]").length).toBe(0);
  expect(fakeWire.send).not.toHaveBeenCalled();
});

test("concurrent init() and open() calls build one composer", async () => {
  fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
  const target = mountPage();
  try {
    const results = await Promise.all([
      aiEdit.init(),
      aiEdit.open(target, { prompt: "add a bar chart" }),
      aiEdit.init(),
    ]);
    expect(results).toEqual([undefined, true, undefined]);
    for (const name of ["panel", "ring", "chip", "bubble", "status-bar"]) {
      expect([name, document.querySelectorAll(`[data-clay-ai-edit="${name}"]`).length]).toEqual([name, 1]);
    }
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("add a bar chart");
  } finally {
    // Leave the composer shut, the way the rest of this file expects to find it.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }
  expect(panel().hidden).toBe(true);
});

describe("with a ready ai-edit helper", () => {
  beforeAll(async () => {
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
    await aiEdit.init();
    await flush();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    vendorMock.HyperMorph.morph = (...args) => realVendor.HyperMorph.morph(...args);
    vendorMock.morph = vendorMock.HyperMorph.morph;
    morphCalls.length = 0;
    order.length = 0;
    save.mockReset();
    save.mockImplementation(async () => {
      order.push("save");
      return { ok: true, msg: "saved", msgType: "success", code: null, etag: null };
    });
    handle = makeHandle();
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
    fakeWire.send.mockReset();
    fakeWire.send.mockImplementation((payload, opts) => {
      order.push("send");
      handle.payload = payload;
      handle.opts = opts;
      return handle;
    });
    window.getSelection().removeAllRanges();
  });

  afterEach(async () => {
    // Leave no request in flight for the next test: the bar owns Stop, Keep and Revert.
    if (barShown()) {
      if (!barButton("stop").hidden) barButton("stop").click();
      else if (!barButton("revert").hidden) barButton("revert").click();
      else if (!barButton("close").hidden) barButton("close").click();
    }
    // A save in flight has no control of its own, so it ends the way the page ends it:
    // the target it describes goes away.
    if (barShown()) document.querySelectorAll("[data-edit-id]").forEach((el) => el.remove());
    await flush();
  });

  test("builds its chrome, marked runtime-only, once a ready helper is listed", () => {
    expect(chip()).not.toBeNull();
    expect(chip().hidden).toBe(true);
    expect(panel().hidden).toBe(true);
    expect(docBubble()).not.toBeNull();
    expect(barShown()).toBe(false);
    for (const el of [panel(), bar(), chip(), docBubble(), document.querySelector('[data-clay-ai-edit="ring"]')]) {
      expect(el.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
    }
    // The panel keeps only compose: its session controls are on the bar now.
    for (const name of ["stop", "keep", "revert", "warnings"]) {
      expect([name, panel().querySelector(`[data-clay-ai-edit-part="${name}"]`)]).toEqual([name, null]);
    }
  });

  test("sends a named helper request carrying the unit's HTML and no pageHTML", async () => {
    clickSection(mountPage());
    await submit("tighten this");

    expect(fakeWire.send).toHaveBeenCalledTimes(1);
    const { payload, opts } = handle;
    expect(opts.helper).toBe("ai-edit");
    // The wire defaults a named request to `document: "none"`: nothing here asks
    // the host to write the file.
    expect(opts.document).toBeUndefined();
    expect(payload.comment).toBe("tighten this");
    expect(payload.editId).toBe("hero");
    expect(payload.tag).toBe("section");
    expect(payload.elementHTML).toBe(PAGE);
    expect("pageHTML" in payload).toBe(false);
    expect("page" in payload).toBe(false);
    expect(payload.quote).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(panel().hidden).toBe(true);
    expect(barShown()).toBe(true);
    expect(barStatus().textContent).toBe("Sending\u2026");
    expect(barButton("stop").hidden).toBe(false);

    // Status records are all the wire carries, so they render as bar lines.
    opts.onStatus({ text: "Writing, 1.8 KB" });
    expect(barStatus().textContent).toBe("Writing, 1.8 KB");

    // The result is the element's own HTML, morphs in once, and offers Keep/Revert/X.
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "claude-opus-4-6" } });
    await flush();

    expect(heading().textContent).toBe("New heading");
    expect(barStatus().textContent).toBe("Edit ready. (claude-opus-4-6)");
    expect(barButton("keep").hidden).toBe(false);
    expect(barButton("revert").hidden).toBe(false);
    expect(barButton("close").hidden).toBe(false);
    expect(barButton("stop").hidden).toBe(true);

    // Revert is the way back out, with the edit already applied, and it takes the bar
    // away with it.
    barButton("revert").click();
    await flush();
    expect(heading().textContent).toBe("Old heading");
    expect(barShown()).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  test("a quote rides along from the selection", async () => {
    const section = mountPage();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    clickSection(section);
    await submit("tighten this");

    expect(handle.payload.quote).toBe("Old paragraph");
  });

  test("@page saves the page first and asks for it by flag", async () => {
    clickSection(mountPage());
    await submit("rewrite the intro @page");

    expect(order).toEqual(["save", "send"]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(handle.payload.page).toBe(true);
    expect("pageHTML" in handle.payload).toBe(false);

    // @file.ext is context, @page is not a context ref.
    expect(handle.payload.contextRefs).toEqual([]);

    // Only a person pressing Stop goes quietly; a host-side cancellation says so.
    handle.settle({ state: "cancelled" });
    await flush();
    expect(barStatus().textContent).toBe("HTML Clay stopped this edit.");
    expect(barButton("close").hidden).toBe(false);
  });

  test("an email address is not an attachment, and a real @file ref still is", async () => {
    clickSection(mountPage());
    await submit("email bob@example.com about this, see @notes.md");
    expect(handle.payload.contextRefs).toEqual(["notes.md"]);
  });

  test("a full stop after an attachment or @page is not part of the name", async () => {
    clickSection(mountPage());
    await submit("Match @notes.md. Use @page.");
    expect(handle.payload.contextRefs).toEqual(["notes.md"]);
    expect(handle.payload.page).toBe(true);
  });

  test("an @ inside a URL or after an accented letter is not an attachment, and info@page.io is not @page", async () => {
    clickSection(mountPage());
    await submit("email josé@example.com, see https://cdn.jsdelivr.net/npm/@panphora/clayjs@1.5.3/x.js and medium.com/@david/post, or info@page.io");
    expect(handle.payload.contextRefs).toEqual([]);
    expect(handle.payload.page).toBeFalsy();
    expect(save).not.toHaveBeenCalled();
  });

  // Stop is live while an @page save is still in flight, before the wire has handed
  // back a handle: a cancel there has to land, and the request must never go out.
  test("Stop during the @page save cancels before anything is sent", async () => {
    let releaseSave;
    save.mockImplementation(() => {
      order.push("save");
      return new Promise((resolve) => { releaseSave = resolve; });
    });

    clickSection(mountPage());
    textarea().value = "rewrite the intro @page";
    button("send").click();
    await flush();
    expect(order).toEqual(["save"]);

    barButton("stop").click();
    expect(barShown()).toBe(false);

    releaseSave({ ok: true, msg: "saved", msgType: "success" });
    await flush();
    expect(fakeWire.send).not.toHaveBeenCalled();
    expect(barShown()).toBe(false);
  });

  test("Keep rewinds under pause, resumes, lands one recorded morph and saves", async () => {
    const trace = [];
    jest.spyOn(Mutation, "pause").mockImplementation(() => { trace.push("pause"); });
    jest.spyOn(Mutation, "resume").mockImplementation(() => { trace.push("resume"); });
    const morph = (...args) => {
      morphCalls.push(args);
      trace.push("morph");
      return realVendor.HyperMorph.morph(...args);
    };
    vendorMock.HyperMorph.morph = morph;
    vendorMock.morph = morph;
    save.mockImplementation(async () => {
      trace.push("save");
      return { ok: true, msg: "saved", msgType: "success" };
    });

    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "claude-opus-4-6" } });
    await flush();

    barButton("keep").click();
    expect(barStatus().textContent).toBe("Saving\u2026");
    expect(barButton("stop").hidden).toBe(true);
    expect(barButton("keep").hidden).toBe(true);
    await flush();

    expect(trace).toEqual(["pause", "morph", "morph", "resume", "morph", "save"]);
    // The rewind restores the snapshot exactly; the morph that lands the edit is
    // three-way merged against the HTML the model saw, so mid-flight edits survive.
    expect(morphCalls).toHaveLength(3);
    const calls = morphCalls;
    expect(calls[1][2].scripts).toEqual({ merge: false, handle: false });
    expect(calls[2][2].scripts.mergeBase).toBe(PAGE);
    expect(typeof calls[2][2].scripts.mergeTags).toBe("object");
    expect(save).toHaveBeenCalledTimes(1);
    expect(heading().textContent).toBe("New heading");
    expect(barStatus().textContent).toBe("saved");
    expect(barShown()).toBe(true);
  });

  test("Keep lands an edit made in the live preview, with the same call sequence", async () => {
    const trace = [];
    jest.spyOn(Mutation, "pause").mockImplementation(() => { trace.push("pause"); });
    jest.spyOn(Mutation, "resume").mockImplementation(() => { trace.push("resume"); });
    const morph = (...args) => {
      morphCalls.push(args);
      trace.push("morph");
      return realVendor.HyperMorph.morph(...args);
    };
    vendorMock.HyperMorph.morph = morph;
    vendorMock.morph = morph;
    save.mockImplementation(async () => {
      trace.push("save");
      return { ok: true, msg: "saved", msgType: "success" };
    });

    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(barButton("keep").hidden).toBe(false);

    // A fix made by hand in the preview is what is on screen, so it is what Keep keeps.
    heading().textContent = "New heading, fixed by hand";
    barButton("keep").click();
    await flush();

    expect(trace).toEqual(["pause", "morph", "morph", "resume", "morph", "save"]);
    expect(morphCalls).toHaveLength(3);
    expect(heading().textContent).toBe("New heading, fixed by hand");
    expect(barStatus().textContent).toBe("saved");
  });

  test("an error outcome reverts the whole edit and reports it", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "error", error: "the helper reported an error", errorCode: "helper_failed" });
    await flush();

    expect(heading().textContent).toBe("Old heading");
    expect(barStatus().textContent).toBe("the helper reported an error");
    expect(barStatus().getAttribute("data-tone")).toBe("warn");
    expect(barButton("close").hidden).toBe(false);
    expect(barButton("keep").hidden).toBe(true);
    expect(barButton("stop").hidden).toBe(true);
  });

  test("a host-side cancellation reverts and reports HTML Clay stopped this edit", async () => {
    clickSection(mountPage());
    await submit("tighten this");

    // What wire.js resolves for the host\u2019s own helper_cancelled refusal.
    handle.settle({ state: "cancelled", error: "helper cancelled", errorCode: "helper_cancelled" });
    await flush();

    expect(heading().textContent).toBe("Old heading");
    expect(barShown()).toBe(true);
    expect(barStatus().textContent).toBe("HTML Clay stopped this edit.");
    expect(barStatus().getAttribute("data-tone")).toBe("warn");
    expect(barButton("close").hidden).toBe(false);
    expect(barButton("keep").hidden).toBe(true);
    expect(barButton("stop").hidden).toBe(true);
  });

  test("Stop keeps the sent comment as the target\u2019s draft", async () => {
    const section = mountPage();
    clickSection(section);
    await submit("tighten this");

    barButton("stop").click();
    await flush();
    expect(barShown()).toBe(false);

    clickSection(section);
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("tighten this");
  });

  test("a failed request keeps the sent comment as the target\u2019s draft", async () => {
    const section = mountPage();
    clickSection(section);
    await submit("tighten this");

    handle.settle({ state: "error", error: "it did not work", errorCode: "helper_failed" });
    await flush();
    expect(barShown()).toBe(true);

    barButton("close").click();
    clickSection(section);
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("tighten this");
  });

  test("Stop cancels the request and reverts; the late terminal frame is ignored", async () => {
    clickSection(mountPage());
    await submit("tighten this");

    barButton("stop").click();
    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(barShown()).toBe(false);

    handle.settle({ state: "cancelled" });
    await flush();

    expect(barShown()).toBe(false);
    expect(heading().textContent).toBe("Old heading");
  });

  test("document mode sends the body without the chrome and without a page copy", async () => {
    mountPage();
    docBubble().click();
    await submit("rewrite the whole page @page");

    const { payload } = handle;
    expect(payload.tag).toBe("body");
    expect(payload.editId).toBe("document");
    expect(payload.elementHTML).toContain("<h1>Old heading</h1>");
    expect(payload.elementHTML).not.toContain("data-clay-ai-edit");
    expect("page" in payload).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  test("Keep in document mode lands the live page without its own chrome", async () => {
    mountPage();
    docBubble().click();
    await submit("rewrite the whole page");
    handle.settle({ state: "done", result: { html: '<body><section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section></body>', model: "m" } });
    await flush();
    expect(heading().textContent).toBe("New heading");

    barButton("keep").click();
    await flush();

    expect(heading().textContent).toBe("New heading");
    expect(barStatus().textContent).toBe("saved");
    expect(document.querySelector('[data-clay-ai-edit="status-bar"]')).not.toBeNull();
    // Document mode has no target to remove, so the bar ends the way it always does.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(barShown()).toBe(false);
  });

  test("refuses an oversize request before sending anything", async () => {
    clickSection(mountPage());
    await submit("x".repeat(1000 * 1024));

    expect(fakeWire.send).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(statusEl().textContent).toBe("This section is too large for AI editing; select a smaller part.");
    expect(statusEl().getAttribute("data-tone")).toBe("warn");
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("x".repeat(1000 * 1024));
    expect(barShown()).toBe(false);

    // The refusal does not wedge the panel: a request that fits still goes out.
    await submit("tighten this");
    expect(fakeWire.send).toHaveBeenCalledTimes(1);
    expect(handle.payload.comment).toBe("tighten this");
  });

  test("a reply that adds a script is refused before it is shown", async () => {
    clickSection(mountPage());
    await submit("make it fancy");
    const before = document.querySelector("[data-edit-id]").outerHTML;
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New</h1><script>alert(1)</script></section>', model: "m" } });
    await flush();
    expect(document.querySelector("[data-edit-id]").outerHTML).toBe(before);
    expect(barStatus().textContent).toMatch(/adds a script or event handler/);
    expect(barButton("keep").hidden).toBe(true);
  });

  test("a reply that adds an inline handler is refused", async () => {
    clickSection(mountPage());
    await submit("make it clickable");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1 onclick="x()">New</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(heading().textContent).toBe("Old heading");
    expect(barStatus().textContent).toMatch(/adds a script or event handler/);
  });

  test("a javascript: URL split by an encoded tab is refused", async () => {
    clickSection(mountPage());
    await submit("add a link");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>Old heading</h1><p><a href="java&#9;script:void(0)">x</a></p></section>', model: "m" } });
    await flush();
    expect(document.querySelector("[data-edit-id] a")).toBeNull();
    expect(barStatus().textContent).toMatch(/adds a script or event handler/);
  });

  test("a reply that makes an existing data script executable is refused and nothing runs", async () => {
    window.__aiEditRuns = 0;
    clickSection(mountHTML('<section data-edit-id="hero"><h1>Old heading</h1><script type="text/plain">window.__aiEditRuns += 1</script></section>'));
    await submit("tidy");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><script>window.__aiEditRuns += 1</script></section>', model: "m" } });
    await flush();
    expect(window.__aiEditRuns).toBe(0);
    expect(heading().textContent).toBe("Old heading");
    expect(barStatus().textContent).toMatch(/adds a script or event handler/);
  });

  test("a reply that copies an existing handler onto a second element is refused", async () => {
    clickSection(mountHTML('<section data-edit-id="hero"><h1>Old heading</h1><button onclick="void 0">a</button></section>'));
    await submit("add another button");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>Old heading</h1><button onclick="void 0">a</button><button onclick="void 0">b</button></section>', model: "m" } });
    await flush();
    expect(document.querySelectorAll("[data-edit-id] button").length).toBe(1);
    expect(barStatus().textContent).toMatch(/adds a script or event handler/);
  });

  test("a reply that adds a JSON data script is shown for Keep", async () => {
    clickSection(mountPage());
    await submit("add data");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>Old heading</h1><p>Old paragraph</p><script type="application/json">{"a":1}</script></section>', model: "m" } });
    await flush();
    expect(barButton("keep").hidden).toBe(false);
  });

  test("a morph that throws releases the save hold and reports the failure", async () => {
    clickSection(mountPage());
    await submit("tighten");
    vendorMock.HyperMorph.morph = (el, content, ...rest) => {
      if (typeof content !== "string") throw new Error("boom");
      return realVendor.HyperMorph.morph(el, content, ...rest);
    };
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    const saveModule = await import("../../src/core/save.js");
    expect(saveModule.savesHeld()).toBe(false);
    expect(barStatus().textContent).toMatch(/could not be applied/);
    expect(heading().textContent).toBe("Old heading");
  });

  test("removing the previewed section releases the save hold and closes the panel", async () => {
    clickSection(mountPage());
    await submit("tighten");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    const saveModule = await import("../../src/core/save.js");
    expect(saveModule.savesHeld()).toBe(true);
    document.querySelector("[data-edit-id]").remove();
    await flush();
    expect(saveModule.savesHeld()).toBe(false);
    expect(panel().hidden).toBe(true);
    expect(barShown()).toBe(false);
  });

  test("removing the section during a request cancels it on the wire", async () => {
    clickSection(mountPage());
    await submit("tighten");
    document.querySelector("[data-edit-id]").remove();
    await flush();
    expect(handle.cancel).toHaveBeenCalled();
    expect(panel().hidden).toBe(true);
    expect(barShown()).toBe(false);
  });

  test("a save for a removed target cannot touch or close the next target's bar", async () => {
    const saveModule = await import("../../src/core/save.js");
    const sent = [];
    fakeWire.send.mockImplementation((payload, opts) => {
      const next = makeHandle();
      next.payload = payload;
      next.opts = opts;
      sent.push(next);
      order.push("send");
      return next;
    });
    let releaseFirstSave;
    save.mockImplementationOnce(() => new Promise((resolve) => { releaseFirstSave = resolve; }));

    const first = mountHTML('<section data-edit-id="a"><h1>Old a</h1></section>');
    clickSection(first);
    textarea().value = "edit a";
    button("send").click();
    await flush();
    sent[0].settle({ state: "done", result: { html: '<section data-edit-id="a"><h1>New a</h1></section>', model: "m" } });
    await flush();

    // A is kept and its save is still out when its target leaves the page.
    barButton("keep").click();
    await flush();
    expect(barStatus().textContent).toBe("Saving…");
    first.remove();
    await flush();
    expect(barShown()).toBe(false);

    const second = mountHTML('<section data-edit-id="b"><h1>Old b</h1></section>');
    clickSection(second);
    textarea().value = "edit b";
    button("send").click();
    await flush();
    sent[1].settle({ state: "done", result: { html: '<section data-edit-id="b"><h1>New b</h1></section>', model: "m" } });
    await flush();
    expect(barStatus().textContent).toBe("Edit ready. (m)");
    expect(saveModule.savesHeld()).toBe(true);

    // A's answer arrives late and has nothing to say about B's bar.
    releaseFirstSave({ ok: true, msg: "saved", msgType: "success" });
    await flush();
    expect(barStatus().textContent).toBe("Edit ready. (m)");
    expect(barShown()).toBe(true);
    expect(document.querySelector('[data-edit-id="b"] h1').textContent).toBe("New b");

    // A's close timer cannot take it away either, and B's session is untouched.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(barShown()).toBe(true);
    expect(sent[1].cancel).not.toHaveBeenCalled();
    const held = await saveModule.savePage();
    expect(held.msgType).toBe("skipped");
    expect(held.msg).toMatch(/AI edit/);

    // B keeps normally, and only B's hold is released.
    barButton("keep").click();
    await flush();
    expect(barStatus().textContent).toBe("saved");
    expect(saveModule.savesHeld()).toBe(false);
  });

  test("a save asked for during the preview waits, and Revert lets it run", async () => {
    clickSection(mountPage());
    await submit("tighten");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(barButton("keep").hidden).toBe(false);
    const saveModule = await import("../../src/core/save.js");
    const held = await saveModule.savePage();
    expect(held.msgType).toBe("skipped");
    expect(held.msg).toMatch(/AI edit/);
    barButton("revert").click();
    await flush();
    expect(heading().textContent).toBe("Old heading");
  });

  test("the panel is a labelled dialog with a polite status and a labelled box", () => {
    clickSection(mountPage());
    expect(panel().getAttribute("role")).toBe("dialog");
    expect(panel().getAttribute("aria-label")).toBe("AI edit");
    expect(statusEl().getAttribute("role")).toBe("status");
    expect(statusEl().getAttribute("aria-live")).toBe("polite");
    expect(textarea().getAttribute("aria-label")).toBe("Describe the change");
    expect(button("close")).toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel().hidden).toBe(true);
  });

  test("the bar is a polite status line of native buttons, and its X is labelled", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    expect(barStatus().getAttribute("role")).toBe("status");
    expect(barStatus().getAttribute("aria-live")).toBe("polite");
    for (const name of ["stop", "keep", "revert", "close"]) {
      expect([name, barButton(name).localName]).toEqual([name, "button"]);
      expect([name, barButton(name).getAttribute("type")]).toEqual([name, "button"]);
    }
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(barButton("close").getAttribute("aria-label")).toBe("Keep and close");
    expect(barButton("close").title).toBe("Keep and close");
    expect(barStatus().textContent).toBe("Edit ready. (m)");
  });

  test("with AI editing turned off the panel opens with a note and no Send, and turning it on works without a reload", async () => {
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "unavailable" }]);
    clickSection(mountPage());
    await flush();
    expect(panel().hidden).toBe(false);
    expect(statusEl().textContent).toMatch(/turned off/);
    expect(button("send").hidden).toBe(true);
    expect(textarea().disabled).toBe(true);
    await submit("tighten");
    expect(fakeWire.send).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
    clickSection(mountPage());
    await flush();
    expect(button("send").hidden).toBe(false);
    expect(textarea().disabled).toBe(false);
    expect(statusEl().textContent).not.toMatch(/turned off/);
  });

  // ------------------------------------------------------------ click away

  test("a click inside the anchored element closes an empty panel and still lands", () => {
    clickSection(mountPage());
    expect(panel().hidden).toBe(false);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("h1").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  test("a click inside the anchored element keeps the text as that target's draft", () => {
    const section = mountPage();
    clickSection(section);
    textarea().value = "  tighten the headline  ";
    document.querySelector("h1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel().hidden).toBe(true);

    clickSection(section);
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("  tighten the headline  ");
  });

  test("a draft belongs to its own target", () => {
    const first = mountHTML('<section data-edit-id="a"><h1>A</h1></section><section data-edit-id="b"><h1>B</h1></section>');
    clickSection(first);
    textarea().value = "for the first section";

    clickSection(document.querySelector('[data-edit-id="b"]'));
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("");

    clickSection(first);
    expect(textarea().value).toBe("for the first section");
  });

  test("clicking the same bare section again closes the panel and keeps its draft", () => {
    const section = mountPage();
    clickSection(section);
    textarea().value = "a note";
    clickSection(section);
    expect(panel().hidden).toBe(true);
    clickSection(section);
    expect(textarea().value).toBe("a note");
  });

  test("Send keeps the target's draft through Working and clears it once the reply is ready", async () => {
    const section = mountPage();
    clickSection(section);
    textarea().value = "first draft";
    document.querySelector("h1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    clickSection(section);
    expect(textarea().value).toBe("first draft");

    await submit("first draft");
    expect(panel().hidden).toBe(true);
    expect(barShown()).toBe(true);
    expect(textarea().value).toBe("");

    // The reply is ready, so the comment has been delivered and the draft is gone.
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(barButton("keep").hidden).toBe(false);

    barButton("revert").click();
    await flush();
    clickSection(section);
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("");
  });

  test("a drag that starts in the box and ends on the page does not close it", () => {
    mountPage();
    clickSection(document.querySelector("[data-edit-id]"));
    textarea().value = "half typed";
    textarea().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    document.querySelector("h1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("half typed");

    // The flag is replaced, so the next real click still closes the box and keeps the text.
    document.querySelector("h1").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    document.querySelector("h1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(panel().hidden).toBe(true);
  });

  test("switching from a section composer to the whole-page bubble keeps the section draft", () => {
    const section = mountPage();
    clickSection(section);
    textarea().value = "Please preserve this unsent section comment";

    docBubble().click();
    expect(panel().hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    clickSection(section);
    expect(textarea().value).toBe("Please preserve this unsent section comment");
  });

  test("closeBar never discards the text of an open composer", async () => {
    const section = mountPage();
    clickSection(section);
    textarea().value = "still typing";

    // The target going away tears the bar down; the box it left behind keeps its text.
    section.remove();
    await flush();
    document.body.append(section);
    clickSection(section);
    expect(panel().hidden).toBe(false);
    expect(textarea().value).toBe("still typing");
  });

  // ------------------------------------------------------------------- bar

  test("Send hides the panel and hands the request to the bar", async () => {
    clickSection(mountPage());
    textarea().value = "tighten this";
    button("send").click();
    await flush();

    expect(panel().hidden).toBe(true);
    expect(barShown()).toBe(true);
    expect(barStatus().textContent).toBe("Sending\u2026");
    expect(barButton("stop").hidden).toBe(false);
    expect(barButton("keep").hidden).toBe(true);
    expect(barButton("close").hidden).toBe(true);

    // Every host status line replaces the last, and it is what the bar reads out.
    handle.opts.onStatus({ text: "Editing with Claude Code, 2.1 KB" });
    expect(barStatus().textContent).toBe("Editing with Claude Code, 2.1 KB");
    handle.opts.onStatus({ text: "Writing, 3.4 KB" });
    expect(barStatus().textContent).toBe("Writing, 3.4 KB");

    // The ring stays on the target while the bar is up.
    expect(document.querySelector('[data-clay-ai-edit="ring"]').hidden).toBe(false);
  });

  test("Send focuses Stop, and the bar hands focus on only when its button goes away", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    expect(document.activeElement).toBe(barButton("stop"));

    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(document.activeElement).toBe(barButton("keep"));

    // Focus somewhere else is not the bar's to move: Saving changes underneath it.
    barButton("keep").blur();
    expect(document.activeElement).toBe(document.body);
    barButton("keep").click();
    expect(barStatus().textContent).toBe("Saving…");
    expect(document.activeElement).toBe(document.body);
    await flush();
    expect(barStatus().textContent).toBe("saved");
  });

  test("Send hands focus to the bar and never back to the target", async () => {
    mountPage();
    const target = document.querySelector("h1");
    target.tabIndex = 0;
    target.focus();
    expect(document.activeElement).toBe(target);
    clickSection(document.querySelector("[data-edit-id]"));

    const refocused = jest.fn();
    target.addEventListener("focus", refocused);
    await submit("tighten this");

    expect(document.activeElement).toBe(barButton("stop"));
    expect(refocused).not.toHaveBeenCalled();
  });

  test("an error while Working moves focus to the bar's X", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    expect(document.activeElement).toBe(barButton("stop"));

    handle.settle({ state: "error", error: "it did not work", errorCode: "helper_failed" });
    await flush();
    expect(document.activeElement).toBe(barButton("close"));
  });

  test("a reply with warnings and a model shows both, with Keep, Revert and X", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({
      state: "done",
      result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>x</p></section><p>stray</p>', model: "gpt-5.6-sol" },
    });
    await flush();

    expect(barStatus().textContent).toContain("Edit ready.");
    expect(barStatus().textContent).toContain("\u26a0 reply had extra root elements");
    expect(barStatus().textContent).toContain("(gpt-5.6-sol)");
    for (const name of ["keep", "revert", "close"]) expect([name, barButton(name).hidden]).toEqual([name, false]);
    expect(barButton("stop").hidden).toBe(true);
  });

  test("X in Ready keeps, with the same pause, morph, resume and save as Keep", async () => {
    const trace = [];
    jest.spyOn(Mutation, "pause").mockImplementation(() => { trace.push("pause"); });
    jest.spyOn(Mutation, "resume").mockImplementation(() => { trace.push("resume"); });
    const morph = (...args) => {
      morphCalls.push(args);
      trace.push("morph");
      return realVendor.HyperMorph.morph(...args);
    };
    vendorMock.HyperMorph.morph = morph;
    vendorMock.morph = morph;
    save.mockImplementation(async () => {
      trace.push("save");
      return { ok: true, msg: "saved", msgType: "success" };
    });

    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();

    barButton("close").click();
    await flush();

    expect(trace).toEqual(["pause", "morph", "morph", "resume", "morph", "save"]);
    expect(morphCalls).toHaveLength(3);
    expect(save).toHaveBeenCalledTimes(1);
    expect(heading().textContent).toBe("New heading");
    expect(barStatus().textContent).toBe("saved");
  });

  test("Escape in Ready keeps the edit", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(heading().textContent).toBe("New heading");
    expect(barStatus().textContent).toBe("saved");
  });

  test("Escape in Working stops the request and takes the bar away", async () => {
    clickSection(mountPage());
    await submit("tighten this");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();

    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(barShown()).toBe(false);
    expect(heading().textContent).toBe("Old heading");
  });

  test("the bar closes itself after the save and restores the bubble", async () => {
    const section = mountPage();
    clickSection(section);
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(docBubble().hidden).toBe(true);

    barButton("keep").click();
    await flush();
    expect(barStatus().textContent).toBe("saved");
    expect(barShown()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(barShown()).toBe(false);
    expect(docBubble().hidden).toBe(false);
  });

  test("a save that fails stays on the bar with its message, a warning and X", async () => {
    save.mockImplementation(async () => ({ ok: false, msg: "Save failed: disk full", msgType: "error" }));

    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    barButton("keep").click();
    await flush();

    expect(barStatus().textContent).toBe("Save failed: disk full");
    expect(barStatus().getAttribute("data-tone")).toBe("warn");
    expect(barButton("close").hidden).toBe(false);
    expect(barButton("keep").hidden).toBe(true);
    expect(barButton("stop").hidden).toBe(true);

    // No delayed close: a save that failed waits to be dismissed.
    await new Promise((resolve) => setTimeout(resolve, 1600));
    expect(barShown()).toBe(true);

    barButton("close").click();
    expect(barShown()).toBe(false);
  });

  test("a conflicting save stays on the bar with its message, a warning and X", async () => {
    save.mockImplementation(async () => ({ ok: false, msg: "Someone else saved first", msgType: "conflict" }));

    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    barButton("keep").click();
    await flush();

    expect(barStatus().textContent).toBe("Someone else saved first");
    expect(barStatus().getAttribute("data-tone")).toBe("warn");
    expect(barButton("close").hidden).toBe(false);
    expect(barButton("keep").hidden).toBe(true);

    barButton("close").click();
    expect(barShown()).toBe(false);
  });

  test("a save that fails with no message still says so on the bar", async () => {
    save.mockImplementation(async () => ({ ok: false }));

    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    barButton("keep").click();
    await flush();

    expect(barStatus().textContent).toBe("The save did not finish; the edit is still on the page.");
    expect(barStatus().getAttribute("data-tone")).toBe("warn");
    expect(barButton("close").hidden).toBe(false);
  });

  test("an error shows its message with X, and X closes the bar", async () => {
    const section = mountPage();
    clickSection(section);
    await submit("tighten this");
    handle.settle({ state: "error", error: "Claude Code is not installed", errorCode: "engine_unavailable" });
    await flush();

    expect(heading().textContent).toBe("Old heading");
    expect(barShown()).toBe(true);
    expect(barStatus().textContent).toBe("Claude Code is not installed");
    expect(barStatus().getAttribute("data-tone")).toBe("warn");
    expect(barButton("close").hidden).toBe(false);
    expect(barButton("keep").hidden).toBe(true);

    // A visible bar is live chrome even with no session: a click on bare section
    // padding does not open a second box underneath the error.
    clickSection(section);
    expect(panel().hidden).toBe(true);

    barButton("close").click();
    expect(barShown()).toBe(false);
  });

  test("Escape in Error closes the bar", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "error", error: "it did not work", errorCode: "helper_failed" });
    await flush();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(barShown()).toBe(false);
    expect(document.querySelector('[data-clay-ai-edit="ring"]').hidden).toBe(true);
  });

  test("an Escape the page owns is left to the page", async () => {
    const section = mountPage();
    clickSection(section);
    await submit("tighten this");
    expect(barShown()).toBe(true);

    // Already handled before it reached the plugin.
    const handled = (event) => event.preventDefault();
    document.addEventListener("keydown", handled, true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    document.removeEventListener("keydown", handled, true);
    expect(handle.cancel).not.toHaveBeenCalled();

    // A field the page owns.
    section.insertAdjacentHTML("afterend", '<input id="page-field">');
    const field = document.getElementById("page-field");
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(handle.cancel).not.toHaveBeenCalled();

    // Contenteditable the page owns.
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.tabIndex = 0;
    document.body.append(editable);
    editable.focus();
    editable.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(handle.cancel).not.toHaveBeenCalled();
    editable.remove();

    // A modal of any of the three kinds the plugin knows.
    for (const name of ["data-clay-modal", "dialog-open", "aria-modal"]) {
      const modal = document.createElement(name === "dialog-open" ? "dialog" : "div");
      if (name === "dialog-open") modal.setAttribute("open", "");
      else modal.setAttribute(name, name === "aria-modal" ? "true" : "");
      document.body.append(modal);
      document.activeElement.blur();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(handle.cancel).not.toHaveBeenCalled();
      modal.remove();
    }

    // With none of those in the way, Escape is the bar's again.
    document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(barShown()).toBe(false);
  });

  test("the bar is runtime-only: a real save capture never contains it", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    expect(barShown()).toBe(true);

    const snapshot = await import("../../src/core/snapshot.js");
    const captured = snapshot.captureForSave({ emitForSync: false });

    expect(document.querySelector('[data-clay-ai-edit="status-bar"]')).not.toBeNull();
    expect(captured).not.toContain("data-clay-ai-edit");
    expect(captured).toContain("Old heading");
  });

  // ------------------------------------------------------------------- open

  describe("opening the box on a target\u0027s behalf", () => {
    const ARTICLE = '<article data-edit-id="post"><h1>Old heading</h1><p>Old paragraph</p></article>';

    test("a ready helper opens a connected article target with the suggested prompt and sends nothing", async () => {
      const article = mountHTML(ARTICLE);
      expect(await aiEdit.open(article, { prompt: "Add a bar chart above the table. Keep the table." })).toBe(true);
      expect(panel().hidden).toBe(false);
      expect(textarea().value).toBe("Add a bar chart above the table. Keep the table.");
      expect(textarea().disabled).toBe(false);
      expect(barShown()).toBe(false);
      expect(fakeWire.send).not.toHaveBeenCalled();
    });

    test("a page button that opens the box keeps it open through the click-away listener of the same click", async () => {
      // The prominent AI button on the page opens the composer from its own click
      // listener, and the plugin's click-away listener runs later in that same click.
      // A real click through agent-browser shows the box closing on the spot, so the
      // ordering is modeled here rather than reproduced: open() starts, the microtasks
      // it yields on run out, and only then does the outside click reach document.
      const article = mountHTML(ARTICLE);
      const aiButton = document.createElement("button");
      aiButton.textContent = "Write with AI";
      document.body.append(aiButton);

      try {
        const opening = aiEdit.open(article, { prompt: "chart" });
        await flush(); // microtasks only: the opening is still waiting out the click
        aiButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(await opening).toBe(true);
        expect(panel().hidden).toBe(false);
        expect(textarea().value).toBe("chart");

        // A later click away is still a dismissal: the box closes as it always did.
        aiButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(panel().hidden).toBe(true);
      } finally {
        aiButton.remove();
      }
    });

    test("Send carries that target\u0027s HTML and the suggested prompt", async () => {
      const article = mountHTML(ARTICLE);
      await aiEdit.open(article, { prompt: "Add a bar chart above the table. Keep the table." });
      button("send").click();
      await flush();

      expect(fakeWire.send).toHaveBeenCalledTimes(1);
      expect(handle.opts.helper).toBe("ai-edit");
      expect(handle.payload.comment).toBe("Add a bar chart above the table. Keep the table.");
      expect(handle.payload.elementHTML).toBe(ARTICLE);
      expect(handle.payload.editId).toBe("post");
      expect(handle.payload.tag).toBe("article");
      expect(handle.payload.quote).toBeUndefined();
      expect(save).not.toHaveBeenCalled();
      expect(barShown()).toBe(true);
    });

    test("a typed draft survives a dismissal and a later suggestion", async () => {
      const section = mountPage();
      await aiEdit.open(section, { prompt: "first suggestion" });
      expect(textarea().value).toBe("first suggestion");

      textarea().value = "  my own words  ";
      document.querySelector("h1").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(panel().hidden).toBe(true);

      expect(await aiEdit.open(section, { prompt: "another suggestion" })).toBe(true);
      expect(textarea().value).toBe("  my own words  ");
    });

    test("opening the box again on the same target keeps its unsent text", async () => {
      const section = mountPage();
      await aiEdit.open(section, { prompt: "suggested" });
      textarea().value = "half typed";

      expect(await aiEdit.open(section, { prompt: "ignored suggestion" })).toBe(true);
      expect(panel().hidden).toBe(false);
      expect(textarea().value).toBe("half typed");
      expect(document.activeElement).toBe(textarea());
    });

    test("detached, non-element, script and UI targets return false without changing the panel", async () => {
      const section = mountPage();
      expect(await aiEdit.open(section, { prompt: "keep this" })).toBe(true);

      const extras = document.createElement("div");
      const detached = document.createElement("p");
      detached.textContent = "Detached";
      const script = document.createElement("script");
      const stripped = document.createElement("p");
      stripped.setAttribute("clay", "no-save");
      const saveRemoved = document.createElement("p");
      saveRemoved.setAttribute("save-remove", "");
      const control = document.createElement("button");
      const field = document.createElement("textarea");
      const snapshotRegion = document.createElement("div");
      snapshotRegion.setAttribute("clay", "no-snapshot");
      const snapshotRegionChild = document.createElement("p");
      snapshotRegionChild.textContent = "Nested";
      snapshotRegion.append(snapshotRegionChild);
      const bareSnapshotRegion = document.createElement("div");
      bareSnapshotRegion.setAttribute("no-snapshot", "");
      const bareSnapshotRegionChild = document.createElement("p");
      bareSnapshotRegionChild.textContent = "Nested";
      bareSnapshotRegion.append(bareSnapshotRegionChild);
      const snapshotRemovedRegion = document.createElement("div");
      snapshotRemovedRegion.setAttribute("snapshot-remove", "");
      const snapshotRemovedRegionChild = document.createElement("p");
      snapshotRemovedRegionChild.textContent = "Nested";
      snapshotRemovedRegion.append(snapshotRemovedRegionChild);
      extras.append(script, stripped, saveRemoved, control, field,
        snapshotRegion, bareSnapshotRegion, snapshotRemovedRegion);
      document.body.append(extras);

      try {
        const targets = [
          ["a detached element", detached],
          ["no target", null],
          ["an undefined target", undefined],
          ["a string", "p"],
          ["a text node", document.createTextNode("text")],
          ["a script", script],
          ["a stripped region", stripped],
          ["a save-remove region", saveRemoved],
          ["a no-snapshot region", snapshotRegion],
          ["a bare no-snapshot region", bareSnapshotRegion],
          ["a snapshot-remove region", snapshotRemovedRegion],
          ["a child of a no-snapshot region", snapshotRegionChild],
          ["a child of a bare no-snapshot region", bareSnapshotRegionChild],
          ["a child of a snapshot-remove region", snapshotRemovedRegionChild],
          ["a control", control],
          ["a field", field],
          ["the panel", panel()],
          ["the chip", chip()],
          ["the whole-page bubble", docBubble()],
          ["the bar", bar()],
        ];
        for (const [label, target] of targets) {
          expect([label, await aiEdit.open(target, { prompt: "nope" })]).toEqual([label, false]);
        }
      } finally {
        extras.remove();
      }

      expect(panel().hidden).toBe(false);
      expect(textarea().value).toBe("keep this");
      expect(fakeWire.send).not.toHaveBeenCalled();

      await submit("keep this");
      expect(handle.payload.editId).toBe("hero");
    });

    test("an active request returns false and retains its target", async () => {
      const section = mountPage();
      clickSection(section);
      await submit("tighten this");
      expect(barShown()).toBe(true);

      const other = document.createElement("section");
      other.setAttribute("data-edit-id", "aside");
      other.innerHTML = "<p>Aside</p>";
      document.body.append(other);

      try {
        expect(await aiEdit.open(other, { prompt: "add a chart" })).toBe(false);
        expect(panel().hidden).toBe(true);
        expect(textarea().value).toBe("");
        expect(fakeWire.send).toHaveBeenCalledTimes(1);

        // The reply is still about the original target, and only that target moves.
        handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
        await flush();
        expect(barButton("keep").hidden).toBe(false);
        expect(document.querySelector('[data-edit-id="hero"] h1').textContent).toBe("New heading");
        expect(other.querySelector("p").textContent).toBe("Aside");
      } finally {
        other.remove();
      }
    });

    test("a listed but disabled helper opens the existing setup note with Send unavailable", async () => {
      fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "unavailable" }]);
      const section = mountPage();
      expect(await aiEdit.open(section, { prompt: "add a bar chart" })).toBe(true);
      await flush();

      expect(panel().hidden).toBe(false);
      expect(statusEl().textContent).toMatch(/turned off/);
      expect(button("send").hidden).toBe(true);
      expect(textarea().disabled).toBe(true);
      expect(textarea().value).toBe("add a bar chart");
      await submit("add a bar chart");
      expect(fakeWire.send).not.toHaveBeenCalled();

      // The host turns its switch back on: the next opening works without a reload.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      fakeWire.helpers.mockResolvedValue([{ name: "ai-edit", state: "ready" }]);
      clickSection(mountPage());
      await flush();
      expect(button("send").hidden).toBe(false);
    });
  });

  describe("plain pages, no data-edit-id", () => {
    const PLAIN = '<main id="plain"><h2>Hours</h2><p id="intro">Visitors arriving late will not be admitted. Late arrivals wait.</p><ul><li>Tea</li><li>Cake</li></ul></main>';

    function mountPlain() {
      document.querySelectorAll("[data-edit-id], #plain").forEach(el => el.remove());
      document.body.insertAdjacentHTML("afterbegin", PLAIN);
    }

    function select(startNode, startOffset, endNode, endOffset) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function ctrlJ(target = document.body) {
      const event = new KeyboardEvent("keydown", { key: "j", code: "KeyJ", ctrlKey: true, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    }

    afterEach(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      document.querySelector("#plain")?.remove();
    });

    test("Ctrl+J on a selection inside a plain paragraph opens the panel for that paragraph", async () => {
      mountPlain();
      const text = document.querySelector("#intro").firstChild;
      select(text, 9, text, 22); // "arriving late"
      const event = ctrlJ();
      expect(event.defaultPrevented).toBe(true);
      expect(panel().hidden).toBe(false);

      await submit("make this friendlier");
      expect(handle.payload.tag).toBe("p");
      expect(handle.payload.editId).toBe("#intro");
      expect(handle.payload.quote).toBe("arriving late");
      expect(handle.payload.selection).toEqual({ start: 9, end: 22 });
      expect(handle.payload.elementHTML).toBe(document.querySelector("#intro").outerHTML);
      expect(handle.payload.elementHTML).not.toContain("data-edit-id");
    });

    test("the panel is one row with a pointer, and no ring when words are selected", () => {
      mountPlain();
      const text = document.querySelector("#intro").firstChild;
      select(text, 9, text, 22);
      ctrlJ();
      const row = textarea().parentElement;
      expect(row.contains(button("send"))).toBe(true);
      expect(panel().querySelector('[data-clay-ai-edit-part="quote"]')).toBeNull();
      expect(panel().querySelector('[data-clay-ai-edit-part="hint"]')).toBeNull();
      expect(panel().querySelector('[data-clay-ai-edit-part="pointer"]').hidden).toBe(false);
      expect(document.querySelector('[data-clay-ai-edit="ring"]').hidden).toBe(true);
      expect(textarea().rows).toBe(1);
      expect(textarea().title).toMatch(/@fable/);
    });

    test("the panel is placed again when its height changes, and the ring marks a running edit", async () => {
      mountPlain();
      const intro = document.querySelector("#intro");
      const text = intro.firstChild;
      select(text, 9, text, 22);
      ctrlJ();
      intro.getBoundingClientRect = () => ({ left: 40, top: 700, right: 400, bottom: 720, width: 360, height: 20 });
      let height = 60;
      Object.defineProperty(panel(), "offsetHeight", { get: () => height, configurable: true });
      window.dispatchEvent(new Event("resize"));
      expect(panel().style.getPropertyValue("top")).toBe("630px");
      // The box growing places the panel again, and the selected words are the ring's
      // stand-in until there is a request to mark.
      height = 93;
      textarea().value = "make this shorter";
      textarea().dispatchEvent(new Event("input"));
      expect(panel().style.getPropertyValue("top")).toBe("597px");
      const pointer = panel().querySelector('[data-clay-ai-edit-part="pointer"]');
      expect(pointer.style.getPropertyValue("top")).toBe("87px");
      expect(document.querySelector('[data-clay-ai-edit="ring"]').hidden).toBe(true);

      await submit("make this shorter");
      expect(panel().hidden).toBe(true);
      expect(document.querySelector('[data-clay-ai-edit="ring"]').hidden).toBe(false);
    });

    test("a repeated phrase is told apart by its offsets", async () => {
      mountPlain();
      const text = document.querySelector("#intro").firstChild;
      const second = text.data.lastIndexOf("Late");
      select(text, second, text, second + 4);
      ctrlJ();
      await submit("lowercase this");
      expect(handle.payload.quote).toBe("Late");
      expect(handle.payload.selection.start).toBe(second);
    });

    test("a selection across two list items targets the list", async () => {
      mountPlain();
      const items = document.querySelectorAll("li");
      select(items[0].firstChild, 0, items[1].firstChild, 4);
      ctrlJ();
      await submit("add milk");
      expect(handle.payload.tag).toBe("ul");
    });

    test("Ctrl+J with nothing selected leaves the key to the browser", () => {
      mountPlain();
      window.getSelection().removeAllRanges();
      const event = ctrlJ();
      expect(event.defaultPrevented).toBe(false);
      expect(panel().hidden).toBe(true);
    });

    test("Ctrl+J while a page input has focus does nothing", () => {
      mountPlain();
      const input = document.createElement("input");
      document.querySelector("#plain").append(input);
      input.focus();
      const text = document.querySelector("#intro").firstChild;
      select(text, 0, text, 8);
      const event = ctrlJ(input);
      expect(event.defaultPrevented).toBe(false);
      expect(panel().hidden).toBe(true);
    });

    test("Ctrl+Shift+J is not the shortcut", () => {
      mountPlain();
      const text = document.querySelector("#intro").firstChild;
      select(text, 0, text, 8);
      const event = new KeyboardEvent("keydown", { key: "J", code: "KeyJ", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(panel().hidden).toBe(true);
    });

    test("Ctrl+K is no longer the shortcut", () => {
      mountPlain();
      const text = document.querySelector("#intro").firstChild;
      select(text, 0, text, 8);
      const event = new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(panel().hidden).toBe(true);
    });

    test("a selection across top-level paragraphs edits the whole page, with the selection quoted", async () => {
      document.body.insertAdjacentHTML("afterbegin", '<p id="top1">First block</p><p id="top2">Second block</p>');
      try {
        select(document.querySelector("#top1").firstChild, 6, document.querySelector("#top2").firstChild, 6);
        const event = ctrlJ();
        expect(event.defaultPrevented).toBe(true);
        expect(panel().hidden).toBe(false);
        await submit("merge these");
        expect(handle.payload.tag).toBe("body");
        expect(handle.payload.quote).toBe("blockSecond");
      } finally {
        document.querySelector("#top1")?.remove();
        document.querySelector("#top2")?.remove();
      }
    });

    test("a plain page has no whole-page bubble", async () => {
      mountPlain();
      await flush();
      expect(docBubble().hidden).toBe(true);
    });

    test("selecting text shows the chip, and clicking it opens the panel with that selection", async () => {
      mountPlain();
      const text = document.querySelector("#intro").firstChild;
      select(text, 9, text, 22);
      document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(chip().hidden).toBe(false);
      chip().click();
      expect(panel().hidden).toBe(false);
      await submit("make this friendlier");
      expect(handle.payload.quote).toBe("arriving late");
      expect(handle.payload.selection).toEqual({ start: 9, end: 22 });
    });

    test("the selection stays highlighted while the panel is open and clears on close", () => {
      const highlights = new Map();
      window.CSS = window.CSS || {};
      window.CSS.highlights = highlights;
      window.Highlight = class { constructor(...ranges) { this.ranges = ranges; } };
      try {
        mountPlain();
        const text = document.querySelector("#intro").firstChild;
        select(text, 9, text, 22);
        ctrlJ();
        expect(highlights.get("clay-ai-edit").ranges[0].toString()).toBe("arriving late");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(highlights.has("clay-ai-edit")).toBe(false);
      } finally {
        delete window.Highlight;
        delete window.CSS.highlights;
      }
    });
  });
});
