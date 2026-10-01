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
const statusEl = () => panel().querySelector('[data-clay-ai-edit-part="status"]');
const button = (name) => panel().querySelector(`[data-clay-ai-edit-part="${name}"]`);
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
    for (const el of [panel(), chip(), docBubble(), document.querySelector('[data-clay-ai-edit="ring"]')]) {
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
    expect(calls[1][2].scripts).toEqual({ merge: false, handle: false });
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
    expect(statusEl().getAttribute("data-tone")).toBe("warn");
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
    expect(payload.elementHTML).not.toContain("data-clay-ai-edit");
    expect("page" in payload).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  test("refuses an oversize request before sending anything", async () => {
    clickSection(mountPage());
    await submit("x".repeat(1000 * 1024));

    expect(fakeWire.send).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(statusEl().textContent).toBe("This section is too large for AI editing; select a smaller part.");
    expect(statusEl().getAttribute("data-tone")).toBe("warn");
    expect(button("send").hidden).toBe(false);

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
    expect(statusEl().textContent).toMatch(/adds a script or event handler/);
    expect(button("keep").hidden).toBe(true);
  });

  test("a reply that adds an inline handler is refused", async () => {
    clickSection(mountPage());
    await submit("make it clickable");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1 onclick="x()">New</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(heading().textContent).toBe("Old heading");
    expect(statusEl().textContent).toMatch(/adds a script or event handler/);
  });

  test("a javascript: URL split by an encoded tab is refused", async () => {
    clickSection(mountPage());
    await submit("add a link");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>Old heading</h1><p><a href="java&#9;script:void(0)">x</a></p></section>', model: "m" } });
    await flush();
    expect(document.querySelector("[data-edit-id] a")).toBeNull();
    expect(statusEl().textContent).toMatch(/adds a script or event handler/);
  });

  test("a reply that makes an existing data script executable is refused and nothing runs", async () => {
    window.__aiEditRuns = 0;
    clickSection(mountHTML('<section data-edit-id="hero"><h1>Old heading</h1><script type="text/plain">window.__aiEditRuns += 1</script></section>'));
    await submit("tidy");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><script>window.__aiEditRuns += 1</script></section>', model: "m" } });
    await flush();
    expect(window.__aiEditRuns).toBe(0);
    expect(heading().textContent).toBe("Old heading");
    expect(statusEl().textContent).toMatch(/adds a script or event handler/);
  });

  test("a reply that copies an existing handler onto a second element is refused", async () => {
    clickSection(mountHTML('<section data-edit-id="hero"><h1>Old heading</h1><button onclick="void 0">a</button></section>'));
    await submit("add another button");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>Old heading</h1><button onclick="void 0">a</button><button onclick="void 0">b</button></section>', model: "m" } });
    await flush();
    expect(document.querySelectorAll("[data-edit-id] button").length).toBe(1);
    expect(statusEl().textContent).toMatch(/adds a script or event handler/);
  });

  test("a reply that adds a JSON data script is shown for Keep", async () => {
    clickSection(mountPage());
    await submit("add data");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>Old heading</h1><p>Old paragraph</p><script type="application/json">{"a":1}</script></section>', model: "m" } });
    await flush();
    expect(button("keep").hidden).toBe(false);
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
    expect(statusEl().textContent).toMatch(/could not be applied/);
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
  });

  test("removing the section during a request cancels it on the wire", async () => {
    clickSection(mountPage());
    await submit("tighten");
    document.querySelector("[data-edit-id]").remove();
    await flush();
    expect(handle.cancel).toHaveBeenCalled();
    expect(panel().hidden).toBe(true);
  });

  test("a save asked for during the preview waits, and Revert lets it run", async () => {
    clickSection(mountPage());
    await submit("tighten");
    handle.settle({ state: "done", result: { html: '<section data-edit-id="hero"><h1>New heading</h1><p>Old paragraph</p></section>', model: "m" } });
    await flush();
    expect(button("keep").hidden).toBe(false);
    const saveModule = await import("../../src/core/save.js");
    const held = await saveModule.savePage();
    expect(held.msgType).toBe("skipped");
    expect(held.msg).toMatch(/AI edit/);
    button("revert").click();
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
