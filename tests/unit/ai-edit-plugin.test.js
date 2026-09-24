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

const panel = () => document.getElementById("hyper-edit-panel");
const textarea = () => panel().querySelector("textarea");
const statusEl = () => panel().querySelector(".hep-status");
const button = (name) => panel().querySelector(".hep-" + name);
const chip = () => document.getElementById("hyper-edit-chip");
const docBubble = () => document.getElementById("hyper-edit-doc-bubble");
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
    // Leave no request in flight for the next test: stop an open one, settle a
    // finished one.
    if (!button("stop").hidden) button("stop").click();
    else if (!button("keep").hidden) button("revert").click();
    await flush();
  });

  test("builds its chrome, marked runtime-only, once a ready helper is listed", () => {
    expect(chip()).not.toBeNull();
    expect(chip().hidden).toBe(true);
    expect(panel().hidden).toBe(true);
    expect(docBubble()).not.toBeNull();
    for (const el of [panel(), chip(), docBubble(), document.getElementById("hyper-edit-ring")]) {
      expect(el.getAttribute("clay")).toBe("no-save no-watch no-snapshot");
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
    expect(button("stop").hidden).toBe(false);

    // Status records are all the wire carries, so they render as status lines.
    opts.onStatus({ text: "Writing, 1.8 KB" });
    expect(statusEl().textContent).toBe("Writing, 1.8 KB");

    // The result is the element's own HTML, morphs in once, and offers Keep/Revert.
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "claude-opus-4-6" } });
    await flush();

    expect(heading().textContent).toBe("New heading");
    expect(statusEl().textContent).toBe("done (claude-opus-4-6)");
    expect(button("keep").hidden).toBe(false);
    expect(button("revert").hidden).toBe(false);
    expect(button("send").hidden).toBe(true);

    // Revert is the way back out, with the edit already applied.
    button("revert").click();
    await flush();
    expect(heading().textContent).toBe("Old heading");
    expect(statusEl().textContent).toBe("reverted");
    expect(button("send").hidden).toBe(false);
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

    handle.settle({ state: "cancelled" });
    await flush();
    expect(statusEl().textContent).toBe("cancelled");
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

    button("stop").click();
    expect(statusEl().textContent).toBe("cancelled");

    releaseSave({ ok: true, msg: "saved", msgType: "success" });
    await flush();
    expect(fakeWire.send).not.toHaveBeenCalled();
    expect(statusEl().textContent).toBe("cancelled");
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

    button("keep").click();
    await flush();

    expect(trace).toEqual(["pause", "morph", "morph", "resume", "morph", "save"]);
    // The rewind restores the snapshot exactly; the morph that lands the edit is
    // three-way merged against the HTML the model saw, so mid-flight edits survive.
    expect(morphCalls).toHaveLength(3);
    const calls = morphCalls;
    expect(calls[1][2].scripts).toEqual({ merge: false });
    expect(calls[2][2].scripts.mergeBase).toBe(PAGE);
    expect(typeof calls[2][2].scripts.mergeTags).toBe("object");
    expect(save).toHaveBeenCalledTimes(1);
    expect(heading().textContent).toBe("New heading");
    expect(statusEl().textContent).toBe("saved");
    expect(button("send").hidden).toBe(false);
  });

  test("an error outcome reverts the whole edit and reports it", async () => {
    clickSection(mountPage());
    await submit("tighten this");
    handle.settle({ state: "error", error: "the helper reported an error", errorCode: "helper_failed" });
    await flush();

    expect(heading().textContent).toBe("Old heading");
    expect(statusEl().textContent).toBe("the helper reported an error");
    expect(statusEl().classList.contains("warn")).toBe(true);
    expect(button("send").hidden).toBe(false);
    expect(button("keep").hidden).toBe(true);
  });

  test("Stop cancels the request and reverts; the late terminal frame is ignored", async () => {
    clickSection(mountPage());
    await submit("tighten this");

    button("stop").click();
    expect(handle.cancel).toHaveBeenCalledTimes(1);
    expect(statusEl().textContent).toBe("cancelled");
    expect(button("send").hidden).toBe(false);

    handle.settle({ state: "cancelled" });
    await flush();

    expect(statusEl().textContent).toBe("cancelled");
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
    expect(payload.elementHTML).not.toContain("hyper-edit");
    expect("page" in payload).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  test("refuses an oversize request before sending anything", async () => {
    clickSection(mountPage());
    await submit("x".repeat(1000 * 1024));

    expect(fakeWire.send).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(statusEl().textContent).toBe("This section is too large for AI editing; select a smaller part.");
    expect(statusEl().classList.contains("warn")).toBe(true);
    expect(button("send").hidden).toBe(false);

    // The refusal does not wedge the panel: a request that fits still goes out.
    await submit("tighten this");
    expect(fakeWire.send).toHaveBeenCalledTimes(1);
    expect(handle.payload.comment).toBe("tighten this");
  });
});
